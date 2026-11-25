const API = "https://api.fish.audio";
const MODELS = new Set(["s2.1-pro", "s2.1-pro-free"]);
const RATES = { mp3: [32000, 44100], wav: [8000, 16000, 24000, 32000, 44100] };
const PAGE_SIZE = 50;

async function failure(response) {
  const body = await response.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message : "Request failed";
  return { error: `Fish Audio HTTP ${response.status}: ${message.slice(0, 700)}` };
}

export default {
  audio: {
    async start(input, host) {
      // Fish falls back to a paid model for an unknown model header. Never allow that fallback.
      if (!MODELS.has(input.model)) return { error: "The selected Fish Audio model is unavailable." };
      if (!input.voiceId) return { error: "Choose a Fish Audio voice." };
      const rates = RATES[input.format];
      if (!rates || (input.sampleRate !== undefined && !rates.includes(input.sampleRate)))
        return { error: "Choose a supported MP3 or WAV sample rate for Fish Audio." };
      const body = {
        text: input.prompt,
        reference_id: input.voiceId,
        format: input.format,
        sample_rate: input.sampleRate ?? 44100,
        ...(input.speed !== undefined ? { prosody: { speed: 1 + input.speed / 100 } } : {}),
      };
      // A single synchronous submission owns its durable response file. A lost response is not resubmitted.
      const response = await host.submit("speech", `${API}/v1/tts`, {
        method: "POST", auth: true, headers: { model: input.model }, json: body, responseType: "file",
      });
      if (!response.ok) return failure(response);
      return { outputs: [await response.file()] };
    },

    async voices(input, host) {
      const token = input.pageToken ?? "own:1";
      const match = /^(own|public):([1-9][0-9]{0,5})$/.exec(token);
      if (!match) return { error: "Invalid Fish Audio voice page. Search again to reload voices." };
      let source = match[1], page = Number(match[2]);
      // If the workspace has no voices, enter the public list in the same request to the host.
      for (let attempt = 0; attempt < 2; attempt++) {
        let query = `page_size=${PAGE_SIZE}&page_number=${page}&self=${source === "own"}`;
        if (input.search?.trim()) query += `&title=${encodeURIComponent(input.search.trim())}`;
        const response = await host.fetch(`${API}/model?${query}`, { auth: true });
        if (!response.ok) return failure(response);
        const body = await response.json();
        if (!Array.isArray(body?.items) || !Number.isSafeInteger(body.total) || body.total < 0
          || body.items.some((voice) => !voice || typeof voice._id !== "string" || !voice._id || typeof voice.title !== "string"))
          return { error: "Fish Audio returned an invalid voice list." };
        const end = page * PAGE_SIZE;
        const bound = Number.isSafeInteger(body.accessible_upper_bound) ? body.accessible_upper_bound : body.total;
        const more = body.has_more === true || (body.has_more == null && end < bound);
        if (more && (!body.items.length || page >= 999999)) return { error: "Fish Audio returned an invalid next voice page." };
        const voices = body.items.filter((voice) => voice.type === "tts" && voice.state === "trained" && !voice.dmca_taken_down)
          .map((voice) => ({ id: voice._id, name: voice.title, labels: { source: source === "own" ? "Workspace" : "Public" } }));
        const nextPageToken = more ? `${source}:${page + 1}` : source === "own" ? "public:1" : undefined;
        if (!voices.length && source === "own" && !more) { source = "public"; page = 1; continue; }
        return { voices, ...(nextPageToken ? { nextPageToken } : {}) };
      }
      return { voices: [] };
    },
  },
};
