// The level editor's map model: Tiled JSON maps (.tmj) read, changed and
// written back without losing anything the editor doesn't understand. No DOM:
// the panel draws it, and the tests run it in Node.
//
// A map is kept as the JSON Tiled wrote, parsed in key order. Only the tile
// layers' data is decoded, into one Uint32Array per layer, and written back
// on save, in the layer's own encoding. Everything else is changed in place,
// so a field the editor never touched is written as it was read: the same
// keys in the same order, and the same number and string spellings.

/** GID flag bits (https://doc.mapeditor.org/en/stable/reference/global-tile-ids/). */
export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;
/** Rotates hexagonal tiles by 120°; ignored on orthogonal maps but kept. */
export const ROTATE_HEX = 0x10000000;
export const GID_MASK = 0x0fffffff;

/** The tile a GID names, without its flip flags. */
export const tileOf = (gid) => (gid & GID_MASK) >>> 0;
/** A GID's flag bits only. */
export const flagsOf = (gid) => (gid & ~GID_MASK) >>> 0;

// ---------------------------------------------------------------------------
// JSON in and out, keeping the file's own layout.

/**
 * Each value's text as the file spelled it, where it differs from how
 * JavaScript writes the value: `1.0`, `0.333333333333333`, `"..\/tiles.png"`.
 * Keyed by the object or array holding it, then by key or index.
 */
const spellings = new WeakMap();

/**
 * Parses JSON, remembering how numbers and strings were spelled so an
 * unchanged value is written back the same way. Uses the source text that
 * `JSON.parse` gives a reviver (Chromium 114+, Node 21+); without it the
 * values are kept and only their spelling may change.
 */
export function parseJson(text) {
  return JSON.parse(text, function (key, value, context) {
    const source = context?.source;
    if (typeof source === "string" && (typeof value === "number" || typeof value === "string")) {
      if (source !== (typeof value === "number" ? String(value) : JSON.stringify(value))) {
        let held = spellings.get(this);
        if (!held) spellings.set(this, (held = new Map()));
        held.set(key, { source, value });
      }
    }
    return value;
  });
}

/** How a file lays out its JSON, read from the file itself (see `detectStyle`). */
export const TILED_STYLE = Object.freeze({
  kind: "tiled",
  indent: "    ",
  wrap: 0,
  escapeSlash: true,
  escapeUnicode: true,
  prefix: "",
  suffix: "",
  eol: "\n",
});

/**
 * The layout `text` was written in, so the map is saved the same way. Tiled
 * writes maps with its own JSON writer (`src/plugins/json/qjsonparser`):
 * `"key":value` with no space, one key per line indented by one space past
 * its object, objects in arrays on their own lines, arrays wrapped every map
 * width items, `/` written as `\/` and non-ASCII as `\u` escapes. Other tools
 * write `JSON.stringify(map, null, n)`, some with tile data on one line. The
 * candidates are tried in turn; the first that reproduces the file exactly
 * wins (`exact`), else the closest guess.
 */
export function detectStyle(text, doc) {
  let body = text;
  let prefix = "";
  if (body.startsWith("﻿")) {
    prefix = "﻿";
    body = body.slice(1);
  }
  const trimmed = body.replace(/\s+$/, "");
  const suffix = body.slice(trimmed.length);
  const eol = trimmed.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\r\n" ? trimmed.replaceAll("\r\n", "\n") : trimmed;
  const shared = {
    prefix,
    suffix,
    eol,
    escapeSlash: /\\\//.test(trimmed),
    escapeUnicode: /\\u(?:00[89a-fA-F][0-9a-fA-F]|0[1-9a-fA-F][0-9a-fA-F]{2}|[1-9a-fA-F][0-9a-fA-F]{3})/.test(trimmed),
  };
  const wrap = tiledWrap(doc);
  const indent = /\n([ \t]+)"/.exec(normalized)?.[1] ?? "  ";
  const keySep = /"\s*:\s/.test(normalized) ? ": " : ":";
  const tiled = [
    { ...shared, kind: "tiled", indent: "    ", wrap, escapeSlash: true, escapeUnicode: true },
    { ...shared, kind: "tiled", indent: "    ", wrap },
    { ...shared, kind: "tiled", indent: "    ", wrap: 0 },
  ];
  const standard = [
    { ...shared, kind: "standard", indent, keySep, inline: true, itemSep: ", " },
    { ...shared, kind: "standard", indent, keySep, inline: true, itemSep: "," },
    { ...shared, kind: "standard", indent, keySep, inline: false, itemSep: ", " },
  ];
  const compact = [{ ...shared, kind: "compact" }];
  const looksTiled = normalized.startsWith('{ "') || /\n {8}\{\n/.test(normalized);
  const candidates = !normalized.includes("\n")
    ? [...compact, ...tiled, ...standard]
    : looksTiled
      ? [...tiled, ...standard, ...compact]
      : [...standard, ...tiled, ...compact];
  for (const style of candidates) {
    if (stringifyJson(doc, style) === normalized) return { ...style, exact: true };
  }
  return { ...candidates[0], exact: false };
}

/** How often Tiled wraps arrays: after each row of a map's tiles. */
function tiledWrap(doc) {
  if (!doc || typeof doc !== "object") return 0;
  if (doc.infinite) return doc.editorsettings?.chunksize?.width ?? 16;
  return Number.isInteger(doc.width) ? doc.width : 0;
}

/** The layout for a new map: Tiled's own. */
export function newMapStyle(doc) {
  return { ...TILED_STYLE, wrap: tiledWrap(doc), suffix: "\n" };
}

/** Writes `value` in `style`, without its prefix, suffix or line endings (see `formatJson`). */
export function stringifyJson(value, style) {
  const out = [];
  if (style.kind === "tiled") writeTiled(value, 0, out, style, undefined, "");
  else if (style.kind === "compact") writeCompact(value, out, style, undefined, "");
  else writeStandard(value, 0, out, style, undefined, "");
  return out.join("");
}

/** The whole file: `stringifyJson` with the file's prefix, suffix and line endings. */
export function formatJson(value, style) {
  let text = stringifyJson(value, style);
  if (style.eol && style.eol !== "\n") text = text.replaceAll("\n", style.eol);
  return (style.prefix ?? "") + text + (style.suffix ?? "");
}

function scalar(value, style, holder, key) {
  if (holder !== undefined) {
    const spelled = spellings.get(holder)?.get(key);
    if (spelled && Object.is(spelled.value, value)) return spelled.source;
  }
  if (typeof value === "string") return quote(value, style);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    if (style.kind === "standard") return String(value);
    // Tiled's 15 digits, unless that would change the value.
    const short = formatG15(value);
    return Number(short) === value ? short : String(value);
  }
  if (value === true || value === false || value === null) return String(value);
  return "null";
}

/** A number as Qt's `QString::number(d, 'g', 15)` writes it, which is how Tiled writes doubles. */
export function formatG15(value) {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const [mantissa, exponentText] = value.toExponential(14).split("e");
  const exponent = Number(exponentText);
  const trim = (text) => (text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text);
  if (exponent < -4 || exponent >= 15) {
    const digits = String(Math.abs(exponent)).padStart(2, "0");
    return `${trim(mantissa)}e${exponent < 0 ? "-" : "+"}${digits}`;
  }
  return trim(value.toPrecision(15));
}

function quote(text, style) {
  let quoted = JSON.stringify(text);
  if (style.escapeSlash) quoted = quoted.replaceAll("/", "\\/");
  if (style.escapeUnicode)
    quoted = quoted.replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return quoted;
}

const isContainer = (value) => value !== null && typeof value === "object";

function writeTiled(value, depth, out, style, holder, key) {
  if (Array.isArray(value)) {
    const indent = style.indent.repeat(depth);
    out.push("[");
    for (let i = 0; i < value.length; i++) {
      if (i) out.push(style.wrap && i % style.wrap === 0 ? `,\n${indent}` : ", ");
      const item = value[i];
      if (isContainer(item)) writeTiled(item, depth + 1, out, style, value, String(i));
      else out.push(scalar(item, style, value, String(i)));
    }
    out.push("]");
  } else if (isContainer(value)) {
    const indent = style.indent.repeat(depth);
    out.push(depth ? `\n${indent}{\n` : "{");
    let first = true;
    for (const name of Object.keys(value)) {
      if (!first) out.push(",\n");
      first = false;
      out.push(`${indent} ${quote(name, style)}:`);
      const item = value[name];
      if (isContainer(item)) writeTiled(item, depth + 1, out, style, value, name);
      else out.push(scalar(item, style, value, name));
    }
    out.push(`\n${indent}}`);
  } else out.push(scalar(value, style, holder, key));
}

function writeCompact(value, out, style, holder, key) {
  if (Array.isArray(value)) {
    out.push("[");
    value.forEach((item, i) => {
      if (i) out.push(",");
      writeCompact(item, out, style, value, String(i));
    });
    out.push("]");
  } else if (isContainer(value)) {
    out.push("{");
    Object.keys(value).forEach((name, i) => {
      if (i) out.push(",");
      out.push(`${quote(name, style)}:`);
      writeCompact(value[name], out, style, value, name);
    });
    out.push("}");
  } else out.push(scalar(value, style, holder, key));
}

function writeStandard(value, depth, out, style, holder, key) {
  const inner = style.indent.repeat(depth + 1);
  if (Array.isArray(value)) {
    if (!value.length) return void out.push("[]");
    if (style.inline && !value.some(isContainer)) {
      out.push("[", value.map((item, i) => scalar(item, style, value, String(i))).join(style.itemSep), "]");
      return;
    }
    out.push("[\n");
    value.forEach((item, i) => {
      if (i) out.push(",\n");
      out.push(inner);
      writeStandard(item, depth + 1, out, style, value, String(i));
    });
    out.push(`\n${style.indent.repeat(depth)}]`);
  } else if (isContainer(value)) {
    const names = Object.keys(value);
    if (!names.length) return void out.push("{}");
    out.push("{\n");
    names.forEach((name, i) => {
      if (i) out.push(",\n");
      out.push(inner, quote(name, style), style.keySep);
      writeStandard(value[name], depth + 1, out, style, value, name);
    });
    out.push(`\n${style.indent.repeat(depth)}}`);
  } else out.push(scalar(value, style, holder, key));
}

/**
 * Sets `key` on `object`. A new key goes where Tiled would put it, in
 * alphabetical order, when the object's keys already are; otherwise last.
 * The object stays the same object, so references to it hold.
 */
export function setKey(object, key, value) {
  if (Object.hasOwn(object, key)) {
    object[key] = value;
    return;
  }
  const names = Object.keys(object);
  const sorted = names.every((name, i) => i === 0 || names[i - 1] <= name);
  if (!sorted || !names.length || names.at(-1) < key) {
    object[key] = value;
    return;
  }
  const entries = Object.entries(object);
  for (const name of names) delete object[name];
  let placed = false;
  for (const [name, item] of entries) {
    if (!placed && key < name) {
      object[key] = value;
      placed = true;
    }
    object[name] = item;
  }
  if (!placed) object[key] = value;
}

/** Fields kept by reference in a capture: a layer's contents, which have their own history. */
const SHARED_FIELDS = ["data", "objects", "layers", "chunks"];

const copyField = (name, value) => (SHARED_FIELDS.includes(name) || !isContainer(value) ? value : structuredClone(value));

/** An object's fields in order, to put back with `restoreFields`. */
export function captureFields(object) {
  return Object.entries(object).map(([name, value]) => [name, copyField(name, value)]);
}

/** Puts back captured fields in their order, in the same object; the capture stays reusable. */
export function restoreFields(object, fields) {
  for (const name of Object.keys(object)) delete object[name];
  for (const [name, value] of fields) object[name] = copyField(name, value);
}

// ---------------------------------------------------------------------------
// Paths, relative to the project, with forward slashes.

export function dirname(path) {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

export function basename(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** `relative` resolved against the folder `file` is in; `undefined` if it leaves the project or is absolute. */
export function resolvePath(file, relative) {
  if (!relative || /^(?:[a-zA-Z]:)?[\\/]/.test(relative) || /^[a-z][a-z0-9+.-]*:/i.test(relative)) return undefined;
  const parts = dirname(file).split("/").filter(Boolean);
  for (const part of relative.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** The path from the folder `file` is in to `target`, as Tiled writes image paths. */
export function relativePath(file, target) {
  const from = dirname(file).split("/").filter(Boolean);
  const to = target.split("/").filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
}

// ---------------------------------------------------------------------------
// Tile data.

/** Base64 to bytes. */
export function fromBase64(text) {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const STREAM_FORMAT = { zlib: "deflate", gzip: "gzip" };

async function transform(bytes, stream) {
  const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

/** Whether a layer's data can be read here: plain arrays, or base64 that is plain, gzip or zlib. */
export function readableEncoding(encoding, compression) {
  if (!encoding || encoding === "csv") return true;
  return encoding === "base64" && (!compression || compression in STREAM_FORMAT);
}

/** A layer's `data` as GIDs (flags included); throws for zstd or anything else it can't read. */
export async function decodeData(data, encoding, compression, count) {
  if (!encoding || encoding === "csv") {
    if (!Array.isArray(data)) throw new Error("tile data isn't an array");
    const gids = new Uint32Array(count ?? data.length);
    for (let i = 0; i < gids.length && i < data.length; i++) gids[i] = Number(data[i]) >>> 0;
    return gids;
  }
  if (encoding !== "base64") throw new Error(`unknown encoding ${encoding}`);
  let bytes = fromBase64(String(data));
  if (compression) {
    const format = STREAM_FORMAT[compression];
    if (!format) throw new Error(`unsupported compression ${compression}`);
    bytes = await transform(bytes, new DecompressionStream(format));
  }
  const gids = new Uint32Array(count ?? Math.floor(bytes.length / 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < gids.length && i * 4 + 3 < bytes.length; i++) gids[i] = view.getUint32(i * 4, true);
  return gids;
}

/** GIDs in a layer's encoding: an array, or a base64 string, compressed as before. */
export async function encodeData(gids, encoding, compression) {
  if (!encoding || encoding === "csv") return Array.from(gids);
  const bytes = new Uint8Array(gids.length * 4);
  const view = new DataView(bytes.buffer);
  gids.forEach((gid, i) => view.setUint32(i * 4, gid, true));
  if (!compression) return toBase64(bytes);
  const format = STREAM_FORMAT[compression];
  if (!format) throw new Error(`unsupported compression ${compression}`);
  return toBase64(await transform(bytes, new CompressionStream(format)));
}

// ---------------------------------------------------------------------------
// Maps.

/** Whether parsed JSON is a Tiled map. */
export function isTiledMap(doc) {
  return (
    isContainer(doc) &&
    !Array.isArray(doc) &&
    (doc.type === "map" || (doc.type === undefined && Array.isArray(doc.layers) && Array.isArray(doc.tilesets) && "tilewidth" in doc))
  );
}

/** Calls `visit(layer, parentArray, depth)` for each layer, groups before their children. */
export function walkLayers(layers, visit, depth = 0) {
  for (const layer of layers ?? []) {
    if (visit(layer, layers, depth) === false) continue;
    if (layer.type === "group") walkLayers(layer.layers, visit, depth + 1);
  }
}

/**
 * Opens a map's text: the parsed document, its layout, each tile layer's
 * GIDs, and why it can only be read, if it can.
 */
export async function openMap(text, path) {
  const doc = parseJson(text.startsWith("﻿") ? text.slice(1) : text);
  if (!isTiledMap(doc)) throw new Error("not a Tiled map");
  const map = {
    path,
    doc,
    style: detectStyle(text, doc),
    /** Tile layer object → `{ gids, original, width, height }`, or `{ chunks }` for infinite maps. */
    tiles: new Map(),
    /** Why the map is read-only: `infinite`, `zstd`, `orientation`, `encoding`. */
    readOnly: [],
  };
  if (doc.infinite) map.readOnly.push("infinite");
  if (doc.orientation && doc.orientation !== "orthogonal") map.readOnly.push("orientation");
  const pending = [];
  walkLayers(doc.layers, (layer) => {
    if (layer.type === "tilelayer") pending.push(loadTileLayer(map, layer));
  });
  await Promise.all(pending);
  return map;
}

async function loadTileLayer(map, layer) {
  const { encoding, compression } = layer;
  if (!readableEncoding(encoding, compression)) {
    const reason = compression === "zstd" ? "zstd" : "encoding";
    if (!map.readOnly.includes(reason)) map.readOnly.push(reason);
    map.tiles.set(layer, { unreadable: reason });
    return;
  }
  if (Array.isArray(layer.chunks)) {
    const chunks = await Promise.all(
      layer.chunks.map(async (chunk) => ({
        x: chunk.x,
        y: chunk.y,
        width: chunk.width,
        height: chunk.height,
        gids: await decodeData(chunk.data, encoding, compression, chunk.width * chunk.height),
      })),
    );
    map.tiles.set(layer, { chunks });
    return;
  }
  const width = layer.width ?? map.doc.width;
  const height = layer.height ?? map.doc.height;
  const gids = await decodeData(layer.data ?? [], encoding, compression, width * height);
  map.tiles.set(layer, { gids, original: gids.slice(), originalData: typeof layer.data === "string" ? layer.data : undefined, width, height });
}

export const isEditable = (map) => map.readOnly.length === 0;

/**
 * The map's text to save: tile layers whose tiles changed are encoded again
 * (unchanged ones keep the exact text they had), then the whole map in its
 * own layout. Call `markSaved` once it is written. The tiles are taken as
 * they are when this is called; edits made while it encodes or while the
 * file is written aren't in this text, and stay unsaved.
 */
export async function serializeMap(map) {
  if (!isEditable(map)) throw new Error("this map can only be read here");
  // Every layer's tiles at one moment, before anything is awaited.
  const snapshots = [...map.tiles].filter(([, tiles]) => tiles.gids).map(([layer, tiles]) => [layer, tiles, tiles.gids.slice()]);
  const saved = new Map();
  for (const [layer, tiles, gids] of snapshots) {
    if (tiles.original && tiles.originalData !== undefined && sameData(gids, tiles.original)) {
      // Back as it was saved: a base64 layer keeps its exact text, which
      // compressing again might not reproduce.
      setKey(layer, "data", tiles.originalData);
    } else if (Array.isArray(layer.data) && layer.data.length === gids.length && (!layer.encoding || layer.encoding === "csv")) {
      gids.forEach((gid, i) => (layer.data[i] = gid));
    } else setKey(layer, "data", await encodeData(gids, layer.encoding, layer.compression));
    saved.set(tiles, { gids, data: typeof layer.data === "string" ? layer.data : undefined });
  }
  map.serialized = saved;
  return formatJson(map.doc, map.style);
}

/**
 * After the text from the last `serializeMap` is written: what is on disk
 * now, which is the tiles as they were serialized, not as they are now.
 */
export function markSaved(map) {
  for (const [tiles, { gids, data }] of map.serialized ?? []) {
    tiles.original = gids;
    tiles.originalData = data;
  }
  map.serialized = undefined;
}

function sameData(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Tilesets.

/**
 * The tileset a GID belongs to and its local tile id. `tilesets` are the
 * resolved tilesets, each with `firstgid`, sorted or not.
 */
export function findTileset(tilesets, gid) {
  const tile = tileOf(gid);
  if (!tile) return undefined;
  let found;
  for (const tileset of tilesets) {
    if (tileset.firstgid <= tile && (!found || tileset.firstgid > found.firstgid)) found = tileset;
  }
  return found ? { tileset: found, id: tile - found.firstgid } : undefined;
}

/**
 * Where tile `id` is drawn from in a tileset (embedded JSON or the external
 * one it points to, resolved): an image tileset's grid cell, or a
 * collection's own image. `{ image, sx, sy, width, height }` with `image` a
 * path relative to the tileset's file.
 */
export function tileSource(tileset, id) {
  if (tileset.image && tileset.columns > 0) {
    if (tileset.tilecount !== undefined && id >= tileset.tilecount) return undefined;
    const margin = tileset.margin ?? 0;
    const spacing = tileset.spacing ?? 0;
    const column = id % tileset.columns;
    const row = Math.floor(id / tileset.columns);
    return {
      image: tileset.image,
      sx: margin + column * (tileset.tilewidth + spacing),
      sy: margin + row * (tileset.tileheight + spacing),
      width: tileset.tilewidth,
      height: tileset.tileheight,
    };
  }
  const tile = tilesOf(tileset).find((entry) => entry.id === id);
  if (!tile?.image) return undefined;
  return {
    image: tile.image,
    sx: tile.x ?? 0,
    sy: tile.y ?? 0,
    width: tile.width ?? tile.imagewidth,
    height: tile.height ?? tile.imageheight,
  };
}

/** The local ids of a tileset's tiles, in palette order. */
export function tileIds(tileset) {
  if (tileset.image && tileset.columns > 0) {
    const count = tileset.tilecount ?? tileset.columns * Math.floor((tileset.imageheight ?? 0) / tileset.tileheight);
    return Array.from({ length: count }, (_, i) => i);
  }
  return tilesOf(tileset).filter((tile) => tile.image).map((tile) => tile.id).sort((a, b) => a - b);
}

/**
 * A tileset's `tiles` as a list of `{ id, … }`. Tiled before 1.2 wrote them
 * as an object keyed by tile id; that is read here and never rewritten.
 */
export function tilesOf(tileset) {
  const tiles = tileset?.tiles;
  if (Array.isArray(tiles)) return tiles.filter(isContainer);
  if (!isContainer(tiles)) return [];
  return Object.entries(tiles)
    .filter(([key, tile]) => isContainer(tile) && /^\d+$/.test(key))
    .map(([key, tile]) => ({ ...tile, id: Number(key) }));
}

/** Columns and tile count of an image cut into `tilewidth` × `tileheight` tiles. */
export function gridOf(imagewidth, imageheight, tilewidth, tileheight, margin = 0, spacing = 0) {
  const columns = Math.max(0, Math.floor((imagewidth - 2 * margin + spacing) / (tilewidth + spacing)));
  const rows = Math.max(0, Math.floor((imageheight - 2 * margin + spacing) / (tileheight + spacing)));
  return { columns, tilecount: columns * rows };
}

/**
 * An external tileset in Tiled's XML format (.tsx), as the JSON fields this
 * editor reads. `root` is the parsed `<tileset>` element; any DOM-like
 * object with `getAttribute`, `children` and `tagName` works.
 */
export function tilesetFromXml(root) {
  const number = (element, name, fallback) => {
    const value = element.getAttribute(name);
    return value === null || value === "" ? fallback : Number(value);
  };
  const children = (element, tag) => [...element.children].filter((child) => child.tagName === tag);
  const tileset = {
    name: root.getAttribute("name") ?? "",
    tilewidth: number(root, "tilewidth", 0),
    tileheight: number(root, "tileheight", 0),
    tilecount: number(root, "tilecount", undefined),
    columns: number(root, "columns", 0),
    margin: number(root, "margin", 0),
    spacing: number(root, "spacing", 0),
  };
  const offset = children(root, "tileoffset")[0];
  if (offset) tileset.tileoffset = { x: number(offset, "x", 0), y: number(offset, "y", 0) };
  const renderSize = root.getAttribute("tilerendersize");
  if (renderSize) tileset.tilerendersize = renderSize;
  const image = children(root, "image")[0];
  if (image) {
    tileset.image = image.getAttribute("source") ?? "";
    tileset.imagewidth = number(image, "width", undefined);
    tileset.imageheight = number(image, "height", undefined);
  }
  const tiles = children(root, "tile")
    .map((tile) => {
      const own = children(tile, "image")[0];
      if (!own) return undefined;
      return {
        id: number(tile, "id", 0),
        image: own.getAttribute("source") ?? "",
        imagewidth: number(own, "width", undefined),
        imageheight: number(own, "height", undefined),
        x: number(tile, "x", undefined),
        y: number(tile, "y", undefined),
        width: number(tile, "width", undefined),
        height: number(tile, "height", undefined),
      };
    })
    .filter(Boolean);
  if (tiles.length) tileset.tiles = tiles;
  return tileset;
}

// ---------------------------------------------------------------------------
// Editing tiles. Changes are `[index, before, after]`, applied and reverted
// by `applyChanges`, so the panel's history can undo them.

/** A rectangle of GIDs; 0 cells are left alone when painted. */
export function stampOf(width, height, gids) {
  return { width, height, gids: Uint32Array.from(gids) };
}

function record(changes, gids, index, gid) {
  if (gids[index] === gid) return;
  const previous = changes.get(index);
  changes.set(index, [index, previous ? previous[1] : gids[index], gid]);
  gids[index] = gid;
}

/**
 * Paints `stamp` with its top-left at cell (x, y), into `changes` (a Map
 * kept across one stroke). Cells outside the layer are skipped.
 */
export function paintStamp(tiles, x, y, stamp, changes = new Map()) {
  for (let row = 0; row < stamp.height; row++) {
    for (let column = 0; column < stamp.width; column++) {
      const gid = stamp.gids[row * stamp.width + column];
      const cx = x + column;
      const cy = y + row;
      if (!gid || cx < 0 || cy < 0 || cx >= tiles.width || cy >= tiles.height) continue;
      record(changes, tiles.gids, cy * tiles.width + cx, gid);
    }
  }
  return changes;
}

/** Clears the cells under a `width` × `height` rectangle at (x, y). */
export function erase(tiles, x, y, width = 1, height = 1, changes = new Map()) {
  for (let cy = Math.max(0, y); cy < Math.min(tiles.height, y + height); cy++) {
    for (let cx = Math.max(0, x); cx < Math.min(tiles.width, x + width); cx++) record(changes, tiles.gids, cy * tiles.width + cx, 0);
  }
  return changes;
}

/**
 * Fills the 4-connected area of cells equal to (x, y)'s GID (flags
 * included) with `stamp`, repeated from (x, y).
 */
export function floodFill(tiles, x, y, stamp, changes = new Map()) {
  const { width, height, gids } = tiles;
  if (x < 0 || y < 0 || x >= width || y >= height) return changes;
  const target = gids[y * width + x];
  const seen = new Uint8Array(width * height);
  const stack = [y * width + x];
  seen[stack[0]] = 1;
  const modulo = (value, size) => ((value % size) + size) % size;
  while (stack.length) {
    const index = stack.pop();
    const cx = index % width;
    const cy = (index - cx) / width;
    const gid = stamp.gids[modulo(cy - y, stamp.height) * stamp.width + modulo(cx - x, stamp.width)];
    record(changes, gids, index, gid);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] || gids[next] !== target) continue;
      seen[next] = 1;
      stack.push(next);
    }
  }
  return changes;
}

/** Applies a list of changes, or takes them back with `undo`. */
export function applyChanges(gids, changes, undo = false) {
  for (const [index, before, after] of changes) gids[index] = undo ? before : after;
}

// ---------------------------------------------------------------------------
// Objects, layers and their ids.

/** The next object id, bumping `nextobjectid` past it (and past any id already used). */
export function takeObjectId(doc) {
  let highest = 0;
  walkLayers(doc.layers, (layer) => {
    for (const object of layer.objects ?? []) highest = Math.max(highest, object.id ?? 0);
  });
  const id = Math.max(Number(doc.nextobjectid) || 1, highest + 1);
  setKey(doc, "nextobjectid", id + 1);
  return id;
}

/** The next layer id, bumping `nextlayerid`. */
export function takeLayerId(doc) {
  let highest = 0;
  walkLayers(doc.layers, (layer) => void (highest = Math.max(highest, layer.id ?? 0)));
  const id = Math.max(Number(doc.nextlayerid) || 1, highest + 1);
  setKey(doc, "nextlayerid", id + 1);
  return id;
}

/**
 * Where an object's class goes: `type` (Tiled 1.8 and earlier, and 1.10 on),
 * or `class`, which only Tiled 1.9 wrote. An object that has one keeps it.
 */
export function classKey(doc, object) {
  if (object && Object.hasOwn(object, "type")) return "type";
  if (object && Object.hasOwn(object, "class")) return "class";
  return String(doc.version) === "1.9" ? "class" : "type";
}

/**
 * A new object in `layer`, with its keys as Tiled writes them. `shape` is
 * `rectangle` or `point`.
 */
export function createObject(doc, layer, { shape, x, y, width = 0, height = 0, name = "", className = "" }) {
  const object = {};
  const kind = classKey(doc);
  const fields = {
    height: shape === "point" ? 0 : height,
    id: takeObjectId(doc),
    name,
    ...(shape === "point" ? { point: true } : {}),
    rotation: 0,
    [kind]: className,
    visible: true,
    width: shape === "point" ? 0 : width,
    x,
    y,
  };
  for (const key of Object.keys(fields).sort()) object[key] = fields[key];
  if (!Array.isArray(layer.objects)) setKey(layer, "objects", []);
  return object;
}

/** A new layer, as Tiled writes one; a tile layer takes `encoding`/`compression` from `like`. */
export function createLayer(doc, kind, name, like) {
  const id = takeLayerId(doc);
  if (kind === "tilelayer") {
    const fields = {
      ...(like?.compression ? { compression: like.compression } : {}),
      data: Array(doc.width * doc.height).fill(0),
      ...(like?.encoding ? { encoding: like.encoding } : {}),
      height: doc.height,
      id,
      name,
      opacity: 1,
      type: "tilelayer",
      visible: true,
      width: doc.width,
      x: 0,
      y: 0,
    };
    return fields;
  }
  return { draworder: "topdown", id, name, objects: [], opacity: 1, type: "objectgroup", visible: true, x: 0, y: 0 };
}

/** A tile layer's editing state for a layer made by `createLayer`; its data is encoded on save. */
export function tilesFor(doc) {
  const gids = new Uint32Array(doc.width * doc.height);
  return { gids, original: undefined, width: doc.width, height: doc.height };
}

/**
 * A new map: `width` × `height` tiles of `tilewidth` × `tileheight`, with a
 * `Ground` tile layer and an `Objects` layer, and an embedded image tileset
 * when one is given (`{ name, image, imagewidth, imageheight }`, the image
 * path relative to the map).
 */
export function createMap({ width, height, tilewidth, tileheight, tileset }) {
  const doc = {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: [],
    nextlayerid: 1,
    nextobjectid: 1,
    orientation: "orthogonal",
    renderorder: "right-down",
    tileheight,
    tilesets: [],
    tilewidth,
    type: "map",
    version: "1.10",
    width,
  };
  doc.layers.push(createLayer(doc, "tilelayer", "Ground"), createLayer(doc, "objectgroup", "Objects"));
  if (tileset) {
    const { columns, tilecount } = gridOf(tileset.imagewidth, tileset.imageheight, tilewidth, tileheight);
    doc.tilesets.push({
      columns,
      firstgid: 1,
      image: tileset.image,
      imageheight: tileset.imageheight,
      imagewidth: tileset.imagewidth,
      margin: 0,
      name: tileset.name,
      spacing: 0,
      tilecount,
      tileheight,
      tilewidth,
    });
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Custom properties, kept in Tiled's `[{ name, type, value }]` shape.

export const PROPERTY_TYPES = ["string", "int", "float", "bool"];

/** A property's value converted for its type, as the inspector edits it. */
export function propertyValue(type, text) {
  if (type === "bool") return text === true || text === "true";
  if (type === "int") {
    const value = Number.parseInt(String(text), 10);
    return Number.isFinite(value) ? value : 0;
  }
  if (type === "float") {
    const value = Number.parseFloat(String(text));
    return Number.isFinite(value) ? value : 0;
  }
  return String(text ?? "");
}

/**
 * Sets one property (by name), adding it if new; `undefined` removes it.
 * Other properties, and any fields of theirs such as `propertytype`, stay.
 */
export function setProperty(object, name, type, value) {
  const list = Array.isArray(object.properties) ? object.properties : [];
  const at = list.findIndex((property) => property.name === name);
  if (value === undefined) {
    if (at >= 0) list.splice(at, 1);
  } else if (at >= 0) {
    if (list[at].type !== type) list[at].type = type;
    list[at].value = value;
  } else list.push({ name, type, value });
  if (list.length && !Array.isArray(object.properties)) setKey(object, "properties", list);
  if (!list.length && Object.hasOwn(object, "properties")) delete object.properties;
}

/** The property called `name`, as the object has it now (an undo may have replaced it). */
export function propertyNamed(object, name) {
  return Array.isArray(object.properties) ? object.properties.find((property) => property.name === name) : undefined;
}

/** Renames a property, keeping its place, type and value. */
export function renameProperty(object, from, to) {
  const property = object.properties?.find((entry) => entry.name === from);
  if (property && !object.properties.some((entry) => entry.name === to)) property.name = to;
}
