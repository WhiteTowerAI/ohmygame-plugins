// The Pixel Effects panel: pixelfx's gallery in OhMyGame. It browses the
// built-in effects, plays one on the stage with the inspector's settings,
// shows it as a sprite sheet or as code, and exports it to the Library or
// the project. The project's own effects live in its `pixelfx/` folder, where
// the panel copies, writes, checks and plays them, and the agent's tools do
// the same through it. Ported from pixelfx's gallery/app.js (MIT, see
// lib/LICENSE); the stage is in stage.js, rendering for export in export.js,
// the project's files in project.js and the check in check.js.
import { connect } from "/_ohmygame/plugin-ui.js";
import { effects, categories } from "./lib/fx/index.js";
import { actTiming, PAL } from "./lib/core/index.js";
import { ZH_BACKDROPS, ZH_CATEGORIES, ZH_FX, ZH_OPTION_KEYS, ZH_PALETTES } from "./lib/zh-data.js";
import {
  buildContactSheetCanvas,
  buildGifBlob,
  buildSpriteSheet,
  canvasToPngBlob,
  exportBudget,
  framesMeta,
  renderExportFrames,
  sheetJson,
  sheetLayout,
} from "./export.js";
import { defaultConfig, effectOptions, fullMeta, isColorRamp, normHex } from "./options.js";
import { checkEffect } from "./check.js";
import {
  applySettings,
  effectIdOf,
  effectPath,
  effectTemplate,
  freeEffectId,
  isEffectId,
  LICENSE_PATH,
  metaProblem,
  missingImports,
  renamePresets,
  builtinIdOf,
  licenseNotice,
  parsePresets,
  planEffect,
  PRESETS_PATH,
  presetsFor,
  presetsText,
  ROOT,
  settingsOf,
  withPreset,
} from "./project.js";
import { drawThumbnail, StageRunner } from "./stage.js";
import { TEXT } from "./i18n.js";

// What the agent hears is English; a toast says it in the panel's language.
const uiError = (english, local) => Object.assign(new Error(english), { local });
const localText = (error) => error?.local ?? (error instanceof Error ? error.message : String(error));

const host = await connect();
const zh = host.locale === "zh-CN";
const t = TEXT[host.locale] ?? TEXT.en;
document.documentElement.lang = host.locale;
document.title = t.title;

const THEMES = ["amber", "aseprite", "cyber", "crt", "app"];
const EXPORT_DIR = "pixelfx/exports";
const LIBRARY_FORMATS = new Set(["sheet-png", "contact"]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function el(tag, props = {}, kids = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of [].concat(kids)) if (kid != null) node.append(kid);
  return node;
}

function toast(message, tone = "default") {
  void host.request("ui.toast", { message: String(message).slice(0, 500), tone }).catch(() => {});
}

const errorText = (error) => (error instanceof Error ? error.message : String(error));

// ---------------------------------------------------------------------------
// The built-in effects and their names in the panel's language.

/** An effect as the panel shows it: `raw` is its module as it is, `mod` the same with the gallery's meta defaults. */
function entry(id, source, raw, error) {
  const name = typeof raw?.meta?.name === "string" && raw.meta.name ? raw.meta.name : id.split("/")[1];
  const meta = fullMeta(error ? { name } : raw.meta);
  const mod = error ? { meta, draw() {} } : { ...raw, meta };
  return { key: `${source}:${id}`, id, cat: id.split("/")[0], source, ...(source === "project" ? { path: effectPath(id) } : {}), raw, mod, meta, ...(error ? { error } : {}) };
}

const LIBRARY = Object.entries(effects).map(([id, mod]) => entry(id, "builtin", mod));

// pixelfx's Chinese names are for its own effects, and for a copy whose name is still the built-in one's.
const BUILTIN_IDS = new Set(LIBRARY.map((fx) => fx.id));
function zhOf(fx) {
  if (!zh) return undefined;
  if (fx.source === "builtin") return ZH_FX[fx.id];
  const base = builtinIdOf(fx.id, BUILTIN_IDS);
  return base && LIBRARY.find((item) => item.id === base).meta.name === fx.meta.name ? ZH_FX[base] : undefined;
}
const nameOf = (fx) => zhOf(fx)?.[0] || fx.meta.name || fx.id.split("/")[1];
const descOf = (fx) => zhOf(fx)?.[1] || fx.meta.desc || "";
const catName = (id) => (zh ? ZH_CATEGORIES[id]?.name : categories.find((c) => c.id === id)?.name) || id;
const backdropName = (key) => (zh ? ZH_BACKDROPS[key] : t.backdrops[key]) || key;
const paletteName = (key) => (zh ? ZH_PALETTES[key] : key[0].toUpperCase() + key.slice(1)) || key;
const optionName = (key) => (zh && ZH_OPTION_KEYS[key]) || key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const fpsText = (fps) => (Number.isInteger(fps) ? String(fps) : fps.toFixed(1));

const state = {
  space: "builtin",
  project: [],
  projectNote: "",
  presets: undefined,
  presetsError: "",
  drafts: new Map(),
  checks: new Map(),
  cat: "all",
  query: "",
  filtered: LIBRARY,
  fx: undefined,
  view: "live",
  codeMode: "source",
  playing: true,
  speed: 1,
  visible: true,
  sheetZoom: "fit",
  sheetGrid: true,
  sheetActor: false,
  sheet: undefined,
  sources: new Map(),
  exporting: false,
  cfg: undefined,
};

// ---------------------------------------------------------------------------
// The page, as the upstream gallery lays it out, without its workspace,
// sound and AI parts, which come in later stages.

const pixelIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "px-icon");
  svg.setAttribute("viewBox", "0 0 8 8");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<rect x="1" y="1" width="6" height="6" fill="currentColor"/><rect x="0" y="0" width="3" height="3" fill="var(--pri)"/>';
  return svg;
};

function option(value, text) {
  return el("option", { value, textContent: text });
}

function dotButton(id, label, pressed) {
  const button = el("button", { type: "button", className: "dot-btn", ...(id ? { id } : {}) }, [el("span", { textContent: label }), el("i", { className: "status-dot" })]);
  button.setAttribute("aria-pressed", String(pressed));
  return button;
}

function pillSwitch(id, label) {
  return el("button", { type: "button", className: "pill-switch", id }, [
    el("span", { textContent: label }),
    el("span", { className: "sw-track" }, [el("i", { className: "sw-knob" })]),
  ]);
}

function labelFor(target, text, className = "row-label") {
  return el("label", { className, htmlFor: target, textContent: text });
}

function numberInput(id, className, props) {
  return el("input", { type: "number", id, className: `ctrl-input ${className}`, ...props });
}

function buildPage() {
  const viewTabs = Object.entries(t.views).map(([view, text]) => {
    const tab = el("button", { type: "button", className: "wb-tab", textContent: text, role: "tab" });
    tab.dataset.view = view;
    return tab;
  });
  const header = el("header", { className: "wb-header px-panel" }, [
    el("div", { className: "wb-title-group" }, [
      el("div", { className: "space-bar" }, [
        el("div", { className: "brand-tag" }, [pixelIcon(), el("span", { textContent: "PIXELFX" })]),
        el(
          "div",
          { className: "space-tabs", role: "tablist" },
          Object.entries(t.spaces).map(([space, text]) => {
            const tab = el("button", { type: "button", className: "space-tab", role: "tab" }, [el("span", { textContent: text }), el("span", { className: "space-count" })]);
            tab.dataset.space = space;
            return tab;
          }),
        ),
      ]),
      el("div", { className: "wb-title-line" }, [
        el("h1", { id: "fx-name" }),
        el("span", { className: "px-badge cat-badge", id: "fx-cat-badge" }),
        el("span", { className: "px-badge source-badge", id: "fx-source" }),
        el("span", { className: "wb-id", id: "fx-id" }),
        el("span", { className: "fx-actions" }, [
          el("button", { type: "button", className: "ctrl-btn btn-sm", id: "btn-copy", textContent: t.copyToProject }),
          el("button", { type: "button", className: "ctrl-btn btn-sm", id: "btn-rename", textContent: t.rename }),
          el("button", { type: "button", className: "ctrl-btn btn-sm danger-btn", id: "btn-remove", textContent: t.remove }),
        ]),
      ]),
      el("nav", { className: "wb-tabs", role: "tablist", ariaLabel: t.title }, viewTabs),
    ]),
    el("div", { className: "wb-actions" }, [
      el("div", { className: "quick-filter" }, [
        el(
          "select",
          { id: "sel-ui-theme", className: "ctrl-select theme-select", ariaLabel: t.theme, title: t.theme },
          THEMES.map((key) => option(key, t.themes[key])),
        ),
        el("select", { id: "sel-category", className: "ctrl-select", ariaLabel: t.category }),
        el("input", { id: "inp-search", className: "ctrl-input search-input", type: "search", placeholder: t.search, autocomplete: "off", ariaLabel: t.search }),
      ]),
    ]),
  ]);

  const live = el("div", { className: "view-pane", id: "pane-live" }, [
    el("div", { className: "stage-viewport px-sunken", id: "stage-viewport", title: t.replayHint }, [
      ...["tl", "tr", "bl", "br"].map((corner) => el("span", { className: `corner-mark ${corner}` })),
      el("canvas", { id: "stage-canvas" }),
      el("div", { className: "stage-error-overlay", id: "stage-error", hidden: true }),
    ]),
    el("div", { className: "timeline-bar" }, [
      el("div", { className: "scrub-wrap" }, [el("input", { type: "range", id: "scrub-range", min: 0, max: 10, step: 1, value: 0, ariaLabel: t.frameScrub })]),
      el("div", { className: "playback-row" }, [
        el("div", { className: "playback-left" }, [
          el("button", { type: "button", className: "ctrl-btn", id: "btn-play", textContent: t.pause }),
          el("button", { type: "button", className: "ctrl-btn", id: "btn-replay", textContent: t.replay }),
          labelFor("sel-speed", t.speed, "inline-label"),
          el(
            "select",
            { id: "sel-speed", className: "ctrl-select speed-select" },
            ["0.25", "0.5", "0.75", "1", "1.5", "2"].map((speed) => option(speed, `${speed.includes(".") ? speed : `${speed}.0`}x`)),
          ),
        ]),
        el("div", { className: "frame-counter", id: "frame-counter" }),
      ]),
    ]),
  ]);

  const sheet = el("div", { className: "view-pane", id: "pane-sheet", hidden: true }, [
    el("div", { className: "sub-toolbar" }, [
      el("div", { className: "sub-toolbar-left" }, [el("span", { className: "sheet-summary", id: "sheet-summary" })]),
      el("div", { className: "sub-toolbar-right" }, [
        labelFor("sel-sheet-zoom", t.zoom, "inline-label"),
        el("select", { id: "sel-sheet-zoom", className: "ctrl-select" }, [option("fit", t.zoomFit), ...[1, 2, 3, 4].map((z) => option(z, `${z}x`))]),
        dotButton("tog-sheet-grid", t.grid, true),
        dotButton("tog-sheet-actor", t.withActor, false),
        el("button", { type: "button", className: "ctrl-btn", id: "btn-sheet-library", textContent: t.addToLibrary }),
        el("button", { type: "button", className: "ctrl-btn", id: "btn-sheet-project", textContent: t.saveToProject }),
      ]),
    ]),
    el("div", { className: "sheet-scroll px-sunken", id: "sheet-scroll" }, [
      el("div", { className: "sheet-canvas-wrap" }, [el("canvas", { id: "sheet-canvas" })]),
    ]),
  ]);

  const codeTabs = Object.entries(t.codeTabs).map(([mode, text]) => {
    const tab = el("button", { type: "button", className: "wb-tab", textContent: text });
    tab.dataset.code = mode;
    return tab;
  });
  const code = el("div", { className: "view-pane", id: "pane-code", hidden: true }, [
    el("div", { className: "sub-toolbar" }, [
      el("div", { className: "code-subtabs" }, codeTabs),
      el("div", { className: "sub-toolbar-right" }, [
        el("span", { className: "code-path", id: "code-path" }),
        el("span", { className: "code-status", id: "code-status" }),
        el("button", { type: "button", className: "primary-btn btn-sm", id: "btn-code-save", textContent: t.save, hidden: true }),
      ]),
    ]),
    el("pre", { className: "code-box px-sunken", id: "code-box" }, [el("code", { id: "code-content" })]),
    el("textarea", { className: "code-box code-editor px-sunken", id: "code-editor", spellcheck: false, autocomplete: "off", hidden: true, ariaLabel: t.codeTabs.source }),
    el("div", { className: "check-result", id: "check-result", hidden: true }),
  ]);

  const carousel = el("div", { className: "carousel-bar" }, [
    el("button", { type: "button", className: "carousel-step ctrl-btn", id: "btn-prev", textContent: `< ${t.prev}` }),
    el("div", { className: "carousel-strip", id: "carousel-strip", role: "listbox", ariaLabel: t.effects }),
    el("button", { type: "button", className: "carousel-step ctrl-btn", id: "btn-next", textContent: `${t.next} >` }),
  ]);

  const inspector = el("aside", { className: "wb-inspector px-panel" }, [
    el("div", { className: "insp-section" }, [
      el("div", { className: "sec-title-bar" }, [el("h2", { className: "insp-heading", textContent: t.look })]),
      el("p", { className: "insp-desc", id: "insp-desc" }),
      el("div", { className: "insp-meta px-sunken" }, [el("div", { id: "meta-row-1" }), el("div", { id: "meta-row-2" }), el("div", { id: "meta-row-3" })]),
      el("div", { className: "form-grid" }, [
        el("div", { className: "form-row compact-row" }, [
          labelFor("sel-preset", t.preset),
          el("select", { id: "sel-preset", className: "ctrl-select row-fill" }),
          el("button", { type: "button", className: "ctrl-btn", id: "btn-save-preset", textContent: t.savePreset }),
        ]),
        el("div", { className: "form-row" }, [
          labelFor("sel-bg", t.backdrop),
          el("select", { id: "sel-bg", className: "ctrl-select row-fill" }, Object.keys(ZH_BACKDROPS).map((key) => option(key, backdropName(key)))),
        ]),
        el("div", { className: "form-row", id: "row-pal" }, [
          labelFor("sel-pal", t.palette),
          el("select", { id: "sel-pal", className: "ctrl-select row-fill" }, [
            option("", t.paletteOriginal),
            ...Object.keys(PAL).map((key) => option(key, paletteName(key))),
            option("__custom", t.paletteCustom),
          ]),
        ]),
        el("div", { className: "swatch-bar", id: "swatch-bar", title: t.swatchHint }),
        el("div", { className: "form-row compact-row" }, [
          labelFor("inp-seed", t.seed, "inline-label"),
          numberInput("inp-seed", "num-seed", { step: 1 }),
          el("button", { type: "button", className: "ctrl-btn", id: "btn-rand-seed", textContent: t.randomSeed }),
          labelFor("inp-fps", t.fps, "inline-label ml-auto"),
          numberInput("inp-fps", "num-fps", { min: 1, max: 120, step: 0.5 }),
          el("span", { className: "unit-text", textContent: "FPS" }),
        ]),
        el("div", { className: "form-row compact-row" }, [
          labelFor("inp-duration", t.duration),
          numberInput("inp-duration", "row-fill", { min: 0.05, max: 60, step: 0.05 }),
          el("span", { className: "unit-text", textContent: t.seconds }),
          el("span", { className: "scale-readout", id: "dur-scale" }),
        ]),
        el("div", { className: "form-row compact-row" }, [
          labelFor("inp-w", t.size),
          numberInput("inp-w", "num-dim", { min: 16, max: 1024, step: 1 }),
          el("span", { className: "unit-text", textContent: "x" }),
          numberInput("inp-h", "num-dim", { min: 16, max: 1024, step: 1, ariaLabel: t.size }),
          el("span", { className: "unit-text", textContent: "PX" }),
        ]),
        el("div", { className: "form-row switches-row" }, [pillSwitch("tog-aspect", t.lockAspect), pillSwitch("tog-scale-canvas", t.scaleWithCanvas)]),
        el("div", { className: "form-row compact-row" }, [
          dotButton("tog-flip", t.flip, false),
          labelFor("sel-actor", t.actor, "inline-label"),
          el("select", { id: "sel-actor", className: "ctrl-select row-fill" }, Object.entries(t.actorModes).map(([mode, text]) => option(mode, text))),
          el("button", { type: "button", className: "ctrl-btn", id: "btn-reset", textContent: t.reset }),
        ]),
      ]),
    ]),
    el("div", { className: "insp-divider" }),
    el("div", { className: "insp-section" }, [
      el("div", { className: "sec-title-bar" }, [el("h2", { className: "insp-heading", textContent: t.export })]),
      el("div", { className: "export-row" }, [
        el(
          "select",
          { id: "sel-export-fmt", className: "ctrl-select row-fill", ariaLabel: t.export },
          Object.entries(t.exportFormats).map(([format, text]) => option(format, text)),
        ),
        el("button", { type: "button", className: "primary-btn", id: "btn-export" }),
      ]),
      el("p", { className: "export-hint", id: "export-hint" }),
    ]),
    el("details", { className: "extra-accordion", id: "extra-accordion" }, [
      el("summary", {}, [el("span", { textContent: t.extraOptions }), el("i", { className: "status-dot", id: "extra-indicator" })]),
      el("div", { className: "extra-body", id: "extra-body" }),
    ]),
  ]);

  document.body.replaceChildren(
    el("div", { className: "workbench" }, [
      header,
      el("div", { className: "wb-body" }, [el("section", { className: "wb-left px-panel" }, [live, sheet, code, carousel]), inspector]),
    ]),
    el("dialog", { className: "px-dialog px-panel", id: "dialog" }),
  );
}

buildPage();

const stage = new StageRunner($("#stage-canvas"), $("#stage-viewport"), state, {
  onFrame: updateTimeline,
  onError(error) {
    // An effect that doesn't load draws nothing, which is no error of the stage's: it keeps saying why.
    if (state.fx?.error) return showLoadError();
    const overlay = $("#stage-error");
    overlay.hidden = !error;
    overlay.textContent = error ? t.stageError(errorText(error)) : "";
    if (error) setPlaying(false);
  },
});

// ---------------------------------------------------------------------------
// Choosing an effect and showing its settings.

function selectEffect(fx, cfg) {
  if (!fx) return;
  try {
    showEffect(fx, cfg);
  } catch (error) {
    if (fx.source !== "project" || fx.error) throw error;
    const broken = { ...entry(fx.id, "project", fx.raw, errorText(error)), text: fx.text };
    state.project = state.project.map((item) => (item === fx ? broken : item));
    if (state.space === "project") applyFilter();
    showEffect(broken);
  }
}

function showEffect(fx, cfg) {
  state.fx = fx;
  state.cfg = cfg ?? defaultConfig(fx);
  lastShown[fx.source] = fx.key;
  void host.request("storage.set", { key: "effect", value: fx.key }).catch(() => {});
  syncInspector();
  buildExtraOptions();
  renderPresets();
  setPlaying(true);
  stage.setup(fx, true);
  highlightCarousel();
  if (state.view === "sheet") refreshSheet();
  if (state.view === "code") void refreshCode();
  updateContext();
}

/** A project effect that doesn't load says why over the stage, instead of drawing nothing. */
function showLoadError() {
  if (!state.fx?.error) return;
  setPlaying(false);
  const overlay = $("#stage-error");
  overlay.hidden = false;
  overlay.textContent = t.loadError(state.fx.error);
}

function syncInspector() {
  const fx = state.fx;
  const m = fx.meta;
  const cfg = state.cfg;

  $("#fx-name").textContent = nameOf(fx);
  $("#fx-cat-badge").textContent = catName(fx.cat);
  $("#fx-id").textContent = fx.path ?? fx.id;
  const project = fx.source === "project";
  $("#fx-source").textContent = project ? t.spaces.project : t.builtIn;
  $("#fx-source").classList.toggle("readonly", !project);
  $("#btn-copy").hidden = project;
  $("#btn-rename").hidden = !project;
  $("#btn-remove").hidden = !project;
  resetRemove();
  $("#insp-desc").textContent = descOf(fx);

  const frames = Math.max(1, Math.round(m.duration * m.fps) + (m.loop ? 0 : 1));
  $("#meta-row-1").textContent = t.meta.original(m.size[0], m.size[1], frames, m.fps.toFixed(1));
  $("#meta-row-2").textContent = t.meta.timing(+m.duration.toFixed(2), m.loop, m.origin[0], m.origin[1]);
  const timing = fx.mod.act ? actTiming(fx.mod) : null;
  $("#meta-row-3").textContent = timing ? t.meta.act(timing.windup.toFixed(2), timing.recovery.toFixed(2), timing.hits.length) : t.meta.noAct(m.loop);

  $("#sel-bg").value = cfg.bg;
  $("#sel-pal").value = cfg.paletteKey;
  renderSwatches();

  $("#inp-seed").value = cfg.seed;
  $("#inp-fps").value = cfg.fps;
  $("#inp-duration").value = +Number(cfg.duration).toFixed(2);
  updateDurationScale();
  $("#inp-w").value = cfg.canvasW;
  $("#inp-h").value = cfg.canvasH;
  $("#tog-aspect").setAttribute("aria-pressed", String(cfg.lockAspect));
  $("#tog-scale-canvas").setAttribute("aria-pressed", String(cfg.scaleWithCanvas));
  $("#tog-flip").setAttribute("aria-pressed", String(cfg.flip));

  const hasAct = !!fx.mod.act;
  const hasActor = hasAct || !!m.actor;
  const actor = $("#sel-actor");
  actor.disabled = !hasActor;
  $('option[value="body"]', actor).hidden = !hasAct;
  $('option[value="target"]', actor).hidden = !hasAct;
  actor.value = hasActor ? cfg.actorMode : "hide";
}

function updateDurationScale() {
  const ratio = state.cfg.duration / Math.max(0.01, state.fx.meta.duration);
  $("#dur-scale").textContent = `${ratio.toFixed(2)}×`;
}

function renderSwatches() {
  // Only an effect whose options have a colour ramp as `palette` takes one; the others ignore it.
  const own = state.fx.meta.options.palette;
  const takesPalette = isColorRamp(own);
  $("#row-pal").hidden = !takesPalette;
  $("#swatch-bar").hidden = !takesPalette;
  if (!takesPalette) return $("#swatch-bar").replaceChildren();
  const colors = (state.cfg.palette ?? own).map(normHex);
  $("#swatch-bar").replaceChildren(
    ...colors.map((color, index) => {
      const picker = el("input", { type: "color", value: color, ariaLabel: t.swatch(index + 1) });
      const chip = el("label", { className: "swatch-chip", title: color }, [picker]);
      chip.style.background = color;
      picker.addEventListener("input", () => {
        const next = [...colors];
        next[index] = picker.value;
        colors[index] = picker.value;
        state.cfg.palette = next;
        state.cfg.paletteKey = "__custom";
        $("#sel-pal").value = "__custom";
        chip.style.background = picker.value;
        applyChange();
      });
      return chip;
    }),
  );
}

function swatchRow(colors, onPick) {
  return el(
    "div",
    { className: "swatch-bar" },
    colors.map((color, index) => {
      const picker = el("input", { type: "color", value: color });
      const chip = el("label", { className: "swatch-chip", title: color }, [picker]);
      chip.style.background = color;
      picker.addEventListener("input", () => {
        chip.style.background = picker.value;
        onPick(index, picker.value);
      });
      return chip;
    }),
  );
}

function buildExtraOptions() {
  const fx = state.fx;
  const extra = state.cfg.extraOpts;
  const list = effectOptions(fx.meta);
  $("#extra-indicator").classList.toggle("on", list.length > 0);
  if (!list.length) {
    $("#extra-body").replaceChildren(el("div", { className: "extra-empty", textContent: t.noExtraOptions }));
    return;
  }
  const rows = list.map(({ key, value, control }) => {
    const label = optionName(key);
    // The code's own name beside the label, when the label says it differently.
    const head = el("div", { className: "extra-item-head" }, [
      el("span", { textContent: label }),
      label === key ? null : el("span", { className: "extra-item-key", textContent: key }),
    ]);
    const set = (next) => {
      extra[key] = next;
      applyChange();
    };
    let body;
    if (control.kind === "number") {
      const current = extra[key] ?? value;
      const slider = el("input", { type: "range", min: control.min, max: control.max, step: control.step, value: current, ariaLabel: key });
      const input = el("input", { type: "number", className: "ctrl-input", step: control.step, value: current, ariaLabel: key });
      const sync = (raw) => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        slider.value = parsed;
        input.value = parsed;
        set(parsed);
      };
      slider.addEventListener("input", () => sync(slider.value));
      input.addEventListener("change", () => sync(input.value));
      body = el("div", { className: "extra-num-row" }, [slider, input]);
    } else if (control.kind === "toggle") {
      const current = extra[key] ?? value;
      body = dotButton("", current ? t.on : t.off, current);
      body.addEventListener("click", () => {
        const next = !(extra[key] ?? value);
        body.setAttribute("aria-pressed", String(next));
        body.firstChild.textContent = next ? t.on : t.off;
        set(next);
      });
    } else if (control.kind === "color") {
      body = swatchRow([normHex(extra[key] ?? value)], (_, color) => set(color));
    } else if (control.kind === "ramp") {
      body = swatchRow((extra[key] ?? value).map(normHex), (index, color) => {
        const next = (extra[key] ?? value).map(normHex);
        next[index] = color;
        set(next);
      });
    } else if (control.kind === "text") {
      body = el("input", { type: "text", className: "ctrl-input", value: extra[key] ?? value, ariaLabel: key });
      body.addEventListener("input", () => set(body.value || value));
    } else {
      const current = extra[key] ?? [...value];
      const x = el("input", { type: "number", className: "ctrl-input num-dim", value: current[0], ariaLabel: `${key} x` });
      const y = el("input", { type: "number", className: "ctrl-input num-dim", value: current[1], ariaLabel: `${key} y` });
      const onPoint = () => set([Number(x.value) || 0, Number(y.value) || 0]);
      x.addEventListener("change", onPoint);
      y.addEventListener("change", onPoint);
      body = el("div", { className: "form-row compact-row" }, [el("span", { className: "unit-text", textContent: "X" }), x, el("span", { className: "unit-text", textContent: "Y" }), y]);
    }
    return el("div", { className: "extra-item" }, [head, body]);
  });
  $("#extra-body").replaceChildren(...rows);
}

let viewTimer;
function applyChange(resetClock = false) {
  stage.setup(state.fx, resetClock);
  // The sheet and its JSON draw every frame, so they wait for a pause in the changes, such as a dragged slider.
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    if (state.view === "sheet") refreshSheet();
    if (state.view === "code" && state.codeMode !== "source") void refreshCode();
  }, 250);
  updateContext();
}

function updateTimeline() {
  const slider = $("#scrub-range");
  const last = Math.max(0, stage.totalFrames - 1);
  slider.max = last;
  slider.value = stage.frameIdx;
  slider.style.setProperty("--prog", `${(last > 0 ? (stage.frameIdx / last) * 100 : 100).toFixed(1)}%`);
  $("#frame-counter").textContent = t.frameCounter(stage.frameIdx + 1, stage.totalFrames, fpsText(state.cfg.fps));
}

function setPlaying(playing) {
  state.playing = playing;
  $("#btn-play").textContent = playing ? t.pause : t.play;
}

// ---------------------------------------------------------------------------
// The sprite sheet and code views.

function exportConfig() {
  return { ...state.cfg, displayName: nameOf(state.fx) };
}

/** Why an export of the current settings is too big to render, or undefined when it isn't. */
function tooBig(options) {
  const budget = exportBudget(state.fx, state.cfg, options);
  return budget.ok ? undefined : t.tooBig(budget.frames, budget.w, budget.h);
}

function refreshSheet() {
  const big = tooBig();
  if (big) {
    state.sheet = undefined;
    $("#sheet-summary").textContent = big;
    const canvas = $("#sheet-canvas");
    canvas.width = canvas.height = 0;
    canvas.style.width = canvas.style.height = "0";
    return;
  }
  let sheet;
  try {
    sheet = buildSpriteSheet(state.fx, exportConfig(), { exportActor: state.sheetActor });
  } catch (error) {
    state.sheet = undefined;
    $("#sheet-summary").textContent = t.stageError(errorText(error));
    return;
  }
  state.sheet = sheet;
  $("#sheet-summary").textContent = t.sheetSummary(sheet);
  const canvas = $("#sheet-canvas");
  canvas.width = sheet.canvas.width;
  canvas.height = sheet.canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet.canvas, 0, 0);
  if (state.sheetGrid) {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--pri").trim() || "#f59e0b";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (let i = 0; i < sheet.n; i++) {
      ctx.strokeRect((i % sheet.cols) * sheet.w + 0.5, Math.floor(i / sheet.cols) * sheet.h + 0.5, sheet.w - 1, sheet.h - 1);
    }
    ctx.globalAlpha = 1;
  }
  applySheetZoom();
}

function applySheetZoom() {
  const sheet = state.sheet;
  if (!sheet) return;
  let zoom = Number(state.sheetZoom) || 1;
  if (state.sheetZoom === "fit") {
    const box = $("#sheet-scroll").getBoundingClientRect();
    const width = Math.max(200, box.width - 40);
    const height = Math.max(180, box.height - 40);
    // Unlike the upstream gallery, which stops at half size, a long sheet shrinks until it fits.
    zoom = Math.min(4, Math.max(0.05, Math.min(width / sheet.canvas.width, height / sheet.canvas.height)));
    if (zoom >= 1) zoom = Math.floor(zoom * 2) / 2;
  }
  const canvas = $("#sheet-canvas");
  canvas.style.width = `${Math.round(sheet.canvas.width * zoom)}px`;
  canvas.style.height = `${Math.round(sheet.canvas.height * zoom)}px`;
}

function usageCode(fx) {
  const cfg = state.cfg;
  const name = fx.id.split("/")[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const acted = !!fx.mod.act && cfg.actorMode !== "hide";
  const create = acted ? "createAct" : "createFx";
  const options = {
    x: Math.round(cfg.canvasW / 2),
    y: Math.round(cfg.canvasH * 0.75),
    ...(cfg.seed !== (fx.meta.options?.seed ?? 1) ? { seed: cfg.seed } : {}),
    ...(cfg.flip ? { flip: true } : {}),
    ...(cfg.palette ? { palette: cfg.palette } : {}),
    ...cfg.extraOpts,
  };
  return [
    t.usageComment(nameOf(fx), fx.id),
    fx.source === "project" ? null : t.usageCopyFirst,
    `import { createFrame, clearFrame, ${create}, composite } from "./pixelfx/core/index.js";`,
    `import * as ${name} from "./pixelfx/fx/${fx.id}.js";`,
    "",
    `const W = ${Math.max(320, cfg.canvasW)}, H = ${Math.max(180, cfg.canvasH)};`,
    "const frame = createFrame(W, H);",
    "const imgData = ctx.createImageData(W, H);",
    `const fx = ${create}(${name}, ${JSON.stringify(options, null, 2)});`,
    "",
    "function updateAndDraw(dt) {",
    "  fx.update(dt);",
    "  clearFrame(frame);",
    "  fx.draw(frame);",
    "  composite(frame, imgData.data, null);",
    acted ? "  const [sx, sy] = fx.shake;\n  ctx.putImageData(imgData, sx, sy);" : "  ctx.putImageData(imgData, 0, 0);",
    "}",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function refreshCode() {
  const fx = state.fx;
  const content = $("#code-content");
  $$(".code-subtabs .wb-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.code === state.codeMode));
  const editing = fx.source === "project" && state.codeMode === "source";
  $("#code-box").hidden = editing;
  $("#code-editor").hidden = !editing;
  $("#btn-code-save").hidden = !editing;
  $("#code-status").textContent = state.codeMode === "source" && !editing ? t.readOnly : "";
  showCheck();
  if (editing) return loadEditor(fx);
  if (state.codeMode === "usage") {
    $("#code-path").textContent = "";
    content.textContent = usageCode(fx);
    return;
  }
  if (state.codeMode === "json") {
    $("#code-path").textContent = `${fx.id.split("/")[1]}.json`;
    const big = tooBig();
    if (big) {
      content.textContent = `// ${big}`;
      return;
    }
    try {
      content.textContent = JSON.stringify(buildSpriteSheet(fx, exportConfig(), { exportActor: state.sheetActor }).json, null, 2);
    } catch (error) {
      content.textContent = `// ${errorText(error)}`;
    }
    return;
  }
  $("#code-path").textContent = `fx/${fx.id}.js`;
  const cached = state.sources.get(fx.id);
  if (cached !== undefined) {
    content.textContent = cached;
    return;
  }
  content.textContent = t.loadingSource;
  let text = t.sourceFailed;
  try {
    const response = await fetch(new URL(`./lib/fx/${fx.id}.js`, import.meta.url));
    if (response.ok) {
      text = await response.text();
      state.sources.set(fx.id, text);
    }
  } catch {
    // Shown as the failure text.
  }
  if (state.fx === fx && state.view === "code" && state.codeMode === "source") content.textContent = text;
}

function showView(view) {
  state.view = view;
  $$(".wb-tabs .wb-tab").forEach((tab) => {
    const on = tab.dataset.view === view;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
  });
  $("#pane-live").hidden = view !== "live";
  $("#pane-sheet").hidden = view !== "sheet";
  $("#pane-code").hidden = view !== "code";
  if (view === "sheet") refreshSheet();
  else if (view === "code") void refreshCode();
  else stage.setup(state.fx, false);
  updateContext();
}

// ---------------------------------------------------------------------------
// The carousel of effects, filtered by category and search.

const thumbObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const canvas = $("canvas", entry.target);
      if (!canvas || canvas.dataset.rendered) continue;
      canvas.dataset.rendered = "1";
      const fx = spaceList().find((item) => item.key === entry.target.dataset.key);
      if (!fx || fx.error) continue;
      try {
        drawThumbnail(canvas, fx);
      } catch {
        entry.target.classList.add("broken");
      }
    }
  },
  { root: $("#carousel-strip"), rootMargin: "160px" },
);

/** The effects of the space shown: the built-in ones or the project's. */
const spaceList = (space = state.space) => (space === "project" ? state.project : LIBRARY);

/** The categories of `list`, pixelfx's in its order, then any others a project has. */
function categoriesOf(list) {
  const known = categories.map((c) => c.id).filter((id) => list.some((fx) => fx.cat === id));
  const others = [...new Set(list.map((fx) => fx.cat))].filter((id) => !known.includes(id)).sort();
  return [...known, ...others];
}

function rebuildCategories() {
  const list = spaceList();
  const cats = categoriesOf(list);
  if (state.cat !== "all" && !cats.includes(state.cat)) state.cat = "all";
  $("#sel-category").replaceChildren(
    option("all", t.allCategories(list.length)),
    ...cats.map((id) => option(id, `${catName(id)} (${list.filter((fx) => fx.cat === id).length})`)),
  );
  $("#sel-category").value = state.cat;
}

/** Whether an effect's names, description, category or tags hold `query`, in either language. */
function matches(fx, query) {
  if (!query) return true;
  const zhWords = fx.source === "builtin" ? [ZH_FX[fx.id]?.[0], ZH_FX[fx.id]?.[1]] : [];
  const words = [fx.id, fx.meta.name, fx.meta.desc, ...zhWords, catName(fx.cat), ZH_CATEGORIES[fx.cat]?.name, ...fx.meta.tags];
  return words.join(" ").toLowerCase().includes(query.trim().toLowerCase());
}

function applyFilter() {
  state.filtered = spaceList().filter((fx) => (state.cat === "all" || fx.cat === state.cat) && matches(fx, state.query));
  buildCarousel();
}

function buildCarousel() {
  const strip = $("#carousel-strip");
  thumbObserver.disconnect();
  const project = state.space === "project";
  const newCard = project ? el("button", { type: "button", className: "thumb-card new-card", id: "btn-new", textContent: `+ ${t.newEffect}` }) : null;
  newCard?.addEventListener("click", () => void newEffect());
  if (!state.filtered.length) {
    const empty = project && !state.project.length ? state.projectNote || t.projectEmpty : t.noMatches;
    strip.replaceChildren(...[newCard, el("div", { className: "extra-empty carousel-empty", textContent: empty })].filter(Boolean));
    return;
  }
  strip.replaceChildren(
    ...[newCard].filter(Boolean),
    ...state.filtered.map((fx) => {
      const card = el("div", { className: `thumb-card${fx.error ? " broken" : ""}`, role: "option", tabIndex: 0, title: fx.error ? t.loadError(fx.error) : (fx.path ?? fx.id) }, [
        el("canvas", { className: "thumb-stage" }),
        el("div", { className: "thumb-foot" }, [
          el("span", { className: "thumb-title", textContent: nameOf(fx) }),
          fx.error ? el("span", { className: "thumb-broken", textContent: t.broken }) : null,
        ]),
      ]);
      card.dataset.key = fx.key;
      card.addEventListener("click", () => selectEffect(fx));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter") selectEffect(fx);
      });
      thumbObserver.observe(card);
      return card;
    }),
  );
  highlightCarousel(true);
}

function highlightCarousel(instant = false) {
  for (const card of $$(".thumb-card[data-key]", $("#carousel-strip"))) {
    const on = card.dataset.key === state.fx?.key;
    card.classList.toggle("active", on);
    card.setAttribute("aria-selected", String(on));
    if (on) card.scrollIntoView({ behavior: instant ? "instant" : "smooth", inline: "center", block: "nearest" });
  }
}

function step(delta) {
  const list = state.filtered.length ? state.filtered : spaceList();
  if (!list.length) return;
  const index = list.findIndex((fx) => fx.key === state.fx?.key);
  selectEffect(list[index < 0 ? 0 : (index + delta + list.length) % list.length]);
}

// ---------------------------------------------------------------------------
// Export: images the Library takes go there; the rest are project files.

function updateExportButton() {
  const format = $("#sel-export-fmt").value;
  const button = $("#btn-export");
  button.disabled = state.exporting;
  button.textContent = state.exporting ? t.working : LIBRARY_FORMATS.has(format) ? t.addToLibrary : t.saveToProject;
  $("#export-hint").textContent = t.exportHints[format](`${EXPORT_DIR}/`);
  for (const id of ["#btn-sheet-library", "#btn-sheet-project"]) $(id).disabled = state.exporting;
}

async function addToLibrary(blob, name) {
  try {
    await host.library.add(blob, { name, prompt: `pixelfx ${state.fx.id}` });
  } catch (error) {
    if (!state.visible) throw uiError(TEXT.en.libraryHidden, t.libraryHidden);
    throw error;
  }
}

/** Saves one PNG per frame, then deletes the frames a longer export left in the same folder. */
async function exportFrames(fx, cfg, name, write) {
  const seq = renderExportFrames(fx, state.sheetActor ? cfg : { ...cfg, actorMode: "hide" });
  const n = seq.totalFrames;
  const digits = Math.max(3, String(n - 1).length);
  const folder = `${EXPORT_DIR}/${name}-frames`;
  const canvas = el("canvas", { width: seq.w, height: seq.h });
  const ctx = canvas.getContext("2d");
  const files = [];
  for (let i = 0; i < n; i++) {
    ctx.clearRect(0, 0, seq.w, seq.h);
    ctx.putImageData(new ImageData(seq.frames[i].rgba, seq.w, seq.h), 0, 0);
    const file = `${name}_${String(i).padStart(digits, "0")}.png`;
    await write(`${folder}/${file}`, await canvasToPngBlob(canvas));
    files.push(file);
  }
  const { cols, rows } = sheetLayout(n, seq.w, seq.h);
  await write(`${folder}/${name}_meta.json`, `${JSON.stringify(framesMeta(sheetJson(fx, cfg, seq, cols, rows).meta, files), null, 2)}\n`);
  const kept = new Set(files.map((file) => `${folder}/${file}`));
  const prefix = `${folder}/${name}_`;
  const leftover = (path) => path.startsWith(prefix) && /^\d+\.png$/.test(path.slice(prefix.length)) && !kept.has(path);
  const { entries } = await host.files.list(folder);
  for (const entry of entries) if (entry.kind === "file" && leftover(entry.path)) await host.files.delete(entry.path);
}

/**
 * Exports the effect shown with the inspector's settings. Returns the
 * project files saved and what went to the Library; on failure, throws with
 * `saved` on the error.
 */
async function runExport(format) {
  if (state.exporting) throw new Error("An export is already running");
  if (!state.fx) throw new Error("No effect is shown");
  if (state.fx.error) throw uiError(TEXT.en.loadError(state.fx.error), t.loadError(state.fx.error));
  const big = tooBig({ contact: format === "contact" });
  if (big) {
    const { frames, w, h } = exportBudget(state.fx, state.cfg, { contact: format === "contact" });
    throw uiError(TEXT.en.tooBig(frames, w, h), big);
  }
  const fx = state.fx;
  const cfg = exportConfig();
  const name = fx.id.split("/")[1];
  state.exporting = true;
  updateExportButton();
  // Lets the button show it is working before the frames are drawn.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const saved = [];
  const library = [];
  const write = async (path, contents) => saved.push(await host.files.write(path, contents));
  const toLibrary = async (blob, file) => {
    await addToLibrary(blob, file);
    library.push(file);
  };
  try {
    if (format === "sheet-both" || format === "sheet-png") {
      const sheet = buildSpriteSheet(fx, cfg, { exportActor: state.sheetActor });
      const png = await canvasToPngBlob(sheet.canvas);
      if (format === "sheet-png") await toLibrary(png, `${name}.png`);
      else {
        await write(`${EXPORT_DIR}/${name}.png`, png);
        await write(`${EXPORT_DIR}/${name}.json`, `${JSON.stringify(sheet.json, null, 2)}\n`);
      }
    } else if (format === "contact") {
      await toLibrary(await canvasToPngBlob(buildContactSheetCanvas(fx, cfg)), `${name}-contact.png`);
    } else if (format === "gif") {
      await write(`${EXPORT_DIR}/${name}.gif`, buildGifBlob(fx, cfg));
    } else if (format === "frames") {
      await exportFrames(fx, cfg, name, write);
    } else throw new Error(`Unknown format ${format}`);
    return { fx, cfg, saved, library };
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { saved });
  } finally {
    state.exporting = false;
    updateExportButton();
  }
}

async function exportAs(format) {
  if (state.exporting || !state.fx) return;
  try {
    const { saved } = await runExport(format);
    // The app announces what reaches the Library itself.
    if (saved.length) toast(t.savedFiles(saved), "success");
  } catch (error) {
    const saved = error.saved ?? [];
    toast(saved.length ? t.exportFailedAfter(localText(error), saved) : t.exportFailed(localText(error)), "danger");
  }
}

// ---------------------------------------------------------------------------
// The project's effects: listed from pixelfx/fx/, imported as the project's
// modules, and loaded again when its files change.

const notFound = (error) => /not found/i.test(errorText(error));
const pause = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/** A file of the plugin's pixelfx copy, as `core/math.js`. */
async function readLib(path) {
  const response = await fetch(new URL(`./lib/${path}`, import.meta.url));
  if (!response.ok) throw new Error(`No ${path}`);
  return response.text();
}

async function builtinSource(id) {
  if (!state.sources.has(id)) state.sources.set(id, await readLib(`fx/${id}.js`));
  return state.sources.get(id);
}

let license;
const licenseText = async () => (license ??= licenseNotice(await readLib("LICENSE")));

/** The project's files under pixelfx/, with whether there were too many to list. */
async function projectFiles() {
  try {
    const { entries, truncated } = await host.files.list(ROOT, { recursive: true });
    return { paths: new Set(entries.filter((item) => item.kind === "file").map((item) => item.path)), truncated };
  } catch (error) {
    if (notFound(error)) return { paths: new Set(), truncated: false };
    throw error;
  }
}

/**
 * Imports a project effect; one that throws, or isn't an effect, comes back
 * with why. Each keeps the text it was read as, which says whether the
 * module is the file as it is now.
 */
async function importEffect(id) {
  const text = await host.files.text(effectPath(id)).catch(() => undefined);
  const made = (mod, error) => ({ ...entry(id, "project", mod, error), text });
  try {
    const mod = await host.modules.import(effectPath(id));
    if (!mod.meta || typeof mod.meta !== "object") return made(mod, "exports no meta");
    if (typeof mod.draw !== "function" && typeof mod.create !== "function") return made(mod, "exports neither draw nor create");
    return made(mod, metaProblem(fullMeta(mod.meta), mod.act));
  } catch (error) {
    return made(undefined, errorText(error));
  }
}

async function readProject() {
  let listing;
  try {
    listing = await projectFiles();
  } catch (error) {
    state.project = [];
    state.projectNote = t.projectFailed(errorText(error));
    return refreshSpace();
  }
  const ids = [...listing.paths].map(effectIdOf).filter(Boolean).sort();
  state.project = await Promise.all(ids.map(importEffect));
  state.files = listing.paths;
  state.projectNote = listing.truncated ? t.projectFailed(`${ROOT}/ has too many files`) : "";
  refreshSpace();
}

// One reading at a time, so the last one started is the one that stays.
let reading = Promise.resolve();
function loadProject() {
  reading = reading.then(readProject, readProject);
  return reading;
}
let projectReady = Promise.resolve();

/** The settings of `old` (by default the effect shown) carried over to `fx`, such as a copy or a new version of it. */
function carried(fx, old = state.fx) {
  if (!old || old.error || fx.error) return undefined;
  const { cfg } = applySettings(defaultConfig(fx), settingsOf(state.cfg, old), fx);
  return { ...cfg, scaleWithCanvas: state.cfg.scaleWithCanvas, ...(cfg.palette ? { paletteKey: state.cfg.paletteKey } : {}) };
}

// A renamed effect stays shown under its new name.
const renamed = new Map();

function updateSpaceTabs() {
  for (const tab of $$(".space-tab")) {
    const on = tab.dataset.space === state.space;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
  }
  $('.space-tab[data-space="project"] .space-count').textContent = state.project.length ? String(state.project.length) : "";
}

/** Shows the project's effects as they are now, keeping the one shown when it's still there. */
function refreshSpace() {
  updateSpaceTabs();
  if (state.space === "project") {
    rebuildCategories();
    applyFilter();
  }
  const fx = state.fx;
  if (fx?.source !== "project") return;
  const id = renamed.get(fx.id) ?? fx.id;
  renamed.delete(fx.id);
  const next = state.project.find((item) => item.id === id);
  // An effect whose file didn't change keeps playing as it was.
  if (next && next.id === fx.id && (next.raw === fx.raw || (next.text !== undefined && next.text === fx.text)) && next.error === fx.error) {
    state.fx = next;
    highlightCarousel(true);
  } else if (next) selectEffect(next, carried(next));
  else openEffect(state.project[0] ?? LIBRARY.find((item) => item.id === fx.id) ?? LIBRARY[0]);
}

const lastShown = { builtin: undefined, project: undefined };

function setSpace(space, keep = false) {
  if (state.space === space) return;
  state.space = space;
  state.cat = "all";
  updateSpaceTabs();
  rebuildCategories();
  applyFilter();
  if (keep) return;
  const fx = spaceList().find((item) => item.key === lastShown[space]) ?? state.filtered[0];
  if (fx) selectEffect(fx);
}

/** Shows `fx` in its space, clearing a filter that hides it. */
function openEffect(fx, cfg) {
  if (!fx) return;
  setSpace(fx.source, true);
  if (!state.filtered.includes(fx)) {
    state.cat = "all";
    state.query = "";
    $("#inp-search").value = "";
    rebuildCategories();
    applyFilter();
  }
  selectEffect(fx, cfg);
}

// Files events: the project's modules import as they are now only after one,
// so a write waits to hear of itself before the effect is loaded again.
const fileWaiters = new Set();
let reloadTimer;
let reloadPending;
let reloadDone = () => {};
host.on("files", ({ paths, truncated } = {}) => {
  for (const waiter of [...fileWaiters]) waiter(paths, truncated);
  const unnamed = !Array.isArray(paths) || truncated;
  if (!unnamed && !paths.some((path) => path.startsWith(`${ROOT}/`))) return;
  if (unnamed || paths.includes(PRESETS_PATH)) void loadPresets();
  clearTimeout(reloadTimer);
  reloadPending ??= new Promise((resolve) => (reloadDone = resolve));
  reloadTimer = setTimeout(() => {
    const done = reloadDone;
    reloadPending = undefined;
    loadProject()
      .finally(done)
      .catch(() => {});
  }, 150);
});

/** Resolves once the project's effects are loaded as the last files event left them. */
async function projectSettled() {
  await projectReady;
  await reloadPending;
  await reading;
}

// Writes, renames and deletes, one at a time, so one never lands on what another is doing.
let changing = Promise.resolve();
function change(run) {
  const result = changing.then(run);
  changing = result.catch(() => {});
  return result;
}

/** Resolves once a files event names one of `paths`, or doesn't say which changed, or after `ms`. */
function filesHeard(paths, ms = 3000) {
  return new Promise((resolve) => {
    const want = new Set(paths);
    const done = (heard) => {
      clearTimeout(timer);
      fileWaiters.delete(listener);
      resolve(heard);
    };
    const listener = (heard, truncated) => {
      if (!Array.isArray(heard) || truncated || heard.some((path) => want.has(path))) done(true);
    };
    const timer = setTimeout(done, ms, false);
    fileWaiters.add(listener);
  });
}

/**
 * Writes the project effect `id` with `code`, adds the pixelfx files it
 * imports that the project lacks (never replacing one it has), and loads it
 * again. With `fresh`, an effect already at that path is an error.
 */
function writeEffect(id, code, options) {
  return change(() => writeNow(id, code, options));
}

async function writeNow(id, code, { fresh = false, onWritten } = {}) {
  if (!isEffectId(id)) throw uiError(TEXT.en.badName, t.badName);
  const listing = await projectFiles();
  if (listing.truncated) throw new Error(`${ROOT}/ has too many files to check what's already there`);
  if (fresh && listing.paths.has(effectPath(id))) throw uiError(TEXT.en.nameTaken, t.nameTaken);
  const plan = await planEffect({ id, source: code, readLib, existing: listing.paths, license: await licenseText() });
  const written = plan.writes.map((write) => write.path);
  const heard = filesHeard(written);
  for (const write of plan.writes) await host.files.write(write.path, write.text);
  onWritten?.();
  // Until the app reports the write, an import may give the code from before it.
  const heardWrite = await heard;
  await loadProject();
  return { fx: state.project.find((item) => item.id === id), written, kept: plan.kept, loaded: heardWrite };
}

/** Copies a built-in effect into the project under its own name, or the first free one after it. */
async function copyToProject(fx) {
  const { paths } = await projectFiles();
  const id = freeEffectId(fx.id, new Set([...paths].map(effectIdOf).filter(Boolean)));
  const result = await writeEffect(id, await builtinSource(fx.id), { fresh: true });
  return { ...result, id, path: effectPath(id) };
}

/** Why a project effect doesn't load: the imports it lacks, which the browser's error doesn't name, or that error. */
function loadErrors(fx, source) {
  const missing = fx.source === "project" && state.files ? missingImports(source, fx.id, state.files) : [];
  return missing.length ? missing.map((spec) => `imports ${spec}, which isn't in the project`) : [`doesn't load: ${fx.error}`];
}

/** Checks an effect as `source` has it; the check is shown until its file holds other code. */
function runCheck(fx, source) {
  const result = fx.raw ? checkEffect(fx.raw, source) : { ok: false, errors: loadErrors(fx, source), warnings: [], stats: {} };
  state.checks.set(fx.key, { ...result, source });
  if (state.fx?.key === fx.key) {
    showCheck();
    updateContext();
  }
  return result;
}

// ---------------------------------------------------------------------------
// The code editor of a project effect, and its check.

function updateCodeStatus() {
  if (state.fx?.source !== "project" || state.codeMode !== "source") return;
  $("#code-status").textContent = state.drafts.has(state.fx.key) ? t.unsaved : "";
}

async function loadEditor(fx) {
  const editor = $("#code-editor");
  $("#code-path").textContent = fx.path;
  updateCodeStatus();
  const draft = state.drafts.get(fx.key);
  if (draft !== undefined) {
    editor.value = draft;
    editor.readOnly = false;
    editor.dataset.key = fx.key;
    return;
  }
  if (editor.dataset.key !== fx.key) {
    editor.value = "";
    editor.readOnly = true;
    delete editor.dataset.key;
  }
  let text;
  let readable = true;
  try {
    text = await host.files.text(fx.path);
  } catch (error) {
    text = `// ${errorText(error)}`;
    readable = false;
  }
  if (state.fx?.key !== fx.key || state.drafts.has(fx.key)) return;
  // A check of other code, such as before someone else changed the file, says nothing of this.
  if (readable && state.checks.get(fx.key)?.source !== text && state.checks.delete(fx.key)) {
    showCheck();
    updateContext();
  }
  editor.value = text;
  // What can't be read isn't saved over.
  editor.readOnly = !readable;
  editor.dataset.key = fx.key;
}

function showCheck() {
  const box = $("#check-result");
  const fx = state.fx;
  const result = fx && state.checks.get(fx.key);
  box.hidden = !result || fx.source !== "project" || state.codeMode !== "source";
  if (box.hidden) return;
  const { errors, warnings } = result;
  const tone = errors.length ? "bad" : warnings.length ? "warn" : "ok";
  box.replaceChildren(
    el("div", { className: `check-head ${tone}`, textContent: errors.length || warnings.length ? t.checkSummary(errors.length, warnings.length) : t.checkOk }),
    ...errors.map((message) => el("div", { className: "check-line bad", textContent: message })),
    ...warnings.map((message) => el("div", { className: "check-line warn", textContent: message })),
  );
}

let saving = false;
async function saveEditor() {
  const fx = state.fx;
  const editor = $("#code-editor");
  if (saving || fx?.source !== "project" || editor.readOnly || editor.dataset.key !== fx.key) return;
  const code = editor.value;
  saving = true;
  $("#btn-code-save").disabled = true;
  $("#code-status").textContent = t.saving;
  try {
    const { fx: loaded, loaded: fresh } = await writeEffect(fx.id, code, {
      onWritten: () => {
        if (state.drafts.get(fx.key) === code) state.drafts.delete(fx.key);
      },
    });
    if (!fresh) toast(t.savedNotLoaded);
    else if (loaded) {
      $("#code-status").textContent = t.checking;
      await pause();
      runCheck(loaded, code);
    }
  } catch (error) {
    toast(t.failed(localText(error)), "danger");
  } finally {
    saving = false;
    $("#btn-code-save").disabled = false;
    updateCodeStatus();
  }
}

$("#code-editor").addEventListener("input", (event) => {
  if (state.fx?.source !== "project" || event.target.dataset.key !== state.fx.key) return;
  state.drafts.set(state.fx.key, event.target.value);
  updateCodeStatus();
});
$("#code-editor").addEventListener("keydown", (event) => {
  const editor = event.target;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveEditor();
  } else if (event.key === "Tab" && !event.shiftKey && !editor.readOnly) {
    event.preventDefault();
    editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    editor.dispatchEvent(new Event("input"));
  }
});
$("#btn-code-save").addEventListener("click", () => void saveEditor());

// ---------------------------------------------------------------------------
// A small form in a dialog, for names.

function ask({ title, confirm, fields, validate }) {
  const dialog = $("#dialog");
  return new Promise((resolve) => {
    let answer = null;
    const inputs = {};
    const extra = [];
    const rows = fields.map((field) => {
      const id = `dialog-${field.name}`;
      const input =
        field.type === "checkbox"
          ? el("input", { type: "checkbox", id, checked: !!field.value })
          : el("input", { type: "text", id, className: "ctrl-input", value: field.value ?? "", autocomplete: "off", spellcheck: false, placeholder: field.placeholder ?? "" });
      if (field.list) {
        const list = el("datalist", { id: `${id}-list` }, field.list.map((value) => option(value, catName(value))));
        input.setAttribute("list", list.id);
        extra.push(list);
      }
      inputs[field.name] = input;
      return el("label", { className: field.type === "checkbox" ? "dialog-check" : "dialog-row", htmlFor: id }, [el("span", { textContent: field.label }), input]);
    });
    const error = el("p", { className: "dialog-error", role: "alert" });
    const cancel = el("button", { type: "button", className: "ctrl-btn", textContent: t.cancel });
    const form = el("form", { className: "dialog-form" }, [
      el("h2", { className: "insp-heading", textContent: title }),
      ...rows,
      ...extra,
      error,
      el("div", { className: "dialog-actions" }, [cancel, el("button", { type: "submit", className: "primary-btn", textContent: confirm })]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.type === "checkbox" ? input.checked : input.value.trim()]));
      const problem = validate?.(values);
      if (problem) {
        error.textContent = problem;
        return;
      }
      answer = values;
      dialog.close();
    });
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => resolve(answer), { once: true });
    dialog.replaceChildren(form);
    dialog.showModal();
    inputs[fields.find((field) => field.type !== "checkbox" && !field.value)?.name ?? fields[0].name].focus();
  });
}

const nameProblem = (id, current) => (!isEffectId(id) ? t.badName : id !== current && state.project.some((item) => item.id === id) ? t.nameTaken : "");

async function newEffect() {
  const values = await ask({
    title: t.newEffect,
    confirm: t.create,
    fields: [
      { name: "category", label: t.category, value: state.fx?.cat ?? "arcane", list: categoriesOf([...LIBRARY, ...state.project]) },
      { name: "name", label: t.name, placeholder: t.nameHint },
      { name: "loop", label: t.loops, type: "checkbox", value: false },
    ],
    validate: ({ category, name }) => nameProblem(`${category}/${name}`),
  });
  if (!values) return;
  const id = `${values.category}/${values.name}`;
  try {
    const { fx } = await writeEffect(id, effectTemplate(id, values.loop), { fresh: true });
    if (!fx) return;
    openEffect(fx);
    state.codeMode = "source";
    showView("code");
  } catch (error) {
    toast(t.failed(localText(error)), "danger");
  }
}

async function renameEffect(fx) {
  const name = fx.id.split("/")[1];
  const values = await ask({
    title: t.rename,
    confirm: t.rename,
    fields: [{ name: "name", label: t.name, value: name, placeholder: t.nameHint }],
    validate: ({ name: next }) => nameProblem(`${fx.cat}/${next}`, fx.id),
  });
  if (!values || values.name === name) return;
  const id = `${fx.cat}/${values.name}`;
  const to = effectPath(id);
  try {
    await change(async () => {
      const heard = filesHeard([fx.path, to]);
      await host.files.move(fx.path, to);
      for (const map of [state.drafts, state.checks]) {
        if (map.has(fx.key)) map.set(`project:${id}`, map.get(fx.key));
        map.delete(fx.key);
      }
      renamed.set(fx.id, id);
      const doc = state.presets && renamePresets(state.presets, fx.id, id);
      if (doc && doc !== state.presets) {
        await host.files.write(PRESETS_PATH, presetsText(doc));
        state.presets = doc;
      }
      await heard;
      await loadProject();
    });
  } catch (error) {
    renamed.delete(fx.id);
    toast(t.failed(localText(error)), "danger");
  }
}

let removeTimer;
function resetRemove() {
  clearTimeout(removeTimer);
  const button = $("#btn-remove");
  button.textContent = t.remove;
  delete button.dataset.armed;
}

async function removeEffect(fx) {
  try {
    await change(async () => {
      const heard = filesHeard([fx.path]);
      await host.files.delete(fx.path);
      state.drafts.delete(fx.key);
      state.checks.delete(fx.key);
      await heard;
      await loadProject();
    });
    toast(t.removed(fx.path), "success");
  } catch (error) {
    toast(t.failed(localText(error)), "danger");
  }
}

$("#btn-copy").addEventListener("click", async (event) => {
  const fx = state.fx;
  if (fx?.source !== "builtin") return;
  event.currentTarget.disabled = true;
  try {
    const result = await copyToProject(fx);
    toast([t.copied(result.path), result.kept.length ? t.keptFiles(result.kept.length) : ""].filter(Boolean).join(" "), "success");
    if (result.fx) openEffect(result.fx, carried(result.fx, fx));
  } catch (error) {
    toast(t.failed(localText(error)), "danger");
  } finally {
    $("#btn-copy").disabled = false;
  }
});
$("#btn-rename").addEventListener("click", () => {
  if (state.fx?.source === "project") void renameEffect(state.fx);
});
$("#btn-remove").addEventListener("click", () => {
  const button = $("#btn-remove");
  if (state.fx?.source !== "project") return;
  if (!button.dataset.armed) {
    button.dataset.armed = "1";
    button.textContent = t.confirmRemove;
    removeTimer = setTimeout(resetRemove, 4000);
    return;
  }
  resetRemove();
  void removeEffect(state.fx);
});
for (const tab of $$(".space-tab")) tab.addEventListener("click", () => setSpace(tab.dataset.space));

// ---------------------------------------------------------------------------
// Presets: named settings for an effect, in pixelfx/presets.json.

async function readPresets() {
  let text;
  try {
    text = await host.files.text(PRESETS_PATH);
  } catch (error) {
    if (notFound(error)) return { version: 1, presets: [] };
    throw new Error(t.presetsUnreadable(PRESETS_PATH));
  }
  try {
    return parsePresets(text);
  } catch {
    throw new Error(t.presetsUnreadable(PRESETS_PATH));
  }
}

async function loadPresets() {
  try {
    state.presets = await readPresets();
    state.presetsError = "";
  } catch (error) {
    state.presets = undefined;
    state.presetsError = errorText(error);
  }
  renderPresets();
}

function renderPresets() {
  const fx = state.fx;
  const select = $("#sel-preset");
  const list = state.presets && fx ? presetsFor(state.presets, fx.id, fx.source) : [];
  select.replaceChildren(option("", t.presetNone), ...list.map((preset, index) => option(String(index), preset.name)));
  select.disabled = !list.length;
  const save = $("#btn-save-preset");
  save.disabled = !fx || !!fx.error || !!state.presetsError;
  save.title = state.presetsError;
}

/** Shows the effect shown with `cfg`, as a preset, the agent or Reset set it. */
function applyConfig(cfg) {
  state.cfg = cfg;
  syncInspector();
  buildExtraOptions();
  setPlaying(true);
  stage.setup(state.fx, true);
  if (state.view === "sheet") refreshSheet();
  if (state.view === "code") void refreshCode();
  updateContext();
}

$("#sel-preset").addEventListener("change", (event) => {
  const fx = state.fx;
  if (event.target.value === "") return applyConfig(defaultConfig(fx));
  const preset = presetsFor(state.presets ?? { presets: [] }, fx.id, fx.source)[Number(event.target.value)];
  if (preset) applyConfig(applySettings(defaultConfig(fx), preset.settings, fx).cfg);
});

$("#btn-save-preset").addEventListener("click", async () => {
  const fx = state.fx;
  if (!fx || fx.error) return;
  const values = await ask({
    title: t.savePreset,
    confirm: t.save,
    fields: [{ name: "name", label: t.presetName }],
    validate: ({ name }) => (name && name.length <= 60 ? "" : t.presetName),
  });
  if (!values) return;
  try {
    // Read again, so a change made meanwhile isn't lost.
    const doc = withPreset(await readPresets(), { name: values.name, effect: fx.id, source: fx.source, settings: settingsOf(state.cfg, fx) });
    await host.files.write(PRESETS_PATH, presetsText(doc));
    state.presets = doc;
    renderPresets();
    const index = presetsFor(doc, fx.id, fx.source).findIndex((preset) => preset.name === values.name);
    $("#sel-preset").value = String(index);
    toast(t.presetSaved(values.name), "success");
  } catch (error) {
    toast(t.failed(localText(error)), "danger");
  }
});

// ---------------------------------------------------------------------------
// What the agent hears the person has open, in English.

let contextTimer;
function updateContext() {
  if (!host.context) return;
  clearTimeout(contextTimer);
  contextTimer = setTimeout(() => {
    const fx = state.fx;
    if (!fx) return;
    const check = state.checks.get(fx.key);
    const lines = [
      `The Pixel Effects panel shows ${fx.source === "project" ? `the project's effect ${fx.path}` : `the built-in effect ${fx.id}`}: ${fx.meta.name}${fx.meta.desc ? ` (${fx.meta.desc})` : ""}.`,
      fx.error ? `It doesn't load: ${fx.error}` : null,
      `View: ${state.view}. Preview settings that differ from the effect's own: ${JSON.stringify(settingsOf(state.cfg, fx))}`,
      check ? `Last check: ${check.errors.length} errors, ${check.warnings.length} warnings.${[...check.errors, ...check.warnings].slice(0, 10).map((line) => `\n- ${line}`).join("")}` : null,
      fx.source === "builtin" ? "Built-in effects are read-only; copy_effect puts one in the project to change." : null,
    ];
    void host.context.set({ label: `${nameOf(fx)} · ${fx.id}`.slice(0, 120), text: lines.filter(Boolean).join("\n").slice(0, 8000) }).catch(() => {});
  }, 400);
}

// ---------------------------------------------------------------------------
// The agent's tools, which work the panel as the person does.

/** The effect `id`, from `source`, or the project's before the built-in one. */
function findEffect(id, source) {
  const inProject = () => state.project.find((fx) => fx.id === id);
  const builtin = () => LIBRARY.find((fx) => fx.id === id);
  if (typeof id !== "string") return undefined;
  return source === "builtin" ? builtin() : source === "project" ? inProject() : (inProject() ?? builtin());
}

function requireEffect(id, source) {
  const fx = findEffect(id, source);
  if (!fx) throw new Error(`No ${source ? `${source} ` : ""}effect ${id}. find_effects lists them.`);
  return fx;
}

const summary = (fx) => ({
  effect: fx.id,
  source: fx.source,
  ...(fx.path ? { path: fx.path } : {}),
  name: fx.meta.name,
  desc: fx.meta.desc,
  tags: fx.meta.tags,
  loop: fx.meta.loop,
  size: fx.meta.size,
  duration: fx.meta.duration,
  ...(fx.raw?.act ? { act: true } : {}),
  ...(fx.error ? { error: fx.error } : {}),
});

const sourceOf = (fx) => (fx.source === "project" ? host.files.text(fx.path) : builtinSource(fx.id));
const shownError = () => (!$("#stage-error").hidden ? $("#stage-error").textContent : undefined);

function handleTools() {
  if (!host.tools) return;
  host.tools.handle("find_effects", async ({ query = "", category, source = "all", limit = 30 } = {}) => {
    await projectSettled();
    const pool = source === "builtin" ? LIBRARY : source === "project" ? state.project : [...state.project, ...LIBRARY];
    const found = pool.filter((fx) => (!category || fx.cat === category) && matches(fx, query));
    return { total: found.length, effects: found.slice(0, limit).map(summary), categories: categoriesOf([...LIBRARY, ...state.project]) };
  });
  host.tools.handle("read_effect", async ({ effect, source }) => {
    await projectSettled();
    const fx = requireEffect(effect, source);
    return { ...summary(fx), meta: JSON.parse(JSON.stringify(fx.raw?.meta ?? null)), code: await sourceOf(fx) };
  });
  host.tools.handle("copy_effect", async ({ effect }) => {
    await projectSettled();
    const fx = requireEffect(effect, "builtin");
    const result = await copyToProject(fx);
    if (result.fx) openEffect(result.fx);
    return { effect: result.id, path: result.path, written: result.written, kept: result.kept };
  });
  host.tools.handle("write_effect", async ({ effect, code }) => {
    await projectSettled();
    const same = state.fx?.source === "project" && state.fx.id === effect;
    const { fx, written, kept, loaded } = await writeEffect(effect, code);
    if (!fx) throw new Error(`Wrote ${written.join(", ")}, but ${effectPath(effect)} isn't listed`);
    // The agent's code is the file now; Undo brings the person's back, and a Save of their old draft would quietly undo the agent's.
    const draft = state.drafts.delete(fx.key);
    if (draft) {
      toast(t.draftReplaced(fx.path));
      if (state.fx?.key === fx.key && state.view === "code") void refreshCode();
    }
    const dropped = draft ? { note: "The person's unsaved edits to this effect were dropped; they were told." } : {};
    if (!loaded)
      return { effect, path: fx.path, written, kept, loaded: false, note: "Saved, but the app hasn't reported the change yet, so it wasn't checked. Call check_effect shortly.", ...(draft ? { draftDropped: true } : {}) };
    const result = runCheck(fx, code);
    openEffect(fx, same ? carried(fx) : undefined);
    return { effect, path: fx.path, written, kept, ...result, ...dropped };
  });
  host.tools.handle("check_effect", async ({ effect, source }) => {
    await projectSettled();
    let fx = requireEffect(effect, source);
    let text = await sourceOf(fx);
    if (fx.source === "project" && text !== fx.text) {
      // The file changed since it was imported: wait until the app reports it and it loads again.
      await filesHeard([fx.path]);
      await loadProject();
      fx = requireEffect(effect, "project");
      text = await sourceOf(fx);
      if (text !== fx.text) throw new Error(`${fx.path} is still changing; check it again in a moment`);
    }
    return { effect: fx.id, source: fx.source, ...runCheck(fx, text) };
  });
  host.tools.handle("show_effect", async ({ effect, source, view, settings, reset }) => {
    await projectSettled();
    const fx = requireEffect(effect, source);
    if (state.fx?.key !== fx.key) openEffect(fx);
    const base = reset ? defaultConfig(fx) : state.cfg;
    const { cfg, ignored } = applySettings(base, settings, fx);
    applyConfig(cfg);
    if (view) showView(view);
    await pause(120);
    const error = shownError();
    return { ...summary(fx), view: state.view, settings: settingsOf(state.cfg, fx), ...(ignored.length ? { ignored } : {}), ...(error ? { error } : {}) };
  });
  host.tools.handle("export_effect", async ({ effect, source, format }) => {
    await projectSettled();
    if (effect) {
      const fx = requireEffect(effect, source);
      if (state.fx?.key !== fx.key) openEffect(fx);
    }
    const { fx, cfg, saved, library } = await runExport(format);
    return { effect: fx.id, source: fx.source, format, saved, library, settings: settingsOf(cfg, fx) };
  });
}

// ---------------------------------------------------------------------------
// Controls.

function setTheme(theme) {
  const value = THEMES.includes(theme) ? theme : "amber";
  document.documentElement.dataset.theme = value;
  $("#sel-ui-theme").value = value;
}

$("#sel-ui-theme").addEventListener("change", (event) => {
  setTheme(event.target.value);
  void host.request("storage.set", { key: "theme", value: event.target.value }).catch(() => {});
  if (state.view === "sheet") refreshSheet();
});

$("#sel-category").addEventListener("change", (event) => {
  state.cat = event.target.value;
  applyFilter();
  if (state.filtered.length && !state.filtered.includes(state.fx)) selectEffect(state.filtered[0]);
});

$("#inp-search").addEventListener("input", (event) => {
  state.query = event.target.value;
  applyFilter();
});

for (const tab of $$(".wb-tabs .wb-tab")) tab.addEventListener("click", () => showView(tab.dataset.view));
for (const tab of $$(".code-subtabs .wb-tab")) {
  tab.addEventListener("click", () => {
    state.codeMode = tab.dataset.code;
    void refreshCode();
  });
}

$("#sel-bg").addEventListener("change", (event) => {
  state.cfg.bg = event.target.value;
  stage.setup(state.fx, false);
});

$("#sel-pal").addEventListener("change", (event) => {
  const key = event.target.value;
  state.cfg.paletteKey = key;
  if (!key) state.cfg.palette = null;
  else if (key !== "__custom" && PAL[key]) state.cfg.palette = PAL[key].map(normHex);
  renderSwatches();
  applyChange();
});

$("#stage-viewport").addEventListener("click", () => {
  setPlaying(true);
  stage.restart();
});
$("#btn-play").addEventListener("click", () => setPlaying(!state.playing));
$("#btn-replay").addEventListener("click", () => {
  setPlaying(true);
  stage.restart();
});
$("#sel-speed").value = "1";
$("#sel-speed").addEventListener("change", (event) => {
  state.speed = Number(event.target.value) || 1;
});
$("#scrub-range").addEventListener("input", (event) => {
  setPlaying(false);
  stage.seekFrame(Number(event.target.value));
});

$("#inp-seed").addEventListener("change", (event) => {
  const seed = Math.round(Number(event.target.value));
  state.cfg.seed = Number.isFinite(seed) ? seed : 1;
  event.target.value = state.cfg.seed;
  applyChange(true);
});
$("#btn-rand-seed").addEventListener("click", () => {
  state.cfg.seed = 1 + Math.floor(Math.random() * 999);
  $("#inp-seed").value = state.cfg.seed;
  applyChange(true);
});
$("#inp-fps").addEventListener("change", (event) => {
  state.cfg.fps = Math.max(1, Math.min(120, Number(event.target.value) || state.fx.meta.fps));
  event.target.value = state.cfg.fps;
  applyChange();
});
$("#inp-duration").addEventListener("change", (event) => {
  state.cfg.duration = Math.max(0.05, Math.min(60, Number(event.target.value) || state.fx.meta.duration));
  event.target.value = state.cfg.duration;
  updateDurationScale();
  applyChange();
});

function setSize(axis, raw) {
  const [w0, h0] = state.fx.meta.size;
  const cfg = state.cfg;
  const clamp = (value, fallback) => Math.max(16, Math.min(1024, Math.round(Number(value) || fallback)));
  if (axis === "w") {
    cfg.canvasW = clamp(raw, w0);
    if (cfg.lockAspect) cfg.canvasH = clamp((cfg.canvasW * h0) / w0, h0);
  } else {
    cfg.canvasH = clamp(raw, h0);
    if (cfg.lockAspect) cfg.canvasW = clamp((cfg.canvasH * w0) / h0, w0);
  }
  $("#inp-w").value = cfg.canvasW;
  $("#inp-h").value = cfg.canvasH;
  applyChange();
}
$("#inp-w").addEventListener("change", (event) => setSize("w", event.target.value));
$("#inp-h").addEventListener("change", (event) => setSize("h", event.target.value));

$("#tog-aspect").addEventListener("click", () => {
  state.cfg.lockAspect = !state.cfg.lockAspect;
  $("#tog-aspect").setAttribute("aria-pressed", String(state.cfg.lockAspect));
  if (state.cfg.lockAspect) setSize("w", state.cfg.canvasW);
});
$("#tog-scale-canvas").addEventListener("click", () => {
  state.cfg.scaleWithCanvas = !state.cfg.scaleWithCanvas;
  $("#tog-scale-canvas").setAttribute("aria-pressed", String(state.cfg.scaleWithCanvas));
  applyChange();
});
$("#tog-flip").addEventListener("click", () => {
  state.cfg.flip = !state.cfg.flip;
  $("#tog-flip").setAttribute("aria-pressed", String(state.cfg.flip));
  applyChange();
});
$("#sel-actor").addEventListener("change", (event) => {
  state.cfg.actorMode = event.target.value;
  applyChange(true);
});
$("#btn-reset").addEventListener("click", () => {
  applyConfig(defaultConfig(state.fx));
  $("#sel-preset").value = "";
  toast(t.resetDone);
});

$("#sel-sheet-zoom").addEventListener("change", (event) => {
  state.sheetZoom = event.target.value;
  applySheetZoom();
});
$("#tog-sheet-grid").addEventListener("click", () => {
  state.sheetGrid = !state.sheetGrid;
  $("#tog-sheet-grid").setAttribute("aria-pressed", String(state.sheetGrid));
  refreshSheet();
});
$("#tog-sheet-actor").addEventListener("click", () => {
  state.sheetActor = !state.sheetActor;
  $("#tog-sheet-actor").setAttribute("aria-pressed", String(state.sheetActor));
  refreshSheet();
});
$("#btn-sheet-library").addEventListener("click", () => void exportAs("sheet-png"));
$("#btn-sheet-project").addEventListener("click", () => void exportAs("sheet-both"));

$("#sel-export-fmt").addEventListener("change", updateExportButton);
$("#btn-export").addEventListener("click", () => void exportAs($("#sel-export-fmt").value));
$("#btn-prev").addEventListener("click", () => step(-1));
$("#btn-next").addEventListener("click", () => step(1));

window.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.code === "Space" && tag !== "BUTTON") {
    event.preventDefault();
    setPlaying(!state.playing);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    if (event.shiftKey) {
      setPlaying(false);
      stage.seekFrame(stage.frameIdx + delta);
    } else step(delta);
  }
});

let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.view === "live" && state.fx) stage.setup(state.fx, false);
    else if (state.view === "sheet") applySheetZoom();
  }, 100);
}).observe($("#stage-viewport").parentElement);

host.on("visibility", ({ visible }) => {
  state.visible = visible;
});

/**
 * Opens the effect a command or another page asks for, as
 * `{ effect: "fire/torch" }`, with `source: "builtin"` or `"project"` to say
 * which copy; the project's comes first.
 */
function openState(value) {
  const fx = value && typeof value === "object" ? findEffect(value.effect, value.source) : undefined;
  if (!fx) return false;
  openEffect(fx);
  return true;
}
host.on("open", ({ state: value }) => void projectReady.then(() => openState(value)));

// ---------------------------------------------------------------------------
// Start.

handleTools();
projectReady = loadProject();
void loadPresets();
const [theme, lastEffect] = await Promise.all([
  host.request("storage.get", { key: "theme" }).catch(() => undefined),
  host.request("storage.get", { key: "effect" }).catch(() => undefined),
]);
setTheme(theme);
rebuildCategories();
applyFilter();
showView("live");
updateExportButton();
// The effect shown last, saved as `source:id` (before project effects, as the id alone).
const [lastSource, lastId] = typeof lastEffect === "string" && lastEffect.includes(":") ? lastEffect.split(":") : ["builtin", lastEffect];
// The project's effects load first when the one to show may be one of them.
if (host.opened?.source !== "builtin" && (lastSource === "project" || host.opened?.effect)) await projectReady;
// An `open` heard while the panel was starting has already chosen the effect.
if (!openState(host.opened) && !state.fx)
  openEffect(findEffect(lastId, lastSource) ?? LIBRARY.find((fx) => fx.id === "water/geyser") ?? LIBRARY[0]);

let lastTick = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  if (state.view === "live" && state.visible) stage.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
