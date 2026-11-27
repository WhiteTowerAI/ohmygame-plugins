# Seed Lab

Runs thousands of seeds through a game's level generator and solver, and says
how many levels can be solved, how hard they are, and which seeds to look at.
For games whose levels come from a seed: puzzles, sorting and exit games,
roguelike maps, rule-driven board games.

The AI changes a generator and says "the levels all work". Seed Lab makes
that a number: the instructions tell it to run `seedlab_run` after changing a
generator and to report the solvable rate and the seeds it lists.

## The simulation module

The game keeps its generator and solver in one module without the page,
`sim/index.ts` by default:

```ts
export function generate(seed: number, params?: Params): Level;
export function evaluate(level: Level, params?: Params): { solvable: boolean; metrics?: Record<string, number> };
```

The `seed-lab` Skill teaches the agent the convention and how to split the
module out of a game. TypeScript works as projects write it, including `enum`,
extensionless imports, and `.js` imports of `.ts` files. Imports must stay
inside the project; packages come from its `node_modules`. `tsconfig.json`
`paths` aren't read.

## What it does

- **`seedlab_run`** (agent tool) and **Run seeds** (panel) take the module,
  the first seed and how many (up to 100,000), `params` for both functions,
  the metric to bucket by, and a time limit per seed.
- The module is bundled once. Seeds are then run over a pool of threads
  (cores − 1, up to 16), one at a time each. A seed that throws, returns the
  wrong shape, or passes the time limit is reported by seed; a stuck thread is
  replaced, and the run goes on. Results come back in seed order, so the same
  seeds give the same results.
- **What it reports:**
  - the solvable rate, over the seeds the module answered for;
  - each metric's spread over the solvable seeds;
  - difficulty buckets, with the first seeds in each;
  - unsolvable, failing and timed-out seeds;
  - seeds far outside the rest (Tukey's far-out fences, three interquartile
    ranges past the quartiles).

  The agent gets this as text. The panel shows it with a histogram per metric
  and a button that asks the AI to look at the seeds.
- **It only reads the project.** Each run's summary and every seed's result
  (JSON Lines) go to the plugin's data folder; the last ten runs per project
  are kept.

## How the bundling works, and why

esbuild's Node API runs its WebAssembly build by starting a `node` process,
and a desktop user's machine may not have `node` on the PATH: the app runs as
Electron. Node's own TypeScript support can't run `enum` or extensionless
imports, which most games use. So Seed Lab carries esbuild's **browser** build
(`esbuild-wasm` 0.28.2: about 14 MB unpacked, MIT) and runs it in-process in a
worker thread, with a small plugin that reads the project's files through
`fs`. The browser build reads `self`; that is defined in the worker only, not
in the extension host other plugins share. Bundling the fixture takes about
0.3 s.

## Not built yet

The proposal (P4-05 in the research) splits the plugin into three steps;
this is the first, plus the panel:

- **Parity check** (next): run sample seeds through the real game window
  (`setSeed`, then `snapshot().levelHash`) and flag seeds where the page and the
  module disagree. Until then, Seed Lab checks the module, not the game; the
  Skill says to say so.
- **Level curve export**: pick seeds from each bucket into a file the game reads.
- **Clicking a seed to see it**: a screenshot through the game window.
- **Running under Electron**: tested under Node 22 only. Worker threads and
  WebAssembly are both standard there, but this hasn't been run in the app.

## Validation

`docs/research/2026-11-plugin-and-game-ideas/prototypes/SEED-LAB-VALIDATION.md`
has the record: sample runs on the two game prototypes, and the comparison
with an agent writing its own statistics script. That comparison decides
whether this stays a plugin or becomes a Skill; it hasn't been run.

## Tests

`test/seed-lab/` (Vitest):
- `stats.test.ts`: quantiles, bins, buckets, outliers, the agent's report.
- `run.test.ts`: bundling the fixture (an arrow-exit generator using `enum`
  and extensionless imports) and its errors; the same results on one or three
  threads; a stuck seed and a throwing seed; stopping; a module without the
  exports; the tool, the commands and what's kept; the built `dist/` with its
  own esbuild and its size.
- `panel.test.ts`: the page's helpers, and the page against a stand-in for the
  app's bridge.

```sh
npm run build:seed-lab
npx vitest run test/seed-lab
```
