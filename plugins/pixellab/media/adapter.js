// PixelLab API v2: https://api.pixellab.ai/v2/llms.txt
// Each paid request goes through host.submit, so a retry after a restart
// checks the original job instead of paying again. Results are PixelLab's own
// files, shown as they are: a PNG for pictures and tiles, a GIF for characters,
// objects and effects. Models with animation frames return each frame for the
// app to compose.
const API = "https://api.pixellab.ai/v2";
const REFERENCE = "the character in the reference image";
const SUBJECT = "the subject in the reference image";
const DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];
const ASPECT_RATIOS = { "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "16:9": [16, 9], "9:16": [9, 16] };
/** The edge a sprite is drawn at when nothing else sets it. */
const SPRITE = 64;

/** Each model: what it sends first, and what `check` does once a job is ready. */
const MODELS = {
  // Pictures from a description.
  pixen: (input, host) => direct(host, "image", "/create-image-pixen", {
    description: input.prompt,
    image_size: { width: 512, height: 512 },
    no_background: input.transparentBackground === true,
  }),
  pixflux: (input, host) => direct(host, "image", "/create-image-pixflux", {
    description: input.prompt,
    image_size: fit(input.aspectRatio, 192),
    no_background: input.transparentBackground === true,
  }),
  bitforge: (input, host) => {
    const style = input.references?.[0];
    return direct(host, "image", "/create-image-bitforge", {
      description: input.prompt,
      image_size: fit(input.aspectRatio, 128),
      no_background: input.transparentBackground === true,
      ...(style ? { style_image: picture(style), style_strength: 50 } : {}),
    });
  },
  "image-pro": (input, host) => queued(host, "image", "/generate-image-v2", {
    description: input.prompt,
    image_size: fit(input.aspectRatio, 256),
    no_background: input.transparentBackground === true,
    ...(input.references?.length ? { reference_images: input.references.map(boxed) } : {}),
  }),
  "style-pro": (input, host) => queued(host, "image", "/generate-with-style-v2", {
    description: input.prompt,
    style_images: input.references.map(flat),
    no_background: input.transparentBackground === true,
  }),
  "image-pro-flash": (input, host) => {
    const style = input.references?.[0];
    return queued(host, "image", "/create-image-pro-flash", {
      description: input.prompt,
      image_size: { width: 128, height: 128 },
      no_background: input.transparentBackground === true,
      ...(style ? { style_image: boxed(style) } : {}),
    });
  },
  ui: (input, host) => {
    const concept = input.references?.[0];
    return queued(host, "image", "/generate-ui-v2", {
      description: input.prompt,
      image_size: fit(input.aspectRatio, 256),
      no_background: input.transparentBackground === true,
      ...(concept ? { concept_image: boxed(concept) } : {}),
    });
  },

  // Changes to one picture.
  "to-pixel-art": (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    return direct(host, "image", "/image-to-pixelart", {
      image: picture(source),
      image_size: size,
      output_size: scaled(size, 1 / 4, 16, 512),
    });
  },
  "to-pixel-art-pro-flash": (input, host) => queued(host, "image", "/image-to-pixelart-pro-flash", {
    image: picture(input.references[0]),
    ...(input.prompt ? { description: input.prompt } : {}),
  }),
  "resize-2x": (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    return direct(host, "image", "/resize", {
      description: input.prompt || SUBJECT,
      reference_image: picture(source),
      reference_image_size: size,
      target_size: scaled(size, 2, 16, 200),
      no_background: input.transparentBackground === true,
    });
  },
  "remove-background": (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    return direct(host, "image", "/remove-background", {
      image: picture(source),
      image_size: size,
      ...(input.prompt ? { text: input.prompt } : {}),
    });
  },
  "normal-map": (input, host) => queued(host, "image", "/normal-map", { image: picture(input.references[0]) }),
  edit: (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    const canvas = scaled(size, 1, 16, 400);
    return queued(host, "image", "/edit-image", {
      image: picture(source),
      image_size: size,
      description: input.prompt,
      width: canvas.width,
      height: canvas.height,
      no_background: input.transparentBackground === true,
    });
  },
  "edit-pro": (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    return queued(host, "image", "/edit-images-v2", {
      method: "edit_with_text",
      edit_images: [flat(source)],
      image_size: scaled(size, 1, 32, 512),
      description: input.prompt,
      no_background: input.transparentBackground === true,
    });
  },
  "edit-pro-flash": (input, host) => queued(host, "image", "/edit-image-pro-flash", {
    image: picture(input.references[0]),
    method: "text",
    description: input.prompt,
    no_background: input.transparentBackground === true,
  }),

  // Animation frames from a picture.
  "frame-animation": (input, host) => queued(host, "animation", "/animate-with-text-v3", {
    first_frame: { base64: dataUrl(input.references[0]) },
    action: input.prompt,
    frame_count: 8,
    no_background: input.transparentBackground === true,
  }, { phase: "frame-animation" }),
  "pixminimax-animation": (input, host) => queued(host, "animation", "/animate-pixminimax", {
    first_frame: picture(input.references[0]),
    description: input.prompt,
    frame_count: 8,
    no_background: input.transparentBackground === true,
  }, { phase: "frame-animation" }),
  "animation-pro": (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    if (size.width < 32 || size.height < 32) return { error: "Animation (Pro) needs a reference of at least 32×32" };
    return queued(host, "animation", "/animate-with-text-v2", {
      reference_image: picture(source),
      reference_image_size: size,
      image_size: size,
      action: input.prompt,
      no_background: input.transparentBackground === true,
    }, { phase: "frame-animation" });
  },
  interpolation: (input, host) => {
    const size = dimensions(input.references[0]);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    return queued(host, "animation", "/interpolation-v2", {
      start_image: boxed(input.references[0]),
      end_image: boxed(input.references[1]),
      action: input.prompt,
      image_size: scaled(size, 1, 16, 128),
      no_background: input.transparentBackground === true,
    }, { phase: "frame-animation" });
  },

  // Turning a subject.
  rotate: (input, host) => {
    const source = input.references[0];
    const size = dimensions(source);
    if (!size) return { error: "PixelLab couldn't read the reference picture's size" };
    return direct(host, "image", "/rotate", {
      from_image: picture(source),
      image_size: size,
      from_direction: "south",
      to_direction: direction(input.prompt) ?? "east",
    });
  },
  "rotations-8": (input, host) => queued(host, "image", "/generate-8-rotations-v3", {
    first_frame: picture(input.references[0]),
    ...(input.prompt ? { description: input.prompt } : {}),
    no_background: true,
  }, { phase: "frame-animation" }),
  "rotations-8-pro": (input, host) => {
    const source = input.references?.[0];
    const size = source && dimensions(source);
    if (source && !size) return { error: "PixelLab couldn't read the reference picture's size" };
    return queued(host, "image", "/generate-8-rotations-v2", {
      method: source ? "rotate_character" : "create_with_style",
      image_size: size ? scaled(size, 1, 32, 168) : { width: SPRITE, height: SPRITE },
      ...(source ? { reference_image: flat(source) } : {}),
      ...(input.prompt ? { description: input.prompt } : {}),
      no_background: true,
    }, { phase: "frame-animation" });
  },

  // Characters, shown as PixelLab's GIF turning through their directions.
  character: (input, host) => character(input, host, input.prompt, null),
  "character-4": (input, host) => directional(input, host, "/create-character-with-4-directions", {}),
  "character-8": (input, host) => directional(input, host, "/create-character-with-8-directions", { mode: "standard" }),
  "character-pro": (input, host) => {
    const style = input.references?.[0];
    return characterJob(host, "/create-character-pro", {
      description: input.prompt,
      image_size: { width: SPRITE, height: SPRITE },
      method: "create_with_style",
      no_background: true,
      ...(style ? { reference_image: picture(style) } : {}),
    });
  },
  "character-pro-flash": (input, host) => {
    const first = input.references?.[0];
    return characterJob(host, "/create-character-pro-flash", {
      description: input.prompt || REFERENCE,
      ...(first ? { first_frame: picture(first) } : { image_size: { width: SPRITE, height: SPRITE } }),
    });
  },
  "skeleton-animation": (input, host) => character(input, host, REFERENCE, { action: input.prompt }),
  "character-state": (input, host) => character(input, host, REFERENCE, { edit: input.prompt }),

  // Objects.
  object: (input, host) => {
    const style = input.references?.[0];
    return objectJob(host, "/create-object-pro-flash", {
      description: input.prompt,
      n_directions: 1,
      image_size: { width: SPRITE, height: SPRITE },
      ...(style ? { style_image: boxed(style) } : {}),
    });
  },
  "object-pro": (input, host) => objectJob(host, "/create-1-direction-object", {
    description: input.prompt,
    size: SPRITE,
  }),
  "object-8": (input, host) => {
    const source = input.references?.[0];
    return objectJob(host, "/create-8-direction-object", {
      description: input.prompt || SUBJECT,
      ...(source ? { reference_image: picture(source) } : { size: SPRITE }),
    }, { rotations: true });
  },
  "object-animation": (input, host) => objectJob(host, "/create-object-pro-flash", {
    description: SUBJECT,
    n_directions: 1,
    first_frame: picture(input.references[0]),
  }, { action: input.prompt }),

  // Maps.
  tileset: (input, host) => {
    const [lower, upper, transition] = parts(input.prompt);
    if (!lower || !upper) return { error: "Describe the tileset as lower terrain | upper terrain, such as `grass | water`" };
    return queued(host, "tileset", "/create-tileset", {
      lower_description: lower,
      upper_description: upper,
      ...(transition ? { transition_description: transition, transition_size: 0.25 } : {}),
      tile_size: { width: 32, height: 32 },
    }, { phase: "tileset", path: "tilesets", idField: "tileset_id" });
  },
  "tileset-sidescroller": (input, host) => {
    const [platform, surface] = parts(input.prompt);
    if (!platform) return { error: "Describe the platform, optionally with its surface: `stone bricks | moss`" };
    return queued(host, "tileset", "/create-tileset-sidescroller", {
      lower_description: platform,
      ...(surface ? { transition_description: surface, transition_size: 0.25 } : {}),
      tile_size: { width: 32, height: 32 },
    }, { phase: "tileset", path: "tilesets-sidescroller", idField: "tileset_id" });
  },
  "isometric-tile": (input, host) => queued(host, "tile", "/create-isometric-tile", {
    description: input.prompt,
    image_size: { width: 32, height: 32 },
  }, { phase: "tile", path: "isometric-tiles", idField: "tile_id" }),
  "tiles-pro": (input, host) => queued(host, "tile", "/create-tiles-pro", {
    description: input.prompt,
    tile_type: "square_topdown",
    tile_size: 32,
  }, { phase: "tile", path: "tiles-pro", idField: "tile_id" }),

  // Effects.
  vfx: (input, host) => {
    const sprite = input.references?.[0];
    return queued(host, "effect", "/vfx", {
      description: input.prompt,
      artist: "lite",
      ...(sprite ? { sprite: picture(sprite) } : {}),
    }, { phase: "effect" });
  },
};

/** Models that need their reference pictures, beyond what the manifest asks of the app. */
const NEEDS = { "skeleton-animation": [1, "Skeleton animation needs one character reference image"], interpolation: [2, "Interpolation needs a start and an end picture"] };

export default {
  image: {
    async start(input, host) {
      const make = Object.prototype.hasOwnProperty.call(MODELS, input.model) ? MODELS[input.model] : undefined;
      if (!make) return { error: `Unknown PixelLab model ${input.model}` };
      const [count, why] = NEEDS[input.model] ?? [0, ""];
      if ((input.references?.length ?? 0) < count) return { error: why };
      return make(input, host);
    },
    async check(task, host) {
      const job = await status(task.jobId, host);
      if (job.error || !job.done) return job.error ? job : { task, retryAfter: 3 };
      const response = job.lastResponse;
      if (task.phase === "frame-animation") {
        const outputs = pictures(response);
        return outputs.length ? { outputs } : { error: "PixelLab returned no animation frames" };
      }
      if (task.phase === "image") {
        const outputs = pictures(response);
        return outputs.length ? { outputs: outputs.slice(0, 1) } : { error: "PixelLab returned no image" };
      }
      if (task.phase === "character") {
        if (task.action) return animate(host, task.characterId, task.action);
        if (task.edit) return state(host, task.characterId, task.edit);
        return { outputs: [gif("characters", task.characterId)] };
      }
      if (task.phase === "animation") return { outputs: [gif("characters", task.characterId, task.animationGroupId, "south")] };
      if (task.phase === "object") return object(host, task);
      if (task.phase === "object-animation") return { outputs: [gif("objects", task.objectId, task.animationGroupId)] };
      if (task.phase === "tileset" || task.phase === "tile") return tiles(host, task);
      if (task.phase === "effect") {
        const url = link(response?.files, /\.gif(?:$|\?)/i);
        return url ? { outputs: [{ url }] } : { error: "PixelLab returned no effect GIF" };
      }
      return { error: `Unknown PixelLab task ${task.phase}` };
    },
  },
};

/** A request that answers with the picture. */
async function direct(host, name, path, json) {
  const response = await host.submit(name, `${API}${path}`, { method: "POST", auth: true, json });
  if (!response.ok) return { error: await detail(response) };
  const outputs = pictures(await response.json());
  return outputs.length ? { outputs: outputs.slice(0, 1) } : { error: "PixelLab returned no image" };
}

/** A request that answers with a background job; `next` says what `check` does with it. */
async function queued(host, name, path, json, next = { phase: "image" }) {
  const response = await host.submit(name, `${API}${path}`, { method: "POST", auth: true, json });
  if (!response.ok) return { error: await detail(response) };
  const job = await response.json();
  if (typeof job.background_job_id !== "string") return { error: "PixelLab returned no job" };
  const { idField, ...rest } = next;
  if (idField && typeof job[idField] !== "string") return { error: "PixelLab returned no result ID" };
  return { task: { ...rest, jobId: job.background_job_id, ...(idField ? { id: job[idField] } : {}) }, retryAfter: 3 };
}

/** Starts a character from a description or reference; an action or edit follows once it is ready. */
async function character(input, host, description, then) {
  const reference = input.references?.[0];
  return characterJob(host, "/create-character-v3", {
    description: description || REFERENCE,
    n_directions: 8,
    no_background: true,
    ...(reference ? { reference_image: picture(reference) } : {}),
  }, then ?? {});
}

/** A four- or eight-direction character: a reference is its south view, at the reference's size. */
async function directional(input, host, path, extra) {
  const reference = input.references?.[0];
  const size = reference && dimensions(reference);
  if (reference && !size) return { error: "PixelLab couldn't read the reference picture's size" };
  if (size && (Math.max(size.width, size.height) > 128 || Math.min(size.width, size.height) < 16))
    return { error: "A character reference must be 16 to 128 pixels on each side" };
  return characterJob(host, path, {
    description: input.prompt || REFERENCE,
    image_size: size ?? { width: SPRITE, height: SPRITE },
    ...extra,
    ...(reference ? { directions: { south: picture(reference) } } : {}),
  });
}

async function characterJob(host, path, json, then = {}) {
  const response = await host.submit("character", `${API}${path}`, { method: "POST", auth: true, json });
  if (!response.ok) return { error: await detail(response) };
  const created = await response.json();
  if (typeof created.character_id !== "string" || typeof created.background_job_id !== "string") return { error: "PixelLab returned no character job" };
  const follow = { ...(then.action ? { action: then.action } : {}), ...(then.edit ? { edit: then.edit } : {}) };
  return { task: { phase: "character", characterId: created.character_id, jobId: created.background_job_id, ...follow }, retryAfter: 3 };
}

async function animate(host, characterId, action) {
  const response = await host.submit("animation", `${API}/characters/animations`, {
    method: "POST",
    auth: true,
    json: { character_id: characterId, description: REFERENCE, action_description: action, mode: "skeleton-v3", directions: ["south"] },
  });
  if (!response.ok) return { error: await detail(response) };
  const animation = await response.json();
  const jobId = animation.background_job_ids?.[0];
  if (typeof jobId !== "string" || typeof animation.animation_group_id !== "string") return { error: "PixelLab returned no animation job" };
  return { task: { phase: "animation", characterId, jobId, animationGroupId: animation.animation_group_id }, retryAfter: 3 };
}

async function state(host, characterId, edit) {
  const response = await host.submit("state", `${API}/create-character-state`, {
    method: "POST",
    auth: true,
    json: { character_id: characterId, edit_description: edit },
  });
  if (!response.ok) return { error: await detail(response) };
  const created = await response.json();
  if (typeof created.character_id !== "string" || typeof created.background_job_id !== "string") return { error: "PixelLab returned no character job" };
  return { task: { phase: "character", characterId: created.character_id, jobId: created.background_job_id }, retryAfter: 3 };
}

async function objectJob(host, path, json, then = {}) {
  const response = await host.submit("object", `${API}${path}`, { method: "POST", auth: true, json });
  if (!response.ok) return { error: await detail(response) };
  const created = await response.json();
  if (typeof created.object_id !== "string" || typeof created.background_job_id !== "string") return { error: "PixelLab returned no object job" };
  return { task: { phase: "object", objectId: created.object_id, jobId: created.background_job_id, ...then }, retryAfter: 3 };
}

/** A finished object: its rotations' GIF, its picture, or the animation that follows. */
async function object(host, task) {
  if (task.rotations) return { outputs: [gif("objects", task.objectId)] };
  if (task.action) {
    const response = await host.submit("object-animation", `${API}/objects/${encodeURIComponent(task.objectId)}/animations`, {
      method: "POST",
      auth: true,
      json: { mode: "v3", animation_description: task.action, frame_count: 8 },
    });
    if (!response.ok) return { error: await detail(response) };
    const animation = await response.json();
    const jobId = animation.submissions?.map((item) => item?.background_job_id).find((id) => typeof id === "string");
    if (typeof jobId !== "string" || typeof animation.animation_group_id !== "string") return { error: "PixelLab returned no animation job" };
    return { task: { phase: "object-animation", objectId: task.objectId, jobId, animationGroupId: animation.animation_group_id }, retryAfter: 3 };
  }
  const response = await host.fetch(`${API}/objects/${encodeURIComponent(task.objectId)}`, { auth: true });
  if (!response.ok) return { error: await detail(response) };
  const found = await response.json();
  if (["queued", "processing", "pending"].includes(found.status)) return { task, retryAfter: 3 };
  // A Pro Flash object has no named rotations; its one picture is only among the stored files.
  const url = [found.rotation_urls?.south, ...(Array.isArray(found.frame_urls) ? found.frame_urls : [])].find((value) => typeof value === "string")
    ?? link(found.storage_urls, /\.png(\?|$)/);
  return url ? { outputs: [{ url }] } : { error: "PixelLab returned no object picture" };
}

/** A finished tileset's sheet, or a tile's picture. */
async function tiles(host, task) {
  const query = task.phase === "tileset" ? "?layout=tileset15" : "";
  const response = await host.fetch(`${API}/${task.path}/${encodeURIComponent(task.id)}${query}`, { auth: true });
  if (response.status === 423) return { task, retryAfter: 5 };
  if (!response.ok) return { error: await detail(response) };
  const body = await response.json();
  const sheet = body.sheet?.image ?? body.image;
  const outputs = sheet ? pictures({ image: sheet }) : [];
  if (!outputs.length) {
    const url = link(body.storage_urls, /./);
    if (url) outputs.push({ url });
  }
  return outputs.length ? { outputs } : { error: "PixelLab returned no tiles" };
}

function gif(kind, id, animationGroupId, facing) {
  const query = animationGroupId
    ? `?animation_group_id=${encodeURIComponent(animationGroupId)}${facing ? `&direction=${facing}` : ""}`
    : "";
  return { url: `${API}/${kind}/${encodeURIComponent(id)}/gif${query}`, auth: true };
}

async function status(jobId, host) {
  const response = await host.fetch(`${API}/background-jobs/${encodeURIComponent(jobId)}`, { auth: true });
  if (!response.ok) return { error: await detail(response) };
  const job = await response.json();
  if (job.status === "completed") return { done: true, lastResponse: job.last_response };
  if (job.status === "failed" || job.status === "cancelled") return { error: `PixelLab job failed: ${message(job.last_response?.detail) ?? "no reason given"}` };
  return { done: false };
}

/** The pictures in a PixelLab answer: `images`, `image` or `image_url`, as base64 or links. */
function pictures(value) {
  const items = Array.isArray(value?.images) ? value.images : value?.image ? [value.image] : [];
  const outputs = items.flatMap((item) => {
    const encoded = typeof item === "string" ? item : item?.base64 ?? item?.image?.base64;
    if (typeof encoded === "string" && !/^https:/.test(encoded)) {
      const match = encoded.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is);
      return [{ base64: match?.[2] ?? encoded, mediaType: match?.[1] ?? "image/png" }];
    }
    const url = typeof item === "string" ? item : item?.url ?? item?.image_url;
    return typeof url === "string" && /^https:/.test(url) ? [{ url }] : [];
  });
  if (!outputs.length && typeof value?.image_url === "string") outputs.push({ url: value.image_url });
  return outputs;
}

/** The first link in a map or list of PixelLab file links whose name matches. */
function link(files, pattern) {
  const values = Array.isArray(files) ? files : files && typeof files === "object" ? Object.values(files) : [];
  for (const value of values) {
    const url = typeof value === "string" ? value : value?.url;
    if (typeof url === "string" && /^https:/.test(url) && pattern.test(url)) return url;
  }
  return undefined;
}

function dataUrl(reference) {
  return `data:${reference.mediaType};base64,${reference.base64}`;
}

/** PixelLab's plain image field. */
function picture(reference) {
  return { type: "base64", base64: dataUrl(reference) };
}

/** An image with its size beside it, `{ image, size }`. */
function boxed(reference) {
  const size = dimensions(reference) ?? { width: SPRITE, height: SPRITE };
  return { image: picture(reference), size };
}

/** An image with its size inline, `{ image, width, height }`. */
function flat(reference) {
  const size = dimensions(reference) ?? { width: SPRITE, height: SPRITE };
  return { image: picture(reference), ...size };
}

/** A size whose longer side is `long`, in steps of four, for one of the declared aspect ratios. */
function fit(aspectRatio, long) {
  const [w, h] = ASPECT_RATIOS[aspectRatio] ?? [1, 1];
  const short = (side) => Math.max(16, Math.round((long * side) / Math.max(w, h) / 4) * 4);
  return { width: w >= h ? long : short(w), height: h >= w ? long : short(h) };
}

/** A size times `factor`, keeping its shape, with each side kept within `min` and `max`. */
function scaled(size, factor, min, max) {
  const fitted = Math.min(factor, max / size.width, max / size.height);
  const side = (value) => Math.min(max, Math.max(min, Math.round(value * fitted)));
  return { width: side(size.width), height: side(size.height) };
}

/** The prompt's parts, split on `|`, `->` or new lines. */
function parts(prompt) {
  return String(prompt ?? "").split(/\s*(?:\||->|→|\n)\s*/).map((part) => part.trim()).filter(Boolean);
}

/** The first compass direction named in a prompt, such as `north-east` or `west`. */
function direction(prompt) {
  const text = String(prompt ?? "").toLowerCase().replace(/[\s_]+/g, "-");
  const found = DIRECTIONS
    .map((name) => ({ name, at: text.search(new RegExp(`(^|[^a-z])${name}($|[^a-z-])`)) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at || b.name.length - a.name.length)[0];
  return found?.name;
}

/** A PNG, GIF, WebP or JPEG reference's pixel size, read from its header. */
function dimensions(reference) {
  const at = byteReader(reference?.base64 ?? "");
  const u16 = (i) => (at(i) << 8) | at(i + 1);
  const u32 = (i) => ((at(i) << 24) >>> 0) + (at(i + 1) << 16) + (at(i + 2) << 8) + at(i + 3);
  const valid = (width, height) => (width > 0 && height > 0 ? { width, height } : undefined);
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return valid(u32(16), u32(20));
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return valid(at(6) | (at(7) << 8), at(8) | (at(9) << 8));
  if (at(0) === 0x52 && at(8) === 0x57 && at(12) === 0x56) {
    const chunk = String.fromCharCode(at(12), at(13), at(14), at(15));
    if (chunk === "VP8X") return valid(1 + (at(24) | (at(25) << 8) | (at(26) << 16)), 1 + (at(27) | (at(28) << 8) | (at(29) << 16)));
    if (chunk === "VP8L") {
      const bits = at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24);
      return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8 ") return valid(u16le(at, 26) & 0x3fff, u16le(at, 28) & 0x3fff);
    return undefined;
  }
  if (at(0) === 0xff && at(1) === 0xd8) {
    for (let i = 2; i < 1 << 20 && at(i) === 0xff;) {
      const marker = at(i + 1);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return valid(u16(i + 7), u16(i + 5));
      i += 2 + u16(i + 2);
    }
  }
  return undefined;
}

function u16le(at, i) {
  return at(i) | (at(i + 1) << 8);
}

/** Reads single bytes from base64 without decoding all of it; -1 past the end. */
function byteReader(base64) {
  const text = base64.replace(/^data:[^,]*,/, "");
  const value = (char) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(char);
  return (index) => {
    const start = Math.floor(index / 3) * 4;
    if (start + 4 > text.length) return -1;
    const word = (value(text[start]) << 18) | (value(text[start + 1]) << 12) | (Math.max(0, value(text[start + 2])) << 6) | Math.max(0, value(text[start + 3]));
    return (word >> (16 - (index % 3) * 8)) & 0xff;
  };
}

async function detail(response) {
  const body = await response.json().catch(() => ({}));
  return `PixelLab ${response.status}: ${message(body.detail) ?? "request failed"}`;
}

/** PixelLab's errors are a string, or FastAPI's list of field problems. */
function message(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => item?.msg).filter((text) => typeof text === "string").join("; ") || undefined;
  return undefined;
}
