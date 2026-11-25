// Effects rendered without the panel: sprite sheets and thumbnails as PNG,
// built from the same rendering and export code the panel uses.

import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { effects, categories } from "../panel/lib/fx/index.js";
import { ZH_CATEGORIES, ZH_FX } from "../panel/lib/zh-data.js";
import { checkEffect } from "../panel/check.js";
import { exportBudget, renderExportFrames, resampleNearestRGBA, sheetJson, sheetLayout } from "../panel/export.js";
import { defaultConfig, fullMeta } from "../panel/options.js";
import { effectPath, isEffectId, ROOT } from "../panel/project.js";

export const SOURCE_URL = "https://github.com/rrenovation/pixelfx";
export const EXPORT_DIR = `${ROOT}/exports`;

/** An effect as the panel's code takes it: its module, with its meta filled in. */
export function effectEntry(id, source, raw) {
  const meta = fullMeta(raw.meta);
  return { id, source, cat: id.split("/")[0], raw, mod: { ...raw, meta }, meta };
}

export const BUILTINS = Object.entries(effects).map(([id, raw]) => effectEntry(id, "builtin", raw));
const BUILTIN = new Map(BUILTINS.map((fx) => [fx.id, fx]));

/** Whether `file` is there; an error other than its absence is thrown, not taken as "no". */
const exists = (file) =>
  stat(file).then(
    () => true,
    (error) => {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
      throw error;
    },
  );

const PLUGIN_DIR = fileURLToPath(new URL("..", import.meta.url));
const CHILD = fileURLToPath(new URL("./effect-child.mjs", import.meta.url));

/** The project effect `id` in a folder holding a copy of `pixelfx/fx/` and `pixelfx/core/`, as `{ fx }` or `{ error }`. */
export async function loadEffectFrom(copy, id) {
  try {
    const raw = await import(pathToFileURL(path.join(copy, "fx", `${id}.js`)).href);
    if (!raw?.meta || typeof raw.meta !== "object") return { error: "exports no meta" };
    return { fx: effectEntry(id, "project", raw) };
  } catch (error) {
    return { error: String(error?.message ?? error).split("\n")[0] };
  }
}

/**
 * Checks the project's effect `id` in `folder` and, when it passes and
 * `render` is set, renders its sheet: `{ check, sheet? }`. The project's
 * code runs in a process of its own that reads only a fresh copy of
 * `pixelfx/fx/` and `pixelfx/core/` and the plugin, with no environment, no
 * writes and no processes of its own, so an edit to any file it imports is
 * seen and nothing it loads stays behind.
 */
export async function runProjectEffect(folder, id, { flip, seed, render = true } = {}, signal) {
  const text = await readFile(path.join(folder, effectPath(id)), "utf8");
  const copy = await realpath(await mkdtemp(path.join(tmpdir(), "pixelfx-")));
  try {
    for (const part of ["fx", "core"]) {
      const from = path.join(folder, ROOT, part);
      if (await exists(from)) await cp(from, path.join(copy, part), { recursive: true, filter: (item) => !path.relative(from, item).split(path.sep).some((name) => name.startsWith(".")) });
    }
    const input = JSON.stringify({ copy, id, text, flip: !!flip, ...(Number.isFinite(seed) ? { seed } : {}), render });
    const out = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--permission", `--allow-fs-read=${copy}`, `--allow-fs-read=${PLUGIN_DIR}`, "--max-old-space-size=1024", CHILD], {
        cwd: copy,
        env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
        stdio: ["pipe", "pipe", "pipe"],
        signal,
      });
      const stdout = [];
      let stderr = "";
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-4000)));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve(Buffer.concat(stdout).toString("utf8"));
        const last = stderr.trim().split("\n").filter(Boolean).pop();
        reject(new Error(`Rendering ${id} stopped${last ? `: ${last}` : ` with code ${code}`}`));
      });
      child.stdin.end(input);
    });
    const { check, sheet } = JSON.parse(out);
    return { check, ...(sheet ? { sheet: { ...sheet, png: Buffer.from(sheet.png, "base64") } } : {}) };
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

const BUILTIN_DIR = fileURLToPath(new URL("../panel/lib/fx/", import.meta.url));

/**
 * The effect `id`: the project's copy when `folder` has one and `source`
 * isn't "builtin", as `{ source: "project", path }` for `runProjectEffect`,
 * else the built-in one, as `{ source: "builtin", fx, text }`. Throws when
 * there is neither.
 */
export async function findEffect(id, source, folder) {
  if (!isEffectId(id)) throw new Error(`${id} isn't an effect id, such as fire/torch`);
  if (source !== "builtin" && folder && (await exists(path.join(folder, effectPath(id))))) return { source: "project", path: effectPath(id) };
  if (source === "project") throw new Error(`The project has no effect ${id} at ${effectPath(id)}`);
  const fx = BUILTIN.get(id);
  if (!fx) throw new Error(`No effect ${id}. find_effects lists them.`);
  return { source: "builtin", fx, text: await readFile(path.join(BUILTIN_DIR, `${id}.js`), "utf8") };
}

/** Settings a sheet is rendered with: the effect's defaults without its actor, mirrored when `flip`. */
export function sheetConfig(fx, { flip = false, seed } = {}) {
  return { ...defaultConfig(fx), actorMode: "hide", flip: !!flip, ...(Number.isFinite(seed) ? { seed } : {}) };
}

/** The transparent sprite sheet of `fx` as `{ png, json, columns, rows, frames, width, height }`. */
export function renderSheet(fx, cfg = sheetConfig(fx)) {
  const budget = exportBudget(fx, cfg);
  if (!budget.ok) throw new Error(`${fx.id} is too big to render: ${budget.frames} frames of ${budget.w}×${budget.h}`);
  const seq = renderExportFrames(fx, cfg);
  const { w, h, totalFrames: n } = seq;
  const { cols, rows } = sheetLayout(n, w, h);
  const width = cols * w;
  const rgba = new Uint8Array(width * rows * h * 4);
  seq.frames.forEach(({ rgba: frame }, i) => {
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    for (let row = 0; row < h; row++) rgba.set(frame.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * width + x) * 4);
  });
  return { png: encodePng(rgba, width, rows * h), json: sheetJson(fx, cfg, seq, cols, rows), columns: cols, rows, frames: n, width, height: rows * h };
}

/** A PNG of the frame of `fx` with the most pixels drawn, scaled up whole so its longer side is at most `size`. */
export function renderThumbnail(fx, size = 256) {
  const cfg = sheetConfig(fx);
  if (!exportBudget(fx, cfg).ok) return undefined;
  const { w, h, frames } = renderExportFrames(fx, cfg);
  let best = frames[0].rgba;
  let most = -1;
  for (const { rgba } of frames) {
    let drawn = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) drawn++;
    if (drawn > most) [best, most] = [rgba, drawn];
  }
  const scale = Math.max(1, Math.floor(size / Math.max(w, h)));
  const pixels = scale > 1 ? resampleNearestRGBA(best, w, h, w * scale, h * scale) : best;
  return { png: encodePng(pixels, w * scale, h * scale), width: w * scale, height: h * scale };
}

/** A check of `fx` as the panel's check_effect makes it, or of an effect that didn't load. */
export function checkLoaded({ fx, error, text }) {
  return fx ? checkEffect(fx.raw, text ?? "") : { ok: false, errors: [`Doesn't load: ${error}`], warnings: [], stats: {} };
}

const CATEGORY = new Map(categories.map((item) => [item.id, item.name]));
/** What the panel's search looks through for a built-in effect: its id, name, description and tags, and its category's name, in English and Chinese. */
function wordsOf(fx) {
  const zh = ZH_FX[fx.id] ?? [];
  return [fx.id, fx.meta.name, fx.meta.desc, zh[0], zh[1], CATEGORY.get(fx.cat), ZH_CATEGORIES[fx.cat]?.name, ...(fx.meta.tags ?? [])].join(" ").toLowerCase();
}
const WORDS = new Map(BUILTINS.map((fx) => [fx.id, wordsOf(fx)]));

/** Built-in effects whose words hold `query`, as the panel's search finds them, in the gallery's order. */
export function searchBuiltins(query = "") {
  const phrase = String(query).trim().toLowerCase();
  return BUILTINS.filter((fx) => WORDS.get(fx.id).includes(phrase));
}

/** The name a file of `fx` gets: its own name, as in fire/torch's torch. */
export const fileName = (id) => id.split("/")[1];

// ---- PNG: 8-bit RGBA, no interlace, each row with no filter.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** `rgba`, `width` × `height` pixels of 4 bytes, as a PNG. */
export function encodePng(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
