import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { PluginGame, PluginGameSession } from "../../../app/src/shared/extension-host-protocol.js";
import type {
  GameUseSnapshot,
  PlaytestAction,
  PlaytestCapture,
  PlaytestElement,
  PlaytestSnapshot,
  PlaytestViewport,
} from "../../../app/src/shared/playtest.js";
import { GameTestError, isObject, isTestAction, message, operatorOf, VALUE_REFERENCE, type ParsedGameTest } from "./parse.ts";
import {
  GAME_TEST_DEFAULT_TIMEOUT_MS,
  type GameTestAction,
  type GameTestElement,
  type GameTestExpect,
  type GameTestStep,
  type GameTestStepResult,
  type GameTestViewportResult,
} from "./types.ts";

/** How long a game may stay blank after it opens. */
const LOAD_TIMEOUT_MS = 5_000;
const POLL_MS = 100;
const MAX_FAILURE_LOGS = 20;

type Snapshot = GameUseSnapshot | PlaytestSnapshot;

/** Whether two JSON values are the same. */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => equal(item, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
  }
  return false;
}

/** What a dotted path holds in the game's state, such as `player.x` or `enemies.0.hp`. */
export function stateAt(state: unknown, dotted: string): { found: boolean; value?: unknown } {
  let value = state;
  for (const part of dotted.split(".")) {
    if (Array.isArray(value) && /^\d+$/.test(part) && Number(part) < value.length) value = value[Number(part)];
    else if (isObject(value) && Object.hasOwn(value, part)) value = value[part];
    else return { found: false };
  }
  return { found: true, value };
}

const shown = (value: unknown) => {
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

/** Whether text holds a piece of text, or a list holds an item. */
function contains(value: unknown, operand: unknown): boolean {
  return typeof value === "string"
    ? typeof operand === "string" && value.includes(operand)
    : Array.isArray(value) && value.some((item) => equal(item, operand));
}

/** Why the game's state doesn't meet one expectation, or nothing when it does. */
export function stateFailure(state: unknown, dotted: string, expected: unknown): string | undefined {
  const { found, value } = stateAt(state, dotted);
  const [name, operand] = operatorOf(expected) ?? (["eq", expected] as const);
  if (name === "exists") return found === operand ? undefined : `state ${dotted} ${operand ? "is missing" : `exists (${shown(value)})`}`;
  if (!found) return `state ${dotted} is missing`;
  switch (name) {
    case "eq":
      return equal(value, operand) ? undefined : `state ${dotted} is ${shown(value)}, expected ${shown(operand)}`;
    case "ne":
      return equal(value, operand) ? `state ${dotted} is ${shown(value)}, expected anything else` : undefined;
    case "contains":
      return contains(value, operand) ? undefined : `state ${dotted} is ${shown(value)}, expected it to contain ${shown(operand)}`;
    case "excludes":
      return contains(value, operand) ? `state ${dotted} is ${shown(value)}, expected it not to contain ${shown(operand)}` : undefined;
    default: {
      const limit = operand as number;
      const ok = typeof value === "number" && (name === "gt" ? value > limit : name === "gte" ? value >= limit : name === "lt" ? value < limit : value <= limit);
      const words = { gt: "more than", gte: "at least", lt: "less than", lte: "at most" }[name];
      return ok ? undefined : `state ${dotted} is ${shown(value)}, expected ${words} ${limit}`;
    }
  }
}

function describeElement(element: GameTestElement): string {
  if ("testId" in element) return `testId "${element.testId}"`;
  if ("text" in element) return `text "${element.text}"`;
  return `${element.role}${element.name ? ` "${element.name}"` : ""}`;
}

/** The listed elements an expectation names. */
function matching(snapshot: PlaytestSnapshot, element: GameTestElement): PlaytestElement[] {
  if ("text" in element) return snapshot.elements.filter((item) => item.text?.includes(element.text));
  if ("testId" in element) return snapshot.elements.filter((item) => item.testId === element.testId);
  return snapshot.elements.filter((item) => item.role === element.role && (!element.name || Boolean(item.name?.includes(element.name))));
}

function elementShown(snapshot: PlaytestSnapshot, element: GameTestElement): boolean {
  // Text may be anywhere on the page, not only in an element the snapshot lists.
  return matching(snapshot, element).length > 0 || ("text" in element && Boolean(snapshot.text?.includes(element.text)));
}

/** What a snapshot shows against a step's expectations. */
export function snapshotFailures(snapshot: Snapshot, expect: GameTestExpect | undefined): string[] {
  if (!expect) return [];
  const failures: string[] = [];
  const page = "elements" in snapshot ? (snapshot as PlaytestSnapshot) : undefined;
  for (const element of expect.visible ?? []) {
    if (!page || !elementShown(page, element)) failures.push(`${describeElement(element)} isn't visible`);
  }
  for (const element of expect.hidden ?? []) {
    if (page && elementShown(page, element)) failures.push(`${describeElement(element)} is still visible`);
  }
  for (const [key, disabled] of [["enabled", false], ["disabled", true]] as const) {
    for (const element of expect[key] ?? []) {
      const found = page ? matching(page, element) : [];
      if (!found.length) failures.push(`${describeElement(element)} isn't visible`);
      else if (!found.some((item) => Boolean(item.disabled) === disabled)) failures.push(`${describeElement(element)} is ${disabled ? "enabled" : "disabled"}`);
    }
  }
  if (expect.state) {
    if (snapshot.gameState === undefined) {
      failures.push("state can't be checked: the game has no window.__OHMYGAME_PLAYTEST__.snapshot()");
    } else if (isObject(snapshot.gameState) && "playtestBridgeError" in snapshot.gameState) {
      failures.push(`the game's snapshot() failed: ${String(snapshot.gameState.playtestBridgeError)}`);
    } else {
      for (const [dotted, expected] of Object.entries(expect.state)) {
        const failure = stateFailure(snapshot.gameState, dotted, expected);
        if (failure) failures.push(failure);
      }
    }
  }
  return failures;
}

/** Remembers which of the game's console errors and failed requests were already reported. */
class GameProblems {
  readonly #seen = new Set<string>();
  /** When the player was off line: requests failing then are what the test asked for. */
  readonly #offline: { from: number; to?: number }[] = [];
  constructor(private readonly ignored: readonly string[]) {}

  network(online: boolean, at = Date.now()): void {
    const last = this.#offline.at(-1);
    if (!online && (!last || last.to !== undefined)) this.#offline.push({ from: at });
    if (online && last && last.to === undefined) last.to = at;
  }

  #wasOffline(timestamp: string): boolean {
    const at = Date.parse(timestamp);
    // A request may be reported a moment after the network came back.
    return this.#offline.some(({ from, to }) => at >= from && (to === undefined || at <= to + 1_000));
  }

  /** What went wrong since the last call. */
  next(snapshot: Snapshot): string[] {
    if (!("logs" in snapshot)) return [];
    const page = snapshot as PlaytestSnapshot;
    const problems: string[] = [];
    for (const log of page.logs) {
      const key = `log|${log.timestamp}|${log.message}|${log.source ?? ""}|${log.line ?? ""}`;
      if (this.#seen.has(key)) continue;
      this.#seen.add(key);
      if (log.level !== "error" || this.ignored.some((text) => log.message.includes(text))) continue;
      problems.push(`console error: ${log.message.slice(0, 500)}`);
    }
    for (const request of page.failedRequests) {
      const key = `request|${request.timestamp}|${request.url}|${request.error}`;
      if (this.#seen.has(key)) continue;
      this.#seen.add(key);
      // A request the page cancelled itself, as media and navigations do, isn't a failure.
      if (request.error.includes("ERR_ABORTED") || this.#wasOffline(request.timestamp)) continue;
      problems.push(`request failed: ${request.url} (${request.error})`);
    }
    return problems;
  }
}

/** Frames a run keeps for its failed and last steps. */
export type GameTestCaptures = Map<string, PlaytestCapture>;

const keep = (captures: GameTestCaptures, capture: PlaytestCapture) => {
  const id = randomUUID();
  captures.set(id, capture);
  return id;
};

/** One player's window in a run. */
interface Player {
  /** From 1, as steps name players. */
  number: number;
  session: PluginGameSession;
  problems: GameProblems;
  snapshot: Snapshot;
  /** The frame before the current step's action. */
  previous: PlaytestCapture;
}

type Remembered = ReadonlyMap<string, string | number | boolean>;

/**
 * An action or expectation with `{{name}}` replaced by what an earlier step
 * remembered. In an expectation, a value that is only `{{name}}` keeps its
 * type, so a remembered number still equals a number; in text it is text.
 */
export function withValues<T>(value: T, values: Remembered, { typed = false } = {}): T {
  const replace = (item: unknown): unknown => {
    if (typeof item === "string") {
      const whole = /^\{\{([A-Za-z][A-Za-z0-9_]*)\}\}$/.exec(item);
      if (typed && whole && values.has(whole[1]!)) return values.get(whole[1]!);
      return item.replace(VALUE_REFERENCE, (reference, name: string) => (values.has(name) ? String(values.get(name)) : reference));
    }
    if (Array.isArray(item)) return item.map(replace);
    return isObject(item) ? Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, replace(entry)])) : item;
  };
  return replace(value) as T;
}

/**
 * Runs one scenario at one size, each player in a fresh game window, as
 * separate guests of a multiplayer game. It always closes its windows.
 */
export async function runGameTestViewport(
  game: PluginGame,
  scenario: ParsedGameTest,
  viewport: PlaytestViewport,
  captures: GameTestCaptures,
  signal?: AbortSignal,
  { loadTimeoutMs = LOAD_TIMEOUT_MS }: { loadTimeoutMs?: number } = {},
): Promise<GameTestViewportResult> {
  const steps: GameTestStepResult[] = [];
  const players: Player[] = [];
  const opened: PluginGameSession[] = [];
  const several = (scenario.players ?? 1) > 1;
  const call = { signal };
  // The setup's steps run first, each counted within its own list.
  const allSteps = [
    ...(scenario.setupSteps ?? []).map((step, index) => ({ step, index, setup: true })),
    ...scenario.steps.map((step, index) => ({ step, index, setup: false })),
  ];
  const named = (player: number, text: string) => (several ? `player ${player}: ${text}` : text);
  /** Whose console a failure shows: the player it happened to. */
  let current: Snapshot | undefined;
  const failed = (extra: Partial<GameTestViewportResult>): GameTestViewportResult => ({
    viewport,
    status: "failed",
    steps,
    ...extra,
    ...(current && "logs" in current ? { logs: (current as PlaytestSnapshot).logs.slice(-MAX_FAILURE_LOGS) } : {}),
  });
  // A runtime may finish a request it was asked to cancel; the run stops all the same.
  const checked = async <T>(work: Promise<T>) => {
    const value = await work;
    signal?.throwIfAborted();
    return value;
  };
  try {
    // Only a test that takes a player off line asks for it, as opening that way loads the game a little later.
    const networkControl = allSteps.some(({ step }) => step.action?.type === "offline");
    const capture = (player: Player) => checked(player.session.capture(call));
    const inspect = async (player: Player) => {
      player.snapshot = await checked(player.session.inspect(call));
      return player.snapshot;
    };

    for (let number = 1; number <= (scenario.players ?? 1); number += 1) {
      const session = await checked(game.open({
        viewport,
        ...(scenario.path ? { path: scenario.path } : {}),
        ...(networkControl ? { networkControl } : {}),
        signal,
      }));
      opened.push(session);
      if (session.snapshot.runtime !== "web") throw new GameTestError("Game tests run web games only.");
      const player: Player = { number, session, problems: new GameProblems(scenario.ignoreErrors ?? []), snapshot: session.snapshot, previous: undefined as never };
      current = session.snapshot;
      // The game has loaded once it draws something.
      player.previous = await capture(player);
      const loading = Date.now() + loadTimeoutMs;
      while (player.previous.analysis.likelyBlank && Date.now() < loading) {
        await delay(POLL_MS * 2, undefined, { signal });
        player.previous = await capture(player);
      }
      current = await inspect(player);
      const loadProblems = player.problems.next(player.snapshot);
      if (player.previous.analysis.likelyBlank) loadProblems.push(`the game stayed blank for ${loadTimeoutMs / 1000} seconds after it opened`);
      if (loadProblems.length) return failed({ error: named(number, `While loading: ${loadProblems.join("; ")}`), captureId: keep(captures, player.previous) });

      if (scenario.seed !== undefined) {
        const bridge = player.snapshot.bridgeCapabilities ?? [];
        if (!bridge.includes("setSeed")) return failed({ error: "This test sets a seed, but the game has no window.__OHMYGAME_PLAYTEST__.setSeed()." });
        const actions: PlaytestAction[] = [{ type: "bridge", method: "setSeed", value: scenario.seed }];
        if (bridge.includes("reset")) actions.push({ type: "bridge", method: "reset" });
        player.snapshot = await checked(session.act(actions, call));
        player.previous = await capture(player);
      }
      players.push(player);
    }

    const values = new Map<string, string | number | boolean>();
    const act = async (player: Player, action: GameTestAction): Promise<Snapshot> => {
      if (isTestAction(action)) {
        if (action.type === "reload") return checked(player.session.reload(call));
        const online = action.type === "online";
        if (!online) player.problems.network(false);
        const snapshot = await checked(player.session.setOnline(online, call));
        if (online) player.problems.network(true);
        return snapshot;
      }
      return checked(player.session.act([withValues(action, values)], call));
    };
    for (const [position, { step: written, index, setup }] of allSteps.entries()) {
      const step: GameTestStep = written.expect ? { ...written, expect: withValues(written.expect, values, { typed: true }) } : written;
      const started = Date.now();
      // The players the step acts for and checks: one, or several at the same moment.
      const acting = step.together ? step.together.map((entry) => players[entry.player - 1]!) : [players[(step.player ?? 1) - 1]!];
      const label = (player: Player, text: string) => (step.together ? named(player.number, text) : text);
      const failures: string[] = [];
      if (step.together) {
        const snapshots = await checked(game.actTogether(
          step.together.map((entry) => ({
            session: players[entry.player - 1]!.session,
            actions: entry.actions.map((action) => withValues(action, values)),
          })),
          call,
        ));
        snapshots.forEach((snapshot, at) => {
          acting[at]!.snapshot = snapshot;
        });
      } else if (step.action) {
        acting[0]!.snapshot = await act(acting[0]!, step.action);
      } else {
        await inspect(acting[0]!);
      }
      const deadline = Date.now() + (step.expect?.timeoutMs ?? GAME_TEST_DEFAULT_TIMEOUT_MS);
      for (const player of acting) {
        let expected = snapshotFailures(player.snapshot, step.expect);
        while (expected.length && Date.now() < deadline) {
          await delay(POLL_MS, undefined, { signal });
          expected = snapshotFailures(await inspect(player), step.expect);
        }
        failures.push(...expected.map((failure) => label(player, failure)));
      }
      current = acting[0]!.snapshot;
      for (const [name, dotted] of Object.entries(step.remember ?? {})) {
        const { found, value } = stateAt(acting[0]!.snapshot.gameState, dotted);
        if (found && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) values.set(name, value);
        else failures.push(`can't remember ${name}: state ${dotted} ${found ? `is ${shown(value)}, not text or a number` : "is missing"}`);
      }
      const last = position === allSteps.length - 1;
      const frames = new Map<Player, PlaytestCapture>();
      let shownFrame: PlaytestCapture | undefined;
      for (const player of acting) {
        const frame = await capture(player);
        frames.set(player, frame);
        const frameFailures: string[] = [];
        if (step.expect?.screenChanged && frame.data === player.previous.data) frameFailures.push(label(player, "the frame didn't change"));
        if ((step.expect?.notBlank || last) && frame.analysis.likelyBlank) frameFailures.push(label(player, "the frame looks blank"));
        // Nothing comes after the last step, so what went wrong just after it is read now.
        frameFailures.push(...player.problems.next(last ? await inspect(player) : player.snapshot).map((problem) => named(player.number, problem)));
        if (frameFailures.length || failures.some((failure) => !step.together || failure.startsWith(`player ${player.number}:`))) shownFrame ??= frame;
        failures.push(...frameFailures);
      }
      // What one player does can break another's game.
      for (const other of players) {
        if (acting.includes(other)) continue;
        const problems = other.problems.next(await inspect(other));
        if (problems.length && !failures.length) current = other.snapshot;
        failures.push(...problems.map((problem) => named(other.number, problem)));
      }
      shownFrame ??= frames.get(acting[0]!);
      steps.push({
        index,
        ...(setup ? { setup } : {}),
        ...(several ? (step.together ? { together: acting.map((player) => player.number) } : { player: acting[0]!.number }) : {}),
        status: failures.length ? "failed" : "passed",
        ...(failures.length ? { failures } : {}),
        ...((failures.length || last) && shownFrame ? { captureId: keep(captures, shownFrame) } : {}),
        durationMs: Date.now() - started,
      });
      if (failures.length) return failed({});
      for (const [player, frame] of frames) player.previous = frame;
    }
    return { viewport, status: "passed", steps };
  } catch (cause) {
    if (signal?.aborted) return { viewport, status: "cancelled", steps };
    return failed({ error: message(cause) });
  } finally {
    await Promise.all(opened.map((session) => session.close().catch(() => {})));
  }
}
