# Seed Lab: validation record

What has been checked about P4-05 (`plugins/seed-lab`), and what decides
whether it stays a plugin or becomes a Skill. Written 2026-11-27, when the
first build was finished.

## 1. Sample runs on the two prototypes

Both prototypes got a `sim/index.js` adapter of about 30 lines that follows
the convention, with no other change to either game. Runs of seeds 0–999 on
the prototypes folder, from the built plugin (`dist/`):

| Run | Time (3 threads) | Solvable | What it found |
|---|---|---|---|
| `falling-arrows/sim/index.js`, `{ tier: "main" }` | 17.3 s | 100% | 28% need gravity; a random tapper wins 92% (mean); dead-end share median 0, p90 0.08; **a top-down rule clears 100%** |
| `spillway-sort/sim/index.js`, `{ tier: "rescued" }` | 0.8 s | 31.7% | Of the solvable deals, 59% need the overflow; shortest solutions 11–24 moves, median 19; dead-end share median 0.51; 5 deals with far more states than the rest |

The Falling Arrows numbers match the day-0 script's (`tools/day0.mjs`): 29.3%
need gravity, 92.4% random-tapper wins.

What using it showed:

- **It ran code it wasn't written for.** Both adapters import the prototypes'
  own modules across folders; nothing in either game changed.
- **"Unsolvable" depends on what `generate` means.** Spillway's raw deals are
  filtered by the level builder, so 68% unsolvable is by design, not a bug. The
  Skill says `generate` must be the game's real level generator, filtering
  included. A game that generates and then filters has to put the filter in
  `generate`.
- **Yes/no metrics are common** (`needsGravity`, `rescued`,
  `topDownClears`). The panel now shows them as a share instead of a
  two-bar histogram.

## 2. The case against a plugin, from this project itself

The research already counted one counter-sample: the overflow experiment was
about 200 lines of Python an agent wrote without any plugin. This session
added two more:

- **The day-0 tables for Falling Arrows were a hand-written script**
  (`tools/day0.mjs`, 58 lines with both tables). It gave the same
  numbers Seed Lab gives.
- **Neither caught the real problem.** An independent code reviewer, not a
  statistic, noticed that one habit ("take the highest free arrow") cleared
  every shipped level. Seed Lab shows it only once someone thinks to add a
  `topDownClears` metric. The day-0 script was the same.

So the evidence so far supports what the proposal feared: batch statistics
alone aren't enough reason for a plugin. What an agent's own script doesn't
give is the plugin's three increments: the parity check, the dashboard, and
the level curve export. Only the dashboard is built.

## 3. The comparison that decides (not run)

As planned in the proposal:
- **Two groups.** The baseline gets an agent with the existing Skills and
  Game Tests. The plugin group gets the same agent with Seed Lab.
- **Tasks.** Six "change the generator" tasks, each with three planted
  problems: about 3% unsolvable seeds, a few degenerate seeds, and one rule
  where the module and the game disagree.
- **Runs.** Two per group per task, 24 in all.

**Downgrade to a Skill** if both:
- the plugin group finds less than 25 points more of the planted problems;
- its median time to a difficulty curve isn't under half the baseline's.

Also downgrade if fewer than half of the agents manage to split out a `sim/`
module without major restructuring.

Suggested addition from this session: plant a **dominant strategy** in one
task, a simple rule that solves almost every level, and record which group
finds it. It is the kind of problem that matters most and that a solvable
rate never shows.

**Not run, because:**
- it needs 24 agent sessions in the app;
- the planted problem the plugin is best placed to catch (module and game
  disagree) needs the parity check, which isn't built.

Run it after the parity check.
