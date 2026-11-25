// MiniMax H3 v2. The host owns credentials, downloads and the durable task journal.
const BASES = {
  cn: "https://api.minimax.cn",
  global: "https://api.minimax.io",
};

function base(region) {
  if (region !== "cn" && region !== "global")
    throw new Error("Unknown MiniMax account region");
  return BASES[region];
}

async function read(response) {
  const text = await response.text();
  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    /* An unreadable success is not a definite rejection. */
  }
  const detail = answer && answer.error && answer.error.message;
  return {
    answer,
    message:
      typeof detail === "string" && detail
        ? detail.slice(0, 500)
        : `MiniMax answered HTTP ${response.status}`,
  };
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id);
}

function retryAfter(response) {
  const seconds = Number(response.headers["retry-after"]);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(60, Math.max(1, seconds))
    : 5;
}

// A small reviewed set shared by the official China/Global system-voice lists.
// Account voice discovery is a POST endpoint; do not bypass the host's read-only voice-query boundary.
const SPEECH_VOICES = [
  { id: "Robot_Armor", name: "机械战甲 · Robot Armor", labels: { language: "Chinese" } },
  { id: "Arrogant_Miss", name: "嚣张小姐 · Arrogant Miss", labels: { language: "Chinese" } },
  { id: "Cantonese_GentleLady", name: "温柔女声 · Cantonese Gentle Lady", labels: { language: "Cantonese" } },
  { id: "English_Graceful_Lady", name: "Graceful Lady", labels: { language: "English" } },
  { id: "English_Gentle-voiced_man", name: "Gentle-voiced Man", labels: { language: "English" } },
  { id: "Japanese_LoyalKnight", name: "Loyal Knight", labels: { language: "Japanese" } },
];

export default {
  audio: {
    async start(input, host) {
      const url = base(input.modelData?.region);
      if (!["speech-2.8-hd", "speech-2.8-turbo"].includes(input.model))
        return { error: "The selected MiniMax speech model is unavailable." };
      if (!input.voiceId) return { error: "Choose a MiniMax speech voice." };
      if (input.prompt.length >= 10000) return { error: "MiniMax speech takes fewer than 10,000 characters." };
      const response = await host.submit("speech", url + "/v1/t2a_v2", {
        method: "POST", auth: true, responseType: "file",
        json: {
          model: input.model, text: input.prompt, stream: false, output_format: "hex", language_boost: "auto",
          voice_setting: { voice_id: input.voiceId, speed: 1 + (input.speed ?? 0) / 100, pitch: input.pitch ?? 0, vol: 1 + (input.volume ?? 0) / 100 },
          audio_setting: { format: input.format, sample_rate: input.sampleRate ?? 32000, channel: input.channels ?? 1 },
        },
        decode: { format: "json", encoding: "hex", audioField: ["data", "audio"], statusField: ["base_resp", "status_code"], messageField: ["base_resp", "status_msg"], successCodes: [0] },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.base_resp?.status_msg ?? body?.error?.message;
        return { error: `MiniMax speech HTTP ${response.status}${typeof detail === "string" ? ": " + detail.slice(0, 700) : ""}` };
      }
      const metadata = response.metadata;
      if (metadata.data?.status !== 2) return { error: "MiniMax returned incomplete speech audio." };
      return { outputs: [{ ...await response.file(),
        ...(metadata.trace_id ? { requestId: metadata.trace_id } : {}),
        ...(metadata.extra_info?.usage_characters !== undefined ? { usageCharacters: metadata.extra_info.usage_characters } : {}),
        ...(metadata.extra_info?.audio_length !== undefined ? { originalDurationMs: metadata.extra_info.audio_length } : {}),
      }] };
    },
    voices(input) {
      if (input.pageToken) return { error: "MiniMax preset voices have no next page." };
      const search = input.search?.trim().toLowerCase();
      return { voices: SPEECH_VOICES.filter(voice => !search || `${voice.id} ${voice.name} ${voice.labels.language}`.toLowerCase().includes(search)) };
    },
  },
  video: {
    async start(input, host) {
      const region = input.modelData && input.modelData.region;
      const url = base(region);
      if (!input.prompt.trim())
        return { error: "Enter a prompt for MiniMax video generation." };
      const content = [{ type: "text", text: input.prompt }];
      input.references.forEach((image, index) =>
        content.push({
          type: "image_url",
          image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
          role:
            input.referenceMode === "reference"
              ? "reference_image"
              : index === 0
                ? "first_frame"
                : "last_frame",
        }),
      );
      const response = await host.fetch(url + "/v2/video_generation", {
        method: "POST",
        auth: true,
        json: {
          model: input.model,
          content,
          duration: input.duration,
          resolution: input.resolution.toUpperCase(),
          ratio: input.aspectRatio,
        },
      });
      const { answer, message } = await read(response);
      // Only a structured vendor rejection proves that no paid task was created.
      // A transport/server error, unexpected redirect or malformed answer keeps
      // the host's unconfirmed marker: retry must not submit and charge again.
      if (!response.ok) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408 &&
          answer &&
          answer.type === "error" &&
          answer.error
        )
          return { error: message };
        throw new Error(message);
      }
      if (!answer || !validId(answer.task_id))
        throw new Error(
          "MiniMax returned no task ID; check your MiniMax account before starting another video.",
        );
      return {
        task: { id: answer.task_id, region },
        retryAfter: retryAfter(response),
      };
    },

    async check(task, host) {
      if (!task || !validId(task.id))
        throw new Error("Invalid MiniMax task ID");
      const response = await host.fetch(
        base(task.region) +
          "/v2/query/video_generation/" +
          encodeURIComponent(task.id),
        { auth: true },
      );
      const { answer, message } = await read(response);
      // Transient/unreadable checks never become a second start request.
      if (!response.ok) throw new Error(message);
      const result = answer && answer.task;
      if (!result || result.id !== task.id)
        throw new Error("MiniMax returned a different or missing task");
      if (result.status === "queued" || result.status === "running")
        return { retryAfter: retryAfter(response) };
      if (["failed", "cancelled", "expired"].includes(result.status)) {
        const detail = result.error && result.error.message;
        return {
          error:
            typeof detail === "string" && detail
              ? detail
              : `MiniMax task ${result.status}`,
        };
      }
      if (result.status !== "succeeded")
        throw new Error("Unknown MiniMax task status");
      const url = result.content && result.content.url;
      if (typeof url !== "string" || !url)
        throw new Error("MiniMax returned no video URL");
      // The host validates the URL against the network grant and downloads without auth.
      return { outputs: [{ url }] };
    },
    // Deliberately no cancel: DELETE also erases completed tasks, and a check
    // before DELETE cannot close that race. Stop ends local polling only.
  },
};
