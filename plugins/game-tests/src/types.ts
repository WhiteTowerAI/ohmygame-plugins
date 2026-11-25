import type { PlaytestAction, PlaytestLog, PlaytestTarget, PlaytestViewport } from "../../../app/src/shared/playtest.js";

// A web game's saved tests: one scenario per JSON file in `tests/game/`, run
// in the windows the agent's `game_use` opens, through `context.game`. The
// panel and the agent's `game_test` tool show the same runs.

/** Where a project's game tests live, relative to its folder. */
export const GAME_TESTS_DIRECTORY = "tests/game";
export const GAME_TEST_SCHEMA_VERSION = 1;
export const GAME_TEST_MAX_FILES = 100;
export const GAME_TEST_MAX_FILE_BYTES = 256 * 1024;
export const GAME_TEST_MAX_STEPS = 100;
export const GAME_TEST_MAX_VIEWPORTS = 4;
/** Players a test opens at once, each a guest in its own window; game windows are four at most. */
export const GAME_TEST_MAX_PLAYERS = 4;
/** How long an expectation is retried before it fails, in milliseconds. */
export const GAME_TEST_DEFAULT_TIMEOUT_MS = 2_000;
export const GAME_TEST_MAX_TIMEOUT_MS = 10_000;
export const GAME_TEST_DEFAULT_VIEWPORT: PlaytestViewport = { width: 1280, height: 720 };

/** An element an expectation looks for: what the game's snapshot lists, so no CSS selector. */
export type GameTestElement = Exclude<PlaytestTarget, { selector: string } | { x: number; y: number }>;

/** A test's own steps beside game_use's actions: a player refreshing, or their network going and coming back. */
export type GameTestAction = PlaytestAction | { type: "reload" } | { type: "offline" } | { type: "online" };

export interface GameTestExpect {
  visible?: GameTestElement[];
  hidden?: GameTestElement[];
  /** Shown and usable, such as a card the rules let the player play. */
  enabled?: GameTestElement[];
  /** Shown and not usable, such as Start before enough players joined. */
  disabled?: GameTestElement[];
  /** Dotted paths into the bridge's `snapshot()`; a plain value means `eq`. */
  state?: Record<string, unknown>;
  /** The frame differs from the one before this step's action. */
  screenChanged?: boolean;
  /** The frame is not blank. The last step of every run is checked anyway. */
  notBlank?: boolean;
  /** How long to retry `visible`, `hidden`, `enabled`, `disabled` and `state` before failing. */
  timeoutMs?: number;
}

export interface GameTestStep {
  /** Whose window the step acts in and checks, from 1; the first player's when left out. */
  player?: number;
  /** `{{name}}` in its text, and in `expect`, is replaced by a value an earlier step remembered. */
  action?: GameTestAction;
  /** Players acting at the same moment, as in a real-time game, in place of `player` and `action`. */
  together?: { player: number; actions: PlaytestAction[] }[];
  expect?: GameTestExpect;
  /** Names for text, numbers or true/false in the player's game state, read after the step's checks. */
  remember?: Record<string, string>;
}

export interface GameTestScenario {
  schemaVersion: typeof GAME_TEST_SCHEMA_VERSION;
  name: string;
  /** Path, query or hash within the game's preview. */
  path?: string;
  viewports?: PlaytestViewport[];
  /** A file in `tests/game/setup/` whose steps run first, such as two players joining one room. */
  setup?: string;
  /** Players in their own windows, as separate guests of a multiplayer game; 1 when left out. */
  players?: number;
  /** Given to the bridge's `setSeed`, then `reset`, before the first step. */
  seed?: number;
  /** Console errors containing any of these are not failures. */
  ignoreErrors?: string[];
  steps: GameTestStep[];
}

/** A file in `tests/game/`: its scenario's summary, or why it can't be run. */
export interface GameTestFile {
  /** Relative to the tests folder, such as `start.json`. */
  file: string;
  name?: string;
  steps?: number;
  /** Players the test opens, 1 for a single-player test. */
  players?: number;
  viewports?: PlaytestViewport[];
  error?: string;
}

export type GameTestStatus = "passed" | "failed" | "cancelled";

export interface GameTestStepResult {
  /** The step's position in its file, from 0. */
  index: number;
  /** Whose window it ran in, for a test with several players. */
  player?: number;
  /** A step of the test's setup, `index` counting within the setup. */
  setup?: boolean;
  /** The players who acted at the same moment, for a `together` step. */
  together?: number[];
  status: "passed" | "failed";
  failures?: string[];
  /** The frame after the step, kept for a failed step and the last one. */
  captureId?: string;
  durationMs: number;
}

export interface GameTestViewportResult {
  viewport: PlaytestViewport;
  status: GameTestStatus;
  steps: GameTestStepResult[];
  /** Why the game couldn't be opened or tested before any step ran. */
  error?: string;
  captureId?: string;
  /** The game's last console messages, when the run failed. */
  logs?: PlaytestLog[];
}

export interface GameTestScenarioResult {
  file: string;
  name: string;
  status: GameTestStatus;
  /** Why the file couldn't be read; its viewports are then empty. */
  error?: string;
  viewports: GameTestViewportResult[];
}

export interface GameTestRun {
  id: string;
  status: "running" | GameTestStatus;
  /** Who started the run. */
  source: "person" | "agent";
  startedAt: string;
  finishedAt?: string;
  /** The files the run goes through, in order; `scenarios` fills as it reaches them. */
  files: string[];
  scenarios: GameTestScenarioResult[];
}

export interface GameTestsState {
  files: GameTestFile[];
  /** The project's latest run, while its plugin host runs. */
  run?: GameTestRun;
}
