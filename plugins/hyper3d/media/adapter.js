// The host owns files, credentials and the durable paid submission receipt.
const BASE = "https://api.hyper3d.com/api/v2/";
const STATES = ["Waiting", "Generating", "Done", "Failed"];

function identifier(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096)
    throw new Error(`Hyper3D returned no valid ${name}`);
  return value;
}

function retryMs(response) {
  const value = response.headers["retry-after"];
  const ms = value
    ? /^\d+$/.test(value)
      ? Number(value) * 1000
      : Date.parse(value) - Date.now()
    : 5000;
  return Number.isFinite(ms) ? Math.max(5000, Math.min(300000, ms)) : 5000;
}

async function read(response, canWait = false) {
  const body = await response.json().catch(() => undefined);
  if (response.status === 401 || response.status === 403)
    throw new Error("Hyper3D API key was rejected");
  if (
    response.status === 429 ||
    body?.error === "API_PARALLELISM_LIMIT_REACHED"
  ) {
    if (canWait) return { wait: retryMs(response) };
    throw new Error(
      "Hyper3D is temporarily rate limited; check your dashboard before starting another job",
    );
  }
  if (
    response.ok &&
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body.error === undefined ||
      body.error === "" ||
      (Array.isArray(body.error) && body.error.length === 0))
  )
    return { body };
  const messages = {
    API_INSUFFICIENT_FUNDS: "Your Hyper3D credits are insufficient",
    API_OBJECT_NOT_FOUND_ON_IMAGE:
      "No supported object was found in the reference image",
    IMAGE_CONTENT_VIOLATION: "Hyper3D could not accept the reference image",
    NO_SUCH_TASK: "Hyper3D could not find this task; check your dashboard",
    ASSET_NOT_AVAILABLE: "The Hyper3D result is no longer available",
  };
  throw new Error(
    messages[body?.error] ??
      `Hyper3D could not accept this request (HTTP ${response.status})`,
  );
}

function delayed(task, milliseconds) {
  return {
    task: { ...task, notBefore: Date.now() + milliseconds },
    retryAfter: Math.min(60, milliseconds / 1000),
  };
}

export default {
  "3d": {
    async start(input, host) {
      const operation = input.operation;
      if (!["text", "image", "retexture"].includes(operation))
        throw new Error("Unsupported Hyper3D operation");
      const refs = input.references ?? [];
      const prompt = (input.prompt ?? "").trim();
      if (prompt.length > 1024)
        throw new Error("Hyper3D prompts must be at most 1024 characters");
      if (operation === "text" && (refs.length || !prompt))
        throw new Error(
          "Hyper3D text generation requires a prompt without images",
        );
      if (operation === "image" && (refs.length < 1 || refs.length > 5))
        throw new Error("Hyper3D takes 1 to 5 reference images");
      if (
        operation === "retexture" &&
        (refs.length !== 1 || !input.source?.file)
      )
        throw new Error(
          "Hyper3D texturing requires one source GLB and one reference image",
        );
      if (
        refs.some((ref) => !["image/png", "image/jpeg"].includes(ref.mediaType))
      )
        throw new Error("Hyper3D reference images must be PNG or JPEG");
      if (
        refs.reduce((size, ref) => size + ref.byteLength, 0) >
        20 * 1024 * 1024
      )
        throw new Error("Hyper3D reference images must total at most 20 MB");
      const multipart = refs.map((ref) => ({
        name: operation === "retexture" ? "image" : "images",
        file: ref.file,
      }));
      const field = (name, value) =>
        multipart.push({ name, value: String(value) });
      if (prompt) field("prompt", prompt);
      field("geometry_file_format", "glb");
      field(
        "material",
        operation !== "retexture" && !input.texture
          ? "None"
          : input.pbr
            ? "PBR"
            : "Shaded",
      );
      if (input.options?.pose) field("TAPose", "true");
      if (operation === "retexture") {
        multipart.push({ name: "model", file: input.source.file });
        field("resolution", "Basic");
      } else {
        field("tier", input.model);
        field("mesh_mode", "Raw");
        field("quality_override", input.targetPolycount);
        if (input.model.startsWith("Gen-2.5-")) field("texture_mode", "medium");
      }
      const { body } = await read(
        await host.submit(
          "generate",
          BASE + (operation === "retexture" ? "rodin_texture_only" : "rodin"),
          {
            method: "POST",
            auth: true,
            multipart,
          },
        ),
      );
      return {
        task: {
          phase: "status",
          id: identifier(body.uuid, "task ID"),
          subscriptionKey: identifier(
            body.jobs?.subscription_key,
            "status credential",
          ),
        },
        retryAfter: 5,
      };
    },

    async check(task, host) {
      if (!["status", "download"].includes(task?.phase))
        throw new Error("Invalid Hyper3D task state");
      identifier(task.id, "task ID");
      identifier(task.subscriptionKey, "status credential");
      if (task.notBefore > Date.now())
        return {
          retryAfter: Math.min(60, (task.notBefore - Date.now()) / 1000),
        };
      if (task.phase === "status") {
        const result = await read(
          await host.fetch(BASE + "status", {
            method: "POST",
            auth: true,
            json: { subscription_key: task.subscriptionKey },
          }),
          true,
        );
        if (result.wait) return delayed(task, result.wait);
        const jobs = result.body.jobs;
        if (
          !Array.isArray(jobs) ||
          !jobs.length ||
          jobs.some((job) => !STATES.includes(job?.status))
        )
          throw new Error("Hyper3D returned an invalid task status");
        if (jobs.some((job) => job.status === "Failed"))
          return { error: "Hyper3D could not generate this model" };
        if (!jobs.every((job) => job.status === "Done"))
          return { retryAfter: 5 };
      }
      const result = await read(
        await host.fetch(BASE + "download", {
          method: "POST",
          auth: true,
          json: { task_uuid: task.id },
        }),
        true,
      );
      if (result.wait)
        return delayed({ ...task, phase: "download" }, result.wait);
      const file = Array.isArray(result.body.list)
        ? result.body.list.find(
            (file) =>
              typeof file?.name === "string" &&
              file.name.toLowerCase().endsWith(".glb"),
          )
        : undefined;
      if (typeof file?.url !== "string" || !file.url)
        throw new Error("Hyper3D completed without a GLB artifact");
      // Host validates HTTPS, network grants and GLB bytes. No API credentials on downloads.
      return { outputs: [{ url: file.url, requestId: task.id }] };
    },

    async balance(_input, host) {
      const { body } = await read(
        await host.fetch(BASE + "check_balance", { auth: true }),
      );
      return { balance: body.balance };
    },
  },
};
