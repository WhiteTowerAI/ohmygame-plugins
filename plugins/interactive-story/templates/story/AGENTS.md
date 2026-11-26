# Interactive Story

This project is an interactive story played as a web page: Scenes joined by
the player's choices, such as a visual novel or an interactive film. When the
Interactive Story Skill is available, read it first: it adds Scenes from
starters and checks the story.

- `index.html` loads the story runtime in `story/`, which reads `graph.json`
  and plays each Scene from its own files. Open the page to play.
- `graph.json` is the story's flow: the viewport, the starting State and its
  Variables, the Assets, the Scenes (`nodes`) with their Exits (`signals`), and
  the connections (`edges`). `schemas/graph.schema.json` is its exact shape.
- A Scene's HTML, CSS and JavaScript are ordinary files under `nodes/<id>/`,
  named by its `source`. Its JavaScript exports `mount(context)`, renders into
  `context.root`, and may return a cleanup function. `README.md` lists
  everything `context` offers.
- A Scene leaves only through an Exit it declares:
  `context.navigation.emit(exitId)`. Exits describe outcomes, not targets; a
  connection in `graph.json` decides where each one goes. Use `replace` for
  going forward and `push` only when the player should be able to return with
  `context.navigation.back()`.
- Read and change the game's State through `context.state`. A top-level State
  key is a Variable: something that crosses Scenes or belongs in the save,
  such as `trust` or an `inventory` list. Give each a starting value in
  `initialState` and one line in `variables`. Progress inside one Scene stays
  in its code.
- To branch on progress, read State in the Scene and emit a different Exit for
  each outcome. Give such an Exit a `when`, one short sentence saying when it
  is taken, such as "if trust is 3 or more", and keep it true when the logic
  changes.
- Every Scene must show something sensible with the starting State.
- A Scene may use only Assets listed in its `assets`, resolved with
  `context.assets.url(assetId)`. Media goes in `graph.json` `assets` as a
  project file, so publishing includes it.
- Build every screen with the Project Style in `shared/style/`: import
  `shared/style/components.css` from a Scene's CSS and use its tokens and
  classes. Add a token or component there instead of hard-coding values, and
  restyle the game there first.
- A Scene's background is one
  `<div class="backdrop" data-media="backdrop" data-asset="ID" data-type="video|image">`
  inside a `.has-backdrop` container. To change it, change those two
  attributes. `showBackdrop(context)` and `playScene(context, { signal })`
  from `shared/style/components.js` show it. To trim a background video, set
  `data-clip-start` and/or `data-clip-end` (seconds in the original file) on
  that element.
- Music that carries on across Scenes goes through
  `context.audio.music(assetId)`, not an `<audio>` element. A Scene that reads
  a long sequence one step at a time keeps its place with `context.position`,
  so Continue returns there.
- UI shown on more than one Scene, such as a Home button, is a shared
  component under `shared/components/` that each Scene imports; it emits that
  Scene's Exits, so each one declares them. Mark an Exit that is a way around
  the game rather than a step in the story, such as Home or Settings, with
  `"role": "navigation"`. An entry whose Exit may go nowhere checks
  `context.navigation.connected(exitId)` and shows disabled.
- Scene code loads as browser modules, with no bundler: import project files
  by relative path, fetch text with
  `await (await fetch(new URL("./script.txt", import.meta.url))).text()`, and
  import JSON with `with { type: "json" }`. Packages from `node_modules` are
  not available.
- The runtime in `story/` is this project's code. Change it when the game
  needs something it doesn't do, and keep `graph.json` as the flow, the
  `context` each Scene receives, and the `scene` query parameter, which starts
  the page at a Scene.
- Keep IDs and file paths stable when changing a Scene. Before publishing,
  every Exit other than navigation ones must be connected.

The author thinks in Scenes, Exits and Variables, not keys and code: say "the
`trust` Variable" and "the Exit is taken if trust is 3 or more".
