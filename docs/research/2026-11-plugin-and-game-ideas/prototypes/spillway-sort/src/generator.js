import { analyse } from "./solver.js";

// Seeded levels. The experiment's finding decides what counts as a level: with
// pipes placed at random the overflow is mostly optional, so the main levels
// are "rescued" deals, which can't be solved without it.

/** A small seeded generator (mulberry32 over a string hash), the same on every device. */
export function random(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const char of String(seed)) {
    h = Math.imul(h ^ char.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, next) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** A deal of `colours` colours, `capacity` layers each, and `empties` empty bottles, none already done. */
export function deal(colours, empties, capacity, next) {
  const layers = [];
  for (let colour = 0; colour < colours; colour += 1) for (let i = 0; i < capacity; i += 1) layers.push(String.fromCharCode(97 + colour));
  for (;;) {
    shuffle(layers, next);
    const bottles = [];
    for (let i = 0; i < colours; i += 1) bottles.push(layers.slice(i * capacity, (i + 1) * capacity).join(""));
    if (bottles.some((bottle) => [...bottle].every((layer) => layer === bottle[0]))) continue;
    return shuffle([...bottles, ...new Array(empties).fill("")], next);
  }
}

/** `count` pipes between neighbouring bottles in a row, at most one out of each bottle, no two-bottle loop. */
export function pipesFor(bottles, count, next) {
  const pairs = shuffle([...Array(bottles - 1).keys()], next);
  const pipes = {};
  for (const i of pairs.slice(0, count)) {
    let [from, to] = next() < 0.5 ? [i, i + 1] : [i + 1, i];
    if (pipes[from] !== undefined) {
      [from, to] = [to, from];
      if (pipes[from] !== undefined) continue;
    }
    pipes[from] = to;
  }
  return pipes;
}

export const TIERS = {
  // A classic level the overflow can't spoil: to learn pouring.
  tutorial: { colours: 4, empties: 2, pipes: 2 },
  // Six colours and one empty bottle: tight enough that pipes matter.
  rescued: { colours: 6, empties: 1, pipes: 2 },
  // Eight colours, one empty bottle, three pipes: longer and deeper.
  deep: { colours: 8, empties: 1, pipes: 3 },
};

/**
 * The first level from `seed` that fits `kind`:
 * - "classic": solvable without overflow (tutorials, and the control version);
 * - "rescued": unsolvable without overflow, solvable with it.
 * Returns the deal, pipes, the tries it took and the solver's numbers.
 */
export function level(seed, { tier = "rescued", kind = "rescued", capacity = 4, maxTries = 400 } = {}) {
  const shape = TIERS[tier];
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const next = random(`${seed}#${attempt}`);
    const bottles = deal(shape.colours, shape.empties, capacity, next);
    const pipes = pipesFor(bottles.length, shape.pipes, next);
    const classic = analyse(bottles, capacity, pipes, "classic");
    if (classic.capped) continue;
    if (kind === "classic") {
      if (!classic.solvable) continue;
      return { seed: String(seed), tier, kind, capacity, bottles, pipes, attempt, optimal: classic.optimal, deadRatio: classic.deadRatio };
    }
    if (classic.solvable) continue;
    const overflow = analyse(bottles, capacity, pipes, "O1");
    if (overflow.capped || !overflow.solvable) continue;
    return { seed: String(seed), tier, kind, capacity, bottles, pipes, attempt, optimal: overflow.optimal, deadRatio: overflow.deadRatio };
  }
  return undefined;
}
