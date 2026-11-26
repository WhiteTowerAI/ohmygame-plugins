import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { judgeArchive, loadAppChecks, unpackArchive, type AppChecks } from "../src/checks.ts";
import { packRelease } from "../src/pack.ts";

// Each official plugin is packed as its GitHub release attaches it and judged
// as the index will judge it, so one the market would refuse is never released.

const APP = process.env.OHMYGAME_APP ?? "app";
const PLUGINS = fileURLToPath(new URL("../plugins/", import.meta.url));
let app: AppChecks;

before(async () => {
  app = await loadAppChecks(APP);
});

describe("official plugins", async () => {
  const folders = (await readdir(PLUGINS, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  for (const folder of folders) {
    it(`${folder} is released as ohmygame/${folder} as it is`, async () => {
      const dir = path.join(PLUGINS, folder);
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      const manifest = JSON.parse(await readFile(path.join(dir, ".ohmygame-plugin", "plugin.json"), "utf8"));
      assert.equal(manifest.id, `ohmygame/${folder}`);
      assert.equal(manifest.version, pkg.version);
      const { archive, files } = await packRelease(APP, dir);
      // Every runtime file in the preinstalled migration must survive npm's
      // filtering, which the release follows, including dot-directories and
      // the Godot ignore template. The host validator alone cannot detect a
      // missing unreferenced helper.
      if (PREINSTALLED.has(folder)) {
        const packed = new Set(files);
        for (const file of await runtimeFiles(dir)) {
          assert.ok(packed.has(file), `${folder}: npm omitted ${file}`);
        }
        assert.ok(packed.has("LICENSE"));
        if (folder === "godot") {
          assert.ok(packed.has("templates/godot-game/gitignore"));
          assert.equal(packed.has("templates/godot-game/.gitignore"), false);
        }
      }
      // A project template is copied into projects whole, so npm must keep every file of it.
      if (TEMPLATES[folder]) {
        const packed = new Set(files);
        for (const file of await runtimeFiles(path.join(dir, TEMPLATES[folder]))) {
          assert.ok(packed.has(`${TEMPLATES[folder]}/${file}`), `${folder}: npm omitted ${TEMPLATES[folder]}/${file}`);
        }
        // The story template's runtime is built from source the package leaves out.
        if (folder === "interactive-story") assert.ok(!files.some((file) => file.startsWith("runtime/")));
      }
      if (folder === "claude-code-game-studios") {
        const packed = new Set(files);
        assert.ok(packed.has("template/gitignore"));
        // A script the template runs stays executable once the app unpacks the release.
        const scratch = await mkdtemp(path.join(tmpdir(), "ohmygame-official-"));
        try {
          await writeFile(path.join(scratch, "release.zip"), archive);
          const root = await unpackArchive(app, path.join(scratch, "release.zip"), await mkdtemp(path.join(scratch, "package-")));
          assert.ok((await stat(path.join(root, "template/.claude/scripts/one-shot-check.sh"))).mode & 0o100);
          assert.equal((await stat(path.join(root, "template/.claude/scripts/adr-status.sh"))).mode & 0o111, 0);
        } finally {
          await rm(scratch, { recursive: true, force: true });
        }
      }
      const verdict = await judgeArchive(app, archive, { owner: "WhiteTowerAI", version: manifest.version, name: folder });
      assert.deepEqual(verdict.rejected, undefined);
      assert.equal(verdict.plugin?.id, manifest.id);
      if (manifest.icon) assert.ok(verdict.plugin?.icon, `${folder} icon must survive the app validator and package indexing`);
      for (const locale of ["en", "zh-CN"]) assert.ok(verdict.plugin?.displayName[locale] && verdict.plugin.description[locale]);
    });
  }
});

/** The folders of official plugins' project templates. */
const TEMPLATES: Record<string, string> = {
  "claude-code-game-studios": "template",
  "interactive-story": "templates/story",
};

const PREINSTALLED = new Set([
  "aseprite", "blender", "cocos-creator", "douyin-minigame", "game-studio",
  "godot", "taptap", "taptap-maker", "tiled", "unity", "unreal-engine",
  "web-game-studio", "wechat-minigame",
]);

async function runtimeFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await runtimeFiles(directory, file));
    else if (entry.isFile()) files.push(file);
    else assert.fail(`Unexpected non-file in preinstalled plugin: ${file}`);
  }
  return files;
}
