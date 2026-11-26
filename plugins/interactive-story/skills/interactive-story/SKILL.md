---
name: interactive-story
description: Make an interactive story, such as a visual novel or an interactive film, as a web game played from graph.json with the story runtime in story/. Use in a project with graph.json and story/, or when the person wants to start one; adds Scenes from starters (main menu, choice, QTE, hotspot, ending, story map, visual novel) and checks the story.
---

# Interactive Story

A story here is a web game: `index.html` loads the runtime in `story/`, which
plays `graph.json`'s Scenes from their own files under `nodes/`. Read the
project's `AGENTS.md` and `README.md` first; they are the contract. This Skill
adds what isn't in the project: starters for new Scenes and a check.

Run the scripts from the project folder, with Node 22 or later:

```text
node <skill-directory>/scripts/add-scene.mjs <starter> <id> [title]
node <skill-directory>/scripts/check.mjs [--publish]
```

## Starting a story

A project made from the Interactive Story template already plays: one Scene,
`opening`, over a placeholder picture. On the first change:

- Set `graph.json` `title` and the page's `<title>` to the story's name.
- Give the `ohmygame-story` meta tag in `index.html` a new UUID if it is
  empty. It names the players' saves; never change it once players have
  played. `add-scene.mjs` fills it when it's empty.
- Change `viewport` when the story isn't 1280 × 720, such as a vertical one.

A web game project that wants to become a story needs the template's files:
`index.html`, `story/`, `graph.json`, `shared/style/`, `AGENTS.md`,
`README.md` and `schemas/`. Copy them from this plugin's
`templates/story/` (next to `skills/`), never over a file the project has.

## Adding a Scene

`add-scene.mjs` writes `nodes/<id>/` from a starter, adds the Scene to
`graph.json` with the starter's Exits, and copies the shared files it uses
when the project lacks them. It prints what the author usually wants next;
do that. Then connect the Scene: add an edge
`{ "id", "source": { "nodeId", "signal" }, "targetNodeId", "mode": "replace" }`
for each Exit, and rename Exits to the outcomes they stand for, in both the
Scene's code and `graph.json`.

| Starter | What it is | Exits |
| --- | --- | --- |
| `blank` | A video or an image, then next | `next` |
| `main-menu` | A title, the game's entries, Load, and Settings | `start`, `story-map` (navigation) |
| `choice` | Answers that lead different ways | `option-a`, `option-b` |
| `qte` | Press in time, or miss | `success`, `fail` |
| `hotspot` | Spots on a picture to click | `door`, `window` |
| `ending` | The end, with Play again | none |
| `story-map` | The branches the player has found so far | none |
| `visual-novel` | Dialogue lines with characters, then answers | `option-a`, `option-b`, `title` (navigation) |

Starters are starting points, not types: rewrite a Scene freely. Their
pictures are from the Last Bus example and show until the author sets a
background. Write the author's words as given; never invent dialogue for a
visual novel unless asked.

## Checking

Run `check.mjs` after changing `graph.json`, a Scene, or what Scenes import,
and fix what you introduced. Before publishing, run it with `--publish`: every
Exit other than navigation ones must be connected. Then play the story in the
Game panel, or with `game_use`, from the Start; add `?scene=<id>` to the
page's address to start at one Scene.

## The flow on the Story Board

When the Story Board plugin is on, the board in `story-board/board.json` can
show this story's flow for the author. It is a picture, not the game: when
the author changes the flow on the board and asks for it, change
`graph.json` and the Scenes to match, then run the check.
