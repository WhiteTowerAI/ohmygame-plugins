---
name: story-board
description: Read and edit the project's Story Board in story-board/board.json - cards for chapters, scenes, levels, quests or screens, and arrows for where each leads. Use when the author asks to draft, change or follow the board, or to build the game's flow, level order or branches from it.
---

# Story Board

The Story Board is a design document: the shape of the game as cards joined
by arrows. It runs nothing and the game doesn't load it unless the author
asks for that. The author sees it as a canvas in the Story Board panel and
can move cards, draw arrows and edit cards there.

## Files

- `story-board/board.json`: the cards and arrows. You and the author both
  change it.
- `story-board/layout.json`: where each card sits on the canvas. The panel
  writes it; leave it alone. A card it doesn't place yet is placed after the
  cards that lead to it.

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "depot",
      "title": "The depot",
      "tag": "Chapter 1",
      "summary": "The player misses the last bus and meets the driver.",
      "image": "assets/depot.png",
      "files": ["src/levels/depot.ts"]
    },
    { "id": "ride", "title": "The ride", "summary": "Three stops, one choice." }
  ],
  "edges": [
    { "id": "depot-ride", "from": "depot", "to": "ride", "label": "Board the bus", "when": "if the player has a ticket" }
  ]
}
```

- `nodes[].id`: lowercase words joined by `-`, unique, and stable once made.
- `title` is required; `tag` (a short kind or group, such as "Chapter 1",
  "Boss" or "Ending"), `summary` (a sentence or two), `image` (a project
  image path shown on the card; pictures the author adds to cards are kept
  in `story-board/images/`) and `files` (where the game implements it)
  are optional.
- `edges[]`: `from` and `to` are card IDs; `label` is what the arrow is
  (a choice, an exit, "win", "lose"); `when` is the condition in one short
  sentence. `id` is unique, usually `<from>-<to>`.

## Working with it

- **Drafting a board** from the author's idea: make one card per chapter,
  scene, level or screen at the level of detail they asked for, and an arrow
  for each way on. Keep titles short; put the rest in `summary`.
- **Building from it**: read the board first, follow its order and branches,
  and set each card's `files` to where you implemented it. When the game and
  the board disagree, ask which is right.
- **Keeping it current**: when you change the game's flow, change the board
  in the same turn: add, remove or reconnect cards and arrows.
- Removing a card removes the arrows from and to it.
- If `story-board/board.json` doesn't exist and the author asks for a board,
  create it with `"version": 1`.

## Interactive stories

A project with `graph.json` and `story/` is an interactive story, whose
`graph.json` is the game's real flow. While its board is empty, the panel
offers to show the story's Scenes on it: a card per Scene, with its files,
and an arrow per connection, named after the Exit. After that the board is
a picture of the story like any other: when the author changes the flow on
it and asks for the game to follow, change `graph.json` and the Scenes to
match, and keep the cards' `files` pointing at each Scene's files.
