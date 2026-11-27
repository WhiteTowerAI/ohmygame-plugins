---
name: seed-lab
description: Split a seeded game's level generator and solver into a simulation module (sim/index.ts) that Seed Lab can run over thousands of seeds, then use seedlab_run to check solvability and difficulty instead of trusting a few hand-tried seeds. Use for puzzle, sorting, exit, match, roguelike-map and rule-driven board games whose levels come from a seed.
---

# Seed Lab

Seed Lab runs a range of seeds through the project's **simulation module** on
several threads and reports how many levels can be solved, how each metric is
spread, difficulty buckets with example seeds, and the seeds worth a look.
The `seedlab_run` tool runs it; the Seed lab panel shows the same run.

## The simulation module

One module, `sim/index.ts` by default (any path inside the project works; pass
it as `entry`), with no DOM, canvas, timers or network:

```ts
// sim/index.ts
export function generate(seed: number, params?: Params): Level { … }
export function evaluate(level: Level, params?: Params): { solvable: boolean; metrics?: Record<string, number> } { … }
```

- `generate` is the game's real level generator: same seed, same level.
  Seeds are whole numbers from `from` to `from + count - 1`.
- `evaluate` answers whether the level can be solved, and with whatever
  numbers describe it: `moves` (shortest solution), `deadEnds`, `branching`,
  `randomWin` (how often random play wins). A metric named `difficulty` is
  used for buckets unless the run names another. Booleans count as 0 or 1;
  anything else that isn't a finite number is reported as an error.
- `params` comes from the run (`params` in `seedlab_run`): board size, tier,
  a rule switch. Use it to compare variants on the same seeds.
- Either may be `async`. A seed that throws, returns nothing, or takes longer
  than `timeoutMs` (5 s by default) is reported by seed; it doesn't stop the
  run.
- TypeScript is fine, including `enum`, extensionless imports and `.js`
  imports of `.ts` files. Imports must stay inside the project; packages come
  from the project's `node_modules`. `tsconfig.json` `paths` aliases aren't
  read: use relative imports in `sim/`.

### Splitting it out of the game

1. Find where the game makes a level from a seed and where it decides a move
   is legal or the level is won. Move that logic, unchanged, into `sim/`:
   `sim/rules.ts` (state and moves), `sim/generator.ts`, `sim/solver.ts`.
2. Make the game import `sim/` for its rules and levels, so the page and
   Seed Lab run the same code. Rendering, input and sound stay in the game.
3. Write the solver if there isn't one. For small puzzles a breadth-first
   search over states with a visited set gives the shortest solution and the
   share of dead-end states. For big ones use a depth-first search with a
   node cap, and treat "cap reached" as its own metric, not as unsolvable.
4. Export `generate` and `evaluate` from `sim/index.ts`.
5. Add a unit test that `generate(seed)` is the same twice for a few seeds.

## Running it

After changing the generator, the solver or the rules:

1. Run `seedlab_run` with a few thousand seeds (`count: 2000`), or 10,000
   before picking a level set.
2. Read the solvable rate first. If the game promises every level can be
   solved, any unsolvable seed is a bug in the generator or the solver: look
   at the listed seeds, fix, run again.
3. Errors and timeouts are bugs too, listed by seed.
4. Check the spread: a median of 2 moves, or a p90 equal to the max, says
   the generator isn't making the range the game needs.
5. Seeds far outside the rest (three interquartile ranges past the quartiles)
   are often degenerate levels: solved in one move, or far longer than any
   other. Look at a few.
6. To pick a level set, take seeds from each difficulty bucket, easy to hard.

Say what the run found, with numbers: "9,712 of 10,000 seeds solvable;
the 288 unsolvable ones all have a full column…", not "the levels work".
Seed Lab only checks the simulation module. If the game page doesn't use the
same module, its levels can differ; say so rather than assume they match.
