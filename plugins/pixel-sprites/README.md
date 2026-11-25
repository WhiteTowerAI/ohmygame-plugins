# Pixel sprites Beta

A Library source for the [Pixel Art Atlas](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m):
1.4 million AI-generated 16×16 pixel art sprites with transparent backgrounds,
searched by meaning as in the
[Pixel Search](https://huggingface.co/spaces/cfahlgren1/pixel-search) Space.
Requires OhMyGame plugin API **2.5+**; its collections and one-day cache need
**2.35+**.

## Use

Turn the plugin on under Plugins. It adds a **Pixel sprites** tab to the
Library page with collections, in this order: All, Weapons, Armor, Potions,
Food, Magic, Monsters, Characters, Animals, Plants, Tools and Furniture. A
collection adds its word to the search: Weapons with `fire` searches
`fire weapon`. All, with nothing typed, mixes swords, potions, chests, coins,
hearts, keys, slimes, trees, shields and gems.

Search in English: the search knows about 35,000 words and 6,194 subjects, and
ranks by meaning, so `red dragon` prefers red dragons. Common Chinese game
words (剑, 药水, 宝箱, 龙, 红色…, listed in `native/index.mjs`) become their
English. A result's name is its caption.

Thumbnails are the sprite scaled up 8 times with each pixel kept square. An
added sprite is a 16×16 PNG named after its caption, or 64×64 or 128×128 when
**Size when added** in the plugin's Settings is 4 or 8.

## Before you ship

Every sprite is AI-generated. The dataset is CC0 only as far as its author can
waive rights, and the Krea 2 Community License has its own terms for
commercial use and AI disclosure. Read [NOTICE.md](NOTICE.md) before using
the sprites in a commercial game.

## How it works

`native/index.mjs` downloads the search data once from the Pixel Search Space
into the plugin's data folder and loads it into that Space's query engine
(`native/engine.mjs`), which takes about 140 MB of memory and answers a search
in milliseconds. The pinned commit's manifest comes first; while the Space's
own site serves the same build, which is faster, the other files come from it,
and any whose size differs from the manifest's comes from the pinned commit.

A first search waits for about 4 MB; the 8 MB of captions follow in the
background, and until they arrive results are named by their subject and
ranked without caption details. Sprite pixels come in pages of 256 (24–38 KB
each), downloaded when a result needs them and kept. On a slow connection a
first search takes ten seconds or so; later ones, and anything already seen,
take milliseconds. The manifest's `cacheSeconds: 86400` lets OhMyGame show a
collection again for a day.

The engine's catalog is read with `uint32()`, which copies a Buffer's own
bytes: a Node Buffer can be a view into a larger block, so the browser code's
`bytes.slice().buffer` reads the wrong numbers under OhMyGame's Node and every
result becomes the first sprite.

## Local acceptance

- Add the folder under Plugins › Add plugin › This computer with Develop on,
  turn it on and open the Library: the first search downloads the data, then
  the tab shows sprites sharply.
- Switch collections, search `red dragon` and `剑`, scroll to load more.
- Add a sprite at size 1, 4 and 8; check it is 16, 64 or 128 pixels wide,
  sharp, transparent, and named after its caption.
