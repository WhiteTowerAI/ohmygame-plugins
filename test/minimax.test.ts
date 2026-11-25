import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { AudioGenerationRequest, AudioModelCatalog } from "../app/src/shared/audio.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";

const loadApp = (name: string) =>
  import(
    pathToFileURL(
      path.resolve(process.env.OHMYGAME_APP ?? "app", `src/daemon/${name}.ts`),
    ).href
  );
const pluginRoot = fileURLToPath(
  new URL("../plugins/minimax", import.meta.url),
);
const MP4 = Buffer.concat([
  Buffer.from("000000186674797069736f6d", "hex"),
  Buffer.alloc(16),
]);
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(16),
]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "retry-after": "1" },
  });
const done = (url = "https://cdn.hailuoai.com/result.mp4") =>
  json({ task: { id: "task-1", status: "succeeded", content: { url } } });
type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
};
type Reply = (
  request: Request,
) => Response | undefined | Promise<Response | undefined>;

async function setup(t: TestContext, reply?: Reply) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { mediaTaskJournal, GenerationShutdown },
    { ProviderAudio },
  ] = await Promise.all([
    loadApp("plugin-services"),
    loadApp("plugin-media-providers"),
    loadApp("media-task-journal"),
    loadApp("audio-generation"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-minimax-"));
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
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request: Request = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
    };
    requests.push(request);
    const response = await reply?.(request);
    if (response) return response;
    if (request.method === "POST") return json({ task_id: "task-1" });
    if (request.url.startsWith("https://cdn.hailuoai.com/"))
      return new Response(MP4, { headers: { "content-type": "video/mp4" } });
    return done();
  };
  const createMedia = (): Media => {
    const media = new PluginMediaProviders(services, fetcher, undefined, undefined, root);
    instances.push(media);
    return media;
  };
  const media = createMedia();
  await services.configure("ohmygame/minimax", {
    cnApiKey: "cn-test-key",
    globalApiKey: "global-test-key",
  });
  assert.deepEqual(
    await media.videoProviders(),
    [],
    "No providers before capability consent and global enable",
  );
  await services.setEveryProject("ohmygame/minimax", true);
  const providers = await media.videoProviders();
  return {
    root,
    services,
    media,
    providers,
    requests,
    restart: createMedia,
    audio: new ProviderAudio(() => media.audioAdapters(() => true)),
    audioFor: (instance: Media) => new ProviderAudio(() => instance.audioAdapters(() => true)),
    journal: (id = "job-1") => mediaTaskJournal(path.join(root, "tasks"), id),
    GenerationShutdown,
  };
}

it("installs with a logo, isolates regional keys, and downloads without credentials", async (t) => {
  const s = await setup(t);
  assert.equal(s.providers.length, 2);
  assert.equal(
    s.services.index.get("ohmygame/minimax")?.manifest.icon,
    "./assets/icon.svg",
  );
  for (const [index, region] of ["cn", "global"].entries()) {
    const provider = s.providers[index]!;
    assert.equal(provider.id, `plugin.ohmygame.minimax.${region}`);
    assert.deepEqual(
      provider.models.map((m) => m.id),
      ["MiniMax-H3", "MiniMax-H3-Max"],
    );
    const result = await s.media.generateVideo(provider.models[0]!, {
      prompt: "a fox",
    });
    assert.deepEqual(result.bytes, MP4);
    const creation = s.requests.at(-3)!;
    assert.equal(
      creation.url,
      `https://api.minimax.${region === "cn" ? "cn" : "io"}/v2/video_generation`,
    );
    assert.equal(
      creation.headers.get("authorization"),
      `Bearer ${region}-test-key`,
    );
    assert.equal(
      s.requests.at(-2)!.headers.get("authorization"),
      `Bearer ${region}-test-key`,
    );
    assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
    assert.deepEqual(creation.body, {
      model: "MiniMax-H3",
      content: [{ type: "text", text: "a fox" }],
      duration: 4,
      resolution: "768P",
      ratio: "16:9",
    });
  }
  await s.services.configure("ohmygame/minimax", { globalApiKey: null });
  assert.deepEqual(
    (await s.media.videoProviders()).map((p) => p.id),
    ["plugin.ohmygame.minimax.cn"],
  );
  await s.services.setEveryProject("ohmygame/minimax", false);
  assert.deepEqual(await s.media.videoProviders(), []);
});

it("maps first/last frames and nine references with the matching ratio choices", async (t) => {
  const s = await setup(t);
  const model = s.providers[0]!.models[1]!;
  assert.deepEqual(model.frameAspectRatios, ["adaptive"]);
  assert.ok(model.imageAspectRatios?.includes("16:9"));
  await writeFile(path.join(s.root, "ref.png"), PNG);
  const ref = {
    type: "image" as const,
    name: "ref.png",
    mediaType: "image/png",
    absolutePath: path.join(s.root, "ref.png"),
  };
  await s.media.generateVideo(model, { prompt: "fox", references: [ref, ref] });
  const frames = s.requests[0]!.body!;
  assert.equal(frames.model, "MiniMax-H3-Max");
  assert.equal(frames.resolution, "480P");
  assert.equal(frames.duration, 5);
  assert.equal(frames.ratio, "adaptive");
  assert.deepEqual(frames.content, [
    { type: "text", text: "fox" },
    ...["first_frame", "last_frame"].map((role) => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${PNG.toString("base64")}` },
      role,
    })),
  ]);
  await s.media.generateVideo(model, {
    prompt: "fox",
    references: Array(9).fill(ref),
    referenceMode: "reference",
    aspectRatio: "16:9",
  });
  assert.equal(s.requests[3]!.body!.ratio, "16:9");
  assert.deepEqual(
    (s.requests[3]!.body!.content as { role?: string }[])
      .slice(1)
      .map((item) => item.role),
    Array(9).fill("reference_image"),
  );
  const count = s.requests.length;
  await assert.rejects(
    s.media.generateVideo(model, {
      prompt: "fox",
      references: [ref, ref, ref],
    }),
    /up to 2/,
  );
  await assert.rejects(
    s.media.generateVideo(model, {
      prompt: "fox",
      references: Array(10).fill(ref),
      referenceMode: "reference",
    }),
    /up to 9/,
  );
  await assert.rejects(
    s.media.generateVideo(model, { prompt: "fox", aspectRatio: "adaptive" }),
    /aspect ratio/,
  );
  await assert.rejects(
    s.media.generateVideo(model, { prompt: "  " }),
    /Enter a prompt/,
  );
  assert.equal(s.requests.length, count);
});

it("resumes a persisted task after shutdown without another paid start", async (t) => {
  const s = await setup(t);
  const model = s.providers[0]!.models[0]!;
  const controller = new AbortController();
  const pending = s.media.generateVideo(
    model,
    { prompt: "fox" },
    controller.signal,
    await s.journal(),
  );
  const rejected = assert.rejects(pending, s.GenerationShutdown);
  // Abort only after the host saves the task, independently of the POST mock.
  let saved = false;
  for (let n = 0; n < 100 && !saved; n++) {
    saved = await readFile(path.join(s.root, "tasks/job-1.json"), "utf8")
      .then((value) => JSON.parse(value).task?.id === "task-1")
      .catch(() => false);
    if (!saved) await delay(10);
  }
  assert.ok(saved);
  controller.abort(new s.GenerationShutdown());
  await rejected;
  assert.deepEqual(
    (
      await s
        .restart()
        .generateVideo(model, { prompt: "fox" }, undefined, await s.journal())
    ).bytes,
    MP4,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(
    s.requests.some((r) => r.method === "DELETE"),
    false,
  );
});

for (const [name, response] of [
  [
    "server error",
    () =>
      json({ type: "error", error: { message: "upstream unavailable" } }, 500),
  ],
  ["malformed success", () => new Response("not JSON")],
  ["missing task ID", () => json({})],
  [
    "unstructured proxy rejection",
    () => new Response("proxy timed out", { status: 408 }),
  ],
] as const) {
  it(`does not resubmit an ambiguous start after ${name}`, async (t) => {
    const s = await setup(t, (r) =>
      r.method === "POST" ? response() : undefined,
    );
    const model = s.providers[0]!.models[0]!;
    await assert.rejects(
      s.media.generateVideo(
        model,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      ),
    );
    await assert.rejects(
      s
        .restart()
        .generateVideo(model, { prompt: "fox" }, undefined, await s.journal()),
      /may have started.*already/,
    );
    assert.equal(s.requests.length, 1);
  });
}

it("allows retry after a definite rejection and retries transient checks on the same task", async (t) => {
  let starts = 0;
  let checks = 0;
  const s = await setup(t, (r) => {
    if (r.method === "POST" && ++starts === 1)
      return json(
        { type: "error", error: { message: "insufficient balance" } },
        402,
      );
    if (r.url.includes("/query/") && ++checks === 1)
      return json({ error: { message: "busy" } }, 429);
    return undefined;
  });
  const model = s.providers[0]!.models[0]!;
  await assert.rejects(
    s.media.generateVideo(
      model,
      { prompt: "fox" },
      undefined,
      await s.journal(),
    ),
    /insufficient balance/,
  );
  assert.deepEqual(
    (
      await s.media.generateVideo(
        model,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      )
    ).bytes,
    MP4,
  );
  assert.equal(starts, 2);
  assert.equal(checks, 2);
});

it("rejects an ungranted output host and retries the original task to download", async (t) => {
  let query = 0;
  const s = await setup(t, (r) =>
    r.url.includes("/query/") && ++query === 1
      ? done("https://ungranted.example/video.mp4")
      : undefined,
  );
  const model = s.providers[0]!.models[0]!;
  await assert.rejects(
    s.media.generateVideo(
      model,
      { prompt: "fox" },
      undefined,
      await s.journal(),
    ),
    /capabilities.network/,
  );
  assert.equal(
    s.requests.some((r) => r.url.includes("ungranted")),
    false,
  );
  assert.deepEqual(
    (
      await s.media.generateVideo(
        model,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      )
    ).bytes,
    MP4,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
});

it("resumes a locally stopped task without DELETE or another paid submission", async (t) => {
  const controller = new AbortController();
  const s = await setup(t, (r) => {
    if (r.url.includes("/query/") && !controller.signal.aborted) {
      controller.abort(new Error("user stopped"));
      return json({ task: { id: "task-1", status: "running" } });
    }
    return undefined;
  });
  await assert.rejects(
    s.media.generateVideo(
      s.providers[0]!.models[0]!,
      { prompt: "fox" },
      controller.signal,
      await s.journal(),
    ),
    /user stopped/,
  );
  assert.equal(
    s.requests.some((r) => r.method === "DELETE"),
    false,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(
    await readFile(path.join(s.root, "tasks/job-1.json"))
      .then(() => true)
      .catch(() => false),
    true,
  );
  assert.deepEqual(
    (
      await s.media.generateVideo(
        s.providers[0]!.models[0]!,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      )
    ).bytes,
    MP4,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(
    s.requests.some((r) => r.method === "DELETE"),
    false,
  );
});

for (const status of ["failed", "cancelled"]) {
  it(`reports a terminal ${status} task without downloading or resubmitting`, async (t) => {
    const s = await setup(t, (r) =>
      r.url.includes("/query/")
        ? json({ task: { id: "task-1", status } })
        : undefined,
    );
    await assert.rejects(
      s.media.generateVideo(
        s.providers[0]!.models[0]!,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      ),
      new RegExp(`task ${status}`),
    );
    assert.equal(s.requests.length, 2);
    assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  });
}

it("keeps checking the same job through queued, running and malformed replies", async (t) => {
  let checks = 0;
  const s = await setup(t, (r) => {
    if (!r.url.includes("/query/")) return undefined;
    switch (++checks) {
      case 1:
        return json({ task: { id: "task-1", status: "queued" } });
      case 2:
        return json({ task: { id: "task-1", status: "running" } });
      case 3:
        return json({
          task: {
            id: "another-task",
            status: "succeeded",
            content: { url: "https://cdn.hailuoai.com/wrong.mp4" },
          },
        });
      default:
        return done();
    }
  });
  assert.deepEqual(
    (
      await s.media.generateVideo(
        s.providers[0]!.models[0]!,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      )
    ).bytes,
    MP4,
  );
  assert.equal(checks, 4);
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(
    s.requests.some((r) => r.url.endsWith("wrong.mp4")),
    false,
  );
});


function speechWav(channels = 1) {
  const bytes = Buffer.alloc(44 + 3200 * channels);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000 * channels, 28); bytes.writeUInt16LE(2 * channels, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
const speechInput = (region = "cn", model = "speech-2.8-hd"): AudioGenerationRequest => ({
  model: { provider: `plugin.ohmygame.minimax.${region}`, id: model },
  prompt: "Hello 世界", voiceId: "English_Graceful_Lady", output: { format: "wav", sampleRate: 16000, channels: 1 },
});
const speechReply = (audio = speechWav().toString("hex")) => json({ data: { audio, status: 2 }, base_resp: { status_code: 0, status_msg: "success" }, trace_id: "speech-trace", extra_info: { usage_characters: 8, audio_length: 100 } });

it("adds regional speech without changing video IDs or sending keys to another region", async t => {
  const s = await setup(t, req => req.url.endsWith("/v1/t2a_v2") ? speechReply() : undefined);
  const catalog: AudioModelCatalog = await s.audio.catalog();
  assert.equal(catalog.models.length, 4);
  assert.ok(catalog.models.every(model => model.capabilities.maxTextCharacters === 9999));
  for (const [region, model] of [["cn", "speech-2.8-hd"], ["global", "speech-2.8-turbo"]]) {
    const result = await s.audio.generate({ ...speechInput(region, model), speed: 50, pitch: -2, volume: 25 }, undefined, await s.journal(region));
    assert.ok(Buffer.from(result.bytes).equals(speechWav()));
    assert.equal(result.metadata.usageCharacters, 8);
    assert.equal(result.metadata.providerRequestId, "speech-trace");
    const sent = s.requests.at(-1)!;
    assert.equal(sent.url, `https://api.minimax.${region === "cn" ? "cn" : "io"}/v1/t2a_v2`);
    assert.equal(sent.headers.get("authorization"), `Bearer ${region}-test-key`);
    assert.deepEqual(sent.body, { model, text: "Hello 世界", stream: false, output_format: "hex", language_boost: "auto", voice_setting: { voice_id: "English_Graceful_Lady", speed: 1.5, pitch: -2, vol: 1.25 }, audio_setting: { format: "wav", sample_rate: 16000, channel: 1 } });
  }
  assert.deepEqual(s.providers[0]!.models.map(model => model.id), ["MiniMax-H3", "MiniMax-H3-Max"]);
});

it("recovers confirmed speech without resubmission and refuses changed credentials or requests", async t => {
  const s = await setup(t, () => speechReply());
  await s.audio.generate(speechInput(), undefined, await s.journal());
  const next = s.audioFor(s.restart());
  assert.ok(Buffer.from((await next.generate(speechInput(), undefined, await s.journal())).bytes).equals(speechWav()));
  assert.equal(s.requests.length, 1);
  await assert.rejects(next.generate({ ...speechInput(), prompt: "changed" }, undefined, await s.journal()), /request changed/);
  await s.services.configure("ohmygame/minimax", { cnApiKey: "another-account" });
  await assert.rejects(next.generate(speechInput(), undefined, await s.journal()), /key or the request changed/);
  assert.equal(s.requests.length, 1);
  const receipt = await readFile(path.join(s.root, "tasks/job-1.json"), "utf8");
  assert.ok(receipt.length < 4096);
  assert.ok(!receipt.includes("cn-test-key"));
});

it("keeps business failures, malformed hex and lost speech responses from becoming new paid calls", async t => {
  for (const failure of ["lost", "quota", "odd", "invalid", "incomplete"] as const) {
    const s = await setup(t, () => {
      if (failure === "lost") throw new Error("lost");
      if (failure === "quota") return json({ base_resp: { status_code: 1008, status_msg: "quota cn-test-key" }, data: null });
      if (failure === "incomplete") return json({ base_resp: { status_code: 0 }, data: { audio: speechWav().toString("hex"), status: 1 } });
      return speechReply(failure === "odd" ? "001" : "01zz");
    });
    const error = await s.audio.generate(speechInput(), undefined, await s.journal()).catch((cause: unknown) => cause);
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes("cn-test-key"));
    if (failure === "quota") assert.match(error.message, /quota \[key\]/);
    await assert.rejects(s.audioFor(s.restart()).generate(speechInput(), undefined, await s.journal()));
    assert.equal(s.requests.length, 1);
  }
});

it("rejects unsupported speech input before submission and accepts explicit stereo", async t => {
  const s = await setup(t, () => speechReply(speechWav(2).toString("hex")));
  for (const bad of [{ prompt: "x".repeat(10000) }, { voiceId: undefined }, { speed: 101 }, { output: { format: "wav", sampleRate: 48000 } }, { output: { format: "ogg_opus" } }]) {
    await assert.rejects(s.audio.generate({ ...speechInput(), ...bad } as AudioGenerationRequest));
  }
  assert.equal(s.requests.length, 0);
  const result = await s.audio.generate({ ...speechInput(), output: { format: "wav", sampleRate: 16000, channels: 2 } }, undefined, await s.journal());
  assert.ok(Buffer.from(result.bytes).equals(speechWav(2)));
  assert.equal((s.requests[0]!.body!.audio_setting as { channel: number }).channel, 2);
});

it("searches reviewed system presets without making a POST voice lookup", async t => {
  const s = await setup(t);
  const all = await s.audio.voices("plugin.ohmygame.minimax.cn", {});
  assert.equal(all.voices.length, 6);
  const search = await s.audio.voices("plugin.ohmygame.minimax.global", { search: "机械" });
  assert.equal(search.voices[0]!.id, "Robot_Armor");
  assert.equal(search.nextPageToken, undefined);
  await assert.rejects(s.audio.voices("plugin.ohmygame.minimax.cn", { pageToken: "next" }), /no next page/);
  assert.equal(s.requests.length, 0);
});


it("returns MP3 bytes and maps the slow/quiet speech boundaries", async t => {
  const bytes = Buffer.concat(Array.from({ length: 10 }, () => { const frame = Buffer.alloc(417); frame.set([0xff, 0xfb, 0x90, 0xc0]); return frame; }));
  const s = await setup(t, () => speechReply(bytes.toString("hex")));
  const result = await s.audio.generate({ ...speechInput(), output: { format: "mp3", sampleRate: 44100 }, speed: -50, volume: -50, pitch: 12 }, undefined, await s.journal());
  assert.ok(Buffer.from(result.bytes).equals(bytes));
  assert.deepEqual(s.requests[0]!.body!.voice_setting, { voice_id: "English_Graceful_Lady", speed: 0.5, vol: 0.5, pitch: 12 });
});
