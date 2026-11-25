# Pixel Effects

Browse 244 pixel art effects, make your own in the project, give them sound
and export sprite sheets.

Official OhMyGame plugin `ohmygame/pixelfx`, an optional Beta for OhMyGame
plugin API **2.38+**, ported from [pixelfx](https://github.com/rrenovation/pixelfx)
(MIT; see [NOTICE.md](NOTICE.md)). It is off until a project turns it on.

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
- give it sound, play it alone or with the effect, and add it to the Library;
- export it: a transparent sprite sheet or a contact sheet goes to the
  Library, and a sprite sheet with Aseprite JSON (and its sound), a GIF or
  single frames are saved to `pixelfx/exports/` in the project.

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

### Sound

An effect's sound is a script in the project,
`pixelfx/sfx/<category>/<name>.js`, made with pixelfx's sound engine, which
the panel copies to `pixelfx/sfx-core/` the first time, beside its version.
The script exports a few `variants`; the panel renders each to a 22,050 Hz
WAV file in `pixelfx/sfx/<category>/<name>/`, with `sfx.json` listing them
with their length, loudness, waveform and cues. **Render** renders the
script again after it changes. A built-in effect's sound is the project's too.
Renaming an effect takes its sound along; deleting one deletes its sound,
unless a built-in effect of the same name still plays it.

**Make with model** asks the audio model set up in OhMyGame's Settings for a
sound, from a description the panel writes from the effect and the person
can change. It may cost them; the sound is kept as a variant and in the
Library.

**Play with effect** plays the chosen variant each time the effect starts,
at the stage's speed. A sprite sheet saved with its JSON takes the chosen
sound along and names it in `meta.pixelfx.sound`.

### The assistant

**AI** opens the panel's assistant: the person's language model, run by the
app with the panel's tools, as in pixelfx's AI drawer. It knows the effect
shown and its settings, shows each tool it uses and what came of it, and can
be stopped. The app keeps the conversation for each project, and its history
undoes each change the assistant made. **New chat** clears it.

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
| `read_sfx` | an effect's sound script and variants, and its length and hits |
| `write_sfx` | writes an effect's sound script and renders it |
| `make_sfx_with_model` | makes a sound with the person's audio model, when they ask |

`render_effect` comes from the plugin's native code instead, so it works
without the panel, such as for an agent outside the app: it checks an effect,
built-in or the project's, and renders it with its default settings to a
transparent sprite sheet and Aseprite JSON in `pixelfx/exports/`, in place of
an earlier export of the same name. A project effect's code runs on this
computer, as the game's does, in a process of its own started from a copy of
`pixelfx/fx/` and `pixelfx/core/`. Node's permission flags keep it to
reading that copy, with no environment, which keeps ordinary code in bounds
but isn't a sandbox: use it only in projects you'd run.

The panel also tells the agent which effect is open, how it's set and what
sound it has, and the **pixelfx** Skill has the effect and sound contracts
and the write, check, look and fix loop.

### The Library

The Library page gets a **Pixel effects** tab with the built-in effects, found
by the same words as in the panel's search. Adding one adds its transparent sprite
sheet at its default settings. Like any Library tab, it shows only while the
plugin is on for every project.

## Limits

- The built-in effects are read-only; copy one to change it.
- After a save, the panel loads the effect again once the app reports the
  file changed. It waits up to 3 seconds to check it; a report that comes
  later, such as while an agent works, plays the new code unchecked.
- The check runs in the panel and holds it while it runs: about a quarter of
  a second for most effects, several seconds for the biggest ones.
- An export holds all its frames at once, so it stops at 64 million pixels
  across them (for example 1024×1024 at 30 fps for 2 seconds), and its sprite
  sheet or contact sheet must fit in a canvas. GIFs play at 50 fps at most.
- Settings aren't kept when you change effects or close the panel, besides
  presets; the colour theme, the last effect and whether the assistant is open
  are.
- The Library tab draws each thumbnail when it first shows, about a tenth of
  a second each; a page of 30 takes a few seconds the first time.
- `render_effect` runs a project effect from a copy of `pixelfx/fx/` and
  `pixelfx/core/`, so it can't import files outside them.
- Sound renders in the panel, a variant at a time, up to 8 variants of 12
  seconds each. Play with effect follows the stage's speed and length, not
  each frame.
- The assistant needs a language model and a model-made sound an audio
  model, both set up in Settings. Neither works in a Plugin Builder preview.
