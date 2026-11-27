// Builds levels.json: the prototype's 30 levels and the control version's 30.
//   node tools/build-levels.mjs
// Main: 10 tutorials (classic-solvable, 4 colours, 2 empty bottles; the first
// 5 without pipes, to learn pouring first; the rest keep their pipes and are
// checked and measured under the overflow rule they're played with), then 20
// rescued levels (unsolvable without the overflow): 12 with 6 colours, 8 with 8.
// Control: for each main level, the classic-solvable deal of the same size
// closest to it in shortest solution and share of dead ends, played without
// pipes, so the comparison isn't between easy and hard deals.
import { writeFile } from "node:fs/promises";
import { level } from "../src/generator.js";
import { analyse } from "../src/solver.js";

const plan = [
  ...Array.from({ length: 10 }, (_, i) => ({ seed: `tutorial-${i}`, tier: "tutorial", kind: "classic", pipes: i >= 5 })),
  ...Array.from({ length: 12 }, (_, i) => ({ seed: `rescued-${i}`, tier: "rescued", kind: "rescued", pipes: true })),
  ...Array.from({ length: 8 }, (_, i) => ({ seed: `deep-${i}`, tier: "deep", kind: "rescued", pipes: true })),
];

function mainLevel(entry) {
  for (let k = 0; k < 50; k += 1) {
    const found = level(k ? `${entry.seed}~${k}` : entry.seed, { tier: entry.tier, kind: entry.kind, maxTries: 2000 });
    if (!found) continue;
    if (!entry.pipes) return { ...found, pipes: {}, kind: "tutorial" };
    if (entry.kind === "rescued") return found;
    // A tutorial that keeps its pipes is played with them: check it and measure it that way.
    const played = analyse(found.bottles, found.capacity, found.pipes, "O1", { cap: 1_000_000 });
    if (played.capped || !played.solvable) continue;
    return { ...found, kind: "tutorial", optimal: played.optimal, deadRatio: played.deadRatio };
  }
  throw new Error(`No level for ${entry.seed}`);
}

const CONTROL_CANDIDATES = 160;
function controlLevel(main, index) {
  let best;
  // Classic deals tend to have fewer dead ends, and an easier control would
  // flatter it on the "next level" rate, so falling short on dead ends costs
  // more than overshooting.
  for (let k = 0; k < CONTROL_CANDIDATES; k += 1) {
    const found = level(`control-${index}-${k}`, { tier: main.tier, kind: "classic", maxTries: 2000 });
    if (!found) continue;
    const short = Math.max(0, main.deadRatio - found.deadRatio);
    const distance = Math.abs(found.optimal - main.optimal) + 40 * short + 10 * Math.max(0, found.deadRatio - main.deadRatio);
    if (!best || distance < best.distance) best = { ...found, distance };
  }
  const { distance, ...chosen } = best;
  return { ...chosen, kind: "control", pipes: {} };
}

const main = plan.map(mainLevel);
const control = main.map(controlLevel);
await writeFile(new URL("../levels.json", import.meta.url), `${JSON.stringify({ capacity: 4, main, control })}\n`);
const mean = (items, field) => (items.reduce((sum, item) => sum + item[field], 0) / items.length).toFixed(2);
for (const [name, from, to] of [["tutorials", 0, 10], ["levels 11-22", 10, 22], ["levels 23-30", 22, 30]])
  console.log(`${name}: main optimal ${mean(main.slice(from, to), "optimal")} dead ${mean(main.slice(from, to), "deadRatio")} | control optimal ${mean(control.slice(from, to), "optimal")} dead ${mean(control.slice(from, to), "deadRatio")}`);
