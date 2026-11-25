import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";
import type { AudioGenerationRequest } from "../app/src/shared/audio.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const pluginRoot = fileURLToPath(
  new URL("../plugins/elevenlabs", import.meta.url),
);
// MPEG-1 mono, 128 kbps at 44.1 kHz: synthetic demuxable silence, no vendor audio.
const MP3 = Buffer.concat(
  Array.from({ length: 10 }, () => {
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0xc0]);
    return frame;
  }),
);
const provider = "plugin.ohmygame.elevenlabs.elevenlabs";
const input = (id = "eleven_flash_v2_5"): AudioGenerationRequest => ({
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
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-elevenlabs-"));
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
  await services.configure("ohmygame/elevenlabs", {
    apiKey: "elevenlabs-test-key",
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
      new Response(new Uint8Array(MP3), {
        headers: {
          "content-type": "audio/mpeg",
          "request-id": `eleven-request-${requests.length}`,
        },
      })
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
  await services.setEveryProject("ohmygame/elevenlabs", true);
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

it("installs Beta models and logo and preserves each generation endpoint's options", async (t) => {
  const s = await setup(t);
  const catalog = await s.audio.catalog();
  assert.equal(catalog.models.length, 7);
  assert.equal(
    s.services.index.get("ohmygame/elevenlabs")!.manifest.beta,
    true,
  );
  assert.equal(
    s.services.index.get("ohmygame/elevenlabs")!.manifest.icon,
    "./assets/icon.svg",
  );
  assert.equal(catalog.providers[0]!.defaultVoiceId, undefined);
  assert.equal(
    catalog.models.find((m: { id: string }) => m.id === "scribe_v2")!
      .capabilities.transcribes,
    true,
  );
  const cases = [
    {
      id: "eleven_v4",
      options: { language: "zh-CN" },
      endpoint: "/text-to-speech/voice_one",
      fields: { text: "Hello 世界", language_code: "zh" },
    },
    {
      id: "eleven_flash_v2_5",
      options: { speed: 20 },
      endpoint: "/text-to-speech/voice_one",
      fields: { voice_settings: { speed: 1.2 } },
    },
    {
      id: "eleven_text_to_sound_v3",
      options: { durationSeconds: 0.5, loop: true },
      endpoint: "/sound-generation",
      fields: { duration_seconds: 0.5, loop: true },
    },
    {
      id: "eleven_text_to_sound_v2",
      options: { durationSeconds: 30 },
      endpoint: "/sound-generation",
      fields: { duration_seconds: 30 },
    },
    {
      id: "music_v2_5",
      options: { durationSeconds: 3.25, instrumental: true },
      endpoint: "/music",
      fields: { music_length_ms: 3250, force_instrumental: true },
    },
    {
      id: "music_v1",
      options: { durationSeconds: 600 },
      endpoint: "/music",
      fields: { music_length_ms: 600000 },
    },
  ];
  for (const [i, sample] of cases.entries()) {
    const result = await s.audio.generate(
      { ...input(sample.id), ...sample.options },
      undefined,
      await s.journal(`generation-${i}`),
    );
    assert.ok(Buffer.from(result.bytes).equals(MP3));
    assert.equal(result.metadata.sampleRate, 44100);
    assert.equal(result.metadata.providerRequestId, `eleven-request-${i + 1}`);
    const sent = s.requests.at(-1)!;
    assert.equal(
      sent.url,
      `https://api.elevenlabs.io/v1${sample.endpoint}?output_format=mp3_44100_128`,
    );
    assert.equal(sent.headers.get("xi-api-key"), "elevenlabs-test-key");
    assert.equal(sent.headers.has("authorization"), false);
    assert.equal(sent.body!.model_id, sample.id);
    for (const [key, value] of Object.entries(sample.fields))
      assert.deepEqual(sent.body![key], value);
  }
  assert.equal(s.requests.length, 6);
});

it("keeps a confirmed binary result across restart, rejects changed ownership and cleans up after storage", async (t) => {
  const s = await setup(t);
  assert.ok(
    Buffer.from(
      (await s.audio.generate(input(), undefined, await s.journal())).bytes,
    ).equals(MP3),
  );
  const receipt = await readFile(
    path.join(s.root, "tasks/generation.json"),
    "utf8",
  );
  assert.ok(receipt.length < 4096);
  assert.ok(!receipt.includes("elevenlabs-test-key"));
  const next = s.restart(),
    journal = await s.journal();
  assert.ok(
    Buffer.from(
      (await next.audio.generate(input(), undefined, journal)).bytes,
    ).equals(MP3),
  );
  assert.equal(s.requests.length, 1);
  await assert.rejects(
    next.audio.generate(
      { ...input(), prompt: "changed" },
      undefined,
      await s.journal(),
    ),
    /request changed/,
  );
  await s.services.configure("ohmygame/elevenlabs", {
    apiKey: "another-account",
  });
  await assert.rejects(
    next.audio.generate(input(), undefined, await s.journal()),
    /key or the request changed/,
  );
  assert.equal(s.requests.length, 1);
  await s.services.configure("ohmygame/elevenlabs", {
    apiKey: "elevenlabs-test-key",
  });
  await journal.clear();
  assert.deepEqual(await readdir(path.join(s.root, "tasks")), []);
});

it("never replays a lost paid response or a definite quota error and redacts the key", async (t) => {
  for (const lost of [true, false]) {
    const s = await setup(t, () => {
      if (lost) throw new Error("connection lost");
      return Response.json(
        { detail: { message: "quota elevenlabs-test-key" } },
        { status: 429 },
      );
    });
    await assert.rejects(
      s.audio.generate(input(), undefined, await s.journal()),
      lost ? /could not be reached/ : /quota \[key\]/,
    );
    await assert.rejects(
      s.restart().audio.generate(input(), undefined, await s.journal()),
      lost ? /response was lost/ : /quota \[key\]/,
    );
    assert.equal(s.requests.length, 1);
    assert.ok(
      !(
        await readFile(path.join(s.root, "tasks/generation.json"), "utf8")
      ).includes("elevenlabs-test-key"),
    );
  }
});

it("searches account voices and forwards page tokens without exposing unapproved previews", async (t) => {
  const s = await setup(t, (request) =>
    Response.json({
      voices: [
        {
          voice_id: "voice_one",
          name: "中文音色",
          preview_url:
            "https://storage.googleapis.com/eleven-public-prod/premade/voices/one/sample.mp3",
          labels: { language: "zh", ignored: 42 },
        },
        {
          voice_id: "voice_two",
          name: "Second",
          preview_url: "https://unapproved.example/sample.mp3",
        },
      ],
      has_more: !new URL(request.url).searchParams.has("next_page_token"),
      ...(!new URL(request.url).searchParams.has("next_page_token")
        ? { next_page_token: "next+page/=" }
        : {}),
    }),
  );
  const page = await s.audio.voices(provider, { search: " 中文 & one " });
  assert.equal(page.voices[0].name, "中文音色");
  assert.equal(page.voices[1].previewUrl, undefined);
  assert.deepEqual(page.voices[0].labels, { language: "zh" });
  assert.equal(page.nextPageToken, "next+page/=");
  await s.audio.voices(provider, { pageToken: page.nextPageToken });
  assert.equal(
    new URL(s.requests[0]!.url).searchParams.get("search"),
    "中文 & one",
  );
  assert.equal(
    new URL(s.requests[1]!.url).searchParams.get("next_page_token"),
    "next+page/=",
  );
  assert.ok(
    s.requests.every(
      (r) =>
        r.method === "GET" &&
        r.headers.get("xi-api-key") === "elevenlabs-test-key",
    ),
  );
  await assert.rejects(
    s.audio.generate(
      { ...input(), voiceId: undefined },
      undefined,
      await s.journal(),
    ),
    /voice/,
  );
  assert.equal(s.requests.length, 2);
});

it("transcribes a host-owned audio upload with normalized language and no paid retry", async (t) => {
  const s = await setup(t, () =>
    Response.json({ text: "  你好世界  ", language_code: "zh" }),
  );
  const result = await s.audio.transcribe({
    bytes: MP3,
    mediaType: "audio/mpeg",
    name: "中文.mp3",
    language: "zh-CN",
    model: { provider, id: "scribe_v2" },
  });
  assert.deepEqual(result, {
    text: "你好世界",
    language: "zh",
    model: { provider, id: "scribe_v2" },
  });
  const sent = s.requests[0]!;
  assert.equal(sent.url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(sent.headers.get("xi-api-key"), "elevenlabs-test-key");
  assert.equal(sent.form!.get("language_code"), "zh");
  assert.equal(sent.form!.get("model_id"), "scribe_v2");
  const file = sent.form!.get("file") as File;
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(MP3));
  assert.equal(file.type, "audio/mpeg");
  const failing = await setup(t, () => {
    throw new Error("lost transcript");
  });
  await assert.rejects(
    failing.audio.transcribe({
      bytes: MP3,
      mediaType: "audio/mpeg",
      name: "input.mp3",
    }),
    /could not be reached/,
  );
  assert.equal(failing.requests.length, 1);
});

it("checks model limits and current plugin access before spending credits", async (t) => {
  const s = await setup(t);
  const invalid = [
    { ...input(), prompt: "x".repeat(40001) },
    { ...input("eleven_v4"), prompt: "x".repeat(10001) },
    { ...input("music_v2_5"), prompt: "x".repeat(4101) },
    { ...input("eleven_text_to_sound_v3"), durationSeconds: 0.4 },
    { ...input("music_v1"), durationSeconds: 601 },
    { ...input(), speed: 21 },
    {
      ...input(),
      output: { format: "mp3" as const, sampleRate: 48000 as const },
    },
    input("scribe_v2"),
  ];
  for (const request of invalid)
    await assert.rejects(
      s.audio.generate(request, undefined, await s.journal()),
    );
  assert.equal(s.requests.length, 0);
  await s.services.setEveryProject("ohmygame/elevenlabs", false);
  assert.equal((await s.audio.catalog()).models.length, 0);
  await assert.rejects(s.audio.generate(input(), undefined, await s.journal()));
  assert.equal(s.requests.length, 0);
});

it("keeps a stored Flash speed across a v4 generation without sending unsupported settings", async (t) => {
  const s = await setup(t),
    saved = { ...input(), speed: 20 };
  await s.audio.generate(
    { ...saved, model: { provider, id: "eleven_v4" } },
    undefined,
    await s.journal("v4"),
  );
  assert.equal(s.requests[0]!.body!.voice_settings, undefined);
  assert.equal(saved.speed, 20);
  await s.audio.generate(saved, undefined, await s.journal("flash"));
  assert.deepEqual(s.requests[1]!.body!.voice_settings, { speed: 1.2 });
});
