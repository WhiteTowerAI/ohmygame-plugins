import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

// The Library sources' native code, run with a stand-in context and, for the
// online ones, a stand-in fetch. official.test.ts checks their packages.

type Command = (input: Record<string, unknown>) => Promise<any>;

const realFetch = globalThis.fetch;
const folders: string[] = [];

afterEach(async () => {
  globalThis.fetch = realFetch;
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function activate(plugin: string, configuration: Record<string, unknown> = {}, ...extra: unknown[]) {
  const dataFolder = await mkdtemp(path.join(tmpdir(), `ohmygame-${plugin}-`));
  folders.push(dataFolder);
  const module = await import(pathToFileURL(path.resolve("plugins", plugin, "native/index.mjs")).href);
  const commands: Record<string, Command> = {};
  module.activate({ dataFolder, configuration, registerCommand: (name: string, handler: Command) => (commands[name] = handler) }, ...extra);
  return { module, commands, dataFolder };
}

function stubFetch(answer: (url: string) => Response | Promise<Response>): string[] {
  const requests: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    requests.push(String(url));
    return answer(String(url));
  }) as typeof fetch;
  return requests;
}

describe("pixel-sprites", () => {
  const COMMIT = "9687c39d60881ba80208e671ba12ac216019b1d0";
  const gz = (bytes: ArrayLike<number> | string) => gzipSync(typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes as ArrayLike<number>));
  // A page of three sprites: each one's colour count, its colours as palette tokens, then 256 indices per sprite.
  function page(): Buffer {
    const indices = Buffer.alloc(3 * 256);
    indices.fill(1, 0, 256); // sprite 0: all its second colour
    indices[256 + 17] = 1; // sprite 1: one pixel of its second colour at (1, 1)
    return Buffer.concat([Buffer.from([2, 2, 1]), Buffer.from(Uint16Array.from([0, 1, 0, 2, 0]).buffer), indices]);
  }
  const palette = Buffer.from([0, 0, 0, 255, 0, 0, 0, 0, 255]);
  const files: Record<string, Buffer> = {
    "manifest.json": Buffer.from(JSON.stringify({ dims: 4, catalog_sprites: 3 })),
    "subjects.txt.z": gz("apple\nsword"),
    "terms-a.txt.z": gz("apple\nred\nsword"),
    "vec-a.bin": Buffer.alloc(12),
    "freq-a.bin.z": gz([1, 1, 1]),
    "vec-s.bin": Buffer.alloc(8),
    "terms-b.txt.z": gz("fruit"),
    "vec-b.bin": Buffer.alloc(4),
    "catalog-subjects.bin.z": gz(new Uint8Array(Uint32Array.from([0, 1, 3]).buffer)),
    // Word counts, then the words' low bytes, then their high bytes.
    "catalog-captions.bin.z": gz([1, 2, 0, 0, 1, 2, 0, 0, 0]),
    "palette.bin.z": gz(palette),
  };

  it("reads captions from the search data, and a sprite's pixels from its page", async () => {
    const { module } = await activate("pixel-sprites");
    const atlas = module.loadAtlas((name: string) => files[name]);
    assert.equal(atlas.total, 3);
    // Before captions come, a sprite is named by its subject.
    assert.deepEqual([0, 1, 2].map((sprite) => atlas.caption(sprite)), ["apple", "sword", "sword"]);
    atlas.addCaptions(files["catalog-captions.bin.z"]);
    // A sprite without caption words keeps its subject.
    assert.deepEqual([0, 1, 2].map((sprite) => atlas.caption(sprite)), ["apple", "red sword", "sword"]);
    const red = module.spritePixels(page(), 3, 0, palette);
    assert.deepEqual([...red.subarray(0, 4)], [255, 0, 0, 255]);
    const dot = module.spritePixels(page(), 3, 1, palette);
    assert.deepEqual([...dot.subarray(17 * 4, 17 * 4 + 4)], [0, 0, 255, 255]);
    // Token 0 is transparent.
    assert.deepEqual([...dot.subarray(0, 4)], [0, 0, 0, 0]);
  });

  it("reads 32-bit numbers from a Buffer that is a view into a larger block", async () => {
    const { module } = await activate("pixel-sprites");
    // Node may hand out a Buffer at an offset into shared memory, where `.buffer` holds more than its bytes.
    const block = Buffer.alloc(64, 0xff);
    Buffer.from(Uint32Array.from([0, 1, 3]).buffer).copy(block, 5);
    assert.deepEqual([...module.uint32(block.subarray(5, 17))], [0, 1, 3]);
  });

  it("scales a sprite up with each pixel kept square, and names files by caption", async () => {
    const { module } = await activate("pixel-sprites");
    const dot = module.spritePixels(page(), 3, 1, palette);
    const png = module.spritePng(dot, 4);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [64, 64]);
    assert.equal(module.fileName("Pointing down silver sword!", 42), "pointing-down-silver-sword-42.png");
    assert.equal(module.english("红色 剑"), "red sword");
    assert.equal(module.english("  Red Dragon "), "red dragon");
  });

  it("downloads the search data once from the pinned commit, and pages from the Space's site while it matches", async () => {
    const requests: string[] = [];
    let siteManifest = files["manifest.json"]!;
    const SITE = "https://cfahlgren1-pixel-search.static.hf.space/data/";
    const PINNED = `https://huggingface.co/spaces/cfahlgren1/pixel-search/resolve/${COMMIT}/static/data/`;
    stubFetch((url) => {
      requests.push(url);
      if (url === `${SITE}manifest.json`) return new Response(new Uint8Array(siteManifest));
      if (url.endsWith("/pages/0.bin.z")) return new Response(gz(page()));
      const name = url.startsWith(SITE) ? url.slice(SITE.length) : url.slice(PINNED.length);
      return files[name] ? new Response(new Uint8Array(files[name])) : new Response("", { status: 404 });
    });
    const captionsKept = async (folder: string) => {
      for (let tries = 0; tries < 100 && !(await readFile(path.join(folder, COMMIT, "catalog-captions.bin.z")).catch(() => undefined)); tries++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      await new Promise((resolve) => setTimeout(resolve, 10));
    };
    const asked: string[] = [];
    const fake = (read: (name: string) => Buffer) => ({
      ...activateAtlas(read),
      engine: { search: (words: string, limit: number) => (asked.push(words), { sprites: Uint32Array.from([1, 0, 2].slice(0, limit)) }) },
    });
    let activateAtlas: (read: (name: string) => Buffer) => Record<string, unknown>;
    const first = await activate("pixel-sprites", { scale: "4" }, fake);
    activateAtlas = (read) => { const atlas = first.module.loadAtlas(read); return { total: atlas.total, palette: atlas.palette, caption: atlas.caption, addCaptions: atlas.addCaptions }; };

    // The first search needn't wait for captions: results are named by subject until they come.
    const early = await first.commands.search!({ query: "红色", collection: "weapon" });
    assert.deepEqual(asked, ["red weapon"]);
    assert.deepEqual(early.items.map((item: { id: string; name: string }) => [item.id, item.name]), [["1", "sword"], ["0", "apple"], ["2", "sword"]]);
    await captionsKept(first.dataFolder);
    const found = await first.commands.search!({ query: "红色", collection: "weapon" });
    assert.deepEqual(found.items.map((item: { id: string; name: string }) => [item.id, item.name]), [["1", "red sword"], ["0", "apple"], ["2", "sword"]]);
    assert.deepEqual(found.items[0], {
      id: "1", name: "red sword", mediaType: "image", thumbnail: found.items[0].thumbnail, width: 64, height: 64,
      author: "Angais (AI-generated)", license: "CC0 1.0", url: "https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m",
    });
    assert.ok(found.items[0].thumbnail.startsWith("data:image/png;base64,iVBORw0KGgo"));
    // The pinned manifest, then everything else from the faster site, which serves the same build.
    assert.deepEqual(requests.filter((url) => url.startsWith(PINNED)), [`${PINNED}manifest.json`]);
    assert.equal(requests.filter((url) => url.startsWith(SITE) && !url.includes("/pages/")).length, 11);
    assert.ok(requests.includes(`${SITE}pages/0.bin.z`));

    // Added at the size in Settings, named by its caption.
    assert.deepEqual(await first.commands.fetch!({ id: "1", mediaType: "image" }), {
      file: "sprite.png", name: "red-sword-1@4x.png", author: "Angais (AI-generated)", license: "CC0 1.0", url: "https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m",
    });
    assert.equal((await readFile(path.join(first.dataFolder, "sprite.png"))).readUInt32BE(16), 64);
    await assert.rejects(first.commands.fetch!({ id: "3", mediaType: "image" }), /isn't a Pixel Art Atlas sprite/);

    // Started again on the same folder, nothing is downloaded again.
    requests.length = 0;
    const second = await import(pathToFileURL(path.resolve("plugins/pixel-sprites/native/index.mjs")).href);
    const commands: Record<string, Command> = {};
    second.activate({ dataFolder: first.dataFolder, configuration: {}, registerCommand: (name: string, handler: Command) => (commands[name] = handler) }, fake);
    await commands.search!({ query: "sword" });
    await captionsKept(first.dataFolder);
    // Only the site's manifest is asked, to know where new pages would come from.
    assert.deepEqual(requests, [`${SITE}manifest.json`]);

    // A Space rebuilt since the pin serves pages from the pinned commit.
    siteManifest = Buffer.from(JSON.stringify({ dims: 4, catalog_sprites: 9 }));
    const fresh = await activate("pixel-sprites", {}, fake);
    requests.length = 0;
    await fresh.commands.search!({ query: "sword" });
    await captionsKept(fresh.dataFolder);
    assert.ok(requests.includes(`${PINNED}pages/0.bin.z`));
    assert.ok(requests.includes(`${PINNED}vec-a.bin`));
    assert.ok(!requests.some((url) => url.startsWith(SITE) && url !== `${SITE}manifest.json`));
  });

  it("says Hugging Face can't be reached, and why, when the search data can't download", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("Connect Timeout Error (attempted address: huggingface.co:443)"), { code: "UND_ERR_CONNECT_TIMEOUT" }) });
    }) as typeof fetch;
    const { commands } = await activate("pixel-sprites");
    await assert.rejects(
      commands.search!({ query: "sword" }),
      /^Error: Couldn't reach Hugging Face to download the sprite search data \(UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error \(attempted address: huggingface\.co:443\)\)\. Check the network or proxy, then search again\.$/,
    );
  });
});
