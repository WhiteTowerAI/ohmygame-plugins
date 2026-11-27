import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activate, BUSY, readReport, reportFile } from "../../plugins/launch-check/src/index.ts";
import { build, viteDefault } from "./fixtures.ts";

const PLUGIN = path.resolve("plugins/launch-check");
const read = async (file: string) => JSON.parse(await readFile(path.join(PLUGIN, file), "utf8"));

type Handler = (input: unknown, call: { build?: { folder: string }; progress: (message: string) => void }) => unknown;
function host(projectFolder: string, dataFolder: string) {
  const commands = new Map<string, Handler>();
  activate({
    pluginId: "ohmygame/launch-check",
    version: "0.1.0",
    project: { folder: projectFolder },
    dataFolder,
    registerCommand: (name: string, handler: Handler) => {
      commands.set(name, handler);
      return { dispose() {} };
    },
  } as never);
  const progress: string[] = [];
  return {
    names: [...commands.keys()],
    run: (name: string, build?: string) => commands.get(name)!(undefined, { build: build ? { folder: build } : undefined, progress: (message) => progress.push(message) }),
    progress,
  };
}

const data: string[] = [];
afterEach(async () => {
  await Promise.all(data.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("the launch-check plugin", () => {
  it("declares a read-only scan that gets a web build, and an entry in the Publish menu", async () => {
    const manifest = await read(".ohmygame-plugin/plugin.json");
    const commands = Object.fromEntries(manifest.contributes.commands.map((command: { id: string }) => [command.id, command]));
    expect(commands.scan.run).toEqual({ native: "scan", build: "web", changesFiles: false, timeoutSeconds: 600 });
    expect(commands.last.run).toEqual({ native: "last", changesFiles: false });
    expect(commands.open.run).toEqual({ openPanel: "launch", state: { scan: true } });
    expect(commands.open.slots.map((slot: { slot: string }) => slot.slot)).toEqual(["project.publish", "game.more"]);
    // It reads the build the app hands it: no project files, network or processes.
    expect(manifest.capabilities).toEqual({ native: true, composer: true });
    expect((await read("package.json")).version).toBe(manifest.version);
  });

  it("has every text the manifest names in both languages", async () => {
    const manifest = JSON.stringify(await read(".ohmygame-plugin/plugin.json"));
    const keys = [...manifest.matchAll(/%([\w.]+)%/g)].map((match) => match[1]);
    const en = await read("locales/en.json");
    const zh = await read("locales/zh-CN.json");
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of keys) expect(en[key] && zh[key], key).toBeTruthy();
  });

  it("scans the build it is given, keeps the report per project, and gives it back", async () => {
    const dataFolder = await mkdtemp(path.join(tmpdir(), "launch-data-"));
    data.push(dataFolder);
    const plugin = host("/projects/one", dataFolder);
    expect(plugin.names).toEqual(["scan", "last"]);
    expect(await plugin.run("last")).toBeNull();

    const result = (await plugin.run("scan", await build(viteDefault))) as { profiles: { id: string }[] };
    expect(result.profiles).toHaveLength(5);
    expect(plugin.progress).toEqual(["Reading the web build"]);
    expect(await plugin.run("last")).toEqual(result);
    expect(await readReport(reportFile(dataFolder, "/projects/one"))).toEqual(result);
    // Another project has its own.
    expect(await host("/projects/two", dataFolder).run("last")).toBeNull();
  });

  it("says why when there's no build", async () => {
    const dataFolder = await mkdtemp(path.join(tmpdir(), "launch-data-"));
    data.push(dataFolder);
    await expect(Promise.resolve(host("/projects/one", dataFolder).run("scan"))).rejects.toThrow(BUSY);
  });
});
