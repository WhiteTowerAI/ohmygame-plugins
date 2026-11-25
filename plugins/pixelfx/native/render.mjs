// Effects rendered without the panel: sprite sheets and thumbnails as PNG,
// built from the same rendering and export code the panel uses.

import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { effects, categories } from "../panel/lib/fx/index.js";
import { ZH_CATEGORIES, ZH_FX } from "../panel/lib/zh-data.js";
import { checkEffect } from "../panel/check.js";
import { exportBudget, renderExportFrames, resampleNearestRGBA, sheetJson, sheetLayout } from "../panel/export.js";
import { defaultConfig, fullMeta } from "../panel/options.js";
import { effectPath, FX_ROOT, isEffectId, ROOT } from "../panel/project.js";

export const SOURCE_URL = "https://github.com/rrenovation/pixelfx";
export const EXPORT_DIR = `${ROOT}/exports`;

/** An effect as the panel's code takes it: its module, with its meta filled in. */
export function effectEntry(id, source, raw) {
  const meta = fullMeta(raw.meta);
  return { id, source, cat: id.split("/")[0], raw, mod: { ...raw, meta }, meta };
}

export const BUILTINS = Object.entries(effects).map(([id, raw]) => effectEntry(id, "builtin", raw));
const BUILTIN = new Map(BUILTINS.map((fx) => [fx.id, fx]));

const exists = (file) => stat(file).then(() => true, () => false);

/**
 * The project's effect `id` in `folder`, loaded from a fresh copy of its
 * `pixelfx/fx/` and `pixelfx/core/`, so an edit to any file it imports is
 * seen. `{ fx, text }`, or `{ error, text }` when it doesn't load.
 */
export async function loadProjectEffect(folder, id) {
  const file = path.join(folder, effectPath(id));
  const text = await readFile(file, "utf8");
  const copy = await mkdtemp(path.join(tmpdir(), "pixelfx-"));
  try {
    for (const part of ["fx", "core"]) {
      const from = path.join(folder, ROOT, part);
      if (await exists(from)) await cp(from, path.join(copy, part), { recursive: true, filter: (item) => !item.includes(`${path.sep}.`) });
    }
    const raw = await import(pathToFileURL(path.join(copy, "fx", `${id}.js`)).href);
    if (!raw?.meta || typeof raw.meta !== "object") return { error: "exports no meta", text };
    return { fx: effectEntry(id, "project", raw), text };
  } catch (error) {
    return { error: String(error?.message ?? error).split("\n")[0], text };
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

/**
 * The effect `id`: the project's copy when `folder` has one and `source`
 * isn't "builtin", else the built-in one. Throws when there is neither.
 */
export async function findEffect(id, source, folder) {
  if (!isEffectId(id)) throw new Error(`${id} isn't an effect id, such as fire/torch`);
  if (source !== "builtin" && folder && (await exists(path.join(folder, effectPath(id))))) {
    return { source: "project", path: effectPath(id), ...(await loadProjectEffect(folder, id)) };
  }
  if (source === "project") throw new Error(`The project has no effect ${id} at ${effectPath(id)}`);
  const fx = BUILTIN.get(id);
  if (!fx) throw new Error(`No effect ${id}. find_effects lists them.`);
  return { source: "builtin", fx };
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

const CATEGORY = new Map(categories.map((item) => [item.id, item]));
/** Words that find a built-in effect: its id, name, tags and description, and its category's, in English and Chinese. */
function wordsOf(fx) {
  const category = CATEGORY.get(fx.cat);
  return [fx.id, fx.meta.name, fx.meta.desc, ...(fx.meta.tags ?? []), category?.name, category?.blurb, ...(ZH_FX[fx.id] ?? []), ZH_CATEGORIES[fx.cat]?.name]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
}
const WORDS = new Map(BUILTINS.map((fx) => [fx.id, wordsOf(fx)]));

/** Built-in effects with every word of `query`, in the gallery's order. */
export function searchBuiltins(query = "") {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return BUILTINS.filter((fx) => words.every((word) => WORDS.get(fx.id).includes(word)));
}

/** The name a file of `fx` gets: its own name, as in fire/torch's torch. */
export const fileName = (fx) => fx.id.split("/")[1];
export { FX_ROOT };

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
