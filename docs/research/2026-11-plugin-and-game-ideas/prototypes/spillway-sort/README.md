# Spillway Sort (溢流排序): one-week prototype

The first game candidate in [`FINAL.md`](../../idea-lab/FINAL.md) §5 that shares a
pipeline with Falling Arrows. Water sort with overflow pipes: pour into a bottle
with a pipe and what rises above its rim flows into the next bottle, whatever
that bottle's top colour; full bottles pass it on. The rule is O1 of the
[solver experiment](../../idea-lab/experiments/overflow-sort/).

**This is a test, not a game yet.** Its job is to find out, with real players,
whether the overflow is something people understand and enjoy. The solver
already showed it doesn't make puzzles shallower, and that its depth only shows
in levels built to need it.

## Play it

Serve the `prototypes/` folder, since both prototypes share
[`shared/record.js`](../shared/record.js), and open `spillway-sort/index.html`. It
loads `levels.json` and ES modules, so a `file://` page won't work.

```sh
npx serve docs/research/2026-11-plugin-and-game-ideas/prototypes
```

- Tap a bottle, then the bottle to pour into. After choosing where to pour
  from, hold the bottle you'd pour into for half a second to see where the
  water would go without pouring. A refused pour shakes the bottle.
- `?level=11` opens a level; `?daily=1` today's level (by the device's date);
  `?control=1` the control version. A reload goes back to the level the player
  was on.
- Each tester gets their own record: `?player=anna`, or **Levels → New player**
  on a shared test phone.
- **Levels → Copy results** copies that player's record for the sheet below.
- The page has OhMyGame's playtest bridge: `window.__OHMYGAME_PLAYTEST__`
  `snapshot()` (player, level, kind, bottles, pipes, moves, solved), `reset()`,
  `setSeed(n)` opens level n (0 for today's).

### The control version

It's there to tell whether the pipes, rather than just more water sort, are
what players like. So its levels are matched to the main version's, level for
level: of 40 classic-solvable deals with the same bottles and colours, the one
closest in shortest solution and dead-end ratio. On levels 11–22 the main
version averages 18.9 moves and 0.71 dead ends; the control 18.3 and 0.60.
The gap that's left is the pipes' own: a rescued level needs them, so it is a
little harder by construction.

## What's in it

| File | What |
|---|---|
| `src/rules.js` | The pour rule, with the path the water takes |
| `src/solver.js` | The whole reachable graph: solvable, shortest solution, dead ends, whether every shortest solution needs the overflow, hints |
| `src/generator.js` | Seeded deals and pipes, and levels by kind: classic-solvable, or rescued (unsolvable without the overflow) |
| `tools/build-levels.mjs` | Writes `levels.json`: 10 tutorials (the first 5 without pipes; those with pipes checked under the overflow rule), 12 rescued levels with 6 colours, 8 with 8 colours; and the control version's 30, matched as above. Every level says its `kind` |
| `src/game.js`, `index.html`, `style.css` | The game: no dependencies, DOM only |
| `../shared/record.js` | The playtest record (per player, every try, the order levels were opened), the local date, and tap-and-hold that a cancelled touch or a release elsewhere doesn't trigger |
| `test/rules.test.mjs` | The rule; the solver against 40 deals from the Python experiment (state counts, solvability, shortest solution, dead-end ratio and whether the overflow is needed match under both rules); every level in `levels.json` solvable as played |
| `tools/e2e.mjs` | Plays a rescued level in an emulated iPhone with taps, following the solver, and checks the preview, undo, restart, the shake, a cancelled touch, the record (tries, players, the open log), resuming, the daily level, nine bottles on a 320 px screen, and the control version |

```sh
node --test docs/research/2026-11-plugin-and-game-ideas/prototypes/spillway-sort/test/*.test.mjs
node docs/research/2026-11-plugin-and-game-ideas/prototypes/spillway-sort/tools/e2e.mjs [screenshot-folder]
```

The e2e needs Playwright; where it is installed globally, set
`PLAYWRIGHT_ROOT=$(npm root -g)`.

## The week (from the validation plan)

1. **Days 1–2**: this build. Done, except the liquid animation: a pour shows the
   water's path bottle by bottle, not flowing liquid.
2. **Days 3–4**: five players, ten minutes on each version, order chosen at
   random. Record the screen and their voice. Optionally, Poki's playtest
   recordings of a web upload.
3. **Day 5**: fill in the sheet; decide.

## Sheet

| Measure | How | Target | Kill if |
|---|---|---|---|
| Overflow prediction | Before a pour into a piped bottle, the player points at where the water will end up; count right and wrong | ≥70% | <50% |
| Rescued levels solved | From Copy results: levels of `kind: "rescued"` with a try whose `outcome` is `solved` ÷ rescued levels with any try | 40–80% | <25% |
| Hesitation at the first overflow | On the first rescued level's solving try: `firstOverflow.pauseMs` (the pause before that pour) and `firstOverflow.previewsBefore` | — | — |
| Next level rate | From `opens`: solves followed by an open of a different level ÷ solves, main vs control | main ≥ control | main < control |
| "What's different?" | After both versions, ask in one sentence | ≥3 of 5 can say | ≥3 of 5 can't |

A try ends `solved`, or `abandoned` when the player restarts or opens another
level; a try still open when results are copied has no `outcome`. Each try
also has `moves`, `undos`, `previews` and its start and end times.

If any kill line is crossed, Spillway Sort leaves the shortlist and becomes one
skin of the shared pipeline; Falling Arrows becomes its only outlet.
