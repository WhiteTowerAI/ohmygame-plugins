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
const pluginRoot = fileURLToPath(
  new URL("../plugins/hyper3d", import.meta.url),
);
const { model3DFixture } = await import(
  pathToFileURL(path.join(app, "test/model3d-fixture.ts")).href
);
const GLB: Buffer = await model3DFixture();
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cB84AAAAASUVORK5CYII=",
  "base64",
);
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
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
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-hyper3d-"));
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
  await services.configure("ohmygame/hyper3d", { apiKey: "hyper3d-test-key" });
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
    if (r.url.endsWith("/rodin") || r.url.endsWith("/rodin_texture_only"))
      return json({
        uuid: "generated",
        jobs: { subscription_key: "private-status-key" },
      });
    if (r.url.endsWith("/status"))
      return json({ jobs: [{ uuid: "job-1", status: "Done" }] });
    if (r.url.endsWith("/download"))
      return json({
        list: [
          { name: "model.glb", url: "https://api.hyper3d.com/mock/model.glb" },
        ],
      });
    if (r.url.endsWith("/check_balance")) return json({ balance: 12 });
    if (r.url.startsWith("https://api.hyper3d.com/mock/"))
      return new Response(new Uint8Array(GLB));
    throw new Error("Unexpected test request: " + r.url);
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
  await services.setEveryProject("ohmygame/hyper3d", true);
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

it("uploads repeated image parts, retains native tiers and uses independent task identifiers", async (t) => {
  const s = await setup(t);
  assert.equal(s.provider.models.length, 10);
  const model = s.provider.models[0]!;
  assert.equal(model.id, "Gen-2.5-Medium");
  const result = await s.media.generate3D(
    model,
    {
      model,
      images: Array.from({ length: 2 }, () => ({
        mediaType: "image/png",
        data: PNG.toString("base64"),
      })),
      options: { pose: "t-pose" },
    },
    undefined,
    await s.journal(),
  );
  assert.deepEqual(result.bytes, GLB);
  const submit = s.requests[0]!;
  assert.equal(submit.headers.get("authorization"), "Bearer hyper3d-test-key");
  assert.equal(submit.form!.getAll("images").length, 2);
  const image = submit.form!.get("images") as File;
  assert.equal(image.type, "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
  assert.deepEqual(
    [...submit.form!].filter(([, value]) => typeof value === "string"),
    [
      ["geometry_file_format", "glb"],
      ["material", "Shaded"],
      ["TAPose", "true"],
      ["tier", "Gen-2.5-Medium"],
      ["mesh_mode", "Raw"],
      ["quality_override", "4000"],
      ["texture_mode", "medium"],
    ],
  );
  assert.deepEqual(s.requests.find((r) => r.url.endsWith("/status"))!.body, {
    subscription_key: "private-status-key",
  });
  assert.deepEqual(s.requests.find((r) => r.url.endsWith("/download"))!.body, {
    task_uuid: "generated",
  });
  assert.equal(s.requests.at(-1)!.headers.get("authorization"), null);
  assert.deepEqual(await s.media.balance3D(s.provider.id), { balance: 12 });
});

it("resumes after shutdown without repeating the paid multipart submission", async (t) => {
  const { GenerationShutdown } = await load("media-task-journal");
  const s = await setup(t);
  const model = s.provider.models[0]!;
  const input = {
    model,
    operation: "text" as const,
    images: [],
    prompt: "a chair",
  };
  const controller = new AbortController();
  const pending = s.media.generate3D(
    model,
    input,
    controller.signal,
    await s.journal(),
  );
  const rejected = assert.rejects(pending, GenerationShutdown);
  let saved = false;
  for (let n = 0; n < 600 && !saved; n++) {
    saved = await readFile(path.join(s.root, "tasks/job.json"), "utf8")
      .then((text) => JSON.parse(text).task?.id === "generated")
      .catch(() => false);
    if (!saved) await delay(10);
  }
  assert.ok(saved);
  controller.abort(new GenerationShutdown());
  await rejected;
  await s.media.close();
  assert.deepEqual(
    (await s.restart().generate3D(model, input, undefined, await s.journal()))
      .bytes,
    GLB,
  );
  assert.equal(s.requests.filter((r) => r.url.endsWith("/rodin")).length, 1);
});

it("refreshes expired artifact URLs without resubmission and rejects downloads outside grants", async (t) => {
  let downloads = 0;
  const s = await setup(t, (r) => {
    if (r.url.endsWith("/download"))
      return json({
        list: [
          {
            name: "model.glb",
            url:
              ++downloads === 1
                ? "https://outside.example/model.glb"
                : "https://api.hyper3d.com/mock/fresh.glb",
          },
        ],
      });
  });
  const model = s.provider.models[0]!;
  const input = {
    model,
    operation: "text" as const,
    images: [],
    prompt: "a chair",
  };
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal()),
    /network|allowed|grant/i,
  );
  assert.equal(
    s.requests.some((r) => r.url.includes("outside.example")),
    false,
  );
  assert.deepEqual(
    (await s.restart().generate3D(model, input, undefined, await s.journal()))
      .bytes,
    GLB,
  );
  assert.equal(downloads, 2);
  assert.equal(s.requests.filter((r) => r.url.endsWith("/rodin")).length, 1);
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
  multipart?: { name: string; value?: string; file?: string }[];
  submission?: string;
};
const wire = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => ({ status, headers, body: JSON.stringify(body) });
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
const imageRef = { file: "reference", mediaType: "image/png", byteLength: 100 };
const generation = {
  operation: "image",
  model: "Gen-2.5-Medium",
  references: [imageRef],
  targetPolycount: 4000,
  texture: true,
  pbr: false,
};
const task = {
  phase: "status",
  id: "task-uuid",
  subscriptionKey: "status-secret",
};

it("keeps texture and text generation options and validates before a paid request", async () => {
  const requests: WireRequest[] = [];
  const fetch = async (r: WireRequest) => {
    requests.push(r);
    return wire(
      { uuid: "task-uuid", jobs: { subscription_key: "status-secret" } },
      201,
    );
  };
  await call(
    "start",
    [
      {
        ...generation,
        operation: "text",
        references: [],
        prompt: " chair ",
        texture: false,
      },
    ],
    fetch,
  );
  const text = Object.fromEntries(
    requests[0]!.multipart!.map((part) => [part.name, part.value ?? part.file]),
  );
  assert.equal(text.prompt, "chair");
  assert.equal(text.material, "None");
  assert.equal(text.tier, "Gen-2.5-Medium");
  await call(
    "start",
    [
      {
        ...generation,
        operation: "retexture",
        source: { file: "source" },
        prompt: "blue",
        pbr: true,
      },
    ],
    fetch,
  );
  assert.ok(requests[1]!.url.endsWith("/rodin_texture_only"));
  assert.equal(requests[1]!.submission, "generate");
  assert.deepEqual(
    Object.fromEntries(
      requests[1]!.multipart!.map((part) => [
        part.name,
        part.value ?? part.file,
      ]),
    ),
    {
      image: "reference",
      prompt: "blue",
      geometry_file_format: "glb",
      material: "PBR",
      model: "source",
      resolution: "Basic",
    },
  );
  const invalid = [
    { ...generation, prompt: "x".repeat(1025) },
    { ...generation, references: [{ ...imageRef, mediaType: "image/webp" }] },
    {
      ...generation,
      references: [
        { ...imageRef, byteLength: 11 * 1024 * 1024 },
        { ...imageRef, byteLength: 10 * 1024 * 1024 },
      ],
    },
    {
      ...generation,
      operation: "retexture",
      source: { file: "source" },
      references: [],
    },
    { ...generation, operation: "text", prompt: "chair" },
    { ...generation, operation: "remesh" },
  ];
  for (const input of invalid)
    await assert.rejects(call("start", [input], fetch));
  assert.equal(requests.length, 2);
});

it("waits for every known job before download and preserves errors instead of inventing success", async () => {
  let downloads = 0;
  for (const status of [[], [{ status: "Done" }, { status: "Unknown" }], {}]) {
    await assert.rejects(
      call("check", [task], async () => wire({ jobs: status })),
      /invalid task status/,
    );
  }
  const pending = await call("check", [task], async (r) => {
    if (r.url.endsWith("/download")) downloads++;
    return wire({ jobs: [{ status: "Done" }, { status: "Generating" }] });
  });
  assert.equal(pending.retryAfter, 5);
  assert.equal(downloads, 0);
  const failed = await call("check", [task], async () =>
    wire({ jobs: [{ status: "Failed" }] }),
  );
  assert.match(failed.error, /could not generate/);
  await assert.rejects(
    call("check", [task], async (r) =>
      r.url.endsWith("/status")
        ? wire({ jobs: [{ status: "Done" }] })
        : wire({
            list: [
              { name: "image.png", url: "https://api.hyper3d.com/image.png" },
            ],
          }),
    ),
    /without a GLB/,
  );
  for (const error of [
    "API_INSUFFICIENT_FUNDS",
    "NO_SUCH_TASK",
    "API_UNKNOWN",
  ]) {
    await assert.rejects(
      call("check", [task], async () => wire({ error }, 201)),
    );
  }
});

it("persists rate-limit deadlines and skips queries while a saved deadline remains", async () => {
  let calls = 0;
  const before = Date.now();
  const answer = await call("check", [task], async () => {
    calls++;
    return wire({}, 429, { "retry-after": "120" });
  });
  assert.ok(answer.task.notBefore >= before + 120000);
  assert.ok(answer.task.notBefore <= Date.now() + 120000);
  assert.equal(answer.retryAfter, 60);
  await call("check", [answer.task], async () => {
    calls++;
    throw new Error("Must wait");
  });
  assert.equal(calls, 1);
  const download = await call("check", [task], async (r) =>
    r.url.endsWith("/status")
      ? wire({ jobs: [{ status: "Done" }] })
      : wire({ error: "API_PARALLELISM_LIMIT_REACHED" }, 201, {
          "retry-after": "99999",
        }),
  );
  assert.equal(download.task.phase, "download");
  assert.ok(download.task.notBefore <= Date.now() + 300000);
  const resumed = await call(
    "check",
    [{ ...download.task, notBefore: 0 }],
    async (r) => {
      assert.ok(r.url.endsWith("/download"));
      assert.deepEqual(r.json, { task_uuid: "task-uuid" });
      return wire({
        list: [{ name: "model.glb", url: "https://api.hyper3d.com/fresh.glb" }],
      });
    },
  );
  assert.equal(resumed.outputs[0].requestId, "task-uuid");
});

it("retains an ambiguous paid response and refuses to replay it under changed inputs or credentials", async (t) => {
  const s = await setup(t, (r) =>
    r.url.endsWith("/rodin")
      ? new Response("lost reply", { status: 502 })
      : undefined,
  );
  const model = s.provider.models[0]!;
  const input = {
    model,
    operation: "text" as const,
    images: [],
    prompt: "chair",
  };
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal()),
  );
  await assert.rejects(
    s.restart().generate3D(model, input, undefined, await s.journal()),
  );
  assert.equal(
    s.requests.length,
    1,
    "an ambiguous paid POST cannot be automatically repeated",
  );
  await assert.rejects(
    s.media.generate3D(
      model,
      { ...input, prompt: "table" },
      undefined,
      await s.journal(),
    ),
    /changed/,
  );
  await s.services.configure("ohmygame/hyper3d", { apiKey: "changed-key" });
  await assert.rejects(
    s.media.generate3D(model, input, undefined, await s.journal()),
    /changed/,
  );
  assert.equal(s.requests.length, 1);
});

it("checks successful HTTP replies for API errors and requires both task credentials", async () => {
  for (const body of [
    {
      error: "API_INSUFFICIENT_FUNDS",
      uuid: "id",
      jobs: { subscription_key: "secret" },
    },
    { error: "API_PARALLELISM_LIMIT_REACHED" },
    { uuid: "id" },
    { jobs: { subscription_key: "secret" } },
    [],
    null,
  ])
    await assert.rejects(
      call("start", [generation], async () => wire(body, 201)),
    );
  await assert.rejects(
    call("start", [generation], async () =>
      wire({ error: "private-status-key" }, 401),
    ),
    /API key was rejected/,
  );
  const answer = await call("start", [generation], async () =>
    wire({ error: [], uuid: "id", jobs: { subscription_key: "secret" } }, 201),
  );
  assert.equal(answer.task.id, "id");
  assert.equal(answer.task.subscriptionKey, "secret");
});

it("honors HTTP-date retry hints and uses a bounded delay for malformed hints", async () => {
  const date = new Date(Date.now() + 90000).toUTCString();
  const answer = await call("check", [task], async () =>
    wire({}, 429, { "retry-after": date }),
  );
  assert.ok(Math.abs(answer.task.notBefore - Date.parse(date)) < 100);
  const before = Date.now();
  const malformed = await call("check", [task], async () =>
    wire({}, 429, { "retry-after": "unknown" }),
  );
  assert.ok(malformed.task.notBefore >= before + 5000);
  assert.ok(malformed.task.notBefore <= Date.now() + 5000);
});

it("preserves custom tiers and defaults across restart and uploads a real GLB for texturing", async (t) => {
  const s = await setup(t);
  const original = await s.media.listModels(s.provider.id, "3d");
  await s.media.saveModel3D(s.provider.id, {
    revision: original.editor!.revision,
    templateId: "Gen-2.5-Medium",
    model: {
      id: "my-custom-tier",
      title: "My tier",
      operations: ["text", "image"],
      polycount: {
        min: 500,
        max: 1000000,
        default: 2000,
        presets: [1000, 2000],
      },
      defaults: { texture: false, pbr: false },
    },
  });
  await s.media.setModelsShown(s.provider.id, "3d", ["my-custom-tier"], false);
  await s.media.close();
  const media = s.restart();
  assert.equal(
    (await media.model3DProviders())[0]!.models.some(
      (model) => model.id === "my-custom-tier",
    ),
    false,
  );
  await media.setModelsShown(s.provider.id, "3d", ["my-custom-tier"], true);
  const provider = (await media.model3DProviders())[0]!;
  const custom = provider.models.find(
    (model) => model.id === "my-custom-tier",
  )!;
  await media.generate3D(
    custom,
    { model: custom, operation: "text", images: [], prompt: "chair" },
    undefined,
    await s.journal("custom"),
  );
  const form = s.requests.find((r) => r.url.endsWith("/rodin"))!.form!;
  assert.equal(form.get("tier"), "my-custom-tier");
  assert.equal(form.get("quality_override"), "2000");
  assert.equal(form.get("material"), "None");
  assert.equal(form.has("texture_mode"), false);
  const model = provider.processing!;
  await media.generate3D(
    model,
    {
      model,
      operation: "retexture",
      source: GLB,
      prompt: "blue",
      pbr: true,
      images: [{ mediaType: "image/png", data: PNG.toString("base64") }],
    },
    undefined,
    await s.journal("texture"),
  );
  const texture = s.requests.find((r) =>
    r.url.endsWith("/rodin_texture_only"),
  )!.form!;
  const file = texture.get("model") as File;
  assert.equal(file.type, "model/gltf-binary");
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), GLB);
  assert.equal(texture.has("tier"), false);
  assert.equal(texture.getAll("image").length, 1);
  assert.equal(texture.get("prompt"), "blue");
  assert.equal(texture.get("material"), "PBR");
  assert.equal(texture.get("resolution"), "Basic");
});
