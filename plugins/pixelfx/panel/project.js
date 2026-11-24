// The project's own effects: where they go, what a copied effect needs beside
// it, the template a new one starts from, and the presets file. Nothing here
// touches the page or the host, so tests run it as it is.
//
// A project keeps pixelfx's own layout under `pixelfx/`: `core/` is the
// engine, `fx/<category>/<name>.js` the effects, `fx/<category>/_lib.js` what
// a category's effects share. A copied effect keeps its imports unchanged, so
// the folder works in a game as it is.

export const ROOT = "pixelfx";
export const FX_ROOT = `${ROOT}/fx`;
export const PRESETS_PATH = `${ROOT}/presets.json`;
export const LICENSE_PATH = `${ROOT}/LICENSE-pixelfx.md`;
export const VERSION_PATH = `${ROOT}/core/VERSION`;
/** The upstream pixelfx the plugin's copy of it comes from. */
export const CORE_VERSION = "pixelfx f58c455";

const PART = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `id` names an effect, as `category/name`, both kebab-case. */
export const isEffectId = (id) => typeof id === "string" && id.split("/").length === 2 && id.split("/").every((part) => PART.test(part));

/** The project file of the effect `category/name`. */
export const effectPath = (id) => `${FX_ROOT}/${id}.js`;

/** The effect a project path holds, or undefined for anything else, such as a category's `_lib.js`. */
export function effectIdOf(path) {
  const match = /^pixelfx\/fx\/([^/]+)\/([^/]+)\.js$/.exec(path);
  const id = match ? `${match[1]}/${match[2]}` : undefined;
  return id && isEffectId(id) ? id : undefined;
}

/** A name for a copy of `id` in its category that no effect in `taken` has: its own, then `-2`, `-3` and on. */
export function freeEffectId(id, taken) {
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) if (!taken.has(`${id}-${n}`)) return `${id}-${n}`;
}

/** The relative modules a source imports or re-exports. */
export function importsOf(source) {
  const found = new Set();
  const pattern = /\b(?:from\s*|import\s*\(\s*|import\s+)(["'])(\.{1,2}\/[^"'\n]+)\1/g;
  for (const match of source.matchAll(pattern)) found.add(match[2]);
  return [...found];
}

/** `spec` imported by the module at `from` (both relative to one root), or undefined when it leaves the root. */
export function resolveImport(from, spec) {
  const parts = from.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/**
 * The files of the plugin's pixelfx copy that `source`, at `at` (as
 * `fx/fire/torch.js`), needs, with what they need in turn: a Map of path, as
 * `core/math.js`, to text. `readLib(path)` gives a file's text, or throws
 * when the plugin has no such file; an import it can't give is left to the
 * project, whose effect may import its own files.
 */
export async function dependencies(source, at, readLib) {
  const files = new Map();
  const visit = async (text, path) => {
    for (const spec of importsOf(text)) {
      const dep = resolveImport(path, spec);
      if (!dep || files.has(dep) || dep === at) continue;
      let depText;
      try {
        depText = await readLib(dep);
      } catch {
        continue;
      }
      files.set(dep, depText);
      await visit(depText, dep);
    }
  };
  await visit(source, at);
  return files;
}

/** The built-in effect a project effect was copied as, by its id or the id before a `-2`, `-3` suffix, or undefined. */
export function builtinIdOf(id, builtinIds) {
  if (builtinIds.has(id)) return id;
  const base = id.replace(/-\d+$/, "");
  return base !== id && builtinIds.has(base) ? base : undefined;
}

const point = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * What in a module's meta (with the gallery's defaults) or `act` the panel
 * can't show it with, or undefined. The check says more.
 */
export function metaProblem(meta, act) {
  if (!point(meta.size) || meta.size.some((v) => v < 1)) return "meta.size must be [w, h]";
  if (!point(meta.origin)) return "meta.origin must be [x, y]";
  if (!positive(meta.duration)) return "meta.duration must be a number above 0";
  if (!positive(meta.fps)) return "meta.fps must be a number above 0";
  if (typeof meta.loop !== "boolean") return "meta.loop must be true or false";
  if (!meta.options || typeof meta.options !== "object" || !Array.isArray(meta.tags)) return "meta.options must be an object and meta.tags a list";
  if (act !== undefined) {
    const key = (item) => Array.isArray(item) && Number.isFinite(item[0]) && item[1] && typeof item[1] === "object";
    if (!act || typeof act !== "object" || !Array.isArray(act.poses) || !act.poses.length || !act.poses.every(key))
      return "act.poses must be a list of [t, pose]";
    if (act.hits !== undefined && (!Array.isArray(act.hits) || !act.hits.every((hit) => hit && Number.isFinite(hit.t))))
      return "act.hits must be a list of { t }";
  }
  return undefined;
}

/** The relative imports of the project effect `id`'s `source` that no file among the project's `paths` answers. */
export function missingImports(source, id, paths) {
  const at = effectPath(id);
  return importsOf(source).filter((spec) => {
    const dep = resolveImport(at, spec);
    return !dep || !paths.has(dep);
  });
}

/** The notice a project's copy of pixelfx keeps, with the plugin's `lib/LICENSE` as `license`. */
export function licenseNotice(license) {
  return [
    "# pixelfx",
    "",
    `\`core/\`, \`sfx-core/\` and the effects in \`fx/\` copied from the Pixel Effects plugin are from pixelfx (${CORE_VERSION}, https://github.com/patch-gg/pixelfx), under the MIT license below. Effects written in this project are its own.`,
    "",
    "`core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License. `core/act.js` adapts how Hollow Crown plays its skills (https://github.com/rehan-remade/hollow-crown), Copyright (c) 2026 rehan-remade, MIT License.",
    "",
    "```text",
    license.trim(),
    "```",
    "",
  ].join("\n");
}

/**
 * What to write so the effect `source` works at `pixelfx/fx/<id>.js`: the
 * effect itself, then each file it needs that the project lacks, the license
 * and, with the core, its version. `existing` holds the project's paths; a
 * file it has is kept as it is, whatever it holds, so nothing the person
 * changed or that can't be read is replaced. Returns `{ writes, kept }`, each
 * write `{ path, text }`.
 */
export async function planEffect({ id, source, readLib, existing, license }) {
  if (!isEffectId(id)) throw new Error(`An effect is category/name in kebab-case, not ${JSON.stringify(id)}`);
  const at = `fx/${id}.js`;
  const deps = await dependencies(source, at, readLib);
  const writes = [{ path: effectPath(id), text: source }];
  const kept = [];
  for (const [path, text] of deps) {
    const target = `${ROOT}/${path}`;
    if (existing.has(target)) kept.push(target);
    else writes.push({ path: target, text });
  }
  if ([...deps.keys()].some((path) => path.startsWith("core/")) && !existing.has(VERSION_PATH)) writes.push({ path: VERSION_PATH, text: `${CORE_VERSION}\n` });
  if (license && !existing.has(LICENSE_PATH)) writes.push({ path: LICENSE_PATH, text: license });
  return { writes, kept };
}

const title = (name) => name.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** A new effect's code, from pixelfx's tools/new.mjs: a loop or a one-shot that already draws something. */
export function effectTemplate(id, loop = false) {
  if (!isEffectId(id)) throw new Error(`An effect is category/name in kebab-case, not ${JSON.stringify(id)}`);
  const [cat, name] = id.split("/");
  const body = loop
    ? `  // a loop: everything is a function of the phase, so t = 0 and t = duration match
  const C = ramp(o.palette), ph = t / meta.duration;
  cycle(t, meta.duration, 12, o.seed, 0.8, (age, life, r) => {
    const k = age / life, a = r.range(0, TAU) + ph * TAU, rad = 6 + k * 12;
    p.px(Math.cos(a) * rad, Math.sin(a) * rad - 8, at(C.slice(2), 1 - k));
  });
  p.circle(0, -8, 4 + Math.sin(ph * TAU) * 1.5, C[5]);
  p.glow(0, -8, 20, C[4], 0.35);`
    : `  // a one-shot: a hero frame, then everything falls away and is gone by t = duration
  const C = ramp(o.palette);
  if (t < 0.06) p.circle(0, -8, 6, WHITE);
  burst(14, o.seed, (r) => {
    const a = r.range(0, TAU), sp = r.range(40, 90), life = r.range(0.3, 0.6);
    if (t > life) return;
    const [x, y] = fly(0, -8, Math.cos(a) * sp, Math.sin(a) * sp, t, 120, 2);
    p.px(x, y, at(C.slice(2), 1 - t / life));
    p.light(x, y, C[4], 0.5 * (1 - t / life));
  });
  p.glow(0, -8, 24, C[4], 0.5 * (1 - seg(t, 0, 0.4)));`;
  return `import { PAL, ramp, at, ${loop ? "cycle" : "burst, fly, seg, WHITE"}, TAU } from "../../core/index.js";

export const meta = {
  name: "${title(name)}",
  desc: "One line: what it is, how it moves.",
  tags: ["${cat}"],
  size: [48, 48],
  origin: [24, 32],
  duration: ${loop ? 1.2 : 0.7},
  loop: ${loop},
  fps: 30,
  bg: "dark",
  options: { palette: PAL.arcane, seed: 1 },
};

export function draw(p, t, o) {
${body}
}
`;
}

// ---------------------------------------------------------------------------
// Settings: what the inspector, presets and the agent's tools say about how an
// effect is shown, in one shape.

const HEX = /^#[0-9a-f]{6}$/i;
const ACTOR_MODES = ["full", "body", "target", "hide"];
export const BACKGROUNDS = ["topstone", "dark", "ground", "sky", "light", "black", "checker"];

/** The settings of an inspector config that differ from the effect's own. */
export function settingsOf(cfg, fx) {
  const base = fx.meta;
  const out = {};
  if (cfg.seed !== (base.options?.seed ?? 1)) out.seed = cfg.seed;
  out.bg = cfg.bg;
  if (cfg.palette) out.palette = [...cfg.palette];
  if (cfg.fps !== base.fps) out.fps = cfg.fps;
  if (cfg.duration !== base.duration) out.duration = cfg.duration;
  if (cfg.canvasW !== base.size[0] || cfg.canvasH !== base.size[1]) out.size = [cfg.canvasW, cfg.canvasH];
  if (cfg.flip) out.flip = true;
  if (cfg.actorMode !== "full" && (fx.mod.act || base.actor)) out.actor = cfg.actorMode;
  if (Object.keys(cfg.extraOpts).length) out.options = structuredClone(cfg.extraOpts);
  return out;
}

/**
 * `cfg` with `settings` on top, each one checked; one that doesn't fit, such
 * as an option the effect doesn't have, is named in the returned `ignored`.
 */
export function applySettings(cfg, settings, fx, backgrounds = BACKGROUNDS) {
  const next = { ...cfg, extraOpts: { ...cfg.extraOpts } };
  const ignored = [];
  const num = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (key === "seed" && Number.isInteger(value)) next.seed = value;
    else if (key === "bg" && backgrounds.includes(value)) next.bg = value;
    else if (key === "palette" && value === null) Object.assign(next, { palette: null, paletteKey: "" });
    else if (key === "palette" && Array.isArray(value) && value.length >= 2 && value.length <= 16 && value.every((c) => HEX.test(c)))
      Object.assign(next, { palette: value.map((c) => c.toLowerCase()), paletteKey: "__custom" });
    else if (key === "fps" && num(value, 1, 120)) next.fps = value;
    else if (key === "duration" && num(value, 0.05, 60)) next.duration = value;
    else if (key === "size" && Array.isArray(value) && value.length === 2 && value.every((v) => Number.isInteger(v) && v >= 16 && v <= 1024)) {
      [next.canvasW, next.canvasH] = value;
      next.lockAspect = value[0] * fx.meta.size[1] === value[1] * fx.meta.size[0];
    } else if (key === "flip" && typeof value === "boolean") next.flip = value;
    else if (key === "actor" && ACTOR_MODES.includes(value)) next.actorMode = value;
    else if (key === "options" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [name, option] of Object.entries(value)) {
        const own = fx.meta.options?.[name];
        if (own === undefined || name === "seed" || name === "palette" || typeof option !== typeof own || Array.isArray(option) !== Array.isArray(own)) ignored.push(`options.${name}`);
        else next.extraOpts[name] = option;
      }
    } else ignored.push(key);
  }
  return { cfg: next, ignored };
}

// ---------------------------------------------------------------------------
// Presets: named settings for an effect, kept in `pixelfx/presets.json`.

/** The presets in the file's text; throws when it isn't a presets file, so it is never written over. */
export function parsePresets(text) {
  const doc = JSON.parse(text);
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.presets)) throw new Error(`${PRESETS_PATH} has no "presets" list`);
  return doc;
}

const validPreset = (preset) =>
  preset && typeof preset === "object" && typeof preset.name === "string" && typeof preset.effect === "string" && (preset.source === "builtin" || preset.source === "project");

/** The presets of one effect, as `{ effect, source }` names it. */
export const presetsFor = (doc, effect, source) => doc.presets.filter((preset) => validPreset(preset) && preset.effect === effect && preset.source === source);

/** The presets file with `preset` added, in place of the effect's preset of the same name. The rest stays as it was. */
export function withPreset(doc, preset) {
  const name = preset.name.trim();
  if (!name || name.length > 60) throw new Error("A preset's name is 1 to 60 characters");
  const same = (other) => validPreset(other) && other.effect === preset.effect && other.source === preset.source && other.name === name;
  const presets = doc.presets.filter((other) => !same(other));
  return { ...doc, version: doc.version ?? 1, presets: [...presets, { ...preset, name }] };
}

/** The presets file with the project effect `from`'s presets moved to `to`, or the same object when it has none. */
export function renamePresets(doc, from, to) {
  const moves = (preset) => validPreset(preset) && preset.source === "project" && preset.effect === from;
  if (!doc.presets.some(moves)) return doc;
  return { ...doc, presets: doc.presets.map((preset) => (moves(preset) ? { ...preset, effect: to } : preset)) };
}

/** The presets file's text. */
export const presetsText = (doc) => `${JSON.stringify(doc, null, 2)}\n`;
