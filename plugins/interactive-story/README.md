# Interactive Story

What a new Interactive Story starts from.

Official OhMyGame plugin `ohmygame/interactive-story`, preinstalled. It gives
one [project template](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/plugins.md#project-templates),
`blank`: the story's own files a new Interactive Story starts with.

- `templates/blank/graph.json`: an empty story, 1280 × 720, with no Scenes.
  OhMyGame titles it after the project.
- `templates/blank/editor/layout.json`: the Story canvas's layout.
- `templates/blank/shared/style/`: the Project Style every Scene imports.

OhMyGame adds the rest when it copies the template: `index.html`, the runtime
under `story/`, `AGENTS.md`, `README.md` and `schemas/`. The app doesn't list
`blank` as a template, since choosing the Interactive Story type starts from
it. Without this plugin, installed and on, no new story can start; existing
stories still open.

The template is copied once: updating the plugin only changes stories made
afterwards. Keep `shared/style/` in step with the Project Style the app's
Scene Templates import (`src/daemon/assets/story-templates/project/` in the
app) until those Templates move here too.
