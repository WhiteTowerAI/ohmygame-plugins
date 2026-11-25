import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";
import type { ProviderAudio as Audio } from "../app/src/daemon/audio-generation.js";
import type { AudioGenerationRequest } from "../app/src/shared/audio.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const pluginRoot = fileURLToPath(
  new URL("../plugins/gpt-sovits", import.meta.url),
);
const pluginId = "ohmygame/gpt-sovits";
const provider = "plugin.ohmygame.gpt-sovits.gpt-sovits";
const input: AudioGenerationRequest = {
  model: { provider, id: "reference-speech" },
  prompt: "Hello 世界",
  output: { format: "wav" },
};
const settings = {
  referencePath: "/server/voices/reference.wav",
  referenceText: "你好世界",
  referenceLanguage: "zh",
  textLanguage: "auto",
};
const WAV = Buffer.alloc(44 + 3200);
WAV.write("RIFF");
WAV.writeUInt32LE(WAV.length - 8, 4);
WAV.write("WAVEfmt ", 8);
WAV.writeUInt32LE(16, 16);
WAV.writeUInt16LE(1, 20);
WAV.writeUInt16LE(1, 22);
WAV.writeUInt32LE(16000, 24);
WAV.writeUInt32LE(32000, 28);
WAV.writeUInt16LE(2, 32);
WAV.writeUInt16LE(16, 34);
WAV.write("data", 36);
WAV.writeUInt32LE(3200, 40);
type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
  signal?: AbortSignal | null;
};

async function setup(
  t: TestContext,
  reply?: (r: Request) => Response | undefined | Promise<Response | undefined>,
) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { ProviderAudio },
    { mediaTaskJournal, GenerationShutdown },
  ] = await Promise.all([
    load("plugin-services"),
    load("plugin-media-providers"),
    load("audio-generation"),
    load("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-gpt-sovits-"));
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
  await services.configure(pluginId, settings);
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const r: Request = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      signal: init?.signal,
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
    };
    requests.push(r);
    const answer = await reply?.(r);
    return (
      answer ?? new Response(WAV, { headers: { "content-type": "audio/wav" } })
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
    const audio: Audio = new ProviderAudio(() =>
      media.audioAdapters(() => true),
    );
    return { media, audio };
  };
  const current = restart();
  assert.deepEqual((await current.audio.catalog()).models, []);
  await services.setEveryProject(pluginId, true);
  return {
    ...current,
    root,
    services,
    requests,
    restart,
    GenerationShutdown,
    journal: (id = "speech") => mediaTaskJournal(path.join(root, "tasks"), id),
  };
}

it("uses the configured reference on the exact local server and preserves WAV bytes", async (t) => {
  const s = await setup(t);
  const catalog = await s.audio.catalog();
  assert.deepEqual(
    catalog.models.map((m) => m.id),
    ["reference-speech"],
  );
  assert.deepEqual(catalog.models[0]!.capabilities.formats, ["wav"]);
  assert.deepEqual(catalog.models[0]!.capabilities.languages, ["zh", "en", "ja"]);
  const manifest = s.services.index.get(pluginId)!.manifest;
  assert.equal(manifest.beta, true);
  assert.deepEqual(manifest.engines, { "ohmygame-api": "^2.32.0" });
  assert.deepEqual(manifest.capabilities, { network: ["127.0.0.1:9880"] });
  assert.equal(manifest.icon, "./assets/icon.svg");
  const result = await s.audio.generate(
    { ...input, language: "en-US", speed: 50 },
    undefined,
    await s.journal(),
  );
  assert.deepEqual(Buffer.from(result.bytes), WAV);
  assert.equal(result.mediaType, "audio/wav");
  assert.equal(s.requests.length, 1);
  const r = s.requests[0]!;
  assert.equal(r.url, "http://127.0.0.1:9880/tts");
  assert.equal(r.method, "POST");
  assert.equal(r.headers.get("authorization"), null);
  assert.deepEqual(r.body, {
    text: input.prompt,
    text_lang: "en",
    ref_audio_path: settings.referencePath,
    prompt_text: settings.referenceText,
    prompt_lang: "zh",
    speed_factor: 1.5,
    media_type: "wav",
    streaming_mode: false,
    batch_size: 1,
    text_split_method: "cut5",
  });
});

it("uses default language, handles Windows paths and validates options before contacting the server", async (t) => {
  const s = await setup(t);
  for (const [id, update] of Object.entries({
    relative: { referencePath: "voice.wav" },
    url: { referencePath: "https://example.test/voice.wav" },
    blank: { referenceText: " " },
    long: { referenceText: "x".repeat(2001) },
  })) {
    await s.services.configure(pluginId, { ...settings, ...update });
    await assert.rejects(
      s.audio.generate(input, undefined, await s.journal(id)),
    );
  }
  await s.services.configure(pluginId, settings);
  for (const [id, extra] of Object.entries({
    language: { language: "fr" },
    mp3: { output: { format: "mp3" } },
    speed: { speed: 101 },
    text: { prompt: "x".repeat(2001) },
  }))
    await assert.rejects(
      s.audio.generate(
        { ...input, ...extra } as AudioGenerationRequest,
        undefined,
        await s.journal(id),
      ),
    );
  assert.equal(s.requests.length, 0);
  await s.services.configure(pluginId, {
    referencePath: "C:\\voices\\reference.wav",
    textLanguage: "ja",
  });
  await s.audio.generate(input, undefined, await s.journal("windows"));
  assert.equal(
    s.requests[0]!.body!.ref_audio_path,
    "C:\\voices\\reference.wav",
  );
  assert.equal(s.requests[0]!.body!.text_lang, "ja");
});

it("requires reference settings and an enabled connection, then restores settings and completed output", async (t) => {
  const s = await setup(t);
  await s.services.configure(pluginId, { referenceText: null });
  await assert.rejects(
    s.audio.generate(input, undefined, await s.journal()),
    /Configure referenceText/,
  );
  assert.equal(s.requests.length, 0);
  await s.services.configure(pluginId, settings);
  await s.services.setEveryProject(pluginId, false);
  await assert.rejects(
    s.audio.generate(input, undefined, await s.journal()),
    /unavailable/,
  );
  await s.services.setEveryProject(pluginId, true);
  await s.audio.generate(input, undefined, await s.journal());
  await s.services.close();
  const { PluginServices } = await load("plugin-services");
  const restored: Services = new PluginServices({
    directory: path.join(s.root, "store"),
  });
  const [{ PluginMediaProviders }, { ProviderAudio }] = await Promise.all([
    load("plugin-media-providers"),
    load("audio-generation"),
  ]);
  const restoredMedia: Media = new PluginMediaProviders(
    restored,
    async () => {
      throw new Error("A confirmed result needs no server request");
    },
    undefined,
    undefined,
    s.root,
  );
  try {
    assert.equal((await restored.everyProject())[0]!.id, pluginId);
    const entry = restored.index.get(pluginId)!;
    const referenceText = restored.values.view(entry).referenceText!;
    assert.notEqual(referenceText.type, "secret");
    assert.ok("value" in referenceText);
    assert.equal(referenceText.value, settings.referenceText);
    const audio: Audio = new ProviderAudio(() =>
      restoredMedia.audioAdapters(() => true),
    );
    assert.deepEqual(
      Buffer.from(
        (await audio.generate(input, undefined, await s.journal())).bytes,
      ),
      WAV,
    );
  } finally {
    await restoredMedia.close();
    await restored.close();
  }
  assert.equal(s.requests.length, 1);
});

it("pins reference settings while synthesis is running and reuses a saved response after an import retry", async (t) => {
  let release!: () => void;
  let submitted!: () => void;
  const reached = new Promise<void>((r) => {
    submitted = r;
  });
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const s = await setup(t, async () => {
    submitted();
    await pending;
    return undefined;
  });
  const generation = s.audio.generate(input, undefined, await s.journal());
  await reached;
  await s.services.configure(pluginId, {
    referencePath: "/server/new.wav",
    referenceText: "changed",
    referenceLanguage: "en",
  });
  release();
  assert.deepEqual(Buffer.from((await generation).bytes), WAV);
  assert.equal(s.requests[0]!.body!.ref_audio_path, settings.referencePath);
  // The caller has not consumed/cleared the receipt (e.g. its canvas import failed).
  await s.services.configure(pluginId, {
    referencePath: null,
    referenceText: null,
  });
  assert.deepEqual(
    Buffer.from(
      (await s.restart().audio.generate(input, undefined, await s.journal()))
        .bytes,
    ),
    WAV,
  );
  assert.equal(s.requests.length, 1);
  await assert.rejects(
    s.audio.generate(input, undefined, await s.journal("new")),
    /Configure reference/,
  );
  assert.equal(s.requests.length, 1);
});

it("does not repeat server failures or a response lost before durable storage", async (t) => {
  for (const failure of ["response", "server", "malformed"]) {
    const s = await setup(t, () => {
      if (failure === "response") throw new Error("lost response");
      if (failure === "server")
        return Response.json(
          { message: "tts failed", Exception: "Reference file missing" },
          { status: 400 },
        );
      return new Response("not audio", {
        headers: { "content-type": "audio/wav" },
      });
    });
    await assert.rejects(
      s.audio.generate(input, undefined, await s.journal()),
      failure === "server"
        ? /Reference file missing/
        : (error: unknown) => error instanceof Error,
    );
    await assert.rejects(
      s.restart().audio.generate(input, undefined, await s.journal()),
      failure === "response"
        ? /response was lost|uncertain/
        : (error: unknown) => error instanceof Error,
    );
    assert.equal(s.requests.length, 1);
  }
});

it("reports interrupted synthesis as uncertain on Stop and shutdown without global server actions", async (t) => {
  for (const shutdown of [false, true]) {
    const controller = new AbortController();
    const s = await setup(t, (r) => {
      controller.abort(
        shutdown ? new s.GenerationShutdown() : new Error("Stopped"),
      );
      return new Promise<Response>((resolve, reject) => {
        if (r.signal?.aborted) reject(r.signal.reason);
        else
          r.signal?.addEventListener("abort", () => reject(r.signal!.reason), {
            once: true,
          });
      });
    });
    await assert.rejects(
      s.audio.generate(input, controller.signal, await s.journal()),
    );
    await assert.rejects(
      s.restart().audio.generate(input, undefined, await s.journal()),
      /response was lost|uncertain/,
    );
    assert.deepEqual(
      s.requests.map((r) => [r.method, r.url]),
      [["POST", "http://127.0.0.1:9880/tts"]],
    );
  }
});
