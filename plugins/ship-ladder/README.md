# Ship Ladder

Keep a game small enough to finish: a ship date and a not-doing list every
agent reads, a ladder the game climbs from starting to playable, and a jam
countdown with a fallback build.

Official OhMyGame plugin `ohmygame/ship-ladder`, an optional Beta for OhMyGame
plugin API **2.37+**. It is off until a project turns it on.

## Why

Not finishing is the most common way a small game fails: about half of Ludum
Dare drafts are never published, and in large itch.io jams only about one
entrant in four submits. Postmortems put planning, scope, feature creep and cut
features at about a fifth of everything that went wrong. With an agent, adding
one more feature costs almost nothing, so scope grows faster. See the research
in [`docs/research/2026-11-plugin-and-game-ideas`](../../docs/research/2026-11-plugin-and-game-ideas/idea-lab/FINAL.md).

There is no evidence yet that a tool raises how many games get finished. The
plugin is built to be measured: it records when each rung is first reached, and
its checks are judged against people's own view of their games.

## What it does

- **The plan**, in `design/ship.json`: the ship date, where the game goes out,
  its core loop in one sentence (`core`), what this version leaves out
  (`notDoing`), an optional jam deadline and an optional `coreProbe`. The
  plugin's instructions tell every agent to read it, keep work inside it, and,
  when the person asks for something on the not-doing list, do it and say so in
  the end-of-turn summary. It never adds an approval stop. The schema is
  [`schemas/ship.json`](schemas/ship.json).
- **The Ship ladder panel** (the project toolbar's **Ship ladder** button)
  edits the plan, keeping anything else in the file, and shows three rungs,
  each judged from what can be observed:
  - *The game starts*: the latest [Game Tests](../game-tests) run where every
    test passed, or **Check now**, which opens the game, lets it settle for five
    seconds, and passes it when the console has no errors, no request to the
    game's own site failed, and something is on screen. An answer it can't read
    (cut off, cancelled, no tests) never replaces an earlier verdict.
  - *The core loop does something*: the plan's `coreProbe` (game_use actions,
    and a path in the game's playtest snapshot they should change), played
    after a passing check, or the person's tick.
  - *You can lose and play again*: the person's tick.
- **Jams.** With a deadline, the panel counts down. The plugin has no timer, so
  in the last day it reminds at the first turn that ends, once per deadline, and
  opens the panel, which asks whether to put a "freeze features and ship"
  request in the composer. A panel left open asks on its own when the last day
  starts.
- **Home**: *Start a game with a ship date* puts a request to plan first in the
  prompt box, for new projects that start with the plugin on.

The ladder is kept per project in the plugin's data folder; the plan is the
project's own file.

## Development

The native entry is TypeScript in `src/`, bundled to `dist/` by
`npm run build:ship-ladder` (run before `npm test`). Its tests are in
`test/ship-ladder/`.
