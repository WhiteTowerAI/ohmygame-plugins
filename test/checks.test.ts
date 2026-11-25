import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { deflateSync, crc32 } from "node:zlib";
import { imagePath, judgeArchive, loadAppChecks, type AppChecks, type Expected } from "../src/checks.ts";
import { zip } from "./zip.ts";

const APP = process.env.OHMYGAME_APP ?? "app";
let app: AppChecks;
let scratch: string;

before(async () => {
  app = await loadAppChecks(APP);
  scratch = await mkdtemp(path.join(tmpdir(), "ohmygame-plugins-test-"));
});
after(() => rm(scratch, { recursive: true, force: true }));

const manifest = (fields: Record<string, unknown> = {}) => ({
  id: "acme/tiles",
  version: "1.2.0",
  engines: { "ohmygame-api": "^2.0.0" },
  displayName: "%displayName%",
  description: "%description%",
  contributes: { skills: "./skills/" },
  ...fields,
});

const files = (fields: Record<string, unknown> = {}, pkg: Record<string, unknown> = {}, extra: Record<string, string | Buffer> = {}): Record<string, string | Buffer> => ({
  "package.json": JSON.stringify({ name: "tiles", version: "1.2.0", ...pkg }),
  ".ohmygame-plugin/plugin.json": JSON.stringify(manifest(fields)),
  "locales/en.json": JSON.stringify({ displayName: "Tiles", description: "Tile maps.", long: "Paint tile maps.", shot: "A map", tilemap: "tilemap", agent: "Tile agent" }),
  "locales/zh-CN.json": JSON.stringify({ displayName: "瓦片", shot: "地图", tilemap: "瓦片地图" }),
  "skills/tiles/SKILL.md": "---\nname: tiles\ndescription: Tile maps.\n---\n",
  ...extra,
});
const plugin = (fields: Record<string, unknown> = {}, pkg: Record<string, unknown> = {}, extra: Record<string, string | Buffer> = {}) => zip(files(fields, pkg, extra));

const ACME: Expected = { owner: "acme", version: "1.2.0" };
const judge = async (bytes: Buffer | Promise<Buffer>, expected: Expected = ACME, checks: AppChecks = app) => judgeArchive(checks, await bytes, expected);

describe("judgeArchive", () => {
  it("accepts a plugin its repository's owner publishes, with its strings in each locale", async () => {
    const judged = await judge(plugin());
    assert.equal(judged.rejected, undefined);
    assert.deepEqual(judged.plugin, {
      id: "acme/tiles",
      displayName: { en: "Tiles", "zh-CN": "瓦片" },
      // Falls back to English.
      description: { en: "Tile maps.", "zh-CN": "Tile maps." },
      grants: [],
      adds: { skills: 1 },
    });
  });

  it("lists what its model providers make, read off what they implement", async () => {
    const provider = { id: "flow", title: "Flow", api: "openai-completions", baseUrl: "https://api.flow.example/v1", discoverModels: true,
      media: { adapter: "./media.js", image: { models: [{ id: "kolors", resolutions: ["1K"], aspectRatios: ["1:1"] }] } } };
    const judged = await judge(plugin({
      capabilities: { network: ["api.flow.example"] }, contributes: { skills: "./skills/", providers: [provider] },
    }, {}, { "media.js": "export default { image: { start: () => ({ outputs: [] }) } };" }));
    assert.equal(judged.rejected, undefined);
    assert.deepEqual(judged.plugin?.providerKinds, ["language", "image"]);
    // An agent plugin makes nothing of the kind.
    assert.equal((await judge(plugin())).plugin?.providerKinds, undefined);
  });

  it("lists where a plugin belongs, and keeps its icon and screenshots by their contents", async () => {
    // A 1×1 PNG, which the app decodes to check an icon.
    const chunk = (type: string, data: Buffer) => {
      const body = Buffer.concat([Buffer.from(type), data]);
      const length = Buffer.alloc(4), crc = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([length, body, crc]);
    };
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"),
      chunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])), chunk("IDAT", deflateSync(Buffer.alloc(5))), chunk("IEND", Buffer.alloc(0))]);
    const jpeg = Buffer.from("ffd8ffe000104a464946", "hex");
    const saved = new Map<string, Buffer>();
    const judgeIcon = async (icon: string | Buffer) => judgeArchive(app, await plugin({
      longDescription: "%long%", categories: ["art", "hologram"], appliesTo: ["web-game"], beta: true,
      keywords: ["%tilemap%", "Tiled"],
      contributes: { skills: "./skills/", agents: [{ id: "tiles", title: "%agent%", command: "tiles", args: ["--acp"] }] },
      capabilities: { processes: ["tiles"] },
      icon: typeof icon === "string" ? "./assets/icon.svg" : "./assets/icon.png",
      screenshots: [{ path: "./shots/one.png", caption: "%shot%" }, { path: "./shots/page.png" }, { path: "./shots/two.jpg" }],
    }, {}, {
      [typeof icon === "string" ? "assets/icon.svg" : "assets/icon.png"]: icon,
      "shots/one.png": png, "shots/page.png": "<html></html>", "shots/two.jpg": jpeg,
    }), ACME, async (file, bytes) => { saved.set(file, bytes); });

    const judged = await judgeIcon(png);
    assert.equal(judged.rejected, undefined);
    assert.deepEqual({ ...judged.plugin, displayName: undefined, description: undefined, grants: undefined, adds: undefined }, {
      id: "acme/tiles", displayName: undefined, description: undefined, grants: undefined, adds: undefined,
      longDescription: { en: "Paint tile maps.", "zh-CN": "Paint tile maps." },
      // The app passes over a category it doesn't know.
      categories: ["art"], appliesTo: ["web-game"], beta: true,
      // Keywords, and what it adds by name, for search.
      keywords: [{ en: "tilemap", "zh-CN": "瓦片地图" }, { en: "Tiled", "zh-CN": "Tiled" }],
      names: [{ en: "Tile agent", "zh-CN": "Tile agent" }],
      icon: imagePath(png, "png"),
      // One that isn't a picture is left out.
      screenshots: [{ path: imagePath(png, "png"), caption: { en: "A map", "zh-CN": "地图" } }, { path: imagePath(jpeg, "jpg") }],
    });
    assert.match(judged.plugin!.icon!, /^assets\/[0-9a-f]{64}\.png$/);
    assert.deepEqual([...saved.keys()].sort(), [imagePath(jpeg, "jpg"), imagePath(png, "png")].sort());
    assert.deepEqual(saved.get(imagePath(jpeg, "jpg")), jpeg);

    // An icon the app wouldn't show is left out, not the plugin.
    const scripted = await judgeIcon('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal(scripted.rejected, undefined);
    assert.equal(scripted.plugin?.icon, undefined);
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32H0z"/></svg>';
    assert.equal((await judgeIcon(plain)).plugin?.icon, imagePath(Buffer.from(plain), "svg"));
  });

  it("lists what a plugin asks for and adds", async () => {
    const judged = await judge(plugin({
      capabilities: { network: ["tiles.example.com"] },
      contributes: { skills: "./skills/", themes: [{ id: "night", title: "Night", dark: { "--color-accent": "#123456" } }] },
    }));
    assert.equal(judged.rejected, undefined);
    assert.deepEqual(judged.plugin?.grants, ["network:tiles.example.com"]);
    assert.deepEqual(judged.plugin?.adds, { themes: 1, skills: 1 });
  });

  it("rejects a release whose owner, tag or scripts disagree with the plugin", async () => {
    const reasons = async (expected: Expected, bytes: Promise<Buffer> = plugin()) => (await judge(bytes, expected)).rejected;
    // The publisher is the owner, lowercased.
    assert.equal(await reasons({ owner: "Acme", version: "1.2.0" }), undefined);
    assert.deepEqual(await reasons({ owner: "other", version: "1.2.0" }), ["plugin acme/tiles must be published by acme, not other"]);
    // `ohmygame` is OhMyGame's own, on WhiteTowerAI only.
    assert.equal(await reasons({ owner: "WhiteTowerAI", version: "1.2.0" }, plugin({ id: "ohmygame/tiles" })), undefined);
    // Not even by an account named ohmygame.
    assert.deepEqual(await reasons({ owner: "ohmygame", version: "1.2.0" }, plugin({ id: "ohmygame/tiles" })), ["plugin ohmygame/tiles must be published by WhiteTowerAI, not ohmygame"]);
    assert.deepEqual(await reasons({ owner: "someone", version: "1.2.0" }, plugin({ id: "ohmygame/tiles" })), ["plugin ohmygame/tiles must be published by WhiteTowerAI, not someone"]);
    // A repository of several plugins names the one each tag releases.
    assert.equal(await reasons({ owner: "acme", version: "1.2.0", name: "tiles" }), undefined);
    assert.deepEqual(await reasons({ owner: "acme", version: "1.2.0", name: "maps" }), ["the tag names maps, plugin.json acme/tiles"]);
    assert.deepEqual(await reasons({ owner: "acme", version: "1.3.0" }), ["plugin.json says version 1.2.0, the tag 1.3.0"]);
    assert.deepEqual(await reasons(ACME, plugin({}, { scripts: { postinstall: "node evil.js" } })), ["has a postinstall script, which the app never runs"]);
  });

  it("rejects a package the app wouldn't install, in the app's words", async () => {
    const reasons = async (bytes: Promise<Buffer>) => (await judge(bytes)).rejected;
    assert.deepEqual(await reasons(zip({ "package.json": "{}" })), ["package .ohmygame-plugin/plugin.json is missing or not JSON"]);
    assert.deepEqual(await reasons(zip({ ".ohmygame-plugin/plugin.json": "{" })), ["package .ohmygame-plugin/plugin.json is missing or not JSON"]);
    assert.ok((await reasons(plugin({ id: "Not An Id" })))?.some((reason) => reason.startsWith("/id ")));
    assert.equal((await reasons(plugin({ engines: { "ohmygame-api": "^9.0.0" } })))?.length, 1);
    // Checks beyond the manifest itself: strings, folders and locale files.
    assert.ok((await reasons(plugin({ displayName: "%name%" })))?.some((reason) => reason.includes("%name%")));
    assert.ok((await reasons(plugin({ contributes: { skills: "./missing/" } })))?.some((reason) => reason.includes("missing")));
    assert.ok((await reasons(plugin({}, {}, { "locales/zh-CN.json": "{" })))?.some((reason) => reason.includes("zh-CN")));
  });

  it("unpacks an archive as the app does: at its top, or in the one folder it was zipped with", async () => {
    const wrapped = Object.fromEntries(Object.entries(files()).map(([file, content]) => [`tiles-1.2.0/${file}`, content]));
    assert.equal((await judge(zip(wrapped))).plugin?.id, "acme/tiles");
    // A manifest folder anywhere else isn't the package's.
    assert.match((await judge(zip({ ...files(), "extra/.ohmygame-plugin/plugin.json": "{}" }))).rejected![0]!, /manifest folder outside its package/);
    assert.match((await judge(zip({ "a/b/.ohmygame-plugin/plugin.json": "{}" }))).rejected![0]!, /manifest folder outside its package/);
    assert.match((await judge(zip({ ...wrapped, "other/readme.txt": "x" }))).rejected![0]!, /manifest folder outside its package/);
  });

  it("rejects display text that doesn't resolve to a string", async () => {
    for (const key of ["%__proto__%", "%toString%"]) {
      const judged = await judge(plugin({ displayName: key }));
      assert.equal(judged.plugin, undefined, key);
      assert.ok(judged.rejected?.length, key);
    }
  });

  it("rejects a package whose files make the app's check throw", async () => {
    const throwing = { ...app, indexPluginPackage: async () => { throw new URIError("URI malformed"); } };
    assert.deepEqual((await judge(plugin(), ACME, throwing)).rejected, ["the package can't be checked: URI malformed"]);
  });

  it("stops at the app's unpacked size and file count, and refuses what isn't a ZIP", async () => {
    const small = { ...app, archiveMaxBytes: 1024, archiveMaxEntries: 3 };
    assert.deepEqual((await judge(zip({ "package.json": "{}", "big.txt": "x".repeat(4096) }), ACME, small)).rejected, ["the archive is unusable (too-large)"]);
    assert.deepEqual((await judge(plugin(), ACME, small)).rejected, ["the archive is unusable (too-large)"]);
    assert.deepEqual((await judge(Buffer.from("not a zip"))).rejected, ["the archive is unusable (invalid-zip)"]);
    // Corrupt compressed data rejects the release, not the whole run.
    const corrupt = await zip({ ...files(), "big.txt": "x".repeat(5000) });
    const at = corrupt.indexOf("big.txt") + "big.txt".length + 2;
    corrupt[at] = corrupt[at]! ^ 0xff;
    assert.match((await judge(corrupt)).rejected![0]!, /^the archive /);
  });
});
