// SiliconFlow's image API for OhMyGame (docs.siliconflow.cn, images-generations).
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
      const text = await response.text();
      let answer;
      try { answer = JSON.parse(text); } catch { answer = undefined; }
      if (!response.ok) return { error: (answer && typeof answer.message === "string" && answer.message) || text.slice(0, 300) || `SiliconFlow answered ${response.status}` };
      // The address lasts an hour; OhMyGame downloads it at once.
      const url = answer && answer.images && answer.images[0] && answer.images[0].url;
      return url ? { outputs: [{ url }] } : { error: "SiliconFlow returned no picture" };
    },
  },
};
