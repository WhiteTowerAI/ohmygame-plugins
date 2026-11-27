import { isSolved, moves } from "./rules.js";

// Every move removes one arrow, so every solution has as many moves as the
// board has arrows; difficulty is about order. Without gravity, taking an arrow
// only ever opens paths, so taking any free arrow, again and again, decides
// whether a board can be solved. With gravity, taking one can block another,
// so the solver searches.

/** Without gravity: solvable exactly when taking free arrows in any order empties the board. */
export function solvableWithoutGravity(board, width, height) {
  let current = board;
  for (;;) {
    if (isSolved(current)) return true;
    const next = moves(current, width, height, false)[0];
    if (!next) return false;
    current = next.board;
  }
}

/** A seeded generator for the random tapper. */
function tapper(seed) {
  let state = seed >>> 0 || 1;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** The chance that tapping free arrows at random solves the board, with gravity. */
export function randomWin(board, width, height, { rollouts = 200, seed = 1 } = {}) {
  const next = tapper(seed);
  let wins = 0;
  for (let i = 0; i < rollouts; i += 1) {
    let current = board;
    while (!isSolved(current)) {
      const options = moves(current, width, height, true);
      if (!options.length) break;
      current = options[Math.floor(next() * options.length)].board;
    }
    if (isSolved(current)) wins += 1;
  }
  return wins / rollouts;
}

/**
 * One solution with gravity, searching depth first and remembering boards
 * that can't be solved; for boards too big to map whole. Undefined when there
 * is none, or when `cap` boards were tried first.
 */
export function findSolution(board, width, height, { cap = 200_000 } = {}) {
  const failed = new Set();
  const path = [];
  let tried = 0;
  const search = (current) => {
    if (isSolved(current)) return true;
    if (failed.has(current) || (tried += 1) > cap) return false;
    for (const move of moves(current, width, height, true)) {
      path.push({ x: move.x, y: move.y });
      if (search(move.board)) return true;
      path.pop();
    }
    failed.add(current);
    return false;
  };
  return search(board) ? path : tried > cap ? null : undefined;
}

/**
 * The reachable graph with gravity, up to `cap` boards: whether it can be
 * solved, the share of reachable boards that can't be (dead ends), and the
 * chance that tapping free arrows at random solves it.
 */
export function analyse(board, width, height, { cap = 60_000, rollouts = 200, seed = 1 } = {}) {
  const solvable = new Map();
  const edges = new Map();
  let capped = false;
  // Depth-first, remembering which boards can be solved.
  const visit = (start) => {
    const stack = [[start, 0]];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [current] = frame;
      if (frame[1] === 0) {
        if (solvable.has(current)) {
          stack.pop();
          continue;
        }
        if (isSolved(current)) {
          solvable.set(current, true);
          stack.pop();
          continue;
        }
        if (solvable.size >= cap) {
          capped = true;
          solvable.set(current, false);
          stack.pop();
          continue;
        }
        edges.set(current, moves(current, width, height, true).map((move) => move.board));
        frame[1] = 1;
        for (const child of edges.get(current)) if (!solvable.has(child)) stack.push([child, 0]);
        continue;
      }
      stack.pop();
      solvable.set(current, edges.get(current).some((child) => solvable.get(child)));
    }
  };
  visit(board);
  if (capped) return { capped: true, boards: solvable.size };
  const open = [...solvable.keys()].filter((key) => !isSolved(key));
  const dead = open.filter((key) => !solvable.get(key)).length;
  const wins = randomWin(board, width, height, { rollouts, seed });
  return {
    capped: false,
    boards: solvable.size,
    solvable: Boolean(solvable.get(board)),
    deadRatio: dead / Math.max(1, open.length),
    randomWin: wins,
    /** A move that keeps the board solvable, for hints and tests. */
    hint: (current) => {
      const list = edges.get(current) ?? [];
      const index = list.findIndex((child) => solvable.get(child));
      return index < 0 ? undefined : moves(current, width, height, true)[index];
    },
  };
}
