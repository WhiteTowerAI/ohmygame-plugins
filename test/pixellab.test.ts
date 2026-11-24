import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { it, type TestContext } from "node:test";
import type { PluginServices as Services } from "../app/src/daemon/plugin-services.js";
import type { PluginMediaProviders as Media } from "../app/src/daemon/plugin-media-providers.js";

const app = path.resolve(process.env.OHMYGAME_APP ?? "app");
const loadApp = (name: string) =>
  import(pathToFileURL(path.join(app, `src/daemon/${name}.ts`)).href);
// The app's own image library, which scales references before they are sent.
const sharp = createRequire(path.join(app, "package.json"))("sharp") as (input: Buffer | { create: object }) => {
  png(): { toBuffer(): Promise<Buffer> };
  metadata(): Promise<{ width?: number; height?: number }>;
};
const pluginRoot = fileURLToPath(
  new URL("../plugins/pixellab", import.meta.url),
);
const API = "https://api.pixellab.ai/v2";
const CDN = "https://cdn.pixellab.ai";
/** Endpoints that answer with the picture instead of a job. */
const DIRECT = new Set(["/create-image-pixflux", "/create-image-bitforge", "/image-to-pixelart", "/resize", "/remove-background", "/rotate"]);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16)]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
type Request = {
  url: string;
  method: string;
  headers: Headers;
  body?: Record<string, any>;
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
  const root = await mkdtemp(path.join(tmpdir(), "ohmygame-pixellab-"));
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
    const url = request.url;
    if (url === `${API}/create-image-pixen`)
      return json({
        image: {
          type: "base64",
          base64: `data:image/png;base64,${PNG.toString("base64")}`,
        },
      });
    if (url === `${API}/create-character-v3`)
      return json({ character_id: "c1", background_job_id: "job-c" });
    if (url === `${API}/animate-with-text-v3`)
      return json({ background_job_id: "job-f" });
    if (url === `${API}/characters/animations`)
      return json({
        animation_group_id: "g1",
        background_job_ids: ["job-a"],
        directions: ["south"],
      });
    if (url.startsWith(`${API}/background-jobs/`))
      return url.endsWith("job-f")
        ? json({ id: "job-f", status: "completed", last_response: { images: [
          { base64: `data:image/png;base64,${PNG.toString("base64")}` },
          { base64: `data:image/png;base64,${PNG.toString("base64")}` },
        ] } })
        : json({ id: "job", status: "completed", last_response: {
          images: [{ base64: PNG.toString("base64") }, { base64: PNG.toString("base64") }],
          files: { json: `${CDN}/effect.json`, gif: `${CDN}/effect.gif` },
        } });
    if (url.startsWith(`${API}/characters/c1/gif`) || url.startsWith(`${API}/characters/c2/gif`) || url.startsWith(`${API}/objects/o1/gif`))
      return new Response(GIF, { headers: { "content-type": "image/gif" } });
    if (url === `${API}/objects/o1/animations`)
      return json({ animation_group_id: "og", submissions: [{ direction: "south", background_job_id: "job-oa" }] });
    if (url === `${API}/create-character-state`)
      return json({ character_id: "c2", background_job_id: "job-s" });
    if (url === `${API}/objects/o1`)
      // A Pro Flash object, as PixelLab returns it: no named rotations, one stored picture.
      return json({ id: "o1", status: "completed", rotation_urls: { south: null, west: null }, frame_urls: null, storage_urls: { unknown: "https://backblaze.pixellab.ai/file/o1/rotations/unknown.png" } });
    if (url === `${API}/tilesets/t1?layout=tileset15` || url === `${API}/tilesets-sidescroller/t1?layout=tileset15`)
      return json({ sheet: { layout: "tileset15", image: { type: "base64", base64: PNG.toString("base64") } } });
    if (url === `${API}/isometric-tiles/i1`)
      return json({ image: { type: "base64", base64: PNG.toString("base64") } });
    if (url === `${API}/tiles-pro/i1`)
      return json({ storage_urls: { tile_0: `${CDN}/tile-0.png`, tile_1: `${CDN}/tile-1.png` } });
    if (url.endsWith(".png") && (url.startsWith(CDN) || url.startsWith("https://supabase.pixellab.ai/") || url.startsWith("https://backblaze.pixellab.ai/")))
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    if (url === `${CDN}/effect.gif`)
      return new Response(GIF, { headers: { "content-type": "image/gif" } });
    if (DIRECT.has(url.slice(API.length)))
      return json({ image: { type: "base64", base64: `data:image/png;base64,${PNG.toString("base64")}` } });
    if (request.method === "POST" && url.startsWith(API))
      return json({ background_job_id: "job-n", character_id: "c1", object_id: "o1", tileset_id: "t1", tile_id: "i1" });
    return json({ detail: "not found" }, 404);
  };
  const media: Media = new PluginMediaProviders(services, fetcher, undefined, undefined, root);
  await services.configure("ohmygame/pixellab", { apiKey: "pl-test-key" });
  await services.setEveryProject("ohmygame/pixellab", true);
  const [provider] = await media.imageProviders();
  assert.ok(provider, "PixelLab lists its image models once configured");
  const model = (id: string) => provider.models.find((m) => m.id === id)!;
  return {
    media,
    requests,
    model,
    restart: (): Media => new PluginMediaProviders(services, fetcher, undefined, undefined, root),
    journal: (id = "job-1") => mediaTaskJournal(path.join(root, "tasks"), id),
    GenerationShutdown,
  };
}

it("declares beta image models with their reference rules", async (t) => {
  const s = await setup(t);
  assert.deepEqual(
    ["pixen", "character", "skeleton-animation", "frame-animation"].map((id) => {
      const { maxReferenceImages, minReferenceImages, promptOptionalWithReference } = s.model(id);
      return { id, maxReferenceImages, minReferenceImages, promptOptionalWithReference };
    }),
    [
      { id: "pixen", maxReferenceImages: 0, minReferenceImages: undefined, promptOptionalWithReference: undefined },
      { id: "character", maxReferenceImages: 1, minReferenceImages: undefined, promptOptionalWithReference: true },
      { id: "skeleton-animation", maxReferenceImages: 1, minReferenceImages: 1, promptOptionalWithReference: undefined },
      { id: "frame-animation", maxReferenceImages: 1, minReferenceImages: 1, promptOptionalWithReference: undefined },
    ],
  );
});

it("makes Pixen art in one submitted request", async (t) => {
  const s = await setup(t);
  const image = await s.media.generateImage(
    s.model("pixen"),
    { prompt: "a mossy rock", transparentBackground: true },
    undefined,
    { journal: await s.journal() },
  );
  assert.deepEqual(image, { bytes: PNG, mediaType: "image/png" });
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0]!.headers.get("authorization"), "Bearer pl-test-key");
  assert.deepEqual(s.requests[0]!.body, {
    description: "a mossy rock",
    image_size: { width: 512, height: 512 },
    no_background: true,
  });
});

it("uses a connected character reference when its description is empty", async (t) => {
  const s = await setup(t);
  const reference = await sharp({
    create: { width: 128, height: 128, channels: 4, background: "#336699" },
  })
    .png()
    .toBuffer();
  await s.media.generateImage(
    s.model("character"),
    { prompt: "", images: [{ mediaType: "image/png", data: reference.toString("base64") }] },
    undefined,
    { journal: await s.journal() },
  );
  assert.equal(
    s.requests.find((request) => request.url === `${API}/create-character-v3`)?.body?.description,
    "the character in the reference image",
  );
});

it("animates a scaled reference and downloads the GIF with the key", async (t) => {
  const s = await setup(t);
  const reference = await sharp({
    create: { width: 512, height: 384, channels: 4, background: "#336699" },
  })
    .png()
    .toBuffer();
  const image = await s.media.generateImage(
    s.model("skeleton-animation"),
    {
      prompt: "walk in place",
      images: [{ mediaType: "image/png", data: reference.toString("base64") }],
    },
    undefined,
    { journal: await s.journal() },
  );
  assert.deepEqual(image, { bytes: GIF, mediaType: "image/gif" });
  const posts = s.requests.filter((r) => r.method === "POST");
  assert.deepEqual(
    posts.map((r) => r.url),
    [`${API}/create-character-v3`, `${API}/characters/animations`],
  );
  const sent = posts[0]!.body!.reference_image.base64 as string;
  assert.match(sent, /^data:image\/png;base64,/);
  const { width, height } = await sharp(
    Buffer.from(sent.split(",")[1]!, "base64"),
  ).metadata();
  assert.deepEqual({ width, height }, { width: 256, height: 192 });
  assert.deepEqual(posts[1]!.body, {
    character_id: "c1",
    description: "the character in the reference image",
    action_description: "walk in place",
    mode: "skeleton-v3",
    directions: ["south"],
  });
  const download = s.requests.at(-1)!;
  assert.equal(
    download.url,
    `${API}/characters/c1/gif?animation_group_id=g1&direction=south`,
  );
  assert.equal(download.headers.get("authorization"), "Bearer pl-test-key");
});

it("generates ordinary frame animation from a reference and action", async (t) => {
  const s = await setup(t);
  const reference = await sharp({
    create: { width: 128, height: 128, channels: 4, background: "#336699" },
  }).png().toBuffer();
  const frames = await s.media.generateImage(
    s.model("frame-animation"),
    { prompt: "run in place", images: [{ mediaType: "image/png", data: reference.toString("base64") }] },
    undefined,
    { journal: await s.journal("frame-animation") },
  );
  assert.equal(frames.mediaType, "image/gif");
  assert.equal(frames.bytes.subarray(0, 6).toString("ascii"), "GIF89a");
  const request = s.requests.find((r) => r.url === `${API}/animate-with-text-v3`)!;
  assert.equal(request.headers.get("authorization"), "Bearer pl-test-key");
  assert.equal(request.body?.action, "run in place");
  assert.equal(request.body?.frame_count, 8);
});

it("resumes a character job after shutdown without paying again", async (t) => {
  let ready = false;
  const s = await setup(t, (r) =>
    r.url.startsWith(`${API}/background-jobs/`) && !ready
      ? json({ id: "job-c", status: "processing" })
      : undefined,
  );
  const stop = new AbortController();
  const first = s.media.generateImage(
    s.model("character"),
    { prompt: "a knight" },
    stop.signal,
    { journal: await s.journal() },
  );
  while (!s.requests.some((r) => r.url.startsWith(`${API}/background-jobs/`)))
    await new Promise((resolve) => setTimeout(resolve, 50));
  stop.abort(new s.GenerationShutdown());
  await assert.rejects(first);
  ready = true;
  const image = await s
    .restart()
    .generateImage(s.model("character"), { prompt: "a knight" }, undefined, {
      journal: await s.journal(),
      resuming: true,
    });
  assert.equal(image.mediaType, "image/gif");
  assert.equal(
    s.requests.filter((r) => r.method === "POST").length,
    1,
    "Only the original character request is paid",
  );
  assert.equal(s.requests.at(-1)!.url, `${API}/characters/c1/gif`);
});

it("shows PixelLab's error and refuses an animation without a reference", async (t) => {
  const s = await setup(t, (r) =>
    r.url.endsWith("/create-image-pixen")
      ? json({ detail: [{ msg: "Not enough credits" }] }, 402)
      : undefined,
  );
  await assert.rejects(
    s.media.generateImage(s.model("pixen"), { prompt: "x" }, undefined, {
      journal: await s.journal(),
    }),
    /PixelLab 402: Not enough credits/,
  );
  await assert.rejects(
    s.media.generateImage(
      s.model("skeleton-animation"),
      { prompt: "run" },
      undefined,
      { journal: await s.journal("no-reference") },
    ),
    /Skeleton animation needs one character reference image/,
  );
});

const picture = async (width: number, height: number, format: "png" | "jpeg" | "webp" = "png") => {
  const image = sharp({ create: { width, height, channels: 4, background: "#336699" } }) as unknown as Record<string, () => { toBuffer(): Promise<Buffer> }>;
  return { mediaType: `image/${format}` as const, data: (await image[format]!().toBuffer()).toString("base64") };
};

it("declares every PixelLab model the plugin implements", async (t) => {
  const s = await setup(t);
  const [provider] = await s.media.imageProviders();
  assert.equal(provider!.models.length, 38);
  assert.equal(s.model("interpolation").minReferenceImages, 2);
  assert.equal(s.model("tileset").maxReferenceImages, 0);
  assert.equal(s.model("to-pixel-art").promptOptionalWithReference, true);
  assert.equal(s.model("pixflux").supportsResolution, false);
  // Pixen makes one size, so the node offers no size to pick.
  assert.equal(s.model("pixen").supportsResolution, false);
  assert.deepEqual(s.model("character").params?.map((param: { key: string }) => param.key), ["directions", "view"]);
  assert.deepEqual(s.model("interpolation").referenceImageLabels, ["Start picture", "End picture"]);
  // Each Asset preset is a workflow of the plugin's own models, linked in order.
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, ".ohmygame-plugin/plugin.json"), "utf8"));
  const ids = new Set(provider!.models.map((model: { id: string }) => model.id));
  for (const preset of manifest.contributes.canvasPresets) {
    const board = JSON.parse(await readFile(path.join(pluginRoot, preset.board), "utf8"));
    assert.ok(board.nodes.length > 1, preset.id);
    for (const node of board.nodes) if (node.data.model) assert.ok(ids.has(node.data.model.id), `${preset.id} ${node.data.model.id}`);
  }
});

it("sends each model's request and returns its result", async (t) => {
  const s = await setup(t);
  const ref = await picture(64, 64);
  type Case = {
    model: string;
    prompt?: string;
    images?: number;
    params?: Record<string, string | number | boolean>;
    aspectRatio?: "16:9";
    post: string[];
    body?: Record<string, unknown>;
    result?: string;
  };
  const cases: Case[] = [
    { model: "pixflux", aspectRatio: "16:9", post: ["/create-image-pixflux"], body: { image_size: { width: 192, height: 108 } } },
    { model: "bitforge", images: 1, post: ["/create-image-bitforge"], body: { style_strength: 50 } },
    { model: "image-pro", images: 2, post: ["/generate-image-v2"] },
    { model: "style-pro", images: 1, post: ["/generate-with-style-v2"] },
    { model: "image-pro-flash", post: ["/create-image-pro-flash"], body: { image_size: { width: 128, height: 128 } } },
    { model: "ui", post: ["/generate-ui-v2"] },
    { model: "to-pixel-art", prompt: "", images: 1, post: ["/image-to-pixelart"], body: { image_size: { width: 64, height: 64 }, output_size: { width: 16, height: 16 } } },
    { model: "to-pixel-art-pro-flash", prompt: "", images: 1, post: ["/image-to-pixelart-pro-flash"] },
    { model: "resize-2x", prompt: "", images: 1, post: ["/resize"], body: { target_size: { width: 128, height: 128 }, description: "the subject in the reference image" } },
    { model: "remove-background", prompt: "", images: 1, post: ["/remove-background"] },
    { model: "normal-map", prompt: "", images: 1, post: ["/normal-map"] },
    { model: "edit", images: 1, post: ["/edit-image"], body: { width: 64, height: 64 } },
    { model: "edit-pro", images: 1, post: ["/edit-images-v2"], body: { method: "edit_with_text" } },
    { model: "edit-pro-flash", images: 1, post: ["/edit-image-pro-flash"] },
    { model: "character-4", images: 1, post: ["/create-character-with-4-directions"], body: { image_size: { width: 64, height: 64 } }, result: "image/gif" },
    { model: "character-8", post: ["/create-character-with-8-directions"], body: { mode: "standard" }, result: "image/gif" },
    { model: "character", params: { directions: "4", view: "side" }, post: ["/create-character-v3"], body: { n_directions: 4, view: "side" }, result: "image/gif" },
    { model: "character-pro", post: ["/create-character-pro"], result: "image/gif" },
    { model: "character-pro-flash", prompt: "", images: 1, post: ["/create-character-pro-flash"], result: "image/gif" },
    { model: "character-state", images: 1, post: ["/create-character-v3", "/create-character-state"], result: "image/gif" },
    { model: "pixminimax-animation", images: 1, post: ["/animate-pixminimax"], result: "image/gif" },
    { model: "animation-pro", images: 1, post: ["/animate-with-text-v2"], result: "image/gif" },
    { model: "interpolation", images: 2, post: ["/interpolation-v2"], result: "image/gif" },
    { model: "rotate", prompt: "", params: { to: "north-east" }, images: 1, post: ["/rotate"], body: { from_direction: "south", to_direction: "north-east" } },
    { model: "rotations-8", prompt: "", images: 1, post: ["/generate-8-rotations-v3"], result: "image/gif" },
    { model: "rotations-8-pro", post: ["/generate-8-rotations-v2"], body: { method: "create_with_style" }, result: "image/gif" },
    { model: "object", post: ["/create-object-pro-flash"], body: { view: "low top-down" } },
    { model: "object-pro", post: ["/create-1-direction-object"] },
    { model: "object-8", post: ["/create-8-direction-object"], body: { size: 64 }, result: "image/gif" },
    { model: "object-animation", images: 1, post: ["/create-object-pro-flash", "/objects/o1/animations"], result: "image/gif" },
    { model: "tileset", prompt: "grass", params: { upper: "water", transition: "sand", tileSize: "16" }, post: ["/create-tileset"], body: { lower_description: "grass", upper_description: "water", transition_description: "sand", tile_size: { width: 16, height: 16 }, view: "high top-down" } },
    { model: "tileset-sidescroller", prompt: "stone bricks", params: { surface: "moss" }, post: ["/create-tileset-sidescroller"], body: { lower_description: "stone bricks", transition_description: "moss", tile_size: { width: 32, height: 32 } } },
    { model: "isometric-tile", post: ["/create-isometric-tile"] },
    { model: "tiles-pro", post: ["/create-tiles-pro"] },
    { model: "vfx", images: 1, params: { artist: "pro" }, post: ["/vfx"], body: { artist: "pro" }, result: "image/gif" },
  ];
  for (const item of cases) {
    const before = s.requests.length;
    const image = await s.media.generateImage(
      s.model(item.model),
      {
        prompt: item.prompt ?? "a mossy rock",
        ...(item.aspectRatio ? { aspectRatio: item.aspectRatio } : {}),
        ...(item.params ? { params: item.params } : {}),
        images: Array.from({ length: item.images ?? 0 }, () => ref),
      },
      undefined,
      { journal: await s.journal(item.model) },
    );
    assert.equal(image.mediaType, item.result ?? "image/png", item.model);
    const posts = s.requests.slice(before).filter((r) => r.method === "POST");
    assert.deepEqual(posts.map((r) => r.url.slice(API.length)), item.post, item.model);
    for (const [key, value] of Object.entries(item.body ?? {}))
      assert.deepEqual(posts[0]!.body?.[key], value, `${item.model} ${key}`);
  }
});

it("reads JPEG and WebP reference sizes and refuses a tileset without its upper terrain", async (t) => {
  const s = await setup(t);
  await s.media.generateImage(
    s.model("remove-background"),
    { prompt: "", images: [await picture(48, 40, "webp")] },
    undefined,
    { journal: await s.journal("webp") },
  );
  await s.media.generateImage(
    s.model("edit"),
    { prompt: "add a hat", images: [await picture(36, 52, "jpeg")] },
    undefined,
    { journal: await s.journal("jpeg") },
  );
  const sizes = s.requests.filter((r) => r.method === "POST").map((r) => r.body?.image_size);
  assert.deepEqual(sizes, [{ width: 48, height: 40 }, { width: 36, height: 52 }]);
  await assert.rejects(
    s.media.generateImage(s.model("tileset"), { prompt: "grass" }, undefined, { journal: await s.journal("tileset") }),
    /Set the upper terrain/,
  );
  // A setting the model doesn't have never reaches PixelLab.
  await assert.rejects(
    s.media.generateImage(s.model("pixflux"), { prompt: "grass", params: { view: "side" } }, undefined, { journal: await s.journal("pixflux") }),
    /has no settings/,
  );
});
