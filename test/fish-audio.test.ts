import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";
import type { AudioGenerationRequest, AudioModelCatalog } from "../app/src/shared/audio.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const pluginRoot = fileURLToPath(
  new URL("../plugins/fish-audio", import.meta.url),
);
// MPEG-1 mono, 128 kbps at 44.1 kHz: synthetic demuxable silence, no vendor audio.
const MP3 = Buffer.concat(
  Array.from({ length: 10 }, () => {
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0xc0]);
    return frame;
  }),
);
const provider = "plugin.ohmygame.fish-audio.fish-audio";
const input = (id = "s2.1-pro"): AudioGenerationRequest => ({
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
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-fish-audio-"));
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
  await services.configure("ohmygame/fish-audio", {
    apiKey: "fish-audio-test-key",
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
          "request-id": `fish-request-${requests.length}`,
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
  await services.setEveryProject("ohmygame/fish-audio", true);
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


it("installs two Beta speech models and an actual logo, then sends the chosen model and prosody", async (t) => {
  const s = await setup(t);
  const catalog: AudioModelCatalog = await s.audio.catalog();
  assert.deepEqual(catalog.models.map(m => m.id), ["s2.1-pro", "s2.1-pro-free"]);
  assert.ok(catalog.models.every(m => m.capabilities.produces.join() === "speech"));
  const manifest = s.services.index.get("ohmygame/fish-audio")!.manifest;
  assert.equal(manifest.beta, true);
  assert.equal(manifest.icon, "./assets/icon.png");
  assert.ok((await readFile(path.join(pluginRoot, "assets/icon.png"))).length > 1000);
  for (const model of ["s2.1-pro", "s2.1-pro-free"]) {
    const result = await s.audio.generate({ ...input(model), speed: 50 }, undefined, await s.journal(model.replaceAll(".", "-")));
    assert.ok(Buffer.from(result.bytes).equals(MP3));
    const sent = s.requests.at(-1)!;
    assert.equal(sent.url, "https://api.fish.audio/v1/tts");
    assert.equal(sent.headers.get("authorization"), "Bearer fish-audio-test-key");
    assert.equal(sent.headers.get("model"), model);
    assert.deepEqual(sent.body, { text: "Hello 世界", reference_id: "voice_one", format: "mp3", sample_rate: 44100, prosody: { speed: 1.5 } });
  }
});

it("requires an explicit voice and rejects unsupported output before sending", async t => {
  const s = await setup(t);
  await assert.rejects(s.audio.generate({ ...input(), voiceId: undefined }, undefined, await s.journal("missing")), /voice/i);
  for (const bad of [{ output: { format: "ogg_opus" } }, { output: { format: "mp3", sampleRate: 48000 } }, { output: { format: "mp3", channels: 2 } }, { speed: 101 }]) {
    await assert.rejects(s.audio.generate({ ...input(), ...bad } as AudioGenerationRequest, undefined, await s.journal("bad")));
  }
  assert.equal(s.requests.length, 0);
});

it("stores a WAV response without changing its bytes or requested sample rate", async t => {
  const bytes = Buffer.alloc(44 + 3200);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(3200, 40);
  const s = await setup(t, () => new Response(bytes, { headers: { "content-type": "audio/wav" } }));
  const result = await s.audio.generate({ ...input(), output: { format: "wav", sampleRate: 16000 } }, undefined, await s.journal());
  assert.ok(Buffer.from(result.bytes).equals(bytes));
  assert.equal(s.requests[0]!.body!.sample_rate, 16000);
});

it("recovers confirmed audio after restart without charging again and refuses a changed account", async t => {
  const s = await setup(t);
  await s.audio.generate(input(), undefined, await s.journal());
  const next = s.restart();
  const result = await next.audio.generate(input(), undefined, await s.journal());
  assert.ok(Buffer.from(result.bytes).equals(MP3));
  assert.equal(s.requests.length, 1);
  await assert.rejects(next.audio.generate({ ...input(), prompt: "changed" }, undefined, await s.journal()), /request changed/);
  await s.services.configure("ohmygame/fish-audio", { apiKey: "other-account" });
  await assert.rejects(next.audio.generate(input(), undefined, await s.journal()), /key or the request changed/);
  assert.equal(s.requests.length, 1);
  assert.ok(!(await readFile(path.join(s.root, "tasks/generation.json"), "utf8")).includes("fish-audio-test-key"));
});

it("never resubmits a lost speech response or a quota rejection, and redacts credentials", async t => {
  for (const lost of [true, false]) {
    const s = await setup(t, () => {
      if (lost) throw new Error("lost");
      return Response.json({ message: "quota fish-audio-test-key" }, { status: 402 });
    });
    await assert.rejects(s.audio.generate(input(), undefined, await s.journal()), lost ? /could not be reached/ : /quota \[key\]/);
    await assert.rejects(s.restart().audio.generate(input(), undefined, await s.journal()), lost ? /response was lost/ : /quota \[key\]/);
    assert.equal(s.requests.length, 1);
  }
});

it("searches workspace then public voices and preserves an ID outside the selected page", async t => {
  const voice = (id: string) => ({ _id: id, title: "中文 " + id, type: "tts", state: "trained" });
  const s = await setup(t, req => {
    if (!req.url.includes("/model?")) return undefined;
    const q = new URL(req.url).searchParams;
    return Response.json(q.get("self") === "true" ? { total: 1, items: [voice("own")], has_more: false } : { total: 60, items: [voice("public")], has_more: q.get("page_number") === "1" });
  });
  const own = await s.audio.voices(provider, { search: "中文 & voice" });
  assert.equal(own.voices[0]!.id, "own");
  assert.equal(own.nextPageToken, "public:1");
  assert.equal(new URL(s.requests[0]!.url).searchParams.get("title"), "中文 & voice");
  const publicPage = await s.audio.voices(provider, { pageToken: own.nextPageToken });
  assert.equal(publicPage.voices[0]!.id, "public");
  assert.equal(publicPage.nextPageToken, "public:2");
  const last = await s.audio.voices(provider, { pageToken: publicPage.nextPageToken });
  assert.equal(last.nextPageToken, undefined);
  await s.audio.generate({ ...input(), voiceId: "not_in_page" }, undefined, await s.journal());
  assert.equal(s.requests.at(-1)!.body!.reference_id, "not_in_page");
});

it("shows public voices for an empty workspace and rejects invalid pagination", async t => {
  const s = await setup(t, req => Response.json(new URL(req.url).searchParams.get("self") === "true" ? { total: 0, items: [], has_more: false } : { total: 1, items: [{ _id: "ready", title: "Ready", type: "tts", state: "trained" }], has_more: false }));
  assert.equal((await s.audio.voices(provider, {})).voices[0]!.id, "ready");
  assert.equal(s.requests.length, 2);
  await assert.rejects(s.audio.voices(provider, { pageToken: "public:1&self=true" }), /Invalid Fish Audio voice page/);
  assert.equal(s.requests.length, 2);
});

it("refuses unknown model headers instead of allowing Fish's paid fallback", async () => {
  const adapter = (await import(pathToFileURL(path.join(pluginRoot, "media/adapter.js")).href)).default;
  let calls = 0;
  const result = await adapter.audio.start({ model: "s2.1-pro-fre", voiceId: "voice", format: "mp3", prompt: "Hello" }, { submit: () => { calls++; } });
  assert.match(result.error, /unavailable/);
  assert.equal(calls, 0);
});


it("filters unavailable voices and respects the accessible pagination window", async t => {
  const s = await setup(t, () => Response.json({
    total: 1000, accessible_upper_bound: 50,
    items: [
      { _id: "ready", title: "Ready", type: "tts", state: "trained" },
      { _id: "training", title: "Training", type: "tts", state: "training" },
      { _id: "svc", title: "Conversion", type: "svc", state: "trained" },
      { _id: "taken", title: "Removed", type: "tts", state: "trained", dmca_taken_down: true },
    ],
  }));
  const page = await s.audio.voices(provider, { pageToken: "public:1" });
  assert.deepEqual(page.voices.map((voice: { id: string }) => voice.id), ["ready"]);
  assert.equal(page.nextPageToken, undefined);
});

it("rejects malformed voice responses without inventing a next page", async t => {
  for (const body of [null, { items: [null], total: 1 }, { items: [], total: 1, has_more: true }]) {
    const s = await setup(t, () => Response.json(body));
    await assert.rejects(s.audio.voices(provider, {}), /invalid.*voice/i);
    assert.equal(s.requests.length, 1);
  }
});
