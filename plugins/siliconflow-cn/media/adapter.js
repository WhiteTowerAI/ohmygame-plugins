// SiliconFlow's image and video APIs for OhMyGame (docs.siliconflow.cn:
// images-generations, video-submit, video-status).
// Runs in OhMyGame's sandbox: host.fetch reaches only the hosts in
// capabilities.network, and `auth: true` adds the key, which this script never sees.

// Each model's recommended sizes by aspect ratio, from SiliconFlow's docs.
const SIZES = {
  "Kwai-Kolors/Kolors": { "1:1": "1024x1024", "3:4": "960x1280", "9:16": "720x1280" },
  "Qwen/Qwen-Image": {
    "1:1": "1328x1328", "16:9": "1664x928", "9:16": "928x1664", "4:3": "1472x1140",
    "3:4": "1140x1472", "3:2": "1584x1056", "2:3": "1056x1584",
  },
};

/** The answer's JSON, and its message when SiliconFlow refused the request. */
async function read(response) {
  const text = await response.text();
  let answer;
  try { answer = JSON.parse(text); } catch { answer = undefined; }
  const message = (answer && typeof answer.message === "string" && answer.message) || text.slice(0, 300) || `SiliconFlow answered ${response.status}`;
  return { answer, message };
}

export default {
  image: {
    async start(input, host) {
      const sizes = SIZES[input.model];
      if (!sizes) return { error: `${input.model} isn't offered here` };
      const ratio = input.aspectRatio && sizes[input.aspectRatio] ? input.aspectRatio : "1:1";
      const body = { model: input.model, prompt: input.prompt, image_size: sizes[ratio] };
      const reference = input.references[0];
      if (reference) body.image = `data:${reference.mediaType};base64,${reference.base64}`;
      const response = await host.fetch("https://api.siliconflow.cn/v1/images/generations", { method: "POST", auth: true, json: body });
      const { answer, message } = await read(response);
      if (!response.ok) return { error: message };
      // The address lasts an hour; OhMyGame downloads it at once.
      const url = answer && answer.images && answer.images[0] && answer.images[0].url;
      return url ? { outputs: [{ url }] } : { error: "SiliconFlow returned no picture" };
    },
  },

  video: {
    async start(input, host) {
      const body = { model: input.model, prompt: input.prompt, duration: input.duration, resolution: input.resolution, ratio: input.aspectRatio };
      // As frames: the first picture opens the video, a second one ends it.
      if (input.references.length) {
        body.images = input.references.map((picture, index) => ({
          url: `data:${picture.mediaType};base64,${picture.base64}`,
          role: index === 0 ? "first_frame" : "last_frame",
        }));
      }
      const response = await host.fetch("https://api.siliconflow.cn/v1/video/submit", { method: "POST", auth: true, json: body });
      const { answer, message } = await read(response);
      // A server error may come after SiliconFlow took the request: throwing has OhMyGame
      // treat it as possibly sent, so a retry doesn't pay again. A refusal can be tried again.
      if (response.status >= 500) throw new Error(message);
      if (!response.ok) return { error: message };
      const requestId = answer && answer.requestId;
      // Taken but unreadable: thrown for the same reason as a server error.
      if (typeof requestId !== "string" || !requestId) throw new Error("SiliconFlow returned no request id");
      return { task: { requestId } };
    },

    async check(task, host) {
      const response = await host.fetch("https://api.siliconflow.cn/v1/video/status", { method: "POST", auth: true, json: { requestId: task.requestId } });
      const { answer, message } = await read(response);
      // A busy service is checked again (OhMyGame retries a failed check); a refusal ends the task.
      if (response.status === 429 || response.status >= 500) throw new Error(message);
      if (!response.ok) return { error: message };
      const status = answer && answer.status;
      if (status === "Succeed") {
        // The address lasts an hour; OhMyGame downloads it at once.
        const url = answer.results && answer.results.videos && answer.results.videos[0] && answer.results.videos[0].url;
        return url ? { outputs: [{ url }] } : { error: "SiliconFlow returned no video" };
      }
      if (status === "Failed") return { error: (typeof answer.reason === "string" && answer.reason) || "SiliconFlow couldn't make this video" };
      // InQueue or InProgress. SiliconFlow has no way to cancel a request, so there's no `cancel`.
      return { retryAfter: 5 };
    },
  },
};
