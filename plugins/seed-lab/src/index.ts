import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginContext, ToolCall } from "../../../app/src/shared/extension-host-protocol.js";
import { bundle, DEFAULT_ENTRY } from "./bundle.ts";
import { DEFAULT_TIMEOUT_MS, runSeeds } from "./pool.ts";
import { report, summarize, type RunInfo, type Summary } from "./stats.ts";

// Seed lab's native side. `seedlab_run` (for the agent) and the panel's `run`
// command bundle the project's simulation module, run a range of seeds over a
// pool of threads, and answer with what the run says. Runs are kept in the
// plugin's data folder, so a run never changes the project's files: a
// summary for the panel and every seed's result, one JSON line each.

export const MAX_SEEDS = 100_000;
const KEEP_RUNS = 10;

export interface RunInput {
  entry?: string;
  from?: number;
  count?: number;
  params?: Record<string, unknown>;
  difficulty?: string;
  timeoutMs?: number;
}

export interface Run extends RunInfo {
  version: 1;
  id: string;
  at: string;
  params?: Record<string, unknown>;
  timeoutMs: number;
  summary: Summary;
}

/** The input as a run uses it, or an error that says what's wrong. */
export function readInput(value: unknown): Required<Omit<RunInput, "params" | "difficulty">> & Pick<RunInput, "params" | "difficulty"> {
  const input = (value ?? {}) as RunInput;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("The input must be an object.");
  const whole = (name: string, given: unknown, fallback: number, min: number, max: number) => {
    if (given === undefined) return fallback;
    if (typeof given !== "number" || !Number.isInteger(given) || given < min || given > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
    return given;
  };
  if (input.entry !== undefined && (typeof input.entry !== "string" || !input.entry.trim())) throw new Error("entry must be a path inside the project.");
  if (input.params !== undefined && (typeof input.params !== "object" || input.params === null || Array.isArray(input.params))) throw new Error("params must be an object.");
  if (input.difficulty !== undefined && typeof input.difficulty !== "string") throw new Error("difficulty must be a metric name.");
  return {
    entry: input.entry?.trim() ?? DEFAULT_ENTRY,
    from: whole("from", input.from, 0, 0, Number.MAX_SAFE_INTEGER - MAX_SEEDS),
    count: whole("count", input.count, 1_000, 1, MAX_SEEDS),
    timeoutMs: whole("timeoutMs", input.timeoutMs, DEFAULT_TIMEOUT_MS, 100, 600_000),
    params: input.params,
    difficulty: input.difficulty?.trim() || undefined,
  };
}

export function runsFolder(dataFolder: string, projectFolder: string): string {
  const key = createHash("sha256").update(path.resolve(projectFolder)).digest("hex").slice(0, 32);
  return path.join(dataFolder, "runs", key);
}

async function atomicWrite(file: string, text: string): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

/** The newest kept run, or null. */
export async function lastRun(folder: string): Promise<Run | null> {
  try {
    const names = (await readdir(folder)).filter((name) => name.endsWith(".json")).sort();
    for (const name of names.reverse()) {
      try {
        const run = JSON.parse(await readFile(path.join(folder, name), "utf8")) as Run;
        if (run?.version === 1) return run;
      } catch {
        // A damaged run: try the one before.
      }
    }
  } catch {
    // No runs yet.
  }
  return null;
}

async function prune(folder: string): Promise<void> {
  const ids = [...new Set((await readdir(folder)).filter((name) => /\.(json|jsonl)$/.test(name)).map((name) => name.replace(/\.jsonl?$/, "")))].sort();
  for (const id of ids.slice(0, Math.max(0, ids.length - KEEP_RUNS))) {
    await rm(path.join(folder, `${id}.json`), { force: true });
    await rm(path.join(folder, `${id}.jsonl`), { force: true });
  }
}

export async function run(context: Pick<PluginContext, "dataFolder"> & { project: { folder: string } }, value: unknown, call: Pick<ToolCall, "signal" | "progress">, options: { threads?: number } = {}): Promise<Run> {
  const input = readInput(value);
  const project = context.project.folder;
  const started = performance.now();
  call.progress(`Bundling ${input.entry}`);
  const bundled = await bundle(project, input.entry, path.join(context.dataFolder, "bundles"), call.signal);
  let reported = 0;
  const { results, threads } = await runSeeds({
    bundle: bundled.url,
    from: input.from,
    count: input.count,
    params: input.params,
    timeoutMs: input.timeoutMs,
    threads: options.threads,
    signal: call.signal,
    onProgress: (done, total) => {
      const now = performance.now();
      if (done < total && now - reported < 500) return;
      reported = now;
      call.progress(`${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} seeds`);
    },
  });
  const summary = summarize(results, { difficulty: input.difficulty });
  const folder = runsFolder(context.dataFolder, project);
  await mkdir(folder, { recursive: true });
  const at = new Date();
  const id = `${at.toISOString().replace(/[:.]/g, "-")}-${createHash("sha256").update(bundled.url + input.from + input.count).digest("hex").slice(0, 6)}`;
  const file = path.join(folder, `${id}.jsonl`);
  await atomicWrite(file, results.map((result) => JSON.stringify(result)).join("\n") + "\n");
  const saved: Run = {
    version: 1,
    id,
    at: at.toISOString(),
    entry: input.entry,
    from: input.from,
    count: input.count,
    params: input.params,
    timeoutMs: input.timeoutMs,
    seconds: (performance.now() - started) / 1000,
    threads,
    file,
    summary,
  };
  await atomicWrite(path.join(folder, `${id}.json`), JSON.stringify(saved));
  await prune(folder);
  return saved;
}

export function activate(context: PluginContext): void {
  const folder = context.project?.folder;
  if (!folder) return;
  const scoped = { dataFolder: context.dataFolder, project: { folder } };
  context.registerTool("seedlab_run", async (input, call) => {
    const saved = await run(scoped, input, call);
    return report(saved.summary, saved);
  });
  context.registerCommand("run", (input, call) => run(scoped, input, call));
  context.registerCommand("last", () => lastRun(runsFolder(context.dataFolder, folder)));
}
