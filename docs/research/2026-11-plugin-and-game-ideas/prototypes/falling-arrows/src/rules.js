// Falling Arrows' rules: an arrow puzzle where the board collapses.
//
// A board is `width` columns by `height` rows, row 0 at the top, stored as a
// string of `width * height` cells: "U", "D", "L", "R" for an arrow pointing
// up, down, left or right, "." for nothing.
//
// Tap an arrow and it slides out the way it points. If every cell between it
// and the edge is empty, it leaves the board; otherwise it hits an arrow,
// bounces back and costs a heart, and the board doesn't change.
//
// With gravity (the game), when an arrow leaves, everything above it in its
// column moves down one cell, empty cells included, and a top cell is left
// empty. Without gravity (the control version), its cell just stays empty.
//
// Solved: the board is empty.

const STEP = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

/** Whether the arrow at (x, y) can slide off the board. */
export function canLeave(board, width, height, x, y) {
  const arrow = board[y * width + x];
  const step = STEP[arrow];
  if (!step) return false;
  let cx = x + step[0];
  let cy = y + step[1];
  while (cx >= 0 && cx < width && cy >= 0 && cy < height) {
    if (board[cy * width + cx] !== ".") return false;
    cx += step[0];
    cy += step[1];
  }
  return true;
}

/** The board after the arrow at (x, y) leaves, or null when it would hit something. */
export function take(board, width, height, x, y, gravity = true) {
  if (!canLeave(board, width, height, x, y)) return null;
  const cells = [...board];
  if (gravity) {
    for (let row = y; row > 0; row -= 1) cells[row * width + x] = cells[(row - 1) * width + x];
    cells[x] = ".";
  } else cells[y * width + x] = ".";
  return cells.join("");
}

/** Every arrow that can leave now, with the board after it does. */
export function moves(board, width, height, gravity = true) {
  const result = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const next = take(board, width, height, x, y, gravity);
      if (next !== null) result.push({ x, y, board: next });
    }
  }
  return result;
}

export const isSolved = (board) => !/[UDLR]/.test(board);
export const arrowsLeft = (board) => board.replace(/\./g, "").length;
