import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { PluginGame } from "../../../app/src/shared/extension-host-protocol.js";
import type { PlaytestCapture } from "../../../app/src/shared/playtest.js";
import { GameTestError, message, parseGameTest, parseGameTestSetup, type GameTestSetup, type ParsedGameTest } from "./parse.ts";
import { runGameTestViewport, type GameTestCaptures } from "./run.ts";
import {
  GAME_TEST_DEFAULT_VIEWPORT,
  GAME_TEST_MAX_FILE_BYTES,
  GAME_TEST_MAX_FILES,
  GAME_TESTS_DIRECTORY,
  type GameTestFile,
  type GameTestRun,
  type GameTestScenarioResult,
  type GameTestStatus,
  type GameTestsState,
} from "./types.ts";

/** A file in the tests folder, and its scenario when it can be read. */
export interface GameTestEntry {
  file: GameTestFile;
  scenario?: ParsedGameTest;
}

/** A folder's own JSON files, in name order: a link could point anywhere. Undefined when it isn't a folder in the project. */
async function jsonFiles(root: string, directory: string): Promise<string[] | undefined> {
  try {
    const stats = await lstat(directory);
    if (!stats.isDirectory()) return undefined;
    const [project, real] = await Promise.all([realpath(root), realpath(directory)]);
    if (!real.startsWith(project + path.sep)) return undefined;
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, GAME_TEST_MAX_FILES);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

async function readText(file: string): Promise<string> {
  const stats = await lstat(file);
  if (stats.size > GAME_TEST_MAX_FILE_BYTES) throw new GameTestError(`It is larger than ${GAME_TEST_MAX_FILE_BYTES / 1024} KiB.`);
  return readFile(file, "utf8");
}

/** The project's test files, in name order, each read and checked with the setups in `tests/game/setup/`. */
export async function readGameTests(folder: string): Promise<GameTestEntry[]> {
  const directory = path.join(folder, GAME_TESTS_DIRECTORY);
  const names = await jsonFiles(folder, directory);
  if (!names) return [];
  const setupDirectory = path.join(directory, "setup");
  const setups = new Map<string, GameTestSetup | GameTestError>(
    await Promise.all(
      ((await jsonFiles(folder, setupDirectory)) ?? []).map(async (file) => {
        try {
          return [file, parseGameTestSetup(await readText(path.join(setupDirectory, file)))] as const;
        } catch (cause) {
          return [file, cause instanceof GameTestError ? cause : new GameTestError(message(cause))] as const;
        }
      }),
    ),
  );
  return Promise.all(
    names.map(async (file): Promise<GameTestEntry> => {
      try {
        const scenario = parseGameTest(await readText(path.join(directory, file)), setups);
        return {
          file: { file, name: scenario.name, steps: (scenario.setupSteps?.length ?? 0) + scenario.steps.length, players: scenario.players ?? 1, viewports: scenario.viewports ?? [GAME_TEST_DEFAULT_VIEWPORT] },
          scenario,
        };
      } catch (cause) {
        return { file: { file, error: message(cause) } };
      }
    }),
  );
}

const overall = (statuses: GameTestStatus[]): GameTestStatus =>
  statuses.includes("failed") ? "failed" : statuses.includes("cancelled") ? "cancelled" : "passed";

interface CurrentRun {
  run: GameTestRun;
  files: GameTestFile[];
  captures: GameTestCaptures;
  controller: AbortController;
  done: Promise<GameTestRun>;
}

/**
 * The project's game tests and its latest run, which the panel and the
 * agent's tool share. One run at a time; a new one ends the last.
 */
export class GameTests {
  #current: CurrentRun | undefined;

  constructor(
    private readonly folder: string,
    private readonly game: PluginGame | undefined,
    private readonly options: { loadTimeoutMs?: number; onChange?: (run: GameTestRun) => void } = {},
  ) {}

  async state(): Promise<GameTestsState> {
    const files = (await readGameTests(this.folder)).map((entry) => entry.file);
    const run = this.#current?.run;
    return { files, ...(run ? { run: structuredClone(run) } : {}) };
  }

  /** A test file's scenario, its setup's steps first, for the panel's details; undefined when the file can't be read. */
  async detail(file: string): Promise<ParsedGameTest | undefined> {
    return (await readGameTests(this.folder)).find((entry) => entry.file.file === file)?.scenario;
  }

  /** Starts a run of the named files, or all of them. The returned run finishes with `done`. */
  async start({ files, source }: { files?: string[]; source: GameTestRun["source"] }): Promise<{ run: GameTestRun; done: Promise<GameTestRun> }> {
    const game = this.game;
    if (!game) throw new GameTestError("Game tests need the game capability, which this plugin wasn't given.");
    const entries = await readGameTests(this.folder);
    if (!entries.length) throw new GameTestError(`This project has no game tests. Add them as JSON files in ${GAME_TESTS_DIRECTORY}/.`);
    const missing = files?.filter((file) => !entries.some((entry) => entry.file.file === file));
    if (missing?.length) throw new GameTestError(`No game test named ${missing.join(", ")} in ${GAME_TESTS_DIRECTORY}/.`);
    const chosen = files ? entries.filter((entry) => files.includes(entry.file.file)) : entries;

    await this.cancel();
    const run: GameTestRun = { id: randomUUID(), status: "running", source, startedAt: new Date().toISOString(), files: chosen.map((entry) => entry.file.file), scenarios: [] };
    const controller = new AbortController();
    const current: CurrentRun = { run, files: entries.map((entry) => entry.file), captures: new Map(), controller, done: Promise.resolve(run) };
    this.#current = current;
    const changed = () => {
      if (this.#current === current) this.options.onChange?.(structuredClone(run));
    };
    current.done = (async () => {
      for (const entry of chosen) {
        const result: GameTestScenarioResult = { file: entry.file.file, name: entry.file.name ?? entry.file.file, status: "passed", viewports: [] };
        run.scenarios.push(result);
        changed();
        if (!entry.scenario) {
          Object.assign(result, { status: "failed", error: entry.file.error });
          continue;
        }
        for (const viewport of entry.scenario.viewports ?? [GAME_TEST_DEFAULT_VIEWPORT]) {
          if (controller.signal.aborted) break;
          result.viewports.push(await runGameTestViewport(game, entry.scenario, viewport, current.captures, controller.signal, { loadTimeoutMs: this.options.loadTimeoutMs }));
          result.status = overall(result.viewports.map((item) => item.status));
          changed();
        }
        if (controller.signal.aborted) {
          if (result.status === "passed") result.status = "cancelled";
          break;
        }
      }
      run.status = controller.signal.aborted ? "cancelled" : overall(run.scenarios.map((item) => item.status));
      run.finishedAt = new Date().toISOString();
      changed();
      return run;
    })();
    return { run: structuredClone(run), done: current.done };
  }

  /** Runs the named files, or all, and waits for the result; aborting the signal ends the run. */
  async run(options: { files?: string[]; source: GameTestRun["source"] }, signal?: AbortSignal): Promise<GameTestRun> {
    const { done } = await this.start(options);
    const current = this.#current;
    const cancel = () => current?.controller.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return structuredClone(await done);
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  /** Ends the run, if one is going, and waits for its windows to close. */
  async cancel(): Promise<void> {
    const current = this.#current;
    if (!current || current.run.status !== "running") return;
    current.controller.abort();
    await current.done.catch(() => {});
  }

  /** A frame the latest run kept. */
  capture(runId: string, captureId: string): PlaytestCapture | undefined {
    return this.#current?.run.id === runId ? this.#current.captures.get(captureId) : undefined;
  }

  dispose(): void {
    this.#current?.controller.abort();
  }
}
