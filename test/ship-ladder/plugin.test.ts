import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The panel's helpers are plain JavaScript.
import { FALLBACK_PROMPT, STARTER_PROMPT } from "../../plugins/ship-ladder/panel/format.js";
import { activate, JAM_NOTICE } from "../../plugins/ship-ladder/src/index.ts";

const PLUGIN = path.resolve("plugins/ship-ladder");
const read = async (file: string) => JSON.parse(await readFile(path.join(PLUGIN, file), "utf8"));

const folders: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});
const temp = async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "ship-ladder-"));
  folders.push(folder);
  return folder;
};

type Handler = (input: unknown, call?: unknown) => unknown;
async function host({ plan, game }: { plan?: unknown; game?: unknown } = {}) {
  const project = await temp();
  const dataFolder = await temp();
  if (plan !== undefined) {
    await mkdir(path.join(project, "design"), { recursive: true });
    await writeFile(path.join(project, "design/ship.json"), typeof plan === "string" ? plan : JSON.stringify(plan));
  }
  const commands = new Map<string, Handler>();
  const hooks = new Map<string, Handler>();
  const panels = { open: vi.fn(async () => {}) };
  activate({
    pluginId: "ohmygame/ship-ladder",
    version: "0.1.0",
    project: { folder: project },
    dataFolder,
    game,
    panels,
    registerCommand: (name: string, handler: Handler) => (commands.set(name, handler), { dispose() {} }),
    registerHook: (name: string, handler: Handler) => (hooks.set(name, handler), { dispose() {} }),
  } as never);
  const call = { signal: new AbortController().signal, progress: vi.fn() };
  return {
    commands,
    hooks,
    panels,
    run: (name: string, input?: unknown) => commands.get(name)!(input, call) as Promise<any>,
    hear: (name: string, input: unknown) => hooks.get(name)!(input) as Promise<any>,
  };
}
const testResult = (text: string, args: Record<string, unknown> = {}) => ({ callId: "c", tool: "game_test", args, source: "agent", status: "succeeded", text });

describe("the ship-ladder plugin", () => {
  it("declares what it uses and nothing more", async () => {
    const manifest = await read(".ohmygame-plugin/plugin.json");
    expect(manifest.capabilities).toEqual({ native: true, game: true, composer: true, "project.files": "write" });
    expect(manifest.contributes.hooks).toEqual(["tool.afterCall", "turn.completed"]);
    expect(manifest.projectFiles).toEqual(["./design/ship.json"]);
    const commands = Object.fromEntries(manifest.contributes.commands.map((command: { id: string }) => [command.id, command]));
    expect(Object.keys(commands)).toEqual(["starter", "open", "state", "check", "mark"]);
    for (const id of ["state", "check", "mark"]) expect(commands[id].run.changesFiles).toBe(false);
    expect(commands.starter.slots).toEqual([{ slot: "home.starters" }]);
    // The panel puts the same request in the composer as the Home starter.
    expect(commands.starter.run.prompt).toBe(STARTER_PROMPT);
    expect(FALLBACK_PROMPT).toMatch(/^The jam deadline is close\./);
    expect((await read("package.json")).version).toBe(manifest.version);
  });

  it("tells the agent to keep to the plan without adding approval stops", async () => {
    const { instructions } = (await read(".ohmygame-plugin/plugin.json")).contributes;
    expect(instructions).toContain("design/ship.json");
    expect(instructions).toContain("Don't stop to ask for approval");
    expect(instructions).not.toMatch(/ask (the person|the user|them) (first|before)|wait for (approval|confirmation)/i);
  });

  it("has every text the manifest names in both languages", async () => {
    const keys = [...JSON.stringify(await read(".ohmygame-plugin/plugin.json")).matchAll(/%([\w.]+)%/g)].map((match) => match[1]);
    const en = await read("locales/en.json");
    const zh = await read("locales/zh-CN.json");
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of keys) expect(en[key] && zh[key], key).toBeTruthy();
  });

  it("gives the plan, its problems and an open ladder", async () => {
    const plugin = await host({ plan: { shipDate: "2026-12-11", platforms: ["itch.io"], core: "Draw one wall per wave", notDoing: ["online"], jam: { deadline: "nope" } } });
    const view = await plugin.run("state");
    expect(view.plan).toEqual({ shipDate: "2026-12-11", platforms: ["itch.io"], core: "Draw one wall per wave", notDoing: ["online"] });
    expect(view.problems).toHaveLength(1);
    expect(view.ladder.map((rung: { verdict: string }) => rung.verdict)).toEqual(["open", "open", "open"]);
    expect((await (await host()).run("state")).plan).toBeNull();
  });

  it("takes the game's start from Game Tests' runs, not from listing them or an answer it can't read", async () => {
    const plugin = await host();
    await plugin.hear("tool.afterCall", testResult("2 of 2 game tests passed."));
    expect((await plugin.run("state")).ladder[0]).toMatchObject({ verdict: "passed", judgement: { source: "game-tests" } });
    await plugin.hear("tool.afterCall", testResult('a.json: "A", 3 steps', { operation: "list" }));
    await plugin.hear("tool.afterCall", { ...testResult("2 of 2 game tests passed."), truncated: true });
    await plugin.hear("tool.afterCall", { ...testResult("ok"), tool: "game_use" });
    expect((await plugin.run("state")).ladder[0].verdict).toBe("passed");
    await plugin.hear("tool.afterCall", testResult('1 of 2 game tests passed.\nFAILED b.json "B" at 390x844: step 1: no canvas'));
    expect((await plugin.run("state")).ladder[0]).toMatchObject({ verdict: "failed", judgement: { detail: 'b.json "B" at 390x844: step 1: no canvas' } });
  });

  it("reminds once at the first turn in a jam's last day, opening the panel", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-06T10:00:00Z"));
    const plugin = await host({ plan: { jam: { deadline: "2026-12-07T15:00:00Z" } } });
    expect(await plugin.hear("turn.completed", { conversationId: "c", status: "completed", changes: [] })).toBeUndefined();
    vi.setSystemTime(new Date("2026-12-06T16:00:00Z"));
    expect(await plugin.hear("turn.completed", { conversationId: "c", status: "completed", changes: [] })).toEqual({ notice: JAM_NOTICE, tone: "danger" });
    expect(plugin.panels.open).toHaveBeenCalledWith("ladder", { state: { jamAlert: true } });
    expect(await plugin.hear("turn.completed", { conversationId: "c", status: "completed", changes: [] })).toBeUndefined();
    expect(plugin.panels.open).toHaveBeenCalledTimes(1);
    expect(JAM_NOTICE.length).toBeLessThanOrEqual(300);
  });

  it("ticks and unticks the rungs a person judges, and only those", async () => {
    const plugin = await host();
    expect((await plugin.run("mark", { rung: "loop", done: true })).ladder[2]).toMatchObject({ verdict: "passed", judgement: { source: "person" } });
    expect((await plugin.run("mark", { rung: "loop", done: false })).ladder[2].verdict).toBe("open");
    await expect(plugin.run("mark", { rung: "starts", done: true })).rejects.toThrow(/by hand/);
  });

  it("checks the game starts, then plays the core probe", async () => {
    const snapshot = (score: number) => ({
      readyState: "complete", url: "http://127.0.0.1/", logs: [], failedRequests: [], gameState: { score },
      canvases: [{ index: 0, width: 1, height: 1, box: { x: 0, y: 0, width: 1, height: 1 }, visible: true }],
    });
    let score = 0;
    const session = {
      inspect: async () => snapshot(score),
      act: async (actions: { type: string }[]) => {
        if (actions[0]!.type === "press") score = 5;
        return snapshot(score);
      },
      capture: async () => ({ analysis: { likelyBlank: false } }),
      close: async () => {},
    };
    const plugin = await host({
      plan: { core: "Jump", coreProbe: { actions: [{ type: "press", key: "Space" }], state: "score" } },
      game: { open: async () => session },
    });
    const view = await plugin.run("check");
    expect(view.ladder.slice(0, 2).map((rung: { verdict: string; judgement: { source: string } }) => [rung.verdict, rung.judgement.source])).toEqual([
      ["passed", "check"],
      ["passed", "probe"],
    ]);
    expect(view.canProbe).toBe(true);
  });

  it("says when the game can't be opened", async () => {
    await expect((await host()).run("check")).rejects.toThrow(/can't be opened/);
  });
});
