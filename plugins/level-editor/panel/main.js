// The Levels panel: lists the project's Tiled maps, draws the open one on a
// canvas, and edits its tiles, objects and layers. The map model, and how
// maps are read and written, is in tmj.js; drawing is in render.js.
import { connect } from "/_ohmygame/plugin-ui.js";
import * as tmj from "./tmj.js";
import { TEXT } from "./i18n.js";
import { h, icon, iconButton } from "./dom.js";
import { drawScene, drawTile, hitsObject, layerColor, mapBounds, objectBox, withAlpha } from "./render.js";
import { Palette } from "./palette.js";
import { createInspector } from "./inspector.js";
import { showNewMapDialog } from "./new-map.js";

const host = await connect();
const t = TEXT[host.locale] ?? TEXT.en;
document.documentElement.lang = host.locale;

const TOOLS = [
  ["brush", "brush", "B"],
  ["eraser", "eraser", "E"],
  ["fill", "fill", "G"],
  ["eyedropper", "eyedropper", "I"],
  ["rect", "rect", "R"],
  ["point", "point", "P"],
  ["select", "select", "V"],
];
const TILE_TOOLS = new Set(["brush", "eraser", "fill", "eyedropper"]);
const ZOOMS = [0.125, 0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const HISTORY_LIMIT = 300;
const MAP_FILE = /\.(?:tmj|json)$/i;
/** JSON files that are never maps, so they aren't read to find out. */
const NOT_MAPS = /(?:^|\/)(?:package(?:-lock)?|tsconfig[^/]*|jsconfig|composer|bower|manifest|project|settings|launch|tasks|extensions)\.json$/i;
/** JSON that big isn't read to see whether it is a map. */
const MAX_PROBE_BYTES = 8 * 1024 * 1024;
/** At most this many JSON files are read when looking for maps. */
const MAX_PROBES = 400;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
/** How long after its own save the panel takes a `files` event without paths to be that save. */
const OWN_WRITE_MS = 3000;

const state = {
  maps: undefined,
  map: undefined,
  /** The map's text as last read from or written to disk. */
  diskText: "",
  /** Newer text on disk while there are unsaved edits. */
  external: undefined,
  removed: false,
  openError: "",
  tilesets: [],
  paletteIndex: 0,
  tool: "brush",
  stamp: undefined,
  active: undefined,
  selection: undefined,
  view: { zoom: 1, x: 0, y: 0 },
  grid: true,
  history: [],
  at: 0,
  savedAt: 0,
  saving: false,
  hover: undefined,
  drag: undefined,
  space: false,
  message: "",
};

// ---------------------------------------------------------------------------
// Theme colours for the canvases, read from the app's tokens.

const probe = h("span", { class: "probe", "aria-hidden": "true" });
document.body.append(probe);
let theme;

function colour(expression) {
  probe.style.color = "";
  probe.style.color = expression;
  return getComputedStyle(probe).color;
}

function rgba(rgb, alpha) {
  const parts = rgb.match(/[\d.]+/g)?.map(Number) ?? [128, 128, 128];
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function readTheme() {
  const text = colour("var(--color-text)");
  theme = {
    background: colour("var(--color-stage)"),
    grid: rgba(text, 0.14),
    bounds: rgba(text, 0.4),
    text,
    labelText: text,
    labelBackground: rgba(colour("var(--color-surface)"), 0.85),
    selection: colour("var(--omg-accent, var(--color-accent))"),
    selectionFill: rgba(colour("var(--omg-accent, var(--color-accent))"), 0.28),
    hover: rgba(text, 0.7),
    shadow: "rgba(0, 0, 0, 0.55)",
    collision: "#e5534b",
    objects: "#4b8ef0",
    danger: colour("var(--color-danger)"),
    font: getComputedStyle(document.documentElement).getPropertyValue("--font-sans") || "sans-serif",
  };
}
readTheme();
host.on("theme", () => {
  readTheme();
  invalidate();
  palette.draw();
});

// ---------------------------------------------------------------------------
// Layout.

const els = {};
const palette = new Palette({ onPick: (stamp) => pickStamp(stamp, false), theme: () => theme });

function buildLayout() {
  els.mapSelect = h("omg-select", { "aria-label": t.chooseMap, class: "map-select", on: { change: (event) => void switchMap(event.currentTarget.value) } });
  els.newMap = h("omg-button", { on: { click: () => void openNewMapDialog() } }, icon("plus"), t.newMap);
  els.tools = new Map();
  const toolButtons = TOOLS.map(([tool, iconName, key]) => {
    const wrapper = iconButton(iconName, `${t.tools[tool]} (${key})`, () => setTool(tool));
    els.tools.set(tool, wrapper.firstElementChild);
    return wrapper;
  });
  const mod = isMac ? "⌘" : "Ctrl+";
  const undo = iconButton("undo", `${t.undo} (${mod}Z)`, () => undoStep());
  const redo = iconButton("redo", `${t.redo} (${isMac ? "⇧⌘Z" : "Ctrl+Y"})`, () => redoStep());
  els.undo = undo.firstElementChild;
  els.redo = redo.firstElementChild;
  els.zoomLabel = h("button", { class: "zoom-label", type: "button", on: { click: () => zoomTo(1) } }, "100%");
  const grid = iconButton("grid", t.grid, () => {
    state.grid = !state.grid;
    updateToolbar();
    invalidate();
  });
  els.grid = grid.firstElementChild;
  els.dirty = h("span", { class: "dirty", hidden: true }, t.unsaved);
  els.save = h("omg-button", { variant: "primary", on: { click: () => void save() } }, t.save);

  els.toolbar = h(
    "header",
    { class: "toolbar" },
    h("div", { class: "group file" }, els.mapSelect, els.newMap),
    h("div", { class: "group tools", role: "toolbar", "aria-label": t.toolbar }, toolButtons),
    h("div", { class: "group" }, undo, redo),
    h(
      "div",
      { class: "group" },
      iconButton("zoomOut", t.zoomOut, () => zoomStep(-1)),
      els.zoomLabel,
      iconButton("zoomIn", t.zoomIn, () => zoomStep(1)),
      iconButton("fit", t.fit, () => fitView()),
      grid,
    ),
    h("div", { class: "group end" }, els.dirty, els.save),
  );
  els.notices = h("div", { class: "notices" });

  els.canvas = h("canvas", { class: "map-canvas", tabindex: "0", "aria-label": t.title });
  els.stageMessage = h("div", { class: "stage-message", hidden: true });
  els.stage = h("div", { class: "stage" }, els.canvas, els.stageMessage);

  els.layers = h("div", { class: "layer-list", role: "listbox", "aria-label": t.layers });
  els.layerActions = h("div", { class: "section-actions" });
  els.tilesetTabs = h("div", { class: "tileset-tabs" });
  els.tilesetNote = h("p", { class: "note", hidden: true });
  els.inspector = h("div", { class: "inspector" });
  els.side = h(
    "aside",
    { class: "side" },
    h("section", { class: "side-section layers-section" }, h("div", { class: "section-head" }, h("h2", {}, t.layers), els.layerActions), els.layers),
    h("section", { class: "side-section tileset-section" }, h("div", { class: "section-head" }, h("h2", {}, t.tileset)), els.tilesetTabs, palette.scroller, els.tilesetNote),
    h("section", { class: "side-section object-section" }, h("div", { class: "section-head" }, h("h2", {}, t.object)), els.inspector),
  );
  els.status = {
    cell: h("span", { class: "status-cell" }),
    layer: h("span", { class: "status-layer" }),
    message: h("span", { class: "status-message" }),
    size: h("span", { class: "status-size" }),
  };
  els.footer = h("footer", { class: "status" }, els.status.cell, els.status.layer, els.status.message, els.status.size);
  els.workspace = h("main", { class: "workspace" }, els.stage, els.side);
  els.empty = h("div", { class: "empty-state", hidden: true });
  els.app = h("div", { class: "app" }, els.toolbar, els.notices, els.workspace, els.empty, els.footer);
  document.getElementById("app").replaceChildren(els.app);
}

buildLayout();

// ---------------------------------------------------------------------------
// Finding maps.

let scanTimer;
let scanning;
/** Whether a JSON file is a Tiled map, by its path, size and time, so a scan reads only changed files. */
const probed = new Map();

async function scanMaps() {
  const { entries } = await host.files.list("", { recursive: true });
  state.files = entries.filter((entry) => entry.kind === "file");
  const found = [];
  const probes = [];
  for (const entry of state.files) {
    if (!MAP_FILE.test(entry.path)) continue;
    if (/\.tmj$/i.test(entry.path)) found.push(entry.path);
    else if (!NOT_MAPS.test(entry.path) && (entry.size ?? 0) <= MAX_PROBE_BYTES) {
      const key = `${entry.path}\n${entry.size}\n${entry.modified}`;
      if (probed.has(key)) {
        if (probed.get(key)) found.push(entry.path);
      } else probes.push(key);
    }
  }
  // Read JSON files a few at a time to see which are Tiled maps.
  const queue = probes.slice(0, MAX_PROBES);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
        const path = key.slice(0, key.indexOf("\n"));
        let map = false;
        try {
          const text = await host.files.text(path);
          map = /"(?:tilesets|tilewidth)"/.test(text) && tmj.isTiledMap(JSON.parse(text));
        } catch {
          // Not readable JSON: not a map.
        }
        probed.set(key, map);
        if (map) found.push(path);
      }
    }),
  );
  state.maps = found.sort((a, b) => a.localeCompare(b));
  renderMapSelect();
}

function rescanSoon() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanning = scanMaps().catch(() => {});
  }, 800);
}

function renderMapSelect() {
  const current = state.map?.path ?? "";
  const options = (state.maps ?? []).map((path) => h("option", { value: path }, path));
  if (current && !state.maps?.includes(current)) options.unshift(h("option", { value: current }, current));
  if (!current) options.unshift(h("option", { value: "" }, t.pickMap));
  els.mapSelect.replaceChildren(...options);
  els.mapSelect.value = current;
  els.mapSelect.hidden = !options.length;
  renderEmpty();
}

function renderEmpty() {
  const nothing = state.maps !== undefined && !state.maps.length && !state.map;
  els.empty.hidden = !nothing;
  els.workspace.hidden = nothing;
  els.footer.hidden = nothing;
  if (nothing) {
    els.empty.replaceChildren(
      h(
        "omg-empty",
        { heading: t.noMaps, description: t.noMapsHint },
        h("omg-button", { variant: "primary", on: { click: () => void openNewMapDialog() } }, t.newMap),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Opening and saving.

const isDirty = () => state.at !== state.savedAt;
const editable = () => Boolean(state.map && tmj.isEditable(state.map));

async function confirmDiscard() {
  if (!state.map || !isDirty()) return true;
  try {
    return await host.request("ui.confirm", {
      title: t.discardTitle,
      message: t.discardMessage(tmj.basename(state.map.path)),
      confirmLabel: t.discard,
    });
  } catch {
    return false;
  }
}

async function switchMap(path) {
  if (!path || path === state.map?.path) return;
  if (!(await confirmDiscard())) {
    els.mapSelect.value = state.map?.path ?? "";
    return;
  }
  await openPath(path);
}

/** Counts calls to `openPath`, so only the latest one's result is used. */
let opening = 0;

/**
 * Opens a map. `keepView` keeps the zoom and position, as when the same map
 * is read again; without `force`, a reload that finds edits made while it
 * read the file shows the changed-on-disk notice instead of replacing them.
 */
async function openPath(path, { keepView = false, force = false } = {}) {
  const ticket = ++opening;
  state.openError = "";
  let text;
  let map;
  try {
    text = await host.files.text(path);
    map = await tmj.openMap(text, path);
  } catch (error) {
    if (ticket !== opening) return;
    state.openError = t.openFailed(errorText(error));
    if (!keepView) {
      state.map = undefined;
      renderMapSelect();
    }
    refresh();
    return;
  }
  if (ticket !== opening) return;
  // Edits made while the file was read stay; the notice offers the choice.
  if (!force && keepView && state.map?.path === path && isDirty()) {
    if (text !== state.diskText) state.external = text;
    renderNotices();
    return;
  }
  const previous = state.map?.path === path ? { active: state.active?.id, selected: state.selection?.object.id } : undefined;
  state.map = map;
  state.diskText = text;
  state.external = undefined;
  state.removed = false;
  state.history = [];
  state.at = state.savedAt = 0;
  state.selection = undefined;
  state.drag = undefined;
  state.active = undefined;
  if (previous) {
    tmj.walkLayers(map.doc.layers, (layer) => {
      if (layer.id !== undefined && layer.id === previous.active) state.active = layer;
      for (const object of layer.objects ?? []) if (object.id === previous.selected) state.selection = { layer, object };
    });
  }
  if (!state.active) {
    tmj.walkLayers(map.doc.layers, (layer) => {
      if (!state.active && layer.type === "tilelayer") state.active = layer;
    });
    state.active ??= map.doc.layers?.[0];
  }
  void host.request("storage.set", { key: "lastMap", value: path }).catch(() => {});
  if (!tmj.isEditable(map)) state.tool = "select";
  if (!keepView) state.paletteIndex = 0;
  renderMapSelect();
  try {
    await loadTilesets();
  } catch (error) {
    // The map is open; say what went wrong with its tilesets.
    state.openError = t.openFailed(errorText(error));
  }
  if (ticket !== opening) return;
  if (!keepView) fitView();
  // Start with the first tile of the first tileset on the brush.
  if (!keepView && state.tilesets[0]?.ids.length) pickStamp(tmj.stampOf(1, 1, [state.tilesets[0].firstgid + state.tilesets[0].ids[0]]), true);
  refresh();
}

async function save() {
  const map = state.map;
  if (!map || !editable() || state.saving || !isDirty()) return;
  // Not over a newer file on disk until the person chooses what to keep.
  if (state.external !== undefined) {
    say(t.chooseFirst);
    renderNotices();
    return;
  }
  state.saving = true;
  // A stroke in progress ends here; strokes don't continue while saving.
  if (state.drag?.kind === "paint") {
    tileStep(state.drag.tiles.gids, state.drag.changes);
    state.drag = undefined;
  }
  updateToolbar();
  try {
    let disk;
    try {
      disk = await host.files.text(map.path);
    } catch {
      disk = undefined;
    }
    if (map !== state.map) return;
    if (disk !== undefined && disk !== state.diskText) {
      state.external = disk;
      say(t.chooseFirst);
      return;
    }
    const at = state.at;
    const text = await tmj.serializeMap(map);
    await host.files.write(map.path, text);
    tmj.markSaved(map);
    state.ownWrite = Date.now();
    state.diskText = text;
    state.savedAt = at;
    state.external = undefined;
  } catch (error) {
    toast(t.saveFailed(errorText(error)));
  } finally {
    state.saving = false;
    refresh();
  }
}

const errorText = (error) => (error instanceof Error ? error.message : String(error));

function toast(text) {
  void host.request("ui.toast", { message: text.slice(0, 500), tone: "danger" }).catch(() => {});
}

// When the project's files change: the map list, and the open map if it
// (or its tilesets and images) changed on disk. Without `paths`, or when
// they were cut short, anything may have changed.
host.on("files", ({ paths, truncated }) => {
  const known = paths && !truncated ? paths : undefined;
  // The event that follows the panel's own save names no paths.
  const ownSave = !known && Date.now() - (state.ownWrite ?? 0) < OWN_WRITE_MS;
  if (known ? known.some((path) => MAP_FILE.test(path) || /\.png$/i.test(path)) : !ownSave) rescanSoon();
  const map = state.map;
  if (!map) return;
  if (!known || known.includes(map.path)) void checkDisk();
  const dependencies = state.dependencies ?? new Set();
  const touched = known ? known.filter((path) => dependencies.has(path)) : ownSave ? [] : [...dependencies];
  if (touched.length) void refreshDependencies(map, touched);
});

/** Reads changed tileset files and pictures again; the map keeps showing the old ones until then. */
async function refreshDependencies(map, paths) {
  for (const tileset of state.tilesets) {
    if (!tileset.external || !paths.includes(tileset.base)) continue;
    const text = await host.files.text(tileset.base).catch(() => undefined);
    if (text !== tileset.text) {
      if (map === state.map) await loadTilesets();
      return;
    }
  }
  for (const path of paths) if (images.get(path) !== undefined) void loadImage(path);
}
async function checkDisk() {
  const map = state.map;
  let text;
  try {
    text = await host.files.text(map.path);
  } catch {
    if (map !== state.map) return;
    state.removed = true;
    renderNotices();
    return;
  }
  if (map !== state.map) return;
  state.removed = false;
  if (text === state.diskText) {
    renderNotices();
    return;
  }
  if (state.saving) return;
  if (!isDirty()) await openPath(map.path, { keepView: true });
  else {
    state.external = text;
    renderNotices();
  }
}

// ---------------------------------------------------------------------------
// Tilesets and images.

/** path → HTMLImageElement, or `null` while it loads or if it couldn't. */
const images = new Map();

function image(path) {
  if (!path) return undefined;
  const known = images.get(path);
  if (known instanceof HTMLImageElement) return known;
  if (known === undefined) {
    images.set(path, null);
    void loadImage(path);
  }
  return undefined;
}

/** Loads a picture from the project, replacing the one shown (if any) once it has loaded. */
async function loadImage(path) {
  try {
    const url = await host.files.url(path);
    const element = new Image();
    element.src = url;
    await element.decode();
    const previous = images.get(path);
    images.set(path, element);
    if (previous instanceof HTMLImageElement) URL.revokeObjectURL(previous.src);
  } catch {
    if (!(images.get(path) instanceof HTMLImageElement)) images.set(path, null);
  }
  tileCache.clear();
  invalidate();
  palette.draw();
}

/** gid without flags → what to draw it from, for the open map's tilesets. */
const tileCache = new Map();

async function loadTilesets() {
  const map = state.map;
  if (!map) return;
  const dependencies = new Set();
  const loaded = await Promise.all(
    (map.doc.tilesets ?? []).map(async (entry) => {
      if (!entry.source) return runtimeTileset(entry, entry.firstgid, map.path, false);
      const path = tmj.resolvePath(map.path, entry.source);
      if (!path) return runtimeTileset({ name: entry.source }, entry.firstgid, map.path, true, entry.source);
      dependencies.add(path);
      try {
        const text = await host.files.text(path);
        const data = /\.tsx$/i.test(path) || text.trimStart().startsWith("<")
          ? tmj.tilesetFromXml(new DOMParser().parseFromString(text, "application/xml").documentElement)
          : JSON.parse(text);
        return { ...runtimeTileset({ name: tmj.basename(path), ...data }, entry.firstgid, path, true), text };
      } catch {
        return runtimeTileset({ name: tmj.basename(path) }, entry.firstgid, path, true, path);
      }
    }),
  );
  if (map !== state.map) return;
  for (const tileset of loaded) for (const path of tileset.images) dependencies.add(path);
  tmj.walkLayers(map.doc.layers, (layer) => {
    if (layer.type === "imagelayer" && layer.image) {
      const path = tmj.resolvePath(map.path, layer.image);
      if (path) dependencies.add(path);
    }
  });
  state.dependencies = dependencies;
  state.tilesets = loaded;
  state.paletteIndex = Math.min(state.paletteIndex, Math.max(0, loaded.length - 1));
  tileCache.clear();
  // Tiles bigger than the grid can reach into cells off screen.
  const { tilewidth, tileheight } = map.doc;
  state.tilePad = Math.max(1, ...loaded.map((tileset) => Math.ceil(Math.max(tileset.tilewidth / tilewidth, tileset.tileheight / tileheight))));
  for (const tileset of loaded) for (const path of tileset.images) image(path);
  renderTilesets();
  invalidate();
}

/** A tileset as the panel uses it: where its tiles come from, resolved against `base`, the file it is in. */
function runtimeTileset(data, firstgid, base, external, error) {
  const atlas = Boolean(data.image) && data.columns > 0;
  const paths = new Set();
  if (data.image) paths.add(tmj.resolvePath(base, data.image));
  for (const tile of tmj.tilesOf(data)) if (tile.image) paths.add(tmj.resolvePath(base, tile.image));
  paths.delete(undefined);
  return {
    firstgid,
    name: data.name || tmj.basename(base),
    atlas,
    columns: data.columns ?? 0,
    tilewidth: data.tilewidth || state.map.doc.tilewidth,
    tileheight: data.tileheight || state.map.doc.tileheight,
    ids: error ? [] : tmj.tileIds(data),
    data,
    base,
    external,
    error,
    images: [...paths],
    /** The tile to draw for local id `id`, once its image has loaded. */
    tile(id) {
      const source = tmj.tileSource(data, id);
      if (!source) return undefined;
      const picture = image(tmj.resolvePath(base, source.image));
      if (!picture) return undefined;
      const width = source.width || picture.naturalWidth;
      const height = source.height || picture.naturalHeight;
      return { image: picture, sx: source.sx, sy: source.sy, sw: width, sh: height, width, height };
    },
  };
}

/** What to draw a map tile from: its picture, size and offset, and whether it fills one grid cell. */
function tileFor(gid) {
  const plain = tmj.tileOf(gid);
  if (tileCache.has(plain)) return tileCache.get(plain);
  const found = tmj.findTileset(state.tilesets, plain);
  const tile = found?.tileset.tile(found.id);
  if (!tile) return undefined;
  const { data } = found.tileset;
  const doc = state.map.doc;
  const offsetX = data.tileoffset?.x ?? 0;
  const offsetY = data.tileoffset?.y ?? 0;
  const grid = data.tilerendersize === "grid" || (tile.width === doc.tilewidth && tile.height === doc.tileheight && !offsetX && !offsetY);
  const entry = { ...tile, offsetX, offsetY, grid };
  tileCache.set(plain, entry);
  return entry;
}

function renderTilesets() {
  const { tilesets } = state;
  if (tilesets.length > 1) {
    const tabs = h(
      "omg-tabs",
      {
        "aria-label": t.tileset,
        value: String(state.paletteIndex),
        on: {
          "omg-tab-change": (event) => {
            state.paletteIndex = Number(event.detail.value);
            showPalette();
          },
        },
      },
      tilesets.map((tileset, index) => h("omg-tab", { name: String(index), heading: tileset.name })),
    );
    els.tilesetTabs.replaceChildren(tabs);
  } else els.tilesetTabs.replaceChildren();
  showPalette();
}

function showPalette() {
  const tileset = state.tilesets[state.paletteIndex];
  palette.show(tileset);
  const note = !state.tilesets.length ? t.noTilesets : tileset?.error ? t.tilesetMissing(tileset.error) : tileset?.external ? t.externalTileset : "";
  els.tilesetNote.textContent = note;
  els.tilesetNote.hidden = !note;
  palette.scroller.hidden = !tileset || Boolean(tileset.error);
  if (state.stamp?.width === 1 && state.stamp.height === 1) palette.mark(state.stamp.gids[0]);
}

// ---------------------------------------------------------------------------
// History: each step can be undone and redone. Tile strokes are applied as
// they are drawn, so they are recorded once done.

function record(step) {
  if (state.savedAt > state.at) state.savedAt = -1;
  state.history.length = state.at;
  state.history.push(step);
  if (state.history.length > HISTORY_LIMIT) {
    state.history.shift();
    state.savedAt--;
  }
  state.at = state.history.length;
  changed();
}

function run(step) {
  step.redo();
  record(step);
}

function undoStep() {
  if (!state.at || state.drag || state.saving) return;
  state.history[--state.at].undo();
  changed();
}

function redoStep() {
  if (state.at >= state.history.length || state.drag || state.saving) return;
  state.history[state.at++].redo();
  changed();
}

function changed() {
  // An undo may take away the selected object or the active layer.
  const layers = new Set();
  tmj.walkLayers(state.map?.doc.layers, (layer) => void layers.add(layer));
  if (state.selection && (!layers.has(state.selection.layer) || !state.selection.layer.objects?.includes(state.selection.object))) state.selection = undefined;
  if (state.active && !layers.has(state.active)) state.active = state.map?.doc.layers?.at(-1);
  invalidate();
  refresh();
}

/** Changes an object's fields as one step, if anything changed. */
function editFields(target, change) {
  const before = tmj.captureFields(target);
  change(target);
  const after = tmj.captureFields(target);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  record({ undo: () => tmj.restoreFields(target, before), redo: () => tmj.restoreFields(target, after) });
}

/** Changes an array (layers, objects) as one step. */
function editList(list, change) {
  const before = list.slice();
  change(list);
  const after = list.slice();
  record({ undo: () => list.splice(0, list.length, ...before), redo: () => list.splice(0, list.length, ...after) });
}

function tileStep(gids, changes) {
  const list = [...changes.values()];
  if (!list.length) return;
  record({ undo: () => tmj.applyChanges(gids, list, true), redo: () => tmj.applyChanges(gids, list) });
}

// ---------------------------------------------------------------------------
// The view.

let frame = 0;
function invalidate() {
  if (!frame) frame = requestAnimationFrame(draw);
}

function canvasSize() {
  return { width: els.stage.clientWidth, height: els.stage.clientHeight };
}

new ResizeObserver(() => {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvasSize();
  els.canvas.width = Math.max(1, Math.round(width * dpr));
  els.canvas.height = Math.max(1, Math.round(height * dpr));
  if (state.needsFit) fitView();
  draw();
}).observe(els.stage);

function draw() {
  frame = 0;
  const ctx = els.canvas.getContext("2d");
  const map = state.map;
  if (!map) {
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    return;
  }
  drawScene(ctx, {
    width: els.canvas.width,
    height: els.canvas.height,
    dpr: window.devicePixelRatio || 1,
    zoom: state.view.zoom,
    x: state.view.x,
    y: state.view.y,
    doc: map.doc,
    tiles: map.tiles,
    tile: tileFor,
    tilePad: state.tilePad,
    image: (path) => image(tmj.resolvePath(map.path, path)),
    theme,
    grid: state.grid,
    overlay: drawOverlay,
  });
}

function fitView() {
  const map = state.map;
  const { width, height } = canvasSize();
  if (!map || width < 10 || height < 10) {
    state.needsFit = true;
    return;
  }
  state.needsFit = false;
  const bounds = mapBounds(map);
  const zoom = clampZoom(Math.min((width - 48) / bounds.width, (height - 48) / bounds.height, 8));
  state.view = { zoom, x: Math.round((width - bounds.width * zoom) / 2 - bounds.x * zoom), y: Math.round((height - bounds.height * zoom) / 2 - bounds.y * zoom) };
  updateToolbar();
  invalidate();
}

const clampZoom = (zoom) => Math.min(16, Math.max(0.05, zoom));

function zoomAround(zoom, px, py) {
  const next = clampZoom(zoom);
  const { view } = state;
  state.view = { zoom: next, x: px - ((px - view.x) * next) / view.zoom, y: py - ((py - view.y) * next) / view.zoom };
  updateToolbar();
  invalidate();
}

function zoomTo(zoom) {
  const { width, height } = canvasSize();
  zoomAround(zoom, width / 2, height / 2);
}

function zoomStep(direction) {
  const current = state.view.zoom;
  const next = direction > 0 ? ZOOMS.find((zoom) => zoom > current * 1.01) : ZOOMS.findLast((zoom) => zoom < current / 1.01);
  zoomTo(next ?? (direction > 0 ? 16 : 0.05));
}

/** The pointer's position in the canvas, in CSS pixels, and on the map, in map pixels. */
function pointer(event) {
  const rect = els.canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const { zoom, x, y } = state.view;
  return { px, py, wx: (px - x) / zoom, wy: (py - y) / zoom };
}

function cellAt(wx, wy) {
  const doc = state.map.doc;
  return [Math.floor(wx / doc.tilewidth), Math.floor(wy / doc.tileheight)];
}

/** Map point (wx, wy) in `layer`'s own coordinates, its and its groups' offsets taken away. */
function local(layer, wx, wy) {
  const [ox, oy] = layer ? layerOffset(layer) : [0, 0];
  return [wx - ox, wy - oy];
}

/** The cell of `layer` under map point (wx, wy). */
function cellIn(layer, wx, wy) {
  return cellAt(...local(layer, wx, wy));
}

/** Whether a layer, or a group it is in, is locked against edits. */
function locked(target) {
  let result = false;
  const visit = (layers, inLocked) => {
    for (const layer of layers ?? []) {
      const here = inLocked || layer.locked === true;
      if (layer === target) result = here;
      if (layer.type === "group") visit(layer.layers, here);
    }
  };
  visit(state.map?.doc.layers, false);
  return result;
}

// ---------------------------------------------------------------------------
// Layers.

/** Every layer with its parent list and depth, topmost first, as the layers list shows them. */
function layerRows() {
  const rows = [];
  const visit = (layers, depth) => {
    for (let i = (layers?.length ?? 0) - 1; i >= 0; i--) {
      const layer = layers[i];
      rows.push({ layer, parent: layers, depth });
      if (layer.type === "group") visit(layer.layers, depth + 1);
    }
  };
  visit(state.map?.doc.layers, 0);
  return rows;
}

function parentOf(target) {
  let found;
  tmj.walkLayers(state.map.doc.layers, (layer, parent) => {
    if (layer === target) found = parent;
  });
  return found;
}

/** Whether a layer and every group around it is shown. */
function shown(target) {
  let result = false;
  const visit = (layers, visible) => {
    for (const layer of layers ?? []) {
      const here = visible && layer.visible !== false;
      if (layer === target) result = here;
      if (layer.type === "group") visit(layer.layers, here);
    }
  };
  visit(state.map?.doc.layers, true);
  return result;
}

const LAYER_ICONS = { tilelayer: "tileLayer", objectgroup: "objectLayer", group: "group", imagelayer: "image" };

function renderLayers() {
  const rows = layerRows();
  const canEdit = editable();
  els.layers.replaceChildren(
    ...rows.map(({ layer, depth }) => {
      const visible = layer.visible !== false;
      const name = h("span", { class: "layer-name", title: canEdit ? t.rename : undefined }, layer.name || " ");
      const row = h(
        "div",
        {
          class: "layer-row",
          role: "option",
          "aria-selected": String(layer === state.active),
          "data-hidden": visible ? undefined : "",
          style: `padding-inline-start: ${4 + depth * 14}px`,
          on: {
            click: () => {
              state.active = layer;
              refresh();
            },
            dblclick: () => canEdit && startRename(row, name, layer),
          },
        },
        h(
          "button",
          {
            class: "layer-eye",
            type: "button",
            "aria-label": visible ? t.hide : t.show,
            title: visible ? t.hide : t.show,
            disabled: !canEdit,
            on: {
              click: (event) => {
                event.stopPropagation();
                editFields(layer, (target) => tmj.setKey(target, "visible", !visible));
              },
            },
          },
          icon(visible ? "eye" : "eyeOff"),
        ),
        h("span", { class: "layer-kind" }, icon(LAYER_ICONS[layer.type] ?? "tileLayer")),
        name,
        layer.locked === true ? h("span", { class: "layer-lock", title: t.locked, "aria-label": t.locked }, icon("lock")) : undefined,
      );
      return row;
    }),
  );
  const active = state.active;
  const parent = active && parentOf(active);
  const index = parent?.indexOf(active) ?? -1;
  els.layerActions.replaceChildren(
    h(
      "omg-menu",
      {
        label: t.addLayer,
        class: "add-layer",
        disabled: !canEdit,
        props: { items: [{ value: "tilelayer", label: t.addTileLayer }, { value: "objectgroup", label: t.addObjectLayer }] },
        on: { "omg-select": (event) => addLayer(event.detail.value) },
      },
      h("span", { slot: "trigger" }, icon("plus")),
    ),
    iconButton("up", t.moveUp, () => moveLayer(1), { disabled: !canEdit || index < 0 || index >= parent.length - 1 }),
    iconButton("down", t.moveDown, () => moveLayer(-1), { disabled: !canEdit || index <= 0 }),
    iconButton("trash", t.deleteLayer, () => void deleteLayer(), { disabled: !canEdit || !active }),
  );
}

function startRename(row, name, layer) {
  const input = h("input", { class: "omg-input layer-rename", value: layer.name ?? "", "aria-label": t.name });
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit && input.value.trim() && input.value !== layer.name) editFields(layer, (target) => tmj.setKey(target, "name", input.value.trim()));
    else renderLayers();
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  name.replaceWith(input);
  input.focus();
  input.select();
}

function addLayer(kind) {
  const doc = state.map.doc;
  const parent = (state.active && parentOf(state.active)) ?? doc.layers;
  const index = state.active ? parent.indexOf(state.active) + 1 : parent.length;
  let like;
  tmj.walkLayers(doc.layers, (layer) => {
    if (!like && layer.type === "tilelayer" && layer.data !== undefined) like = layer;
  });
  let count = 0;
  tmj.walkLayers(doc.layers, (layer) => void (layer.type === kind && count++));
  const name = `${kind === "tilelayer" ? t.newTileLayer : t.newObjectLayer} ${count + 1}`;
  const layer = tmj.createLayer(doc, kind, name, like);
  if (kind === "tilelayer") state.map.tiles.set(layer, tmj.tilesFor(doc));
  editList(parent, (list) => list.splice(index, 0, layer));
  state.active = layer;
  refresh();
}

function moveLayer(direction) {
  const layer = state.active;
  const parent = parentOf(layer);
  const index = parent.indexOf(layer);
  const target = index + direction;
  if (target < 0 || target >= parent.length) return;
  editList(parent, (list) => {
    list.splice(index, 1);
    list.splice(target, 0, layer);
  });
}

async function deleteLayer() {
  const layer = state.active;
  if (!layer) return;
  let agreed = false;
  const name = layer.name ?? "";
  try {
    agreed = await host.request("ui.confirm", {
      title: t.deleteLayerTitle(name.length > 60 ? `${name.slice(0, 59)}…` : name),
      message: t.deleteLayerMessage,
      confirmLabel: t.delete,
    });
  } catch (error) {
    // The app couldn't ask (too many questions, or the panel isn't showing).
    toast(t.couldNotAsk(errorText(error)));
    return;
  }
  if (!agreed || layer !== state.active) return;
  const parent = parentOf(layer);
  const index = parent.indexOf(layer);
  editList(parent, (list) => list.splice(index, 1));
  let group;
  tmj.walkLayers(state.map.doc.layers, (item) => {
    if (item.layers === parent) group = item;
  });
  state.active = parent[index] ?? parent[index - 1] ?? group ?? state.map.doc.layers.at(-1);
  refresh();
}

// ---------------------------------------------------------------------------
// Tools.

function setTool(tool) {
  state.tool = tool;
  state.message = "";
  updateToolbar();
  renderStatus();
  invalidate();
  els.canvas.focus({ preventScroll: true });
}

function pickStamp(stamp, fromMap) {
  state.stamp = stamp;
  if (fromMap) {
    // Show the picked tile in its tileset.
    const found = tmj.findTileset(state.tilesets, stamp.gids[0]);
    const index = found ? state.tilesets.indexOf(found.tileset) : -1;
    if (index >= 0 && index !== state.paletteIndex) {
      state.paletteIndex = index;
      renderTilesets();
    }
    palette.mark(tmj.tileOf(stamp.gids[0]));
  }
  if (editable() && state.tool !== "brush" && state.tool !== "fill") setTool("brush");
}

/** The active layer's tiles, if it is a tile layer that can be painted. */
function activeTiles() {
  const layer = state.active;
  if (!layer || layer.type !== "tilelayer") return undefined;
  return state.map.tiles.get(layer)?.gids ? state.map.tiles.get(layer) : undefined;
}

/**
 * The object layer a new object goes on: the active one, else for a
 * rectangle the collision layer and for a point another one, else the topmost.
 */
function objectLayer(shape) {
  if (state.active?.type === "objectgroup") return state.active;
  const layers = layerRows().map((row) => row.layer).filter((layer) => layer.type === "objectgroup" && !locked(layer));
  const collision = (layer) => /collision/i.test(layer.name ?? "");
  const found = layers.find((layer) => (shape === "rectangle" ? collision(layer) : !collision(layer))) ?? layers[0];
  if (found) state.active = found;
  return found;
}

function say(message) {
  state.message = message;
  renderStatus();
}

function stampOrigin(cx, cy) {
  const stamp = state.stamp;
  return stamp ? [cx - ((stamp.width - 1) >> 1), cy - ((stamp.height - 1) >> 1)] : [cx, cy];
}

/** Cells on the line from (x0, y0) to (x1, y1), so a fast stroke leaves no gaps. */
function* line(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    yield [x0, y0];
    if (x0 === x1 && y0 === y1) return;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function paintCell(drag, cx, cy) {
  if (drag.erase) tmj.erase(drag.tiles, cx, cy, 1, 1, drag.changes);
  else {
    const [x, y] = stampOrigin(cx, cy);
    tmj.paintStamp(drag.tiles, x, y, state.stamp, drag.changes);
  }
}

/** The topmost object under map point (wx, wy): the active layer's first, then any shown layer's. */
function objectAt(wx, wy) {
  const radius = 7 / state.view.zoom;
  const offset = (layer) => {
    let x = 0;
    let y = 0;
    const visit = (layers, ox, oy) => {
      for (const item of layers ?? []) {
        const nx = ox + (item.offsetx ?? 0);
        const ny = oy + (item.offsety ?? 0);
        if (item === layer) [x, y] = [nx, ny];
        if (item.type === "group") visit(item.layers, nx, ny);
      }
    };
    visit(state.map.doc.layers, 0, 0);
    return [x, y];
  };
  const layers = layerRows()
    .map((row) => row.layer)
    .filter((layer) => layer.type === "objectgroup" && shown(layer));
  if (state.active?.type === "objectgroup") layers.sort((a, b) => (b === state.active) - (a === state.active));
  for (const layer of layers) {
    const [ox, oy] = offset(layer);
    const objects = layer.objects ?? [];
    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i];
      if (object.visible === false) continue;
      if (hitsObject(object, wx - ox, wy - oy, radius)) return { layer, object };
    }
  }
  return undefined;
}

function onPointerDown(event) {
  if (!state.map) return;
  els.canvas.focus({ preventScroll: true });
  const at = pointer(event);
  if (event.button === 1 || (event.button === 0 && state.space)) {
    event.preventDefault();
    els.canvas.setPointerCapture(event.pointerId);
    state.drag = { kind: "pan", sx: event.clientX, sy: event.clientY, vx: state.view.x, vy: state.view.y };
    updateCursor();
    return;
  }
  if (event.button !== 0 || state.saving) return;
  const tool = state.tool;
  if (!editable() && tool !== "select") return;
  if (TILE_TOOLS.has(tool)) {
    if (tool === "eyedropper") return pickFromMap(at.wx, at.wy);
    const tiles = activeTiles();
    if (!tiles) return say(t.needTileLayer);
    if (locked(state.active)) return say(t.layerLocked);
    if (!shown(state.active)) say(t.hiddenLayer);
    const [cx, cy] = cellIn(state.active, at.wx, at.wy);
    if (tool !== "eraser" && !state.stamp) return;
    if (tool === "fill") {
      tileStep(tiles.gids, tmj.floodFill(tiles, cx, cy, state.stamp));
      return;
    }
    els.canvas.setPointerCapture(event.pointerId);
    state.drag = { kind: "paint", layer: state.active, tiles, erase: tool === "eraser", changes: new Map(), last: [cx, cy] };
    paintCell(state.drag, cx, cy);
    invalidate();
    return;
  }
  if (tool === "rect" || tool === "point") {
    const layer = objectLayer(tool === "rect" ? "rectangle" : "point");
    if (!layer) return say(t.needObjectLayer);
    if (locked(layer)) return say(t.layerLocked);
    const point = local(layer, at.wx, at.wy);
    if (tool === "point") {
      const [x, y] = snapPoint(...point, event.altKey);
      addObject(layer, { shape: "point", x, y });
      return;
    }
    els.canvas.setPointerCapture(event.pointerId);
    state.drag = { kind: "rect", layer, start: point, end: point, free: event.altKey };
    invalidate();
    return;
  }
  if (tool === "select") {
    const hit = objectAt(at.wx, at.wy);
    state.selection = hit;
    if (hit) {
      state.active = hit.layer;
      if (locked(hit.layer)) say(t.layerLocked);
      else if (editable()) {
        els.canvas.setPointerCapture(event.pointerId);
        state.drag = { kind: "move", ...hit, before: tmj.captureFields(hit.object), sx: at.wx, sy: at.wy, ox: hit.object.x, oy: hit.object.y, moved: false };
      }
    }
    refresh();
    invalidate();
  }
}

function onPointerMove(event) {
  if (!state.map) return;
  const at = pointer(event);
  // Cells are those of the active layer, which may be offset.
  const cell = cellIn(state.active, at.wx, at.wy);
  const hover = state.hover;
  state.hover = { ...at, cx: cell[0], cy: cell[1] };
  const drag = state.drag;
  if (drag?.kind === "pan") {
    state.view = { ...state.view, x: drag.vx + event.clientX - drag.sx, y: drag.vy + event.clientY - drag.sy };
  } else if (drag?.kind === "paint") {
    if (!state.saving) {
      const [cx, cy] = cellIn(drag.layer, at.wx, at.wy);
      for (const [x, y] of line(drag.last[0], drag.last[1], cx, cy)) paintCell(drag, x, y);
      drag.last = [cx, cy];
    }
  } else if (drag?.kind === "rect") {
    drag.end = local(drag.layer, at.wx, at.wy);
    drag.free = event.altKey;
  } else if (drag?.kind === "move") {
    const dx = Math.round(at.wx - drag.sx);
    const dy = Math.round(at.wy - drag.sy);
    if (dx || dy || drag.moved) {
      drag.moved = true;
      drag.object.x = drag.ox + dx;
      drag.object.y = drag.oy + dy;
      renderInspector();
    }
  }
  if (!hover || hover.cx !== cell[0] || hover.cy !== cell[1] || drag || state.tool === "select" || state.tool === "point") invalidate();
  renderStatus();
}

function onPointerUp(event) {
  const drag = state.drag;
  if (!drag) return;
  els.canvas.releasePointerCapture?.(event.pointerId);
  state.drag = undefined;
  if (drag.kind === "paint") tileStep(drag.tiles.gids, drag.changes);
  else if (drag.kind === "rect") {
    const rect = rectOf(drag);
    addObject(drag.layer, { shape: "rectangle", ...rect });
  } else if (drag.kind === "move" && drag.moved) {
    const after = tmj.captureFields(drag.object);
    const { object, before } = drag;
    record({ undo: () => tmj.restoreFields(object, before), redo: () => tmj.restoreFields(object, after) });
  }
  updateCursor();
  invalidate();
}

/**
 * A rectangle drawn from `start` to `end`, in its layer's own coordinates:
 * whole cells unless free (Alt), at least one cell.
 */
function rectOf({ start, end, free }) {
  const { tilewidth: tw, tileheight: th } = state.map.doc;
  if (free) {
    const x = Math.round(Math.min(start[0], end[0]));
    const y = Math.round(Math.min(start[1], end[1]));
    const width = Math.round(Math.max(start[0], end[0])) - x;
    const height = Math.round(Math.max(start[1], end[1])) - y;
    if (width >= 1 && height >= 1) return { x, y, width, height };
  }
  const [c0, r0] = cellAt(...start);
  const [c1, r1] = cellAt(...end);
  return { x: Math.min(c0, c1) * tw, y: Math.min(r0, r1) * th, width: (Math.abs(c1 - c0) + 1) * tw, height: (Math.abs(r1 - r0) + 1) * th };
}

/** A point at the centre of its cell, or where it is with Alt, in its layer's own coordinates. */
function snapPoint(wx, wy, free) {
  if (free) return [Math.round(wx), Math.round(wy)];
  const { tilewidth: tw, tileheight: th } = state.map.doc;
  return [Math.floor(wx / tw) * tw + tw / 2, Math.floor(wy / th) * th + th / 2];
}

function addObject(layer, fields) {
  const object = tmj.createObject(state.map.doc, layer, fields);
  editList(layer.objects, (list) => list.push(object));
  state.selection = { layer, object };
  refresh();
}

function deleteSelection() {
  const selection = state.selection;
  if (!selection || !editable() || state.drag) return;
  if (locked(selection.layer)) return say(t.layerLocked);
  const index = selection.layer.objects.indexOf(selection.object);
  if (index < 0) return;
  state.selection = undefined;
  editList(selection.layer.objects, (list) => list.splice(index, 1));
}

function nudge(dx, dy) {
  const object = state.selection?.object;
  if (!object || !editable() || state.drag) return;
  if (locked(state.selection.layer)) return say(t.layerLocked);
  editFields(object, (target) => {
    target.x += dx;
    target.y += dy;
  });
}

function pickFromMap(wx, wy) {
  const map = state.map;
  const pick = (layer) => {
    const [cx, cy] = cellIn(layer, wx, wy);
    const tiles = map.tiles.get(layer);
    if (!tiles?.gids || cx < 0 || cy < 0 || cx >= tiles.width || cy >= tiles.height) return 0;
    return tiles.gids[cy * tiles.width + cx];
  };
  let gid = state.active?.type === "tilelayer" ? pick(state.active) : 0;
  if (!gid) {
    for (const { layer } of layerRows()) {
      if (layer.type !== "tilelayer" || !shown(layer)) continue;
      gid = pick(layer);
      if (gid) {
        state.active = layer;
        break;
      }
    }
  }
  if (gid) pickStamp(tmj.stampOf(1, 1, [gid]), true);
  refresh();
}

function onWheel(event) {
  if (!state.map) return;
  event.preventDefault();
  const at = pointer(event);
  if (event.ctrlKey || event.metaKey) {
    // A mouse wheel moves in big steps, a trackpad pinch in small ones.
    const speed = event.deltaMode === 1 ? 0.05 : Math.abs(event.deltaY) >= 50 ? 0.0025 : 0.01;
    const factor = Math.exp(-event.deltaY * speed);
    zoomAround(state.view.zoom * factor, at.px, at.py);
    return;
  }
  const scale = event.deltaMode === 1 ? 16 : 1;
  const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
  const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
  state.view = { ...state.view, x: state.view.x - dx * scale, y: state.view.y - dy * scale };
  invalidate();
}

els.canvas.addEventListener("pointerdown", onPointerDown);
els.canvas.addEventListener("pointermove", onPointerMove);
els.canvas.addEventListener("pointerup", onPointerUp);
els.canvas.addEventListener("pointercancel", onPointerUp);
els.canvas.addEventListener("pointerleave", () => {
  if (state.drag) return;
  state.hover = undefined;
  invalidate();
  renderStatus();
});
els.canvas.addEventListener("wheel", onWheel, { passive: false });
els.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
// No autoscroll on a middle-button drag, which pans.
els.canvas.addEventListener("mousedown", (event) => event.button === 1 && event.preventDefault());
els.canvas.addEventListener("auxclick", (event) => event.preventDefault());

function updateCursor() {
  const panning = state.space || state.drag?.kind === "pan";
  els.canvas.dataset.cursor = panning ? (state.drag?.kind === "pan" ? "grabbing" : "grab") : state.tool;
}

// ---------------------------------------------------------------------------
// The tool's preview over the map.

function drawOverlay(ctx, toMap, scale) {
  const toDevice = toMap;
  const map = state.map;
  const { tilewidth: tw, tileheight: th } = map.doc;
  const dpr = window.devicePixelRatio || 1;
  const box = (x, y, w, h, color, dash) => {
    const [x0, y0] = toDevice(x, y);
    const [x1, y1] = toDevice(x + w, y + h);
    const left = Math.round(x0) + 0.5;
    const top = Math.round(y0) + 0.5;
    const width = Math.round(x1) - Math.round(x0) - 1;
    const height = Math.round(y1) - Math.round(y0) - 1;
    ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = theme.shadow;
    ctx.strokeRect(left, top, width, height);
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = color;
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]);
  };
  const frame = box;

  const drag = state.drag;
  if (drag?.kind === "rect") {
    const [ox, oy] = layerOffset(drag.layer);
    const local = rectOf(drag);
    const rect = { ...local, x: local.x + ox, y: local.y + oy };
    const [x0, y0] = toDevice(rect.x, rect.y);
    const [x1, y1] = toDevice(rect.x + rect.width, rect.y + rect.height);
    ctx.fillStyle = withAlpha(layerColor(drag.layer, theme), 0.25);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    box(rect.x, rect.y, rect.width, rect.height, layerColor(drag.layer, theme));
  }

  const hover = state.hover;
  if (hover && !drag && editable() && !locked(state.active)) {
    const { cx, cy } = hover;
    // Cells and points are those of the active layer, drawn where its offset puts them.
    const [ox, oy] = state.active ? layerOffset(state.active) : [0, 0];
    const box = (x, y, w, h, color, dash) => frame(x + ox, y + oy, w, h, color, dash);
    const toDevice = (x, y) => toMap(x + ox, y + oy);
    if (state.tool === "brush" && state.stamp && activeTiles()) {
      const [x, y] = stampOrigin(cx, cy);
      ctx.globalAlpha = 0.6;
      const { stamp } = state;
      for (let row = 0; row < stamp.height; row++) {
        for (let column = 0; column < stamp.width; column++) {
          const gid = stamp.gids[row * stamp.width + column];
          const tile = gid && tileFor(gid);
          if (!tile) continue;
          const [x0, y0] = toDevice((x + column) * tw, (y + row) * th);
          const [x1, y1] = toDevice((x + column + 1) * tw, (y + row + 1) * th);
          drawTile(ctx, tile, gid, x0, y0, x1, y1);
        }
      }
      ctx.globalAlpha = 1;
      box(x * tw, y * th, stamp.width * tw, stamp.height * th, theme.selection);
    } else if (TILE_TOOLS.has(state.tool)) {
      box(cx * tw, cy * th, tw, th, state.tool === "eraser" ? theme.danger : theme.hover);
    } else if (state.tool === "rect") {
      box(cx * tw, cy * th, tw, th, theme.hover, true);
    } else if (state.tool === "point") {
      const [x, y] = snapPoint(...local(state.active, hover.wx, hover.wy), false);
      const [px, py] = toDevice(x, y);
      ctx.beginPath();
      ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = theme.hover;
      ctx.stroke();
    }
  }
  if (state.tool === "select" && hover && !drag) {
    const hit = objectAt(hover.wx, hover.wy);
    if (hit && hit.object !== state.selection?.object) {
      const [ox, oy] = layerOffset(hit.layer);
      const b = objectBox(hit.object, 7 / state.view.zoom);
      box(b.x + ox, b.y + oy, b.width, b.height, theme.hover, true);
    }
  }
  if (state.selection) {
    const { layer, object } = state.selection;
    const [ox, oy] = layerOffset(layer);
    const b = objectBox(object, 7 / state.view.zoom);
    box(b.x + ox, b.y + oy, Math.max(b.width, 1 / scale), Math.max(b.height, 1 / scale), theme.selection);
  }
}

function layerOffset(target) {
  let result = [0, 0];
  const visit = (layers, ox, oy) => {
    for (const layer of layers ?? []) {
      const x = ox + (layer.offsetx ?? 0);
      const y = oy + (layer.offsety ?? 0);
      if (layer === target) result = [x, y];
      if (layer.type === "group") visit(layer.layers, x, y);
    }
  };
  visit(state.map.doc.layers, 0, 0);
  return result;
}

// ---------------------------------------------------------------------------
// Keyboard.

const typing = (event) => {
  const target = event.composedPath?.()[0] ?? event.target;
  return target instanceof HTMLElement && (target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
};

window.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === "s") {
    event.preventDefault();
    // A field being typed in commits its value when it loses focus.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
    void save();
    return;
  }
  if (typing(event) || document.querySelector("omg-dialog[open]")) return;
  if (mod && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redoStep();
    else undoStep();
    return;
  }
  if (mod && key === "y") {
    event.preventDefault();
    redoStep();
    return;
  }
  if (mod || event.altKey || !state.map) return;
  if (event.key === " ") {
    event.preventDefault();
    if (!state.space) {
      state.space = true;
      updateCursor();
    }
    return;
  }
  const tool = TOOLS.find(([, , shortcut]) => shortcut.toLowerCase() === key);
  if (tool) {
    event.preventDefault();
    setTool(tool[0]);
    return;
  }
  if (event.key === "Escape") {
    state.selection = undefined;
    refresh();
    invalidate();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selection) {
    event.preventDefault();
    deleteSelection();
    return;
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (arrows && state.selection) {
    event.preventDefault();
    const { tilewidth, tileheight } = state.map.doc;
    nudge(arrows[0] * (event.shiftKey ? tilewidth : 1), arrows[1] * (event.shiftKey ? tileheight : 1));
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === " " && state.space) {
    state.space = false;
    updateCursor();
  }
});
window.addEventListener("blur", () => {
  state.space = false;
  updateCursor();
});

// ---------------------------------------------------------------------------
// The inspector for the selected object (inspector.js).

const renderInspector = createInspector({
  element: els.inspector,
  t,
  selection: () => state.selection,
  doc: () => state.map.doc,
  editable: (selection) => editable() && !locked(selection.layer),
  editFields,
  deleteSelection,
});

// ---------------------------------------------------------------------------
// Toolbar, notices and status.

function updateToolbar() {
  const map = state.map;
  const canEdit = editable();
  for (const [tool, button] of els.tools) {
    const pressed = state.tool === tool;
    button.toggleAttribute("data-pressed", pressed);
    button.setAttribute("aria-pressed", String(pressed));
    button.disabled = !map || (!canEdit && tool !== "select");
  }
  els.undo.disabled = !state.at;
  els.redo.disabled = state.at >= state.history.length;
  els.zoomLabel.textContent = `${Math.round(state.view.zoom * 100)}%`;
  els.grid.toggleAttribute("data-pressed", state.grid);
  els.grid.setAttribute("aria-pressed", String(state.grid));
  els.dirty.hidden = !map || !isDirty();
  els.save.disabled = !map || !canEdit || !isDirty() || state.saving || state.external !== undefined;
  els.save.busy = state.saving;
  els.save.textContent = state.saving ? t.saving : t.save;
  updateCursor();
}

function renderNotices() {
  const notices = [];
  if (state.openError) notices.push(h("omg-banner", { tone: "bad" }, state.openError));
  if (state.map) {
    for (const reason of state.map.readOnly) notices.push(h("omg-banner", { tone: "warning" }, t.readOnly[reason] ?? reason));
    if (state.removed) notices.push(h("omg-banner", { tone: "warning" }, t.removedOnDisk));
    if (state.external !== undefined) {
      notices.push(
        h(
          "omg-banner",
          { tone: "warning" },
          t.changedOnDisk,
          h("omg-button", { slot: "actions", on: { click: () => void openPath(state.map.path, { keepView: true, force: true }) } }, t.reload),
          h(
            "omg-button",
            {
              slot: "actions",
              variant: "ghost",
              on: {
                click: () => {
                  // Saving now replaces what is on disk; don't ask again about this version.
                  state.diskText = state.external;
                  state.external = undefined;
                  renderNotices();
                },
              },
            },
            t.keepMine,
          ),
        ),
      );
    }
  }
  els.notices.replaceChildren(...notices);
  els.notices.hidden = !notices.length;
}

function renderStatus() {
  const map = state.map;
  const { cell, layer, message, size } = els.status;
  if (!map) {
    for (const element of [cell, layer, message, size]) element.textContent = "";
    return;
  }
  const hover = state.hover;
  let text = "";
  if (hover) {
    text = t.cell(hover.cx, hover.cy);
    const tiles = state.active?.type === "tilelayer" ? map.tiles.get(state.active) : undefined;
    if (tiles?.gids && hover.cx >= 0 && hover.cy >= 0 && hover.cx < tiles.width && hover.cy < tiles.height) {
      const gid = tiles.gids[hover.cy * tiles.width + hover.cx];
      if (gid) text += ` · ${t.tileLabel(tmj.tileOf(gid))}${tmj.flagsOf(gid) ? ` (${t.flipped})` : ""}`;
    }
  }
  cell.textContent = text;
  layer.textContent = state.active?.name ?? "";
  message.textContent = state.message;
  const doc = map.doc;
  size.textContent = t.mapSize(doc.width, doc.height, doc.tilewidth, doc.tileheight);
}

function refresh() {
  updateToolbar();
  renderNotices();
  renderLayers();
  renderInspector();
  renderStatus();
  renderEmpty();
  els.workspace.toggleAttribute("data-read-only", !editable());
  els.stageMessage.hidden = Boolean(state.map) || state.maps === undefined || !state.maps.length;
  els.stageMessage.textContent = state.maps === undefined ? t.loading : t.pickMap;
  invalidate();
}

// ---------------------------------------------------------------------------
// New map (new-map.js).

async function openNewMapDialog() {
  if (!(await confirmDiscard())) return;
  await (scanning ?? Promise.resolve());
  if (!state.files) await scanMaps().catch(() => {});
  showNewMapDialog({
    host,
    t,
    files: state.files ?? [],
    created: async (path) => {
      state.maps = [...new Set([...(state.maps ?? []), path])].sort((a, b) => a.localeCompare(b));
      state.files?.push({ path, kind: "file" });
      await openPath(path);
    },
  });
}

// ---------------------------------------------------------------------------
// Start: find the maps and open the last one used, or the first.

refresh();
scanning = scanMaps().catch(() => {
  state.maps = [];
  renderMapSelect();
});
// The last map used opens while the scan runs, when it is still a map.
const last = await host.request("storage.get", { key: "lastMap" }).catch(() => undefined);
const lastText = typeof last === "string" && MAP_FILE.test(last) ? await host.files.text(last).catch(() => undefined) : undefined;
let lastIsMap = false;
try {
  lastIsMap = lastText !== undefined && tmj.isTiledMap(JSON.parse(lastText));
} catch {
  // Not JSON any more.
}
const start = (path) =>
  openPath(path).catch((error) => {
    state.openError = t.openFailed(errorText(error));
    refresh();
  });
if (lastIsMap) await start(last);
await scanning;
if (!state.map && !state.openError) {
  if (state.maps?.[0]) await start(state.maps[0]);
  else refresh();
}
