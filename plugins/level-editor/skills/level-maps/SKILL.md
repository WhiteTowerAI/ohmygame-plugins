---
name: level-maps
description: Read, create or change the game's level maps, Tiled JSON (.tmj) files the person edits in the Levels panel, and load them in the game with collision and spawn points.
---

# Level maps

Levels are Tiled JSON maps (`.tmj`, sometimes `.json`), by convention under `levels/`. The person edits them in the Levels panel; Tiled opens the same files. There is no other level format: read and write the map file itself, and load it in the game from that file.

## Conventions

- Orthogonal, finite maps. Tile layers hold GIDs in `data`, an array or base64 (optionally zlib or gzip). Mask off the flip flags in the top four bits before looking up a tile; GID 0 is empty.
- Tilesets are embedded or external (`source`: `.tsj`). Every `image` and `source` path is relative to the file it is in. Keep them relative and update them if you move a file.
- An object layer named `collision` holds rectangles for solid areas.
- Point objects (`"point": true`) mark spawn points, goals and triggers. What they are is the object's `type` (`class` in maps saved by Tiled 1.9), such as `player`, `enemy` or `goal`. Extra settings go in `properties`: `[{ "name", "type", "value" }]`, with type `string`, `int`, `float` or `bool`.

## Editing a map

Read the file just before changing it: the person may have saved edits from the panel. Change only what the task needs. Keep fields you don't recognise, layer and object ids, the layer's encoding and compression, and the file's layout (Tiled writes one key per line with `"key":value`). Give a new object `nextobjectid` and a new layer `nextlayerid`, then increase that field.

## Loading in the game

- **Phaser 3:** serve the map and tileset images with the game (for example from `public/`), then `this.load.tilemapTiledJSON("level-1", "levels/level-1.tmj")` and `this.load.image("tiles", "…/tiles.png")`; create it with `this.make.tilemap({ key: "level-1" })`, `map.addTilesetImage(<tileset name in the map>, "tiles")` and `map.createLayer("Ground", tileset)`. Read objects with `map.getObjectLayer("collision").objects`. Phaser needs embedded tilesets and uncompressed layer data.
- **Cocos Creator:** its TiledMap component imports `.tmx` files. Keep the `.tmj` as the source and export a `.tmx` beside it with the Tiled CLI (see the Tiled plugin's export step), or ask the person to.
- **Godot 4:** use a Tiled importer addon such as YATI, which imports `.tmj` and `.tmx` maps as scenes, or read the JSON with `JSON.parse_string` for simple levels.
- **Other engines:** parse the JSON directly; the format is at https://doc.mapeditor.org/en/stable/reference/json-map-format/.

Check the result in the running game: tiles and their flips, collision, and where each spawn point puts its object.
