const SERVER = "http://127.0.0.1:9880";

function language(value, auto = false) {
  if (typeof value !== "string") return undefined;
  const base = value.toLowerCase().replaceAll("_", "-").split("-")[0];
  return ["zh", "en", "ja", ...(auto ? ["auto"] : [])].includes(base)
    ? base
    : undefined;
}

export default {
  audio: {
    async start(input, host) {
      if (input.model !== "reference-speech" || input.format !== "wav")
        return {
          error: "Choose the configured GPT-SoVITS reference and WAV output.",
        };
      const settings = input.configuration;
      if (!settings)
        return { error: "Configure the GPT-SoVITS reference audio first." };
      const reference = settings.referencePath;
      if (
        typeof reference !== "string" ||
        !/^(?:\/|[A-Za-z]:[\\/])/.test(reference) ||
        /[\0\r\n]/.test(reference)
      )
        return {
          error:
            "Use an absolute reference audio path on the GPT-SoVITS server.",
        };
      const transcript = settings.referenceText;
      if (
        typeof transcript !== "string" ||
        !transcript.trim() ||
        transcript.length > 2000
      )
        return {
          error:
            "Enter the reference audio's transcript, up to 2,000 characters.",
        };
      const promptLanguage = language(settings.referenceLanguage);
      const textLanguage = language(
        input.language ?? settings.textLanguage,
        true,
      );
      if (!promptLanguage || !textLanguage)
        return {
          error:
            "Choose zh, en or ja for the reference, and auto, zh, en or ja for the text.",
        };
      const speed = input.speed ?? 0;
      if (!Number.isInteger(speed) || speed < -50 || speed > 100)
        return { error: "GPT-SoVITS speed must be between -50 and 100." };

      // The host pins these settings before submission. This service has no
      // request-id lookup: replay a saved response, never guess that a lost one failed.
      const response = await host.submit("speech", `${SERVER}/tts`, {
        method: "POST",
        json: {
          text: input.prompt,
          text_lang: textLanguage,
          ref_audio_path: reference,
          prompt_text: transcript,
          prompt_lang: promptLanguage,
          speed_factor: 1 + speed / 100,
          media_type: "wav",
          streaming_mode: false,
          batch_size: 1,
          text_split_method: "cut5",
        },
        responseType: "file",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = [body?.message, body?.Exception]
          .filter((value) => typeof value === "string" && value)
          .join(": ");
        return {
          error: `GPT-SoVITS HTTP ${response.status}: ${detail.slice(0, 700) || "Speech generation failed"}`,
        };
      }
      return { outputs: [await response.file()] };
    },
  },
};
