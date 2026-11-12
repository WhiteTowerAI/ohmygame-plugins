// fal.ai's queue API for OhMyGame (docs.fal.ai: model endpoints, queue).
// Runs in OhMyGame's sandbox: host.fetch reaches only the hosts in
// capabilities.network, and `auth: true` adds the key ("Key <key>"), which
// this script never sees.
//
// Every model goes through the same queue: `start` submits the request, `check`
// reads its status and, once it's done, its result, and `cancel` withdraws it.
// The queue answers with the addresses to use, so they're kept as the task.

const QUEUE = "https://queue.fal.run/";

// FLUX's named sizes for the aspect ratios it's offered with.
const IMAGE_SIZES = {
  "1:1": "square_hd", "4:3": "landscape_4_3", "3:4": "portrait_4_3", "16:9": "landscape_16_9", "9:16": "portrait_16_9",
};

/** The answer's JSON, and its message when fal.ai refused the request. */
async function read(response) {
  const text = await response.text();
  let answer;
  try { answer = JSON.parse(text); } catch { answer = undefined; }
  const detail = answer && answer.detail;
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

/** Submits a request to a model's queue. */
async function submit(model, body, host) {
  const response = await host.fetch(QUEUE + model, { method: "POST", auth: true, json: body });
  const { answer, message } = await read(response);
  // A server error may come after fal.ai took the request: throwing has OhMyGame
  // treat it as possibly sent, so a retry doesn't pay again. A refusal can be tried again.
  if (response.status >= 500) throw new Error(message);
  if (!response.ok) return { error: message };
  const task = answer && { status: answer.status_url, result: answer.response_url, cancel: answer.cancel_url };
  // Taken but unreadable: thrown for the same reason as a server error.
  if (!task || !onQueue(task.status) || !onQueue(task.result)) throw new Error("fal.ai returned no request to follow");
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
  const url = output.answer && pick(output.answer);
  return typeof url === "string" && url ? { outputs: [{ url }] } : { error: "fal.ai returned no file" };
}

async function cancel(task, host) {
  if (onQueue(task.cancel)) await host.fetch(task.cancel, { method: "PUT", auth: true });
}

export default {
  image: {
    start(input, host) {
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
    start(input, host) {
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
    start(input, host) {
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
    start(input, host) {
      const front = input.references && input.references[0];
      if (input.operation !== "image" || !front) return { error: "TRELLIS on fal.ai makes a 3D model from a picture: add one." };
      return submit(input.model, { image_url: dataUri(front) }, host);
    },
    check: (task, host) => follow(task, host, 5, (answer) => answer.model_mesh && answer.model_mesh.url),
    cancel,
  },
};
