# PixelLab (Beta)

An optional OhMyGame plugin for [PixelLab](https://www.pixellab.ai/): pixel
art, characters, objects, animations, rotations, tilesets, tiles, effects, UI
and pixel-art edits, as models in the Image node. Requires OhMyGame plugin API
**2.34**. It is not preinstalled; add it from the plugin market.

## Connect

1. Create an API key in your PixelLab account.
2. Add the plugin and approve `api.pixellab.ai`, plus `cdn.pixellab.ai`,
   `supabase.pixellab.ai` and `backblaze.pixellab.ai`, where PixelLab stores
   some results.
3. Enter the key in plugin settings and turn on **Every project**.
4. Choose a PixelLab model in an Image node or the model settings.

The key stays in the app. The sandbox asks the host to authenticate requests,
including GIF downloads, which PixelLab serves only to the key holder.

## Models

Sizes are fixed by each model, so the Image node shows no resolution choice
for them; the models marked *aspect* offer aspect ratios.

| Group | Model (ID) | PixelLab endpoint | Input | Result |
|---|---|---|---|---|
| Pictures | Pixen pixel art (`pixen`) | `create-image-pixen` | Description | 512×512 PNG |
| | Pixflux pixel art (`pixflux`) | `create-image-pixflux` | Description; *aspect* | PNG, 192px long side |
| | Bitforge pixel art (`bitforge`) | `create-image-bitforge` | Description; optional style picture; *aspect* | PNG, 128px long side |
| | Pixel art (Pro) (`image-pro`) | `generate-image-v2` | Description; up to 4 subject pictures; *aspect* | PNG, 256px long side |
| | Pixel art in a style (Pro) (`style-pro`) | `generate-with-style-v2` | Description; 1–4 style pictures | PNG at the style's size |
| | Pixel art (Pro Flash) (`image-pro-flash`) | `create-image-pro-flash` | Description; optional style picture | 128×128 PNG |
| | UI elements (Pro) (`ui`) | `generate-ui-v2` | Description; optional concept picture; *aspect* | PNG, 256px long side |
| Edits | Convert to pixel art (`to-pixel-art`) | `image-to-pixelart` | One picture | PNG at a quarter of its size |
| | Convert to pixel art (Pro Flash) (`to-pixel-art-pro-flash`) | `image-to-pixelart-pro-flash` | One picture; optional style text | PNG at a detected pixel size |
| | Enlarge pixel art 2× (`resize-2x`) | `resize` | One picture up to 100px | PNG at twice its size |
| | Remove background (`remove-background`) | `remove-background` | One picture up to 400px; optional subject text | Transparent PNG |
| | Normal map (`normal-map`) | `normal-map` | One picture | Normal map PNG |
| | Edit pixel art (`edit`, `edit-pro`, `edit-pro-flash`) | `edit-image`, `edit-images-v2`, `edit-image-pro-flash` | One picture and the change | PNG at its size |
| Characters | Character v3 (8 directions) (`character`) | `create-character-v3` | Description, or one reference | GIF turning through 8 directions |
| | Character (4 / 8 directions) (`character-4`, `character-8`) | `create-character-with-4-directions`, `create-character-with-8-directions` | Description; optional south view, 16–128px | GIF turning through its directions |
| | Character (Pro) (`character-pro`) | `create-character-pro` | Description; optional style picture | 64×64 GIF, 8 directions |
| | Character (Pro Flash) (`character-pro-flash`) | `create-character-pro-flash` | Description, or one south view | GIF, 8 directions |
| | Character variant (`character-state`) | `create-character-v3`, then `create-character-state` | One character and the change | GIF of the new character |
| Animation | Frame animation (`frame-animation`) | `animate-with-text-v3` | One picture and a motion | 8 frames |
| | PixMiniMax animation (`pixminimax-animation`) | `animate-pixminimax` | One picture and a motion; Tier 1 plan | 8 frames after the input frame |
| | Frame animation (Pro) (`animation-pro`) | `animate-with-text-v2` | One picture of at least 32px and a motion | PixelLab's frames |
| | In-between frames (Pro) (`interpolation`) | `interpolation-v2` | Start and end pictures and the change | PixelLab's frames |
| | Skeleton animation (`skeleton-animation`) | `create-character-v3`, then `characters/animations` | One character and a motion | South-facing GIF |
| Rotation | Rotate (`rotate`) | `rotate` | One south-facing picture; a direction in the prompt, east by default | PNG |
| | 8 rotations (`rotations-8`, `rotations-8-pro`) | `generate-8-rotations-v3`, `generate-8-rotations-v2` | One south-facing picture (Pro also from a description) | 8 frames |
| Objects | Object (Pro Flash) (`object`) | `create-object-pro-flash` | Description; optional style picture | 64×64 PNG |
| | Object (Pro) (`object-pro`) | `create-1-direction-object` | Description | First 64×64 candidate |
| | Object (8 directions) (`object-8`) | `create-8-direction-object` | Description; optional object to turn | GIF turning through 8 directions |
| | Object animation (`object-animation`) | `create-object-pro-flash`, then `objects/{id}/animations` | One object and a motion | GIF |
| Maps | Top-down tileset (`tileset`) | `create-tileset` | `lower \| upper`, optionally `\| transition` | 4×4 sheet of 32px tiles |
| | Sidescroller tileset (`tileset-sidescroller`) | `create-tileset-sidescroller` | Platform, optionally `\| surface` | Sheet of 32px tiles |
| | Isometric tile (`isometric-tile`) | `create-isometric-tile` | Description | 32×32 PNG |
| | Tiles (Pro) (`tiles-pro`) | `create-tiles-pro` | Description | First 32px top-down tile |
| Effects | Effect (`vfx`) | `vfx` | Description; optional sprite | GIF |

Frame results are composed by the app into a GIF. References larger than each
model's limit are scaled down by the app with nearest-neighbour sampling
before they reach PixelLab; the canvas keeps the original picture. Models that
use a picture as the subject accept an empty description.

Every request is a paid PixelLab job, recorded with `host.submit`. Multi-step
models (Skeleton animation, Character variant, Object animation) pay for each
step. After a restart, retry checks the original job; a lost submission
response is not sent again. Stop ends local waiting only: PixelLab may still
finish the job and charge for it. Waiting is bounded at 30 minutes.

Not included: inpainting and animation edits, which need a mask or an
animation as input; skeleton keypoints; map objects; rooms, fonts, music,
sound effects and lip-sync; character and object library management; and
multi-direction sprite sheets, which PixelLab exports only as ZIP files.

## Manual validation

Each step is a paid PixelLab job.

1. Generate Pixen, Pixflux at 16:9, and Pixel art (Pro Flash) art, with and
   without a transparent background.
2. Create Character (4 directions) from a description and from a 64×64
   reference; check that the GIF downloads and plays on the canvas.
3. Make Frame animation, PixMiniMax animation and In-between frames from
   references, and Skeleton animation without a reference (generation stays
   disabled).
4. Run Rotate with `west`, 8 rotations, Object (Pro Flash), Object animation,
   Top-down tileset with `grass | water`, Isometric tile and Effect.
5. Convert a photo to pixel art, remove a background and edit a sprite.
6. Quit while a character job runs, reopen, retry: PixelLab should show one job.
7. Check wrong-key, out-of-credit and failed-job messages.

## API sources

Reviewed 2026-11-24: [PixelLab API v2 OpenAPI](https://api.pixellab.ai/v2/openapi.json)
and [endpoint index](https://api.pixellab.ai/v2/llms.txt).
