// The seed-lab convention over this prototype: generate(seed, params) deals
// bottles and pipes the way the level builder does, and evaluate solves them
// with and without the overflow. Run Seed Lab with the prototypes folder as
// the project and `spillway-sort/sim/index.js` as the entry.
// params: { tier: "tutorial" | "rescued" | "deep" }.
import { deal, pipesFor, random, TIERS } from "../src/generator.js";
import { analyse } from "../src/solver.js";

const CAPACITY = 4;

export function generate(seed, { tier = "rescued" } = {}) {
  const { colours, empties, pipes } = TIERS[tier];
  const next = random(`sim-${tier}-${seed}`);
  const bottles = deal(colours, empties, CAPACITY, next);
  return { bottles, pipes: pipesFor(bottles.length, pipes, next) };
}

/** Solvable with the overflow; `rescued` when only the overflow makes it so. */
export function evaluate({ bottles, pipes }) {
  const overflow = analyse(bottles, CAPACITY, pipes, "O1");
  const classic = analyse(bottles, CAPACITY, pipes, "classic");
  return {
    solvable: overflow.solvable,
    metrics: {
      ...(overflow.solvable ? { moves: overflow.optimal, needsOverflow: overflow.needsOverflow } : {}),
      deadEnds: overflow.deadRatio,
      states: overflow.states,
      classicSolvable: classic.solvable,
      rescued: overflow.solvable && !classic.solvable,
    },
  };
}
