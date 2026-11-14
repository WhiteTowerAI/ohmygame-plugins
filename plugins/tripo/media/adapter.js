// Tripo owns model tasks; the host owns files, credentials and durable receipts.
const V1_ACTIONS = [
  "afraid",
  "agree",
  "angry_01",
  "angry_02",
  "angry_03",
  "basketball_shot",
  "bow",
  "box_01",
  "box_02",
  "box_03",
  "cast_a_spell",
  "cheer",
  "chop",
  "clap",
  "climb",
  "complain_01",
  "complain_02",
  "cross_body_crunch",
  "crossover_dribble",
  "cry",
  "dance_01",
  "dance_02",
  "dance_03",
  "dance_04",
  "dance_05",
  "dance_06",
  "defeat_02",
  "defeat_03",
  "depressed",
  "dig",
  "dive",
  "dribble",
  "fall",
  "fire",
  "flee_01",
  "flee_02",
  "flip",
  "fold_arms",
  "football_catch",
  "football_save",
  "football_pass",
  "freaky",
  "frightened",
  "front_kick_01",
  "front_kick_02",
  "frustrated_01",
  "frustrated_02",
  "golf",
  "greet_01",
  "greet_02",
  "greet_03",
  "greet_04",
  "heart_pose",
  "hit_to_body_01",
  "hit_to_body_02",
  "hit_to_head",
  "hit_to_side",
  "hit_to_stomach",
  "hug",
  "hurt",
  "idle",
  "jump_down",
  "jump",
  "jump_rope_01",
  "jump_rope_02",
  "laugh_01",
  "laugh_02",
  "lift_heavy",
  "look_around",
  "make_a_call_01",
  "make_a_call_02",
  "pitch_baseball",
  "play_mobile_game",
  "play_video_game",
  "press-up",
  "run_upstairs",
  "run",
  "scared_01",
  "scared_02",
  "scratch",
  "shoot",
  "shovel",
  "sing_01",
  "sing_02",
  "sing_03",
  "sing_04",
  "sit",
  "slash",
  "sob",
  "standing_relax",
  "surf",
  "swagger",
  "swim",
  "turn",
  "victory_celebration",
  "volleyball",
  "wait",
  "walk",
  "warm_up",
  "wave_goodbye_01",
  "wave_goodbye_02",
];
const BASE = "https://openapi.tripo3d.ai/v3/";
const VIEWS = ["front", "left", "back", "right"];
const RIG_MODELS = ["v1.0-20240301", "v2.5-20260210", "v3.0-20260909"];
const RIG_TYPES = [
  "biped",
  "quadruped",
  "hexapod",
  "octopod",
  "serpentine",
  "aquatic",
];

function identifier(value, kind) {
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    throw new Error(`Tripo returned no valid ${kind}`);
  return value;
}

async function read(response) {
  const body = await response.json();
  if (
    response.ok &&
    body?.code === 0 &&
    body.data &&
    typeof body.data === "object" &&
    !Array.isArray(body.data)
  )
    return body.data;
  if (response.status === 401 || body?.code === 1000 || body?.code === 1001)
    throw new Error("Tripo API key was rejected");
  if (response.status === 429 || body?.code === 2000)
    throw new Error("Tripo is temporarily rate limited");
  const message =
    typeof body?.message === "string" && body.message
      ? body.message.slice(0, 500)
      : `HTTP ${response.status}`;
  throw new Error(`Tripo: ${message}`);
}

async function upload(host, step, source) {
  if (!source?.file) throw new Error("Tripo requires a host-owned input file");
  const data = await read(
    await host.submit(step, BASE + "files", {
      method: "POST",
      auth: true,
      multipart: [{ name: "file", file: source.file }],
    }),
  );
  return identifier(data.file_token, "upload token");
}

async function submit(host, step, endpoint, json) {
  const data = await read(
    await host.submit(step, BASE + endpoint, {
      method: "POST",
      auth: true,
      json,
    }),
  );
  return identifier(data.task_id, "task ID");
}

async function query(host, id) {
  const data = await read(
    await host.fetch(
      BASE + "tasks/" + encodeURIComponent(identifier(id, "task ID")),
      { auth: true },
    ),
  );
  if (data.task_id !== id)
    throw new Error("Tripo returned a different or missing task");
  if (
    ![
      "queued",
      "running",
      "success",
      "failed",
      "cancelled",
      "canceled",
      "banned",
      "expired",
    ].includes(data.status)
  )
    throw new Error("Unknown Tripo task status");
  return data;
}

function pending(data) {
  return data.status === "queued" || data.status === "running";
}
function failure(data) {
  return {
    error:
      typeof data.error_message === "string" && data.error_message
        ? data.error_message
        : `Tripo task ${data.status}`,
  };
}
function output(data, id, axis) {
  if (typeof data.output?.model_url !== "string" || !data.output.model_url)
    throw new Error("Tripo returned no GLB URL");
  return {
    url: data.output.model_url,
    requestId: id,
    ...(axis ? { forwardAxis: axis } : {}),
  };
}

function rigOptions(options) {
  const model = options?.rigModel ?? "v1.0-20240301";
  const type = options?.rigType ?? "biped";
  if (
    !RIG_MODELS.includes(model) ||
    !RIG_TYPES.includes(type) ||
    (model === RIG_MODELS[0] && type !== "biped")
  )
    throw new Error("Unsupported Tripo rig version or type");
  return { model, type };
}

function actions(options) {
  const { model, type } = rigOptions(options);
  const legacy = model === RIG_MODELS[0];
  const names = legacy
    ? V1_ACTIONS
    : type === "biped"
      ? [
          "idle",
          "walk",
          "run",
          "dive",
          "climb",
          "jump",
          "slash",
          "shoot",
          "hurt",
          "fall",
          "turn",
        ]
      : [type === "serpentine" || type === "aquatic" ? "march" : "walk"];
  const prefix = legacy ? "biped:" : type === "biped" ? "" : `${type}:`;
  return names.map((name) => ({
    id: `preset:${prefix}${name}`,
    name: name
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    category: type,
    subCategory: model,
  }));
}

async function animateBatch(task, host) {
  const index = task.batches.length;
  const id = await submit(host, `animation-${index}`, "animations/retarget", {
    input: task.rigId,
    animations: task.actionIds.slice(index * 5, (index + 1) * 5),
    out_format: "glb",
    export_with_geometry: true,
    animate_in_place: task.animateInPlace,
  });
  return { task: { ...task, phase: "animation", id }, retryAfter: 2 };
}

export default {
  "3d": {
    async start(input, host) {
      if (input.operation === "animate") {
        const { model, type } = rigOptions(input.options);
        const available = new Set(
          actions(input.options).map((action) => action.id),
        );
        const ids = input.actionIds;
        if (
          !Array.isArray(ids) ||
          ids.length < 1 ||
          ids.length > 30 ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !available.has(id))
        )
          throw new Error(
            "Choose 1 to 30 distinct actions from the selected Tripo rig presets",
          );
        const source = await upload(host, "source-upload", input.source);
        const id = await submit(host, "rig-check", "animations/rig-check", {
          input: source,
        });
        return {
          task: {
            phase: "rig-check",
            id,
            source,
            rigModel: model,
            rigType: type,
            actionIds: ids,
            animateInPlace: input.options?.animateInPlace ?? false,
            forwardAxis: input.forwardAxis,
            batches: [],
          },
          retryAfter: 2,
        };
      }
      const refs = input.references ?? [];
      if (
        refs.some((ref) => !["image/png", "image/jpeg"].includes(ref.mediaType))
      )
        throw new Error("Tripo reference images must be PNG or JPEG");
      const prompt = input.prompt ?? "";
      const operation = input.operation;
      if (!["text", "image", "retexture", "remesh"].includes(operation))
        throw new Error("Unsupported Tripo operation");
      if (
        operation === "text" &&
        (refs.length || !prompt.trim() || prompt.length > 1024)
      )
        throw new Error(
          "Tripo text generation needs a prompt up to 1024 characters",
        );
      if (operation === "image" && (refs.length < 1 || refs.length > 4))
        throw new Error("Tripo takes 1 to 4 reference images");
      if (
        operation === "retexture" &&
        (refs.length > 1 || Boolean(refs.length) === Boolean(prompt.trim()))
      )
        throw new Error("Choose one texture image or a prompt");
      if (operation === "remesh" && (refs.length || prompt.trim()))
        throw new Error("Remesh does not take style references");
      const textureModel = input.options?.textureModel ?? "v3.5-20260815";
      const textureQuality = input.options?.textureQuality ?? "standard";
      if (
        operation === "retexture" &&
        (!["v3.5-20260815", "v3.0-20250812", "v2.5-20250123"].includes(
          textureModel,
        ) ||
          !["fast", "standard", "detailed", "extreme"].includes(
            textureQuality,
          ) ||
          (textureQuality === "fast" && textureModel !== "v3.5-20260815"))
      )
        throw new Error("Unsupported Tripo texture version or quality");
      let endpoint;
      let body;
      if (operation === "retexture" || operation === "remesh") {
        const source = await upload(host, "source-upload", input.source);
        if (operation === "remesh") {
          endpoint = "mesh/decimate";
          body = {
            input: source,
            model: "v3.0",
            face_limit: input.targetPolycount,
            quad: false,
            bake: true,
          };
        } else {
          const token = refs.length
            ? await upload(host, "texture-upload", refs[0])
            : undefined;
          endpoint = "models/texture";
          body = {
            input: source,
            model: textureModel,
            pbr: input.pbr,
            texture_prompt: token ? { image: token } : { text: prompt },
            texture_quality: textureQuality,
          };
        }
      } else {
        const tokens = [];
        for (let i = 0; i < refs.length; i++)
          tokens.push(await upload(host, `image-upload-${i}`, refs[i]));
        endpoint =
          "generation/" +
          (operation === "text"
            ? "text-to-model"
            : tokens.length === 1
              ? "image-to-model"
              : "multiview-to-model");
        body = {
          model: input.model,
          face_limit: input.targetPolycount,
          texture: input.texture,
          pbr: input.texture && input.pbr,
          ...(operation === "text"
            ? { prompt }
            : tokens.length === 1
              ? { input: tokens[0] }
              : {
                  inputs: tokens.map((token, index) => ({
                    [VIEWS[index]]: token,
                  })),
                }),
        };
      }
      const id = await submit(host, "generate", endpoint, body);
      return {
        task: {
          phase: "generation",
          id,
          ...(["text", "image"].includes(operation)
            ? { forwardAxis: "+X" }
            : {}),
        },
        retryAfter: 2,
      };
    },

    async check(task, host) {
      if (
        !["generation", "rig-check", "rig", "animation"].includes(task?.phase)
      )
        throw new Error("Invalid Tripo task state");
      const data = await query(host, task.id);
      if (pending(data)) return { retryAfter: 2 };
      if (data.status !== "success") return failure(data);
      if (task.phase === "rig-check") {
        if (
          data.output?.riggable !== true ||
          data.output.rig_type !== task.rigType
        )
          return {
            error: "The model does not match the selected Tripo rig type",
          };
        const id = await submit(host, "rig", "animations/rig", {
          input: task.source,
          model: task.rigModel,
          rig_type: task.rigType,
          spec: "tripo",
          out_format: "glb",
        });
        return { task: { ...task, phase: "rig", id }, retryAfter: 2 };
      }
      if (task.phase === "rig")
        return animateBatch({ ...task, rigId: task.id }, host);
      if (task.phase === "animation") {
        const batches = [...task.batches, task.id];
        if (batches.length * 5 < task.actionIds.length)
          return animateBatch({ ...task, batches }, host);
        const outputs = [];
        for (const id of batches) {
          const batch = id === task.id ? data : await query(host, id);
          if (pending(batch)) return { retryAfter: 2 };
          if (batch.status !== "success") return failure(batch);
          outputs.push(output(batch, id, task.forwardAxis));
        }
        return { outputs };
      }
      return { outputs: [output(data, task.id, task.forwardAxis)] };
    },

    actions(input) {
      return { actions: actions(input.options) };
    },
    async balance(_input, host) {
      const data = await read(
        await host.fetch(BASE + "account/balance", { auth: true }),
      );
      return {
        balance: data.balance,
        ...(data.frozen !== undefined ? { frozen: data.frozen } : {}),
      };
    },
    // Stop only detaches local waiting. Existing paid task IDs remain recoverable.
  },
};
