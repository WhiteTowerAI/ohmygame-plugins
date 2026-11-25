import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  applyBlocks,
  applyCategories,
  applyClaims,
  featuredPlugins,
  parseBlocked,
  parseCategories,
  parseFeatured,
} from "../src/catalog.ts";
import { loadAppChecks, type IndexedVersion } from "../src/checks.ts";

const version = (repository: string, ver: string, publishedAt: string, id: string | null = "acme/tiles"): IndexedVersion => ({
  repository,
  tag: `v${ver}`,
  commit: "0".repeat(40),
  version: ver,
  publishedAt,
  ...(id ? { plugin: { id, displayName: {}, description: {}, grants: [], adds: {} } } : { rejected: ["no"] }),
});

const KNOWN = ["engine", "art", "3d"];

describe("blocked.json, featured.json and categories.json", () => {
  // Checked on every pull request, so a typo never reaches the scheduled run, which stops on one.
  it("are valid as committed", async () => {
    parseBlocked(await readFile(new URL("../blocked.json", import.meta.url), "utf8"));
    parseFeatured(await readFile(new URL("../featured.json", import.meta.url), "utf8"));
    const { categories } = await loadAppChecks(process.env.OHMYGAME_APP ?? "app");
    parseCategories(await readFile(new URL("../categories.json", import.meta.url), "utf8"), categories);
  });

  it("refuse what would quietly do nothing", () => {
    assert.deepEqual(parseBlocked('[{"repository":"Acme/tiles","reason":"malware"}]'), [{ repository: "Acme/tiles", reason: "malware" }]);
    assert.equal(parseBlocked('[{"repository":"a/b","reason":"x","version":"1.0.0-beta.1+b2"}]')[0]!.version, "1.0.0-beta.1+b2");
    for (const text of ["{}", '[{"repository":"a/b"}]', '[{"reason":"x"}]', '[{"package":"@a/b","reason":"x"}]', '[{"repository":"a/b","reason":"x","version":1}]', '[{"repository":"a/b ","reason":"x"}]', '[{"repository":"a","reason":"x"}]', '[{"repository":"a/b/c","reason":"x"}]', '[{"repository":"a/b","reason":"x","version":"1.0.0 "}]', '[{"repository":"a/b","reason":"x","version":"*"}]', '[{"repository":"a/b","reason":"x","version":"latest"}]', '[{"repository":"a/b","reason":"x","version":"1.0"}]', '[{"repository":"a/b","reason":"x","version":"01.0.0"}]', '[{"repository":"a/b","reason":"x","version":"1.0.0-rc..1"}]', "[null]"])
      assert.throws(() => parseBlocked(text), /blocked\.json/);
    for (const text of ["{}", '["Acme/Tiles"]', '["acme"]', "[1]", '["a/b","a/b"]'])
      assert.throws(() => parseFeatured(text), /featured\.json/);
    assert.deepEqual(parseCategories('{"a/b":["art","3d"]}', KNOWN), { "a/b": ["art", "3d"] });
    // Only categories the app knows, one to three, once each.
    for (const text of ["[]", "null", '{"A/b":["art"]}', '{"a/b":[]}', '{"a/b":"art"}', '{"a/b":["hologram"]}', '{"a/b":["art","art"]}', '{"a/b":["art","3d","engine","art"]}'])
      assert.throws(() => parseCategories(text, KNOWN), /categories\.json/);
  });

  it("list every version of a plugin under the categories categories.json gives it", () => {
    const versions = [version("a/b", "1.0.0", "1", "a/b"), version("a/b", "2.0.0", "2", "a/b"), version("a/c", "1.0.0", "1", "a/c"), version("a/d", "1.0.0", "1", null)];
    const listed = applyCategories(versions, { "a/b": ["art"], "a/d": ["3d"] });
    assert.deepEqual(listed.map((item) => item.plugin?.categories), [["art"], ["art"], undefined, undefined]);
    assert.equal(versions[0]!.plugin!.categories, undefined);
  });

  it("block a whole repository, one of its plugins or one version, keeping it in the index with its plugin", () => {
    const versions = [version("a/b", "1.0.0", "1", "a/b"), version("a/b", "2.0.0", "2", "a/b"), version("A/c", "1.0.0", "1", "a/c")];
    // GitHub ignores case in a repository's name, so blocks do too.
    const blocked = applyBlocks(versions, [{ repository: "a/b", version: "2.0.0", reason: "broken" }, { repository: "a/C", reason: "malware" }]);
    assert.equal(blocked[0]!.rejected, undefined);
    assert.deepEqual([blocked[1]!.plugin?.id, blocked[1]!.rejected], ["a/b", ["blocked: broken"]]);
    assert.deepEqual([blocked[2]!.plugin?.id, blocked[2]!.rejected], ["a/c", ["blocked: malware"]]);
    // In a repository holding several plugins, a block names the one it means.
    const shared = [version("a/b", "1.0.0", "1", "a/b"), version("a/b", "1.0.0", "1", "a/other")];
    assert.deepEqual(applyBlocks(shared, [{ repository: "a/b", plugin: "a/other", version: "1.0.0", reason: "broken" }]).map((item) => item.rejected), [undefined, ["blocked: broken"]]);
    assert.deepEqual(featuredPlugins(["a/b", "a/c"], blocked), ["a/b"]);
  });

  it("feature only what can be installed, in the file's order", () => {
    const versions = [version("a/x", "1.0.0", "1", "a/x"), version("a/y", "1.0.0", "1", "a/y"), version("a/z", "1.0.0", "1", null)];
    assert.deepEqual(featuredPlugins(["a/y", "a/gone", "a/z", "a/x"], versions), ["a/y", "a/x"]);
  });
});

describe("applyClaims", () => {
  const first = (dates: Record<string, string>) => new Map(Object.entries(dates));

  it("keeps a plugin with the repository released first", () => {
    const result = applyClaims([
      version("acme/ohmygame-tiles", "1.0.0", "2026-02-01"),
      version("acme/tiles", "1.0.0", "2026-01-01"),
      version("acme/tiles", "1.1.0", "2026-03-01"),
    ], first({ "acme/ohmygame-tiles": "2026-02-01", "acme/tiles": "2026-01-01" }));
    assert.deepEqual(result[0]!.rejected, ["plugin acme/tiles is already published from acme/tiles"]);
    assert.ok(result[1]!.plugin && result[2]!.plugin);
  });

  it("doesn't move a plugin when a repository's first release is blocked or missing", () => {
    // The first release of acme/tiles was left out of this run.
    const claimed = applyClaims([
      version("acme/tiles", "1.1.0", "2026-03-01"),
      version("acme/ohmygame-tiles", "1.0.0", "2026-02-01"),
    ], first({ "acme/tiles": "2026-01-01", "acme/ohmygame-tiles": "2026-02-01" }));
    assert.ok(claimed[0]!.plugin);
    assert.deepEqual(claimed[1]!.rejected, ["plugin acme/tiles is already published from acme/tiles"]);
  });

  it("ignores a release that can't be installed, which holds nothing", () => {
    const result = applyClaims(
      [version("acme/tiles", "1.0.0", "2026-01-01", null), version("acme/ohmygame-tiles", "1.0.0", "2026-02-01")],
      first({ "acme/tiles": "2026-01-01", "acme/ohmygame-tiles": "2026-02-01" }),
    );
    assert.ok(result[1]!.plugin);
  });

  it("never puts an unknown date before a known one", () => {
    const result = applyClaims(
      [version("acme/a-tiles", "1.0.0", "2026-02-01"), version("acme/tiles", "1.0.0", "2026-02-01")],
      first({ "acme/tiles": "2026-02-01" }),
    );
    assert.deepEqual(result[0]!.rejected, ["plugin acme/tiles is already published from acme/tiles"]);
    assert.ok(result[1]!.plugin);
  });
});
