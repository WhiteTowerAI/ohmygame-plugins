import { isSolved, keyOf, moves } from "./rules.js";

// The whole reachable graph of a level, as the Python experiment analysed it:
// whether it can be solved, the shortest solution, how much of the graph is a
// dead end, and whether the shortest solutions need the overflow.

export function analyse(start, capacity, pipes, rule = "O1", { cap = 200_000 } = {}) {
  const ids = new Map([[keyOf(start), 0]]);
  const states = [start];
  const edges = [];
  for (let u = 0; u < states.length; u += 1) {
    const list = [];
    for (const move of moves(states[u], capacity, pipes, rule)) {
      const key = keyOf(move.state);
      let v = ids.get(key);
      if (v === undefined) {
        if (states.length >= cap) return { capped: true, states: states.length };
        v = states.length;
        ids.set(key, v);
        states.push(move.state);
      }
      list.push({ to: v, overflow: move.overflow, from: move.from, into: move.to });
    }
    edges.push(list);
  }
  const n = states.length;
  const goal = states.map((state) => isSolved(state, capacity));
  // Distance to a solved state, backwards from every solved one.
  const reverse = Array.from({ length: n }, () => []);
  edges.forEach((list, u) => list.forEach(({ to }) => reverse[to].push(u)));
  const distance = new Array(n).fill(Infinity);
  const queue = [];
  goal.forEach((solved, i) => {
    if (solved) {
      distance[i] = 0;
      queue.push(i);
    }
  });
  for (let head = 0; head < queue.length; head += 1) {
    const v = queue[head];
    for (const u of reverse[v]) {
      if (distance[u] === Infinity) {
        distance[u] = distance[v] + 1;
        queue.push(u);
      }
    }
  }
  const open = [...goal.keys()].filter((i) => !goal[i]);
  const dead = open.filter((i) => distance[i] === Infinity).length;
  const result = { capped: false, states: n, solvable: distance[0] < Infinity, deadRatio: dead / Math.max(1, open.length) };
  if (!result.solvable) return result;
  result.optimal = distance[0];
  // Does every shortest solution use an overflow? Follow only edges that keep on a shortest path.
  const withoutOverflow = new Set([0]);
  const frontier = [0];
  for (let head = 0; head < frontier.length; head += 1) {
    const u = frontier[head];
    for (const edge of edges[u]) {
      if (edge.overflow || distance[edge.to] !== distance[u] - 1 || withoutOverflow.has(edge.to)) continue;
      withoutOverflow.add(edge.to);
      frontier.push(edge.to);
    }
  }
  result.needsOverflow = ![...withoutOverflow].some((i) => goal[i]);
  result.hint = (state) => {
    const u = ids.get(keyOf(state));
    if (u === undefined || distance[u] === Infinity || distance[u] === 0) return undefined;
    const edge = edges[u].find(({ to }) => distance[to] === distance[u] - 1);
    return edge && { from: edge.from, to: edge.into };
  };
  result.distance = (state) => {
    const u = ids.get(keyOf(state));
    return u === undefined ? undefined : distance[u];
  };
  return result;
}
