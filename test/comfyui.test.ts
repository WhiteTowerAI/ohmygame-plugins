import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const load = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
const plugin = fileURLToPath(new URL("../plugins/comfyui", import.meta.url));
const SERVER = "http://127.0.0.1:8188";
const sharp = createRequire(path.join(app, "package.json"))("sharp") as (
  input: Buffer | { create: object },
) => {
  png(): { toBuffer(): Promise<Buffer> };
  metadata(): Promise<{ width?: number; height?: number }>;
};
const PNG = await sharp({
  create: { width: 832, height: 1216, channels: 3, background: "#336699" },
})
  .png()
  .toBuffer();
const workflow = {
  "3": {
    class_type: "KSampler",
    inputs: {
      positive: ["6", 0],
      negative: ["7", 0],
      seed: 42,
      latent_image: ["5", 0],
      model: ["4", 0],
    },
  },
  "4": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "my-model.safetensors" },
  },
  "5": {
    class_type: "EmptyLatentImage",
    inputs: { width: 832, height: 1216, batch_size: 1 },
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "old prompt", clip: ["4", 1] },
    _meta: { title: "Positive", custom: "keep" },
  },
  "7": {
    class_type: "CLIPTextEncode",
    inputs: { text: "bad hands", clip: ["4", 1] },
  },
  "8": {
    class_type: "VAEDecode",
    inputs: { samples: ["3", 0], vae: ["4", 2] },
  },
  "9": {
    class_type: "SaveImage",
    inputs: { images: ["8", 0], filename_prefix: "my-images" },
  },
};
const config = {
  workflow: JSON.stringify(workflow),
  promptNode: "6",
  promptInput: "text",
  outputNode: "9",
};
const completed = {
  "prompt-1": {
    status: {
      status_str: "success",
      completed: true,
      messages: [["execution_success", { prompt_id: "prompt-1" }]],
    },
    outputs: {
      "9": {
        images: [
          { filename: "图 #1.png", subfolder: "my folder", type: "output" },
        ],
      },
    },
  },
};
type Request = { url: string; method: string; body?: any; headers: Headers };
async function setup(
  t: TestContext,
  reply?: (request: Request) => Response | Promise<Response> | undefined,
) {
  const [
    { PluginServices },
    { PluginMediaProviders },
    { mediaTaskJournal, GenerationShutdown },
  ] = await Promise.all([
    load("plugin-services"),
    load("plugin-media-providers"),
    load("media-task-journal"),
  ]);
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-comfyui-"));
  let services: Services;
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const request = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string"
        ? { body: JSON.parse(init.body) }
        : {}),
    };
    requests.push(request);
    const answer = await reply?.(request);
    if (answer) return answer;
    if (request.url.endsWith("/prompt"))
      return Response.json({
        prompt_id: "prompt-1",
        number: 1,
        node_errors: {},
      });
    if (request.url.includes("/history/")) return Response.json(completed);
    if (request.url.startsWith(`${SERVER}/view?`))
      return new Response(new Uint8Array(PNG), {
        headers: { "content-type": "image/png" },
      });
    throw new Error("Unexpected request: " + request.url);
  };
  const start = async () => {
    services = new PluginServices({ directory: path.join(root, "store") });
    await services.installManaged(plugin, { consent: false });
    await services.setEveryProject("ohmygame/comfyui", true);
    return new PluginMediaProviders(services, fetcher) as Media;
  };
  let media = await start();
  await services!.configure("ohmygame/comfyui", config);
  t.after(async () => {
    await media.close();
    await services.close();
    await rm(root, { recursive: true, force: true });
  });
  const model = (await media.imageProviders())[0]!.models[0]!;
  return {
    media,
    model,
    requests,
    root,
    GenerationShutdown,
    configure: (changes: Record<string, string | null>) =>
      services.configure("ohmygame/comfyui", changes),
    restart: async () => {
      await media.close();
      await services.close();
      media = await start();
      return media;
    },
    journal: (id = "job-1") => mediaTaskJournal(path.join(root, "tasks"), id),
  };
}

it("uses the real host sandbox to preserve a workflow and import only its selected image", async (t) => {
  const s = await setup(t);
  assert.equal(s.model.supportsResolution, false);
  assert.equal(s.model.supportsAspectRatio, false);
  const result = await s.media.generateImage(
    s.model,
    { prompt: "森林 fox", resolution: "4K", aspectRatio: "21:9" },
    undefined,
    { journal: await s.journal() },
  );
  assert.deepEqual(result.bytes, PNG);
  const dimensions = await sharp(result.bytes).metadata();
  assert.equal(dimensions.width, 832);
  assert.equal(dimensions.height, 1216);
  const expected = structuredClone(workflow);
  expected["6"].inputs.text = "森林 fox";
  assert.deepEqual(s.requests[0]!.body, { prompt: expected });
  assert.equal(s.requests[0]!.headers.has("authorization"), false);
  assert.equal(
    s.requests[2]!.url,
    `${SERVER}/view?filename=${encodeURIComponent("图 #1.png")}&subfolder=my%20folder&type=output`,
  );
});

it("recovers the original submission after task-save failure, settings replacement and a new host", async (t) => {
  const s = await setup(t),
    journal = await s.journal();
  journal.save = async () => {
    throw new Error("disk unavailable");
  };
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, { journal }),
    /disk unavailable/,
  );
  await s.configure({
    workflow: null,
    promptNode: "missing",
    outputNode: "other",
  });
  const next = await s.restart();
  assert.deepEqual(
    (
      await next.generateImage(s.model, { prompt: "fox" }, undefined, {
        journal: await s.journal(),
      })
    ).bytes,
    PNG,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  await assert.rejects(
    next.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal("new-job"),
    }),
    /Configure workflow/,
  );
});

it("waits for the original queued prompt, then recovers after local shutdown without interruption", async (t) => {
  let complete = false;
  const stopped = new AbortController();
  const s = await setup(t, (r) => {
    if (!complete && r.url.includes("/history/")) return Response.json({});
    if (r.url.endsWith("/queue")) {
      setTimeout(() => stopped.abort(new s.GenerationShutdown()), 50);
      return Response.json({
        queue_running: [[0, "prompt-1"]],
        queue_pending: [],
      });
    }
  });
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, stopped.signal, {
      journal: await s.journal(),
    }),
    /shut|stopp/i,
  );
  complete = true;
  const next = await s.restart();
  assert.deepEqual(
    (
      await next.generateImage(s.model, { prompt: "fox" }, undefined, {
        journal: await s.journal(),
      })
    ).bytes,
    PNG,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(
    s.requests.some((r) => r.url.endsWith("/interrupt")),
    false,
  );
});

for (const [name, changes] of Object.entries<Record<string, string>>({
  "editor JSON": { workflow: JSON.stringify({ nodes: [], links: [] }) },
  "unknown prompt": { promptNode: "missing" },
  "linked input": { promptNode: "3", promptInput: "positive" },
  "wrong output": { outputNode: "8" },
  "disconnected prompt": {
    workflow: JSON.stringify({
      ...workflow,
      "10": { class_type: "CLIPTextEncode", inputs: { text: "unconnected" } },
    }),
    promptNode: "10",
  },
}))
  it(`rejects ${name} before submitting a workflow`, async (t) => {
    const s = await setup(t);
    await s.configure(changes);
    await assert.rejects(
      s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
        journal: await s.journal(),
      }),
      /API format|prompt|SaveImage|input/,
    );
    assert.equal(s.requests.length, 0);
  });

it("does not resubmit after missing history, a lost response or a failed result download", async (t) => {
  let mode = "missing";
  const s = await setup(t, (r) => {
    if (mode === "lost" && r.url.endsWith("/prompt"))
      throw new Error("connection lost");
    if (mode === "missing" && r.url.includes("/history/"))
      return Response.json({});
    if (r.url.endsWith("/queue"))
      return Response.json({ queue_running: [], queue_pending: [] });
    if (mode === "download" && r.url.includes("/view?"))
      throw new Error("offline");
  });
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal(),
    }),
    /no longer lists/,
  );
  mode = "download";
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal(),
    }),
    /download/,
  );
  mode = "ready";
  assert.deepEqual(
    (
      await s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
        journal: await s.journal(),
      })
    ).bytes,
    PNG,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  mode = "lost";
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal("lost"),
    }),
    /could not be reached/,
  );
  mode = "ready";
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal("lost"),
    }),
    /uncertain|confirm|lost/,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 2);
});

it("reports execution failure even when a partial output exists", async (t) => {
  const s = await setup(t, (r) =>
    r.url.includes("/history/")
      ? Response.json({
          "prompt-1": {
            ...completed["prompt-1"],
            status: {
              completed: false,
              status_str: "error",
              messages: [
                ["execution_error", { exception_message: "model missing" }],
              ],
            },
          },
        })
      : undefined,
  );
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal(),
    }),
    /model missing/,
  );
  assert.equal(
    s.requests.some((r) => r.url.includes("/view?")),
    false,
  );
});

it("retains a successful submission with no prompt ID without submitting again", async (t) => {
  const s = await setup(t, (r) =>
    r.url.endsWith("/prompt") ? Response.json(null) : undefined,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(
      s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
        journal: await s.journal(),
      }),
      /did not return a prompt ID/,
    );
  }
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
});

it("retains successful history with malformed output without downloading arbitrary data", async (t) => {
  const s = await setup(t, (r) =>
    r.url.includes("/history/")
      ? Response.json({
          "prompt-1": {
            ...completed["prompt-1"],
            outputs: {
              "9": {
                images: {
                  "0": {
                    filename: "result.png",
                    subfolder: "",
                    type: "output",
                  },
                },
              },
            },
          },
        })
      : undefined,
  );
  await assert.rejects(
    s.media.generateImage(s.model, { prompt: "fox" }, undefined, {
      journal: await s.journal(),
    }),
    /no downloadable image/,
  );
  assert.equal(s.requests.filter((r) => r.method === "POST").length, 1);
  assert.equal(
    s.requests.some((r) => r.url.includes("/view?")),
    false,
  );
});
