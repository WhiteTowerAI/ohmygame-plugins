// pixelfx's sound engine: 22,050 Hz mono building blocks for an effect's
// sound script, the finish every variant gets, and a WAV encoder.
//
// From pixelfx (https://github.com/patch-gg/pixelfx), gallery/browser-backend.js,
// MIT License, Copyright (c) 2026 Patch; the full notice is in
// LICENSE-pixelfx.md beside it in a project, and in the Pixel Effects
// plugin's panel/lib/LICENSE. Unlike upstream it encodes WAV rather than Ogg,
// has no reference libraries, and leaves rendering a script's variants to
// whoever imports it. Nothing here touches a page, so it runs anywhere.

export const RATE = 22050;
export const PEAK_LIMIT = Math.pow(10, -1.05 / 20);

/** A deterministic random source: the same seed makes the same sound. */
export function sfxRng(seed = 1) {
  let s = Number(seed) >>> 0 || 0x6d2b79f5;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const u = Math.max(1e-12, next());
    const v = next();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p = 0.5) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal,
    noise(len, amp = 1) {
      const out = new Float64Array(Math.max(0, Math.round(len)));
      for (let i = 0; i < out.length; i++) out[i] = normal() * amp;
      return out;
    },
  };
}

function biquadCoeffs(type, freqHz, q = Math.SQRT1_2) {
  const f = Math.max(12, Math.min(RATE * 0.485, freqHz));
  const w0 = (2 * Math.PI * f) / RATE;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * q);
  let b0, b1, b2;
  if (type === "lowpass") {
    b0 = (1 - cosW) / 2;
    b1 = 1 - cosW;
    b2 = (1 - cosW) / 2;
  } else {
    b0 = (1 + cosW) / 2;
    b1 = -(1 + cosW);
    b2 = (1 + cosW) / 2;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cosW;
  const a2 = 1 - alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function runBiquad(x, coeffs, reverse = false) {
  const [b0, b1, b2, a1, a2] = coeffs;
  const n = x.length;
  const y = new Float64Array(n);
  let z1 = 0;
  let z2 = 0;
  for (let k = 0; k < n; k++) {
    const i = reverse ? n - 1 - k : k;
    const xi = x[i];
    const yi = b0 * xi + z1;
    z1 = b1 * xi - a1 * yi + z2;
    z2 = b2 * xi - a2 * yi;
    y[i] = yi;
  }
  return y;
}

function zeroPhaseCascade(samples, sections) {
  const src = Float64Array.from(samples);
  if (src.length < 6) return src;
  let cur = src;
  for (const c of sections) cur = runBiquad(cur, c, false);
  for (const c of sections) cur = runBiquad(cur, c, true);
  return cur;
}

/** Zero-phase fourth-order Butterworth low-pass. */
export function lowpass(samples, cutoff) {
  return zeroPhaseCascade(samples, [biquadCoeffs("lowpass", cutoff, 0.5411961), biquadCoeffs("lowpass", cutoff, 1.306563)]);
}

/** Zero-phase fourth-order Butterworth high-pass. */
export function highpass(samples, cutoff) {
  return zeroPhaseCascade(samples, [biquadCoeffs("highpass", cutoff, 0.5411961), biquadCoeffs("highpass", cutoff, 1.306563)]);
}

/** Zero-phase band-pass between `low` and `high` Hz. */
export function band(samples, low, high) {
  const lo = Math.max(15, low);
  const hi = Math.min(RATE * 0.48, Math.max(lo + 20, high));
  return lowpass(highpass(samples, lo), hi);
}

/** Cubic resampling from `srcRate` to `dstRate`, filtered first when it goes down. */
export function resample(samples, srcRate, dstRate) {
  if (srcRate === dstRate || samples.length < 2) return Float64Array.from(samples);
  const ratio = srcRate / dstRate;
  let pre = samples;
  if (ratio > 1.04) {
    const w0 = (2 * Math.PI * Math.min(srcRate * 0.48, 0.46 * dstRate)) / srcRate;
    const cw = Math.cos(w0);
    const al = Math.sin(w0) / Math.SQRT2;
    const a0 = 1 + al;
    const c = [(1 - cw) / 2 / a0, (1 - cw) / a0, (1 - cw) / 2 / a0, (-2 * cw) / a0, (1 - al) / a0];
    pre = runBiquad(runBiquad(samples, c, false), c, true);
  }
  const outLen = Math.max(2, Math.round(pre.length / ratio));
  const out = new Float64Array(outLen);
  const maxIdx = pre.length - 1;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const p0 = pre[Math.max(0, idx - 1)];
    const p1 = pre[Math.min(maxIdx, idx)];
    const p2 = pre[Math.min(maxIdx, idx + 1)];
    const p3 = pre[Math.min(maxIdx, idx + 2)];
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
    const cc = -0.5 * p0 + 0.5 * p2;
    out[i] = ((a * frac + b) * frac + cc) * frac + p1;
  }
  return out;
}

/** Shifts pitch by `semitones`, which changes the length too. */
export function pitchShift(samples, semitones) {
  if (Math.abs(semitones) < 0.02) return Float64Array.from(samples);
  return resample(samples, Math.round(RATE * Math.pow(2.0, semitones / 12.0)), RATE);
}

/** Rings `excitation` through band-pass modes `[freq, q, gain]`, decaying over `decay` seconds. */
export function resonate(excitation, modes, decay = 0.12) {
  const n = excitation.length;
  const out = new Float64Array(n);
  for (const [freq, q, gain] of modes) {
    if (freq >= RATE * 0.47 || freq < 16) continue;
    const w0 = (2 * Math.PI * freq) / RATE;
    const bw = w0 / Math.max(0.5, q);
    const gb = Math.SQRT1_2;
    const beta = (Math.sqrt(1 - gb * gb) / gb) * Math.tan(bw / 2);
    const kGain = 1 / (1 + beta);
    const b0 = 1 - kGain;
    const b2 = -(1 - kGain);
    const a1 = -2 * kGain * Math.cos(w0);
    const a2 = 2 * kGain - 1;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const x0 = excitation[i];
      const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      out[i] += y0 * gain;
    }
  }
  if (decay > 0) for (let i = 0; i < n; i++) out[i] *= Math.exp(-(i / RATE) / decay);
  return out;
}

/** Raised-cosine fade in over `attack` and out over `release` seconds. */
export function edgeFade(samples, attack = 0.0007, release = 0.025) {
  const out = Float64Array.from(samples);
  const a = Math.min(Math.round(attack * RATE), Math.floor(out.length / 3));
  const r = Math.min(Math.round(release * RATE), Math.floor(out.length / 2));
  for (let i = 0; i < a; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * (i + 1)) / (a + 1));
  for (let i = 0; i < r; i++) {
    const u = i / Math.max(1, r - 1);
    out[out.length - r + i] *= 0.5 + 0.5 * Math.cos(Math.PI * u);
  }
  return out;
}

/** Cuts or pads to `duration` seconds, fading the end. */
export function fit(samples, duration, release = 0.04) {
  const target = Math.round(duration * RATE);
  if (samples.length >= target) return edgeFade(samples.slice(0, target), 0.0007, release);
  const out = new Float64Array(target);
  out.set(edgeFade(samples, 0.0007, release), 0);
  return out;
}

/** Removes `begin` to `end` seconds, crossfading the join over `overlap`. */
export function splice(samples, begin, end, overlap = 0.012) {
  const i0 = Math.max(0, Math.round(begin * RATE));
  const i1 = Math.min(samples.length, Math.round(end * RATE));
  const ov = Math.min(Math.round(overlap * RATE), i0, samples.length - i1);
  if (ov <= 4) {
    const out = new Float64Array(i0 + (samples.length - i1));
    out.set(samples.subarray(0, i0), 0);
    out.set(samples.subarray(i1), i0);
    return out;
  }
  const head = samples.subarray(0, i0 - ov);
  const tail = samples.subarray(i1 + ov);
  const out = new Float64Array(head.length + ov + tail.length);
  out.set(head, 0);
  for (let i = 0; i < ov; i++) {
    const fade = 0.5 + 0.5 * Math.cos((Math.PI * i) / Math.max(1, ov - 1));
    out[head.length + i] = samples[i0 - ov + i] * fade + samples[i1 + i] * (1 - fade);
  }
  out.set(tail, head.length + ov);
  return out;
}

/** Mixes `fragment` into `dest` at `offsetSeconds`, in place, and returns `dest`. */
export function place(dest, fragment, offsetSeconds = 0, gain = 1.0) {
  const start = Math.max(0, Math.round(offsetSeconds * RATE));
  if (start >= dest.length) return dest;
  const end = Math.min(dest.length, start + fragment.length);
  for (let i = start; i < end; i++) dest[i] += fragment[i - start] * gain;
  return dest;
}

/** The loudness the finish aims at: the loudest 50 ms window, or the whole, whichever is louder. */
export function windowRms(samples) {
  const n = samples.length;
  if (!n) return 1e-6;
  const win = Math.max(32, Math.min(n, Math.round(0.05 * RATE)));
  let sumSq = 0;
  for (let i = 0; i < win; i++) sumSq += samples[i] * samples[i];
  let maxMean = sumSq / win;
  for (let i = win; i < n; i++) {
    sumSq += samples[i] * samples[i] - samples[i - win] * samples[i - win];
    const m = sumSq / win;
    if (m > maxMean) maxMean = m;
  }
  let globalSq = 0;
  for (let i = 0; i < n; i++) globalSq += samples[i] * samples[i];
  return Math.max(Math.sqrt(Math.max(maxMean, 0)) * 0.72, Math.sqrt(globalSq / n), 1e-6);
}

/** A layer filtered to `low`..`high` Hz, faded and brought to unit loudness, ready to mix. */
export function normLayer(samples, { low = null, high = null, attack = 0.0007, release = 0.025 } = {}) {
  let seg = Float64Array.from(samples);
  if (low != null && high != null) seg = band(seg, low, high);
  else if (low != null) seg = highpass(seg, low);
  else if (high != null) seg = lowpass(seg, high);
  seg = edgeFade(seg, attack, release);
  const rms = windowRms(seg);
  for (let i = 0; i < seg.length; i++) seg[i] /= rms;
  return seg;
}

/** Adds the grit of a sample-and-hold, 8-bit copy of the highs, by `amount`. */
export function pixelTexture(samples, amount = 0.16) {
  if (amount <= 0) return Float64Array.from(samples);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 1e-6) return Float64Array.from(samples);
  const n = samples.length;
  const norm = new Float64Array(n);
  for (let i = 0; i < n; i++) norm[i] = samples[i] / peak;
  const detail = highpass(norm, 280);
  let detailPeak = 1e-6;
  for (let i = 0; i < n; i++) detailPeak = Math.max(detailPeak, Math.abs(detail[i]));
  const diff = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const held = detail[i & ~1];
    diff[i] = (Math.round((held / detailPeak) * 127) / 127) * detailPeak - detail[i];
  }
  const roughness = band(diff, 350, 6200);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (norm[i] + roughness[i] * amount) * peak;
  return out;
}

/** A short, bright tick of odd harmonics at `frequency`, for a hit or a pickup. */
export function pixelTick(duration = 0.022, frequency = 440) {
  const n = Math.max(8, Math.round(duration * RATE));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const ph = 2 * Math.PI * frequency * t;
    let v = Math.sin(ph);
    if (frequency * 3 < 8200) v += Math.sin(ph * 3) * 0.25;
    if (frequency * 5 < 8200) v += Math.sin(ph * 5) * 0.1;
    out[i] = v * (1 - Math.exp(-t / 0.00045)) * Math.exp(-t / 0.0045);
  }
  return edgeFade(out, 0.0004, 0.008);
}

/** The finish of every variant: texture, loudness to `targetDb`, and a soft limit under -1 dB. */
export function finish(samples, targetDb = -16.5, texture = 0.15) {
  let out = pixelTexture(samples, texture);
  out = edgeFade(out, 0.0005, 0.014);
  const scale = Math.pow(10, targetDb / 20) / windowRms(out);
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] *= scale;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const f32 = new Float32Array(out.length);
  if (peak > PEAK_LIMIT) for (let i = 0; i < out.length; i++) f32[i] = Math.tanh((out[i] / PEAK_LIMIT) * 0.92) * PEAK_LIMIT;
  else f32.set(out);
  return f32;
}

/** `count` bar heights from 0 to 1, the loudest 1, for drawing a waveform. */
export function waveformBars(samples, count = 56) {
  if (!samples.length) return new Array(count).fill(0);
  const peaks = new Array(count).fill(0);
  let maxPeak = 1e-6;
  for (let b = 0; b < count; b++) {
    const s0 = Math.floor((b * samples.length) / count);
    const s1 = Math.max(s0 + 1, Math.floor(((b + 1) * samples.length) / count));
    let pk = 0;
    for (let i = s0; i < s1 && i < samples.length; i++) pk = Math.max(pk, Math.abs(samples[i]));
    peaks[b] = pk;
    maxPeak = Math.max(maxPeak, pk);
  }
  return peaks.map((p) => Math.round((p / maxPeak) * 1000) / 1000);
}

/** Mono samples from -1 to 1 as a 16-bit PCM WAV file. */
export function encodeWav(samples, rate = RATE) {
  const n = samples.length;
  const bytes = new Uint8Array(44 + n * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at, text) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true);
  }
  return bytes;
}
