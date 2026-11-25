# Notice

The panel is a port of pixelfx's gallery, from
[rrenovation/pixelfx](https://github.com/rrenovation/pixelfx) at commit
`f58c45572af0dc255369018c8fe5a4c46daba645`, a fork of
[patch-gg/pixelfx](https://github.com/patch-gg/pixelfx). pixelfx is
Copyright (c) 2026 Patch and Copyright (c) 2026 Hugo Duprez, under the MIT
license in `panel/lib/LICENSE`.

- `panel/lib/core/`, `panel/lib/fx/` and `panel/lib/zh-data.js` are pixelfx's
  `src/core/`, `src/fx/` and `gallery/zh-data.js`, copied as they are, with
  each file's own header.
- `panel/lib/NOTICE.md` is pixelfx's notice, also as it is. It credits
  **Sprite Fusion**'s pixel art VFX (https://www.spritefusion.com/pixel-art-vfx,
  Copyright (c) 2026 Hugo Duprez, MIT), which `sim.js` and the effects that
  say so adapt, and **Hollow Crown**
  (https://github.com/rehan-remade/hollow-crown, Copyright (c) 2026
  rehan-remade, MIT), which `act.js` adapts.
- `panel/export.js`, `panel/options.js`, `panel/stage.js`, `panel/main.js` and
  `panel/style.css` are adapted from pixelfx's `gallery/export-utils.js`,
  `gallery/app.js` and `gallery/style.css`, `panel/check.js` from its
  `tools/check.mjs`, the new effect template in `panel/project.js` from its
  `tools/new.mjs`, `panel/sfx-core.js` from the sound engine in its
  `gallery/browser-backend.js` (without its Ogg encoder and reference
  libraries), the drawer in `panel/agent.js` and its system prompt from its
  `gallery/index.html`, `gallery/app.js` and `gallery/browser-backend.js`, and
  `skills/pixelfx/SKILL.md` from its Skills and workspace rules, all under the
  same MIT license.
- The panel copies `panel/lib/core/` and effects from `panel/lib/fx/` into a
  project's `pixelfx/` folder unchanged, headers included, and
  `panel/sfx-core.js` as `pixelfx/sfx-core/index.js`, with pixelfx's MIT
  license and these credits in `pixelfx/LICENSE-pixelfx.md`.

The Patch Pixel font in pixelfx's `gallery/fonts` is not under its MIT license
and is not included.

The rest of this plugin is under the Apache License 2.0 in `LICENSE`.
