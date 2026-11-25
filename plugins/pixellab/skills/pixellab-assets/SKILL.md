---
name: pixellab-assets
description: Choose and prompt PixelLab models for pixel art, characters, objects, animations, rotations, tilesets, tiles, effects, UI and pixel-art edits. Use when a game asset is made with the PixelLab provider; not for other image providers.
---

# PixelLab assets

PixelLab models appear in the ordinary image catalog under the PixelLab
provider. Use them only when the person has the provider configured. Every
generation is a paid PixelLab job. Pro and Pro Flash models cost several times
more than the others, so prefer a plain model unless the person asks for Pro
quality.

## Choosing a model

| Need | Model | References |
|---|---|---|
| A picture from a description | `pixen` (512×512), `pixflux` (192px long side), `image-pro-flash` (128×128) | none; `image-pro-flash` takes an optional style picture |
| A picture in a given style | `bitforge` (128px), `style-pro` | `bitforge`: optional style; `style-pro`: 1–4 style pictures |
| A picture guided by subject references | `image-pro` (256px long side) | up to 4 |
| Game UI: buttons, bars, slots, panels | `ui` | optional concept picture |
| A character turning through its directions | `character-4`, `character-8` (64×64), `character` (v3), `character-pro`, `character-pro-flash` | optional south-facing picture; `character-pro` uses it as style |
| A variant of a character (outfit, pose) | `character-state` | the character; the prompt is the change |
| A character or sprite moving | `frame-animation`, `pixminimax-animation`, `animation-pro`, `skeleton-animation` | one picture; the prompt is the motion |
| Frames between two pictures | `interpolation` | start, then end; the prompt is the change |
| A sprite facing another way | `rotate` | one south-facing picture; name the direction in English, such as `west` |
| A sprite in all eight directions | `rotations-8`, `rotations-8-pro` | one south-facing picture (`rotations-8-pro` can also start from a description) |
| A prop or item | `object` (64×64), `object-pro`, `object-8` | optional style (`object`) or the object to turn (`object-8`) |
| A prop moving | `object-animation` | the object; the prompt is the motion |
| A top-down terrain tileset | `tileset` | none; prompt `lower terrain \| upper terrain`, optionally `\| transition` |
| Platformer tiles | `tileset-sidescroller` | none; prompt `platform material`, optionally `\| surface` |
| A single isometric block, or square tiles | `isometric-tile`, `tiles-pro` | none |
| An animated effect | `vfx` | optional sprite the effect plays around |
| Pixel art from a photo or painting | `to-pixel-art`, `to-pixel-art-pro-flash` | one picture; the prompt is optional |
| Fixing existing pixel art | `edit`, `edit-pro`, `edit-pro-flash`, `resize-2x`, `remove-background`, `normal-map` | one picture; edits need the change as the prompt |

`pixminimax-animation` needs a PixelLab Tier 1 plan or higher.

## Prompts

- Describe the subject in plain English for pictures, characters and objects.
- For animations, describe the motion only: `walk in place`, `sword slash`.
- For tilesets, separate the parts with `|`, such as `grass | shallow water | sand`.
  The plugin refuses a top-down tileset without both terrains.

## Results and references

Pictures and tiles are PNGs. Characters, objects, rotations, animations and
effects are GIFs. A tileset is PixelLab's 4×4 sheet. `tiles-pro` and
`object-pro` show the first of PixelLab's variations. Do not describe a GIF
as a sprite sheet; the app does not split or rebuild it.

A reference works best as one complete subject on a transparent background,
facing south (toward the camera) for characters and rotations. The app scales
references larger than each model's limit down with hard pixel edges before
sending them; the canvas keeps the original. A GIF used as a reference is sent
as its first frame.

After a failure, use the saved job's Retry instead of generating again, so the
original job is checked.
