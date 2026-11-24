# Pixel Effects

Browse 244 pixel art effects, make your own in the project and export sprite
sheets.

Official OhMyGame plugin `ohmygame/pixelfx`, an optional Beta for OhMyGame
plugin API **2.38+**, ported from [pixelfx](https://github.com/rrenovation/pixelfx)
(MIT; see [NOTICE.md](NOTICE.md)). It is off until a project turns it on, and
isn't released yet: the package is `private` while the port is in progress.

## What it does

The **Pixel Effects** panel keeps the pixelfx gallery's look, with its four
colour themes and one that follows the app's colours. It shows the 244
built-in effects and the project's own, each drawn by code frame by frame:

- pick an effect from the strip at the bottom, under **Built-in** or
  **Project**, by category or by searching names in English or Chinese, tags
  and ids;
- play it on the stage over a backdrop, pause, replay, change the speed or
  scrub frame by frame (Space plays and pauses, ← → change the effect, and
  Shift+← → step a frame);
- change its backdrop, palette (or each colour), seed, frame rate, length,
  size, flip and actor, and the options its code declares, and keep settings
  you like as a preset in `pixelfx/presets.json`;
- see it as a transparent sprite sheet, or read its source, a usage example
  and the sheet's JSON;
- export it: a transparent sprite sheet or a contact sheet goes to the
  Library, and a sprite sheet with Aseprite JSON, a GIF or single frames are
  saved to `pixelfx/exports/` in the project.

### The project's effects

**Copy to project** puts a built-in effect in `pixelfx/fx/<category>/<name>.js`,
unchanged, with what it imports: pixelfx's engine in `pixelfx/core/` (its
version in `pixelfx/core/VERSION`), the category's `_lib.js`, and for an
attack in `moves/` the effects it chains. The license goes in
`pixelfx/LICENSE-pixelfx.md`. A file the project already has is never
replaced, so changes made to it stay. **New effect** starts from pixelfx's
template.

A project effect can be renamed, deleted and edited in the Code view; saving
checks it, as pixelfx's `tools/check.mjs` does, and lists its errors and
warnings. The panel plays the project's copy and loads it again when its file
changes, whoever changed it. A web game imports the same files:

```js
import { createFrame, clearFrame, createFx, composite } from "./pixelfx/core/index.js";
import * as torch from "./pixelfx/fx/fire/torch.js";
```

### The agent

The panel answers tools the agent uses as `ohmygame__pixelfx__<tool>`, and the
person sees each one work in it:

| Tool | Does |
| --- | --- |
| `find_effects` | lists effects matching words, a category or where they are |
| `read_effect` | an effect's code and meta |
| `copy_effect` | copies a built-in effect into the project |
| `write_effect` | writes a project effect, then checks it |
| `check_effect` | checks an effect |
| `show_effect` | shows an effect with preview settings, for `panel_screenshot` |
| `export_effect` | exports what's shown to the Library or `pixelfx/exports/` |

The panel also tells the agent which effect is open and how it's set, and the
**pixelfx** Skill has the effect contract and the write, check, look and fix
loop.

## Coming next

The panel's assistant, sound effects, render and check tools for the agent
without the panel, a Library source and a Canvas node.

## Limits

- The built-in effects are read-only; copy one to change it.
- After a save, the panel loads the effect again once the app reports the
  file changed, which it waits up to 3 seconds for.
- The check runs in the panel and holds it while it runs: about a quarter of
  a second for most effects, several seconds for the biggest ones.
- An export holds all its frames at once, so it stops at 64 million pixels
  across them (for example 1024×1024 at 30 fps for 2 seconds), and its sprite
  sheet or contact sheet must fit in a canvas. GIFs play at 50 fps at most.
- Settings aren't kept when you change effects or close the panel, besides
  presets; the colour theme and the last effect are.
