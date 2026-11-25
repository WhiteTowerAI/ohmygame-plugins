import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";
import type { ProviderAudio as Audio } from "../app/src/daemon/audio-generation.js";

const loadApp = (name: string) =>
  import(
    pathToFileURL(
      path.resolve(process.env.OHMYGAME_APP ?? "app", `src/daemon/${name}.ts`),
    ).href
  );
const pluginRoot = fileURLToPath(new URL("../plugins/fal", import.meta.url));
const model = { provider: "plugin.ohmygame.fal.fal", id: "fal-ai/birefnet" };
const queue = "https://queue.fal.run/fal-ai/birefnet/requests/paid";
const json = (body: unknown, status = 200) => Response.json(body, { status });
type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
};

async function setup(
  t: TestContext,
  reply?: (
    request: Request,
  ) => Response | undefined | Promise<Response | undefined>,
) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { mediaTaskJournal, GenerationShutdown },
    { default: sharp },
    { ProviderAudio },
    { PluginMediaModelChoices },
  ] = await Promise.all([
    loadApp("plugin-services"),
    loadApp("plugin-media-providers"),
    loadApp("media-task-journal"),
    import(
      pathToFileURL(
        createRequire(
          path.resolve(process.env.OHMYGAME_APP ?? "app", "package.json"),
        ).resolve("sharp"),
      ).href
    ),
    loadApp("audio-generation"),
    loadApp("plugin-media-models"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-fal-cutout-"));
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
  await services.configure("ohmygame/fal", { apiKey: "test-fal-key" });
  const source = await sharp(
    Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255,
    ]),
    { raw: { width: 2, height: 2, channels: 4 } },
  )
    .png()
    .toBuffer();
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
    if (request.method === "POST")
      return json({
        request_id: "paid",
        status_url: queue + "/status",
        response_url: queue,
        cancel_url: queue + "/cancel",
      });
    if (request.url.endsWith("/status")) return json({ status: "COMPLETED" });
    if (request.url === queue)
      return json({ image: { url: "https://v3.fal.media/result.png" } });
    if (request.url === "https://v3.fal.media/result.png")
      return new Response(source, { headers: { "content-type": "image/png" } });
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  };
  const restart = (): Media => {
    const media = new PluginMediaProviders(
      services,
      fetcher,
      undefined,
      new PluginMediaModelChoices(root),
      root,
    );
    instances.push(media);
    return media;
  };
  const media = restart();
  assert.deepEqual(await media.backgroundRemovalModels(), []);
  await services.setEveryProject("ohmygame/fal", true);
  return {
    root,
    services,
    media,
    audio: (instance = media): Audio =>
      new ProviderAudio(() => instance.audioAdapters(() => true)),
    restart,
    source,
    requests,
    sharp,
    GenerationShutdown,
    journal: () => mediaTaskJournal(path.join(root, "tasks"), "cutout"),
  };
}

it("uses a dedicated queue and original-sized alpha without changing generation choices or grants", async (t) => {
  const s = await setup(t);
  assert.deepEqual(await s.media.backgroundRemovalModels(), [
    { ...model, name: "BiRefNet", providerName: "fal.ai" },
  ]);
  assert.deepEqual(
    (await s.media.imageProviders())[0]!.models.map((m) => m.id),
    ["fal-ai/flux/schnell"],
  );
  const result = await s.media.removeBackground(
    model,
    s.source,
    undefined,
    await s.journal(),
  );
  const submission = s.requests.find((r) => r.method === "POST")!;
  assert.equal(submission.url, "https://queue.fal.run/fal-ai/birefnet");
  assert.deepEqual(
    { ...submission.body, image_url: "snapshot" },
    {
      image_url: "snapshot",
      output_format: "png",
      sync_mode: false,
      refine_foreground: false,
      model: "General Use (Light)",
      operating_resolution: "1024x1024",
    },
  );
  assert.match(String(submission.body!.image_url), /^data:image\/png;base64,/);
  assert.equal(submission.headers.get("authorization"), "Key test-fal-key");
  assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
  const decoded = await s
    .sharp(result.bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 2);
  assert.equal(decoded.info.height, 2);
  assert.deepEqual(
    [...decoded.data],
    [255, 0, 0, 255, 0, 255, 0, 64, 0, 0, 255, 0, 255, 255, 255, 255],
  );
  assert.equal(s.services.index.get("ohmygame/fal")!.manifest.beta, true);
  assert.equal(
    s.services.index.get("ohmygame/fal")!.manifest.icon,
    "./assets/icon.svg",
  );
  assert.deepEqual(
    s.services.index.get("ohmygame/fal")!.manifest.capabilities!.network,
    [
      "queue.fal.run",
      "api.fal.ai",
      "fal.media",
      "v2.fal.media",
      "v3.fal.media",
      "v3b.fal.media",
    ],
  );
});

it("retains an interrupted download and resumes the original result after restart", async (t) => {
  let offline = true;
  const s = await setup(t, (r) => {
    if (offline && r.url.endsWith("result.png")) throw new Error("offline");
    return undefined;
  });
  await assert.rejects(
    s.media.removeBackground(model, s.source, undefined, await s.journal()),
    /downloaded/,
  );
  offline = false;
  await s
    .restart()
    .removeBackground(model, s.source, undefined, await s.journal());
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
});

it("stops locally without cancelling the paid task and resumes its status", async (t) => {
  const controller = new AbortController();
  let stop = true;
  const s = await setup(t, (r) => {
    if (stop && r.url.endsWith("/status")) {
      controller.abort();
      return json({ status: "IN_PROGRESS" });
    }
  });
  await assert.rejects(
    s.media.removeBackground(
      model,
      s.source,
      controller.signal,
      await s.journal(),
    ),
  );
  assert.equal(s.requests.filter((r) => r.method === "PUT").length, 0);
  stop = false;
  await s
    .restart()
    .removeBackground(model, s.source, undefined, await s.journal());
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
});

it("does not replace a submission whose response was lost", async (t) => {
  const s = await setup(t, (r) => {
    if (r.method === "POST") throw new Error("lost response");
    return undefined;
  });
  await assert.rejects(
    s.media.removeBackground(model, s.source, undefined, await s.journal()),
  );
  await assert.rejects(
    s.restart().removeBackground(model, s.source, undefined, await s.journal()),
    /may have started.*answer was lost/i,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
});

// Official fal OpenAPI, fetched 2026-11-16 from:
// https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/stable-audio-25/text-to-audio
const stableEndpoint = "fal-ai/stable-audio-25/text-to-audio";
const stableModel = { provider: model.provider, id: "stable-audio-25" };
const stableQueue =
  "https://queue.fal.run/fal-ai/stable-audio-25/requests/audio";
const stableInput = {
  model: stableModel,
  prompt: "安静森林中的鸟鸣 / forest ambience",
  durationSeconds: 190,
  output: { format: "wav" as const },
};
const wav = Buffer.alloc(44 + 3200);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(3200, 40);

function audioReply(r: Request) {
  if (r.method === "POST")
    return json({
      request_id: "audio",
      status_url: stableQueue + "/status",
      response_url: stableQueue,
      cancel_url: stableQueue + "/cancel",
    });
  if (r.url === stableQueue + "/status") return json({ status: "COMPLETED" });
  if (r.url === stableQueue)
    return json({
      audio: { url: "https://v3.fal.media/result.wav" },
      seed: 123,
    });
  if (r.url === "https://v3.fal.media/result.wav")
    return new Response(wav, { headers: { "content-type": "audio/wav" } });
}

it("offers Stable Audio 2.5 without replacing the old preset and preserves WAV bytes", async (t) => {
  const s = await setup(t, audioReply);
  const models = (await s.audio().catalog()).models;
  const old = models.find((m) => m.id === "fal-ai/stable-audio")!;
  const current = models.find((m) => m.id === stableModel.id)!;
  assert.equal(old.capabilities.maxDurationSeconds, 47);
  assert.deepEqual(current.capabilities.formats, ["wav"]);
  assert.deepEqual(current.capabilities.produces, ["sound-effect", "music"]);
  assert.equal(current.capabilities.minDurationSeconds, 1);
  assert.equal(current.capabilities.maxDurationSeconds, 190);
  assert.ok(
    !current.capabilities.supportsLoop &&
      !current.capabilities.supportsInstrumental,
  );
  const result = await s
    .audio()
    .generate(stableInput, undefined, await s.journal());
  assert.equal(result.mediaType, "audio/wav");
  assert.deepEqual(Buffer.from(result.bytes), wav);
  const sent = s.requests.find((r) => r.method === "POST")!;
  assert.equal(sent.url, "https://queue.fal.run/" + stableEndpoint);
  assert.deepEqual(sent.body, {
    prompt: stableInput.prompt,
    seconds_total: 190,
    sync_mode: false,
  });
  assert.equal(sent.headers.get("authorization"), "Key test-fal-key");
  assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
});

it("rejects out-of-range/fractional duration and MP3 before queueing", async (t) => {
  const s = await setup(t, audioReply);
  for (const durationSeconds of [0, 191, 1.5]) {
    await assert.rejects(
      s
        .audio()
        .generate(
          { ...stableInput, durationSeconds },
          undefined,
          await s.journal(),
        ),
      /seconds|integer/,
    );
  }
  await assert.rejects(
    s
      .audio()
      .generate(
        { ...stableInput, output: { format: "mp3" } },
        undefined,
        await s.journal(),
      ),
    /mp3/,
  );
  assert.equal(s.requests.length, 0);
  await s
    .audio()
    .generate(
      { ...stableInput, durationSeconds: 1 },
      undefined,
      await s.journal(),
    );
  assert.equal(
    s.requests.find((r) => r.method === "POST")!.body!.seconds_total,
    1,
  );
});

it("projects the real Stable Audio 2.5 schema as WAV without guessing other model formats", async (t) => {
  const openapi = JSON.parse(
    await readFile(
      new URL("fixtures/fal-stable-audio-25.json", import.meta.url),
      "utf8",
    ),
  );
  const s = await setup(t, (r) => {
    if (r.url.startsWith("https://api.fal.ai/v1/models?"))
      return json({
        models:
          new URL(r.url).searchParams.get("category") === "text-to-audio"
            ? [
                { endpoint_id: stableEndpoint, openapi },
                { endpoint_id: "other/text-to-audio", openapi },
              ]
            : [],
        has_more: false,
      });
    return audioReply(r);
  });
  await s.media.listModels(model.provider, "audio", true);
  await s.media.setModelsShown(
    model.provider,
    "audio",
    [stableEndpoint, "other/text-to-audio"],
    true,
  );
  const catalog = (await s.audio().catalog()).models;
  assert.deepEqual(
    catalog.find((m) => m.id === stableEndpoint)!.capabilities.formats,
    ["wav"],
  );
  assert.equal(
    catalog.find((m) => m.id === stableEndpoint)!.capabilities
      .maxDurationSeconds,
    190,
  );
  assert.deepEqual(
    catalog.find((m) => m.id === "other/text-to-audio")!.capabilities.formats,
    ["mp3"],
  );
  await s.audio().generate(
    {
      ...stableInput,
      model: { provider: model.provider, id: stableEndpoint },
    },
    undefined,
    await s.journal(),
  );
  assert.deepEqual(s.requests.find((r) => r.method === "POST")!.body, {
    prompt: stableInput.prompt,
    seconds_total: 190,
    sync_mode: false,
  });
});

it("keeps the new audio task on Stop and on app shutdown, and resumes without another submission", async (t) => {
  for (const shutdown of [false, true]) {
    const controller = new AbortController();
    let stop = true;
    const s = await setup(t, (r) => {
      if (stop && r.url.endsWith("/status")) {
        controller.abort(shutdown ? new s.GenerationShutdown() : undefined);
        return json({ status: "IN_PROGRESS" });
      }
      return audioReply(r);
    });
    await assert.rejects(
      s.audio().generate(stableInput, controller.signal, await s.journal()),
    );
    assert.equal(s.requests.filter((r) => r.method === "PUT").length, 0);
    stop = false;
    const restored = await s
      .audio(s.restart())
      .generate(stableInput, undefined, await s.journal());
    assert.deepEqual(Buffer.from(restored.bytes), wav);
    assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  }
});

it("recovers audio download failures and refuses changed inputs/accounts or a lost submission", async (t) => {
  let offline = true;
  const s = await setup(t, (r) => {
    if (offline && r.url.endsWith("result.wav")) throw new Error("offline");
    return audioReply(r);
  });
  await assert.rejects(
    s.audio().generate(stableInput, undefined, await s.journal()),
    /download/,
  );
  offline = false;
  await s
    .audio(s.restart())
    .generate(stableInput, undefined, await s.journal());
  await assert.rejects(
    s
      .audio()
      .generate(
        { ...stableInput, durationSeconds: 10 },
        undefined,
        await s.journal(),
      ),
    /request changed/,
  );
  await s.services.configure("ohmygame/fal", { apiKey: "different-key" });
  await assert.rejects(
    s.audio().generate(stableInput, undefined, await s.journal()),
    /key or the request changed/,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  const lost = await setup(t, (r) => {
    if (r.method === "POST") throw new Error("lost response");
    return audioReply(r);
  });
  await assert.rejects(
    lost.audio().generate(stableInput, undefined, await lost.journal()),
  );
  await assert.rejects(
    lost
      .audio(lost.restart())
      .generate(stableInput, undefined, await lost.journal()),
    /may have started.*answer was lost/i,
  );
  assert.equal(lost.requests.filter((r) => r.method === "POST").length, 1);
});

it("preserves saved discovery definitions, hidden presets and a pre-upgrade task identity", async (t) => {
  const s = await setup(t, audioReply);
  // Representative persisted 0.3.0 definition: MP3 was a fallback label, not
  // a requested conversion. Its existing task must still load with that identity.
  const data = {
    prompt: "prompt",
    fixed: {},
    dur: { f: "seconds_total", ms: false },
    out: [["audio", "url"]],
  };
  const saved = {
    id: stableEndpoint,
    kinds: ["sound-effect" as const, "music" as const],
    formats: ["mp3" as const],
    minDurationSeconds: 1,
    maxDurationSeconds: 190,
    data,
  };
  const choicesFile = path.join(s.root, "plugin-media-models.json");
  const choicesText = JSON.stringify({
    version: 2,
    providers: {
      [model.provider]: {
        audio: { added: [saved], hidden: ["fal-ai/stable-audio"] },
      },
    },
  });
  await writeFile(choicesFile, choicesText);
  const journal = await s.journal();
  await journal.begin({
    plugin: "ohmygame/fal",
    provider: "fal",
    account: createHash("sha256")
      .update("test-fal-key")
      .digest("hex")
      .slice(0, 16),
    kind: "audio",
    input: {
      model: stableEndpoint,
      kind: "sound-effect",
      prompt: stableInput.prompt,
      format: "mp3",
      durationSeconds: 190,
      modelData: data,
    },
  });
  await journal.save({
    status: stableQueue + "/status",
    result: stableQueue,
    cancel: stableQueue + "/cancel",
    out: [["audio", "url"]],
  });
  journal.release();
  const next = s.restart();
  const result = await s.audio(next).generate(
    {
      ...stableInput,
      model: { provider: model.provider, id: stableEndpoint },
      output: undefined,
    },
    undefined,
    await s.journal(),
  );
  assert.deepEqual(Buffer.from(result.bytes), wav);
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 0);
  assert.equal(await readFile(choicesFile, "utf8"), choicesText);
  const catalog = (await s.audio(next).catalog()).models;
  assert.ok(catalog.some((m) => m.id === stableModel.id));
  assert.ok(!catalog.some((m) => m.id === "fal-ai/stable-audio"));
  assert.equal(s.services.index.get("ohmygame/fal")!.manifest.beta, true);
});

it("leaves the existing default and 47-second queue mapping unchanged", async (t) => {
  const s = await setup(t, audioReply);
  await s
    .audio()
    .generate(
      { kind: "music", prompt: "Old selection", durationSeconds: 5 },
      undefined,
      await s.journal(),
    );
  const sent = s.requests.find((r) => r.method === "POST")!;
  assert.equal(sent.url, "https://queue.fal.run/fal-ai/stable-audio");
  assert.deepEqual(sent.body, { prompt: "Old selection", seconds_total: 5 });
});

it("does not resubmit an accepted audio response without a task, or a malformed audio result", async (t) => {
  const unreadable = await setup(t, (r) =>
    r.method === "POST" ? json({ request_id: "audio" }) : audioReply(r),
  );
  await assert.rejects(
    unreadable
      .audio()
      .generate(stableInput, undefined, await unreadable.journal()),
    /no request to follow/,
  );
  await assert.rejects(
    unreadable
      .audio(unreadable.restart())
      .generate(stableInput, undefined, await unreadable.journal()),
    /may have started.*answer was lost/i,
  );
  assert.equal(
    unreadable.requests.filter((r) => r.method === "POST").length,
    1,
  );
  const malformed = await setup(t, (r) =>
    r.url.endsWith("result.wav")
      ? new Response("not audio", { headers: { "content-type": "audio/wav" } })
      : audioReply(r),
  );
  for (const media of [malformed.media, malformed.restart()])
    await assert.rejects(
      malformed
        .audio(media)
        .generate(stableInput, undefined, await malformed.journal()),
    );
  assert.equal(malformed.requests.filter((r) => r.method === "POST").length, 1);
});
