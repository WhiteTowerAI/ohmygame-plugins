import { random } from "../../spillway-sort/src/generator.js";
import { canLeave } from "./rules.js";
import { analyse, findSolution, randomWin, solvableWithoutGravity } from "./solver.js";

// Seeded boards, on the pipeline Spillway Sort uses: the same seeded
// generator, a solver, and levels chosen by what the solver says.

// Built backwards, boards stop at about 40–50% full: later arrows have no way
// out. Real arrow puzzles are denser; a denser generator is week-two work.
export const TIERS = {
  tutorial: { width: 4, height: 5, fill: 0.5 },
  main: { width: 5, height: 7, fill: 0.45 },
  deep: { width: 6, height: 8, fill: 0.45 },
};

/** A board with `fill` of its cells holding an arrow in a random direction. Almost never solvable. */
export function board(width, height, fill, next) {
  let cells = "";
  for (let i = 0; i < width * height; i += 1) cells += next() < fill ? "UDLR"[Math.floor(next() * 4)] : ".";
  return cells;
}

/**
 * A board built backwards, so it can be solved: start empty and undo moves.
 * Each step puts an arrow where it could have left from, so taking the arrows
 * in the reverse order clears the board. With gravity, undoing a move also
 * lifts the column above the arrow back up one cell, so the top cell of that
 * column must be empty. Stops at `arrows`, or when nothing fits.
 */
export function construct(width, height, arrows, next, gravity = true) {
  let cells = ".".repeat(width * height);
  for (let placed = 0; placed < arrows; placed += 1) {
    const options = [];
    for (let x = 0; x < width; x += 1) {
      if (gravity && cells[x] !== ".") continue;
      for (let y = 0; y < height; y += 1) {
        if (!gravity && cells[y * width + x] !== ".") continue;
        // The board before the move: the column above y one cell higher, and the arrow at y.
        const before = [...cells];
        if (gravity) for (let row = 0; row < y; row += 1) before[row * width + x] = cells[(row + 1) * width + x];
        for (const arrow of "UDLR") {
          before[y * width + x] = arrow;
          const board = before.join("");
          if (canLeave(board, width, height, x, y)) options.push(board);
        }
      }
    }
    if (!options.length) break;
    cells = options[Math.floor(next() * options.length)];
  }
  return cells;
}

/**
 * A board from `seed` that fits `kind`, built backwards:
 * - "plain": solvable without gravity and with it (tutorials);
 * - "control": solvable without gravity (the control version, played without it);
 * - "rescued": solvable with gravity, unsolvable without it.
 * Boards built this way are easy (a random tapper solves most), so it builds
 * `candidates` that fit and keeps the one a random tapper solves least often.
 * `arrows` asks for exactly that many, to match a control board to a level.
 */
export function level(seed, { tier = "main", kind = "rescued", candidates = 8, maxTries = 400, arrows: exactly } = {}) {
  const { width, height, fill } = TIERS[tier];
  const target = exactly ?? Math.round(width * height * fill);
  let best;
  let found = 0;
  for (let attempt = 0; attempt < maxTries && found < candidates; attempt += 1) {
    const next = random(`${seed}#${attempt}`);
    const cells = construct(width, height, target, next, kind !== "control");
    const arrows = cells.replace(/\./g, "").length;
    if (exactly ? arrows !== exactly : arrows < target * 0.85) continue;
    const plain = solvableWithoutGravity(cells, width, height);
    if (kind === "control" ? !plain : (kind === "plain") !== plain) continue;
    if (kind !== "control" && !findSolution(cells, width, height)) continue;
    found += 1;
    const win = kind === "control" ? 1 : randomWin(cells, width, height, { rollouts: 120, seed: attempt + 1 });
    if (!best || win < best.randomWin) best = { seed: String(seed), tier, kind, width, height, board: cells, attempt, arrows, randomWin: win };
    if (kind === "control") break;
  }
  if (!best || kind === "control" || width * height > 40) return best;
  // Small boards can be mapped whole: add how much of the map is a dead end.
  const map = analyse(best.board, width, height);
  return map.capped ? best : { ...best, deadRatio: map.deadRatio };
}
