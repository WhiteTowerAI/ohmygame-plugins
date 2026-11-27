// Spillway Sort's rules: water sort with overflow pipes (rule O1 of the
// solver experiment, idea-lab/experiments/overflow-sort/sortsolver.py).
//
// A level is bottles of capacity C, each a string of colours from bottom to
// top, one character per layer, and pipes: some bottles have one outgoing pipe
// to a neighbour. Pour the top run of one bottle into another:
//
// - Into a bottle without a pipe: as in water sort. The target is empty or its
//   top has the same colour, and it takes as much as fits.
// - Into a bottle with a pipe: the target is empty or its top matches, and it
//   may already be full. The whole top run goes in. What rises above the
//   capacity flows through the pipe and lands on the next bottle whatever its
//   top colour; if that one is over too, on through its own pipe. If the water
//   reaches an over-full bottle with no pipe, the pour isn't allowed.
//
// Solved: every bottle empty or full of one colour. A full bottle of one
// colour is done and can't be poured from.
//
// States are arrays of strings; nothing here changes its arguments.

export function topRun(bottle) {
  const colour = bottle[bottle.length - 1];
  let run = 1;
  while (run < bottle.length && bottle[bottle.length - 1 - run] === colour) run += 1;
  return { colour, run };
}

export function isSolved(state, capacity) {
  return state.every((bottle) => !bottle || (bottle.length === capacity && [...bottle].every((layer) => layer === bottle[0])));
}

const done = (bottle, capacity) => bottle.length === capacity && [...bottle].every((layer) => layer === bottle[0]);

/**
 * Pours from bottle `from` into bottle `to`. Returns the new state and the
 * path the water took (`to`, then each bottle it overflowed into), or null when
 * the pour isn't allowed. A pour that would leave every bottle as it was (into
 * a full bottle whose pipe runs straight back to the source) isn't allowed: it
 * would show water flowing and count a move, but do nothing. `rule` is "O1" (overflow pipes) or "classic" (pipes
 * ignored), the control version without overflow.
 */
export function pour(state, from, to, capacity, pipes, rule = "O1") {
  if (from === to) return null;
  const source = state[from];
  if (!source || done(source, capacity)) return null;
  const { colour, run } = topRun(source);
  const target = state[to];
  if (target && target[target.length - 1] !== colour) return null;
  const next = [...state];
  const hasPipe = rule === "O1" && pipes[to] !== undefined;
  if (!hasPipe) {
    if (target.length >= capacity) return null;
    const amount = Math.min(run, capacity - target.length);
    next[from] = source.slice(0, source.length - amount);
    next[to] = target + colour.repeat(amount);
    return { state: next, path: [to], amount, overflow: false };
  }
  next[from] = source.slice(0, source.length - run);
  next[to] = target + colour.repeat(run);
  const path = [to];
  let current = to;
  while (next[current].length > capacity) {
    const excess = next[current].length - capacity;
    const onward = pipes[current];
    if (onward === undefined) return null;
    next[current] = next[current].slice(0, capacity);
    next[onward] += colour.repeat(excess);
    path.push(onward);
    current = onward;
  }
  if (next.every((bottle, index) => bottle === state[index])) return null;
  return { state: next, path, amount: run, overflow: path.length > 1 };
}

/** Every allowed pour from a state: `{ from, to, state, overflow }`. */
export function moves(state, capacity, pipes, rule = "O1") {
  const result = [];
  for (let from = 0; from < state.length; from += 1) {
    for (let to = 0; to < state.length; to += 1) {
      const poured = pour(state, from, to, capacity, pipes, rule);
      if (poured) result.push({ from, to, state: poured.state, overflow: poured.overflow });
    }
  }
  return result;
}

/** A state as one string, for sets and maps. Bottle order matters: pipes are fixed to positions. */
export const keyOf = (state) => state.join("|");
