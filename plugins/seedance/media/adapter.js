// Ark/ModelArk APIs. The host owns keys, result downloads and video journals.
const BASES = {
  ark: "https://ark.cn-beijing.volces.com/api/v3",
  byteplus: "https://ark.ap-southeast.bytepluses.com/api/v3",
};

function base(region) {
  if (region !== "ark" && region !== "byteplus")
    throw new Error("Unknown Seedance account region");
  return BASES[region];
}
function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}
function detail(error, fallback) {
  return error && typeof error.message === "string" && error.message
    ? error.message.slice(0, 500)
    : fallback;
}
async function read(response) {
  let answer;
  try {
    answer = JSON.parse(await response.text());
  } catch {
    /* Ambiguous success keeps its unconfirmed journal. */
  }
  return {
    answer,
    message: detail(
      answer && answer.error,
      `Ark answered HTTP ${response.status}`,
    ),
  };
}
function retryAfter(response) {
  const seconds = Number(response.headers["retry-after"]);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(60, Math.max(1, seconds))
    : 5;
}
const dataUrl = (image) =>
  `data:${image.mediaType.toLowerCase()};base64,${image.base64}`;

export default {
  image: {
    async start(input, host) {
      const data = input.modelData;
      const size =
        data &&
        data.sizes &&
        data.sizes[input.resolution + ":" + input.aspectRatio];
      if (!size)
        return {
          error: "Choose a supported Seedream resolution and aspect ratio.",
        };
      if (!input.prompt.trim())
        return { error: "Enter a prompt for Seedream image generation." };
      if (input.references.length > data.maxReferences)
        return {
          error: `This Seedream model accepts up to ${data.maxReferences} reference images.`,
        };
      const response = await host.fetch(BASES.ark + "/images/generations", {
        method: "POST",
        auth: true,
        json: {
          model: input.model,
          prompt: input.prompt,
          size,
          ...(input.references.length
            ? { image: input.references.map(dataUrl) }
            : {}),
          output_format: "png",
          response_format: "b64_json",
          watermark: false,
          ...(data.sequential
            ? { sequential_image_generation: data.sequential }
            : {}),
        },
      });
      const { answer, message } = await read(response);
      if (!response.ok || (answer && answer.error)) return { error: message };
      const result = answer && Array.isArray(answer.data) && answer.data[0];
      if (result && result.error)
        return {
          error: detail(result.error, "Seedream image generation failed."),
        };
      if (result && typeof result.b64_json === "string" && result.b64_json) {
        const value = result.b64_json;
        return {
          outputs: [
            {
              base64: value.startsWith("data:")
                ? value.slice(value.indexOf(",") + 1)
                : value,
            },
          ],
        };
      }
      if (result && typeof result.url === "string" && result.url)
        return { outputs: [{ url: result.url }] };
      throw new Error(
        "Seedream returned no image. Check your account before creating another image.",
      );
    },
  },
  video: {
    async start(input, host) {
      const region = input.modelData && input.modelData.region;
      const url = base(region);
      if (!input.prompt.trim() && !input.references.length)
        return {
          error: "Enter a prompt or add a reference image for Seedance.",
        };
      const content = [];
      if (input.prompt.trim())
        content.push({ type: "text", text: input.prompt });
      input.references.forEach((image, index) =>
        content.push({
          type: "image_url",
          image_url: { url: dataUrl(image) },
          role:
            input.referenceMode === "reference"
              ? "reference_image"
              : index === 0
                ? "first_frame"
                : "last_frame",
        }),
      );
      const response = await host.fetch(url + "/contents/generations/tasks", {
        method: "POST",
        auth: true,
        json: {
          model: input.model,
          content,
          resolution: input.resolution === "4K" ? "4k" : input.resolution,
          ratio: input.aspectRatio,
          duration: input.duration,
          generate_audio: true,
          watermark: false,
        },
      });
      const { answer, message } = await read(response);
      if (!response.ok) {
        // Only a structured 4xx rejection establishes that the request was refused.
        // A timeout, 5xx, redirect or unreadable response must never start a second paid task.
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408 &&
          answer &&
          answer.error &&
          typeof answer.error.code === "string" &&
          answer.error.code
        )
          return { error: message };
        throw new Error(message);
      }
      if (!answer || !validId(answer.id))
        throw new Error(
          "Seedance returned no task ID. Check your account before creating another video.",
        );
      return {
        task: { id: answer.id, region },
        retryAfter: retryAfter(response),
      };
    },
    async check(task, host) {
      if (!task || !validId(task.id))
        throw new Error("Invalid Seedance task ID");
      const response = await host.fetch(
        base(task.region) +
          "/contents/generations/tasks/" +
          encodeURIComponent(task.id),
        { auth: true },
      );
      const { answer, message } = await read(response);
      // Poll failures keep the original task; no replacement submission on retry.
      if (!response.ok) throw new Error(message);
      if (!answer || answer.id !== task.id)
        throw new Error("Seedance returned a different or missing task");
      if (answer.status === "queued" || answer.status === "running")
        return { retryAfter: retryAfter(response) };
      if (["failed", "cancelled", "expired"].includes(answer.status))
        return {
          error: detail(answer.error, `Seedance task ${answer.status}`),
        };
      if (answer.status !== "succeeded")
        throw new Error("Unknown Seedance task status");
      const url = answer.content && answer.content.video_url;
      if (typeof url !== "string" || !url)
        throw new Error("Seedance returned no video URL");
      return { outputs: [{ url }] };
    },
    // DELETE can remove completed task records. Stop only ends local polling.
  },
};
