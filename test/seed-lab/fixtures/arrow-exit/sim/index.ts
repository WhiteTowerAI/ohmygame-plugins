// The seed-lab convention: generate(seed, params) → level, evaluate(level, params) → { solvable, metrics }.
import { rng } from "./rng";
import { canLeave, Dir, type Board } from "./rules";

export interface Params {
  size?: number;
  fill?: number;
  /** For tests: a seed that never finishes, and one that throws. */
  hangSeed?: number;
  throwSeed?: number;
}

export function generate(seed: number, params: Params = {}): Board & { seed: number } {
  if (seed === params.hangSeed) for (;;);
  if (seed === params.throwSeed) throw new RangeError(`seed ${seed} is broken on purpose`);
  const size = params.size ?? 5;
  const next = rng(seed);
  const cells = Array.from({ length: size * size }, () => (next() < (params.fill ?? 0.5) ? ([Dir.Up, Dir.Down, Dir.Left, Dir.Right][Math.floor(next() * 4)] as Dir) : null));
  return { seed, size, cells };
}

/** Without gravity, taking any arrow that can leave never hurts, so taking them greedily decides it. */
export function evaluate(level: Board): { solvable: boolean; metrics: Record<string, number> } {
  const board = { size: level.size, cells: [...level.cells] };
  const arrows = board.cells.filter((cell) => cell !== null).length;
  const freeAtStart = board.cells.filter((_, i) => canLeave(board, i)).length;
  let rounds = 0;
  for (;;) {
    const free = board.cells.map((_, i) => i).filter((i) => canLeave(board, i));
    if (!free.length) break;
    for (const i of free) board.cells[i] = null;
    rounds += 1;
  }
  return { solvable: board.cells.every((cell) => cell === null), metrics: { arrows, freeAtStart, rounds } };
}
