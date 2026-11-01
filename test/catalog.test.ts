import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  applyBlocks,
  applyClaims,
  attestedRepository,
  featuredPlugins,
  newestInstallable,
  packageFacts,
  parseBlocked,
  parseFeatured,
  parseRepository,
  type CachedFacts,
  type FactSources,
} from "../src/catalog.ts";
import type { IndexedVersion } from "../src/checks.ts";

const version = (name: string, ver: string, publishedAt: string, id: string | null = "acme/tiles"): IndexedVersion => ({
  package: name,
  version: ver,
  tarball: "",
  integrity: "",
  signatures: [],
  publishedAt,
  ...(id ? { plugin: { id, displayName: {}, description: {}, grants: [], adds: {} } } : { rejected: ["no"] }),
});

describe("blocked.json and featured.json", () => {
  it("are valid as committed", async () => {
    parseBlocked(await readFile(new URL("../blocked.json", import.meta.url), "utf8"));
    parseFeatured(await readFile(new URL("../featured.json", import.meta.url), "utf8"));
  });

  it("refuse what would quietly do nothing", () => {
    assert.deepEqual(parseBlocked('[{"package":"@a/b","reason":"malware"}]'), [{ package: "@a/b", reason: "malware" }]);
    for (const text of ["{}", '[{"package":"@a/b"}]', '[{"reason":"x"}]', '[{"packages":"@a/b","reason":"x"}]', '[{"package":"@a/b","reason":"x","version":1}]', "[null]"])
      assert.throws(() => parseBlocked(text), /blocked\.json/);
    for (const text of ["{}", '["Acme/Tiles"]', '["acme"]', "[1]", '["a/b","a/b"]'])
      assert.throws(() => parseFeatured(text), /featured\.json/);
  });

  it("block a whole package or one version, keeping it in the index without its plugin", () => {
    const versions = [version("@a/b", "1.0.0", "1"), version("@a/b", "2.0.0", "2"), version("@a/c", "1.0.0", "1")];
    const blocked = applyBlocks(versions, [{ package: "@a/b", version: "2.0.0", reason: "broken" }, { package: "@a/c", reason: "malware" }]);
    assert.ok(blocked[0]!.plugin);
    assert.deepEqual([blocked[1]!.plugin, blocked[1]!.rejected], [undefined, ["blocked: broken"]]);
    assert.deepEqual([blocked[2]!.plugin, blocked[2]!.rejected], [undefined, ["blocked: malware"]]);
  });

  it("feature only what can be installed, in the file's order", () => {
    const versions = [version("@a/x", "1.0.0", "1", "a/x"), version("@a/y", "1.0.0", "1", "a/y"), version("@a/z", "1.0.0", "1", null)];
    assert.deepEqual(featuredPlugins(["a/y", "a/gone", "a/z", "a/x"], versions), ["a/y", "a/x"]);
  });
});

describe("applyClaims", () => {
  it("keeps a plugin with the package published first", () => {
    const result = applyClaims([
      version("@acme/ohmygame-plugin-tiles", "1.0.0", "2026-02-01"),
      version("@acme/tiles", "1.0.0", "2026-01-01"),
      version("@acme/tiles", "1.1.0", "2026-03-01"),
    ]);
    assert.deepEqual(result[0]!.rejected, ["plugin acme/tiles is already published as @acme/tiles"]);
    assert.ok(result[1]!.plugin && result[2]!.plugin);
  });

  it("ignores a package that can't be installed, which holds nothing", () => {
    const earlier = { ...version("@acme/tiles", "1.0.0", "2026-01-01", null) };
    const result = applyClaims([earlier, version("@acme/ohmygame-plugin-tiles", "1.0.0", "2026-02-01")]);
    assert.ok(result[1]!.plugin);
  });
});

describe("parseRepository", () => {
  it("reads the ways package.json names a GitHub repository", () => {
    for (const value of ["git+https://github.com/o/r.git", "https://github.com/o/r", "https://github.com/o/r/", "git://github.com/o/r.git", "ssh://git@github.com/o/r.git", "github:o/r", "o/r", { url: "https://github.com/o/r.git" }])
      assert.deepEqual(parseRepository(value), { owner: "o", repo: "r" }, JSON.stringify(value));
    assert.deepEqual(parseRepository({ url: "https://github.com/o/r", directory: "packages/x" }), { owner: "o", repo: "r", directory: "packages/x" });
  });

  it("leaves out anything else, and a folder that can't be named safely", () => {
    for (const value of [undefined, null, 1, {}, "https://gitlab.com/o/r", "https://github.com.evil.com/o/r", "https://evil.com/github.com/o/r", "gitlab:o/r", "../r", "https://github.com/../r"])
      assert.equal(parseRepository(value), undefined, JSON.stringify(value));
    assert.deepEqual(parseRepository({ url: "o/r", directory: "../../other/x" }), { owner: "o", repo: "r" });
  });
});

const attestation = (subject: string, repository: string, predicateType = "https://slsa.dev/provenance/v1") => ({
  attestations: [{
    predicateType,
    bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify({
      subject: [{ name: subject }],
      predicate: { buildDefinition: { externalParameters: { workflow: { repository } } } },
    })).toString("base64") } },
  }],
});

describe("attestedRepository", () => {
  it("reads the repository from the provenance of this very version", () => {
    assert.deepEqual(attestedRepository(attestation("pkg:npm/%40a/b@1.0.0", "https://github.com/o/r"), "@a/b", "1.0.0"), { owner: "o", repo: "r" });
    assert.equal(attestedRepository(attestation("pkg:npm/%40a/b@2.0.0", "https://github.com/o/r"), "@a/b", "1.0.0"), undefined);
    assert.equal(attestedRepository(attestation("pkg:npm/%40a/c@1.0.0", "https://github.com/o/r"), "@a/b", "1.0.0"), undefined);
    assert.equal(attestedRepository(attestation("pkg:npm/%40a/b@1.0.0", "https://github.com/o/r", "other"), "@a/b", "1.0.0"), undefined);
    for (const data of [undefined, null, {}, { attestations: 1 }, { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] }])
      assert.equal(attestedRepository(data, "@a/b", "1.0.0"), undefined);
  });
});

describe("packageFacts", () => {
  const NAME = "@a/b";
  const sources = (over: Partial<FactSources> = {}): FactSources => ({
    attestations: async () => undefined,
    packageJson: async () => undefined,
    stars: async () => 7,
    weeklyDownloads: async () => 100,
    ...over,
  });
  const read = (meta: { repository?: unknown; hasProvenance?: boolean }, source: FactSources, cached?: CachedFacts, now = 1e12) =>
    packageFacts(NAME, "1.0.0", { hasProvenance: false, ...meta }, cached, now, source);

  it("gives no stars until the source is verified", async () => {
    const { entry } = await read({ repository: "o/r" }, sources({ packageJson: async () => '{"name":"@a/other"}' }));
    assert.deepEqual(entry.facts, { repository: "https://github.com/o/r", weeklyDownloads: 100 });
  });

  it("verifies by the repository's package.json", async () => {
    const { entry } = await read({ repository: "o/r" }, sources({ packageJson: async () => `{"name":"${NAME}"}` }));
    assert.deepEqual(entry.facts, { repository: "https://github.com/o/r", sourceVerified: true, stars: 7, weeklyDownloads: 100 });
  });

  it("verifies by provenance only for the repository the package claims", async () => {
    const claim = (repository: string) => sources({ attestations: async () => attestation("pkg:npm/%40a/b@1.0.0", repository) });
    assert.equal((await read({ repository: "o/r", hasProvenance: true }, claim("https://github.com/O/R"))).entry.facts.sourceVerified, true);
    assert.equal((await read({ repository: "o/r", hasProvenance: true }, claim("https://github.com/x/y"))).entry.facts.sourceVerified, undefined);
    // Without the flag on the version, the attestation isn't asked for.
    assert.equal((await read({ repository: "o/r" }, claim("https://github.com/o/r"))).entry.facts.sourceVerified, undefined);
  });

  it("ignores a package.json that isn't JSON, and a repository off GitHub", async () => {
    assert.equal((await read({ repository: "o/r" }, sources({ packageJson: async () => "{" }))).entry.facts.sourceVerified, undefined);
    assert.deepEqual((await read({ repository: "https://gitlab.com/o/r" }, sources())).entry.facts, { weeklyDownloads: 100 });
  });

  it("reads again after a day or for a new version, and not before", async () => {
    let reads = 0;
    const source = sources({ weeklyDownloads: async () => ++reads });
    const { entry } = await read({}, source);
    assert.equal(reads, 1);
    assert.equal((await read({}, source, entry, 1e12 + 60_000)).entry, entry);
    assert.equal(reads, 1);
    await read({}, source, entry, 1e12 + 25 * 3600_000);
    assert.equal(reads, 2);
    await read({}, source, { ...entry, version: "0.9.0" }, 1e12 + 60_000);
    assert.equal(reads, 3);
  });

  it("keeps the last values for this version when they can't be read, and tries again next run", async () => {
    const cached: CachedFacts = { version: "1.0.0", checkedAt: 1, facts: { repository: "https://github.com/o/r", sourceVerified: true, stars: 5, weeklyDownloads: 50 } };
    const down = sources({ packageJson: async () => { throw new Error("down"); }, stars: async () => { throw new Error("down"); }, weeklyDownloads: async () => { throw new Error("down"); } });
    const { entry, complete } = await read({ repository: "o/r" }, down, cached);
    assert.equal(complete, false);
    assert.deepEqual(entry.facts, cached.facts);
    assert.equal(entry.checkedAt, 1);
  });

  it("doesn't carry verification over to a new version or repository", async () => {
    const cached: CachedFacts = { version: "0.9.0", checkedAt: 1, facts: { repository: "https://github.com/o/r", sourceVerified: true, stars: 5, weeklyDownloads: 50 } };
    const down = sources({ packageJson: async () => { throw new Error("down"); } });
    assert.deepEqual((await read({ repository: "o/r" }, down, cached)).entry.facts, { repository: "https://github.com/o/r", weeklyDownloads: 100 });
    assert.deepEqual((await read({ repository: "x/y" }, down, { ...cached, version: "1.0.0" })).entry.facts, { repository: "https://github.com/x/y", weeklyDownloads: 100 });
  });

  it("verified over a provenance read that failed, by package.json", async () => {
    const source = sources({ attestations: async () => { throw new Error("down"); }, packageJson: async () => `{"name":"${NAME}"}` });
    const { entry, complete } = await read({ repository: "o/r", hasProvenance: true }, source);
    assert.equal(entry.facts.sourceVerified, true);
    assert.equal(complete, false);
  });
});

describe("newestInstallable", () => {
  it("skips what can't be installed", () => {
    const result = newestInstallable([version("@a/b", "1.0.0", "1"), version("@a/b", "2.0.0", "2"), version("@a/b", "3.0.0", "3", null), version("@a/c", "1.0.0", "1", null)]);
    assert.equal(result.get("@a/b")?.version, "2.0.0");
    assert.equal(result.has("@a/c"), false);
  });
});
