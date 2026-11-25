const API = "https://api.elevenlabs.io";
const SPEECH = new Set(["eleven_v4", "eleven_flash_v2_5"]);
const SOUND = new Set(["eleven_text_to_sound_v3", "eleven_text_to_sound_v2"]);
const MUSIC = new Set(["music_v2_5", "music_v1"]);
const OUTPUT = "mp3_44100_128";

function languageCode(value) {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0];
  return code && /^[a-z]{2,3}$/.test(code) ? code : undefined;
}

async function failure(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  const message =
    typeof detail === "string"
      ? detail
      : typeof detail?.message === "string"
        ? detail.message
        : typeof body?.message === "string"
          ? body.message
          : "Request failed";
  return {
    error: `ElevenLabs HTTP ${response.status}: ${message.slice(0, 700)}`,
  };
}

export default {
  audio: {
    async start(input, host) {
      if (
        input.format !== "mp3" ||
        (input.sampleRate !== undefined && input.sampleRate !== 44100)
      )
        return { error: "This ElevenLabs plugin outputs MP3 at 44.1 kHz." };
      const text = input.prompt.trim();
      const body = { model_id: input.model };
      let endpoint;
      if (SPEECH.has(input.model)) {
        if (!input.voiceId) return { error: "Choose an ElevenLabs voice." };
        endpoint = `/v1/text-to-speech/${encodeURIComponent(input.voiceId)}`;
        body.text = text;
        const language = languageCode(input.language);
        if (language) body.language_code = language;
        // Model-specific documentation excludes speed control for v4.
        if (input.model === "eleven_flash_v2_5" && input.speed !== undefined)
          body.voice_settings = {
            speed: Math.round((1 + input.speed / 100) * 100) / 100,
          };
      } else if (SOUND.has(input.model)) {
        endpoint = "/v1/sound-generation";
        body.text = text;
        if (input.durationSeconds !== undefined)
          body.duration_seconds = input.durationSeconds;
        if (input.loop !== undefined) body.loop = input.loop;
      } else if (MUSIC.has(input.model)) {
        endpoint = "/v1/music";
        body.prompt = text;
        if (input.durationSeconds !== undefined)
          body.music_length_ms = Math.round(input.durationSeconds * 1000);
        if (input.instrumental !== undefined)
          body.force_instrumental = input.instrumental;
      } else
        return {
          error: "The selected ElevenLabs generation model is unavailable.",
        };
      const response = await host.submit(
        "generate-audio",
        `${API}${endpoint}?output_format=${OUTPUT}`,
        {
          method: "POST",
          auth: true,
          json: body,
          responseType: "file",
        },
      );
      if (!response.ok) return failure(response);
      const requestId = response.headers["request-id"];
      return {
        outputs: [
          { ...(await response.file()), ...(requestId ? { requestId } : {}) },
        ],
      };
    },

    async voices(input, host) {
      let query = "page_size=100&include_total_count=false";
      if (input.search?.trim())
        query += `&search=${encodeURIComponent(input.search.trim())}`;
      if (input.pageToken)
        query += `&next_page_token=${encodeURIComponent(input.pageToken)}`;
      const response = await host.fetch(`${API}/v2/voices?${query}`, {
        auth: true,
      });
      if (!response.ok) return failure(response);
      const body = await response.json();
      if (!Array.isArray(body.voices))
        return { error: "ElevenLabs returned an invalid voice list." };
      if (
        body.has_more === true &&
        (typeof body.next_page_token !== "string" || !body.next_page_token)
      )
        return {
          error: "ElevenLabs did not return the next voice page token.",
        };
      return {
        voices: body.voices.map((voice) => ({
          id: voice.voice_id,
          name: voice.name,
          // Optional previews only use the public bucket documented by ElevenLabs.
          ...(typeof voice.preview_url === "string" &&
          /^https:\/\/storage\.googleapis\.com\/eleven-public-prod\//.test(
            voice.preview_url,
          )
            ? { previewUrl: voice.preview_url }
            : {}),
          ...(voice.labels &&
          typeof voice.labels === "object" &&
          !Array.isArray(voice.labels)
            ? {
                labels: Object.fromEntries(
                  Object.entries(voice.labels).filter(
                    ([, value]) => typeof value === "string",
                  ),
                ),
              }
            : {}),
        })),
        ...(body.has_more === true
          ? { nextPageToken: body.next_page_token }
          : {}),
      };
    },

    async transcribe(input, host) {
      if (input.model !== "scribe_v2")
        return {
          error: "The selected ElevenLabs transcription model is unavailable.",
        };
      const multipart = [
        { name: "model_id", value: input.model },
        { name: "file", file: input.audio.file },
      ];
      const language = languageCode(input.language);
      if (language) multipart.push({ name: "language_code", value: language });
      // Transcription is an explicit synchronous action; do not retry a lost response.
      const response = await host.fetch(`${API}/v1/speech-to-text`, {
        method: "POST",
        auth: true,
        multipart,
      });
      if (!response.ok) return failure(response);
      const body = await response.json();
      return {
        text: body.text,
        ...(typeof body.language_code === "string"
          ? { language: body.language_code }
          : {}),
      };
    },
  },
};
