import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";
import type {
  AudioGenerationRequest,
  AudioModel,
} from "../app/src/shared/audio.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const pluginRoot = fileURLToPath(
  new URL("../plugins/doubao-voice", import.meta.url),
);
// MPEG-1 mono, 128 kbps at 44.1 kHz: synthetic demuxable silence, no vendor audio.
const MP3 = Buffer.concat(
  Array.from({ length: 10 }, () => {
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0xc0]);
    return frame;
  }),
);
const provider = "plugin.ohmygame.doubao-voice.doubao-voice";
const input = (id = "seed-tts-2.0"): AudioGenerationRequest => ({
  model: { provider, id },
  prompt: "Hello 世界",
  voiceId: "voice_one",
  output: { format: "mp3", sampleRate: 44100 },
});
type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
  form?: FormData;
};
type Reply = (
  request: Request,
) => Response | undefined | Promise<Response | undefined>;

async function setup(t: TestContext, reply?: Reply) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { ProviderAudio },
    { mediaTaskJournal },
  ] = await Promise.all([
    load("plugin-services"),
    load("plugin-media-providers"),
    load("audio-generation"),
    load("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-doubao-voice-"));
  const services: Services = new PluginServices({
    directory: path.join(root, "store"),
  });
  const instances: Media[] = [];
  t.after(async () => {
    for (const media of instances) await media.close();
    await services.close();
    await rm(root, { recursive: true, force: true });
  });
  await services.installManaged(pluginRoot, { consent: false });
  await services.configure("ohmygame/doubao-voice", {
    apiKey: "doubao-voice-test-key",
  });
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const request: Request = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
      ...(init?.body instanceof FormData ? { form: init.body } : {}),
    };
    requests.push(request);
    return (
      (await reply?.(request)) ??
      new Response(
        JSON.stringify({
          code: 0,
          data: MP3.toString("base64"),
          usage: { text_words: 8 },
        }) + "\n",
        {
          headers: {
            "content-type": "application/json",
            "x-tt-logid": "vendor-request",
          },
        },
      )
    );
  };
  const restart = () => {
    const media: Media = new PluginMediaProviders(
      services,
      fetcher,
      undefined,
      undefined,
      root,
    );
    instances.push(media);
    return {
      media,
      audio: new ProviderAudio(() => media.audioAdapters(() => true)),
    };
  };
  const current = restart();
  assert.deepEqual(await current.media.audioProviders(), []);
  await services.setEveryProject("ohmygame/doubao-voice", true);
  return {
    ...current,
    root,
    services,
    requests,
    restart,
    journal: (id = "generation") =>
      mediaTaskJournal(path.join(root, "tasks"), id),
  };
}

it("loads the Beta logo and preserves speech controls and confirmed receipts", async (t) => {
  const s = await setup(t);
  const catalog = await s.audio.catalog();
  assert.equal(catalog.models.length, 2);
  assert.deepEqual(
    catalog.models.find((m: AudioModel) => m.id === "seed-tts-2.0")
      ?.capabilities.channels,
    [1],
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(pluginRoot, ".ohmygame-plugin/plugin.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.beta, true);
  assert.match(
    await readFile(path.join(pluginRoot, manifest.icon), "utf8"),
    /<svg/,
  );
  assert.equal(catalog.providers[0]?.defaultVoiceId, undefined);
  const request = {
    ...input(),
    voiceId: "zh_female_vv_uranus_bigtts",
    language: "zh-cn",
    speed: 0,
    pitch: -1,
    volume: 0,
    style: "calm",
    dialect: "yue",
    autoLanguage: true,
    silenceMs: 0,
    sectionId: "intro",
    pronunciation: [{ word: "重", replacement: "chong2" }],
    output: {
      format: "mp3" as const,
      sampleRate: 44100 as const,
      bitRate: 32000,
      channels: 1 as const,
    },
  };
  const result = await s.audio.generate(request, undefined, await s.journal());
  assert.deepEqual(result.bytes, MP3);
  assert.equal(result.metadata?.usageCharacters, 8);
  assert.equal(result.metadata?.providerRequestId, "vendor-request");
  const sent = s.requests[0]!;
  assert.equal(sent.headers.get("x-api-key"), "doubao-voice-test-key");
  assert.equal(sent.headers.get("x-api-resource-id"), "seed-tts-2.0");
  assert.match(sent.headers.get("x-api-request-id")!, /^[0-9a-f-]{36}$/);
  const params = sent.body!.req_params as Record<string, any>;
  assert.deepEqual(params.audio_params, {
    format: "mp3",
    sample_rate: 44100,
    loudness_rate: 0,
    bit_rate: 32000,
    speech_rate: 0,
  });
  assert.deepEqual(JSON.parse(params.additions), {
    explicit_language: "zh-cn",
    context_texts: ["calm"],
    enable_auto_language_recognition: true,
    explicit_dialect: "yue",
    post_process: { pitch: -1 },
    silence_duration: 0,
    section_id: "intro",
    pronunciation_dict: { tone: ["重/chong2"] },
    disable_default_bit_rate: true,
  });
  await s.media.close();
  assert.deepEqual(
    (await s.restart().audio.generate(request, undefined, await s.journal()))
      .bytes,
    MP3,
  );
  assert.equal(s.requests.length, 1);
});

it("keeps a configured speech voice separate from Seed Audio references and billing duration", async (t) => {
  const s = await setup(t, (req) =>
    req.url.endsWith("/create")
      ? Response.json({
          audio: MP3.toString("base64"),
          original_duration: 1.25,
        })
      : undefined,
  );
  await s.services.configure("ohmygame/doubao-voice", {
    defaultVoiceId: "S_saved",
  });
  await s.audio.generate(
    {
      ...input(),
      voiceId: undefined,
      voiceKind: "cloned",
      voiceModel: "expressive",
    },
    undefined,
    await s.journal("cloned"),
  );
  assert.equal(s.requests[0]!.headers.get("x-api-resource-id"), "seed-icl-2.0");
  assert.equal(
    (s.requests[0]!.body!.req_params as Record<string, unknown>).speaker,
    "S_saved",
  );
  assert.equal(
    (s.requests[0]!.body!.req_params as Record<string, unknown>).model,
    "seed-tts-2.0-expressive",
  );
  const request = {
    ...input("seed-audio-1.0"),
    voiceId: undefined,
    kind: "music" as const,
    durationSeconds: 0.05,
    language: "zh-cn",
    style: "gentle",
    speed: 5,
    pitch: 0,
    volume: 0,
  };
  const result = await s.audio.generate(
    request,
    undefined,
    await s.journal("scene"),
  );
  assert.equal(result.metadata?.originalDurationMs, 1250);
  assert.notEqual(result.metadata?.durationMs, 1250);
  assert.equal(s.requests[1]!.body!.references, undefined);
  assert.match(
    s.requests[1]!.body!.text_prompt as string,
    /0.05 seconds.*Language: zh-cn.*Delivery: gentle/,
  );
  await s.media.close();
  await s
    .restart()
    .audio.generate(request, undefined, await s.journal("scene"));
  assert.equal(s.requests.length, 2);
  await s
    .restart()
    .audio.generate(
      { ...request, voiceId: "speaker-reference" },
      undefined,
      await s.journal("reference"),
    );
  assert.deepEqual(s.requests[2]!.body!.references, [
    { speaker: "speaker-reference" },
  ]);
});

it("rejects invalid speech choices and unavailable output settings before sending", async (t) => {
  const s = await setup(t);
  let caseId = 0;
  for (const change of [
    { voiceId: undefined },
    { language: "unknown" },
    { pitch: 13 },
    { volume: -51 },
    { voiceKind: "cloned" as const, style: "calm" },
    { voiceModel: "expressive" as const },
    { dialect: "unknown" },
    {
      ssml: "<speak>hello</speak>",
      pronunciation: [{ word: "重", replacement: "chong2" }],
    },
    { pronunciation: [{ word: "a b", replacement: "sound" }] },
    { output: { format: "mp3" as const, channels: 2 as const } },
    { output: { format: "mp3" as const, bitRate: 128000 } },
  ])
    await assert.rejects(
      s.audio.generate(
        { ...input(), ...change },
        undefined,
        await s.journal(`invalid-${caseId++}`),
      ),
    );
  for (const change of [
    { durationSeconds: 0 },
    { durationSeconds: 121 },
    { style: "x".repeat(3000) },
    { output: { channels: 1 as const } },
  ])
    await assert.rejects(
      s.audio.generate(
        { ...input("seed-audio-1.0"), ...change },
        undefined,
        await s.journal(`invalid-${caseId++}`),
      ),
    );
  assert.equal(s.requests.length, 0);
});

it("does not repeat ambiguous failed submissions or leak the API key", async (t) => {
  const s = await setup(t, () => {
    throw new Error("connection lost");
  });
  for (let attempt = 0; attempt < 2; attempt++)
    await assert.rejects(
      s.restart().audio.generate(input(), undefined, await s.journal("lost")),
    );
  assert.equal(s.requests.length, 1);
  const files = await readdir(path.join(s.root, "tasks"), { recursive: true });
  for (const file of files.filter((f) => f.endsWith(".json")))
    assert.doesNotMatch(
      await readFile(path.join(s.root, "tasks", file), "utf8"),
      /doubao-voice-test-key/,
    );
});

for (const [name, body] of Object.entries({
  status: { code: 45001115, message: "unknown speaker" },
  base64: { code: 0, data: "not audio" },
  usage: { code: 0, data: MP3.toString("base64"), usage: { text_words: -1 } },
}))
  it(`keeps failed ${name} responses from causing another paid submission`, async (t) => {
    const s = await setup(t, () => Response.json(body));
    for (let attempt = 0; attempt < 2; attempt++)
      await assert.rejects(
        s.restart().audio.generate(input(), undefined, await s.journal()),
      );
    assert.equal(s.requests.length, 1);
  });
