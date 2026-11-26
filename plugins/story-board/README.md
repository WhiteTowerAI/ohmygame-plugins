# Story Board

`ohmygame/story-board` adds a Story Board panel to any project: a canvas for the
shape of a game, with chapters, scenes, levels, quests or screens as cards,
and arrows for where each leads. It is a design document and runs nothing;
use it for an interactive story's branches, a platformer's level order, a
quest line, or anything else with a flow.

It is an early Beta. Open it from the panel menu.

## What it adds

- **Story Board panel.** A canvas drawn and handled as OhMyGame's own
  canvases are (the plugin's `panel/canvas.js`): pan and zoom, a pointer and
  a hand tool, grid snapping and alignment guides while dragging, marquee
  selection, and the zoom controls and tool bar. Cards look
  like the app's canvas nodes, with + ports either side: drag from one to
  another card to draw an arrow, or click it to add a card joined there. An
  arrow with a label is a row on its card's right side, with its condition
  beside it; one without is only its line, and hovering it offers scissors to
  cut it. Everything else is edited where it shows: double-click empty canvas
  to add a card, and a card's title (or its pencil) or an arrow's row to name
  it. Each card has buttons to add a picture, chosen from this computer, or to
  write its text; the right-click menu removes a picture. ⌘Z and ⇧⌘Z undo
  and redo the author's own changes (an Agent's edit starts the history
  again), and ⌘C, ⌘V, ⌘D or an Option-drag copy cards with the arrows
  between them. Picking cards tells the Agent which ones the author is
  looking at.
- **Skill** `story-board`, which tells agents the board's format and to keep
  it in step with the game.

## Files

The board lives in the project, in `story-board/`:

- `board.json`: the cards (`id`, `title`, and
  optional `tag`, `summary`, `image`, `files`) and the arrows (`from`, `to`,
  and optional `label` and `when`). The Agent and the panel both change it;
  the panel can't change it while the Agent works.
- `layout.json`: where each card sits. Only the panel writes it.
- `images/`: pictures added to cards from the panel.

`board.json` has a `version`, now 1. The panel reads what it can of a board
the Agent or an older panel wrote and writes back only the format's fields; it
won't write over a board from a later version.

Requires OhMyGame API 2.37.
