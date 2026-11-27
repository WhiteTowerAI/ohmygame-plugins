import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
// @ts-expect-error The plugin's native code is plain JavaScript.
import { ensureWebPreset } from "../plugins/godot/native/index.mjs";

it("repairs only the Web preset, preserving explicit values and other sections", async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), "godot-presets-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "export_presets.cfg");
  const name = '  name = "Web" ; browser build';
  const previous = [
    "[preset.0]", 'name="Desktop"', 'include_filter="*.csv"', "",
    "[preset.1]", name, 'platform="Web"', 'exclude_filter=".ohmygame/*"', "",
    "[preset.1.options]", 'include_filter="custom option"', "",
  ].join("\r\n");
  await writeFile(file, previous);
  const repaired = previous.replace(name, 'include_filter=""\r\n' + name);
  await ensureWebPreset(folder);
  assert.equal(await readFile(file, "utf8"), repaired);
  await ensureWebPreset(folder);
  assert.equal(await readFile(file, "utf8"), repaired);
  const customized = repaired.replace('include_filter=""', 'include_filter = "*.json"');
  await writeFile(file, customized);
  await ensureWebPreset(folder);
  assert.equal(await readFile(file, "utf8"), customized);
  const otherPlatform = previous.replace('platform="Web"', 'platform="Windows Desktop"');
  await writeFile(file, otherPlatform);
  await ensureWebPreset(folder);
  assert.equal(await readFile(file, "utf8"), otherPlatform);
});

it("creates a complete Web preset and allocates a free index beside existing presets", async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), "godot-presets-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, "export_presets.cfg");
  await ensureWebPreset(folder);
  const generated = await readFile(file, "utf8");
  assert.match(generated, /^\[preset\.0\]$/m);
  assert.match(generated, /^include_filter=""$/m);
  const desktop = '[preset.4]\r\nname="Desktop"\r\n\r\n[preset.4.options]\r\nname="Web"';
  await writeFile(file, desktop);
  await ensureWebPreset(folder);
  const appended = generated.replaceAll("preset.0", "preset.5").replaceAll("\n", "\r\n");
  assert.equal(await readFile(file, "utf8"), desktop + "\r\n\r\n" + appended);
});
