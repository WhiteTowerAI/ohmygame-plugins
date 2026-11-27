import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error The skill's script is plain JavaScript.
import { describe as describeResult, LIMITS, sizeCheck } from "../../plugins/wechat-minigame/skills/minigame-rewarded-ad/reference/size-check.mjs";

const SCRIPT = path.resolve("plugins/wechat-minigame/skills/minigame-rewarded-ad/reference/size-check.mjs");
const MB = 1024 * 1024;
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function build(files: Record<string, number | object>) {
  const root = await mkdtemp(path.join(tmpdir(), "size-check-"));
  folders.push(root);
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), typeof content === "number" ? Buffer.alloc(content) : JSON.stringify(content));
  }
  return root;
}
const json = (value: object) => JSON.stringify(value).length;

describe("the package size check on WeChat", () => {
  it("counts an engine plugin in the main package, except its plugin.json and signature.json", async () => {
    const game = { subpackages: [{ name: "level2", root: "subpackages/level2/" }], plugins: { cocos: { provider: "wx0000", version: "3.8.6", path: "cocos" } } };
    const root = await build({
      "game.json": game,
      "project.config.json": { appid: "wx1234" },
      "game.js": 200_000,
      "assets/main/big.png": 1 * MB,
      "subpackages/level2/map.bin": 2 * MB,
      "cocos/engine.js": 2 * MB,
      "cocos/plugin.json": 100,
      "cocos/signature.json": 100,
      ".DS_Store": 5000,
      "README.md": 5000,
    });
    const result = await sizeCheck(root);
    expect(result.platform).toBe("wechat");
    expect(result.main.bytes).toBe(200_000 + 1 * MB + 2 * MB + json(game));
    expect(result.enginePlugins).toEqual([{ name: "cocos", root: "cocos", bytes: 2 * MB, files: 1 }]);
    expect(result.subpackages).toEqual([{ name: "level2", root: "subpackages/level2", independent: false, bytes: 2 * MB, files: 1, limit: undefined, over: false }]);
    expect(result.total.bytes).toBe(result.main.bytes + 2 * MB);
    expect(describeResult(result)).toContain("counted in the main package");
  });

  it("checks independent subpackages against 4 MB", async () => {
    const root = await build({ "game.json": { subpackages: [{ name: "story", root: "story", independent: true }] }, "game.js": 1000, "story/a.bin": 5 * MB });
    const result = await sizeCheck(root);
    expect(result.subpackages[0]).toMatchObject({ independent: true, limit: LIMITS.wechat.independent, over: true });
  });

  it("suggests asset bundles to move, never the entry, the engine or the open-data context", async () => {
    const root = await build({
      "game.json": { openDataContext: "openDataContext" },
      "game.js": 100_000,
      "cocos-js/cc.js": 1.5 * MB,
      "openDataContext/index.js": 1 * MB,
      "assets/main/index.js": 0.5 * MB,
      "assets/audio/music.mp3": 1.5 * MB,
      "assets/levels/pack.bin": 1 * MB,
    });
    const result = await sizeCheck(root);
    expect(result.main.over).toBe(true);
    // 5.6 MB in the main package, 1.6 MB over: the two largest bundles cover it.
    expect(result.suggestions).toEqual([{ folder: "assets/audio", bytes: 1.5 * MB }, { folder: "assets/levels", bytes: 1 * MB }]);
    expect(describeResult(result).split("\n")[0]).toMatch(/WeChat DevTools reports package sizes/);
  });
});

describe("the package size check on Douyin", () => {
  it("allows a game without subpackages up to 20 MB", async () => {
    const root = await build({ "game.json": {}, "project.config.json": { appid: "tt1234" }, "game.js": 1000, "assets/a.bin": 10 * MB });
    const result = await sizeCheck(root);
    expect(result.platform).toBe("douyin");
    expect(result.main).toMatchObject({ limit: 20 * MB, over: false });
  });

  it("holds the whole game to 20 MB with subpackages, 30 MB with virtual payment", async () => {
    const root = await build({ "game.json": { subPackages: [{ name: "a", root: "a" }] }, "game.js": 1000, "a/x.bin": 15 * MB, "b/y.bin": 3 * MB, "c/z.bin": 7 * MB });
    const result = await sizeCheck(root, { platform: "douyin" });
    expect(result.main.limit).toBe(4 * MB);
    expect(result.main.over).toBe(true);
    expect(result.total).toMatchObject({ limit: 20 * MB, over: true });
    const paid = await sizeCheck(root, { platform: "douyin", virtualPayment: true });
    expect(paid.total).toMatchObject({ limit: 30 * MB, over: false });
  });
});

describe("the script", () => {
  it("exits with 1 when a limit is exceeded, and 0 otherwise", async () => {
    const run = promisify(execFile);
    const over = await build({ "game.json": {}, "assets/big.bin": 5 * MB });
    await expect(run(process.execPath, [SCRIPT, over])).rejects.toMatchObject({ code: 1 });
    // The same build is fine on Douyin, which allows 20 MB without subpackages.
    await run(process.execPath, [SCRIPT, over, "--platform", "douyin"]);
    const fine = await build({ "game.json": {}, "game.js": 1000 });
    const { stdout } = await run(process.execPath, [SCRIPT, fine, "--json"]);
    expect(JSON.parse(stdout).main.over).toBe(false);
    await expect(run(process.execPath, [SCRIPT, fine, "--platform", "steam"])).rejects.toMatchObject({ code: 2 });
  });
});
