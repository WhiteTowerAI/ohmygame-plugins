import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";

const loadApp = (name: string) =>
  import(
    pathToFileURL(
      path.resolve(process.env.OHMYGAME_APP ?? "app", `src/daemon/${name}.ts`),
    ).href
  );
const pluginRoot = fileURLToPath(
  new URL("../plugins/seedance", import.meta.url),
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
const done = (
  url = "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/result.mp4",
) => json({ id: "task-1", status: "succeeded", content: { video_url: url } });
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
  ] = await Promise.all([
    loadApp("plugin-services"),
    loadApp("plugin-media-providers"),
    loadApp("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-seedance-"));
  const services: Services = new PluginServices({
    directory: path.join(root, "store"),
  });
  t.after(async () => {
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
    if (request.url.endsWith("/images/generations"))
      return json({ data: [{ b64_json: PNG.toString("base64") }] });
    if (request.method === "POST") return json({ id: "task-1" });
    if (request.url.includes(".tos-"))
      return new Response(MP4, { headers: { "content-type": "video/mp4" } });
    return done(
      request.url.includes("bytepluses.com")
        ? "https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/result.mp4"
        : undefined,
    );
  };
  const media: Media = new PluginMediaProviders(services, fetcher);
  await services.configure("ohmygame/seedance", {
    arkApiKey: "ark-test-key",
    byteplusApiKey: "byteplus-test-key",
  });
  assert.deepEqual(
    await media.videoProviders(),
    [],
    "No providers before capability consent and global enable",
  );
  await services.setEveryProject("ohmygame/seedance", true);
  const providers = await media.videoProviders();
  return {
    root,
    services,
    media,
    providers,
    requests,
    restart: (): Media => new PluginMediaProviders(services, fetcher),
    journal: () => mediaTaskJournal(path.join(root, "tasks"), "job-1"),
    GenerationShutdown,
  };
}

it("shares Ark image/video credentials, isolates BytePlus and downloads without keys", async (t) => {
  const largeImage = Buffer.concat([PNG, Buffer.alloc(8 * 1024 * 1024)]);
  const s = await setup(t, (r) =>
    r.url.endsWith("/images/generations")
      ? json({ data: [{ b64_json: largeImage.toString("base64") }] })
      : undefined,
  );
  assert.equal(s.services.index.get("ohmygame/seedance")?.manifest.beta, true);
  assert.equal(s.providers.length, 2);
  const images = await s.media.imageProviders();
  assert.deepEqual(
    images.map((p) => p.id),
    ["plugin.ohmygame.seedance.ark"],
  );
  assert.equal(images[0]!.models.length, 3);
  assert.deepEqual(
    (
      await s.media.generateImage(images[0]!.models[0]!, {
        prompt: "fox",
        resolution: "2K",
        aspectRatio: "16:9",
      })
    ).bytes,
    largeImage,
  );
  assert.equal(
    s.requests[0]!.headers.get("authorization"),
    "Bearer ark-test-key",
  );
  assert.deepEqual(s.requests[0]!.body, {
    model: "doubao-seedream-5-0-pro-260628",
    prompt: "fox",
    size: "2816x1584",
    output_format: "png",
    response_format: "b64_json",
    watermark: false,
  });
  for (const [index, region] of ["ark", "byteplus"].entries()) {
    const provider = s.providers[index]!;
    assert.equal(provider.id, `plugin.ohmygame.seedance.${region}`);
    assert.equal(provider.models[0]!.maxImageReferences, 30);
    assert.equal(provider.models[0]!.imageReferenceMode, "reference");
    assert.equal(provider.models[1]!.maxImageReferences, 9);
    const output = await s.media.generateVideo(provider.models[1]!, {
      prompt: "fox",
      duration: 15,
      resolution: "4K",
      aspectRatio: "16:9",
    });
    assert.deepEqual(output.bytes, MP4);
    const start = s.requests.at(-3)!;
    assert.equal(
      start.headers.get("authorization"),
      `Bearer ${region}-test-key`,
    );
    assert.equal(
      start.url,
      `https://${region === "ark" ? "ark.cn-beijing.volces.com" : "ark.ap-southeast.bytepluses.com"}/api/v3/contents/generations/tasks`,
    );
    assert.deepEqual(start.body, {
      model: provider.models[1]!.id,
      content: [{ type: "text", text: "fox" }],
      resolution: "4k",
      ratio: "16:9",
      duration: 15,
      generate_audio: true,
      watermark: false,
    });
    assert.equal(
      s.requests.at(-2)!.headers.get("authorization"),
      `Bearer ${region}-test-key`,
    );
    assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
  }
  await s.services.configure("ohmygame/seedance", { arkApiKey: null });
  assert.deepEqual(await s.media.imageProviders(), []);
  assert.deepEqual(
    (await s.media.videoProviders()).map((p) => p.id),
    ["plugin.ohmygame.seedance.byteplus"],
  );
  await s.services.setEveryProject("ohmygame/seedance", false);
  assert.deepEqual(await s.media.videoProviders(), []);
});

it("preserves Seedream size/reference limits and single-output requests", async (t) => {
  const s = await setup(t);
  const models = (await s.media.imageProviders())[0]!.models;
  const image = {
    mediaType: "image/png" as const,
    data: PNG.toString("base64"),
  };
  for (const [index, count, resolution, ratio, size] of [
    [0, 10, "1K", "21:9", "1568x672"],
    [1, 10, "2K", "4:3", "2368x1776"],
    [2, 14, "4K", "9:16", "3040x5504"],
  ] as const) {
    const output = await s.media.generateImage(models[index]!, {
      prompt: "fox",
      resolution,
      aspectRatio: ratio,
      images: Array(count).fill(image),
    });
    assert.deepEqual(output.bytes, PNG);
    const body = s.requests.at(-1)!.body!;
    assert.equal(body.size, size);
    assert.deepEqual(
      body.image,
      Array(count).fill(`data:image/png;base64,${image.data}`),
    );
    assert.equal(
      body.sequential_image_generation,
      index === 2 ? "disabled" : undefined,
    );
    const before = s.requests.length;
    await assert.rejects(
      s.media.generateImage(models[index]!, {
        prompt: "fox",
        resolution,
        aspectRatio: ratio,
        images: Array(count + 1).fill(image),
      }),
      /reference images/,
    );
    assert.equal(s.requests.length, before);
  }
  const before = s.requests.length;
  await assert.rejects(
    s.media.generateImage(models[0]!, {
      prompt: "fox",
      resolution: "4K",
      aspectRatio: "1:1",
    }),
    /supported Seedream resolution/,
  );
  assert.equal(s.requests.length, before);
});

it("sends all thirty references, preserves frame roles and refuses unsupported inputs before POST", async (t) => {
  const s = await setup(t);
  const picture = Buffer.concat([PNG, Buffer.alloc(256 * 1024)]);
  const file = path.join(s.root, "frame.png");
  await writeFile(file, picture);
  const ref = {
    type: "image" as const,
    name: "frame.png",
    mediaType: "image/png",
    absolutePath: file,
  };
  const model = s.providers[0]!.models[0]!;
  await s.media.generateVideo(model, {
    prompt: "fox",
    references: Array(30).fill(ref),
    referenceMode: "reference",
    aspectRatio: "16:9",
    duration: 30,
  });
  const content = s.requests[0]!.body!.content as Array<
    Record<string, unknown>
  >;
  assert.equal(content.length, 31);
  assert.deepEqual(
    content.slice(1),
    Array(30).fill({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${picture.toString("base64")}` },
      role: "reference_image",
    }),
  );
  await s.media.generateVideo(model, {
    prompt: "",
    references: [ref, ref],
    referenceMode: "frame",
  });
  assert.equal(s.requests.at(-3)!.body!.ratio, "adaptive");
  assert.deepEqual(
    (s.requests.at(-3)!.body!.content as Array<Record<string, unknown>>).map(
      (x) => x.role,
    ),
    ["first_frame", "last_frame"],
  );
  const before = s.requests.length;
  for (const input of [
    { references: Array(31).fill(ref), referenceMode: "reference" as const },
    { references: [ref, ref, ref], referenceMode: "frame" as const },
    {
      references: [ref],
      referenceMode: "frame" as const,
      aspectRatio: "16:9" as const,
    },
    { references: [{ ...ref, type: "video" as const }] },
    { resolution: "4K" as const },
  ])
    await assert.rejects(
      s.media.generateVideo(model, { prompt: "fox", ...input }),
    );
  assert.equal(s.requests.length, before);
});

it("keeps a submitted task across shutdown and retries only GET after restart", async (t) => {
  let finish = false;
  let checked!: () => void;
  let failed!: (error: Error) => void;
  const checking = new Promise<void>((resolve, reject) => {
    checked = resolve;
    failed = reject;
  });
  const s = await setup(t, (request) => {
    if (request.method === "GET" && request.url.includes("/tasks/")) {
      checked();
      return finish ? done() : json({ id: "task-1", status: "running" });
    }
  });
  const stop = new AbortController();
  const pending = s.media.generateVideo(
    s.providers[0]!.models[0]!,
    { prompt: "fox" },
    stop.signal,
    await s.journal(),
  );
  const rejected = assert.rejects(pending);
  const deadline = setTimeout(
    () => failed(new Error("Task was not checked within 10 seconds")),
    10_000,
  );
  try {
    await checking;
  } finally {
    clearTimeout(deadline);
    stop.abort(new s.GenerationShutdown());
    await rejected;
  }
  const before = JSON.parse(
    await readFile(path.join(s.root, "tasks", "job-1.json"), "utf8"),
  );
  assert.ok(before);
  finish = true;
  const output = await s
    .restart()
    .generateVideo(
      s.providers[0]!.models[0]!,
      { prompt: "fox" },
      undefined,
      await s.journal(),
    );
  assert.deepEqual(output.bytes, MP4);
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(s.requests.filter((r) => r.method === "DELETE").length, 0);
});

for (const failure of [
  "transport",
  "timeout",
  "server",
  "unreadable",
  "missing-id",
] as const) {
  it(`does not resubmit a paid video after an ambiguous ${failure} response`, async (t) => {
    const s = await setup(t, (request) => {
      if (request.method !== "POST") return;
      if (failure === "transport") throw new Error("offline");
      if (failure === "timeout")
        return json({ error: { code: "Timeout", message: "timeout" } }, 408);
      if (failure === "server")
        return json({ error: { code: "InternalError", message: "busy" } }, 500);
      if (failure === "unreadable") return new Response("not json");
      return json({});
    });
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
    );
    assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  });
}

it("retains task ownership on mismatched poll responses and rejects unapproved output hosts", async (t) => {
  let wrong = true;
  const s = await setup(t, (request) =>
    request.url.includes("/tasks/")
      ? wrong
        ? json({
            id: "different",
            status: "succeeded",
            content: { video_url: "https://evil.test/video.mp4" },
          })
        : done("https://evil.test/video.mp4")
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
    /different or missing task/,
  );
  wrong = false;
  await assert.rejects(
    s
      .restart()
      .generateVideo(model, { prompt: "fox" }, undefined, await s.journal()),
    /capabilities.network/,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.ok(s.requests.every((r) => !r.url.includes("evil.test")));
});

it("allows a corrected retry after a definite rejection without hiding the vendor error", async (t) => {
  let denied = true;
  const s = await setup(t, (r) =>
    r.method === "POST" && denied
      ? json(
          {
            error: { code: "InvalidParameter", message: "prompt was rejected" },
          },
          400,
        )
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
    /prompt was rejected/,
  );
  denied = false;
  assert.deepEqual(
    (
      await s.media.generateVideo(
        model,
        { prompt: "bird" },
        undefined,
        await s.journal(),
      )
    ).bytes,
    MP4,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 2);
});

for (const status of ["failed", "cancelled", "expired"]) {
  it(`reports a terminal ${status} task and releases its journal without a replacement`, async (t) => {
    const s = await setup(t, (r) =>
      r.url.includes("/tasks/")
        ? json({ id: "task-1", status, error: { message: "vendor " + status } })
        : undefined,
    );
    await assert.rejects(
      s.media.generateVideo(
        s.providers[0]!.models[0]!,
        { prompt: "fox" },
        undefined,
        await s.journal(),
      ),
      new RegExp("vendor " + status),
    );
    await assert.rejects(readFile(path.join(s.root, "tasks/job-1.json")), {
      code: "ENOENT",
    });
    assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
    assert.equal(s.requests.filter((r) => r.method === "DELETE").length, 0);
  });
}
