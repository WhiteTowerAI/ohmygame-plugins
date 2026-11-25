import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { loadAppChecks, type AppChecks } from "../src/checks.ts";
import { GitHubError, githubApi, parseTag, type FoundRelease, type FoundRepository, type GitHubApi } from "../src/github.ts";
import { buildIndex, DownloadError, type CachedRelease } from "../src/index-builder.ts";
import { signingKey } from "../src/signing.ts";
import { zip } from "./zip.ts";

const APP = process.env.OHMYGAME_APP ?? "app";
const MIRROR = "https://plugins.example/plugins";
let app: AppChecks;
let scratch: string;
let verifyReleaseSignature: (release: unknown, keys: unknown) => void;
const pair = generateKeyPairSync("ed25519");
const key = signingKey("market-test", pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

before(async () => {
  app = await loadAppChecks(APP);
  ({ verifyReleaseSignature } = await import(pathToFileURL(path.resolve(APP, "src/daemon/plugin-releases.ts")).href));
  scratch = await mkdtemp(path.join(tmpdir(), "ohmygame-index-test-"));
});
after(() => rm(scratch, { recursive: true, force: true }));

const plugin = (id: string, version: string, prefix = "") => zip(Object.fromEntries(Object.entries({
  ".ohmygame-plugin/plugin.json": JSON.stringify({ id, version, engines: { "ohmygame-api": "^2.0.0" }, displayName: "Tiles", description: "Tile maps.", contributes: { skills: "./skills/" } }),
  "skills/tiles/SKILL.md": "---\nname: tiles\ndescription: Tile maps.\n---\n",
}).map(([file, content]) => [`${prefix}${file}`, content])));

let nextId = 1;
const release = (tag: string, assets: string[] = [], fields: Partial<FoundRelease> = {}): FoundRelease => ({
  id: nextId++,
  tag,
  draft: false,
  publishedAt: `2026-11-${String(nextId).padStart(2, "0")}T00:00:00Z`,
  assets: assets.map((name) => ({ id: nextId++, name, size: 100, url: `https://github.com/assets/${name}` })),
  ...fields,
});

/** GitHub and downloads as a run would see them. */
function world(repositories: { repo: FoundRepository; releases: FoundRelease[] }[], files: Record<string, Buffer | Promise<Buffer>>) {
  const downloads: string[] = [];
  const github: GitHubApi = {
    repositories: async () => repositories.map((item) => item.repo),
    releases: async (owner, repo) => repositories.find((item) => item.repo.owner === owner && item.repo.repo === repo)!.releases,
    commit: async (_owner, _repo, tag) => createHash("sha1").update(tag).digest("hex"),
  };
  const download = async (url: string) => {
    downloads.push(url);
    const file = files[url];
    if (!file) throw new DownloadError("HTTP 404");
    return file;
  };
  return { github, download, downloads };
}

async function folders() {
  const root = await mkdtemp(path.join(scratch, "run-"));
  const lists = path.join(root, "lists");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(lists);
  await writeFile(path.join(lists, "blocked.json"), "[]");
  await writeFile(path.join(lists, "categories.json"), "{}");
  await writeFile(path.join(lists, "featured.json"), '["acme/tiles"]');
  return { out: path.join(root, "out"), images: path.join(root, "images"), archives: path.join(root, "archives"), lists };
}

const repo = (owner: string, name: string): FoundRepository => ({ owner, repo: name, stars: 3, createdAt: "2026-01-01T00:00:00Z" });

describe("parseTag", () => {
  it("reads v<version>, and <name>-v<version> for a repository of several plugins", () => {
    assert.deepEqual(parseTag("v1.2.0"), { version: "1.2.0" });
    assert.deepEqual(parseTag("v1.2.0-beta.1"), { version: "1.2.0-beta.1" });
    assert.deepEqual(parseTag("game-studio-v0.1.2"), { name: "game-studio", version: "0.1.2" });
    for (const tag of ["1.2.0", "v1.2", "release-1", "V1.2.0", "Tiles-v1.0.0", "v01.0.0"]) assert.equal(parseTag(tag), undefined, tag);
  });
});

describe("githubApi", () => {
  it("fails rather than list only what a timed-out search found", async () => {
    const api = githubApi(async () => Response.json({ incomplete_results: true, items: [] }), "");
    await assert.rejects(api.repositories("ohmygame-plugin"), /timed out/);
  });
});

describe("buildIndex", () => {
  it("lists signed releases from repositories with the topic, mirrored by digest", async () => {
    const dirs = await folders();
    const asset = await plugin("acme/tiles", "1.2.0");
    const source = await plugin("acme/tiles", "1.1.0", "tiles-abc/");
    const tiles = repo("Acme", "tiles");
    const releases = [
      release("v1.1.0"),
      release("v1.2.0", ["tiles-1.2.0.zip", "notes.txt"]),
      release("v1.3.0", [], { draft: true }),
      release("nightly"),
    ];
    const commit = (tag: string) => createHash("sha1").update(tag).digest("hex");
    const { github, download, downloads } = world([{ repo: tiles, releases }], {
      "https://github.com/assets/tiles-1.2.0.zip": asset,
      [`https://codeload.github.com/Acme/tiles/zip/${commit("v1.1.0")}`]: source,
    });
    const cache: Record<string, CachedRelease> = {};
    const run = () => buildIndex({ app, github, download, key, mirror: MIRROR, topic: "ohmygame-plugin", ...dirs, cache });
    const { index, pointer } = await run() as { index: any; pointer: any };

    // Only tags that name a version, and no drafts.
    assert.deepEqual(index.versions.map((item: any) => item.tag), ["v1.1.0", "v1.2.0"]);
    assert.deepEqual(index.repositories, { "Acme/tiles": { stars: 3, createdAt: "2026-01-01T00:00:00Z" } });
    assert.deepEqual(index.featured, ["acme/tiles"]);
    const [older, newer] = index.versions;
    assert.equal(older.commit, commit("v1.1.0"));
    // A release without a .zip asset is its tag's source, from the mirror only.
    assert.equal(older.github, undefined);
    assert.equal(newer.github, "https://github.com/assets/tiles-1.2.0.zip");
    const sha256 = createHash("sha256").update(asset).digest("hex");
    assert.deepEqual(newer.release, { ...newer.release, id: "acme/tiles", version: "1.2.0", size: asset.length, sha256, url: `${MIRROR}/packages/acme/tiles/1.2.0-${sha256}.zip`, key: "market-test" });
    // The app's own check accepts the signature, for this publisher only.
    for (const item of index.versions) verifyReleaseSignature(item.release, { "market-test": { publicKey, publishers: ["acme"] } });
    assert.throws(() => verifyReleaseSignature({ ...newer.release, sha256: "0".repeat(64) }, { "market-test": { publicKey, publishers: ["acme"] } }), /invalid signature/);
    // The mirror's copy is the bytes that were judged and signed.
    assert.deepEqual(await readFile(path.join(dirs.archives, "packages", "acme", "tiles", `1.2.0-${sha256}.zip`)), asset);
    const text = await readFile(path.join(dirs.out, pointer.latest), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), pointer.sha256);
    assert.equal(pointer.schemaVersion, 2);

    // A second run downloads nothing it has judged.
    downloads.length = 0;
    await run();
    assert.deepEqual(downloads, []);
    // A release taken down on GitHub leaves the cache and the mirror's folder.
    releases.splice(1, 1);
    await run();
    assert.deepEqual(Object.keys(cache), ["acme/tiles@v1.1.0"]);
    assert.deepEqual(await readdir(path.join(dirs.archives, "packages", "acme", "tiles")), [`1.1.0-${createHash("sha256").update(source).digest("hex")}.zip`]);
  });

  it("never changes a signed version: a moved tag or new checks judge the mirror's copy again", async () => {
    const dirs = await folders();
    const first = await plugin("acme/tiles", "1.0.0", "tiles-a/");
    const files: Record<string, Buffer | Promise<Buffer>> = {};
    let commit = "a".repeat(40);
    const { github, download, downloads } = world([{ repo: repo("acme", "tiles"), releases: [release("v1.0.0")] }], files);
    github.commit = async () => commit;
    files[`https://codeload.github.com/acme/tiles/zip/${commit}`] = first;
    const cache: Record<string, CachedRelease> = {};
    const run = async () => ((await buildIndex({ app, github, download, key, mirror: MIRROR, topic: "ohmygame-plugin", ...dirs, cache })) as { index: any }).index;
    const signed = (await run()).versions[0].release;
    // The tag moves to other code, and the app's checks change.
    commit = "b".repeat(40);
    files[`https://codeload.github.com/acme/tiles/zip/${commit}`] = plugin("acme/tiles", "1.0.0", "tiles-b/");
    for (const entry of Object.values(cache)) entry.checks = "older checks";
    downloads.length = 0;
    const again = (await run()).versions[0];
    assert.deepEqual(downloads, []);
    assert.deepEqual(again.release, signed);
    assert.equal(again.commit, "a".repeat(40));
  });

  it("leaves out a repository GitHub no longer has, a tag on no commit and a second release of one version", async () => {
    const dirs = await folders();
    const { github, download } = world([
      { repo: repo("acme", "tiles"), releases: [release("v1.0.0", ["a.zip"]), release("tiles-v1.0.0", ["b.zip"]), release("v2.0.0")] },
      { repo: repo("acme", "gone"), releases: [] },
    ], {
      "https://github.com/assets/a.zip": plugin("acme/tiles", "1.0.0"),
      "https://github.com/assets/b.zip": plugin("acme/tiles", "1.0.0", "x/"),
    });
    // Search lags: it lists a deleted repository, and one repository twice.
    const found = await github.repositories("ohmygame-plugin");
    github.repositories = async () => [...found, found[0]!];
    const releases = github.releases;
    github.releases = async (owner, name) => {
      if (name === "gone") throw new GitHubError(404, "https://api.github.com/repos/acme/gone/releases");
      return releases(owner, name);
    };
    github.commit = async (_owner, _repo, tag) => {
      if (tag === "v2.0.0") throw new GitHubError(422, "https://api.github.com/repos/acme/tiles/commits/v2.0.0");
      return "c".repeat(40);
    };
    const { index } = await buildIndex({ app, github, download, key, mirror: MIRROR, topic: "ohmygame-plugin", ...dirs, cache: {} }) as { index: any };
    assert.deepEqual(Object.keys(index.repositories), ["acme/tiles"]);
    assert.deepEqual(index.versions.map((item: any) => [item.tag, item.rejected ?? "ok"]), [
      ["v1.0.0", "ok"],
      // The app knows a release by id and version, so the one published later can't have it.
      ["tiles-v1.0.0", ["acme/tiles 1.0.0 is already released as acme/tiles v1.0.0"]],
      ["v2.0.0", ["tag v2.0.0 doesn't point to a commit"]],
    ]);
  });

  it("rejects a release whose tag, owner or assets don't fit its plugin", async () => {
    const dirs = await folders();
    const { github, download } = world([
      { repo: repo("acme", "tiles"), releases: [release("v2.0.0", ["a.zip"]), release("v2.1.0", ["one.zip", "two.zip"])] },
      { repo: repo("mallory", "tiles"), releases: [release("v1.0.0", ["m.zip"])] },
      { repo: repo("WhiteTowerAI", "ohmygame-plugins"), releases: [release("tiles-v1.0.0", ["t.zip"]), release("maps-v1.0.0")] },
    ], {
      "https://github.com/assets/a.zip": plugin("acme/tiles", "1.9.0"),
      "https://github.com/assets/m.zip": plugin("acme/tiles", "1.0.0"),
      "https://github.com/assets/t.zip": plugin("ohmygame/tiles", "1.0.0"),
    });
    const { index } = await buildIndex({ app, github, download, key, mirror: MIRROR, topic: "ohmygame-plugin", ...dirs, cache: {} }) as { index: any };
    const byTag = Object.fromEntries(index.versions.map((item: any) => [`${item.repository} ${item.tag}`, item]));
    assert.deepEqual(byTag["acme/tiles v2.0.0"].rejected, ["plugin.json says version 1.9.0, the tag 2.0.0"]);
    assert.deepEqual(byTag["acme/tiles v2.1.0"].rejected, ["release v2.1.0 has more than one .zip asset"]);
    assert.deepEqual(byTag["mallory/tiles v1.0.0"].rejected, ["plugin acme/tiles must be published by acme, not mallory"]);
    // A repository of several plugins attaches each one's package.
    assert.equal(byTag["WhiteTowerAI/ohmygame-plugins tiles-v1.0.0"].plugin.id, "ohmygame/tiles");
    assert.deepEqual(byTag["WhiteTowerAI/ohmygame-plugins maps-v1.0.0"].rejected, ["release maps-v1.0.0 has no .zip asset"]);
    // Nothing rejected can be installed.
    for (const item of index.versions) if (item.rejected) assert.equal(item.release, undefined);
  });

  it("keeps no release for a blocked version, and leaves out one that didn't download, for now", async () => {
    const dirs = await folders();
    await writeFile(path.join(dirs.lists, "blocked.json"), '[{"repository":"acme/Tiles","version":"1.0.0","reason":"broken"}]');
    const { github, download } = world([{ repo: repo("acme", "tiles"), releases: [release("v1.0.0", ["a.zip"]), release("v1.1.0", ["b.zip"])] }], {
      "https://github.com/assets/a.zip": plugin("acme/tiles", "1.0.0"),
    });
    const lines: string[] = [];
    const { index } = await buildIndex({ app, github, download, key, mirror: MIRROR, topic: "ohmygame-plugin", ...dirs, cache: {}, log: (line) => lines.push(line) }) as { index: any };
    assert.deepEqual(index.versions.map((item: any) => [item.tag, item.rejected, item.release]), [["v1.0.0", ["blocked: broken"], undefined]]);
    assert.ok(lines.some((line) => line.includes("left out acme/tiles v1.1.0 for now")));
  });
});
