// How long an act takes to play, hit-stops included, and stepping it so a
// hit-stop never swallows time meant for what comes after it. The stage and
// export share this, so both reach the act's last pose on their last frame.
import { actBounds, actSpan } from "./lib/core/index.js";

/** The seconds an act stands frozen in one pass: the longest stop of each hit time. */
export function actStops(mod) {
  const longest = new Map();
  for (const hit of mod.act?.hits ?? []) if (hit.stop) longest.set(hit.t, Math.max(longest.get(hit.t) ?? 0, hit.stop));
  let total = 0;
  for (const stop of longest.values()) total += stop;
  return total;
}

/** An act's first and last moment in effect time, and how long it plays: from first pose to last, plus its hit-stops. */
export function actLength(mod) {
  const { from, to } = actSpan(mod);
  const end = mod.meta.loop ? mod.meta.duration : to;
  return { from, end, seconds: end - from + actStops(mod) };
}

/** When each of an act's hits lands, in seconds from its first pose as it plays, the hit-stops before it included. */
export function actHitTimes(mod) {
  const { from } = actLength(mod);
  const longest = new Map();
  for (const hit of mod.act?.hits ?? []) longest.set(hit.t, Math.max(longest.get(hit.t) ?? 0, hit.stop ?? 0));
  let stopped = 0;
  return [...longest.keys()]
    .sort((a, b) => a - b)
    .map((t) => {
      const at = t - from + stopped;
      stopped += longest.get(t);
      return at;
    });
}

/** The time between frames for `frames` frames of an act, the last landing on its end unless it loops. */
export function actFrameStep(mod, frames) {
  const { seconds } = actLength(mod);
  return frames > 1 ? seconds / (mod.meta.loop ? frames : frames - 1) : 0;
}

/**
 * `step(dt)` for an act from `createAct`: plays `dt` seconds, split at each
 * hit and where its stop ends, so a step that crosses a hit doesn't run past
 * it and the time after a stop moves the act on. It follows the act's own
 * hit-stop bookkeeping (lib/core/act.js), which doesn't show how much of a
 * stop is left.
 */
export function actStepper(act, mod) {
  const D = mod.meta.duration;
  const loop = !!mod.meta.loop;
  const hits = [...(mod.act?.hits ?? [])].sort((a, b) => a.t - b.t);
  let t = act.t;
  let stop = 0;
  let next = 0;
  let loopN = 0;
  return (dt) => {
    while (dt > 0) {
      if (stop > 0) {
        const piece = Math.min(dt, stop);
        act.update(piece);
        stop -= piece;
        dt -= piece;
        continue;
      }
      // Up to the next hit at most, so time past it waits out its stop as the act does at its own steps.
      const tt0 = loop && t >= D ? t % D : t;
      let piece = dt;
      if (next < hits.length) piece = Math.min(piece, Math.max(1e-9, hits[next].t - tt0));
      if (loop) piece = Math.min(piece, Math.max(1e-9, D - tt0));
      act.update(piece);
      t += piece;
      dt -= piece;
      if (loop && t >= D) {
        const n = Math.floor(t / D);
        if (n !== loopN) {
          loopN = n;
          next = 0;
        }
      }
      const tt = loop && t >= D ? t % D : t;
      for (; next < hits.length && hits[next].t <= tt; next++) if (hits[next].stop) stop = Math.max(stop, hits[next].stop);
    }
  };
}

/** An act's box (actBounds), mirrored left to right when it is flipped. */
export function flippedActBounds(mod, flip) {
  const b = actBounds(mod);
  return flip ? { ...b, x0: -b.x1, x1: -b.x0 } : { ...b };
}

/** Where an effect's origin sits in its own box, mirrored when it is flipped, so it stays inside the box. */
export function flippedOrigin(meta, flip) {
  const [x, y] = meta.origin;
  return [flip ? meta.size[0] - x : x, y];
}
