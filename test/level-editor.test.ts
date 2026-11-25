import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { deflateSync, gunzipSync, gzipSync, inflateSync } from "node:zlib";
// @ts-expect-error The panel's map model is plain JavaScript.
import * as tmj from "../plugins/level-editor/panel/tmj.js";

// The Level Editor panel's map model: Tiled JSON maps read and written back
// without losing what the editor doesn't change. The fixture is written the
// way Tiled's own JSON writer writes maps (src/plugins/json/qjsonparser).

const fixture = (name: string) => readFile(new URL(`fixtures/level-editor/${name}`, import.meta.url), "utf8");
const { FLIP_H, FLIP_V, FLIP_D, ROTATE_HEX } = tmj;

/** Little-endian GIDs, as Tiled stores base64 layer data. */
const bytesOf = (gids: number[]) => {
  const buffer = Buffer.alloc(gids.length * 4);
  gids.forEach((gid, i) => buffer.writeUInt32LE(gid >>> 0, i * 4));
  return buffer;
};
const gidsOf = (buffer: Buffer) => Array.from({ length: buffer.length / 4 }, (_, i) => buffer.readUInt32LE(i * 4));

/** A small map in `JSON.stringify(map, null, 2)` layout, with the given tile layers. */
const mapText = (layers: object[], fields: object = {}) =>
  JSON.stringify(
    {
      compressionlevel: -1, height: 2, infinite: false, layers, nextlayerid: 9, nextobjectid: 1, orientation: "orthogonal",
      renderorder: "right-down", tileheight: 16, tilesets: [{ firstgid: 1, source: "tiles.tsj" }], tilewidth: 16, type: "map",
      version: "1.10", width: 3, ...fields,
    },
    null,
    2,
  );

describe("level editor map model", () => {
  it("writes an unchanged Tiled map back byte for byte, in Tiled's layout", async () => {
    const text = await fixture("level.tmj");
    const map = await tmj.openMap(text, "levels/level.tmj");
    assert.equal(map.style.kind, "tiled");
    assert.equal(map.style.exact, true);
    assert.deepEqual(map.readOnly, []);
    assert.equal(await tmj.serializeMap(map), text);
    // Its external tileset is read, never written, but would be kept too.
    const tileset = await fixture("props.tsj");
    const parsed = tmj.parseJson(tileset);
    const style = tmj.detectStyle(tileset, parsed);
    assert.equal(style.exact, true);
    assert.equal(tmj.formatJson(parsed, style), tileset);
  });

  it("paints without disturbing flipped tiles or anything else", async () => {
    const text = await fixture("level.tmj");
    const map = await tmj.openMap(text, "levels/level.tmj");
    const ground = map.doc.layers[0];
    const tiles = map.tiles.get(ground);
    assert.equal(tiles.gids[4], (2 | FLIP_H) >>> 0);
    assert.equal(tiles.gids[7], (3 | FLIP_V | FLIP_D) >>> 0);
    const changes = tmj.paintStamp(tiles, 1, 0, tmj.stampOf(1, 1, [4]));
    assert.deepEqual([...changes.values()], [[1, 2, 4]]);
    const saved = await tmj.serializeMap(map);
    // Only the painted row's line changed.
    assert.equal(saved, text.replace('"data":[1, 2, 2, 3,', '"data":[1, 4, 2, 3,'));
    const data = JSON.parse(saved).layers[0].data;
    assert.equal(data[4], (2 | FLIP_H) >>> 0);
    assert.equal(data[7], (3 | FLIP_V | FLIP_D) >>> 0);
    // Undo puts it back exactly.
    tmj.applyChanges(tiles.gids, [...changes.values()], true);
    assert.equal(await tmj.serializeMap(map), text);
    // Flags, including hexagonal rotation, are kept apart from the tile.
    const gid = (7 | FLIP_H | ROTATE_HEX) >>> 0;
    assert.equal(tmj.tileOf(gid), 7);
    assert.equal(tmj.flagsOf(gid), (FLIP_H | ROTATE_HEX) >>> 0);
  });

  it("reads and writes base64 layers: plain, gzip and zlib", async () => {
    const gids = [1, 2, (3 | FLIP_H) >>> 0, 0, 5, (6 | ROTATE_HEX) >>> 0];
    const plain = bytesOf(gids).toString("base64");
    const gzip = gzipSync(bytesOf(gids)).toString("base64");
    const zlib = deflateSync(bytesOf(gids)).toString("base64");
    const layer = (id: number, data: string, compression?: string) => ({
      ...(compression ? { compression } : {}), data, encoding: "base64", height: 2, id, name: `L${id}`, opacity: 1,
      type: "tilelayer", visible: true, width: 3, x: 0, y: 0,
    });
    const text = mapText([layer(1, plain), layer(2, gzip, "gzip"), layer(3, zlib, "zlib")]);
    const map = await tmj.openMap(text, "levels/b64.tmj");
    assert.equal(map.style.exact, true);
    for (const item of map.doc.layers) assert.deepEqual([...map.tiles.get(item).gids], gids);
    assert.equal(await tmj.serializeMap(map), text);

    for (const item of map.doc.layers) tmj.paintStamp(map.tiles.get(item), 0, 1, tmj.stampOf(1, 1, [9]));
    const saved = JSON.parse(await tmj.serializeMap(map));
    const expected = [...gids];
    expected[3] = 9;
    assert.deepEqual(gidsOf(Buffer.from(saved.layers[0].data, "base64")), expected);
    assert.deepEqual(gidsOf(gunzipSync(Buffer.from(saved.layers[1].data, "base64"))), expected);
    assert.deepEqual(gidsOf(inflateSync(Buffer.from(saved.layers[2].data, "base64"))), expected);
    assert.deepEqual(saved.layers.map((item: { encoding: string; compression?: string }) => [item.encoding, item.compression]), [
      ["base64", undefined], ["base64", "gzip"], ["base64", "zlib"],
    ]);
  });

  it("keeps a tile edit made while a base64 layer is saved for the next save", async () => {
    const gids = [1, 2, 3, 4, 5, 6];
    const data = deflateSync(bytesOf(gids)).toString("base64");
    const text = mapText([{ compression: "zlib", data, encoding: "base64", height: 2, id: 1, name: "L", type: "tilelayer", width: 3 }]);
    const map = await tmj.openMap(text, "levels/race.tmj");
    const tiles = map.tiles.get(map.doc.layers[0]);
    const tileAt = (saved: string, index: number) => gidsOf(inflateSync(Buffer.from(JSON.parse(saved).layers[0].data, "base64")))[index];
    tmj.paintStamp(tiles, 0, 0, tmj.stampOf(1, 1, [7]));
    // The save encodes the tiles as they were when it started…
    const saving = tmj.serializeMap(map);
    tmj.paintStamp(tiles, 1, 0, tmj.stampOf(1, 1, [8]));
    const first = await saving;
    assert.equal(tileAt(first, 0), 7);
    assert.equal(tileAt(first, 1), 2);
    tmj.markSaved(map);
    // …and the edit made meanwhile is still written by the next one.
    const second = await tmj.serializeMap(map);
    assert.equal(tileAt(second, 0), 7);
    assert.equal(tileAt(second, 1), 8);
    // Undoing back to what the first save wrote writes its bytes again.
    tmj.paintStamp(tiles, 1, 0, tmj.stampOf(1, 1, [2]));
    assert.equal(await tmj.serializeMap(map), first);
  });

  it("opens zstd and infinite maps read-only", async () => {
    const zstd = await tmj.openMap(mapText([{ compression: "zstd", data: "KLUv/SAYwQAA", encoding: "base64", height: 2, id: 1, name: "Z", type: "tilelayer", width: 3 }]), "z.tmj");
    assert.deepEqual(zstd.readOnly, ["zstd"]);
    await assert.rejects(tmj.serializeMap(zstd));
    const chunk = { data: Array(16 * 16).fill(0).map((_, i) => (i === 17 ? 2 : 0)), height: 16, width: 16, x: -16, y: 0 };
    const infinite = await tmj.openMap(mapText([{ chunks: [chunk], height: 16, id: 1, name: "I", startx: -16, starty: 0, type: "tilelayer", width: 16 }], { infinite: true }), "i.tmj");
    assert.deepEqual(infinite.readOnly, ["infinite"]);
    const tiles = infinite.tiles.get(infinite.doc.layers[0]);
    assert.equal(tiles.chunks[0].gids[17], 2);
    assert.equal(tiles.gids, undefined);
    await assert.rejects(tmj.serializeMap(infinite));
    const iso = await tmj.openMap(mapText([], { orientation: "isometric" }), "iso.tmj");
    assert.deepEqual(iso.readOnly, ["orientation"]);
  });

  it("fills the 4-connected area under a cell", () => {
    // 1 1 0 2
    // 0 1 0 2
    // 1 0 0 1
    const tiles = { width: 4, height: 3, gids: Uint32Array.from([1, 1, 0, 2, 0, 1, 0, 2, 1, 0, 0, 1]) };
    const changes = tmj.floodFill(tiles, 0, 0, tmj.stampOf(1, 1, [7]));
    assert.deepEqual([...tiles.gids], [7, 7, 0, 2, 0, 7, 0, 2, 1, 0, 0, 1]);
    assert.equal(changes.size, 3);
    // Diagonal neighbours aren't joined; a flipped tile is a different tile.
    tiles.gids[2] = (7 | FLIP_H) >>> 0;
    tmj.floodFill(tiles, 2, 1, tmj.stampOf(1, 1, [3]));
    assert.deepEqual([...tiles.gids], [7, 7, (7 | FLIP_H) >>> 0, 2, 0, 7, 3, 2, 1, 3, 3, 1]);
    // A stamp repeats from where the fill starts.
    const open = { width: 4, height: 2, gids: new Uint32Array(8) };
    tmj.floodFill(open, 1, 0, tmj.stampOf(2, 1, [4, 5]));
    assert.deepEqual([...open.gids], [5, 4, 5, 4, 5, 4, 5, 4]);
    // Filling with what is there changes nothing.
    assert.equal(tmj.floodFill(open, 0, 0, tmj.stampOf(1, 1, [5])).size, 0);
  });

  it("paints a stamp, skipping its empty cells and the map's edge", () => {
    const tiles = { width: 3, height: 3, gids: new Uint32Array(9).fill(1) };
    const changes = tmj.paintStamp(tiles, 1, 1, tmj.stampOf(3, 2, [2, 0, 3, 4, 5, 6]));
    assert.deepEqual([...tiles.gids], [1, 1, 1, 1, 2, 1, 1, 4, 5]);
    assert.deepEqual([...changes.keys()].sort(), [4, 7, 8]);
    // A stroke keeps each cell's first value, so undo goes back to before it.
    tmj.paintStamp(tiles, 1, 1, tmj.stampOf(1, 1, [9]), changes);
    assert.deepEqual(changes.get(4), [4, 1, 9]);
    tmj.applyChanges(tiles.gids, [...changes.values()], true);
    assert.deepEqual([...tiles.gids], Array(9).fill(1));
    tmj.erase(tiles, 0, 0, 2, 1);
    assert.deepEqual([...tiles.gids], [0, 0, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("gives a new object the next object id, with its class where Tiled writes it", async () => {
    const map = await tmj.openMap(await fixture("level.tmj"), "levels/level.tmj");
    const layer = map.doc.layers[2];
    const object = tmj.createObject(map.doc, layer, { shape: "rectangle", x: 16, y: 0, width: 32, height: 16 });
    layer.objects.push(object);
    assert.equal(object.id, 3);
    assert.equal(map.doc.nextobjectid, 4);
    assert.deepEqual(Object.keys(object), ["height", "id", "name", "rotation", "type", "visible", "width", "x", "y"]);
    const point = tmj.createObject(map.doc, layer, { shape: "point", x: 8, y: 8, className: "coin" });
    assert.equal(point.id, 4);
    assert.equal(point.point, true);
    assert.equal(map.doc.nextobjectid, 5);
    // An id already taken past `nextobjectid` is skipped.
    layer.objects.push({ ...point, id: 10 });
    assert.equal(tmj.takeObjectId(map.doc), 11);
    // Only Tiled 1.9 wrote `class`; an object keeps whichever it has.
    assert.equal(tmj.classKey({ version: "1.9" }), "class");
    assert.equal(tmj.classKey({ version: "1.10" }), "type");
    assert.equal(tmj.classKey({ version: "1.8" }), "type");
    assert.equal(tmj.classKey({ version: "1.10" }, { class: "npc" }), "class");
    // The saved map has the new object, in Tiled's layout.
    const saved = await tmj.serializeMap(map);
    assert.match(saved, /\n {17}"id":3,\n/);
    assert.match(saved, /\n "nextobjectid":12,\n/);
  });

  it("gives a new layer the next layer id", async () => {
    const map = await tmj.openMap(await fixture("level.tmj"), "levels/level.tmj");
    const tiles = tmj.createLayer(map.doc, "tilelayer", "Walls", map.doc.layers[0]);
    assert.equal(tiles.id, 6);
    assert.equal(map.doc.nextlayerid, 7);
    assert.equal(tiles.data.length, 12);
    const objects = tmj.createLayer(map.doc, "objectgroup", "Spawns");
    assert.equal(objects.id, 7);
    assert.equal(map.doc.nextlayerid, 8);
    map.doc.layers.push(tiles, objects);
    map.tiles.set(tiles, tmj.tilesFor(map.doc));
    tmj.paintStamp(map.tiles.get(tiles), 0, 0, tmj.stampOf(1, 1, [2]));
    const saved = JSON.parse(await tmj.serializeMap(map));
    assert.deepEqual(saved.layers.at(-2).data, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(saved.layers.at(-1).type, "objectgroup");
  });

  it("keeps custom properties in Tiled's shape", async () => {
    const map = await tmj.openMap(await fixture("level.tmj"), "levels/level.tmj");
    const player = map.doc.layers[3].objects[0];
    tmj.setProperty(player, "lives", "int", tmj.propertyValue("int", "5"));
    tmj.setProperty(player, "speed", "float", tmj.propertyValue("float", "1.5"));
    tmj.renameProperty(player, "facing", "direction");
    tmj.setProperty(player, "boss", "bool", undefined);
    assert.deepEqual(player.properties, [
      { name: "direction", type: "string", value: "left" },
      { name: "lives", type: "int", value: 5 },
      { name: "tint", type: "color", value: "#ffaa0000" },
      { name: "speed", type: "float", value: 1.5 },
    ]);
    const crate = map.doc.layers[2].objects[0];
    tmj.setProperty(crate, "solid", "bool", true);
    // A new key goes where Tiled sorts it.
    assert.deepEqual(Object.keys(crate), ["height", "id", "name", "properties", "rotation", "type", "visible", "width", "x", "y"]);
    tmj.setProperty(crate, "solid", "bool", undefined);
    assert.equal("properties" in crate, false);
    // Captured fields restore in order and stay reusable.
    const before = tmj.captureFields(player);
    player.name = "hero";
    tmj.setProperty(player, "lives", "int", 1);
    tmj.restoreFields(player, before);
    assert.equal(player.name, "player");
    assert.equal(player.properties[1].value, 5);
    player.properties[1].value = 2;
    tmj.restoreFields(player, before);
    assert.equal(player.properties[1].value, 5);
    // Properties are looked up by name, so a lookup after undo sees the restored value.
    const stale = tmj.propertyNamed(player, "lives");
    tmj.setProperty(player, "lives", "int", 3);
    tmj.restoreFields(player, before);
    assert.notEqual(tmj.propertyNamed(player, "lives"), stale);
    assert.equal(tmj.propertyNamed(player, "lives").value, 5);
    assert.equal(tmj.propertyNamed(player, "missing"), undefined);
  });

  it("keeps other tools' layouts", async () => {
    const layer = { data: [1, 2, 3, 4, 5, 6], height: 2, id: 1, name: "G", opacity: 1, type: "tilelayer", visible: true, width: 3, x: 0, y: 0 };
    const pretty = `${mapText([layer])}\n`;
    const map = await tmj.openMap(pretty, "a.tmj");
    assert.deepEqual([map.style.kind, map.style.inline, map.style.exact], ["standard", false, true]);
    assert.equal(await tmj.serializeMap(map), pretty);
    // Tile data on one line, the way some exporters write it, and CRLF line endings.
    const inline = pretty.replace(/"data": \[[^\]]*\]/, '"data": [1, 2, 3, 4, 5, 6]').replaceAll("\n", "\r\n");
    const second = await tmj.openMap(inline, "b.tmj");
    assert.deepEqual([second.style.inline, second.style.eol, second.style.exact], [true, "\r\n", true]);
    tmj.paintStamp(second.tiles.get(second.doc.layers[0]), 2, 1, tmj.stampOf(1, 1, [8]));
    assert.equal(await tmj.serializeMap(second), inline.replace("[1, 2, 3, 4, 5, 6]", "[1, 2, 3, 4, 5, 8]"));
    // Minified.
    const minified = JSON.stringify(JSON.parse(pretty));
    const third = await tmj.openMap(minified, "c.tmj");
    assert.deepEqual([third.style.kind, third.style.exact], ["compact", true]);
    assert.equal(await tmj.serializeMap(third), minified);
  });

  it("creates a new map as Tiled would write it", async () => {
    const doc = tmj.createMap({ width: 5, height: 4, tilewidth: 16, tileheight: 16,
      tileset: { name: "tiles", image: tmj.relativePath("levels/level-1.tmj", "assets/tiles.png"), imagewidth: 80, imageheight: 50 } });
    assert.deepEqual(doc.layers.map((layer: { name: string; id: number; type: string }) => [layer.id, layer.name, layer.type]), [
      [1, "Ground", "tilelayer"], [2, "Objects", "objectgroup"],
    ]);
    assert.equal(doc.nextlayerid, 3);
    assert.deepEqual(doc.tilesets[0], { columns: 5, firstgid: 1, image: "../assets/tiles.png", imageheight: 50, imagewidth: 80, margin: 0,
      name: "tiles", spacing: 0, tilecount: 15, tileheight: 16, tilewidth: 16 });
    const text = tmj.formatJson(doc, tmj.newMapStyle(doc));
    assert.ok(text.startsWith('{ "compressionlevel":-1,\n "height":4,'));
    assert.match(text, /"image":"..\\\/assets\\\/tiles.png"/);
    assert.match(text, /"data":\[0, 0, 0, 0, 0,\n {12}0, 0/);
    const map = await tmj.openMap(text, "levels/level-1.tmj");
    assert.equal(map.style.exact, true);
    assert.equal(await tmj.serializeMap(map), text);
  });

  it("reads tilesets that keep their tiles keyed by id, as Tiled did before 1.2", async () => {
    const tileset = {
      columns: 0, firstgid: 1, margin: 0, name: "props", spacing: 0, tilecount: 2, tileheight: 32, tilewidth: 16,
      tileproperties: { "3": { solid: true } },
      tilepropertytypes: { "3": { solid: "bool" } },
      tiles: { "0": { image: "crate.png", imageheight: 16, imagewidth: 16 }, "3": { image: "tree.png", imageheight: 32, imagewidth: 16 } },
    };
    assert.deepEqual(tmj.tileIds(tileset), [0, 3]);
    assert.deepEqual(tmj.tileSource(tileset, 3), { image: "tree.png", sx: 0, sy: 0, width: 16, height: 32 });
    assert.equal(tmj.tileSource(tileset, 1), undefined);
    assert.deepEqual(tmj.tilesOf(tileset).map((tile: { id: number }) => tile.id), [0, 3]);
    assert.deepEqual(tmj.tilesOf({ tiles: "nonsense" }), []);
    // The map is written back with the tiles in their old shape.
    const text = mapText([{ data: [1, 0, 0, 0, 0, 4], height: 2, id: 1, name: "L", type: "tilelayer", width: 3 }], { tilesets: [tileset] });
    const map = await tmj.openMap(text, "levels/old.json");
    assert.equal(await tmj.serializeMap(map), text);
    tmj.paintStamp(map.tiles.get(map.doc.layers[0]), 1, 0, tmj.stampOf(1, 1, [4]));
    assert.deepEqual(JSON.parse(await tmj.serializeMap(map)).tilesets[0].tiles, tileset.tiles);
  });

  it("finds tiles and paths", () => {
    const tilesets = [{ firstgid: 1, columns: 2, image: "a.png", tilewidth: 16, tileheight: 16, tilecount: 4, margin: 1, spacing: 2 }, { firstgid: 5, tiles: [{ id: 1, image: "tree.png", imagewidth: 16, imageheight: 32 }] }];
    const found = tmj.findTileset(tilesets, (4 | FLIP_V) >>> 0);
    assert.equal(found.tileset, tilesets[0]);
    assert.equal(found.id, 3);
    assert.deepEqual(tmj.tileSource(found.tileset, found.id), { image: "a.png", sx: 19, sy: 19, width: 16, height: 16 });
    assert.deepEqual(tmj.tileSource(tilesets[1], 1), { image: "tree.png", sx: 0, sy: 0, width: 16, height: 32 });
    assert.equal(tmj.findTileset(tilesets, 0), undefined);
    assert.equal(tmj.resolvePath("levels/one.tmj", "../art/tiles.png"), "art/tiles.png");
    assert.equal(tmj.resolvePath("one.tmj", "../art/tiles.png"), undefined);
    assert.equal(tmj.resolvePath("levels/one.tmj", "/etc/passwd"), undefined);
    assert.equal(tmj.relativePath("levels/one.tmj", "levels/tiles.png"), "tiles.png");
    assert.equal(tmj.relativePath("one.tmj", "art/tiles.png"), "art/tiles.png");
    assert.deepEqual(tmj.gridOf(100, 50, 16, 16), { columns: 6, tilecount: 18 });
    assert.equal(tmj.formatG15(1 / 3), "0.333333333333333");
    assert.equal(tmj.formatG15(0.00001), "1e-05");
    assert.equal(tmj.formatG15(2.5), "2.5");
    // A number 15 digits can't hold is written in full rather than rounded.
    assert.equal(tmj.stringifyJson({ x: 0.1 + 0.2, y: 2.5 }, tmj.TILED_STYLE), '{ "x":0.30000000000000004,\n "y":2.5\n}');
  });
});
