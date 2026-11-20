import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import type { GameRuntimeAdapter, PlaytestRequest, PlaytestResult, PlaytestSnapshot } from "../app/src/shared/playtest.js";

// The built plugin in the app's own extension host, its context.game answered
// by the app's bridge in front of a fake web game: what the plugin asks the app
// for is what the app takes.

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (file: string) => import(pathToFileURL(path.join(app, file)).href);
const pluginRoot = fileURLToPath(new URL("../plugins/game-tests", import.meta.url));

/** Two players on one fake server: each sees who is on line, and a page reloaded keeps its seat. */
function server(): GameRuntimeAdapter & { requests: PlaytestRequest[] } {
  const requests: PlaytestRequest[] = [];
  const online = new Map<string, boolean>();
  let sessions = 0;
  const snapshot = (sessionId: string): PlaytestSnapshot => ({
    sessionId, runtime: "web", capabilities: WEB, url: "http://127.0.0.1:43210/", title: "Cards", readyState: "complete",
    viewport: { width: 1280, height: 720 }, elements: [], canvases: [], logs: [], failedRequests: [],
    gameState: { seat: Number(sessionId.split("-")[1]), othersOnline: [...online].filter(([id]) => id !== sessionId).every(([, value]) => value) },
    bridgeCapabilities: ["snapshot"],
  });
  return {
    available: true,
    get capabilities() { return WEB; },
    close: () => {},
    requests,
    async request(request): Promise<PlaytestResult> {
      requests.push(request);
      switch (request.operation) {
        case "open": {
          const sessionId = `session-${++sessions}`;
          online.set(sessionId, true);
          return { operation: "open", snapshot: snapshot(sessionId) };
        }
        case "inspect":
        case "act":
          return { operation: request.operation, snapshot: snapshot(request.sessionId) } as PlaytestResult;
        case "reload":
          return { operation: "reload", snapshot: snapshot(request.sessionId) };
        case "network":
          online.set(request.sessionId, request.online);
          return { operation: "network", snapshot: snapshot(request.sessionId) };
        case "actTogether":
          return { operation: "actTogether", snapshots: request.players.map((player) => snapshot(player.sessionId)), timing: { elapsedMs: 1, players: [] } };
        case "capture":
          return { operation: "capture", capture: { sessionId: request.sessionId, mediaType: "image/jpeg", data: Buffer.from(JSON.stringify(snapshot(request.sessionId).gameState)).toString("base64"), width: 1280, height: 720, analysis: { sampledPixels: 100, opaqueRatio: 1, luminanceMean: 80, luminanceVariance: 20, likelyBlank: false } } };
        case "close":
          online.delete(request.sessionId);
          return { operation: "close" };
        default:
          throw new Error(`Unexpected ${request.operation}`);
      }
    },
  };
}
let WEB: GameRuntimeAdapter["capabilities"];

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

it("plays a multiplayer test through the app's host and bridge", { timeout: 60_000 }, async () => {
  const [{ ExtensionHosts }, { PluginGameBridge }, playtest] = await Promise.all([
    load("src/daemon/extension-hosts.ts"),
    load("src/daemon/plugin-game-bridge.ts"),
    load("src/shared/playtest.ts"),
  ]);
  WEB = playtest.WEB_GAME_USE_CAPABILITIES;
  const folder = await mkdtemp(path.join(tmpdir(), "game-tests-host-"));
  cleanup.push(() => rm(folder, { recursive: true, force: true }));
  await mkdir(path.join(folder, "tests", "game"), { recursive: true });
  await writeFile(path.join(folder, "tests", "game", "reconnect.json"), JSON.stringify({
    schemaVersion: 1,
    name: "A player who drops comes back to their seat",
    path: "/?table=1",
    players: 2,
    steps: [
      { together: [{ player: 1, actions: [{ type: "wait", milliseconds: 1 }] }, { player: 2, actions: [{ type: "wait", milliseconds: 1 }] }] },
      { player: 2, action: { type: "offline" } },
      { player: 1, expect: { state: { othersOnline: false } } },
      { player: 2, action: { type: "online" } },
      { player: 1, expect: { state: { othersOnline: true } } },
      { player: 2, action: { type: "reload" }, expect: { state: { seat: 2 } } },
    ],
  }));

  const game = server();
  const bridge = new PluginGameBridge(async () => ({ runtime: game, target: async () => ({ runtime: "web", url: "http://127.0.0.1:43210/" }) }));
  const hosts = new ExtensionHosts({ callTimeoutMs: 30_000 });
  cleanup.push(() => hosts.dispose?.() ?? Promise.resolve());
  cleanup.push(() => bridge.close());
  hosts.serveGame({
    handle: (caller: { scope: string; plugin: string; generation: number }, request: unknown, signal: AbortSignal) =>
      bridge.handle({ folder: caller.scope, plugin: caller.plugin, generation: caller.generation }, request, signal),
    release: () => {},
  });
  const plugin = {
    id: "ohmygame/game-tests",
    version: "0.1.0",
    root: pluginRoot,
    entry: "dist/index.mjs",
    dataFolder: path.join(folder, ".data"),
    tools: ["game_test"],
    commands: ["state", "run", "cancel", "capture", "unitRun", "unitCancel"],
    projectTypes: [],
    game: true,
    hooks: [],
  };

  const summary = await hosts.invoke({ scope: folder, project: folder, plugin, tool: "game_test", input: { operation: "run" } });
  assert.match(summary, /1 of 1 game tests passed\./);
  // What the plugin asked for reached the game as the app sends it on.
  const opened = game.requests.filter((request) => request.operation === "open");
  assert.equal(opened.length, 2);
  for (const request of opened) assert.deepEqual([request.target, request.networkControl], [{ runtime: "web", url: "http://127.0.0.1:43210/?table=1" }, true]);
  const wait = [{ type: "wait", milliseconds: 1 }];
  assert.deepEqual(game.requests.find((request) => request.operation === "actTogether"), { operation: "actTogether", players: [{ sessionId: "session-1", actions: wait }, { sessionId: "session-2", actions: wait }] });
  assert.deepEqual(game.requests.find((request) => request.operation === "network"), { operation: "network", sessionId: "session-2", online: false });
  assert.deepEqual(game.requests.find((request) => request.operation === "reload"), { operation: "reload", sessionId: "session-2" });
  assert.equal(game.requests.filter((request) => request.operation === "close").length, 2);
});
