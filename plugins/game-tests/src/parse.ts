import {
  GAME_TEST_MAX_PLAYERS,
  GAME_TEST_MAX_STEPS,
  GAME_TEST_MAX_TIMEOUT_MS,
  GAME_TEST_MAX_VIEWPORTS,
  GAME_TEST_SCHEMA_VERSION,
  GAME_TESTS_DIRECTORY,
  type GameTestAction,
  type GameTestElement,
  type GameTestScenario,
  type GameTestStep,
} from "./types.ts";
import type { PlaytestViewport } from "../../../app/src/shared/playtest.js";

/** A test file that can't be run, or a run that can't start. */
export class GameTestError extends Error {}

const MAX_ELEMENTS = 20;
const MAX_STATE_PATHS = 50;
const MAX_IGNORED = 50;
const MAX_REMEMBERED = 10;
export const OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "excludes", "exists"] as const;
export type Operator = (typeof OPERATORS)[number];
const SCENARIO_KEYS = new Set(["schemaVersion", "name", "path", "viewports", "players", "setup", "seed", "ignoreErrors", "steps"]);
const SETUP_KEYS = new Set(["schemaVersion", "name", "players", "steps"]);
/** Steps of a test's own, beside game_use's actions: a player refreshing, or their network going and coming back. */
const TEST_ACTIONS = new Set(["reload", "offline", "online"]);
const SETUP_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const STEP_KEYS = new Set(["player", "action", "together", "expect", "remember"]);
const EXPECT_KEYS = new Set(["visible", "hidden", "enabled", "disabled", "state", "screenChanged", "notBlank", "timeoutMs"]);
export const VALUE_REFERENCE = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g;

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Steps a project's tests share, from a file in `tests/game/setup/`, such as two players in one room. */
export interface GameTestSetup {
  name: string;
  players: number;
  steps: GameTestStep[];
  /** What its steps remember, for the tests that use it. */
  remembered: ReadonlySet<string>;
}

/** A scenario with the steps of the setup it names, which run first. */
export type ParsedGameTest = GameTestScenario & { setupSteps?: GameTestStep[] };

const text = (value: unknown, limit: number) => typeof value === "string" && value.length > 0 && value.length <= limit;
const number = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const whole = (value: unknown, min: number, max: number) => Number.isInteger(value) && number(value, min, max);
const only = (value: Record<string, unknown>, ...keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

function isViewport(value: unknown): value is PlaytestViewport {
  return isObject(value) && only(value, "width", "height") && whole(value.width, 240, 4096) && whole(value.height, 240, 4096);
}

function targetProblem(target: unknown, { point }: { point: boolean }): string | undefined {
  if (!isObject(target)) return "target must be an object";
  const keys = Object.keys(target);
  if (keys.length === 1 && "selector" in target) return text(target.selector, 500) ? undefined : "target.selector must be 1 to 500 characters";
  if (keys.length === 1 && "testId" in target) return text(target.testId, 200) ? undefined : "target.testId must be 1 to 200 characters";
  if (keys.length === 1 && "text" in target) return text(target.text, 300) ? undefined : "target.text must be 1 to 300 characters";
  if ("role" in target && only(target, "role", "name"))
    return text(target.role, 100) && (target.name === undefined || text(target.name, 300)) ? undefined : "target.role must be 1 to 100 characters and target.name 1 to 300";
  if (point && "x" in target && "y" in target && only(target, "x", "y"))
    return number(target.x, 0, 8192) && number(target.y, 0, 8192) ? undefined : "target.x and target.y must be from 0 to 8192";
  return `target must be { "testId" }, { "text" }, { "role", "name"? }, { "selector" }${point ? ' or { "x", "y" }' : ""}`;
}

/** Why an action isn't one game_use takes, as the app checks it again; undefined when it is. */
export function actionProblem(action: unknown): string | undefined {
  if (!isObject(action) || typeof action.type !== "string") return 'it must be an object with a "type"';
  switch (action.type) {
    case "click":
      return only(action, "type", "target") ? targetProblem(action.target, { point: true }) : "click has type and target";
    case "type":
      if (!only(action, "type", "target", "text")) return "type has type, target and text";
      if (typeof action.text !== "string" || action.text.length > 10_000) return "text must be at most 10000 characters";
      return targetProblem(action.target, { point: false });
    case "press":
      if (!only(action, "type", "key", "duration")) return "press has type, key and duration";
      if (!text(action.key, 40)) return "key must be 1 to 40 characters, such as ArrowRight or Space";
      return action.duration === undefined || whole(action.duration, 0, 5_000) ? undefined : "duration must be a whole number of milliseconds from 0 to 5000";
    case "touch":
      return only(action, "type", "x", "y") && number(action.x, 0, 8192) && number(action.y, 0, 8192) ? undefined : "touch has x and y from 0 to 8192";
    case "wait":
      return only(action, "type", "milliseconds") && whole(action.milliseconds, 0, 5_000) ? undefined : "wait has milliseconds, a whole number from 0 to 5000";
    case "resize":
      return only(action, "type", "viewport") && isViewport(action.viewport) ? undefined : "resize has a viewport of whole numbers from 240 to 4096";
    case "bridge":
      if (action.method === "reset") return only(action, "type", "method") ? undefined : "bridge reset has type and method";
      if (action.method === "setSeed" || action.method === "step")
        return only(action, "type", "method", "value") && number(action.value, -Number.MAX_VALUE, Number.MAX_VALUE) ? undefined : `bridge ${action.method} has a number value`;
      return 'bridge method must be "reset", "setSeed" or "step"';
    default:
      return `"${action.type}" isn't an action`;
  }
}

function parseObject(source: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    throw new GameTestError(`It isn't valid JSON: ${message(cause)}`);
  }
  if (!isObject(value)) throw new GameTestError("It must be a JSON object.");
  return value;
}

function checkPlayers(players: unknown): number {
  if (!whole(players, 1, GAME_TEST_MAX_PLAYERS)) throw new GameTestError(`"players" must be a whole number from 1 to ${GAME_TEST_MAX_PLAYERS}.`);
  return players as number;
}

function checkSteps(steps: unknown, players: number, remembered: Set<string>): void {
  if (!Array.isArray(steps) || !steps.length || steps.length > GAME_TEST_MAX_STEPS) {
    throw new GameTestError(`"steps" must list 1 to ${GAME_TEST_MAX_STEPS} steps.`);
  }
  steps.forEach((step, index) => checkStep(step, `steps[${index}]`, players, remembered));
}

/** Reads shared setup steps out of a file in `tests/game/setup/`, or says what is wrong with it. */
export function parseGameTestSetup(source: string): GameTestSetup {
  const value = parseObject(source);
  const unknownKey = Object.keys(value).find((key) => !SETUP_KEYS.has(key));
  if (unknownKey) throw new GameTestError(`"${unknownKey}" isn't a setup field. The fields are ${[...SETUP_KEYS].join(", ")}.`);
  if (value.schemaVersion !== GAME_TEST_SCHEMA_VERSION) throw new GameTestError(`"schemaVersion" must be ${GAME_TEST_SCHEMA_VERSION}.`);
  if (!text(value.name, 200) || !(value.name as string).trim()) throw new GameTestError('"name" must be text of 1 to 200 characters.');
  const players = checkPlayers(value.players ?? 1);
  const remembered = new Set<string>();
  checkSteps(value.steps, players, remembered);
  return { name: value.name as string, players, steps: value.steps as GameTestStep[], remembered };
}

/** The setup file a test's `setup` names: `two-players` and `two-players.json` are both setup/two-players.json. */
export function setupFileName(name: string): string {
  return name.endsWith(".json") ? name : `${name}.json`;
}

/** Reads a scenario out of a test file, or says what is wrong with it. */
export function parseGameTest(source: string, setups: ReadonlyMap<string, GameTestSetup | GameTestError> = new Map()): ParsedGameTest {
  const value = parseObject(source);
  const unknownKey = Object.keys(value).find((key) => !SCENARIO_KEYS.has(key));
  if (unknownKey) throw new GameTestError(`"${unknownKey}" isn't a game test field. The fields are ${[...SCENARIO_KEYS].join(", ")}.`);
  const { schemaVersion, name, path: openPath, viewports, players = 1, setup, seed, ignoreErrors, steps } = value;
  if (schemaVersion !== GAME_TEST_SCHEMA_VERSION) throw new GameTestError(`"schemaVersion" must be ${GAME_TEST_SCHEMA_VERSION}.`);
  if (!text(name, 200) || !(name as string).trim()) throw new GameTestError('"name" must be text of 1 to 200 characters.');
  if (openPath !== undefined && (typeof openPath !== "string" || openPath.length > 1_000)) throw new GameTestError('"path" must be a path, query or hash of at most 1000 characters.');
  if (viewports !== undefined) {
    if (!Array.isArray(viewports) || !viewports.length || viewports.length > GAME_TEST_MAX_VIEWPORTS) {
      throw new GameTestError(`"viewports" must list 1 to ${GAME_TEST_MAX_VIEWPORTS} sizes.`);
    }
    viewports.forEach((viewport, index) => {
      if (!isViewport(viewport)) throw new GameTestError(`viewports[${index}] must be { "width", "height" }, whole numbers from 240 to 4096.`);
    });
  }
  checkPlayers(players);
  let shared: GameTestSetup | undefined;
  if (setup !== undefined) {
    if (typeof setup !== "string" || !SETUP_NAME.test(setup)) throw new GameTestError(`"setup" must name a file in ${GAME_TESTS_DIRECTORY}/setup/, such as "two-players".`);
    const found = setups.get(setupFileName(setup));
    if (!found) throw new GameTestError(`"setup" names ${GAME_TESTS_DIRECTORY}/setup/${setupFileName(setup)}, which doesn't exist.`);
    if (found instanceof GameTestError) throw new GameTestError(`"setup" names ${GAME_TESTS_DIRECTORY}/setup/${setupFileName(setup)}, which can't be used: ${found.message}`);
    if (found.players > (players as number)) throw new GameTestError(`"setup" ${setup} needs ${found.players} players; set "players" to at least ${found.players}.`);
    shared = found;
  }
  if (seed !== undefined && !number(seed, -Number.MAX_VALUE, Number.MAX_VALUE)) throw new GameTestError('"seed" must be a number.');
  if (ignoreErrors !== undefined && (!Array.isArray(ignoreErrors) || ignoreErrors.length > MAX_IGNORED || ignoreErrors.some((item) => !text(item, 500)))) {
    throw new GameTestError(`"ignoreErrors" must list at most ${MAX_IGNORED} pieces of text.`);
  }
  const remembered = new Set<string>(shared?.remembered);
  checkSteps(steps, players as number, remembered);
  return { ...(value as unknown as GameTestScenario), ...(shared ? { setupSteps: shared.steps } : {}) };
}

function checkStep(step: unknown, at: string, players: number, remembered: Set<string>): void {
  if (!isObject(step)) throw new GameTestError(`${at} must be an object.`);
  const unknownKey = Object.keys(step).find((key) => !STEP_KEYS.has(key));
  if (unknownKey) throw new GameTestError(`${at}.${unknownKey} isn't a step field. A step has ${[...STEP_KEYS].join(", ")}.`);
  if (step.action === undefined && step.together === undefined && step.expect === undefined && step.remember === undefined) {
    throw new GameTestError(`${at} needs an "action", "together", an "expect", a "remember" or more.`);
  }
  if (step.together !== undefined) checkTogether(step, at, players, remembered);
  if (step.player !== undefined && !whole(step.player, 1, players)) {
    throw new GameTestError(players === 1 ? `${at}.player can only be 1: set "players" for a test with more.` : `${at}.player must be a whole number from 1 to ${players}.`);
  }
  if (step.action !== undefined && !isTestAction(step.action)) {
    const problem = actionProblem(step.action);
    const type = isObject(step.action) && typeof step.action.type === "string" ? ` (${step.action.type})` : "";
    if (problem) throw new GameTestError(`${at}.action${type} isn't an action game_use takes, or reload, offline or online: ${problem}.`);
  }
  if (step.action !== undefined) checkReferences(step.action, `${at}.action`, remembered);
  if (step.expect !== undefined) {
    checkExpect(step.expect, `${at}.expect`);
    // A step's expectations are checked before it remembers anything.
    checkReferences(step.expect, `${at}.expect`, remembered);
  }
  if (step.remember !== undefined) {
    if (!isObject(step.remember) || !Object.keys(step.remember).length || Object.keys(step.remember).length > MAX_REMEMBERED) {
      throw new GameTestError(`${at}.remember must map 1 to ${MAX_REMEMBERED} names to state paths, such as { "room": "room.code" }.`);
    }
    for (const [name, dotted] of Object.entries(step.remember)) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new GameTestError(`${at}.remember has a name "${name}" that isn't letters, digits and "_", starting with a letter.`);
      if (!text(dotted, 200) || (dotted as string).split(".").some((part) => !part)) {
        throw new GameTestError(`${at}.remember["${name}"] must be a state path, such as "room.code".`);
      }
      remembered.add(name);
    }
  }
}

/** `{ "type": "reload" }`, `{ "type": "offline" }` or `{ "type": "online" }`. */
export function isTestAction(action: unknown): action is Extract<GameTestAction, { type: "reload" | "offline" | "online" }> {
  return isObject(action) && Object.keys(action).length === 1 && TEST_ACTIONS.has(action.type as string);
}

function checkReferences(value: unknown, at: string, remembered: ReadonlySet<string>): void {
  for (const [, name] of JSON.stringify(value).matchAll(VALUE_REFERENCE)) {
    if (!remembered.has(name!)) throw new GameTestError(`${at} uses {{${name}}}, which no earlier step remembers.`);
  }
}

/** A step whose players act at the same moment, as in a real-time game. */
function checkTogether(step: Record<string, unknown>, at: string, players: number, remembered: Set<string>): void {
  if (step.action !== undefined || step.player !== undefined || step.remember !== undefined) {
    throw new GameTestError(`${at} has "together", so its actions and players are in it: leave out "action", "player" and "remember".`);
  }
  const together = step.together;
  if (players < 2) throw new GameTestError(`${at}.together needs "players" of 2 or more.`);
  if (!Array.isArray(together) || together.length < 2 || together.length > players) {
    throw new GameTestError(`${at}.together must list 2 to ${players} players, each { "player", "actions" }.`);
  }
  const seen = new Set<number>();
  together.forEach((entry, position) => {
    const where = `${at}.together[${position}]`;
    if (!isObject(entry) || !only(entry, "player", "actions")) throw new GameTestError(`${where} must be { "player", "actions" }.`);
    if (!whole(entry.player, 1, players)) throw new GameTestError(`${where}.player must be a whole number from 1 to ${players}.`);
    if (seen.has(entry.player as number)) throw new GameTestError(`${where}.player ${entry.player} is already in this step.`);
    seen.add(entry.player as number);
    if (!Array.isArray(entry.actions) || !entry.actions.length || entry.actions.length > 20) throw new GameTestError(`${where}.actions must list 1 to 20 actions.`);
    entry.actions.forEach((action, index) => {
      const problem = actionProblem(action);
      if (problem) throw new GameTestError(`${where}.actions[${index}] isn't an action game_use takes: ${problem}.`);
      checkReferences(action, `${where}.actions[${index}]`, remembered);
    });
  });
}

function checkExpect(expect: unknown, at: string): void {
  if (!isObject(expect)) throw new GameTestError(`${at} must be an object.`);
  const unknownKey = Object.keys(expect).find((key) => !EXPECT_KEYS.has(key));
  if (unknownKey) throw new GameTestError(`${at}.${unknownKey} isn't an expectation. They are ${[...EXPECT_KEYS].join(", ")}.`);
  for (const key of ["visible", "hidden", "enabled", "disabled"] as const) {
    const elements = expect[key];
    if (elements === undefined) continue;
    if (!Array.isArray(elements) || !elements.length || elements.length > MAX_ELEMENTS) throw new GameTestError(`${at}.${key} must list 1 to ${MAX_ELEMENTS} elements.`);
    elements.forEach((element, index) => {
      if (!isElement(element)) throw new GameTestError(`${at}.${key}[${index}] must be { "testId" }, { "text" } or { "role", "name"? }.`);
    });
  }
  if (expect.state !== undefined) {
    if (!isObject(expect.state) || !Object.keys(expect.state).length || Object.keys(expect.state).length > MAX_STATE_PATHS) {
      throw new GameTestError(`${at}.state must map 1 to ${MAX_STATE_PATHS} paths, such as "player.x", to what they hold.`);
    }
    for (const [key, expected] of Object.entries(expect.state)) {
      if (!key || key.length > 200 || key.split(".").some((part) => !part)) throw new GameTestError(`${at}.state has a path "${key}" that isn't names joined by dots.`);
      const problem = comparisonProblem(expected);
      if (problem) throw new GameTestError(`${at}.state["${key}"] ${problem}`);
    }
  }
  for (const key of ["screenChanged", "notBlank"] as const) {
    if (expect[key] !== undefined && typeof expect[key] !== "boolean") throw new GameTestError(`${at}.${key} must be true or false.`);
  }
  if (expect.timeoutMs !== undefined && !whole(expect.timeoutMs, 0, GAME_TEST_MAX_TIMEOUT_MS)) {
    throw new GameTestError(`${at}.timeoutMs must be a whole number from 0 to ${GAME_TEST_MAX_TIMEOUT_MS}.`);
  }
}

function isElement(value: unknown): value is GameTestElement {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 1 && "testId" in value) return text(value.testId, 200);
  if (keys.length === 1 && "text" in value) return text(value.text, 300);
  if ("role" in value && only(value, "role", "name")) return text(value.role, 100) && (value.name === undefined || text(value.name, 300));
  return false;
}

/** An operator object, when its only key is an operator; anything else is compared whole. */
export function operatorOf(expected: unknown): [Operator, unknown] | undefined {
  if (!isObject(expected)) return undefined;
  const keys = Object.keys(expected);
  if (keys.length !== 1 || !OPERATORS.includes(keys[0] as Operator)) return undefined;
  return [keys[0] as Operator, expected[keys[0]!]];
}

function comparisonProblem(expected: unknown): string | undefined {
  const operator = operatorOf(expected);
  if (!operator) return undefined;
  const [name, operand] = operator;
  // A remembered value stands for the number it will be.
  const reference = typeof operand === "string" && /^\{\{[A-Za-z][A-Za-z0-9_]*\}\}$/.test(operand);
  if ((name === "gt" || name === "gte" || name === "lt" || name === "lte") && !reference && !number(operand, -Number.MAX_VALUE, Number.MAX_VALUE)) {
    return `uses "${name}", which compares with a number or a remembered {{name}}.`;
  }
  if (name === "exists" && typeof operand !== "boolean") return 'uses "exists", which is true or false.';
  return undefined;
}
