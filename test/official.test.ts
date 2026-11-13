import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { judgeTarball, loadAppChecks, type AppChecks } from "../src/checks.ts";

// Each official plugin is packed as npm would publish it and judged as the
// index will judge it, so one the market would refuse never reaches npm.

const PLUGINS = fileURLToPath(new URL("../plugins/", import.meta.url));
let app: AppChecks;
let scratch: string;

before(async () => {
  app = await loadAppChecks(process.env.OHMYGAME_APP ?? "app");
  scratch = await mkdtemp(path.join(tmpdir(), "ohmygame-official-"));
});
after(() => rm(scratch, { recursive: true, force: true }));

describe("official plugins", async () => {
  const folders = (await readdir(PLUGINS, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  for (const folder of folders) {
    it(`${folder} is listed under @ohmygame as it is`, async () => {
      const dir = path.join(PLUGINS, folder);
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      const manifest = JSON.parse(await readFile(path.join(dir, ".ohmygame-plugin", "plugin.json"), "utf8"));
      assert.equal(pkg.name, `@ohmygame/${folder}`);
      assert.equal(manifest.id, `ohmygame/${folder}`);
      assert.equal(manifest.version, pkg.version);
      assert.equal(pkg.repository?.directory, `plugins/${folder}`);
      // npm's own script, run by this Node, so no shell splits the paths (npm sets npm_execpath for `npm test`).
      const npm = process.env.npm_execpath ? [process.execPath, process.env.npm_execpath] : ["npm"];
      const { stdout } = await promisify(execFile)(npm[0]!, [...npm.slice(1), "pack", "--json", "--pack-destination", scratch], { cwd: dir });
      const [{ filename }] = JSON.parse(stdout);
      const verdict = await judgeTarball(app, pkg.name, pkg.version, await readFile(path.join(scratch, filename)));
      assert.deepEqual(verdict.rejected, undefined);
      assert.equal(verdict.plugin?.id, manifest.id);
      if (manifest.icon) assert.ok(verdict.plugin?.icon, `${folder} icon must survive the app validator and package indexing`);
      for (const locale of ["en", "zh-CN"]) assert.ok(verdict.plugin?.displayName[locale] && verdict.plugin.description[locale]);
    });
  }
});
