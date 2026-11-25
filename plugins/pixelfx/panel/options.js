// What the inspector shows for an effect's own options. pixelfx effects have
// no schema: each option's default in `meta.options` says what it is, as the
// upstream gallery reads it (gallery/app.js, MIT, see lib/LICENSE).
import { toHex } from "./lib/core/index.js";

export const isHexStr = (value) => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value);

/** A list of colours, as numbers (0xRRGGBB and up) or hex strings. */
export const isColorRamp = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((color) => (typeof color === "number" && color > 0xffff) || isHexStr(color));

export function normHex(color) {
  if (typeof color === "number") return toHex(color);
  if (!isHexStr(color)) return "#ffffff";
  let digits = color.slice(1);
  if (digits.length === 3) digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
  return "#" + digits.slice(0, 6).toLowerCase();
}

/**
 * The control for one option, from its default: a slider for a number, a
 * toggle, a colour, a colour ramp, a point, or text. Undefined for what the
 * inspector doesn't edit, such as objects.
 */
export function optionControl(value) {
  if (typeof value === "number") {
    const whole = Number.isInteger(value) && Math.abs(value) >= 2;
    return {
      kind: "number",
      step: whole ? 1 : Math.abs(value) < 1 ? 0.02 : 0.1,
      min: value < 0 ? Math.floor(value * 2) : 0,
      max: Math.max(whole ? 12 : 2, Math.ceil(Math.abs(value) * 3) || 10),
    };
  }
  if (typeof value === "boolean") return { kind: "toggle" };
  if (isHexStr(value)) return { kind: "color" };
  if (isColorRamp(value)) return { kind: "ramp" };
  if (typeof value === "string") return { kind: "text" };
  if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Math.abs(n) <= 1000)) return { kind: "point" };
  return undefined;
}

/** The options the inspector lists for an effect: all but `palette` and `seed`, which have their own rows. */
export function effectOptions(meta) {
  return Object.entries(meta.options ?? {})
    .filter(([key]) => key !== "palette" && key !== "seed")
    .flatMap(([key, value]) => {
      const control = optionControl(value);
      return control ? [{ key, value, control }] : [];
    });
}

/** Whether an effect fills a 16:9 screen, such as a transition, which the stage shows at its own size. */
export const isScreenFx = (meta) => meta.size[0] >= 320 && Math.abs(meta.size[0] / meta.size[1] - 16 / 9) < 0.05;

/** The meta every effect gets before its own, as the upstream gallery fills it. */
export function fullMeta(meta) {
  return { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], size: [128, 128], origin: [64, 96], options: {}, ...meta };
}

/** The inspector's settings for an effect as its code has them. */
export function defaultConfig(fx) {
  const meta = fx.meta;
  return {
    bg: isScreenFx(meta) ? meta.bg : meta.bg === "sky" ? "sky" : "topstone",
    paletteKey: "",
    palette: null,
    seed: meta.options?.seed ?? 1,
    fps: meta.fps,
    duration: meta.duration,
    canvasW: meta.size[0],
    canvasH: meta.size[1],
    lockAspect: true,
    scaleWithCanvas: true,
    flip: false,
    actorMode: fx.mod.act || meta.actor ? "full" : "hide",
    extraOpts: {},
  };
}
