import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginContext, PluginGame, ToolCall, ToolHandler } from "../../app/src/shared/extension-host-protocol.js";
import { activate } from "../../plugins/game-tests/src/index.ts";
import { WEB_GAME_USE_CAPABILITIES } from "../../app/src/shared/playtest.js";

/** A game whose one screen shows a score, and its frames. */
function game(): PluginGame {
  const snapshot = (id: string) => ({
    sessionId: id, runtime: "web" as const, capabilities: WEB_GAME_USE_CAPABILITIES, url: "http://127.0.0.1/", title: "Game", readyState: "complete",
    viewport: { width: 1280, height: 720 }, elements: [], canvases: [], logs: [], failedRequests: [], gameState: { score: 10 }, bridgeCapabilities: ["snapshot"],
  });
  const capture = { sessionId: "s1", mediaType: "image/jpeg" as const, data: "ZnJhbWU=", width: 1280, height: 720, analysis: { sampledPixels: 1, opaqueRatio: 1, luminanceMean: 80, luminanceVariance: 20, likelyBlank: false } };
  return {
    open: async () => ({
      id: "s1", capabilities: WEB_GAME_USE_CAPABILITIES, snapshot: snapshot("s1"),
      inspect: async () => snapshot("s1"), act: async () => snapshot("s1"), capture: async () => capture,
      captureFrame: async () => capture, recordStart: async () => ({ maxSeconds: 60 }), recordStop: async () => { throw new Error("no"); },
      reload: async () => snapshot("s1"), setOnline: async () => snapshot("s1"), close: async () => {},
    }),
    actTogether: async () => [],
  } as never;
}

describe("the plugin", () => {
  let folder: string;
  afterEach(() => rm(folder, { recursive: true, force: true }));

  async function start(tests: Record<string, unknown>) {
    folder = await mkdtemp(path.join(tmpdir(), "game-tests-plugin-"));
    await mkdir(path.join(folder, "tests", "game"), { recursive: true });
    for (const [name, value] of Object.entries(tests)) await writeFile(path.join(folder, "tests", "game", name), JSON.stringify(value));
    const tools = new Map<string, ToolHandler>();
    const commands = new Map<string, ToolHandler>();
    const context = {
      pluginId: "ohmygame/game-tests", version: "0.1.0", project: { folder }, dataFolder: folder, configuration: {},
      game: game(),
      registerTool: (name: string, handler: ToolHandler) => { tools.set(name, handler); return { dispose() {} }; },
      registerCommand: (name: string, handler: ToolHandler) => { commands.set(name, handler); return { dispose() {} }; },
      onDispose: () => {},
    } as unknown as PluginContext;
    activate(context);
    const progress: string[] = [];
    const call = { signal: new AbortController().signal, progress: (message: string) => progress.push(message), configuration: {} } as ToolCall;
    return { tools, commands, call, progress };
  }

  const score = (value: number) => ({ schemaVersion: 1, name: `Score is ${value}`, steps: [{ expect: { state: { score: value }, timeoutMs: 0 } }] });

  it("lists and runs the tests for the agent, and says how it went", async () => {
    const { tools, call, progress } = await start({ "a.json": score(10), "b.json": score(20) });
    const tool = tools.get("game_test")!;
    expect(await tool({ operation: "list" }, call)).toBe('a.json: "Score is 10", 1 steps\nb.json: "Score is 20", 1 steps');
    const summary = await tool({ operation: "run" }, call);
    expect(summary).toContain("1 of 2 game tests passed.");
    expect(summary).toContain('FAILED b.json "Score is 20" at 1280x720: step 1: state score is 10, expected 20');
    expect(summary).toContain("The Automated tests panel shows the frame");
    expect(progress).toContain("Running 2 of 2");
  });

  it("gives the panel the agent's run, its frames and the unit tests", async () => {
    const { tools, commands, call } = await start({ "a.json": score(10) });
    await tools.get("game_test")!({ operation: "run", files: ["a.json"] }, call);
    const state = (await commands.get("state")!(undefined, call)) as { game: { run: { id: string; source: string; scenarios: { viewports: { steps: { captureId?: string }[] }[] }[] } }; unit: object };
    expect(state.game.run.source).toBe("agent");
    expect(state.unit).toEqual({});
    const captureId = state.game.run.scenarios[0]!.viewports[0]!.steps[0]!.captureId!;
    expect(await commands.get("capture")!({ runId: state.game.run.id, captureId }, call)).toEqual({ mediaType: "image/jpeg", data: "ZnJhbWU=" });
    expect(await commands.get("capture")!({ runId: "old", captureId }, call)).toBeNull();
    // A test's steps, for its details.
    expect(await commands.get("detail")!({ file: "a.json" }, call)).toMatchObject({ name: "Score is 10", steps: [{ expect: { state: { score: 10 } } }] });
    expect(await commands.get("detail")!({ file: "missing.json" }, call)).toBeNull();
  });

  it("says plainly why a run can't start", async () => {
    const { commands, tools, call } = await start({});
    await expect(commands.get("run")!({}, call)).rejects.toThrow("This project has no game tests.");
    await expect(commands.get("unitRun")!(undefined, call)).rejects.toThrow('its package.json has no "test" script');
    expect(await tools.get("game_test")!({ operation: "list" }, call)).toContain("The game-tests skill says what to test");
  });
});
