// A Library source for Pixel Art Atlas: 1.4 million AI-generated 16×16 pixel
// art sprites (CC0, Angais/pixel-art-atlas-1.4m), searched by meaning with the
// data and query engine of the Pixel Search Space
// (huggingface.co/spaces/cfahlgren1/pixel-search, CC0).
//
// The search data, about 12 MB, is downloaded once from a pinned commit of
// that Space into the plugin's data folder; searching then runs here. Sprite
// pixels come in pages of 256, each fetched when a result needs it and kept.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, deflateSync } from "node:zlib";
import { SearchEngine } from "./engine.mjs";

// Pinned, so a change to the Space can't change what the plugin reads.
export const COMMIT = "9687c39d60881ba80208e671ba12ac216019b1d0";
const DATA = `https://huggingface.co/spaces/cfahlgren1/pixel-search/resolve/${COMMIT}/static/data`;
// The Space's own site serves the same files faster, but follows its latest
// build: pages come from it only while its manifest is the pinned one.
const SITE = "https://cfahlgren1-pixel-search.static.hf.space/data";
const HEADERS = {
  "User-Agent": "OhMyGame Pixel sprites plugin (ohmygame/pixel-sprites)",
};
const DATASET = "https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m";
const FILES = [
  "manifest.json",
  "subjects.txt.z",
  "terms-a.txt.z",
  "vec-a.bin",
  "freq-a.bin.z",
  "vec-s.bin",
  "terms-b.txt.z",
  "vec-b.bin",
  "catalog-subjects.bin.z",
  "palette.bin.z",
];
// Downloaded after the rest, so a first search needn't wait for its 8 MB.
const CAPTIONS = "catalog-captions.bin.z";
const SPRITE = 16;
const PAGE_SPRITES = 256;
const PAGE_SIZE = 30;
const MAX_RESULTS = 2000;
// Pages asked for at once; a search's results usually span a dozen or so.
const FETCHES = 24;
const THUMBNAIL_SCALE = 8;

/** Each collection of the tab, in the manifest's order, as words added to a search. */
export const COLLECTIONS = {
  all: "",
  weapon: "weapon",
  armor: "armor",
  potion: "potion",
  food: "food",
  magic: "magic",
  monster: "monster",
  character: "character",
  animal: "animal",
  plant: "plant",
  tool: "tool",
  furniture: "furniture",
};
// What All shows before anything is typed: a few of each of these, in turn.
const FEATURED = [
  "sword",
  "potion",
  "treasure chest",
  "coin",
  "heart",
  "key",
  "slime",
  "tree",
  "shield",
  "gem",
];

/** Chinese words a search may use, as the English the search data knows. */
const WORDS = {
  剑: "sword",
  刀: "knife",
  斧: "axe",
  斧头: "axe",
  弓: "bow",
  箭: "arrow",
  枪: "gun",
  锤: "hammer",
  法杖: "staff",
  魔杖: "wand",
  盾: "shield",
  盾牌: "shield",
  头盔: "helmet",
  盔甲: "armor",
  护甲: "armor",
  靴子: "boots",
  戒指: "ring",
  项链: "necklace",
  药水: "potion",
  药瓶: "potion",
  金币: "coin",
  硬币: "coin",
  宝石: "gem",
  钻石: "diamond",
  宝箱: "treasure chest",
  箱子: "chest",
  钥匙: "key",
  心: "heart",
  爱心: "heart",
  星星: "star",
  星: "star",
  书: "book",
  卷轴: "scroll",
  地图: "map",
  炸弹: "bomb",
  苹果: "apple",
  面包: "bread",
  肉: "meat",
  鱼: "fish",
  蛋糕: "cake",
  蘑菇: "mushroom",
  水果: "fruit",
  食物: "food",
  树: "tree",
  花: "flower",
  草: "grass",
  石头: "rock",
  岩石: "rock",
  木头: "wood",
  火: "fire",
  火焰: "flame",
  水: "water",
  冰: "ice",
  龙: "dragon",
  史莱姆: "slime",
  骷髅: "skeleton",
  幽灵: "ghost",
  僵尸: "zombie",
  怪物: "monster",
  恶魔: "demon",
  猫: "cat",
  狗: "dog",
  鸟: "bird",
  马: "horse",
  兔子: "rabbit",
  狼: "wolf",
  熊: "bear",
  蛇: "snake",
  蜘蛛: "spider",
  动物: "animal",
  骑士: "knight",
  法师: "mage",
  战士: "warrior",
  弓箭手: "archer",
  国王: "king",
  公主: "princess",
  角色: "character",
  英雄: "hero",
  椅子: "chair",
  桌子: "table",
  床: "bed",
  门: "door",
  窗户: "window",
  灯: "lamp",
  蜡烛: "candle",
  家具: "furniture",
  镐: "pickaxe",
  铲子: "shovel",
  锄头: "hoe",
  工具: "tool",
  魔法: "magic",
  红: "red",
  红色: "red",
  蓝: "blue",
  蓝色: "blue",
  绿: "green",
  绿色: "green",
  黄: "yellow",
  黄色: "yellow",
  金: "gold",
  金色: "gold",
  银: "silver",
  黑: "black",
  白: "white",
  紫: "purple",
};

/** A search in the words the data knows: Chinese ones by `WORDS`, the rest as typed. */
export function english(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/[\s,，、]+/)
    .filter(Boolean)
    .map((word) => WORDS[word] ?? word)
    .join(" ");
}

const lines = (bytes) => new TextDecoder().decode(bytes).split("\n");
const int8 = (bytes) =>
  new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);

/**
 * Little-endian 32-bit numbers from bytes. A Node Buffer may be a view into a
 * larger, shared memory block at any offset, and its `slice()` doesn't copy as
 * a browser's Uint8Array does, so only its own bytes are copied out.
 */
export function uint32(bytes) {
  return new Uint32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}

/**
 * The search data, loaded into an engine. Captions, the largest file, come
 * later with `addCaptions`: until then a sprite is named by its subject and
 * the engine ranks without them.
 */
export function loadAtlas(read) {
  const manifest = JSON.parse(new TextDecoder().decode(read("manifest.json")));
  const engine = new SearchEngine({
    dims: manifest.dims,
    subjects: lines(gunzipSync(read("subjects.txt.z"))),
    termsA: lines(gunzipSync(read("terms-a.txt.z"))),
    vecA: int8(read("vec-a.bin")),
    freqA: gunzipSync(read("freq-a.bin.z")),
    vecS: int8(read("vec-s.bin")),
  });
  engine.setGeneralVocabulary(
    lines(gunzipSync(read("terms-b.txt.z"))),
    int8(read("vec-b.bin")),
  );
  engine.setCatalog(uint32(gunzipSync(read("catalog-subjects.bin.z"))));
  return {
    engine,
    total: manifest.catalog_sprites,
    palette: gunzipSync(read("palette.bin.z")),
    caption: (sprite) => engine.caption(sprite) || engine.subjectOf(sprite),
    addCaptions: (bytes) => engine.setCaptions(gunzipSync(bytes)),
  };
}

/**
 * One sprite of a page as RGBA: a page holds each sprite's colour count, then
 * its colours as palette tokens, then 256 indices into those colours per
 * sprite. Token 0 is transparent.
 */
export function spritePixels(page, count, index, palette) {
  let colors = count;
  for (let sprite = 0; sprite < index; sprite++) colors += page[sprite] * 2;
  let indices = count;
  for (let sprite = 0; sprite < count; sprite++) indices += page[sprite] * 2;
  const rgba = Buffer.alloc(SPRITE * SPRITE * 4);
  for (let pixel = 0; pixel < SPRITE * SPRITE; pixel++) {
    const local = page[indices + index * SPRITE * SPRITE + pixel];
    const token =
      page[colors + local * 2] | (page[colors + local * 2 + 1] << 8);
    if (!token) continue;
    rgba.set(
      [palette[token * 3], palette[token * 3 + 1], palette[token * 3 + 2], 255],
      pixel * 4,
    );
  }
  return rgba;
}

/** A 16×16 sprite as a PNG, each pixel a `scale`-sided square so it stays sharp. */
export function spritePng(rgba, scale = 1) {
  const side = SPRITE * scale;
  const rows = Buffer.alloc((side * 4 + 1) * side);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const from = (Math.floor(y / scale) * SPRITE + Math.floor(x / scale)) * 4;
      rgba.copy(rows, y * (side * 4 + 1) + 1 + x * 4, from, from + 4);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A file name from a caption: its words joined by hyphens. */
export function fileName(caption, sprite) {
  const words =
    String(caption)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  return `${words.slice(0, 8).join("-") || "sprite"}-${sprite}.png`;
}

/** Why a request didn't reach Hugging Face: fetch keeps it on its cause, such as a connect timeout. */
function unreachable(error) {
  const inner = error?.cause instanceof Error ? error.cause : error;
  const code = typeof inner?.code === "string" && !String(inner.message).includes(inner.code) ? `${inner.code}: ` : "";
  return new Error(
    `Couldn't reach Hugging Face to download the sprite search data (${code}${inner?.message ?? inner}). Check the network or proxy, then search again.`,
    { cause: error },
  );
}

async function download(url) {
  const response = await fetch(url, { headers: HEADERS }).catch((error) => {
    throw unreachable(error);
  });
  if (!response.ok)
    throw new Error(
      `Hugging Face answered ${response.status} for ${url.slice(url.lastIndexOf("/") + 1)}`,
    );
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Registers the source. `atlasFrom` turns the downloaded files into the search;
 * tests give their own, since the engine needs the real data to rank.
 */
export function activate(context, atlasFrom = loadAtlas) {
  const folder = path.join(context.dataFolder, COMMIT);
  const pageFolder = path.join(folder, "pages");
  let atlas;
  let captions;
  let source;
  const pages = new Map();

  /**
   * Where files come from: the Space's site while it serves the pinned build,
   * which is faster, else the pinned commit. Asked once the pinned manifest is
   * in the data folder.
   */
  function filesFrom() {
    source ??= (async () => {
      const [pinned, site] = await Promise.all([
        readFile(path.join(folder, "manifest.json")),
        download(`${SITE}/manifest.json`).catch(() => undefined),
      ]);
      return site?.equals(pinned) ? SITE : DATA;
    })();
    return source;
  }

  /** A file of the search data: from the data folder, or else downloaded and kept. */
  async function dataFile(name, from) {
    const file = path.join(folder, name);
    const kept = await readFile(file).catch(() => undefined);
    if (kept) return kept;
    let bytes = await download(`${from}/${name}`);
    // The manifest gives each file's size: one that differs comes from the pinned commit.
    if (from !== DATA) {
      const sizes =
        JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8"))
          .files ?? {};
      if (sizes[name] !== undefined && bytes.length !== sizes[name])
        bytes = await download(`${DATA}/${name}`);
    }
    // Written whole or not at all, so a stopped download isn't read later.
    await writeFile(`${file}.part`, bytes);
    await rename(`${file}.part`, file);
    return bytes;
  }

  /** The search data: downloaded once into the data folder, then loaded from it. */
  function load() {
    atlas ??= (async () => {
      await mkdir(pageFolder, { recursive: true });
      // The pinned manifest first: it says whether the faster site has the same build.
      const files = new Map([
        ["manifest.json", await dataFile("manifest.json", DATA)],
      ]);
      const from = await filesFrom();
      await Promise.all(
        FILES.filter((name) => name !== "manifest.json").map(async (name) =>
          files.set(name, await dataFile(name, from)),
        ),
      );
      return atlasFrom((name) => files.get(name));
    })().catch((error) => {
      atlas = undefined;
      throw error;
    });
    return atlas;
  }

  /**
   * Captions, in the background: they name results and refine their order once
   * they are here. A failed download is tried again with the next search.
   */
  function loadCaptions(loaded) {
    captions ??= filesFrom()
      .then((from) => dataFile(CAPTIONS, from))
      .then((bytes) => loaded.addCaptions(bytes))
      .catch(() => {
        captions = undefined;
      });
  }

  /** A page of 256 sprites, from the data folder or else Hugging Face. */
  function page(number) {
    if (!pages.has(number))
      pages.set(
        number,
        (async () => {
          const file = path.join(pageFolder, `${number}.bin.z`);
          let bytes = await readFile(file).catch(() => undefined);
          if (!bytes) {
            bytes = await download(
              `${await filesFrom()}/pages/${number}.bin.z`,
            );
            await writeFile(`${file}.part`, bytes);
            await rename(`${file}.part`, file);
          }
          return gunzipSync(bytes);
        })().catch((error) => {
          pages.delete(number);
          throw error;
        }),
      );
    return pages.get(number);
  }

  async function pixels(loaded, sprite) {
    const number = Math.floor(sprite / PAGE_SPRITES);
    const count = Math.min(PAGE_SPRITES, loaded.total - number * PAGE_SPRITES);
    return spritePixels(
      await page(number),
      count,
      sprite % PAGE_SPRITES,
      loaded.palette,
    );
  }

  /** Sprites best matching a collection and search words, best first. */
  function find(loaded, query, collection) {
    const words = [english(query), COLLECTIONS[collection] ?? ""]
      .filter(Boolean)
      .join(" ");
    if (words)
      return [...loaded.engine.search(words, MAX_RESULTS, false).sprites];
    // All, before anything is typed: a few of each featured kind, in turn.
    const lists = FEATURED.map((word) => [
      ...loaded.engine.search(word, MAX_RESULTS / FEATURED.length, false)
        .sprites,
    ]);
    // A sprite two kinds share ("heart key" under heart and key) shows once.
    const mixed = new Set();
    for (
      let at = 0;
      mixed.size < MAX_RESULTS && lists.some((list) => at < list.length);
      at++
    )
      for (const list of lists) if (at < list.length) mixed.add(list[at]);
    return [...mixed];
  }

  context.registerCommand("search", async ({ query, cursor, collection }) => {
    const loaded = await load();
    loadCaptions(loaded);
    const found = find(loaded, query, collection);
    const start = Number(cursor ?? 0);
    const sprites = found.slice(start, start + PAGE_SIZE);
    // Each page the results need, once, many at a time; results of one subject share pages.
    const needed = [
      ...new Set(sprites.map((sprite) => Math.floor(sprite / PAGE_SPRITES))),
    ];
    for (let at = 0; at < needed.length; at += FETCHES)
      await Promise.all(needed.slice(at, at + FETCHES).map(page));
    const thumbnails = new Map();
    for (const sprite of sprites)
      thumbnails.set(
        sprite,
        spritePng(await pixels(loaded, sprite), THUMBNAIL_SCALE),
      );
    const scale = Number(context.configuration?.scale ?? 1) || 1;
    return {
      items: sprites.map((sprite) => ({
        id: String(sprite),
        name: loaded.caption(sprite).slice(0, 200),
        mediaType: "image",
        thumbnail: `data:image/png;base64,${thumbnails.get(sprite).toString("base64")}`,
        width: SPRITE * scale,
        height: SPRITE * scale,
        author: "Angais (AI-generated)",
        license: "CC0 1.0",
        url: DATASET,
      })),
      ...(start + PAGE_SIZE < found.length
        ? { next: String(start + PAGE_SIZE) }
        : {}),
    };
  });

  context.registerCommand("fetch", async ({ id }) => {
    const loaded = await load();
    const sprite = Number(id);
    if (!/^\d+$/.test(String(id)) || sprite >= loaded.total)
      throw new Error(`${id} isn't a Pixel Art Atlas sprite`);
    const scale = [1, 4, 8].includes(Number(context.configuration?.scale))
      ? Number(context.configuration.scale)
      : 1;
    // Adds run one at a time, so every sprite can be saved under one name.
    await writeFile(
      path.join(context.dataFolder, "sprite.png"),
      spritePng(await pixels(loaded, sprite), scale),
    );
    const name = fileName(loaded.caption(sprite), sprite).replace(
      /\.png$/,
      scale > 1 ? `@${scale}x.png` : ".png",
    );
    return {
      file: "sprite.png",
      name,
      author: "Angais (AI-generated)",
      license: "CC0 1.0",
      url: DATASET,
    };
  });
}
