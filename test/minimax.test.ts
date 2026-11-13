import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
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
  ] = await Promise.all([
    loadApp("plugin-services"),
    loadApp("plugin-media-providers"),
    loadApp("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-minimax-"));
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
    if (request.method === "POST") return json({ task_id: "task-1" });
    if (request.url.startsWith("https://cdn.hailuoai.com/"))
      return new Response(MP4, { headers: { "content-type": "video/mp4" } });
    return done();
  };
  const media: Media = new PluginMediaProviders(services, fetcher);
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
    restart: (): Media => new PluginMediaProviders(services, fetcher),
    journal: () => mediaTaskJournal(path.join(root, "tasks"), "job-1"),
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

it("stops locally without calling MiniMax's destructive DELETE endpoint", async (t) => {
  const controller = new AbortController();
  const s = await setup(t, (r) => {
    if (r.url.includes("/query/")) {
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
