// Checks an effect for the mistakes eyes miss: missing meta, drawing outside
// the canvas, one-shots that don't end clean, loops with a seam, randomness
// that isn't seeded, slow frames. Ported from pixelfx's tools/check.mjs (MIT,
// see lib/LICENSE) to run on a module the page has imported, with its source.
import { shortfall } from "./lib/core/rig.js";
import { createFrame, clearFrame, painterFor, createFx, createAct, poseAt, stockActor, resolveOptions, Painter, BACKDROPS } from "./lib/core/index.js";

const M = 24; // margin around the canvas, to catch pixels drawn outside it
const RESERVED = ["x", "y", "flip", "angle", "light"];

/** The meta an effect is checked with: pixelfx's loader's defaults under the module's own. */
export function checkedMeta(mod) {
  return { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
}

function drawAt(fx, t, frame, opts) {
  const { mod, meta } = fx;
  const p = painterFor(clearFrame(frame));
  p.place(meta.origin[0], meta.origin[1]);
  if (mod.drawBack) mod.drawBack(p, t, opts);
  mod.draw(p, t, opts);
}

// an act: its data makes sense, and the body doesn't teleport when no key asked it to
const POSE_KEYS = new Set(
  "x y crouch lean twist turn yaw hx hy fx fy fz bx by bz ffx ffy fbx fby fzz bzz weapon sa two offWeapon sb armsFront toeF toeB face ghost wl wz pull nocked".split(" "),
);
const hands = (q) => [q.fx ?? 7, q.fy ?? -14, q.bx ?? -8, q.by ?? -14];

function checkAct(fx, errs, notes) {
  const { mod, meta } = fx;
  const a = mod.act;
  const k = a.poses;
  if (!Array.isArray(k) || !k.length) return errs.push("act.poses is empty");
  k.forEach(([t, pose], i) => {
    if (typeof t !== "number") errs.push(`act key ${i}: no time`);
    if (i && t < k[i - 1][0]) errs.push(`act keys out of order at ${t}`);
    for (const n of Object.keys(pose)) if (!POSE_KEYS.has(n)) errs.push(`act key at ${t}: unknown pose field "${n}"`);
  });
  // arms don't stretch: a hand asked to go further than it can falls short of where the effect needs it
  for (const [t, pose] of k) {
    const short = shortfall(pose);
    if (short > 3.5) {
      notes.push(`act: at t = ${t} a hand falls ${short.toFixed(0)} px short of where the pose wants it: step the body in`);
      break;
    }
  }
  const first = k[0][0];
  const last = k[k.length - 1][0];
  const D = meta.duration;
  for (const h of a.hits ?? []) {
    if (!(h.t >= first && h.t <= Math.max(last, D))) errs.push(`act hit at ${h.t} is outside the act`);
    if (h.stop > 0.3) notes.push(`act hit at ${h.t} freezes for ${h.stop} s: past 0.3 s it reads as a stall`);
  }
  if (meta.loop) {
    if (last !== D) errs.push(`a loop's poses end at its duration (${D}), not ${last}`);
    const from = k.findIndex(([t]) => t >= 0);
    if (k[from]?.[0] !== 0) errs.push("a loop's poses need a key at t = 0");
    else {
      const A = poseAt(k, 0);
      const B = poseAt(k, D);
      const seam = Math.max(
        ...hands(A).map((v, i) => Math.abs(v - hands(B)[i])),
        Math.abs((A.crouch ?? 0) - (B.crouch ?? 0)),
        Math.abs((A.x ?? 0) - (B.x ?? 0)),
      );
      if (seam > 2) notes.push(`act's loop has a seam: the body jumps ${seam.toFixed(0)} px from its last pose to its first`);
    }
  } else if (last < D - 1e-3 && last < 0) errs.push("an act's poses end before the effect starts");
  // the smooth stretches: a hand moving more than this in one 12 fps step is a pop nobody asked for
  for (let i = 1; i < k.length; i++) {
    const [t0] = k[i - 1];
    const [t1, , how] = k[i];
    if (how === "snap" || t1 - t0 < 1 / 12) continue;
    for (let t = t0; t < t1 - 1 / 12; t += 1 / 12) {
      const p = hands(poseAt(k, t));
      const q = hands(poseAt(k, t + 1 / 12));
      const d = Math.max(Math.hypot(p[0] - q[0], p[1] - q[1]), Math.hypot(p[2] - q[2], p[3] - q[3]));
      if (d > 30) {
        notes.push(`act: a hand jumps ${d.toFixed(0)} px in one step at t = ${t.toFixed(2)}: add a key or mark it "snap"`);
        break;
      }
    }
  }
  // it runs, ends and doesn't throw
  const inst = createAct(mod, { x: 100, y: 100 });
  const f = createFrame(400, 300);
  for (let i = 0; i < 900 && !inst.done(); i++) {
    inst.update(1 / 30);
    if (i % 3 === 0) inst.draw(clearFrame(f));
  }
  if (!meta.loop && !inst.done()) errs.push("the act never ends");
}

const count = (buf, test) => {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (test(buf[i], i)) n++;
  return n;
};

function checkMeta(meta, source, errs, notes) {
  if (typeof meta.name !== "string" || !meta.name) errs.push("meta.name missing");
  if (typeof meta.desc !== "string" || meta.desc.length < 12) errs.push("meta.desc missing or too short");
  if (meta.desc?.length > 180) notes.push(`desc is ${meta.desc.length} chars (keep it under 180)`);
  if (!Array.isArray(meta.tags) || !meta.tags.length) errs.push("meta.tags missing");
  if (!Array.isArray(meta.size) || meta.size.length !== 2 || meta.size.some((v) => !Number.isInteger(v) || v < 8 || v > 480))
    errs.push("meta.size must be [w, h], whole pixels 8..480");
  if (!Array.isArray(meta.origin) || meta.origin.length !== 2) errs.push("meta.origin must be [x, y]");
  if (!(meta.duration > 0 && meta.duration <= 12)) errs.push("meta.duration must be 0..12 s");
  if (!(meta.fps > 0 && meta.fps <= 120)) errs.push("meta.fps must be 1..120");
  if (!BACKDROPS.includes(meta.bg)) errs.push(`meta.bg must be one of ${BACKDROPS.join(", ")}`);
  const taken = Object.keys(meta.options ?? {}).filter((k) => RESERVED.includes(k));
  if (taken.length) errs.push(`option ${taken.join(", ")} is reserved for placement and glow: rename it`);
  if (/Math\.random/.test(source ?? "")) errs.push("uses Math.random: use rng/rand/burst/cycle so frames repeat");
  if (/\bDate\.now\b|\bnew Date\b|performance\.now/.test(source ?? "")) errs.push("reads the clock: draw from t so frames repeat");
}

function checkPixels(fx, errs, notes, stats) {
  const { mod, meta } = fx;
  const [W, H] = meta.size;
  const frame = createFrame(W + M * 2, H + M * 2, -M, -M);
  const fw = frame.w;
  const inside = (i) => {
    const x = (i % fw) - M;
    const y = Math.floor(i / fw) - M;
    return x >= 0 && y >= 0 && x < W && y < H;
  };
  const opts = { ...(meta.options ?? {}), seed: meta.options?.seed ?? 1 };
  if (meta.actor) opts.actor = stockActor(meta.actor === 2 ? 2 : 1);
  const n = Math.max(2, Math.round(meta.duration * meta.fps));
  let maxPx = 0;
  let spill = 0;
  let spillLight = 0;
  const ms = [];
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  const bounds = () =>
    frame.color.forEach((c, j) => {
      if (!(c >>> 24)) return;
      const x = (j % fw) - M;
      const y = Math.floor(j / fw) - M;
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y);
      by1 = Math.max(by1, y);
    });
  const spillNote = () => `${spill} px drawn outside the ${W}x${H} canvas (drawing spans x ${bx0}..${bx1}, y ${by0}..${by1}): grow size or move origin`;
  if (!mod.create) {
    for (let i = 0; i <= n; i++) {
      const t = meta.loop ? ((i % n) / n) * meta.duration : (i / n) * meta.duration;
      const t0 = performance.now();
      drawAt(fx, t, frame, opts);
      ms.push(performance.now() - t0);
      maxPx = Math.max(maxPx, count(frame.color, (c, j) => c >>> 24 && inside(j)), count(frame.light, (c, j) => c & 0xffffff && inside(j)));
      spill = Math.max(spill, count(frame.color, (c, j) => c >>> 24 && !inside(j)));
      bounds();
      spillLight = Math.max(spillLight, count(frame.light, (c, j) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255) > 90 && !inside(j)));
    }
    // other seeds can throw particles further: look for spills with a few more
    for (const seed of [2, 3, 7]) {
      const o2 = { ...opts, seed };
      for (let i = 0; i <= n; i += 2) {
        drawAt(fx, meta.loop ? ((i % n) / n) * meta.duration : (i / n) * meta.duration, frame, o2);
        const sp = count(frame.color, (c, j) => c >>> 24 && !inside(j));
        if (sp > spill) {
          spill = sp;
          bounds();
        }
      }
    }
    if (maxPx === 0) errs.push("draws nothing");
    if (spill > 0) notes.push(spillNote());
    if (spillLight > 60) notes.push(`glow spills ${spillLight} px past the canvas`);
    // one-shots end clean
    if (!meta.loop) {
      drawAt(fx, meta.duration, frame, opts);
      const left = count(frame.color, (c, j) => c >>> 24 && inside(j));
      if (left > 0) notes.push(`${left} px still drawn at t = duration: one-shots should end empty`);
    }
    // loops have no seam: stepping from the last frame back to the first changes no more than a normal step
    if (meta.loop) {
      const shots = [];
      for (let i = 0; i < n; i++) {
        drawAt(fx, (i / n) * meta.duration, frame, opts);
        shots.push(frame.color.slice());
      }
      const step = (a, b) => count(a, (c, j) => c !== b[j]);
      const diffs = shots
        .slice(0, -1)
        .map((a, i) => step(a, shots[i + 1]))
        .sort((x, y) => x - y);
      const typical = diffs[Math.floor(diffs.length * 0.9)] ?? 0;
      const seam = step(shots[n - 1], shots[0]);
      if (seam > Math.max(typical * 2, 12)) notes.push(`loop seam: ${seam} px change from the last frame to the first (a normal step is ${typical})`);
    }
    // any palette works: a short one (resampled by resolveOptions, as createFx does) leaves no holes
    let holes = 0;
    const put = Painter.prototype.put;
    Painter.prototype.put = function (sx, sy, c, a) {
      if (typeof c !== "number" || c !== c) holes++;
      return put.call(this, sx, sy, c, a);
    };
    try {
      const short = resolveOptions(meta, { palette: ["#141024", "#5a3c8c", "#c8a0f0", "#ffffff"] });
      for (let i = 0; i <= 8; i++) drawAt(fx, (i / 8) * meta.duration * (meta.loop ? 0.999 : 1), frame, short);
    } finally {
      Painter.prototype.put = put;
    }
    if (holes) errs.push(`${holes} pixels drawn with an undefined color when given a 4-step palette: use fit(o.palette, n)`);
    // deterministic: the same t twice gives the same frame
    const tt = meta.duration * 0.37;
    drawAt(fx, tt, frame, opts);
    const once = frame.color.slice();
    drawAt(fx, tt, frame, opts);
    if (count(once, (c, j) => c !== frame.color[j]) > 0) errs.push("not deterministic: the same t drew different frames");
  } else {
    // a simulation: step it in order, as a game would, and check every frame
    const run = (seed) => {
      const inst = createFx(mod, { x: meta.origin[0], y: meta.origin[1], ...opts, seed });
      const shots = [];
      for (let i = 0; i <= n; i++) {
        if (i) inst.update(1 / meta.fps);
        clearFrame(frame);
        const t0 = performance.now();
        inst.draw(frame);
        ms.push(performance.now() - t0);
        shots.push(frame.color.slice());
        maxPx = Math.max(maxPx, count(frame.color, (c, j) => c >>> 24 && inside(j)), count(frame.light, (c, j) => c & 0xffffff && inside(j)));
        const sp = count(frame.color, (c, j) => c >>> 24 && !inside(j));
        if (sp > spill) {
          spill = sp;
          bounds();
        }
        spillLight = Math.max(spillLight, count(frame.light, (c, j) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255) > 90 && !inside(j)));
      }
      return shots;
    };
    const a = run(opts.seed);
    const b = run(opts.seed);
    for (const seed of [2, 3, 7]) run(seed);
    if (maxPx === 0) errs.push("draws nothing");
    if (spill > 0) notes.push(spillNote());
    if (spillLight > 60) notes.push(`glow spills ${spillLight} px past the canvas`);
    if (a.some((s, i) => count(s, (c, j) => c !== b[i][j]) > 0)) errs.push("not deterministic: two runs with the same seed differ");
    if (!meta.loop) {
      const left = count(a[a.length - 1], (c, j) => c >>> 24 && inside(j));
      if (left > 0) notes.push(`${left} px still drawn at t = duration: one-shots should end empty`);
    }
  }
  ms.sort((x, y) => x - y);
  const median = ms[ms.length >> 1] ?? 0;
  if (median > 4) notes.push(`slow: ${median.toFixed(1)} ms a frame`);
  stats.frames = n;
  stats.msPerFrame = +median.toFixed(2);
  stats.pixels = maxPx;
}

/**
 * Checks an imported effect module. `source` is its code, for the checks that
 * read it. Returns `{ ok, errors, warnings, stats }`; a module that throws
 * while it is checked has that as an error.
 */
export function checkEffect(mod, source = "") {
  const errors = [];
  const warnings = [];
  const stats = {};
  try {
    if (!mod || typeof mod !== "object" || !mod.meta || typeof mod.meta !== "object") throw new Error("exports no meta");
    if (typeof mod.draw !== "function" && typeof mod.create !== "function") throw new Error("exports neither draw nor create");
    const fx = { mod, meta: checkedMeta(mod) };
    checkMeta(fx.meta, source, errors, warnings);
    if (mod.act) checkAct(fx, errors, warnings);
    if (!errors.length) checkPixels(fx, errors, warnings, stats);
  } catch (error) {
    errors.push(String(error?.message ?? error).split("\n")[0]);
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}
