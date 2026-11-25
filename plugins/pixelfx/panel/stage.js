// The live stage: runs an effect frame by frame on a canvas at the
// inspector's size, frame rate and length, over a backdrop, with the stock
// actor or a whole act when the effect has one. Ported from pixelfx's
// gallery StageRunner (gallery/app.js, MIT, see lib/LICENSE).
import {
  actorAlphaOf,
  clearFrame,
  composite,
  createAct,
  createFrame,
  createFx,
  drawActor,
  painterFor,
  stockActor,
} from "./lib/core/index.js";
import { buildBackdropBuffer, resampleNearestRGBA } from "./export.js";
import { isScreenFx } from "./options.js";
import { actFrameStep, actStepper, flippedActBounds, flippedOrigin } from "./timing.js";

export class StageRunner {
  /**
   * `state` is the panel's: `cfg`, `playing` and `speed`. `onFrame` hears
   * each frame drawn, `onError` why one couldn't be, or undefined once one
   * is, and `onLoop` each time playing starts the effect again.
   */
  constructor(canvas, viewport, state, { onFrame, onError, onLoop = () => {} }) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.onFrame = onFrame;
    this.onError = onError;
    this.onLoop = onLoop;
    this.fx = null;
    this.W = 360;
    this.H = 220;
    this.frameIdx = 0;
    this.totalFrames = 1;
    this.acc = 0;
    this.wait = 0;
    this.inst = null;
    this.acted = false;
  }

  setup(fx, resetClock = true) {
    this.fx = fx;
    if (!fx) return;
    this.onError(undefined);
    try {
      this.#layout();
    } catch (error) {
      this.inst = null;
      this.onError(error);
      return;
    }
    if (resetClock) this.restart();
    else this.seekFrame(Math.min(this.frameIdx, this.totalFrames - 1));
  }

  #layout() {
    const fx = this.fx;
    const m = fx.meta;
    const cfg = this.state.cfg;
    const screen = isScreenFx(m);
    const flip = !!cfg.flip;

    const rect = this.viewport.getBoundingClientRect();
    const viewAspect = rect.width > 40 && rect.height > 40 ? rect.width / rect.height : 16 / 10;
    const aspect = screen ? 16 / 9 : Math.max(1.2, Math.min(2.2, viewAspect));

    this.acted = !!fx.mod.act && cfg.actorMode !== "hide";
    // Flipped, an act faces the other way, so its box is mirrored too.
    const b = this.acted ? flippedActBounds(fx.mod, flip) : null;
    if (b) b.y1 = Math.min(b.y1, 22);

    const [origW, origH] = m.size;
    const effW = cfg.scaleWithCanvas ? cfg.canvasW : origW;
    const effH = cfg.scaleWithCanvas ? cfg.canvasH : origH;
    const [baseW, baseH] = this.acted ? [b.x1 - b.x0, b.y1 - b.y0] : [effW, effH];
    const pad = screen ? 1.0 : this.acted ? 1.28 : 1.55;

    this.W = Math.max(220, Math.ceil(Math.max(baseW * pad, baseH * pad * aspect)));
    this.H = Math.max(140, Math.ceil(this.W / aspect));
    if (screen) {
      // A screen effect fills the stage at the size it is shown at.
      this.W = effW;
      this.H = effH;
    }

    const W = this.W;
    const H = this.H;
    const frame = createFrame(W, H);
    const img = this.ctx.createImageData(W, H);

    const [ox, oy] = this.acted ? [-b.x0, -b.y0] : flippedOrigin(m, flip);
    if (this.acted) {
      this.x = Math.floor((W - baseW) / 2) + ox;
      this.y = Math.max(oy + 4, Math.floor(H * 0.78));
    } else if (screen && !this.#scaled()) {
      this.x = ox;
      this.y = oy;
    } else {
      const scaledOX = cfg.scaleWithCanvas ? Math.round((ox * cfg.canvasW) / origW) : ox;
      const scaledOY = cfg.scaleWithCanvas ? Math.round((oy * cfg.canvasH) / origH) : oy;
      this.x = Math.floor((W - effW) / 2) + scaledOX;
      this.y = Math.floor((H - effH) / 2) + scaledOY;
    }

    const bgBuf = buildBackdropBuffer(cfg.bg, W, H, this.y);
    this.canvas.width = W;
    this.canvas.height = H;
    this.frame = frame;
    this.img = img;
    this.bgBuf = bgBuf;
    this.totalFrames = Math.max(1, Math.round(cfg.duration * cfg.fps) + (m.loop ? 0 : 1));
  }

  #scaled() {
    const cfg = this.state.cfg;
    const [origW, origH] = this.fx.meta.size;
    return !this.acted && cfg.scaleWithCanvas && (cfg.canvasW !== origW || cfg.canvasH !== origH);
  }

  #instance() {
    const cfg = this.state.cfg;
    const scaled = this.#scaled();
    // Scaled, the effect is drawn in a frame of its own size first, about its own (flipped) origin.
    this.fxOrigin = flippedOrigin(this.fx.meta, !!cfg.flip);
    const [x, y] = scaled ? this.fxOrigin : [this.x, this.y];
    if (scaled) {
      const [origW, origH] = this.fx.meta.size;
      this.fxFrame = createFrame(origW, origH);
      this.fxRgba = new Uint8ClampedArray(origW * origH * 4);
    } else this.fxFrame = null;
    const options = {
      ...cfg.extraOpts,
      ...(cfg.palette ? { palette: cfg.palette } : {}),
      seed: cfg.seed,
      x,
      y,
      flip: !!cfg.flip,
    };
    if (this.acted) {
      this.inst = createAct(this.fx.mod, options);
      this.step = actStepper(this.inst, this.fx.mod);
    } else {
      this.inst = createFx(this.fx.mod, options);
      this.step = (dt) => this.inst.update(dt);
    }
  }

  simStepDt() {
    const m = this.fx.meta;
    const cfg = this.state.cfg;
    // An act plays its whole length, hit-stops included, over the frames.
    if (this.acted) return this.totalFrames > 1 ? actFrameStep(this.fx.mod, this.totalFrames) : 1 / cfg.fps;
    return (1 / cfg.fps) * (m.duration / Math.max(0.05, cfg.duration));
  }

  restart() {
    this.seekFrame(0);
  }

  seekFrame(target) {
    if (!this.fx || !this.frame) return;
    target = Math.max(0, Math.min(this.totalFrames - 1, Math.round(target)));
    try {
      this.#instance();
      const dt = this.simStepDt();
      for (let i = 0; i < target; i++) this.step(dt);
      this.frameIdx = target;
      this.acc = 0;
      this.wait = 0;
      this.renderCurrent();
    } catch (error) {
      this.inst = null;
      this.onError(error);
    }
  }

  /** Plays `dt` seconds of real time, at the panel's speed, a frame at a time. */
  tick(dt) {
    if (!this.fx || !this.inst || !this.state.playing) return;
    const interval = 1 / Math.max(1, this.state.cfg.fps);
    // A long pause (a hidden page, a slow frame) counts as at most a quarter second, but at least
    // one frame always builds up, so frame rates under 4 fps still play.
    this.acc = Math.min(this.acc + Math.min(dt, 0.25) * this.state.speed, Math.max(0.25, interval));
    let advanced = false;
    const dtSim = this.simStepDt();
    try {
      while (this.acc >= interval) {
        this.acc -= interval;
        if (this.frameIdx >= this.totalFrames - 1) {
          // A one-shot effect rests on its last frame a moment before it plays again.
          if (!this.fx.meta.loop) this.wait += interval;
          if (this.fx.meta.loop || this.wait >= 0.42) {
            this.restart();
            return this.onLoop();
          }
        } else {
          this.step(dtSim);
          this.frameIdx++;
          advanced = true;
        }
      }
      if (advanced) this.renderCurrent();
    } catch (error) {
      this.inst = null;
      this.onError(error);
    }
  }

  renderCurrent() {
    const f = clearFrame(this.frame);
    const cfg = this.state.cfg;
    const m = this.fx.meta;

    if (this.acted) {
      this.inst.draw(f, {
        body: cfg.actorMode === "full" || cfg.actorMode === "body",
        target: cfg.actorMode === "full" || cfg.actorMode === "target",
      });
      composite(f, this.img.data, this.bgBuf);
      const [sx, sy] = this.inst.shake;
      if (sx || sy) {
        this.ctx.fillStyle = "#161422";
        this.ctx.fillRect(0, 0, this.W, this.H);
      }
      this.ctx.putImageData(this.img, sx, sy);
      return this.onFrame();
    }

    const showActor = m.actor && cfg.actorMode !== "hide";
    const drawInto = (frame, x, y) => {
      if (!showActor) return this.inst.draw(frame);
      this.inst.draw(frame, "back");
      const t = m.loop ? this.inst.t % m.duration : Math.min(this.inst.t, m.duration);
      drawActor(painterFor(frame).place(x, y, !!cfg.flip), this.inst.options.actor ?? stockActor(), actorAlphaOf(this.fx.mod, t, this.inst.options));
      this.inst.draw(frame, "front");
    };

    if (this.fxFrame) {
      // Drawn at the effect's own size, then scaled to the chosen one.
      const [origW, origH] = m.size;
      clearFrame(this.fxFrame);
      drawInto(this.fxFrame, this.fxOrigin[0], this.fxOrigin[1]);
      composite(this.fxFrame, this.fxRgba, null);
      const scaled = resampleNearestRGBA(this.fxRgba, origW, origH, cfg.canvasW, cfg.canvasH);
      composite(f, this.img.data, this.bgBuf);
      const dst = this.img.data;
      const ox = Math.floor((this.W - cfg.canvasW) / 2);
      const oy = Math.floor((this.H - cfg.canvasH) / 2);
      for (let y = 0; y < cfg.canvasH; y++) {
        const ty = oy + y;
        if (ty < 0 || ty >= this.H) continue;
        for (let x = 0; x < cfg.canvasW; x++) {
          const tx = ox + x;
          if (tx < 0 || tx >= this.W) continue;
          const si = (y * cfg.canvasW + x) * 4;
          const a = scaled[si + 3] / 255;
          if (a <= 0) continue;
          const di = (ty * this.W + tx) * 4;
          dst[di] = Math.min(255, scaled[si] * a + dst[di] * (1 - a));
          dst[di + 1] = Math.min(255, scaled[si + 1] * a + dst[di + 1] * (1 - a));
          dst[di + 2] = Math.min(255, scaled[si + 2] * a + dst[di + 2] * (1 - a));
          dst[di + 3] = 255;
        }
      }
      this.ctx.putImageData(this.img, 0, 0);
      return this.onFrame();
    }

    drawInto(f, this.x, this.y);
    composite(f, this.img.data, this.bgBuf);
    this.ctx.putImageData(this.img, 0, 0);
    this.onFrame();
  }
}

export const THUMB_W = 98;
export const THUMB_H = 44;

/** A carousel card's still: the effect a little before its middle, over its backdrop. */
export function drawThumbnail(canvas, fx) {
  const [W, H] = [THUMB_W, THUMB_H];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  try {
    const m = fx.meta;
    const [fw, fh] = m.size;
    const scale = Math.min(1, (W * 0.9) / fw, (H * 0.92) / fh);
    const simW = Math.max(W, Math.ceil(W / scale));
    const simH = Math.max(H, Math.ceil(H / scale));
    const x = Math.floor((simW - fw) / 2) + m.origin[0];
    const y = Math.floor((simH - fh) / 2) + m.origin[1];
    const frame = createFrame(simW, simH);
    const bg = buildBackdropBuffer(m.bg === "sky" ? "sky" : "topstone", simW, simH, y);
    const inst = createFx(fx.mod, { x, y });
    for (let i = 0; i < 6; i++) inst.update((m.duration * 0.42) / 6);
    inst.draw(frame);
    const rgba = composite(frame, new Uint8ClampedArray(simW * simH * 4), bg);
    const out = simW === W && simH === H ? rgba : resampleNearestRGBA(rgba, simW, simH, W, H);
    ctx.putImageData(new ImageData(out, W, H), 0, 0);
  } catch {
    ctx.fillStyle = "#2b1620";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f87171";
    ctx.font = "11px monospace";
    ctx.fillText("ERR", 36, 26);
  }
}
