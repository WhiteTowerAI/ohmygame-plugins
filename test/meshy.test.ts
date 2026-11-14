import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type {
  MediaFetchRequest,
  MediaFetchResponse,
} from "../app/src/daemon/plugin-media-sandbox.js";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const pluginRoot = fileURLToPath(new URL("../plugins/meshy", import.meta.url));
const source = await readFile(
  path.join(pluginRoot, "media/adapter.js"),
  "utf8",
);
const { runMediaAdapter } = await load("plugin-media-sandbox");
const { model3DFixture } = await import(
  pathToFileURL(path.join(app, "test/model3d-fixture.ts")).href
);
const GLB: Buffer = await model3DFixture();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cB84AAAAASUVORK5CYII=",
  "base64",
);
const base = "https://api.meshy.ai/openapi/";
const resultUrl = "https://assets.meshy.ai/result.glb";
const wire = (body: unknown, status = 200): MediaFetchResponse => ({
  status,
  headers: {},
  body: JSON.stringify(body),
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const done = (id: string) => ({
  id,
  status: "SUCCEEDED",
  model_urls: { glb: resultUrl },
});
const imageInput = {
  operation: "image",
  model: "meshy-t2",
  modelSettings: { imageOperation: "image-to-3d", modelType: "smart-topology" },
  references: [{ file: "ref" }],
  targetPolycount: 4000,
  texture: true,
  pbr: false,
};
const call = (
  step: string,
  args: unknown[],
  fetch: (r: MediaFetchRequest) => Promise<MediaFetchResponse>,
) =>
  runMediaAdapter({
    source,
    file: "media/adapter.js",
    kind: "3d",
    step,
    args,
    fetch,
  });

it("uses the Meshy generation endpoints, topology controls and durable text refinement", async () => {
  const requests: MediaFetchRequest[] = [];
  const fetch = async (r: MediaFetchRequest) => {
    requests.push(r);
    return wire(
      r.submission
        ? { result: r.submission === "refine" ? "refined" : "created" }
        : done("created"),
    );
  };
  const image = await call("start", [imageInput], fetch);
  assert.equal(requests[0]!.url, base + "v1/image-to-3d");
  assert.equal(requests[0]!.submission, "generate");
  assert.deepEqual(requests[0]!.json, {
    ai_model: "meshy-t2",
    target_polycount: 4000,
    image_url: { $mediaFile: "ref" },
    should_texture: true,
    enable_pbr: false,
    model_type: "smart-topology",
  });
  assert.deepEqual(await call("check", [image.task], fetch), {
    outputs: [{ url: resultUrl, requestId: "created", forwardAxis: "+Z" }],
  });
  const text = await call(
    "start",
    [{ ...imageInput, operation: "text", prompt: "a fox", references: [] }],
    fetch,
  );
  assert.equal(requests.at(-1)!.url, base + "v2/text-to-3d");
  const refined = await call("check", [text.task], fetch);
  assert.equal(requests.at(-1)!.submission, "refine");
  assert.deepEqual(requests.at(-1)!.json, {
    mode: "refine",
    preview_task_id: "created",
    enable_pbr: false,
  });
  assert.equal(refined.task.id, "refined");
  assert.equal(refined.task.refine, false);
  const count = requests.length;
  for (const input of [
    { ...imageInput, references: [{ file: "a" }, { file: "b" }] },
    {
      ...imageInput,
      operation: "text",
      prompt: "x".repeat(801),
      references: [],
    },
    { ...imageInput, operation: "text", prompt: "fox" },
    {
      ...imageInput,
      modelSettings: {
        ...imageInput.modelSettings,
        imageOperation: "multi-image-to-3d",
      },
    },
  ])
    await assert.rejects(call("start", [input], fetch));
  assert.equal(requests.length, count, "invalid input cannot submit paid work");
});

it("uploads processing files through host handles and rejects ambiguous texture styles", async () => {
  const requests: MediaFetchRequest[] = [];
  const fetch = async (r: MediaFetchRequest) => {
    requests.push(r);
    return wire({ result: "processed" });
  };
  const input = {
    operation: "remesh",
    source: { file: "model" },
    targetPolycount: 1000,
    references: [],
    pbr: true,
  };
  await call("start", [input], fetch);
  assert.deepEqual(requests[0]!.json, {
    model_url: { $mediaFile: "model", mediaType: "application/octet-stream" },
    target_polycount: 1000,
    topology: "triangle",
    target_formats: ["glb"],
  });
  await call(
    "start",
    [
      {
        ...input,
        operation: "retexture",
        prompt: "gold",
        options: { textureModel: "meshy-6" },
      },
    ],
    fetch,
  );
  assert.deepEqual(requests[1]!.json, {
    model_url: { $mediaFile: "model", mediaType: "application/octet-stream" },
    text_style_prompt: "gold",
    ai_model: "meshy-6",
    enable_pbr: true,
  });
  await call(
    "start",
    [{ ...input, operation: "retexture", references: [{ file: "style" }] }],
    fetch,
  );
  assert.deepEqual(
    (requests[2]!.json as Record<string, unknown>).image_style_url,
    { $mediaFile: "style" },
  );
  for (const fields of [
    {},
    { prompt: "gold", references: [{ file: "style" }] },
    { prompt: "gold", options: { textureModel: "unknown" } },
  ])
    await assert.rejects(
      call("start", [{ ...input, operation: "retexture", ...fields }], fetch),
    );
  assert.equal(requests.length, 3);
});

it("batches thirty actions on one reusable rig and returns every GLB", async () => {
  const requests: MediaFetchRequest[] = [];
  const fetch = async (r: MediaFetchRequest) => {
    requests.push(r);
    if (r.reuse) return wire({ taskId: "rigged" });
    if (r.submission) return wire({ result: r.submission });
    const id = r.url.split("/").at(-1)!;
    return wire({
      id,
      status: "SUCCEEDED",
      result: { animation_glb_url: `https://assets.meshy.ai/${id}.glb` },
    });
  };
  const actionIds = Array.from({ length: 30 }, (_, i) => i);
  let answer = await call(
    "start",
    [{ operation: "animate", actionIds }],
    fetch,
  );
  for (let n = 0; n < 4; n++)
    answer = await call("check", [answer.task], fetch);
  assert.equal(answer.outputs.length, 3);
  assert.deepEqual(
    answer.outputs.map((o: { requestId: string }) => o.requestId),
    ["animation-0", "animation-1", "animation-2"],
  );
  const writes = requests.filter((r) => r.submission);
  assert.deepEqual(
    writes.map((r) => (r.json as { action_ids: number[] }).action_ids),
    [actionIds.slice(0, 10), actionIds.slice(10, 20), actionIds.slice(20)],
  );
  assert.equal(requests.filter((r) => r.reuse).length, 1);
  for (const ids of [
    [],
    [1, 1],
    ["1"],
    Array.from({ length: 31 }, (_, i) => i),
  ])
    await assert.rejects(
      call("start", [{ operation: "animate", actionIds: ids }], fetch),
    );
  assert.equal(requests.filter((r) => r.reuse).length, 1);
});

it("retains shared rigs on uncertain queries and replaces only known unusable rigs", async () => {
  const args = ["rig", {}, { taskId: "rigged" }];
  for (const status of ["PENDING", "IN_PROGRESS"])
    assert.deepEqual(
      await call("reuse", args, async () => wire({ id: "rigged", status })),
      { valid: true },
    );
  assert.deepEqual(
    await call("reuse", args, async () =>
      wire({
        id: "rigged",
        status: "SUCCEEDED",
        expires_at: Date.now() + 7_200_000,
      }),
    ),
    { valid: true },
  );
  for (const body of [
    { id: "rigged", status: "FAILED" },
    { id: "rigged", status: "CANCELED" },
    { id: "rigged", status: "SUCCEEDED", expires_at: Date.now() - 1 },
  ])
    assert.deepEqual(await call("reuse", args, async () => wire(body)), {
      valid: false,
    });
  for (const body of [
    { id: "other", status: "SUCCEEDED" },
    { id: "rigged", status: "UNKNOWN" },
    { id: "rigged", status: "SUCCEEDED" },
    { id: "rigged", status: "SUCCEEDED", expires_at: "later" },
  ])
    await assert.rejects(call("reuse", args, async () => wire(body)));
  await assert.rejects(
    call("reuse", args, async () => wire({}, 503)),
    /HTTP 503/,
  );
  await assert.rejects(
    call("reuse", args, async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  const requests: MediaFetchRequest[] = [];
  assert.deepEqual(
    await call(
      "reuse",
      ["rig", { source: { file: "character" }, heightMeters: 1.8 }, null],
      async (r) => {
        requests.push(r);
        return wire({ result: "rigged" });
      },
    ),
    { value: { taskId: "rigged" } },
  );
  assert.deepEqual(requests[0]!.json, {
    model_url: {
      $mediaFile: "character",
      mediaType: "application/octet-stream",
    },
    height_meters: 1.8,
  });
  assert.equal(requests[0]!.submission, "rig");
});

type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
};
type Reply = (
  r: Request,
) => Response | undefined | Promise<Response | undefined>;
async function setup(t: TestContext, reply?: Reply) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { PluginMediaModelChoices },
    { mediaTaskJournal, GenerationShutdown },
  ] = await Promise.all([
    load("plugin-services"),
    load("plugin-media-providers"),
    load("plugin-media-models"),
    load("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-meshy-"));
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
  await services.configure("ohmygame/meshy", { apiKey: "meshy-test-key" });
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const r: Request = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
    };
    requests.push(r);
    const custom = await reply?.(r);
    if (custom) return custom;
    if (r.method === "POST")
      return json({
        result: r.body?.mode === "refine" ? "refined" : "created",
      });
    if (r.url.startsWith("https://assets.meshy.ai/"))
      return new Response(new Uint8Array(GLB), {
        headers: { "content-type": "model/gltf-binary" },
      });
    return json(done(r.url.split("/").at(-1)!));
  };
  const create = (): Media => {
    const media: Media = new PluginMediaProviders(
      services,
      fetcher,
      undefined,
      new PluginMediaModelChoices(root),
      root,
    );
    instances.push(media);
    return media;
  };
  const media = create();
  assert.deepEqual(await media.model3DProviders(), []);
  await services.setEveryProject("ohmygame/meshy", true);
  const provider = (await media.model3DProviders())[0]!;
  return {
    root,
    media,
    provider,
    requests,
    services,
    restart: create,
    journal: (id = "job-1") => mediaTaskJournal(path.join(root, "tasks"), id),
    GenerationShutdown,
  };
}

it("installs Beta presets and logo, expands files outside the sandbox and downloads without keys", async (t) => {
  const s = await setup(t);
  const model = s.provider.models.find((m) => m.id === "meshy-t2")!;
  assert.equal(s.services.index.get("ohmygame/meshy")!.manifest.beta, true);
  assert.equal(
    s.services.index.get("ohmygame/meshy")!.manifest.icon,
    "./assets/icon.svg",
  );
  assert.equal(s.provider.models.length, 7);
  assert.deepEqual(s.provider.processing!.operations, [
    "remesh",
    "retexture",
    "animate",
  ]);
  const input = {
    model,
    images: [{ mediaType: "image/png" as const, data: PNG.toString("base64") }],
  };
  const result = await s.media.generate3D(
    model,
    input,
    undefined,
    await s.journal(),
  );
  assert.deepEqual(result.bytes, GLB);
  assert.deepEqual(result.metadata, { forwardAxis: "+Z" });
  assert.equal(
    s.requests[0]!.body!.image_url,
    `data:image/png;base64,${PNG.toString("base64")}`,
  );
  assert.equal(
    s.requests[0]!.headers.get("authorization"),
    "Bearer meshy-test-key",
  );
  assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
  const count = s.requests.length;
  await assert.rejects(
    s.media.generate3D(
      model,
      { ...input, images: [...input.images, ...input.images] },
      undefined,
      await s.journal("too-many"),
    ),
    /1 to 1/,
  );
  await assert.rejects(
    s.media.generate3D(
      model,
      { ...input, targetPolycount: 15001 },
      undefined,
      await s.journal("too-many-faces"),
    ),
    /poly count/,
  );
  assert.equal(s.requests.length, count);
});

it("resumes text refinement after shutdown without a second preview or refine", async (t) => {
  const s = await setup(t);
  const model = s.provider.models[0]!;
  const input = {
    model,
    operation: "text" as const,
    prompt: "a fox",
    images: [],
  };
  const controller = new AbortController();
  const pending = s.media.generate3D(
    model,
    input,
    controller.signal,
    await s.journal(),
  );
  const rejected = assert.rejects(pending, s.GenerationShutdown);
  let saved = false;
  for (let n = 0; n < 600 && !saved; n++) {
    saved = await readFile(path.join(s.root, "tasks/job-1.json"), "utf8")
      .then((raw) => JSON.parse(raw).task?.id === "refined")
      .catch(() => false);
    if (!saved) await delay(10);
  }
  assert.ok(saved, "refinement task was saved before shutdown");
  controller.abort(new s.GenerationShutdown());
  await rejected;
  await s.media.close();
  const result = await s
    .restart()
    .generate3D(model, input, undefined, await s.journal());
  assert.deepEqual(result.bytes, GLB);
  assert.deepEqual(
    s.requests.filter((r) => r.method === "POST").map((r) => r.body!.mode),
    ["preview", "refine"],
  );
  assert.equal(
    s.requests.some((r) => r.method === "DELETE"),
    false,
  );
});

it("lists actions and credits without paid requests and rejects malformed vendor data", async (t) => {
  let invalid = false;
  const s = await setup(t, (r) => {
    if (r.url.endsWith("/balance"))
      return json({ balance: invalid ? "unknown" : 123.5, frozen: 2 });
    if (r.url.endsWith("/library"))
      return json([
        {
          action_id: 4,
          name: "Walk",
          category: "Walking",
          sub_category: "Walk",
          preview_url: invalid
            ? "https://evil.example/preview.mp4"
            : "https://assets.meshy.ai/walk.mp4",
        },
      ]);
  });
  assert.deepEqual(await s.media.balance3D(s.provider.id), {
    balance: 123.5,
    frozen: 2,
  });
  assert.deepEqual(await s.media.animationActions(s.provider.processing!), [
    {
      id: 4,
      name: "Walk",
      category: "Walking",
      subCategory: "Walk",
      previewUrl: "https://assets.meshy.ai/walk.mp4",
    },
  ]);
  invalid = true;
  await assert.rejects(s.media.balance3D(s.provider.id));
  await assert.rejects(s.media.animationActions(s.provider.processing!));
  assert.equal(
    s.requests.every((r) => r.method === "GET"),
    true,
  );
});

it("shares a pending paid rig across concurrent animations and keeps old jobs pinned after expiry", async (t) => {
  let rigs = 0;
  let batches = 0;
  let rigStatus = "IN_PROGRESS";
  let expiresAt = Date.now() + 7_200_000;
  let downloadFailure = true;
  const files = new Map<string, Buffer>();
  const s = await setup(t, async (r) => {
    if (r.method === "POST" && r.url.endsWith("/rigging")) {
      rigs++;
      return json({ result: `rig-${rigs}` });
    }
    if (r.method === "POST" && r.url.endsWith("/animations")) {
      batches++;
      const id = `batch-${batches}`;
      files.set(
        `https://assets.meshy.ai/${id}.glb`,
        await model3DFixture({
          rigged: true,
          clips: (r.body!.action_ids as number[]).map((id) => `Action ${id}`),
        }),
      );
      return json({ result: id });
    }
    if (r.url.includes("/rigging/"))
      return json({
        id: r.url.split("/").at(-1),
        status: rigStatus,
        expires_at: expiresAt,
      });
    if (r.url.includes("/animations/")) {
      const id = r.url.split("/").at(-1)!;
      return json({
        id,
        status: "SUCCEEDED",
        result: { animation_glb_url: `https://assets.meshy.ai/${id}.glb` },
      });
    }
    if (files.has(r.url))
      return downloadFailure
        ? new Response("temporarily unavailable", { status: 503 })
        : new Response(new Uint8Array(files.get(r.url)!), {
            headers: { "content-type": "model/gltf-binary" },
          });
  });
  const model = s.provider.processing!;
  const input = { model: GLB, actionIds: [1], heightMeters: 1.8 };
  const first = s.media.animate3D(model, {
    ...input,
    journal: await s.journal("first"),
  });
  const firstRejected = assert.rejects(first, /503/);
  // A saved rig is deliberately still running when the other job joins it.
  let saved = false;
  for (let n = 0; n < 200 && !saved; n++) {
    saved = await readFile(path.join(s.root, "tasks/first.json"), "utf8")
      .then((raw) => JSON.parse(raw).task?.rigId === "rig-1")
      .catch(() => false);
    if (!saved) await delay(10);
  }
  assert.ok(saved);
  const second = s.media.animate3D(model, {
    ...input,
    actionIds: [2],
    journal: await s.journal("second"),
  });
  const secondRejected = assert.rejects(second, /503/);
  let joined = false;
  for (let n = 0; n < 200 && !joined; n++) {
    joined = await readFile(path.join(s.root, "tasks/second.json"), "utf8")
      .then((raw) => JSON.parse(raw).task?.rigId === "rig-1")
      .catch(() => false);
    if (!joined) await delay(10);
  }
  assert.ok(joined);
  assert.equal(rigs, 1);
  rigStatus = "SUCCEEDED";
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(batches, 2);
  await s.media.close();
  const restarted = s.restart();
  downloadFailure = false;
  expiresAt = Date.now() - 1;
  await restarted.animate3D(model, {
    ...input,
    actionIds: [3],
    journal: await s.journal("third"),
  });
  assert.equal(rigs, 2, "confirmed expiry creates a new rig for a new job");
  assert.equal(batches, 3);
  await restarted.animate3D(model, {
    ...input,
    journal: await s.journal("first"),
  });
  assert.equal(rigs, 2, "old job keeps its original paid rig");
  assert.equal(batches, 3, "download retry keeps the original animation batch");
  assert.deepEqual(
    s.requests
      .filter((r) => r.method === "POST" && r.url.endsWith("/animations"))
      .map((r) => r.body!.rig_task_id),
    ["rig-1", "rig-1", "rig-2"],
  );
  assert.equal(
    s.requests.some((r) => r.method === "DELETE"),
    false,
  );
});

it("retains an ambiguous paid submission and rejects unsafe output URLs without another charge", async (t) => {
  let ambiguous = true;
  const s = await setup(t, (r) => {
    if (r.method === "POST" && ambiguous)
      return new Response("lost reply", { status: 502 });
    if (r.method === "GET" && r.url.startsWith(base))
      return json({
        ...done("created"),
        model_urls: { glb: "https://unapproved.example/model.glb" },
      });
  });
  const model = s.provider.models[0]!;
  const input = {
    model,
    operation: "text" as const,
    prompt: "fox",
    images: [],
    texture: false,
  };
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal()),
    /HTTP 502/,
  );
  ambiguous = false;
  await assert.rejects(
    s.restart().generate3D(model, input, undefined, await s.journal()),
    /HTTP 502/,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal("new-job")),
  );
  assert.equal(
    s.requests.some((r) => r.url.includes("unapproved.example")),
    false,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 2);
});

it("reports failed and unfamiliar task states without treating them as success", async () => {
  const task = {
    phase: "generation",
    name: "text-to-3d",
    id: "paid",
    refine: false,
  };
  for (const body of [
    { id: "wrong", status: "SUCCEEDED" },
    { id: "paid", status: "NEW_STATUS" },
    { id: "paid", status: "SUCCEEDED" },
  ])
    await assert.rejects(call("check", [task], async () => wire(body)));
  for (const status of ["PENDING", "IN_PROGRESS"])
    assert.deepEqual(
      await call("check", [task], async () => wire({ id: "paid", status })),
      { retryAfter: 2 },
    );
  assert.deepEqual(
    await call("check", [task], async () =>
      wire({
        id: "paid",
        status: "FAILED",
        task_error: { message: "Unsupported source" },
      }),
    ),
    { error: "Unsupported source" },
  );
  await assert.rejects(
    call("start", [imageInput], async () => wire({})),
    /task ID/,
  );
});

it("merges all eleven requested animation clips through the real host", async (t) => {
  const { inspectModel3D } = await load("model3d-inspect");
  const files = new Map<string, Buffer>();
  let count = 0;
  const s = await setup(t, async (r) => {
    if (r.method === "POST" && r.url.endsWith("/rigging"))
      return json({ result: "rig" });
    if (r.method === "POST" && r.url.endsWith("/animations")) {
      const id = `batch-${++count}`;
      files.set(
        `https://assets.meshy.ai/${id}.glb`,
        await model3DFixture({
          rigged: true,
          clips: (r.body!.action_ids as number[]).map((id) => `Action ${id}`),
        }),
      );
      return json({ result: id });
    }
    if (r.url.includes("/rigging/"))
      return json({ id: "rig", status: "SUCCEEDED" });
    if (r.url.includes("/animations/")) {
      const id = r.url.split("/").at(-1)!;
      return json({
        id,
        status: "SUCCEEDED",
        result: { animation_glb_url: `https://assets.meshy.ai/${id}.glb` },
      });
    }
    if (files.has(r.url))
      return new Response(new Uint8Array(files.get(r.url)!));
  });
  const actionIds = Array.from({ length: 11 }, (_, i) => i);
  const result = await s.media.animate3D(s.provider.processing!, {
    model: GLB,
    actionIds,
    forwardAxis: "+X",
    journal: await s.journal(),
  });
  const metadata = await inspectModel3D(result.bytes);
  assert.equal(metadata.rigged, true);
  assert.deepEqual(
    metadata.animations,
    actionIds.map((id) => `Action ${id}`),
  );
  assert.equal(result.metadata!.forwardAxis, "+Z");
  assert.equal(result.requestId, "batch-1,batch-2");
  const upload = s.requests.find(
    (r) => r.method === "POST" && r.url.endsWith("/rigging"),
  )!.body!.model_url;
  assert.equal(typeof upload, "string");
  assert.notEqual(
    upload,
    `data:application/octet-stream;base64,${GLB.toString("base64")}`,
    "host rotates +X input before rigging",
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 3);
});

it("refreshes every batch download URL when resuming a completed animation", async () => {
  let revision = 0;
  const fetch = async (r: MediaFetchRequest) => {
    if (r.reuse) return wire({ taskId: "rig" });
    if (r.submission) return wire({ result: r.submission });
    const id = r.url.split("/").at(-1)!;
    return wire({
      id,
      status: "SUCCEEDED",
      result: {
        animation_glb_url: `https://assets.meshy.ai/${id}.glb?revision=${revision}`,
      },
    });
  };
  let answer = await call(
    "start",
    [
      {
        operation: "animate",
        actionIds: Array.from({ length: 11 }, (_, i) => i),
      },
    ],
    fetch,
  );
  answer = await call("check", [answer.task], fetch); // first batch
  answer = await call("check", [answer.task], fetch); // second batch
  const saved = answer.task;
  assert.equal((await call("check", [saved], fetch)).outputs.length, 2);
  revision = 1; // old signed download URLs have expired after app restart
  const resumed = await call("check", [saved], fetch);
  assert.deepEqual(
    resumed.outputs.map((o: { url: string }) => o.url),
    [
      "https://assets.meshy.ai/animation-0.glb?revision=1",
      "https://assets.meshy.ai/animation-1.glb?revision=1",
    ],
  );
});
