import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { deflateSync, crc32 } from "node:zlib";
import { create } from "tar";
import { imagePath, integrityIssue, judgeTarball, loadAppChecks, signatureIssue, type AppChecks, type RegistryKeys } from "../src/checks.ts";

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

/** A gzipped npm tarball (`package/…`) of the given files. */
async function tarball(files: Record<string, string | Buffer>): Promise<Buffer> {
  const root = await mkdtemp(path.join(scratch, "pkg-"));
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, "package", file)), { recursive: true });
    await writeFile(path.join(root, "package", file), text);
  }
  const out = path.join(root, "out.tgz");
  await create({ gzip: true, cwd: root, file: out, portable: true }, ["package"]);
  return readFile(out);
}

const plugin = (fields: Record<string, unknown> = {}, pkg: Record<string, unknown> = {}, extra: Record<string, string | Buffer> = {}) =>
  tarball({
    "package.json": JSON.stringify({ name: "@acme/ohmygame-plugin-tiles", version: "1.2.0", ...pkg }),
    ".ohmygame-plugin/plugin.json": JSON.stringify(manifest(fields)),
    "locales/en.json": JSON.stringify({ displayName: "Tiles", description: "Tile maps.", long: "Paint tile maps.", shot: "A map", tilemap: "tilemap", agent: "Tile agent" }),
    "locales/zh-CN.json": JSON.stringify({ displayName: "瓦片", shot: "地图", tilemap: "瓦片地图" }),
    "skills/tiles/SKILL.md": "---\nname: tiles\ndescription: Tile maps.\n---\n",
    ...extra,
  });

describe("judgeTarball", () => {
  it("accepts a plugin whose package names it, with its strings in each locale", async () => {
    const judged = await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin());
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
    const judged = await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin({
      capabilities: { network: ["api.flow.example"] }, contributes: { skills: "./skills/", providers: [provider] },
    }, {}, { "media.js": "export default { image: { start: () => ({ outputs: [] }) } };" }));
    assert.equal(judged.rejected, undefined);
    assert.deepEqual(judged.plugin?.providerKinds, ["language", "image"]);
    // An agent plugin makes nothing of the kind.
    assert.equal((await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin())).plugin?.providerKinds, undefined);
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
    const judge = async (icon: string | Buffer) => judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin({
      longDescription: "%long%", categories: ["art", "hologram"], appliesTo: ["web-game"], beta: true,
      keywords: ["%tilemap%", "Tiled"],
      contributes: { skills: "./skills/", agents: [{ id: "tiles", title: "%agent%", command: "tiles", args: ["--acp"] }] },
      capabilities: { processes: ["tiles"] },
      icon: typeof icon === "string" ? "./assets/icon.svg" : "./assets/icon.png",
      screenshots: [{ path: "./shots/one.png", caption: "%shot%" }, { path: "./shots/page.png" }, { path: "./shots/two.jpg" }],
    }, {}, {
      [typeof icon === "string" ? "assets/icon.svg" : "assets/icon.png"]: icon,
      "shots/one.png": png, "shots/page.png": "<html></html>", "shots/two.jpg": jpeg,
    }), async (file, bytes) => { saved.set(file, bytes); });

    const judged = await judge(png);
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
    const scripted = await judge('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal(scripted.rejected, undefined);
    assert.equal(scripted.plugin?.icon, undefined);
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32H0z"/></svg>';
    assert.equal((await judge(plain)).plugin?.icon, imagePath(Buffer.from(plain), "svg"));
  });

  it("lists what a plugin asks for and adds", async () => {
    const judged = await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin({
      capabilities: { network: ["tiles.example.com"] },
      contributes: { skills: "./skills/", themes: [{ id: "night", title: "Night", dark: { "--color-accent": "#123456" } }] },
    }));
    assert.equal(judged.rejected, undefined);
    assert.deepEqual(judged.plugin?.grants, ["network:tiles.example.com"]);
    assert.deepEqual(judged.plugin?.adds, { themes: 1, skills: 1 });
  });

  it("rejects a package whose name, version or scripts disagree with the plugin", async () => {
    const reasons = async (name: string, version: string, bytes: Promise<Buffer>) =>
      (await judgeTarball(app, name, version, await bytes)).rejected;
    assert.deepEqual(await reasons("ohmygame-plugin-tiles", "1.2.0", plugin()), ["package name must be @<publisher>/<name> or @<publisher>/ohmygame-plugin-<name>"]);
    assert.deepEqual(await reasons("@other/ohmygame-plugin-tiles", "1.2.0", plugin()), ["package @other/ohmygame-plugin-tiles can't hold plugin acme/tiles"]);
    // Either name can hold it, and only what the app itself would accept.
    assert.equal(await reasons("@acme/tiles", "1.2.0", plugin()), undefined);
    assert.equal(await reasons("@acme/ohmygame-plugin-tiles", "1.2.0", plugin()), undefined);
    assert.equal(await reasons("@acme/ohmygame-plugin-tiles", "1.2.0", plugin({ id: "acme/ohmygame-plugin-tiles" })), undefined);
    assert.deepEqual(await reasons("@acme/tiles", "1.2.0", plugin({ id: "acme/ohmygame-plugin-tiles" })), ["package @acme/tiles can't hold plugin acme/ohmygame-plugin-tiles"]);
    assert.deepEqual(await reasons("@acme/ohmygame-plugin-tiles", "1.3.0", plugin()), ["plugin.json says version 1.2.0, the package 1.3.0"]);
    assert.deepEqual(await reasons("@acme/ohmygame-plugin-tiles", "1.2.0", plugin({}, { scripts: { postinstall: "node evil.js" } })), ["has a postinstall script, which the app never runs"]);
  });

  it("rejects a package the app wouldn't install, in the app's words", async () => {
    const reasons = async (bytes: Promise<Buffer>) => (await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await bytes)).rejected;
    assert.deepEqual(await reasons(tarball({ "package.json": "{}" })), ["package .ohmygame-plugin/plugin.json is missing or not JSON"]);
    assert.deepEqual(await reasons(tarball({ ".ohmygame-plugin/plugin.json": "{" })), ["package .ohmygame-plugin/plugin.json is missing or not JSON"]);
    assert.ok((await reasons(plugin({ id: "Not An Id" })))?.some((reason) => reason.startsWith("/id ")));
    assert.equal((await reasons(plugin({ engines: { "ohmygame-api": "^9.0.0" } })))?.length, 1);
    // Checks beyond the manifest itself: strings, folders and locale files.
    assert.ok((await reasons(plugin({ displayName: "%name%" })))?.some((reason) => reason.includes("%name%")));
    assert.ok((await reasons(plugin({ contributes: { skills: "./missing/" } })))?.some((reason) => reason.includes("missing")));
    assert.ok((await reasons(plugin({}, {}, { "locales/zh-CN.json": "{" })))?.some((reason) => reason.includes("zh-CN")));
  });

  it("rejects a tarball whose entries could unpack to something else", async () => {
    const raw = async (entries: { path: string; type?: string; body?: string; linkpath?: string }[]) => {
      // Built by hand: tar's own writer won't make most of these.
      const { Header, Pax } = await import("tar");
      const blocks: Buffer[] = [];
      for (const item of entries) {
        const body = Buffer.from(item.body ?? "");
        // A long path needs a PAX record, as tar's own writer adds.
        if (Buffer.byteLength(item.path) > 100) blocks.push(new Pax({ path: item.path, mtime: new Date(0) }).encode());
        const header = Buffer.alloc(512);
        new Header({ path: item.path, type: (item.type ?? "File") as "File", size: body.length, mode: 0o644, linkpath: item.linkpath, mtime: new Date(0) }).encode(header);
        blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
      }
      blocks.push(Buffer.alloc(1024));
      const { gzipSync } = await import("node:zlib");
      return gzipSync(Buffer.concat(blocks));
    };
    const reason = async (entries: Parameters<typeof raw>[0]) =>
      (await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await raw(entries))).rejected?.[0];
    const manifestFile = JSON.stringify(manifest());
    assert.match((await reason([{ path: "package/.ohmygame-plugin/plugin.json", body: manifestFile }, { path: "package/.ohmygame-plugin/./plugin.json", body: manifestFile }]))!, /not a safe path/);
    assert.match((await reason([{ path: "package/../evil", body: "x" }]))!, /not a safe path/);
    assert.match((await reason([{ path: "other/file", body: "x" }]))!, /not a safe path/);
    assert.match((await reason([{ path: "package/a.json", body: "1" }, { path: "package/A.json", body: "2" }]))!, /twice/);
    assert.match((await reason([{ path: "package/link", type: "SymbolicLink", linkpath: "/etc/passwd" }]))!, /not a file or folder/);
    assert.equal(await reason([{ path: `package/${"a/".repeat(30)}f`, body: "x" }]), "the tarball has folders that nest too deeply");
    assert.equal(await reason([{ path: `package/${"a".repeat(300)}`, body: "x" }]), "the tarball has a file name that is too long");
    assert.equal(await reason([{ path: `package/${"abcdefgh/".repeat(10)}${"b".repeat(1100)}`, body: "x" }]), "the tarball has a path that is too long");
    // Metadata records count toward what may be unpacked.
    const pax = "x".repeat(9 * 1024 * 1024);
    const flood = await raw([{ path: "pax", type: "GlobalExtendedHeader", body: `${pax.length + 20} comment=${pax}\n` }]);
    assert.deepEqual((await judgeTarball({ ...app, archiveMaxBytes: 1024 }, "@acme/ohmygame-plugin-tiles", "1.2.0", flood)).rejected, ["the tarball is larger than the app allows unpacked"]);
  });

  it("rejects display text that doesn't resolve to a string", async () => {
    for (const key of ["%__proto__%", "%toString%"]) {
      const judged = await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin({ displayName: key }));
      assert.equal(judged.plugin, undefined, key);
      assert.ok(judged.rejected?.length, key);
    }
  });

  it("rejects a tarball compressed twice", async () => {
    const { gzipSync } = await import("node:zlib");
    const judged = await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", gzipSync(await plugin()));
    assert.deepEqual(judged.rejected, ["the tarball is not a tar archive inside one gzip layer"]);
  });

  it("rejects a package whose files make the app's check throw", async () => {
    const throwing = { ...app, indexPluginPackage: async () => { throw new URIError("URI malformed"); } };
    assert.deepEqual((await judgeTarball(throwing, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin())).rejected, ["the package can't be checked: URI malformed"]);
  });

  it("stops reading at the app's unpacked size and file count", async () => {
    const small = { ...app, archiveMaxBytes: 1024, archiveMaxEntries: 3 };
    const big = await tarball({ "package.json": "{}", "big.txt": "x".repeat(4096) });
    assert.deepEqual((await judgeTarball(small, "@acme/ohmygame-plugin-tiles", "1.2.0", big)).rejected, ["the tarball is larger than the app allows unpacked"]);
    assert.deepEqual((await judgeTarball(small, "@acme/ohmygame-plugin-tiles", "1.2.0", await plugin())).rejected, ["the tarball has too many files"]);
    assert.match((await judgeTarball(app, "@acme/ohmygame-plugin-tiles", "1.2.0", Buffer.from("not gzip"))).rejected![0]!, /can't be read as a gzipped tarball/);
  });
});

describe("integrityIssue", () => {
  it("matches the tarball's sha512", () => {
    const bytes = Buffer.from("tarball");
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    assert.equal(integrityIssue(bytes, integrity), undefined);
    assert.equal(integrityIssue(Buffer.from("other"), integrity), "integrity doesn't match the tarball");
    assert.equal(integrityIssue(bytes, "sha1-abc"), "no sha512 integrity");
  });
});

describe("signatureIssue", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const message = "@acme/ohmygame-plugin-tiles@1.2.0:sha512-abc";
  const sig = sign("sha256", Buffer.from(message), privateKey).toString("base64");

  it("accepts the registry's signature by a key valid when the version was published", () => {
    const keys: RegistryKeys = new Map([["key-1", { key: publicKey, expires: Date.parse("2030-01-01") }]]);
    assert.equal(signatureIssue("@acme/ohmygame-plugin-tiles", "1.2.0", "sha512-abc", [{ keyid: "key-1", sig }], keys, "2026-01-01T00:00:00Z"), undefined);
  });

  it("rejects a missing, unknown, expired or wrong signature", () => {
    const keys: RegistryKeys = new Map([["key-1", { key: publicKey, expires: Date.parse("2025-01-01") }]]);
    const check = (signatures: { keyid: string; sig: string }[], integrity = "sha512-abc") =>
      signatureIssue("@acme/ohmygame-plugin-tiles", "1.2.0", integrity, signatures, keys, "2026-01-01T00:00:00Z");
    assert.equal(check([]), "no npm registry signature");
    assert.equal(check([{ keyid: "key-2", sig }]), "npm registry signature doesn't verify");
    // Published after the key expired.
    assert.equal(check([{ keyid: "key-1", sig }]), "npm registry signature doesn't verify");
    const current: RegistryKeys = new Map([["key-1", { key: publicKey }]]);
    assert.equal(signatureIssue("@acme/ohmygame-plugin-tiles", "1.2.0", "sha512-other", [{ keyid: "key-1", sig }], current), "npm registry signature doesn't verify");
  });
});
