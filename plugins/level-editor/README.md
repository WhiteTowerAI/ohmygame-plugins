# Level Editor

Edit levels as Tiled JSON maps in a panel: tiles, layers, collisions and spawn
points.

Official OhMyGame plugin `ohmygame/level-editor`, an optional Beta for
OhMyGame plugin API **2.34+**. It is off until a project turns it on.

## What it does

The **Levels** panel lists the project's Tiled maps (`.tmj` files, and `.json`
files that are Tiled maps; build output is skipped) and edits the one you open:

- paint with a tile or a rectangle of tiles picked from the tileset palette,
  erase, fill an area and pick a tile from the map;
- draw rectangles (snapped to the grid; hold Alt for free placement), for
  example on a `collision` object layer, and place points for spawns and goals;
- move objects (drag, arrow keys, Shift for a whole tile) and edit their name,
  class, position, size and custom properties;
- add, rename, show or hide, reorder and delete tile and object layers;
- undo and redo, zoom and pan, and save with ⌘S / Ctrl+S.

**New map** writes a map with a `Ground` tile layer and an `Objects` layer, and
an embedded tileset cut from a PNG in the project.

The files stay Tiled's own format, so people with Tiled can use both. Saving
writes the same layout Tiled writes and keeps every field the panel didn't
change, including unknown ones, ids and each layer's encoding (arrays, or
base64 with no compression, gzip or zlib). External tilesets (`.tsj`, `.tsx`)
are read, never written. If the map changes on disk while you have unsaved
edits, the panel asks whether to reload it or keep yours.

The Skill tells the agent how levels are stored and how to load them in
Phaser, Cocos Creator and Godot.

## Limits

- Orthogonal maps only. Isometric, hexagonal and staggered maps, infinite maps
  and maps with Zstandard-compressed layers open read-only.
- No tileset editing, terrain or Wang brushes, rotation or resize handles
  (edit width and height in the inspector), and no new polygon, ellipse, tile
  or text objects. Existing ones are drawn, can be moved and are kept.
- Image layers are drawn but can't be edited; parallax and tint aren't shown.
- Unsaved edits are lost if the panel is closed or reloaded.
