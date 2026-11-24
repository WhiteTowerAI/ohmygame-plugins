---
name: pixelfx
description: Make, tune and use pixel art effects (VFX) with the Pixel Effects panel and its 244 built-in pixelfx effects, as code in the project's pixelfx/ folder or as sprite sheets. Use when someone wants a pixel effect, sprite animation, sprite sheet or game juice, such as "a frost nova for my mage" or "a coin pickup sparkle", or wants their pixel effects to look better.
---

# Pixel effects

An effect is one ES module that draws, from code alone, into two buffers: `color` (opaque or dithered pixels) and `light` (additive glow). It plays live, recolors, mirrors, reseeds and exports to a sprite sheet. The Pixel Effects panel shows the built-in effects and the project's own, in `pixelfx/fx/<category>/<name>.js`. Its tools are `ohmygame__pixelfx__<tool>`; work through them, so the person sees what you do in the panel.

## 1. Find an existing effect first

Most requests are a built-in effect with different options. Call `find_effects` with a few words (English or Chinese), then `show_effect` the candidates and look at each with `panel_screenshot` before choosing. The `moves` category has whole attacks, wind-up to recovery: start there for a move rather than a single effect.

Try options before code. `show_effect` takes `settings`:

- `palette`: a ramp of hex colors, dark to bright (`null` for the effect's own);
- `seed` for a different take on the same effect;
- `fps`, `duration`, `size`, `flip`, `bg`, `actor`;
- `options`: the effect's own knobs from its `meta.options`.

Read an effect's code with `read_effect`.

## 2. Change or write one

Built-in effects are read-only. `copy_effect` puts one in the project with the pixelfx `core/` and helpers it imports. `write_effect` writes a project effect (new or changed) and returns the check. The person can edit the same file in the panel's Code view.

The module contract:

```js
import { PAL, fit, burst, fly, seg, TAU } from "../../core/index.js"; // and "./_lib.js" for the category's helpers
export const meta = {
  name: "Frost nova", desc: "One line: what it is, how it moves.", tags: ["ice"],
  size: [96, 64], origin: [48, 48],   // canvas, and where (0, 0) sits on it: the feet or the impact point
  duration: 0.8, loop: false, fps: 30, bg: "dark",
  options: { palette: PAL.ice, seed: 1 }, // plus the effect's own knobs; x, y, flip, angle and light are reserved
};
export function draw(p, t, o) { /* a pure function of t */ }
// or: export function create(o) { return { update(dt) {}, draw(p) {}, drawBack(p) {} }; } for a simulation
```

- Local coordinates: `(0, 0)` is the origin, y points down, ground effects stand on y = 0, directional effects face right.
- `const C = fit(o.palette, 8)` so any palette length works; use hard ramp steps in `color` and keep softness for `p.glow`/`p.light`.
- Painter: `p.px`, `p.dot` (dithered alpha), `p.blend`, `p.disc` (translucent volume), `p.line`, `p.beam`, `p.circle`, `p.ring`, `p.ellipse`, `p.rect`, `p.poly`, `p.shade(x0, y0, x1, y1, (x, y, out) => …)`, `p.glow(x, y, r, c, k)` with k 0.15 to 0.5, `p.glowLine`, `p.light`.
- Particles: `burst(n, o.seed, fn)` and `cycle(t, period, count, o.seed, life, fn)` for pure effects; `Particles`, `Bits` and `Lights` with `new Rng(o.seed)` for simulations.
- Deterministic: never `Math.random()` or `Date`; all randomness comes from `o.seed`. The same `t` draws the same frame.
- One-shots end empty at `t = duration`. Loops match at `t = 0` and `t = duration`: drive them by `t / meta.duration`.
- An effect with a character can export `act` (poses, hits with freezes, a target that reacts); copy the shape from a built-in one in `melee/` or `moves/`.
- Generic motifs are fine; never recreate a specific game's sprites, characters or logos.

## 3. The loop: write, check, look, fix

1. Find the two or three closest effects and read their code for techniques.
2. Write a draft with `write_effect`. When the direction is open, write a few genuinely different drafts (`<name>-a`, `<name>-b`) and compare them.
3. Fix every error the check returns. Warnings name real problems: drawing outside the canvas, a one-shot that doesn't end empty, a loop seam, an undefined color with a short palette, slow frames.
4. `show_effect` it, then `panel_screenshot`, and judge it like a picky pixel artist: a clear silhouette and one focal point at 1x, fast in and slow out, varied particles, light from one side, no lone speckle pixels. Use the `sheet` view to see every frame.
5. Fix the worst thing and look again. Three rounds at least. Delete the drafts you don't keep.

## 4. Use it in a game

A canvas or WebGL game in JS imports the project's copy directly. `pixelfx/` holds everything it needs:

```js
import { createFrame, clearFrame, createFx, composite } from "./pixelfx/core/index.js";
import * as frostNova from "./pixelfx/fx/ice/frost-nova.js";

const frame = createFrame(320, 180), img = new ImageData(320, 180);
const fx = createFx(frostNova, { x: hero.x, y: hero.y, flip: hero.facing < 0, palette: [...] });
// each tick
fx.update(dt);
clearFrame(frame);
fx.draw(frame, "back"); /* characters */ fx.draw(frame, "front");
composite(frame, img.data, null);
ctx.putImageData(img, 0, 0); // scale the canvas up with image-rendering: pixelated
if (fx.done()) remove(fx);
```

An effect with an `act` plays with its stock character through `createAct(mod, { x, y })`, or its timing (`windup`, `recovery`, `hits`) drives the game's own character.

Any other engine (Godot, Unity and others) uses a sprite sheet: `export_effect` with `sheet-both` writes a transparent PNG and Aseprite JSON to `pixelfx/exports/`, whose `meta.pixelfx` has fps, loop, frame size and the pivot. Import it with nearest-neighbour filtering and no compression, and set the pivot to `meta.pixelfx.pivot`.

`pixelfx/LICENSE-pixelfx.md` is pixelfx's MIT notice; keep it with the copied files.
