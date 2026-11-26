# Interactive Story

Make visual novels and interactive films as web games.

Official OhMyGame plugin `ohmygame/interactive-story`. A story made with it is
an ordinary web game: `index.html` loads the story runtime in `story/`, which
plays `graph.json`'s Scenes from their own files. It gives:

- **A [project template](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/plugins.md#project-templates)**,
  `story` (`templates/story/`): a story that plays from its first Scene, with
  the runtime, the Project Style in `shared/style/`, `AGENTS.md`, `README.md`
  and `schemas/`. It's copied once; updating the plugin only changes stories
  made afterwards, and each story's runtime is its own to change.
- **A Skill**, `interactive-story`, with Scene starters in `scenes/` (main
  menu, choice, QTE, hotspot, ending, story map, visual novel) and two
  scripts: `add-scene.mjs` adds a Scene from a starter, and `check.mjs`
  checks the story, strictly with `--publish`.

## The runtime

The runtime's TypeScript source is in `runtime/`, outside the package. Build
it into the template after changing it:

```sh
npm run build:interactive-story
```

Each module is one source file with its types removed and its comments kept,
so the Agent can read and change a story's copy. The tests fail when the
template's copy doesn't match the source, and `npm run typecheck` checks the
source.

The starters' pictures are stills from the Last Bus example, made by the
OhMyGame team and licensed under Apache 2.0 (`NOTICE.txt` beside each).
