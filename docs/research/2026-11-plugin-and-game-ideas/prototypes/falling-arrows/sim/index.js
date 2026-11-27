// The seed-lab convention over this prototype: generate(seed, params) makes
// the board the level builder starts from, and evaluate says whether it can
// be solved and what the day-0 tables measure. Run Seed Lab with the
// prototypes folder as the project and `falling-arrows/sim/index.js` as the
// entry. params: { tier: "tutorial" | "main" | "deep" }.
import { random } from "../../spillway-sort/src/generator.js";
import { construct, TIERS } from "../src/generator.js";
import { analyse, findSolution, greedyWins, randomWin, solvableWithoutGravity, TOP_DOWN } from "../src/solver.js";

export function generate(seed, { tier = "main" } = {}) {
  const { width, height, fill } = TIERS[tier];
  return { width, height, board: construct(width, height, Math.round(width * height * fill), random(`sim-${tier}-${seed}`), true) };
}

export function evaluate({ width, height, board }) {
  const arrows = board.replace(/\./g, "").length;
  const metrics = {
    arrows,
    needsGravity: !solvableWithoutGravity(board, width, height),
    randomWin: randomWin(board, width, height, { rollouts: 60 }),
    topDownClears: greedyWins(board, width, height, TOP_DOWN).length > 0,
  };
  if (width * height <= 40) {
    const map = analyse(board, width, height, { rollouts: 1 });
    if (!map.capped) metrics.deadEnds = map.deadRatio;
  }
  return { solvable: Boolean(findSolution(board, width, height)), metrics };
}
