import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginGame, PluginGameSession } from "../../app/src/shared/extension-host-protocol.js";
import {
  WEB_GAME_USE_CAPABILITIES,
  type PlaytestLog,
  type PlaytestSnapshot,
} from "../../app/src/shared/playtest.js";
import { GameTestError, parseGameTest, parseGameTestSetup, type GameTestSetup } from "../../plugins/game-tests/src/parse.ts";
import { runGameTestViewport, stateFailure, type GameTestCaptures } from "../../plugins/game-tests/src/run.ts";
import { runSummary as gameTestSummary } from "../../plugins/game-tests/src/summary.ts";
import { GameTests, readGameTests } from "../../plugins/game-tests/src/tests.ts";
import type { GameTestRun, GameTestScenario } from "../../plugins/game-tests/src/types.ts";

// What the app's context.game sends on, as a fake game runtime takes it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Request = { operation: string; [key: string]: any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = any;
interface Runtime { request(request: Request, signal?: AbortSignal): Promise<Result> }

/** A fake runtime as a plugin's context.game, each call one request, as the app's bridge makes them. */
function runtime(driver: Runtime): PluginGame {
  const session = (snapshot: PlaytestSnapshot): PluginGameSession => {
    const id = snapshot.sessionId;
    const ask = async (request: Request) => (await driver.request({ ...request, sessionId: id })).snapshot;
    return {
      id,
      capabilities: snapshot.capabilities,
      snapshot,
      inspect: () => ask({ operation: "inspect" }),
      act: (actions) => ask({ operation: "act", actions }),
      capture: async () => (await driver.request({ operation: "capture", sessionId: id })).capture,
      captureFrame: () => Promise.reject(new Error("no captureFrame")),
      recordStart: () => Promise.reject(new Error("no recording")),
      recordStop: () => Promise.reject(new Error("no recording")),
      reload: () => ask({ operation: "reload" }),
      setOnline: (online) => ask({ operation: "network", online }),
      close: async () => { await driver.request({ operation: "close", sessionId: id }); },
    };
  };
  return {
    open: async ({ signal, ...options } = {}) => session((await driver.request({ operation: "open", ...options }, signal)).snapshot),
    actTogether: async (players) => (await driver.request({ operation: "actTogether", players: players.map((player) => ({ sessionId: player.session.id, actions: player.actions })) })).snapshots,
  };
}

/** A small game: a Start button, then a player that moves right while ArrowRight is held. */
class FakeGame {
  readonly capabilities = WEB_GAME_USE_CAPABILITIES;
  readonly requests: Request[] = [];
  state = { scene: "menu", x: 0, seed: 0 };
  logs: PlaytestLog[] = [];
  failedRequests: PlaytestSnapshot["failedRequests"] = [];
  blank = false;
  bridge = ["snapshot", "reset", "setSeed"];
  /** Inspections before the HUD shows after Start, as a game that animates its menu away. */
  hudDelay = 0;
  #inspections = 0;
  /** What happens to the game on an action, beyond the built-in ones. */
  onAction?: (action: unknown) => void;
  startDisabled = false;
  online = true;
  reloads = 0;

  snapshot(): PlaytestSnapshot {
    const hud = this.state.scene === "level1" && this.#inspections >= this.hudDelay;
    return {
      sessionId: "session-1",
      runtime: "web",
      capabilities: this.capabilities,
      url: "http://127.0.0.1:43210/",
      title: "Fake",
      readyState: "complete",
      viewport: { width: 1280, height: 720 },
      elements: this.state.scene === "menu"
        ? [{ index: 0, tag: "button", role: "button", name: "Start", text: "Start", disabled: this.startDisabled, box: { x: 10, y: 10, width: 80, height: 30 } }]
        : hud ? [{ index: 0, tag: "div", testId: "hud", text: "Score 0", disabled: false, box: { x: 0, y: 0, width: 200, height: 20 } }] : [],
      canvases: [],
      logs: [...this.logs],
      failedRequests: [...this.failedRequests],
      ...(this.bridge.includes("snapshot") ? { gameState: { ...this.state, online: this.online, reloads: this.reloads } } : {}),
      ...(this.bridge.length ? { bridgeCapabilities: this.bridge } : {}),
    };
  }

  async request(request: Request): Promise<Result> {
    this.requests.push(request);
    switch (request.operation) {
      case "open": return { operation: "open", snapshot: this.snapshot() };
      case "inspect":
        this.#inspections += 1;
        return { operation: "inspect", snapshot: this.snapshot() };
      case "act":
        for (const action of request.actions) {
          if (action.type === "click" && "role" in action.target && action.target.name === "Start") {
            this.state.scene = "level1";
            this.#inspections = 0;
          }
          if (action.type === "press" && action.key === "ArrowRight") this.state.x += (action.duration ?? 0) / 5;
          if (action.type === "bridge" && action.method === "setSeed") this.state.seed = action.value;
          if (action.type === "bridge" && action.method === "reset") Object.assign(this.state, { scene: "menu", x: 0 });
          this.onAction?.(action);
        }
        return { operation: "act", snapshot: this.snapshot() };
      case "capture":
        return {
          operation: "capture",
          capture: {
            sessionId: request.sessionId,
            mediaType: "image/jpeg",
            data: Buffer.from(JSON.stringify(this.state)).toString("base64"),
            width: 1280,
            height: 720,
            analysis: { sampledPixels: 100, opaqueRatio: 1, luminanceMean: this.blank ? 0 : 80, luminanceVariance: this.blank ? 0 : 20, likelyBlank: this.blank },
          },
        };
      case "reload":
        this.reloads += 1;
        // A refreshed page starts again at its menu.
        Object.assign(this.state, { scene: "menu", x: 0 });
        return { operation: "reload", snapshot: this.snapshot() };
      case "network":
        this.online = request.online;
        return { operation: "network", snapshot: this.snapshot() };
      case "close": return { operation: "close" };
      default: throw new Error(`Unexpected ${request.operation}`);
    }
  }
}

const startAndMove: GameTestScenario = {
  schemaVersion: 1,
  name: "Start and move",
  steps: [
    { action: { type: "click", target: { role: "button", name: "Start" } }, expect: { visible: [{ testId: "hud" }], hidden: [{ role: "button", name: "Start" }], state: { scene: "level1" } } },
    { action: { type: "press", key: "ArrowRight", duration: 500 }, expect: { state: { x: { gt: 50 } }, screenChanged: true } },
  ],
};

const log = (message: string, level: PlaytestLog["level"] = "error"): PlaytestLog => ({ level, message, timestamp: new Date().toISOString() });

describe("game test files", () => {
  it("reads a scenario", () => {
    const scenario = parseGameTest(JSON.stringify({ ...startAndMove, path: "/?level=1", viewports: [{ width: 390, height: 844 }], seed: 7, ignoreErrors: ["favicon"] }));
    expect(scenario.steps).toHaveLength(2);
    expect(scenario.viewports).toEqual([{ width: 390, height: 844 }]);
  });

  it.each([
    ["not json", "It isn't valid JSON"],
    [JSON.stringify({ ...startAndMove, schemaVersion: 2 }), '"schemaVersion" must be 1.'],
    [JSON.stringify({ ...startAndMove, step: [] }), '"step" isn\'t a game test field'],
    [JSON.stringify({ ...startAndMove, steps: [] }), '"steps" must list 1 to 100 steps.'],
    [JSON.stringify({ ...startAndMove, steps: [{}] }), 'steps[0] needs an "action", "together", an "expect", a "remember" or more.'],
    [JSON.stringify({ ...startAndMove, steps: [{ action: { type: "jump" } }] }), "steps[0].action (jump) isn't an action game_use takes"],
    [JSON.stringify({ ...startAndMove, steps: [{ expect: { visible: [{ selector: ".hud" }] } }] }), "steps[0].expect.visible[0] must be"],
    [JSON.stringify({ ...startAndMove, steps: [{ expect: { state: { x: { gt: "1" } } } }] }), 'steps[0].expect.state["x"] uses "gt", which compares with a number or a remembered {{name}}.'],
    [JSON.stringify({ ...startAndMove, steps: [{ expect: { timeoutMs: 60_000 } }] }), "steps[0].expect.timeoutMs must be"],
    [JSON.stringify({ ...startAndMove, viewports: [{ width: 100, height: 100 }] }), "viewports[0] must be"],
    [JSON.stringify({ ...startAndMove, players: 5 }), '"players" must be a whole number from 1 to 4.'],
    [JSON.stringify({ ...startAndMove, setup: "two-players" }), '"setup" names tests/game/setup/two-players.json, which doesn\'t exist.'],
    [JSON.stringify({ ...startAndMove, setup: "../secrets" }), '"setup" must name a file in tests/game/setup/'],
    [JSON.stringify({ ...startAndMove, steps: [{ expect: { state: { score: "{{score}}" } } }] }), "steps[0].expect uses {{score}}, which no earlier step remembers."],
    [JSON.stringify({ ...startAndMove, steps: [{ remember: { score: "score" }, expect: { state: { score: "{{score}}" } } }] }), "steps[0].expect uses {{score}}"],
    [JSON.stringify({ ...startAndMove, steps: [{ action: { type: "reload", hard: true } }] }), "steps[0].action (reload) isn't an action game_use takes, or reload, offline or online"],
    [JSON.stringify({ ...startAndMove, steps: [{ expect: { disabled: [{ selector: "#start" }] } }] }), "steps[0].expect.disabled[0] must be"],
    [JSON.stringify({ ...startAndMove, steps: [{ player: 2, expect: {} }] }), 'steps[0].player can only be 1: set "players" for a test with more.'],
    [JSON.stringify({ ...startAndMove, players: 2, steps: [{ player: 3, expect: {} }] }), "steps[0].player must be a whole number from 1 to 2."],
    [JSON.stringify({ ...startAndMove, steps: [{ action: { type: "type", target: { testId: "code" }, text: "{{room}}" } }] }), "steps[0].action uses {{room}}, which no earlier step remembers."],
    [JSON.stringify({ ...startAndMove, steps: [{ remember: { "room code": "room.code" } }] }), 'steps[0].remember has a name "room code"'],
    [JSON.stringify({ ...startAndMove, steps: [{ together: [{ player: 1, actions: [{ type: "wait", milliseconds: 1 }] }, { player: 2, actions: [{ type: "wait", milliseconds: 1 }] }] }] }), 'steps[0].together needs "players" of 2 or more.'],
    [JSON.stringify({ ...startAndMove, players: 2, steps: [{ player: 1, together: [] }] }), 'steps[0] has "together", so its actions and players are in it'],
    [JSON.stringify({ ...startAndMove, players: 2, steps: [{ together: [{ player: 1, actions: [{ type: "wait", milliseconds: 1 }] }, { player: 1, actions: [{ type: "wait", milliseconds: 1 }] }] }] }), "steps[0].together[1].player 1 is already in this step."],
    [JSON.stringify({ ...startAndMove, players: 2, steps: [{ together: [{ player: 1, actions: [] }, { player: 2, actions: [{ type: "wait", milliseconds: 1 }] }] }] }), "steps[0].together[0].actions must list 1 to 20 actions."],
    [JSON.stringify({ ...startAndMove, players: 2, steps: [{ together: [{ player: 1, actions: [{ type: "type", target: { testId: "x" }, text: "{{name}}" }] }, { player: 2, actions: [{ type: "wait", milliseconds: 1 }] }] }] }), "steps[0].together[0].actions[0] uses {{name}}, which no earlier step remembers."],
  ])("says what is wrong with %s", (text, problem) => {
    expect(() => parseGameTest(text)).toThrow(GameTestError);
    expect(() => parseGameTest(text)).toThrow(problem);
  });

  it("reads the example the agent is shown", () => {
    const skill = readFileSync(new URL("../../plugins/game-tests/skills/game-tests/SKILL.md", import.meta.url), "utf8");
    const example = skill.slice(skill.indexOf("```json\n") + "```json\n".length, skill.indexOf("\n```", skill.indexOf("```json\n")));
    const setups = new Map([["two-players.json", parseGameTestSetup(JSON.stringify({ schemaVersion: 1, name: "Two players", players: 2, steps: [{ expect: { state: { room: { exists: true } } } }] }))]]);
    expect(parseGameTest(example, setups).steps).toHaveLength(4);
  });

  it("compares the game's state", () => {
    const state = { player: { x: 12, items: ["key"] }, enemies: [{ hp: 3 }], name: "Ada" };
    expect(stateFailure(state, "player.x", 12)).toBeUndefined();
    expect(stateFailure(state, "player.x", { gte: 12 })).toBeUndefined();
    expect(stateFailure(state, "player.x", { lt: 10 })).toBe("state player.x is 12, expected less than 10");
    expect(stateFailure(state, "enemies.0.hp", 3)).toBeUndefined();
    expect(stateFailure(state, "player.items", { contains: "key" })).toBeUndefined();
    expect(stateFailure(state, "name", { contains: "d" })).toBeUndefined();
    expect(stateFailure(state, "player", { x: 12, items: ["key"] })).toBeUndefined();
    expect(stateFailure(state, "player.y", { exists: false })).toBeUndefined();
    expect(stateFailure(state, "player.y", 1)).toBe("state player.y is missing");
    expect(stateFailure(state, "player.x", { ne: 11 })).toBeUndefined();
    expect(stateFailure(state, "player.x", { ne: 12 })).toBe("state player.x is 12, expected anything else");
    expect(stateFailure(state, "player.items", { excludes: "sword" })).toBeUndefined();
    expect(stateFailure(state, "player.items", { excludes: "key" })).toBe('state player.items is ["key"], expected it not to contain "key"');
  });

  describe("in a project", () => {
    let workspace: string | undefined;
    afterEach(async () => {
      if (workspace) await rm(workspace, { recursive: true, force: true });
      workspace = undefined;
    });

    it("lists the tests folder's files in order with their problems", async () => {
      workspace = await mkdtemp(path.join(tmpdir(), "game-tests-"));
      expect(await readGameTests(workspace)).toEqual([]);
      await mkdir(path.join(workspace, "tests", "game"), { recursive: true });
      await writeFile(path.join(workspace, "tests", "game", "b.json"), JSON.stringify(startAndMove));
      await writeFile(path.join(workspace, "tests", "game", "a.json"), "{");
      await writeFile(path.join(workspace, "tests", "game", "notes.md"), "not a test");
      const entries = await readGameTests(workspace);
      expect(entries.map((entry) => entry.file)).toEqual([
        { file: "a.json", error: expect.stringContaining("It isn't valid JSON") },
        { file: "b.json", name: "Start and move", steps: 2, players: 1, viewports: [{ width: 1280, height: 720 }] },
      ]);
    });
  });
});

describe("running a game test", () => {
  it("plays the steps in a fresh window and closes it", async () => {
    const game = new FakeGame();
    const captures: GameTestCaptures = new Map();
    const result = await runGameTestViewport(runtime(game), { ...startAndMove, path: "/?level=1", seed: 7 }, { width: 390, height: 844 }, captures);

    expect(result).toMatchObject({ status: "passed", viewport: { width: 390, height: 844 }, steps: [{ index: 0, status: "passed" }, { index: 1, status: "passed" }] });
    expect(game.requests[0]).toEqual({ operation: "open", viewport: { width: 390, height: 844 }, path: "/?level=1" });
    expect(game.requests).toContainEqual({ operation: "act", sessionId: "session-1", actions: [{ type: "bridge", method: "setSeed", value: 7 }, { type: "bridge", method: "reset" }] });
    expect(game.state.seed).toBe(7);
    expect(game.requests.at(-1)).toEqual({ operation: "close", sessionId: "session-1" });
    // Only the last step's frame is kept when everything passes.
    expect(captures.size).toBe(1);
    expect(result.steps[1]!.captureId && captures.has(result.steps[1]!.captureId)).toBe(true);
  });

  it("waits for what a step expects to appear", async () => {
    const game = new FakeGame();
    game.hudDelay = 2;
    const result = await runGameTestViewport(runtime(game), startAndMove, { width: 1280, height: 720 }, new Map());
    expect(result.status).toBe("passed");
    expect(game.requests.filter((request) => request.operation === "inspect").length).toBeGreaterThanOrEqual(3);
  });

  it("stops at the first failing step and says why", async () => {
    const game = new FakeGame();
    game.logs = [log("loaded", "info")];
    const scenario: GameTestScenario = {
      ...startAndMove,
      steps: [
        { action: { type: "click", target: { role: "button", name: "Start" } }, expect: { state: { scene: "level2" }, timeoutMs: 0 } },
        { action: { type: "press", key: "ArrowRight", duration: 100 } },
      ],
    };
    const captures: GameTestCaptures = new Map();
    const result = await runGameTestViewport(runtime(game), scenario, { width: 1280, height: 720 }, captures);

    expect(result.status).toBe("failed");
    expect(result.steps).toEqual([expect.objectContaining({ index: 0, status: "failed", failures: ['state scene is "level1", expected "level2"'] })]);
    expect(captures.has(result.steps[0]!.captureId!)).toBe(true);
    expect(result.logs).toEqual([expect.objectContaining({ message: "loaded" })]);
    expect(game.requests.some((request) => request.operation === "act" && request.actions[0]?.type === "press")).toBe(false);
    expect(game.requests.at(-1)).toEqual({ operation: "close", sessionId: "session-1" });
  });

  it("fails a step on new console errors and failed requests, apart from those it allows", async () => {
    const game = new FakeGame();
    game.logs = [log("old warning", "warning")];
    game.onAction = (action) => {
      if ((action as { type: string }).type !== "press") return;
      game.logs.push(log("Uncaught TypeError: player is undefined"), log("favicon.ico missing"));
      game.failedRequests.push(
        { url: "http://127.0.0.1:43210/music.mp3", error: "net::ERR_ABORTED", timestamp: new Date().toISOString() },
        { url: "http://127.0.0.1:43210/level.json", error: "net::ERR_CONNECTION_REFUSED", timestamp: new Date().toISOString() },
      );
    };
    const result = await runGameTestViewport(runtime(game), { ...startAndMove, ignoreErrors: ["favicon"] }, { width: 1280, height: 720 }, new Map());

    expect(result.steps[1]).toMatchObject({
      status: "failed",
      failures: [
        "console error: Uncaught TypeError: player is undefined",
        "request failed: http://127.0.0.1:43210/level.json (net::ERR_CONNECTION_REFUSED)",
      ],
    });
  });

  it("fails a game that stays blank or errs while loading", async () => {
    const blank = new FakeGame();
    blank.blank = true;
    const result = await runGameTestViewport(runtime(blank), startAndMove, { width: 1280, height: 720 }, new Map(), undefined, { loadTimeoutMs: 0 });
    expect(result).toMatchObject({ status: "failed", steps: [], error: "While loading: the game stayed blank for 0 seconds after it opened" });
    expect(result.captureId).toBeDefined();

    const broken = new FakeGame();
    broken.logs = [log("Uncaught SyntaxError: Unexpected token")];
    expect(await runGameTestViewport(runtime(broken), startAndMove, { width: 1280, height: 720 }, new Map()))
      .toMatchObject({ status: "failed", error: "While loading: console error: Uncaught SyntaxError: Unexpected token" });
  });

  it("says what the game needs for a seed or for its state", async () => {
    const game = new FakeGame();
    game.bridge = [];
    expect(await runGameTestViewport(runtime(game), { ...startAndMove, seed: 1 }, { width: 1280, height: 720 }, new Map()))
      .toMatchObject({ status: "failed", error: "This test sets a seed, but the game has no window.__OHMYGAME_PLAYTEST__.setSeed()." });
    const result = await runGameTestViewport(runtime(new FakeGame()), {
      ...startAndMove,
      steps: [{ expect: { state: { scene: "menu" } } }],
    }, { width: 1280, height: 720 }, new Map());
    expect(result.status).toBe("passed");
    const stateless = new FakeGame();
    stateless.bridge = [];
    const failed = await runGameTestViewport(runtime(stateless), { ...startAndMove, steps: [{ expect: { state: { scene: "menu" }, timeoutMs: 0 } }] }, { width: 1280, height: 720 }, new Map());
    expect(failed.steps[0]!.failures).toEqual(["state can't be checked: the game has no window.__OHMYGAME_PLAYTEST__.snapshot()"]);
  });

  it("fails when the frame doesn't change or the last one is blank", async () => {
    const game = new FakeGame();
    const result = await runGameTestViewport(runtime(game), {
      ...startAndMove,
      steps: [{ action: { type: "wait", milliseconds: 0 }, expect: { screenChanged: true } }],
    }, { width: 1280, height: 720 }, new Map());
    expect(result.steps[0]!.failures).toEqual(["the frame didn't change"]);

    const fading = new FakeGame();
    fading.onAction = () => { fading.blank = true; };
    const faded = await runGameTestViewport(runtime(fading), { ...startAndMove, steps: [{ action: { type: "wait", milliseconds: 0 } }] }, { width: 1280, height: 720 }, new Map());
    expect(faded.steps[0]!.failures).toEqual(["the frame looks blank"]);
  });

  it("reports a cancelled run and still closes its window", async () => {
    const game = new FakeGame();
    const controller = new AbortController();
    game.onAction = () => controller.abort();
    const result = await runGameTestViewport(runtime(game), startAndMove, { width: 1280, height: 720 }, new Map(), controller.signal);
    expect(result.status).toBe("cancelled");
    expect(game.requests.at(-1)).toEqual({ operation: "close", sessionId: "session-1" });
  });
});

/**
 * A two-player card table on one fake server: the host creates a room, the
 * guest joins with its code, and the host can deal once both are in.
 */
class FakeTable {
  readonly capabilities = WEB_GAME_USE_CAPABILITIES;
  readonly requests: Request[] = [];
  room?: { code: string; members: string[]; dealt: boolean };
  readonly logs = new Map<string, PlaytestLog[]>();
  #sessions = 0;
  /** What happens when the host deals, beyond dealing. */
  onDeal?: () => void;

  snapshot(sessionId: string): PlaytestSnapshot {
    const seat = this.room?.members.indexOf(sessionId) ?? -1;
    const host = seat === 0;
    const element = (testId: string, text: string) => ({ index: 0, tag: "button", testId, text, disabled: false, box: { x: 0, y: 0, width: 80, height: 30 } });
    return {
      sessionId,
      runtime: "web",
      capabilities: this.capabilities,
      url: "http://127.0.0.1:43210/",
      title: "Cards",
      readyState: "complete",
      viewport: { width: 1280, height: 720 },
      elements: seat < 0 ? [element("create-room", "Create room"), element("room-code", ""), element("join", "Join")]
        : host && !this.room!.dealt ? [element("deal", this.room!.members.length > 1 ? "Deal" : "Waiting for a second player")] : [],
      canvases: [],
      logs: [...this.logs.get(sessionId) ?? []],
      failedRequests: [],
      gameState: seat < 0 ? { scene: "lobby" } : {
        scene: this.room!.dealt ? "table" : "room",
        room: { code: this.room!.code, players: this.room!.members.length },
        hand: this.room!.dealt ? (host ? ["A♠", "K♥"] : ["2♣", "3♦"]) : [],
      },
      bridgeCapabilities: ["snapshot"],
    };
  }

  async request(request: Request): Promise<Result> {
    this.requests.push(request);
    switch (request.operation) {
      case "open": {
        const sessionId = `session-${++this.#sessions}`;
        return { operation: "open", snapshot: this.snapshot(sessionId) };
      }
      case "inspect": return { operation: "inspect", snapshot: this.snapshot(request.sessionId) };
      case "act": {
        let typed = "";
        for (const action of request.actions) {
          const testId = "target" in action && "testId" in action.target ? action.target.testId : undefined;
          if (action.type === "click" && testId === "create-room") this.room = { code: "QX7P", members: [request.sessionId], dealt: false };
          if (action.type === "type") typed = action.text;
          if (action.type === "click" && testId === "join" && this.room) this.room.members.push(request.sessionId);
          if (action.type === "click" && testId === "deal" && this.room && this.room.members.length > 1) {
            this.room.dealt = true;
            this.onDeal?.();
          }
        }
        if (typed && typed !== this.room?.code) this.logs.set(request.sessionId, [log(`No room ${typed}`)]);
        return { operation: "act", snapshot: this.snapshot(request.sessionId) };
      }
      case "capture":
        return {
          operation: "capture",
          capture: {
            sessionId: request.sessionId,
            mediaType: "image/jpeg",
            data: Buffer.from(JSON.stringify(this.snapshot(request.sessionId).gameState)).toString("base64"),
            width: 1280,
            height: 720,
            analysis: { sampledPixels: 100, opaqueRatio: 1, luminanceMean: 80, luminanceVariance: 20, likelyBlank: false },
          },
        };
      case "close": return { operation: "close" };
      default: throw new Error(`Unexpected ${request.operation}`);
    }
  }
}

function twoPlayersJoin(): GameTestScenario["steps"] {
  return [
    { player: 1, action: { type: "click", target: { testId: "create-room" } }, expect: { state: { scene: "room" } }, remember: { room: "room.code" } },
    { player: 2, action: { type: "type", target: { testId: "room-code" }, text: "{{room}}" } },
    { player: 2, action: { type: "click", target: { testId: "join" } }, expect: { state: { "room.players": 2 } } },
  ];
}

const twoPlayers: GameTestScenario = {
  schemaVersion: 1,
  name: "Two players deal",
  players: 2,
  steps: [
    { player: 1, action: { type: "click", target: { testId: "create-room" } }, expect: { state: { scene: "room" }, visible: [{ text: "Waiting for a second player" }] }, remember: { room: "room.code" } },
    { player: 2, action: { type: "type", target: { testId: "room-code" }, text: "{{room}}" } },
    { player: 2, action: { type: "click", target: { testId: "join" } }, expect: { state: { "room.players": 2 } } },
    { player: 1, action: { type: "click", target: { testId: "deal" } }, expect: { state: { scene: "table", hand: { contains: "A♠" } } } },
    { player: 2, expect: { state: { scene: "table", hand: { contains: "2♣" } } } },
  ],
};

/** Two snakes on one fake server: each moves while its player holds a key, and they crash if they meet. */
class FakeSnakes {
  readonly capabilities = WEB_GAME_USE_CAPABILITIES;
  readonly requests: Request[] = [];
  readonly snakes = new Map<string, { x: number; alive: boolean }>();
  #sessions = 0;

  snapshot(sessionId: string): PlaytestSnapshot {
    const others = [...this.snakes].filter(([id]) => id !== sessionId).map(([, snake]) => snake);
    return {
      sessionId, runtime: "web", capabilities: this.capabilities, url: "http://127.0.0.1:43210/", title: "Snakes", readyState: "complete",
      viewport: { width: 1280, height: 720 }, elements: [], canvases: [], logs: [], failedRequests: [],
      gameState: { me: this.snakes.get(sessionId), others },
      bridgeCapabilities: ["snapshot"],
    };
  }

  async request(request: Request): Promise<Result> {
    this.requests.push(request);
    switch (request.operation) {
      case "open": {
        const sessionId = `session-${++this.#sessions}`;
        this.snakes.set(sessionId, { x: this.#sessions === 1 ? 0 : 100, alive: true });
        return { operation: "open", snapshot: this.snapshot(sessionId) };
      }
      case "inspect": return { operation: "inspect", snapshot: this.snapshot(request.sessionId) };
      case "actTogether": {
        for (const player of request.players) {
          for (const action of player.actions) {
            if (action.type !== "press") continue;
            const snake = this.snakes.get(player.sessionId)!;
            snake.x += (action.key === "ArrowRight" ? 1 : -1) * (action.duration ?? 0) / 20;
          }
        }
        const [first, second] = [...this.snakes.values()];
        if (first!.x >= second!.x) first!.alive = second!.alive = false;
        return {
          operation: "actTogether",
          snapshots: request.players.map((player: { sessionId: string }) => this.snapshot(player.sessionId)),
          timing: { elapsedMs: 1000, players: request.players.map((player: { sessionId: string }) => ({ sessionId: player.sessionId, elapsedMs: 1000 })) },
        };
      }
      case "capture":
        return {
          operation: "capture",
          capture: {
            sessionId: request.sessionId, mediaType: "image/jpeg",
            data: Buffer.from(JSON.stringify(this.snapshot(request.sessionId).gameState)).toString("base64"), width: 1280, height: 720,
            analysis: { sampledPixels: 100, opaqueRatio: 1, luminanceMean: 80, luminanceVariance: 20, likelyBlank: false },
          },
        };
      case "close": return { operation: "close" };
      default: throw new Error(`Unexpected ${request.operation}`);
    }
  }
}

describe("a real-time multiplayer game test", () => {
  const hold = (player: number, key: string, duration: number) => ({ player, actions: [{ type: "press" as const, key, duration }] });

  it("gives players input at the same moment and checks each of them", async () => {
    const snakes = new FakeSnakes();
    const result = await runGameTestViewport(runtime(snakes), {
      schemaVersion: 1,
      name: "Snakes pass by",
      players: 2,
      steps: [
        { together: [hold(1, "ArrowRight", 400), hold(2, "ArrowLeft", 400)], expect: { state: { "me.alive": true }, screenChanged: true } },
        { player: 1, expect: { state: { "me.x": { gt: 10 } } } },
      ],
    }, { width: 1280, height: 720 }, new Map());

    expect(result.status).toBe("passed");
    expect(result.steps[0]).toMatchObject({ together: [1, 2], status: "passed" });
    expect(snakes.requests).toContainEqual({
      operation: "actTogether",
      players: [
        { sessionId: "session-1", actions: [{ type: "press", key: "ArrowRight", duration: 400 }] },
        { sessionId: "session-2", actions: [{ type: "press", key: "ArrowLeft", duration: 400 }] },
      ],
    });
  });

  it("says which players failed when they act together", async () => {
    const snakes = new FakeSnakes();
    const result = await runGameTestViewport(runtime(snakes), {
      schemaVersion: 1,
      name: "Snakes crash",
      players: 2,
      steps: [{ together: [hold(1, "ArrowRight", 1200), hold(2, "ArrowLeft", 1200)], expect: { state: { "me.alive": true }, timeoutMs: 0 } }],
    }, { width: 1280, height: 720 }, new Map());

    expect(result.steps[0]).toMatchObject({
      together: [1, 2],
      status: "failed",
      failures: ["player 1: state me.alive is false, expected true", "player 2: state me.alive is false, expected true"],
    });
    expect(gameTestSummary({ id: "r", status: "failed", source: "agent", startedAt: "", files: ["s.json"], scenarios: [{ file: "s.json", name: "Snakes crash", status: "failed", viewports: [result] }] }))
      .toContain("step 1 (players 1 and 2 together): player 1: state me.alive is false");
  });
});

describe("a multiplayer game test", () => {
  it("plays each player in their own window and passes remembered values between them", async () => {
    const table = new FakeTable();
    const result = await runGameTestViewport(runtime(table), twoPlayers, { width: 1280, height: 720 }, new Map());

    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => step.player)).toEqual([1, 2, 2, 1, 2]);
    expect(table.requests.filter((request) => request.operation === "open")).toHaveLength(2);
    expect(table.requests).toContainEqual({ operation: "act", sessionId: "session-2", actions: [{ type: "type", target: { testId: "room-code" }, text: "QX7P" }] });
    expect(table.requests.filter((request) => request.operation === "close").map((request) => request.sessionId as string).sort()).toEqual(["session-1", "session-2"]);
  });

  it("says which player a step failed for", async () => {
    const table = new FakeTable();
    const result = await runGameTestViewport(runtime(table), {
      ...twoPlayers,
      steps: [twoPlayers.steps[0]!, { player: 2, expect: { state: { scene: "table" }, timeoutMs: 0 } }],
    }, { width: 1280, height: 720 }, new Map());
    expect(result.steps[1]).toMatchObject({ player: 2, status: "failed", failures: ['state scene is "lobby", expected "table"'] });
    expect(gameTestSummary({ id: "r", status: "failed", source: "agent", startedAt: "", files: ["t.json"], scenarios: [{ file: "t.json", name: "Two players deal", status: "failed", viewports: [result] }] }))
      .toContain('FAILED t.json "Two players deal" at 1280x720: step 2 (player 2): state scene is "lobby", expected "table"');
  });

  it("fails a step when another player's game errs", async () => {
    const table = new FakeTable();
    table.onDeal = () => table.logs.set("session-2", [log("Uncaught TypeError: hand is undefined")]);
    const result = await runGameTestViewport(runtime(table), twoPlayers, { width: 1280, height: 720 }, new Map());
    expect(result.steps[3]).toMatchObject({ player: 1, status: "failed", failures: ["player 2: console error: Uncaught TypeError: hand is undefined"] });
    expect(result.logs).toEqual([expect.objectContaining({ message: "Uncaught TypeError: hand is undefined" })]);
  });

  it("can't remember what the state doesn't hold", async () => {
    const result = await runGameTestViewport(runtime(new FakeTable()), {
      ...twoPlayers,
      steps: [{ player: 1, remember: { room: "room.code" } }],
    }, { width: 1280, height: 720 }, new Map());
    expect(result.steps[0]!.failures).toEqual(["can't remember room: state room.code is missing"]);
  });
});

describe("checks and values", () => {
  it("checks whether a control can be used", async () => {
    const game = new FakeGame();
    game.startDisabled = true;
    const scenario = (expect: object): GameTestScenario => ({ ...startAndMove, steps: [{ expect: { ...expect, timeoutMs: 0 } }] });
    expect((await runGameTestViewport(runtime(game), scenario({ disabled: [{ role: "button", name: "Start" }] }), { width: 1280, height: 720 }, new Map())).status).toBe("passed");
    const enabled = await runGameTestViewport(runtime(game), scenario({ enabled: [{ role: "button", name: "Start" }, { testId: "hud" }] }), { width: 1280, height: 720 }, new Map());
    expect(enabled.steps[0]!.failures).toEqual(['button "Start" is disabled', 'testId "hud" isn\'t visible']);
  });

  it("uses remembered values in checks, keeping a number a number", async () => {
    const game = new FakeGame();
    const scenario = parseGameTest(JSON.stringify({
      ...startAndMove,
      steps: [
        { remember: { start: "x", scene: "scene" } },
        { action: { type: "press", key: "ArrowRight", duration: 0 }, expect: { state: { x: "{{start}}", scene: { ne: "level-{{scene}}" } }, hidden: [{ text: "{{scene}}-gone" }] } },
        { action: { type: "press", key: "ArrowRight", duration: 100 }, expect: { state: { x: { gt: "{{start}}" } }, timeoutMs: 0 } },
      ],
    }));
    const result = await runGameTestViewport(runtime(game), scenario, { width: 1280, height: 720 }, new Map());
    expect(result.steps.slice(0, 2).map((step) => step.status)).toEqual(["passed", "passed"]);
    // An operand is not a number until it is replaced, so { gt: "{{start}}" } compares with the number it held.
    expect(result.steps[2]).toMatchObject({ status: "passed" });
  });
});

describe("refreshing and going off line", () => {
  it("reloads a player's page and takes them off and on line", async () => {
    const game = new FakeGame();
    const result = await runGameTestViewport(runtime(game), {
      ...startAndMove,
      steps: [
        { action: { type: "click", target: { role: "button", name: "Start" } }, expect: { state: { scene: "level1" } } },
        { action: { type: "offline" }, expect: { state: { online: false } } },
        { action: { type: "online" }, expect: { state: { online: true } } },
        { action: { type: "reload" }, expect: { state: { reloads: 1, scene: "menu" } } },
      ],
    }, { width: 1280, height: 720 }, new Map());

    expect(result.status).toBe("passed");
    expect(game.requests[0]).toMatchObject({ operation: "open", networkControl: true });
    expect(game.requests).toContainEqual({ operation: "network", sessionId: "session-1", online: false });
    expect(game.requests).toContainEqual({ operation: "reload", sessionId: "session-1" });
  });

  it("expects requests to fail while a player is off line, and the game's own errors not to", async () => {
    const game = new FakeGame();
    game.onAction = () => {};
    const original = game.request.bind(game);
    game.request = async (request) => {
      const result = await original(request);
      if (request.operation === "network" && !request.online) {
        game.failedRequests.push({ url: "http://127.0.0.1:43210/poll", error: "net::ERR_SOCKS_CONNECTION_FAILED", timestamp: new Date().toISOString() });
      }
      return result;
    };
    const passed = await runGameTestViewport(runtime(game), { ...startAndMove, steps: [{ action: { type: "offline" } }, { action: { type: "online" } }] }, { width: 1280, height: 720 }, new Map());
    expect(passed.status).toBe("passed");

    const crashing = new FakeGame();
    const network = crashing.request.bind(crashing);
    crashing.request = async (request) => {
      const result = await network(request);
      if (request.operation === "network" && !request.online) crashing.logs.push(log("Uncaught TypeError: socket is null"));
      return result;
    };
    const failed = await runGameTestViewport(runtime(crashing), { ...startAndMove, steps: [{ action: { type: "offline" } }] }, { width: 1280, height: 720 }, new Map());
    expect(failed.steps[0]!.failures).toEqual(["console error: Uncaught TypeError: socket is null"]);
  });

  it("opens the game without network control when a test stays on line", async () => {
    const game = new FakeGame();
    await runGameTestViewport(runtime(game), { ...startAndMove, steps: [{ action: { type: "reload" } }] }, { width: 1280, height: 720 }, new Map());
    expect(game.requests[0]).not.toHaveProperty("networkControl");
  });
});

describe("shared setup", () => {
  const joined = { schemaVersion: 1, name: "Two players in one room", players: 2, steps: twoPlayersJoin() };

  it("is read from tests/game/setup/ and says what is wrong with it", () => {
    const setup = parseGameTestSetup(JSON.stringify(joined));
    expect(setup).toMatchObject({ name: "Two players in one room", players: 2, remembered: new Set(["room"]) });
    expect(() => parseGameTestSetup(JSON.stringify({ ...joined, viewports: [] }))).toThrow('"viewports" isn\'t a setup field');
    const setups = new Map<string, GameTestSetup | GameTestError>([["two-players.json", setup], ["broken.json", new GameTestError('"steps" must list 1 to 100 steps.')]]);
    expect(() => parseGameTest(JSON.stringify({ ...startAndMove, setup: "two-players" }), setups)).toThrow('"setup" two-players needs 2 players; set "players" to at least 2.');
    expect(() => parseGameTest(JSON.stringify({ ...startAndMove, setup: "broken.json" }), setups)).toThrow("which can't be used: \"steps\" must list 1 to 100 steps.");
    // What the setup remembers, the test can use.
    const scenario = parseGameTest(JSON.stringify({ schemaVersion: 1, name: "Deal", players: 2, setup: "two-players", steps: [{ player: 2, expect: { state: { "room.code": "{{room}}" } } }] }), setups);
    expect(scenario.setupSteps).toHaveLength(3);
  });

  it("runs the setup's steps first and counts them apart", async () => {
    const setup = parseGameTestSetup(JSON.stringify(joined));
    const scenario = parseGameTest(JSON.stringify({ schemaVersion: 1, name: "Deal", players: 2, setup: "two-players", steps: [
      { player: 1, action: { type: "click", target: { testId: "deal" } }, expect: { state: { scene: "table" } } },
      { player: 2, expect: { state: { scene: "table", "room.code": "{{room}}" }, timeoutMs: 0 } },
    ] }), new Map([["two-players.json", setup]]));
    const result = await runGameTestViewport(runtime(new FakeTable()), scenario, { width: 1280, height: 720 }, new Map());

    expect(result.status).toBe("passed");
    expect(result.steps.map((step) => [step.setup ?? false, step.index])).toEqual([[true, 0], [true, 1], [true, 2], [false, 0], [false, 1]]);
  });

  it("names a failed setup step as one", () => {
    const run = { id: "r", status: "failed" as const, source: "agent" as const, startedAt: "", files: ["t.json"], scenarios: [{
      file: "t.json", name: "Deal", status: "failed" as const,
      viewports: [{ viewport: { width: 1280, height: 720 }, status: "failed" as const, steps: [{ index: 2, setup: true, player: 2, status: "failed" as const, failures: ["state room.players is 1, expected 2"], durationMs: 1 }] }],
    }] };
    expect(gameTestSummary(run)).toContain("setup step 3 (player 2): state room.players is 1, expected 2");
  });

  it("is listed with the test, not as one", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "game-tests-"));
    try {
      await mkdir(path.join(workspace, "tests", "game", "setup"), { recursive: true });
      await writeFile(path.join(workspace, "tests", "game", "setup", "two-players.json"), JSON.stringify(joined));
      await writeFile(path.join(workspace, "tests", "game", "deal.json"), JSON.stringify({ schemaVersion: 1, name: "Deal", players: 2, setup: "two-players", steps: [{ player: 1, expect: { state: { scene: "room" } } }] }));
      const entries = await readGameTests(workspace);
      expect(entries.map((entry) => entry.file)).toEqual([{ file: "deal.json", name: "Deal", steps: 4, players: 2, viewports: [{ width: 1280, height: 720 }] }]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe("a project's game tests", () => {
  let workspace: string;
  afterEach(async () => { await rm(workspace, { recursive: true, force: true }); });

  async function setUp(files: Record<string, string>, game: PluginGame | null = runtime(new FakeGame())) {
    workspace = await mkdtemp(path.join(tmpdir(), "game-tests-"));
    await mkdir(path.join(workspace, "tests", "game"), { recursive: true });
    for (const [name, text] of Object.entries(files)) await writeFile(path.join(workspace, "tests", "game", name), text);
    const changes: GameTestRun[] = [];
    const tests = new GameTests(workspace, game ?? undefined, { onChange: (run) => changes.push(run) });
    return { changes, tests };
  }

  it("runs every test at each size and reports its progress", async () => {
    const { changes, tests } = await setUp({
      "move.json": JSON.stringify({ ...startAndMove, viewports: [{ width: 1280, height: 720 }, { width: 390, height: 844 }] }),
      "broken.json": "{}",
    });
    const run = await tests.run({ source: "agent" });

    expect(run.status).toBe("failed");
    expect(run.source).toBe("agent");
    expect(run.scenarios).toEqual([
      expect.objectContaining({ file: "broken.json", status: "failed", error: '"schemaVersion" must be 1.', viewports: [] }),
      expect.objectContaining({ file: "move.json", status: "passed", viewports: [expect.objectContaining({ status: "passed" }), expect.objectContaining({ status: "passed" })] }),
    ]);
    expect(changes[0]!.status).toBe("running");
    expect(changes.at(-1)).toEqual(run);
    expect((await tests.state()).run).toEqual(run);
    const captureId = run.scenarios[1]!.viewports[0]!.steps.at(-1)!.captureId!;
    expect(tests.capture(run.id, captureId)?.mediaType).toBe("image/jpeg");
    expect(tests.capture("another-run", captureId)).toBeUndefined();
  });

  it("runs only the files asked for and says which don't exist", async () => {
    const { tests } = await setUp({ "a.json": JSON.stringify(startAndMove), "b.json": JSON.stringify(startAndMove) });
    const run = await tests.run({ files: ["b.json"], source: "person" });
    expect(run.scenarios.map((scenario) => scenario.file)).toEqual(["b.json"]);
    expect(run.files).toEqual(["b.json"]);
    await expect(tests.start({ files: ["c.json"], source: "person" })).rejects.toThrow("No game test named c.json in tests/game/.");
  });

  it("can't run without tests or the game", async () => {
    const { tests } = await setUp({});
    await expect(tests.start({ source: "person" })).rejects.toThrow("This project has no game tests.");
    const { tests: blind } = await setUp({ "a.json": JSON.stringify(startAndMove) }, null);
    await expect(blind.start({ source: "person" })).rejects.toThrow(GameTestError);
  });

  it("cancels a run when another starts", async () => {
    let opening = 0;
    const fake = new FakeGame();
    const request = fake.request.bind(fake);
    // The first run waits for its game to open until it is cancelled.
    fake.request = (body, signal?: AbortSignal) => body.operation === "open" && opening++ === 0
      ? new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)))
      : request(body);
    const { tests } = await setUp({ "a.json": JSON.stringify(startAndMove) }, runtime(fake));
    const first = tests.run({ source: "agent" });
    await vi.waitFor(() => expect(opening).toBe(1));
    const second = await tests.run({ source: "person" });
    expect((await first).status).toBe("cancelled");
    expect(second.status).toBe("passed");
  });
});
