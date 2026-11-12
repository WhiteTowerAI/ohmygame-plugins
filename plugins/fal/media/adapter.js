// fal.ai's queue API for OhMyGame (docs.fal.ai: model endpoints, queue, and
// the platform API's model search).
// Runs in OhMyGame's sandbox: host.fetch reaches only the hosts in
// capabilities.network, and `auth: true` adds the key ("Key <key>"), which
// this script never sees.
//
// Every model goes through the same queue: `start` submits the request, `check`
// reads its status and, once it's done, its result, and `cancel` withdraws it.
// The queue answers with the addresses to use, so they're kept as the task.
//
// `models` lists fal.ai's models of a kind with their input schemas and turns
// each into what OhMyGame knows (aspect ratios, durations, voices and so on).
// How to build a request for it goes in the model's `data`, which OhMyGame
// gives back as `input.modelData`. A model whose schema asks for something
// this script can't fill is left out rather than listed wrong.

const QUEUE = "https://queue.fal.run/";
const MODELS = "https://api.fal.ai/v1/models";

// FLUX's named sizes for the aspect ratios it's offered with.
const IMAGE_SIZES = {
  "1:1": "square_hd", "4:3": "landscape_4_3", "3:4": "portrait_4_3", "16:9": "landscape_16_9", "9:16": "portrait_16_9",
};

// fal.ai's categories for each kind OhMyGame asks for.
const CATEGORIES = {
  image: ["text-to-image", "image-to-image"],
  video: ["text-to-video", "image-to-video"],
  audio: ["text-to-speech", "text-to-audio"],
  "3d": ["image-to-3d", "text-to-3d"],
};
// Pages read per category, 10 models each with their schemas, most used first.
const PAGES = 6;

// What OhMyGame takes, as the plugin API lists it.
const IMAGE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const VIDEO_RATIOS = ["adaptive", "21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];
const VIDEO_RESOLUTIONS = ["480p", "720p", "768p", "1080p", "1K", "2K", "4K"];
// MiniMax's system voices, which its speech models take as voice_setting.voice_id.
const MINIMAX_VOICES = ["Wise_Woman", "Friendly_Person", "Inspirational_girl", "Deep_Voice_Man", "Calm_Woman", "Casual_Guy", "Lively_Girl", "Patient_Man", "Young_Knight", "Determined_Man", "Lovely_Girl", "Decent_Boy", "Imposing_Manner", "Elegant_Man", "Abbess", "Sweet_Girl_2", "Exuberant_Girl"];

/** The answer's JSON, and its message when fal.ai refused the request. */
async function read(response) {
  const text = await response.text();
  let answer;
  try { answer = JSON.parse(text); } catch { answer = undefined; }
  const detail = answer && (answer.detail || (answer.error && answer.error.message));
  const message = (typeof detail === "string" && detail)
    // A validation error lists what was wrong with each field.
    || (Array.isArray(detail) && detail.map((item) => item && item.msg).filter(Boolean).join("; "))
    || text.slice(0, 300)
    || `fal.ai answered ${response.status}`;
  return { answer, message };
}

function dataUri(picture) {
  return `data:${picture.mediaType};base64,${picture.base64}`;
}

function onQueue(url) {
  return typeof url === "string" && url.startsWith(QUEUE);
}

/** Submits a request to a model's queue; `out` says where its file is in the result. */
async function submit(model, body, host, out) {
  const response = await host.fetch(QUEUE + model, { method: "POST", auth: true, json: body });
  const { answer, message } = await read(response);
  // A server error may come after fal.ai took the request: throwing has OhMyGame
  // treat it as possibly sent, so a retry doesn't pay again. A refusal can be tried again.
  if (response.status >= 500) throw new Error(message);
  if (!response.ok) return { error: message };
  const task = answer && { status: answer.status_url, result: answer.response_url, cancel: answer.cancel_url };
  // Taken but unreadable: thrown for the same reason as a server error.
  if (!task || !onQueue(task.status) || !onQueue(task.result)) throw new Error("fal.ai returned no request to follow");
  if (out) task.out = out;
  return { task };
}

/** Reads a request's status, then its result with `pick` once it's done. */
async function follow(task, host, retryAfter, pick) {
  const response = await host.fetch(task.status, { method: "GET", auth: true });
  const { answer, message } = await read(response);
  // A busy service is checked again (OhMyGame retries a failed check); a refusal ends the task.
  if (response.status === 429 || response.status >= 500) throw new Error(message);
  if (!response.ok) return { error: message };
  const status = answer && answer.status;
  if (status === "IN_QUEUE" || status === "IN_PROGRESS") return { retryAfter };
  if (status !== "COMPLETED") throw new Error(`fal.ai answered with status ${String(status)}`);
  if (answer.error) return { error: String(answer.error) };
  const result = await host.fetch(task.result, { method: "GET", auth: true });
  const output = await read(result);
  if (result.status === 429 || result.status >= 500) throw new Error(output.message);
  if (!result.ok) return { error: output.message };
  // fal.ai keeps the file for a while; OhMyGame downloads it at once.
  const url = output.answer && (Array.isArray(task.out) ? fileAt(output.answer, task.out) : pick(output.answer));
  return typeof url === "string" && url ? { outputs: [{ url }] } : { error: "fal.ai returned no file" };
}

async function cancel(task, host) {
  if (onQueue(task.cancel)) await host.fetch(task.cancel, { method: "PUT", auth: true });
}

/** The first of `paths` that leads to a string in the result. */
function fileAt(result, paths) {
  for (const path of paths) {
    let value = result;
    for (const step of path) value = value == null ? undefined : value[step];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

/** Sets a field, which may sit inside an object (`voice_setting.voice_id`). */
function put(body, field, value) {
  const steps = field.split(".");
  let target = body;
  for (const step of steps.slice(0, -1)) {
    if (!target[step] || typeof target[step] !== "object") target[step] = {};
    target = target[step];
  }
  target[steps[steps.length - 1]] = value;
}

// ---- Requests for a model listed from fal.ai, built from its `data` ----

function build(kind, input, d) {
  const body = JSON.parse(JSON.stringify(d.fixed || {}));
  const refs = input.references || [];
  if (d.prompt && input.prompt) put(body, d.prompt, input.prompt);
  if (d.ar && d.ar.m[input.aspectRatio]) put(body, d.ar.f, d.ar.m[input.aspectRatio]);
  if (d.res && d.res.m[input.resolution]) put(body, d.res.f, d.res.m[input.resolution]);
  if (kind === "image" && d.bg && input.transparentBackground) put(body, d.bg, "transparent");
  if (kind === "video") {
    if (d.dur) put(body, d.dur.f, d.dur.t === "string" ? String(input.duration) : input.duration);
    if (input.referenceMode === "reference" && d.refs) {
      put(body, d.refs, refs.map(dataUri));
      return body;
    }
  }
  if (kind === "audio") {
    if (d.voice && input.voiceId) put(body, d.voice, input.voiceId);
    // OhMyGame's speed runs from -50 (half as fast) to 100 (twice as fast).
    if (d.speed && input.speed) put(body, d.speed.f, Math.min(d.speed.max, Math.max(d.speed.min, 1 + input.speed / 100)));
    if (d.fmt && d.fmt.m[input.format]) put(body, d.fmt.f, d.fmt.m[input.format]);
    if (d.dur && input.durationSeconds) put(body, d.dur.f, d.dur.ms ? input.durationSeconds * 1000 : input.durationSeconds);
    if (d.inst && input.instrumental) put(body, d.inst, true);
  }
  if (kind === "3d") {
    if (d.poly && input.targetPolycount) put(body, d.poly, input.targetPolycount);
    if (d.tex) put(body, d.tex.f, d.tex.m ? d.tex.m[String(Boolean(input.texture))] : Boolean(input.texture));
    if (d.pbr) put(body, d.pbr, Boolean(input.pbr));
  }
  if (d.ref && refs.length) {
    // Pictures as the model takes them: several, or one (a first frame, then perhaps a last).
    if (d.ref.many) put(body, d.ref.f, refs.map(dataUri));
    else put(body, d.ref.f, dataUri(refs[0]));
    if (d.end && refs[1]) put(body, d.end, dataUri(refs[1]));
  }
  return body;
}

/** Starts a listed model, or says what it needs that wasn't given. */
function startListed(kind, input, host) {
  const d = input.modelData;
  if (d.ref && d.ref.need && !(input.references || []).length) {
    return { error: kind === "video" ? "This model makes a video from a first frame: add a picture." : "This model needs a picture: add one." };
  }
  return submit(input.model, build(kind, input, d), host, d.out);
}

// ---- Turning fal.ai's schemas into OhMyGame's models ----

/** Up to PAGES pages of a category's models, with their schemas. */
async function listCategory(category, host) {
  const found = [];
  let cursor;
  for (let page = 0; page < PAGES; page++) {
    const url = `${MODELS}?category=${category}&status=active&limit=10&expand=openapi-3.0${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await host.fetch(url, { method: "GET", auth: true });
    const { answer, message } = await read(response);
    if (!response.ok) {
      // Turned away partway, as when rate limited: what was read is still worth listing.
      if (found.length) break;
      throw new Error(message);
    }
    found.push(...((answer && Array.isArray(answer.models) && answer.models) || []));
    if (!answer || !answer.has_more || !answer.next_cursor) break;
    cursor = answer.next_cursor;
  }
  return found;
}

/** A model's input fields and output, with schema references resolved. */
function schemasOf(model) {
  const doc = model.openapi;
  if (!doc || !doc.paths) return undefined;
  const named = (doc.components && doc.components.schemas) || {};
  const deref = (schema, depth = 0) => {
    let value = schema;
    for (let i = 0; i < 10 && value && typeof value === "object"; i++) {
      if (typeof value.$ref === "string") value = named[value.$ref.split("/").pop()];
      else if (Array.isArray(value.allOf) && value.allOf.length === 1) value = value.allOf[0];
      else if (Array.isArray(value.anyOf) && depth < 3) {
        // `X | null` reads as X; of several, the one with choices, then a string.
        const options = value.anyOf.map((option) => deref(option, depth + 1)).filter((option) => option && option.type !== "null");
        value = options.find((option) => Array.isArray(option.enum)) || options.find((option) => option.type === "string") || options[0];
      } else break;
    }
    return value && typeof value === "object" ? value : {};
  };
  const json = (holder) => holder && holder.content && holder.content["application/json"] && holder.content["application/json"].schema;
  let input, output;
  for (const [path, item] of Object.entries(doc.paths)) {
    if (item && item.post && item.post.requestBody) input = deref(json(item.post.requestBody));
    if (item && item.get && /\/requests\/\{request_id\}$/.test(path)) output = deref(json(item.get.responses && item.get.responses["200"]));
  }
  if (!input || !input.properties || !output || !output.properties) return undefined;
  const fields = {};
  for (const [name, schema] of Object.entries(input.properties)) fields[name] = deref(schema);
  const out = {};
  for (const [name, schema] of Object.entries(output.properties)) out[name] = deref(schema);
  return { fields, required: Array.isArray(input.required) ? input.required : [], out, deref };
}

const firstOf = (fields, names) => names.find((name) => fields[name]);
const choices = (schema) => Array.isArray(schema && schema.enum) ? schema.enum : [];
const range = (schema) => schema && typeof schema.minimum === "number" && typeof schema.maximum === "number";
function text(value, max) {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Whole seconds from 1 to `cap` a duration field takes, from its choices or its range. */
function secondsOf(schema, cap, ms) {
  const scale = ms ? 1000 : 1;
  const listed = choices(schema).map((value) => Number(value) / scale).filter((value) => Number.isInteger(value) && value >= 1 && value <= cap);
  if (listed.length) return [...new Set(listed)].sort((a, b) => a - b);
  if (!range(schema)) return [];
  const low = Math.max(1, Math.ceil(schema.minimum / scale));
  const high = Math.min(cap, Math.floor(schema.maximum / scale));
  return low <= high ? Array.from({ length: high - low + 1 }, (_, index) => low + index) : [];
}

/** Whether every field the model requires is one this script fills. */
const fills = (s, known) => s.required.every((name) => known.includes(name));

/** Where the file is in the result: the paths whose first field the output has. */
function outOf(s, paths) {
  const found = paths.filter((path) => s.out[path[0]]);
  return found.length ? found : undefined;
}

function describeImage(model, s) {
  const f = s.fields;
  if (!f.prompt) return undefined;
  const d = { prompt: "prompt", fixed: {} };
  const many = firstOf(f, ["image_urls"]);
  const one = firstOf(f, ["image_url"]);
  let maxReferenceImages = 0;
  if (many) {
    d.ref = { f: many, many: true, need: s.required.includes(many) };
    maxReferenceImages = Math.min(16, Math.max(1, f[many].maxItems || 4));
  } else if (one) {
    d.ref = { f: one, many: false, need: s.required.includes(one) };
    maxReferenceImages = 1;
  }
  if (!fills(s, ["prompt", many, one].filter(Boolean))) return undefined;
  let aspectRatios = ["1:1"];
  const ratios = choices(f.aspect_ratio).filter((value) => IMAGE_RATIOS.includes(value));
  const sizes = choices(f.image_size);
  const named = Object.entries(IMAGE_SIZES).filter(([, name]) => sizes.includes(name));
  if (ratios.length) {
    aspectRatios = ratios;
    d.ar = { f: "aspect_ratio", m: Object.fromEntries(ratios.map((ratio) => [ratio, ratio])) };
  } else if (named.length) {
    aspectRatios = named.map(([ratio]) => ratio);
    d.ar = { f: "image_size", m: Object.fromEntries(named) };
  }
  let resolutions = ["1K"];
  const levels = { "0.5K": "512", "1K": "1K", "2K": "2K", "4K": "4K" };
  const offered = choices(f.resolution).filter((value) => levels[value]);
  if (offered.length) {
    resolutions = offered.map((value) => levels[value]);
    d.res = { f: "resolution", m: Object.fromEntries(offered.map((value) => [levels[value], value])) };
  }
  if (f.num_images) d.fixed.num_images = 1;
  if (choices(f.output_format).includes("png")) d.fixed.output_format = "png";
  if (choices(f.background).includes("transparent")) d.bg = "background";
  d.out = outOf(s, [["images", 0, "url"], ["image", "url"]]);
  if (!d.out) return undefined;
  return { resolutions, aspectRatios, maxReferenceImages, data: d };
}

function describeVideo(model, s, category) {
  const f = s.fields;
  if (!f.prompt) return undefined;
  const d = { prompt: "prompt", fixed: {} };
  const start = firstOf(f, ["image_url", "start_image_url", "first_frame_url", "first_image_url"]);
  const end = firstOf(f, ["end_image_url", "tail_image_url", "last_frame_url", "last_image_url"]);
  const looks = firstOf(f, ["reference_image_urls", "image_urls"]);
  let maxReferenceImages = 0;
  const referenceModes = [];
  if (start) {
    d.ref = { f: start, many: false, need: s.required.includes(start) };
    if (end) d.end = end;
    maxReferenceImages = end ? 2 : 1;
    referenceModes.push("frame");
  }
  // A model that must have a first frame can't take a look to follow instead.
  if (looks && !(d.ref && d.ref.need)) {
    d.refs = looks;
    maxReferenceImages = Math.max(maxReferenceImages, Math.min(16, Math.max(1, f[looks].maxItems || 4)));
    referenceModes.push("reference");
  }
  if (category === "image-to-video" && !referenceModes.length) return undefined;
  if (!fills(s, ["prompt", start, end, looks].filter(Boolean))) return undefined;
  let durations = [5];
  if (f.duration) {
    const seconds = secondsOf(f.duration, 30, false);
    if (seconds.length) {
      durations = seconds;
      const asText = choices(f.duration).some((value) => typeof value === "string") || f.duration.type === "string";
      d.dur = { f: "duration", t: asText ? "string" : "number" };
    }
  }
  let resolutions = ["720p"];
  const resolution = {};
  for (const value of choices(f.resolution)) {
    const ours = typeof value !== "string" ? undefined : /^\d+p$/i.test(value) ? value.toLowerCase() : /^\dk$/i.test(value) ? value.toUpperCase() : undefined;
    if (ours && VIDEO_RESOLUTIONS.includes(ours) && !resolution[ours]) resolution[ours] = value;
  }
  if (Object.keys(resolution).length) {
    resolutions = Object.keys(resolution);
    d.res = { f: "resolution", m: resolution };
  }
  let aspectRatios = ["adaptive"];
  const ratio = {};
  for (const value of choices(f.aspect_ratio)) {
    const ours = value === "auto" ? "adaptive" : value;
    if (VIDEO_RATIOS.includes(ours) && !ratio[ours]) ratio[ours] = value;
  }
  if (Object.keys(ratio).length) {
    aspectRatios = Object.keys(ratio);
    d.ar = { f: "aspect_ratio", m: ratio };
  }
  d.out = outOf(s, [["video", "url"]]);
  if (!d.out) return undefined;
  return { durations, resolutions, aspectRatios, maxReferenceImages, ...(referenceModes.length ? { referenceModes } : {}), data: d };
}

function describeAudio(model, s, category) {
  const f = s.fields;
  const name = `${model.endpoint_id} ${(model.metadata && model.metadata.display_name) || ""}`.toLowerCase();
  const voiceSetting = f.voice_setting && f.voice_setting.properties ? f.voice_setting : undefined;
  const speech = category === "text-to-speech" || Boolean(f.voice || voiceSetting);
  const said = speech ? firstOf(f, ["text", "prompt"]) : firstOf(f, ["prompt", "text"]);
  if (!said) return undefined;
  const d = { prompt: said, fixed: {} };
  const result = { kinds: [], formats: ["mp3"] };
  if (speech) {
    result.kinds = ["speech"];
    result.readsText = true;
    const limit = f[said].maxLength;
    if (Number.isInteger(limit) && limit >= 1) result.maxTextCharacters = Math.min(32000, limit);
    if (f.voice) {
      d.voice = "voice";
      const voices = choices(f.voice).filter((value) => typeof value === "string" && value && value.length <= 200).slice(0, 200);
      const fallback = typeof f.voice.default === "string" && f.voice.default ? f.voice.default : undefined;
      // The default first, as OhMyGame picks the first.
      const listed = fallback && voices.includes(fallback) ? [fallback, ...voices.filter((value) => value !== fallback)] : voices.length ? voices : fallback ? [fallback] : [];
      if (listed.length) result.voices = listed.map((id) => ({ id, name: id }));
    } else if (voiceSetting && voiceSetting.properties.voice_id) {
      d.voice = "voice_setting.voice_id";
      result.voices = MINIMAX_VOICES.map((id) => ({ id, name: id.replace(/_/g, " ") }));
    }
    const speed = voiceSetting && voiceSetting.properties.speed ? ["voice_setting.speed", s.deref(voiceSetting.properties.speed)] : f.speed ? ["speed", f.speed] : undefined;
    if (speed && range(speed[1])) d.speed = { f: speed[0], min: speed[1].minimum, max: speed[1].maximum };
  } else {
    const music = /music|lyria|song|ace-step/.test(name) || Boolean(f.lyrics || f.force_instrumental || f.music_length_ms);
    const effects = /sound|sfx|effect|foley/.test(name);
    result.kinds = music && !effects ? ["music"] : effects && !music ? ["sound-effect"] : ["sound-effect", "music"];
    const length = firstOf(f, ["duration", "seconds_total", "music_length_ms"]);
    const seconds = length ? secondsOf(f[length], 600, length === "music_length_ms") : [];
    if (seconds.length) {
      result.minDurationSeconds = seconds[0];
      result.maxDurationSeconds = seconds[seconds.length - 1];
      d.dur = { f: length, ms: length === "music_length_ms" };
    }
    if (f.force_instrumental) {
      result.instrumental = true;
      d.inst = "force_instrumental";
    }
  }
  // The file it makes, where the schema lets it be asked for; otherwise any that comes back is kept.
  const formats = choices(f.output_format);
  const setting = f.audio_setting && f.audio_setting.properties && f.audio_setting.properties.format ? s.deref(f.audio_setting.properties.format) : undefined;
  if (formats.includes("url")) d.fixed.output_format = "url";
  if (setting && choices(setting).includes("mp3")) {
    d.fixed.audio_setting = { format: "mp3" };
  } else if (formats.length) {
    const map = {};
    const mp3 = formats.includes("mp3_44100_128") ? "mp3_44100_128" : formats.find((value) => value === "mp3" || /^mp3_/.test(value));
    if (mp3) map.mp3 = mp3;
    if (formats.includes("wav")) map.wav = "wav";
    if (formats.includes("ogg_opus")) map.ogg_opus = "ogg_opus";
    if (Object.keys(map).length) {
      result.formats = Object.keys(map);
      d.fmt = { f: "output_format", m: map };
    }
  }
  if (!fills(s, [said])) return undefined;
  d.out = outOf(s, [["audio", "url"], ["audio_file", "url"], ["audios", 0, "url"]]);
  if (!d.out) return undefined;
  return { ...result, data: d };
}

function describe3D(model, s, category) {
  const f = s.fields;
  const d = { fixed: {} };
  const result = {};
  if (category === "text-to-3d") {
    if (!f.prompt || !fills(s, ["prompt"])) return undefined;
    d.prompt = "prompt";
    result.operations = ["text"];
  } else {
    const many = firstOf(f, ["image_urls"]);
    const one = firstOf(f, ["image_url", "input_image_url"]);
    if (!many && !one) return undefined;
    d.ref = one && !(many && s.required.includes(many)) ? { f: one, many: false, need: true } : { f: many, many: true, need: true };
    if (!fills(s, [d.ref.f])) return undefined;
    result.operations = ["image"];
    result.maxReferenceImages = d.ref.many ? Math.min(8, Math.max(1, f[many].maxItems || 4)) : 1;
  }
  const poly = firstOf(f, ["target_polycount", "face_count", "face_limit"]);
  if (poly && range(f[poly])) {
    const min = Math.max(100, Math.ceil(f[poly].minimum));
    const max = Math.min(2000000, Math.floor(f[poly].maximum));
    if (min <= max) {
      const wanted = typeof f[poly].default === "number" ? f[poly].default : 30000;
      const preset = Math.min(max, Math.max(min, Math.round(wanted)));
      result.polycount = { min, max, default: preset, presets: [...new Set([min, preset, max])].sort((a, b) => a - b) };
      d.poly = poly;
    }
  }
  // Without a count it takes, the canvas shows a nominal one, which isn't sent.
  if (!result.polycount) result.polycount = { min: 20000, max: 20000, default: 20000 };
  const texture = firstOf(f, ["should_texture", "texture"]);
  if (texture && f[texture].type === "boolean") {
    result.texture = true;
    d.tex = { f: texture };
  } else if (texture && choices(f[texture]).includes("no") && choices(f[texture]).includes("standard")) {
    result.texture = true;
    d.tex = { f: texture, m: { true: "standard", false: "no" } };
  }
  const pbr = firstOf(f, ["enable_pbr", "pbr"]);
  if (pbr && f[pbr].type === "boolean") {
    result.pbr = true;
    d.pbr = pbr;
  }
  d.out = outOf(s, [["model_glb", "url"], ["model_urls", "glb", "url"], ["model_mesh", "url"]]);
  if (!d.out) return undefined;
  return { ...result, data: d };
}

const DESCRIBE = { image: describeImage, video: describeVideo, audio: describeAudio, "3d": describe3D };

/** fal.ai's models of a kind, as OhMyGame lists them. */
async function listModels(kind, host) {
  const lists = await Promise.all(CATEGORIES[kind].map(async (category) => (await listCategory(category, host)).map((model) => [category, model])));
  const models = [];
  const seen = new Set();
  for (const [category, model] of lists.flat()) {
    const id = model && model.endpoint_id;
    if (typeof id !== "string" || !id || id.length > 200 || seen.has(id)) continue;
    let described;
    try {
      const schemas = schemasOf(model);
      described = schemas && DESCRIBE[kind](model, schemas, category);
    } catch {
      described = undefined;
    }
    if (!described) continue;
    seen.add(id);
    const meta = model.metadata || {};
    const description = text(meta.description, 500);
    models.push({ id, title: text(meta.display_name, 200) || id, ...(description ? { description } : {}), ...described });
  }
  return { models };
}

export default {
  image: {
    models: (host) => listModels("image", host),
    start(input, host) {
      if (input.modelData) return startListed("image", input, host);
      return submit(input.model, {
        prompt: input.prompt,
        image_size: IMAGE_SIZES[input.aspectRatio] || "square_hd",
        num_images: 1,
        output_format: "png",
      }, host);
    },
    check: (task, host) => follow(task, host, 1, (answer) => answer.images && answer.images[0] && answer.images[0].url),
    cancel,
  },

  video: {
    models: (host) => listModels("video", host),
    start(input, host) {
      if (input.modelData) return startListed("video", input, host);
      const [first, last] = input.references;
      if (!first) return { error: "Kling O3 on fal.ai makes a video from a first frame: add a picture." };
      const body = { image_url: dataUri(first), duration: String(input.duration) };
      if (input.prompt) body.prompt = input.prompt;
      if (last) body.end_image_url = dataUri(last);
      return submit(input.model, body, host);
    },
    check: (task, host) => follow(task, host, 5, (answer) => answer.video && answer.video.url),
    cancel,
  },

  audio: {
    models: (host) => listModels("audio", host),
    start(input, host) {
      if (input.modelData) return startListed("audio", input, host);
      if (input.model === "fal-ai/minimax/speech-02-hd") {
        // OhMyGame's speed runs from -50 (half as fast) to 100 (twice as fast); MiniMax's from 0.5 to 2.
        const speed = Math.min(2, Math.max(0.5, 1 + (input.speed || 0) / 100));
        return submit(input.model, {
          text: input.prompt,
          voice_setting: { voice_id: input.voiceId || "Wise_Woman", speed },
          audio_setting: { format: "mp3" },
          output_format: "url",
        }, host);
      }
      if (input.model === "fal-ai/stable-audio") {
        const body = { prompt: input.prompt };
        if (input.durationSeconds) body.seconds_total = input.durationSeconds;
        return submit(input.model, body, host);
      }
      return { error: `${input.model} isn't offered here` };
    },
    check: (task, host) => follow(task, host, 2, (answer) => (answer.audio && answer.audio.url) || (answer.audio_file && answer.audio_file.url)),
    cancel,
  },

  "3d": {
    models: (host) => listModels("3d", host),
    start(input, host) {
      if (input.modelData) return startListed("3d", input, host);
      const front = input.references && input.references[0];
      if (input.operation !== "image" || !front) return { error: "TRELLIS on fal.ai makes a 3D model from a picture: add one." };
      return submit(input.model, { image_url: dataUri(front) }, host);
    },
    check: (task, host) => follow(task, host, 5, (answer) => answer.model_mesh && answer.model_mesh.url),
    cancel,
  },
};
