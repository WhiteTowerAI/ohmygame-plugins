// The host owns credentials, input bytes, paid-step receipts and shared rigs.
const BASE = "https://api.meshy.ai/openapi/";
const ENDPOINTS = [
  "text-to-3d",
  "image-to-3d",
  "multi-image-to-3d",
  "remesh",
  "retexture",
  "rigging",
  "animations",
];

function endpoint(name) {
  if (!ENDPOINTS.includes(name)) throw new Error("Invalid Meshy endpoint");
  return BASE + (name === "text-to-3d" ? "v2/" : "v1/") + name;
}

function taskId(value) {
  // IDs are opaque; encode them only when constructing a path.
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    throw new Error("Meshy returned no valid task ID");
  return value;
}

async function read(response) {
  if (!response.ok) throw new Error(`Meshy answered HTTP ${response.status}`);
  return response.json();
}

async function submit(host, step, name, json) {
  const answer = await read(
    await host.submit(step, endpoint(name), {
      method: "POST",
      auth: true,
      json,
    }),
  );
  return taskId(answer?.result ?? answer?.id);
}

async function query(host, name, id) {
  const answer = await read(
    await host.fetch(endpoint(name) + "/" + encodeURIComponent(taskId(id)), {
      auth: true,
    }),
  );
  if (answer?.id !== id)
    throw new Error("Meshy returned a different or missing task");
  if (
    ![
      "PENDING",
      "IN_PROGRESS",
      "SUCCEEDED",
      "COMPLETED",
      "FAILED",
      "CANCELED",
      "CANCELLED",
    ].includes(answer.status)
  )
    throw new Error("Unknown Meshy task status");
  return answer;
}

function failed(answer) {
  return ["FAILED", "CANCELED", "CANCELLED"].includes(answer.status);
}

function pending(answer) {
  return ["PENDING", "IN_PROGRESS"].includes(answer.status);
}

function file(source, model = false) {
  if (!source?.file) throw new Error("Meshy requires a host-owned input file");
  return {
    $mediaFile: source.file,
    ...(model ? { mediaType: "application/octet-stream" } : {}),
  };
}

function output(url, id, forwardAxis) {
  if (typeof url !== "string" || !url)
    throw new Error("Meshy returned no GLB URL");
  // The host checks the download grant and GLB, and never sends API credentials.
  return { url, requestId: id, ...(forwardAxis ? { forwardAxis } : {}) };
}

async function animationBatch(task, host) {
  const index = task.batches.length;
  const id = await submit(host, `animation-${index}`, "animations", {
    rig_task_id: task.rigId,
    action_ids: task.actionIds.slice(index * 10, (index + 1) * 10),
  });
  return { task: { ...task, phase: "animation", id }, retryAfter: 2 };
}

export default {
  "3d": {
    async start(input, host) {
      const refs = input.references ?? [];
      const prompt = input.prompt ?? "";
      let name;
      let body;
      let forwardAxis;
      if (input.operation === "animate") {
        const ids = input.actionIds;
        if (
          !Array.isArray(ids) ||
          ids.length < 1 ||
          ids.length > 30 ||
          ids.some((id) => !Number.isSafeInteger(id) || id < 0) ||
          new Set(ids).size !== ids.length
        )
          throw new Error(
            "Choose 1 to 30 distinct numeric Meshy library actions",
          );
        const rig = await host.reuse("rig");
        return {
          task: {
            phase: "rig",
            rigId: taskId(rig.taskId),
            actionIds: ids,
            batches: [],
          },
          retryAfter: 2,
        };
      }
      if (input.operation === "remesh") {
        name = "remesh";
        body = {
          model_url: file(input.source, true),
          target_polycount: input.targetPolycount,
          topology: "triangle",
          target_formats: ["glb"],
        };
      } else if (input.operation === "retexture") {
        if (refs.length > 1 || Boolean(refs.length) === Boolean(prompt.trim()))
          throw new Error("Choose one style image or enter a texture prompt");
        const model = input.options?.textureModel ?? "latest";
        if (!["latest", "meshy-7", "meshy-6", "meshy-6-lite"].includes(model))
          throw new Error("Unknown Meshy texture model");
        name = "retexture";
        body = {
          model_url: file(input.source, true),
          ai_model: model,
          enable_pbr: input.pbr,
          ...(refs.length
            ? { image_style_url: file(refs[0]) }
            : { text_style_prompt: prompt }),
        };
      } else {
        const settings = input.modelSettings;
        if (
          !settings ||
          !["standard", "smart-topology"].includes(settings.modelType)
        )
          throw new Error("Configure the Meshy model type");
        forwardAxis = "+Z";
        const common = {
          ai_model: input.model,
          target_polycount: input.targetPolycount,
          ...(input.options?.pose ? { pose_mode: input.options.pose } : {}),
        };
        if (input.operation === "text") {
          if (refs.length || !prompt.trim() || prompt.length > 800)
            throw new Error(
              "Meshy text generation needs a prompt up to 800 characters",
            );
          name = "text-to-3d";
          body = {
            ...common,
            mode: "preview",
            prompt,
            model_type: settings.modelType,
            topology: "triangle",
            ...(settings.modelType === "standard"
              ? { should_remesh: true }
              : {}),
          };
        } else if (input.operation === "image") {
          name = settings.imageOperation;
          if (
            !["image-to-3d", "multi-image-to-3d"].includes(name) ||
            !refs.length ||
            refs.length > 4 ||
            (name === "image-to-3d" && refs.length !== 1) ||
            (settings.modelType === "smart-topology" && name !== "image-to-3d")
          )
            throw new Error(
              "Invalid Meshy reference images or image operation",
            );
          body = {
            ...common,
            ...(name === "image-to-3d"
              ? { image_url: file(refs[0]) }
              : { image_urls: refs.map((ref) => file(ref)) }),
            should_texture: input.texture,
            enable_pbr: input.texture && input.pbr,
            ...(settings.modelType === "smart-topology"
              ? { model_type: "smart-topology" }
              : { should_remesh: true, topology: "triangle" }),
          };
        } else throw new Error("Unsupported Meshy operation");
      }
      const id = await submit(host, "generate", name, body);
      return {
        task: {
          phase: "generation",
          name,
          id,
          refine: input.operation === "text" && input.texture,
          pbr: input.pbr,
          forwardAxis,
        },
        retryAfter: 2,
      };
    },

    async check(task, host) {
      if (task?.phase === "rig") {
        const answer = await query(host, "rigging", task.rigId);
        if (pending(answer)) return { retryAfter: 2 };
        if (failed(answer))
          return { error: "Meshy rigging failed or was canceled" };
        return animationBatch(task, host);
      }
      if (!["generation", "animation"].includes(task?.phase))
        throw new Error("Invalid Meshy task state");
      const answer = await query(
        host,
        task.phase === "animation" ? "animations" : task.name,
        task.id,
      );
      if (pending(answer)) return { retryAfter: 2 };
      if (failed(answer))
        return {
          error:
            typeof answer.task_error?.message === "string"
              ? answer.task_error.message
              : `Meshy task ${answer.status.toLowerCase()}`,
        };
      if (task.phase === "animation") {
        const batches = [...task.batches, task.id];
        if (batches.length * 10 < task.actionIds.length)
          return animationBatch({ ...task, batches }, host);
        // Persist task IDs, not signed URLs. A retry must refresh earlier
        // batches too, after a restart or an expired/failed download.
        const outputs = [];
        for (const id of batches) {
          const batch =
            id === task.id ? answer : await query(host, "animations", id);
          if (pending(batch)) return { retryAfter: 2 };
          if (failed(batch))
            return { error: "Meshy animation failed or was canceled" };
          outputs.push(output(batch.result?.animation_glb_url, id, "+Z"));
        }
        return { outputs };
      }
      if (task.refine) {
        const id = await submit(host, "refine", "text-to-3d", {
          mode: "refine",
          preview_task_id: task.id,
          enable_pbr: task.pbr,
        });
        return { task: { ...task, id, refine: false }, retryAfter: 2 };
      }
      return {
        outputs: [output(answer.model_urls?.glb, task.id, task.forwardAxis)],
      };
    },

    async reuse(id, input, previous, host) {
      if (id !== "rig") throw new Error("Unknown Meshy shared prerequisite");
      if (previous === null) {
        const taskId = await submit(host, "rig", "rigging", {
          model_url: file(input.source, true),
          ...(input.heightMeters !== undefined
            ? { height_meters: input.heightMeters }
            : {}),
        });
        return { value: { taskId } };
      }
      const answer = await query(host, "rigging", previous.taskId);
      if (failed(answer)) return { valid: false };
      if (pending(answer)) return { valid: true };
      if (!Number.isFinite(answer.expires_at) || answer.expires_at <= 0)
        throw new Error("Meshy returned no valid rig expiry");
      return { valid: answer.expires_at > Date.now() + 60 * 60_000 };
    },

    async actions(_input, host) {
      const items = await read(
        await host.fetch(endpoint("animations") + "/library", { auth: true }),
      );
      if (!Array.isArray(items))
        throw new Error("Meshy returned no animation library");
      return {
        actions: items.map((item) => ({
          id: item.action_id,
          name: item.name,
          ...(item.category ? { category: item.category } : {}),
          ...(item.sub_category ? { subCategory: item.sub_category } : {}),
          ...(item.preview_url ? { previewUrl: item.preview_url } : {}),
        })),
      };
    },

    async balance(_input, host) {
      const answer = await read(
        await host.fetch(BASE + "v1/balance", { auth: true }),
      );
      return {
        balance: answer?.balance,
        ...(answer?.frozen !== undefined ? { frozen: answer.frozen } : {}),
      };
    },
    // Stop detaches local polling. DELETE would erase paid task records.
  },
};
