import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const pluginRoot = fileURLToPath(new URL("../plugins/tripo", import.meta.url));
const { model3DFixture } = await import(
  pathToFileURL(path.join(app, "test/model3d-fixture.ts")).href
);
const GLB: Buffer = await model3DFixture();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cB84AAAAASUVORK5CYII=",
  "base64",
);
const json = (data: unknown) =>
  new Response(JSON.stringify({ code: 0, data }), {
    headers: { "content-type": "application/json" },
  });
type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, unknown>;
  form?: FormData;
};
type Reply = (
  r: Request,
) => Response | undefined | Promise<Response | undefined>;
async function setup(t: TestContext, reply?: Reply) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { PluginMediaModelChoices },
    { mediaTaskJournal },
  ] = await Promise.all([
    load("plugin-services"),
    load("plugin-media-providers"),
    load("plugin-media-models"),
    load("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-tripo-"));
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
  await services.configure("ohmygame/tripo", { apiKey: "tripo-test-key" });
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const r: Request = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
      ...(init?.body instanceof FormData ? { form: init.body } : {}),
    };
    requests.push(r);
    const custom = await reply?.(r);
    if (custom) return custom;
    if (r.url.endsWith("/files"))
      return json({ file_token: `file-${requests.length}` });
    if (r.method === "POST") return json({ task_id: "generated" });
    if (r.url.startsWith("https://cdn.tripo3d.ai/"))
      return new Response(new Uint8Array(GLB));
    return json({
      task_id: "generated",
      status: "success",
      output: { model_url: "https://cdn.tripo3d.ai/model.glb" },
    });
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
  await services.setEveryProject("ohmygame/tripo", true);
  return {
    root,
    services,
    media,
    requests,
    restart: create,
    provider: (await media.model3DProviders())[0]!,
    journal: (id = "job") => mediaTaskJournal(path.join(root, "tasks"), id),
  };
}

it("uploads image references as real multipart files and retains native low-poly controls", async (t) => {
  const s = await setup(t);
  const model = s.provider.models.find((m) => m.id === "P2-20260801")!;
  assert.equal(model.polycount.min, 48);
  assert.deepEqual(s.provider.processing!.remeshPolycount, {
    min: 500,
    max: 20000,
    default: 4000,
    presets: [1000, 4000, 10000, 20000],
  });
  const result = await s.media.generate3D(
    model,
    {
      model,
      images: [{ mediaType: "image/png", data: PNG.toString("base64") }],
      targetPolycount: 48,
    },
    undefined,
    await s.journal(),
  );
  assert.deepEqual(result.bytes, GLB);
  assert.equal(result.metadata!.forwardAxis, "+X");
  const upload = s.requests[0]!;
  assert.equal(upload.url, "https://openapi.tripo3d.ai/v3/files");
  assert.equal(upload.headers.get("authorization"), "Bearer tripo-test-key");
  const file = upload.form!.get("file") as File;
  assert.equal(file.type, "image/png");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);
  assert.deepEqual(s.requests[1]!.body, {
    model: "P2-20260801",
    face_limit: 48,
    texture: true,
    pbr: false,
    input: "file-1",
  });
  assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
  assert.equal(s.services.index.get("ohmygame/tripo")!.manifest.beta, true);
});

it("runs rig check and rig once, splits six actions into five plus one, and merges all clips", async (t) => {
  const { inspectModel3D } = await load("model3d-inspect");
  const files = new Map<string, Buffer>();
  let batches = 0;
  const s = await setup(t, async (r) => {
    if (r.method === "POST" && r.url.endsWith("/rig-check"))
      return json({ task_id: "checked" });
    if (r.method === "POST" && r.url.endsWith("/rig"))
      return json({ task_id: "rigged" });
    if (r.method === "POST" && r.url.endsWith("/retarget")) {
      const id = `batch-${++batches}`;
      files.set(
        `https://cdn.tripo3d.ai/${id}.glb`,
        await model3DFixture({
          rigged: true,
          clips: r.body!.animations as string[],
        }),
      );
      return json({ task_id: id });
    }
    if (r.url.endsWith("/tasks/checked"))
      return json({
        task_id: "checked",
        status: "success",
        output: { riggable: true, rig_type: "biped" },
      });
    if (r.url.endsWith("/tasks/rigged"))
      return json({ task_id: "rigged", status: "success" });
    if (r.url.includes("/tasks/batch-")) {
      const id = r.url.split("/").at(-1)!;
      return json({
        task_id: id,
        status: "success",
        output: { model_url: `https://cdn.tripo3d.ai/${id}.glb` },
      });
    }
    if (files.has(r.url))
      return new Response(new Uint8Array(files.get(r.url)!));
  });
  const options = {
    rigModel: "v3.0-20260909" as const,
    rigType: "biped" as const,
    animateInPlace: true,
  };
  const listed = await s.media.animationActions(
    s.provider.processing!,
    options,
  );
  assert.equal(
    s.requests.length,
    0,
    "preset library is local and never uploads",
  );
  const actionIds = listed.slice(0, 6).map((a) => a.id);
  const result = await s.media.animate3D(s.provider.processing!, {
    model: GLB,
    actionIds,
    options,
    forwardAxis: "+X",
    journal: await s.journal(),
  });
  assert.deepEqual((await inspectModel3D(result.bytes)).animations, actionIds);
  const writes = s.requests.filter((r) => r.method === "POST");
  assert.equal(writes.length, 5); // file + check + rig + two animation batches
  assert.deepEqual(
    writes
      .filter((r) => r.url.endsWith("/retarget"))
      .map((r) => r.body!.animations),
    [actionIds.slice(0, 5), actionIds.slice(5)],
  );
  assert.equal(
    writes.some((r) => r.body && "bake_animation" in r.body),
    false,
  );
  assert.equal(result.metadata!.forwardAxis, "+X");
});

it("resumes a saved rig after shutdown without repeating upload, rig check or rig", async (t) => {
  const { GenerationShutdown } = await load("media-task-journal");
  const animated = await model3DFixture({
    rigged: true,
    clips: ["preset:biped:walk"],
  });
  const s = await setup(t, (r) => {
    if (r.method === "POST" && r.url.endsWith("/rig-check"))
      return json({ task_id: "checked" });
    if (r.method === "POST" && r.url.endsWith("/rig"))
      return json({ task_id: "rigged" });
    if (r.method === "POST" && r.url.endsWith("/retarget"))
      return json({ task_id: "animated" });
    if (r.url.endsWith("/tasks/checked"))
      return json({
        task_id: "checked",
        status: "success",
        output: { riggable: true, rig_type: "biped" },
      });
    if (r.url.endsWith("/tasks/rigged"))
      return json({ task_id: "rigged", status: "success" });
    if (r.url.endsWith("/tasks/animated"))
      return json({
        task_id: "animated",
        status: "success",
        output: { model_url: "https://cdn.tripo3d.ai/animation.glb" },
      });
    if (r.url.startsWith("https://cdn.tripo3d.ai/"))
      return new Response(new Uint8Array(animated));
  });
  const model = s.provider.processing!;
  const input = { model: GLB, actionIds: ["preset:biped:walk"] };
  const controller = new AbortController();
  const pending = s.media.animate3D(
    model,
    { ...input, journal: await s.journal() },
    controller.signal,
  );
  const rejected = assert.rejects(pending, GenerationShutdown);
  let saved = false;
  for (let n = 0; n < 600 && !saved; n++) {
    saved = await readFile(path.join(s.root, "tasks/job.json"), "utf8")
      .then((raw) => JSON.parse(raw).task?.phase === "rig")
      .catch(() => false);
    if (!saved) await delay(10);
  }
  assert.ok(saved);
  controller.abort(new GenerationShutdown());
  await rejected;
  await s.media.close();
  const result = await s
    .restart()
    .animate3D(model, { ...input, journal: await s.journal() });
  const { inspectModel3D } = await load("model3d-inspect");
  assert.deepEqual((await inspectModel3D(result.bytes)).animations, [
    "preset:biped:walk",
  ]);
  assert.deepEqual(
    s.requests
      .filter((r) => r.method === "POST")
      .map((r) => r.url.split("/").at(-1)),
    ["files", "rig-check", "rig", "retarget"],
  );
});

it("rejects unsupported rig actions before upload and stops after a mismatched rig check", async (t) => {
  const s = await setup(t, (r) => {
    if (r.method === "POST" && r.url.endsWith("/rig-check"))
      return json({ task_id: "checked" });
    if (r.url.endsWith("/tasks/checked"))
      return json({
        task_id: "checked",
        status: "success",
        output: { riggable: true, rig_type: "quadruped" },
      });
  });
  const model = s.provider.processing!;
  await assert.rejects(
    s.media.animate3D(model, {
      model: GLB,
      actionIds: ["preset:walk"],
      journal: await s.journal("wrong-action"),
    }),
    /selected Tripo rig presets/,
  );
  await assert.rejects(
    s.media.animationActions(model, {
      rigModel: "v1.0-20240301",
      rigType: "quadruped",
    }),
    /rig version or type/,
  );
  assert.equal(s.requests.length, 0);
  await assert.rejects(
    s.media.animate3D(model, {
      model: GLB,
      actionIds: ["preset:biped:walk"],
      journal: await s.journal(),
    }),
    /does not match/,
  );
  assert.deepEqual(
    s.requests
      .filter((r) => r.method === "POST")
      .map((r) => r.url.split("/").at(-1)),
    ["files", "rig-check"],
  );
});

const source = await readFile(
  path.join(pluginRoot, "media/adapter.js"),
  "utf8",
);
const { runMediaAdapter } = await load("plugin-media-sandbox");
type WireRequest = {
  url: string;
  method?: string;
  auth?: boolean;
  json?: unknown;
  multipart?: unknown;
  submission?: string;
};
const wire = (data: unknown, status = 200) => ({
  status,
  headers: {},
  body: JSON.stringify({ code: 0, data }),
});
const call = (
  step: string,
  args: unknown[],
  fetch: (r: WireRequest) => Promise<ReturnType<typeof wire>>,
) =>
  runMediaAdapter({
    source,
    file: "media/adapter.js",
    kind: "3d",
    step,
    args,
    fetch,
  });
const imageRef = { file: "reference", mediaType: "image/png" };
const generation = {
  operation: "image",
  model: "v3.1-20260211",
  references: [imageRef],
  texture: true,
  pbr: false,
  targetPolycount: 30000,
};

it("keeps text, multiview and processing request contracts with durable upload stages", async () => {
  const requests: WireRequest[] = [];
  const fetch = async (r: WireRequest) => {
    requests.push(r);
    return wire(
      r.url.endsWith("/files")
        ? { file_token: r.submission }
        : { task_id: "paid" },
    );
  };
  await call(
    "start",
    [{ ...generation, operation: "text", prompt: "a fox", references: [] }],
    fetch,
  );
  assert.equal(
    requests[0]!.url,
    "https://openapi.tripo3d.ai/v3/generation/text-to-model",
  );
  assert.deepEqual(requests[0]!.json, {
    model: "v3.1-20260211",
    face_limit: 30000,
    texture: true,
    pbr: false,
    prompt: "a fox",
  });
  requests.length = 0;
  await call(
    "start",
    [
      {
        ...generation,
        references: Array.from({ length: 4 }, (_, i) => ({
          file: `ref-${i}`,
          mediaType: "image/jpeg",
        })),
      },
    ],
    fetch,
  );
  assert.deepEqual(
    requests.slice(0, 4).map((r) => r.submission),
    ["image-upload-0", "image-upload-1", "image-upload-2", "image-upload-3"],
  );
  assert.deepEqual(requests.at(-1)!.json, {
    model: "v3.1-20260211",
    face_limit: 30000,
    texture: true,
    pbr: false,
    inputs: [
      { front: "image-upload-0" },
      { left: "image-upload-1" },
      { back: "image-upload-2" },
      { right: "image-upload-3" },
    ],
  });
  requests.length = 0;
  const processing = {
    ...generation,
    references: [],
    source: { file: "model" },
    targetPolycount: 4000,
  };
  await call("start", [{ ...processing, operation: "remesh" }], fetch);
  assert.deepEqual(requests[0]!.multipart, [{ name: "file", file: "model" }]);
  assert.equal(requests[1]!.url, "https://openapi.tripo3d.ai/v3/mesh/decimate");
  assert.deepEqual(requests[1]!.json, {
    input: "source-upload",
    model: "v3.0",
    face_limit: 4000,
    quad: false,
    bake: true,
  });
  requests.length = 0;
  await call(
    "start",
    [
      {
        ...processing,
        operation: "retexture",
        prompt: "gold",
        pbr: true,
        options: { textureModel: "v3.5-20260815", textureQuality: "fast" },
      },
    ],
    fetch,
  );
  assert.deepEqual(requests[1]!.json, {
    input: "source-upload",
    model: "v3.5-20260815",
    pbr: true,
    texture_prompt: { text: "gold" },
    texture_quality: "fast",
  });
  requests.length = 0;
  await call(
    "start",
    [{ ...processing, operation: "retexture", references: [imageRef] }],
    fetch,
  );
  assert.deepEqual(
    requests.map((r) => r.submission),
    ["source-upload", "texture-upload", "generate"],
  );
  assert.deepEqual(
    (requests.at(-1)!.json as { texture_prompt: unknown }).texture_prompt,
    { image: "texture-upload" },
  );
});

it("rejects invalid generation and texture inputs before any upload", async () => {
  let requests = 0;
  const fetch = async () => {
    requests++;
    return wire({ task_id: "unexpected" });
  };
  for (const fields of [
    { references: [{ ...imageRef, mediaType: "image/webp" }] },
    { references: [] },
    { references: Array(5).fill(imageRef) },
    { operation: "text", prompt: "x".repeat(1025), references: [] },
    { operation: "text", prompt: "fox" },
    { operation: "text", prompt: " ", references: [] },
    { operation: "retexture", prompt: "gold" },
    { operation: "retexture", references: [] },
    {
      operation: "retexture",
      prompt: "gold",
      references: [],
      options: { textureModel: "v3.0-20250812", textureQuality: "fast" },
    },
    {
      operation: "retexture",
      references: [imageRef],
      options: { textureModel: "unknown" },
    },
    { operation: "remesh", references: [], prompt: "gold" },
  ])
    await assert.rejects(
      call(
        "start",
        [{ ...generation, source: { file: "source" }, ...fields }],
        fetch,
      ),
    );
  assert.equal(requests, 0);
});

it("refreshes all six batch URLs after completing thirty actions", async () => {
  const ids = Array.from({ length: 30 }, (_, i) => `action-${i}`);
  let revision = 0;
  const submissions: WireRequest[] = [];
  const fetch = async (r: WireRequest) => {
    if (r.submission) {
      submissions.push(r);
      return wire({ task_id: r.submission });
    }
    const id = r.url.split("/").at(-1)!;
    return wire({
      task_id: id,
      status: "success",
      output: { model_url: `https://cdn.tripo3d.ai/${id}.glb?r=${revision}` },
    });
  };
  let answer = await call(
    "check",
    [
      {
        phase: "rig",
        id: "rigged",
        actionIds: ids,
        batches: [],
        animateInPlace: false,
      },
    ],
    fetch,
  );
  for (let n = 0; n < 5; n++)
    answer = await call("check", [answer.task], fetch);
  const saved = answer.task;
  const completed = await call("check", [saved], fetch);
  assert.equal(completed.outputs.length, 6);
  assert.deepEqual(
    submissions.map((r) => (r.json as { animations: string[] }).animations),
    Array.from({ length: 6 }, (_, i) => ids.slice(i * 5, i * 5 + 5)),
  );
  revision = 1;
  const resumed = await call("check", [saved], fetch);
  assert.equal(
    submissions.length,
    6,
    "retry never creates another paid animation",
  );
  assert.deepEqual(
    resumed.outputs.map((o: { url: string }) => o.url),
    Array.from(
      { length: 6 },
      (_, i) => `https://cdn.tripo3d.ai/animation-${i}.glb?r=1`,
    ),
  );
});

it("rejects mismatched tasks and unknown statuses, while handling vendor terminal states", async () => {
  const task = { phase: "generation", id: "paid" };
  for (const body of [
    { task_id: "different", status: "success" },
    { task_id: "paid", status: "unknown" },
    { task_id: "paid", status: "success" },
  ])
    await assert.rejects(call("check", [task], async () => wire(body)));
  for (const status of ["queued", "running"])
    assert.deepEqual(
      await call("check", [task], async () =>
        wire({ task_id: "paid", status }),
      ),
      { retryAfter: 2 },
    );
  for (const status of ["failed", "cancelled", "canceled", "expired", "banned"])
    assert.deepEqual(
      await call("check", [task], async () =>
        wire({ task_id: "paid", status }),
      ),
      { error: `Tripo task ${status}` },
    );
  await assert.rejects(
    call(
      "start",
      [{ ...generation, operation: "text", references: [], prompt: "fox" }],
      async () => wire({}),
    ),
    /task ID/,
  );
});

it("does not repeat uncertain upload receipts or resume another account's job", async (t) => {
  let failUpload = true;
  const s = await setup(t, (r) => {
    if (r.url.endsWith("/files") && failUpload)
      return new Response("lost acknowledgement", { status: 502 });
  });
  const model = s.provider.models[0]!;
  const input = {
    model,
    images: [{ mediaType: "image/png" as const, data: PNG.toString("base64") }],
  };
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal()),
  );
  assert.equal(s.requests.length, 1);
  failUpload = false;
  await assert.rejects(
    s.restart().generate3D(model, input, undefined, await s.journal()),
  );
  assert.equal(
    s.requests.length,
    1,
    "lost upload reply cannot be repeated automatically",
  );
  await s.services.configure("ohmygame/tripo", { apiKey: "other-key" });
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal()),
    /changed/,
  );
  assert.equal(s.requests.length, 1);
  await s.services.configure("ohmygame/tripo", { apiKey: "tripo-test-key" });
  await assert.rejects(
    s.media.generate3D(
      model,
      { ...input, targetPolycount: 2000 },
      undefined,
      await s.journal(),
    ),
    /changed/,
  );
  assert.equal(s.requests.length, 1);
});

it("reads account balance without writes and rejects invalid or secret-bearing errors safely", async (t) => {
  let state = "valid";
  const s = await setup(t, (r) => {
    if (r.url.endsWith("/account/balance"))
      return state === "valid"
        ? json({ balance: 120.5, frozen: 4 })
        : state === "invalid"
          ? json({ balance: "unknown" })
          : new Response(
              JSON.stringify({
                code: 9000,
                message: "rejected tripo-test-key",
              }),
              { status: 400 },
            );
  });
  assert.deepEqual(await s.media.balance3D(s.provider.id), {
    balance: 120.5,
    frozen: 4,
  });
  state = "invalid";
  await assert.rejects(s.media.balance3D(s.provider.id));
  state = "error";
  await assert.rejects(s.media.balance3D(s.provider.id), (error: Error) => {
    assert.match(error.message, /rejected/);
    assert.equal(error.message.includes("tripo-test-key"), false);
    return true;
  });
  assert.equal(
    s.requests.every((r) => r.method === "GET"),
    true,
  );
});

it("preserves edited defaults and hidden manual versions across restart and sends their exact model ID", async (t) => {
  const s = await setup(t);
  const original = await s.media.listModels(s.provider.id, "3d");
  const edited = await s.media.saveModel3D(s.provider.id, {
    revision: original.editor!.revision,
    model: {
      id: "P2-20260801",
      title: "My P2",
      operations: ["text", "image"],
      polycount: {
        min: 48,
        max: 50000,
        default: 1000,
        presets: [48, 1000, 4000],
      },
      defaults: { texture: false, pbr: false },
    },
  });
  await s.media.saveModel3D(s.provider.id, {
    revision: edited.editor!.revision,
    templateId: "P2-20260801",
    model: {
      id: "my-tripo-version",
      title: "My version",
      operations: ["text", "image"],
      polycount: { min: 48, max: 50000, default: 2000, presets: [2000] },
      defaults: { texture: false, pbr: false },
    },
  });
  await s.media.setModelsShown(
    s.provider.id,
    "3d",
    ["my-tripo-version"],
    false,
  );
  await s.media.close();
  const restarted = s.restart();
  let provider = (await restarted.model3DProviders())[0]!;
  assert.equal(
    provider.models.some((m) => m.id === "my-tripo-version"),
    false,
  );
  assert.equal(
    provider.models.find((m) => m.id === "P2-20260801")!.polycount.default,
    1000,
  );
  await restarted.setModelsShown(
    s.provider.id,
    "3d",
    ["my-tripo-version"],
    true,
  );
  provider = (await restarted.model3DProviders())[0]!;
  const model = provider.models.find((m) => m.id === "my-tripo-version")!;
  await restarted.generate3D(
    model,
    { model, operation: "text", prompt: "fox", images: [] },
    undefined,
    await s.journal(),
  );
  assert.deepEqual(s.requests.find((r) => r.method === "POST")!.body, {
    model: "my-tripo-version",
    face_limit: 2000,
    texture: false,
    pbr: false,
    prompt: "fox",
  });
});
