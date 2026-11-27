// An effect's sound: the project's script that makes its variants, the WAV
// files rendered from it and the list of them, and sounds a model made. Like
// project.js, nothing here touches the page or the host, so tests run it.
//
// For the effect `category/name` a project has:
//   pixelfx/sfx/<category>/<name>.js           the script, which exports `variants`
//   pixelfx/sfx/<category>/<name>/<variant>.wav each variant it renders
//   pixelfx/sfx/<category>/<name>/sfx.json     the variants, script-made and model-made
//   pixelfx/sfx-core/index.js                  the sound engine scripts import

import { encodeWav, finish, RATE, waveformBars, windowRms } from "./sfx-core.js";
import { ROOT } from "./project.js";

export const SFX_ROOT = `${ROOT}/sfx`;
export const SFX_CORE_PATH = `${ROOT}/sfx-core/index.js`;
export const SFX_CORE_VERSION_PATH = `${ROOT}/sfx-core/VERSION`;
export const MANIFEST = "sfx.json";

/** Most variants one script makes, and the longest one, in seconds. */
export const SFX_LIMITS = { variants: 8, seconds: 12 };

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Model-made variants are `model-1`, `model-2` and on, which a script can't name its own. */
const MODEL_KEY = /^model-\d+$/;
/** A variant's file, beside the list: a name, never a path. */
const FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]{2,4}$/;

export const sfxScriptPath = (id) => `${SFX_ROOT}/${id}.js`;
export const sfxDir = (id) => `${SFX_ROOT}/${id}`;
export const manifestPath = (id) => `${sfxDir(id)}/${MANIFEST}`;

/** The sound of `id` among the project's file `paths`: its script and its folder, each when the project has it. */
export function soundPaths(id, paths) {
  const list = [...paths];
  return [
    ...(paths.has(sfxScriptPath(id)) ? [sfxScriptPath(id)] : []),
    ...(list.some((path) => path.startsWith(`${sfxDir(id)}/`)) ? [sfxDir(id)] : []),
  ];
}

/** What to move so the sound of `from` follows it to `to`, as `[from, to]`: each part `to` doesn't already have, since a move never replaces. */
export function soundMoves(from, to, paths) {
  const taken = new Set(soundPaths(to, paths));
  return soundPaths(from, paths)
    .map((path) => [path, path === sfxScriptPath(from) ? sfxScriptPath(to) : sfxDir(to)])
    .filter(([, target]) => !taken.has(target));
}

/** The effect whose script `path` is, or undefined. */
export function sfxIdOf(path) {
  const match = /^pixelfx\/sfx\/([^/]+)\/([^/]+)\.js$/.exec(path);
  return match && KEY.test(match[1]) && KEY.test(match[2]) ? `${match[1]}/${match[2]}` : undefined;
}

/** A new sound script for `id`, which renders one quiet tick, so the person has something to change. */
export function sfxTemplate(id) {
  return `import { RATE, sfxRng, band, edgeFade, fit, place, pixelTick, resonate } from "../../sfx-core/index.js";

// The sound of ${id}: each variant is a take the panel renders to a WAV file.
function hit(seed, pitch) {
  const R = sfxRng(seed);
  const out = new Float64Array(Math.round(0.5 * RATE));
  place(out, band(R.noise(0.12 * RATE), 300, 5000), 0, 0.6);
  place(out, resonate(R.noise(0.3 * RATE, 0.4), [[pitch, 8, 1]], 0.12), 0, 0.8);
  place(out, pixelTick(0.03, pitch * 2), 0, 0.5);
  return fit(edgeFade(out), 0.5);
}

export const variants = {
  default: { label: "Default", desc: "A short hit.", samples: () => hit(1, 220), cues: [{ t: 0, kind: "hit" }] },
  bright: { label: "Bright", desc: "Higher and lighter.", samples: () => hit(2, 440), texture: 0.1, cues: [{ t: 0, kind: "hit" }] },
};
`;
}

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** A script module's `variants`, checked, as `[key, spec]`; throws saying what's wrong. */
export function scriptVariants(mod) {
  const variants = mod?.variants;
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) throw new Error("The script must export variants, an object of { label, desc, samples, targetDb?, texture?, cues? } by key");
  const entries = Object.entries(variants);
  if (!entries.length) throw new Error("variants is empty");
  if (entries.length > SFX_LIMITS.variants) throw new Error(`A script makes at most ${SFX_LIMITS.variants} variants`);
  for (const [key, spec] of entries) {
    if (!KEY.test(key) || key.length > 40) throw new Error(`Variant key ${JSON.stringify(key)} must be kebab-case, at most 40 characters`);
    if (MODEL_KEY.test(key)) throw new Error(`Variant key ${key} is kept for sounds a model makes`);
    if (!spec || typeof spec !== "object") throw new Error(`variants.${key} must be an object`);
    if (spec.samples === undefined) throw new Error(`variants.${key} has no samples`);
    for (const field of ["targetDb", "texture"])
      if (spec[field] !== undefined && !Number.isFinite(spec[field])) throw new Error(`variants.${key}.${field} must be a number`);
  }
  return entries;
}

/** A variant's cues, each `{ t, kind }` within its length. */
function cuesOf(spec, duration) {
  if (!Array.isArray(spec.cues)) return [];
  return spec.cues
    .filter((cue) => cue && Number.isFinite(cue.t) && cue.t >= 0 && cue.t <= duration + 0.001)
    .slice(0, 32)
    .map((cue) => ({ t: Math.round(cue.t * 1000) / 1000, kind: text(cue.kind, 20) || "cue" }));
}

const round1 = (value) => Math.round(value * 10) / 10;
const db = (value) => round1(20 * Math.log10(Math.max(value, 1e-6)));

/** A finished variant's figures and the bars of its waveform. */
export function measure(pcm, rate = RATE) {
  let peak = 1e-6;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return { duration: Math.round((pcm.length / rate) * 1000) / 1000, rate, peakDb: db(peak), rmsDb: db(windowRms(pcm)), bars: waveformBars(pcm, 56) };
}

/**
 * Renders one variant: its samples, from a function or as they are, finished
 * and encoded. Returns the manifest entry, without its file, and the WAV.
 */
export async function renderVariant(key, spec) {
  let raw = typeof spec.samples === "function" ? await spec.samples() : await spec.samples;
  if (!raw || typeof raw.length !== "number") throw new Error(`variants.${key}.samples must give an array of samples`);
  if (!raw.length) throw new Error(`variants.${key} is silent: its samples are empty`);
  if (raw.length > SFX_LIMITS.seconds * RATE) throw new Error(`variants.${key} is longer than ${SFX_LIMITS.seconds} seconds`);
  raw = Float64Array.from(raw, (value) => (Number.isFinite(value) ? value : 0));
  const targetDb = Number(spec.targetDb ?? -16.5);
  const texture = Number(spec.texture ?? 0.15);
  const pcm = finish(raw, targetDb, texture);
  const figures = measure(pcm);
  const entry = { id: key, label: text(spec.label, 60) || key, desc: text(spec.desc, 300), source: "script", ...figures, targetDb, texture, cues: cuesOf(spec, figures.duration) };
  return { entry, wav: encodeWav(pcm) };
}

/** Reads a manifest, or throws when the text isn't one, which is then never written over. */
export function parseManifest(value) {
  const doc = JSON.parse(value);
  if (!doc || doc.version !== 1 || !Array.isArray(doc.variants) || !doc.variants.every((item) => item && typeof item.id === "string" && FILE.test(item.file)))
    throw new Error("Not a pixelfx sound list");
  return doc;
}

export const manifestText = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

/**
 * The manifest after the script rendered `entries`: the script's variants,
 * then the model-made ones the old manifest had. `stale` are the files of
 * script variants the script no longer makes, for deleting.
 */
export function withScriptVariants(prev, id, entries) {
  const kept = (prev?.variants ?? []).filter((item) => item.source === "model");
  const files = new Set(entries.map((entry) => entry.file));
  const stale = (prev?.variants ?? []).filter((item) => item.source !== "model" && !files.has(item.file)).map((item) => item.file);
  return { doc: { version: 1, effect: id, variants: [...entries, ...kept] }, stale };
}

/** The first `model-<n>` no variant of `doc` uses. */
export function nextModelKey(doc) {
  const taken = new Set((doc?.variants ?? []).map((item) => item.id));
  for (let n = 1; ; n++) if (!taken.has(`model-${n}`)) return `model-${n}`;
}

/** The manifest with a model-made variant added. */
export function withModelVariant(prev, id, entry) {
  return { version: 1, effect: id, variants: [...(prev?.variants ?? []), { ...entry, source: "model" }] };
}

/** A file extension for an audio type a model gave. */
export function audioExtension(type, name = "") {
  const fromName = /\.([a-z0-9]{2,4})$/i.exec(name)?.[1]?.toLowerCase();
  const known = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "audio/aac": "aac", "audio/mp4": "m4a", "audio/flac": "flac" };
  return known[String(type).split(";")[0].trim().toLowerCase()] ?? (fromName && ["mp3", "wav", "ogg", "webm", "aac", "m4a", "flac"].includes(fromName) ? fromName : "mp3");
}

/** The audio type of a variant file, for playing and adding it to the project's assets. */
export function audioType(file) {
  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase();
  return { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm", aac: "audio/aac", m4a: "audio/mp4", flac: "audio/flac" }[ext] ?? "application/octet-stream";
}

/**
 * What to ask an audio model for, from the effect as shown: a short game
 * sound effect of its length that follows its hits. English, as models read
 * it best; the person edits it before anything is made.
 */
export function soundPrompt({ name, desc, tags = [], duration, loop, hits = [] }) {
  const seconds = Math.round(duration * 100) / 100;
  const parts = [
    `A retro pixel-art game sound effect for "${name}"${desc ? `: ${desc.replace(/\.$/, "")}` : ""}.`,
    tags.length ? `Feel: ${tags.slice(0, 6).join(", ")}.` : null,
    loop ? `A seamless loop of ${seconds} seconds.` : `About ${seconds} seconds, starting at once with no silence before it.`,
    hits.length ? `Impacts at ${hits.slice(0, 6).map((t) => `${Math.round(t * 100) / 100}s`).join(", ")}.` : null,
    "No music, no voice.",
  ];
  return parts.filter(Boolean).join(" ");
}

/** The length to ask a model for, within what it makes. */
export function modelDuration(seconds, model) {
  const min = Number(model?.minDurationSeconds) || 0.5;
  const max = Number(model?.maxDurationSeconds) || 22;
  return Math.round(Math.max(min, Math.min(max, seconds)) * 10) / 10;
}
