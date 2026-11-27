# Falling Arrows (落箭): one-week prototype

The second game in [`FINAL.md`](../../idea-lab/FINAL.md) §5 (G4-02), on the
same pipeline as [Spillway Sort](../spillway-sort/): a seeded generator, a
solver, and levels chosen by what the solver says. Arrow puzzles with gravity:
tap an arrow and it slides off the board the way it points, or bumps into
something and costs a heart; when one leaves, everything above it in its column
falls one cell, so a clear path can close and a blocked one can open.

**This is a test, not a game yet.** Its job is to find out whether gravity is
a real idea or just noise players put down to luck.

## Day 0: does gravity matter? (no players)

The validation plan's first step, which generation 4 hadn't done. Boards built
backwards with gravity (so they can be solved with it), 300 per size, from
`node tools/day0.mjs 300`:

| Size | Arrows (mean) | Unsolvable without gravity | Random tapper wins: all boards | those boards | Dead ends (mapped boards) | Chosen levels (hardest of 8): random tapper wins | dead ends |
|---|---|---|---|---|---|---|---|
| 4×5 | 9.3 | 17.7% | 96.3% | 89.1% | 0.5% | 50.5% | 11.9% |
| 5×7 | 14.5 | 29.3% | 92.4% | 85.9% | 1.5% | 46.6% | 13.4% |
| 6×8 | 19.2 | 36.0% | 89.2% | 82.6% | – | 35.0% | – |

What it says:

- **Gravity changes which boards can be solved.** Up to a third of boards
  need it, more on bigger boards: it isn't decoration.
- **But a typical board is easy.** A random tapper, who only ever taps arrows
  that can leave, clears about nine in ten. Gravity rarely closes the last way
  out. So levels can't be random boards: each is the hardest of 8 candidates,
  which brings the random tapper down to 35–50% and the dead-end share of the
  map up to 12–13%.
- **Known gap: density.** Built backwards, boards stop at 40–50% full,
  because later arrows have no way out. Real arrow puzzles are much denser. A
  denser generator is week-two work, and only worth doing if the playtest
  passes.

6×8 boards are too big to map whole within the solver's cap, so their dead-end
share isn't measured; they are checked solvable with a depth-first search.

## Play it

Serve the `prototypes/` folder, since both prototypes share
[`shared/record.js`](../shared/record.js), and open `falling-arrows/index.html`.
It loads `levels.json` and ES modules, so a `file://` page won't work.

```sh
npx serve docs/research/2026-11-plugin-and-game-ideas/prototypes
```

- Tap an arrow to take it. Hold one for half a second to see the board after
  taking it, or that it would bump; holding takes nothing. A bump shakes the
  arrow. Three bumps end the level.
- `?level=11` opens a level; `?daily=1` today's level (by the device's date);
  `?control=1` the control version; `?preview=0` turns the hold preview off. A
  reload goes back to the level the player was on.
- Each tester gets their own record: `?player=anna`, or **Levels → New player**
  on a shared test phone. Main, control and no-preview play are kept apart.
- **Levels → Copy results** copies that player's record for the sheet below.
- The page has OhMyGame's playtest bridge: `window.__OHMYGAME_PLAYTEST__`
  `snapshot()` (player, level, kind, board, hearts, moves, solved), `reset()`,
  `setSeed(n)` opens level n (0 for today's).

### Levels and the control version

| Levels | Size | Kind | Random tapper wins (mean) |
|---|---|---|---|
| 1–10 | 4×5 | `plain`: solvable with or without gravity | 94% |
| 11–22 | 5×7 | `rescued`: can't be solved without gravity | 42% |
| 23–30 | 6×8 | `rescued` | 33% |

Within a size, levels go from what a random tapper clears most often to least.

The control version plays boards without gravity, matched level for level in
size and number of arrows, so clearing takes the same number of taps. That's
all that can be matched: without gravity, taking an arrow that can leave never
makes a board unsolvable, so the control has no dead ends at all. Its only
difficulty is spotting which arrows can leave. That difference is the thing
being tested.

## What's in it

| File | What |
|---|---|
| `src/rules.js` | Whether an arrow can leave, and taking it, with or without gravity |
| `src/solver.js` | Solvable without gravity (greedy, which is exact there), a random tapper, a depth-first solution, and the whole map with dead ends for small boards |
| `src/generator.js` | Boards built backwards, and levels by kind, each the hardest of 8 for a random tapper; it uses Spillway Sort's seeded random numbers |
| `tools/day0.mjs` | The table above |
| `tools/build-levels.mjs` | Writes `levels.json`: the 30 levels and their 30 matched control boards |
| `src/game.js`, `index.html`, `style.css` | The game: no dependencies, DOM only |
| `test/rules.test.mjs` | The rule, the solver, boards built backwards, and every level in `levels.json` (clearable, its kind, its control matched) |
| `tools/e2e.mjs` | Clears a gravity level in an emulated iPhone with taps, following the solver, and checks a bump and its shake, the preview, a cancelled touch, undo, restart, the record (tries, lost levels), resuming, the daily level, `?preview=0` and the control version |

```sh
node --test docs/research/2026-11-plugin-and-game-ideas/prototypes/falling-arrows/test/*.test.mjs
node docs/research/2026-11-plugin-and-game-ideas/prototypes/falling-arrows/tools/e2e.mjs [screenshot-folder]
```

The e2e needs Playwright; where it is installed globally, set
`PLAYWRIGHT_ROOT=$(npm root -g)`.

## The week (from the validation plan)

1. **Day 0**: the solver comparison above. Done.
2. **Days 1–2**: this build. Done, except the special arrows (pinned, turning,
   column-clearing): they come after the playtest, if it passes.
3. **Days 3–4**: five players, ten minutes each on the main and control
   versions, order chosen at random; then five minutes with `?preview=0`.
   Record the screen and their voice.
4. **Day 5**: fill in the sheet; decide.

## Sheet

| Measure | How | Downgrade if |
|---|---|---|
| Next level rate | From `opens`: solves followed by an open of a different level ÷ solves, main vs control | main is not higher than control |
| "Luck?" | After the main version: "Did clearing feel like skill or luck?" | ≥3 of 5 say luck |
| Leaning on the preview | Per player, the median of `previews` over solving tries on levels 11–30, against that level's arrows (its shortest solution) | median previews > 50% of the arrows, **and** with `?preview=0` more than 1.5 bumps per level |
| Rescued levels solved | Levels of `kind: "rescued"` with a try whose `outcome` is `solved` ÷ rescued levels with any try | (watch: below 25% means the levels are too hard to judge the rest) |
| First bump | `firstBump.atMs` and `firstBump.movesBefore` on the first rescued level | (watch) |

A try ends `solved`, `lost` (out of hearts), or `abandoned` when the player
restarts or opens another level; a try still open when results are copied has
no `outcome`. Each try also has `moves`, `bumps`, `undos`, `previews` and its
start and end times.

Downgrade means Falling Arrows becomes one skin of the shared pipeline and
leaves the shortlist.
