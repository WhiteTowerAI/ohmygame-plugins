import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { SeedResult } from "./stats.ts";

// Runs seeds over a pool of threads, each importing the bundled module once.
// A thread takes one seed at a time; a seed that runs past `timeoutMs` is
// recorded as timed out and its thread is replaced, since a stuck loop can
// only be stopped by ending the thread. Results come back in seed order, so
// the same seeds give the same results however the threads are scheduled.

export interface PoolOptions {
  /** The bundled module's file URL. */
  bundle: string;
  from: number;
  count: number;
  params?: unknown;
  timeoutMs?: number;
  threads?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Tests point this at their own worker. */
  workerUrl?: URL;
}

export const DEFAULT_TIMEOUT_MS = 5_000;

export function defaultThreads(count: number): number {
  return Math.max(1, Math.min(count, availableParallelism() - 1, 16));
}

export async function runSeeds(options: PoolOptions): Promise<{ results: SeedResult[]; threads: number }> {
  const { bundle, from, count, params, signal, onProgress } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const threads = Math.max(1, Math.min(options.threads ?? defaultThreads(count), count));
  const workerUrl = options.workerUrl ?? new URL("./seed-worker.mjs", import.meta.url);
  const results: SeedResult[] = new Array(count);
  let next = 0;
  let done = 0;
  const live = new Set<Worker>();
  /** Each live thread's time limit for the seed it has, cleared when the run ends. */
  const timers = new Set<NodeJS.Timeout>();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const worker of live) void worker.terminate();
      live.clear();
      if (error) reject(error);
      else resolve({ results, threads });
    };
    const abort = () => finish(signal?.reason ?? new Error("Stopped"));
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });

    const record = (index: number, result: SeedResult) => {
      results[index] = result;
      done += 1;
      onProgress?.(done, count);
      if (done === count) finish();
    };

    /** A thread that takes seeds until there are none left. */
    const start = () => {
      if (settled || next >= count) return;
      const worker = new Worker(workerUrl, { workerData: { bundle, params } });
      live.add(worker);
      let index = -1;
      /** A seed is out with this thread. */
      let busy = false;
      let timer: NodeJS.Timeout | undefined;
      const stopTimer = () => {
        clearTimeout(timer);
        if (timer) timers.delete(timer);
      };
      const take = () => {
        if (settled) return;
        if (next >= count) {
          live.delete(worker);
          void worker.terminate();
          return;
        }
        index = next;
        next += 1;
        timer = setTimeout(() => {
          // Stuck: record it, end this thread, and carry on with a new one.
          stopTimer();
          live.delete(worker);
          worker.removeAllListeners();
          void worker.terminate();
          record(index, { seed: from + index, timeout: true, ms: timeoutMs });
          start();
        }, timeoutMs);
        timers.add(timer);
        busy = true;
        worker.postMessage({ seed: from + index });
      };
      worker.on("message", (message: SeedResult & { ready?: boolean; fatal?: string }) => {
        if (message.fatal !== undefined) return finish(new Error(`The simulation module couldn't load: ${message.fatal}`));
        if (message.ready) return take();
        stopTimer();
        busy = false;
        record(index, message);
        take();
      });
      worker.on("error", (error) => {
        live.delete(worker);
        // Before the module loaded, every thread would fail the same way.
        if (index < 0) return finish(new Error(`A seed thread failed: ${error.message}`));
        stopTimer();
        // A crash with a seed out is recorded as that seed's error, even if a
        // timer an earlier seed left behind caused it. A thread with no seed
        // out has already been ended, so a crash without one can't arrive.
        if (busy) record(index, { seed: from + index, error: `The thread crashed: ${error.message}` });
        busy = false;
        start();
      });
      worker.on("exit", () => live.delete(worker));
    };
    for (let i = 0; i < threads; i += 1) start();
  });
}
