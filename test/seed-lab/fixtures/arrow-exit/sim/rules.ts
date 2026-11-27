export enum Dir {
  Up,
  Down,
  Left,
  Right,
}

export interface Board {
  size: number;
  cells: (Dir | null)[];
}

const STEP: Record<Dir, [number, number]> = { [Dir.Up]: [0, -1], [Dir.Down]: [0, 1], [Dir.Left]: [-1, 0], [Dir.Right]: [1, 0] };

/** An arrow can leave when nothing is between it and the edge it points at. */
export function canLeave(board: Board, index: number): boolean {
  const dir = board.cells[index];
  if (dir === null) return false;
  const [dx, dy] = STEP[dir];
  let x = index % board.size;
  let y = Math.floor(index / board.size);
  for (;;) {
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= board.size || y >= board.size) return true;
    if (board.cells[y * board.size + x] !== null) return false;
  }
}
