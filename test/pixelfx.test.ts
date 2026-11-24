import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
// @ts-expect-error The panel is plain JavaScript.
import { effects } from "../plugins/pixelfx/panel/lib/fx/index.js";
// @ts-expect-error The panel is plain JavaScript.
import { buildGifBlob, exportBudget, framesMeta, gifDelays, renderExportFrames, sheetLayout } from "../plugins/pixelfx/panel/export.js";
// @ts-expect-error The panel is plain JavaScript.
import { actFrameStep, actLength, actStepper, flippedActBounds, flippedOrigin } from "../plugins/pixelfx/panel/timing.js";
// @ts-expect-error The panel is plain JavaScript.
import { actBounds, createAct } from "../plugins/pixelfx/panel/lib/core/index.js";
// @ts-expect-error The panel is plain JavaScript.
import { defaultConfig, effectOptions, fullMeta, isScreenFx, optionControl } from "../plugins/pixelfx/panel/options.js";
// @ts-expect-error The panel is plain JavaScript.
import { StageRunner } from "../plugins/pixelfx/panel/stage.js";
// @ts-expect-error The panel is plain JavaScript.
import { TEXT } from "../plugins/pixelfx/panel/i18n.js";
// @ts-expect-error The panel is plain JavaScript.
import { checkEffect } from "../plugins/pixelfx/panel/check.js";
import {
  applySettings,
  dependencies,
  effectIdOf,
  effectTemplate,
  freeEffectId,
  importsOf,
  isEffectId,
  LICENSE_PATH,
  licenseNotice,
  missingImports,
  parsePresets,
  planEffect,
  presetsFor,
  presetsText,
  resolveImport,
  settingsOf,
  VERSION_PATH,
  withPreset,
  // @ts-expect-error The panel is plain JavaScript.
} from "../plugins/pixelfx/panel/project.js";

// The Pixel Effects panel's parts that need no page: what the inspector
// offers for an effect's options, the sheet layout, export rendering and the
// GIF encoder, over every built-in effect pixelfx ships.

type Effect = { id: string; mod: { meta: any; act?: unknown }; meta: any };
const LIBRARY: Effect[] = Object.entries(effects as Record<string, any>).map(([id, mod]) => {
  const meta = fullMeta(mod.meta);
  return { id, mod: { ...mod, meta }, meta };
});
const byId = (id: string) => LIBRARY.find((fx) => fx.id === id)!;

describe("pixelfx options", () => {
  it("offers a control for each kind of default", () => {
    assert.deepEqual(optionControl(12), { kind: "number", step: 1, min: 0, max: 36 });
    assert.deepEqual(optionControl(0.4), { kind: "number", step: 0.02, min: 0, max: 2 });
    assert.deepEqual(optionControl(-3), { kind: "number", step: 1, min: -6, max: 12 });
    assert.equal(optionControl(true)?.kind, "toggle");
    assert.equal(optionControl("#ff8800")?.kind, "color");
    assert.equal(optionControl([0xff0000, "#00ff00"])?.kind, "ramp");
    assert.equal(optionControl("spiral")?.kind, "text");
    assert.equal(optionControl([4, -8])?.kind, "point");
    assert.equal(optionControl({ a: 1 }), undefined);
    assert.equal(optionControl([1, 2, 3]), undefined);
  });

  it("lists an effect's own options without palette and seed", () => {
    const options = effectOptions({ options: { palette: [0xff0000, 0x00ff00], seed: 3, radius: 18, glow: true, shape: { a: 1 } } });
    assert.deepEqual(
      options.map((option: { key: string }) => option.key),
      ["radius", "glow"],
    );
  });

  it("starts from the effect's own settings", () => {
    const fx = LIBRARY.find((item) => !isScreenFx(item.meta) && !item.mod.act && !item.meta.actor && item.meta.bg !== "sky")!;
    const cfg = defaultConfig(fx);
    assert.equal(cfg.bg, "topstone");
    assert.equal(cfg.actorMode, "hide");
    assert.deepEqual([cfg.canvasW, cfg.canvasH, cfg.fps, cfg.duration], [fx.meta.size[0], fx.meta.size[1], fx.meta.fps, fx.meta.duration]);
    const moves = LIBRARY.find((item) => item.mod.act)!;
    assert.equal(defaultConfig(moves).actorMode, "full");
  });
});

describe("pixelfx export", () => {
  it("lays sheets out about square", () => {
    assert.deepEqual(sheetLayout(1, 64, 64), { cols: 1, rows: 1 });
    assert.deepEqual(sheetLayout(16, 64, 64), { cols: 4, rows: 4 });
    assert.deepEqual(sheetLayout(10, 64, 64), { cols: 4, rows: 3 });
    assert.deepEqual(sheetLayout(9, 128, 32), { cols: 2, rows: 5 });
  });

  it("renders every built-in effect", () => {
    assert.ok(LIBRARY.length >= 244, `${LIBRARY.length} effects`);
    const drawn = (rgba: Uint8ClampedArray) => {
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) return true;
      return false;
    };
    for (const fx of LIBRARY) {
      // Its own settings at a few frames a second, which keeps the test quick.
      const seq = renderExportFrames(fx, { ...defaultConfig(fx), fps: 4 });
      assert.equal(seq.frames.length, seq.totalFrames, fx.id);
      assert.equal(seq.frames[0].rgba.length, seq.w * seq.h * 4, fx.id);
      assert.ok(seq.frames.some((frame: { rgba: Uint8ClampedArray }) => drawn(frame.rgba)), `${fx.id} draws nothing`);
    }
  });

  it("scales to a chosen size and frame rate", () => {
    const fx = byId("fire/campfire");
    const cfg = { ...defaultConfig(fx), canvasW: 40, canvasH: 50, fps: 6, duration: 0.5 };
    const seq = renderExportFrames(fx, cfg);
    assert.deepEqual([seq.w, seq.h, seq.fps], [40, 50, 6]);
    assert.equal(seq.totalFrames, fx.meta.loop ? 3 : 4);
  });

  it("encodes a GIF", async () => {
    const fx = LIBRARY.find((item) => !item.mod.act)!;
    const blob = buildGifBlob(fx, { ...defaultConfig(fx), fps: 8, duration: 0.25 });
    assert.equal(blob.type, "image/gif");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
    assert.equal(bytes.at(-1), 0x3b);
  });
});

describe("pixelfx limits and timing", () => {
  it("refuses exports too big to hold or draw", () => {
    const fx = byId("fire/campfire");
    assert.equal(exportBudget(fx, defaultConfig(fx)).ok, true);
    const huge = { ...defaultConfig(fx), canvasW: 1024, canvasH: 1024, fps: 120, duration: 60 };
    assert.deepEqual(exportBudget(fx, huge), { ok: false, frames: 7200, w: 1024, h: 1024 });
    // Small frames fit in memory and in a sheet, but a contact sheet of 7,200 of them is taller than a canvas can be.
    const many = { ...defaultConfig(fx), canvasW: 16, canvasH: 16, fps: 120, duration: 60 };
    assert.equal(exportBudget(fx, many).ok, true);
    assert.equal(exportBudget(fx, many, { contact: true }).ok, false);
  });

  it("gives GIF frames delays that add up to the length", () => {
    for (const [n, fps] of [[31, 30], [13, 12], [25, 24], [50, 50], [7, 7.5]]) {
      const delays = gifDelays(n, fps);
      assert.equal(delays.length, n);
      assert.equal(delays.reduce((a: number, b: number) => a + b, 0), Math.round((n * 100) / fps), `${n} at ${fps}`);
      assert.ok(delays.every((d: number) => d >= 2));
    }
  });

  it("draws GIFs faster than 50 fps at 50 fps", async () => {
    const fx = byId("fire/campfire");
    const bytes = new Uint8Array(await buildGifBlob(fx, { ...defaultConfig(fx), fps: 100, duration: 0.5 }).arrayBuffer());
    // Each frame starts with a graphic control extension, 21 F9 04.
    let frames = 0;
    for (let i = 0; i + 2 < bytes.length; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) frames++;
    assert.equal(frames, 25);
  });

  it("plays an act to its last pose, hit-stops included", () => {
    const fx = byId("moves/sword-combo");
    const { end, seconds, from } = actLength(fx.mod);
    assert.ok(seconds > end - from, "sword combo has hit-stops");
    for (const frames of [12, 31, 90]) {
      const act = createAct(fx.mod, { x: 100, y: 100 });
      const step = actStepper(act, fx.mod);
      const dt = actFrameStep(fx.mod, frames);
      for (let i = 1; i < frames; i++) step(dt);
      assert.ok(Math.abs(act.t - end) < 1e-6, `${frames} frames end at ${act.t}, not ${end}`);
    }
  });

  it("mirrors a flipped act's box and an effect's origin", () => {
    const fx = byId("moves/sword-combo");
    const b = actBounds(fx.mod);
    assert.deepEqual(flippedActBounds(fx.mod, true), { ...b, x0: -b.x1, x1: -b.x0 });
    assert.deepEqual(flippedOrigin({ size: [128, 96], origin: [40, 80] }, true), [88, 80]);
    assert.deepEqual(flippedOrigin({ size: [128, 96], origin: [40, 80] }, false), [40, 80]);
  });

  it("keeps a flipped export as whole as the unflipped one", () => {
    const opaque = (seq: { frames: { rgba: Uint8ClampedArray }[] }) => {
      let n = 0;
      for (const frame of seq.frames) for (let i = 3; i < frame.rgba.length; i += 4) if (frame.rgba[i]) n++;
      return n;
    };
    for (const id of ["moves/sword-combo", "moves/arrow-shot", "fire/fire-breath"]) {
      const fx = byId(id);
      const cfg = { ...defaultConfig(fx), fps: 6 };
      const plain = opaque(renderExportFrames(fx, cfg));
      const flipped = opaque(renderExportFrames(fx, { ...cfg, flip: true }));
      assert.ok(Math.abs(flipped - plain) / plain < 0.03, `${id}: ${flipped} pixels flipped, ${plain} not`);
    }
  });

  it("describes frames saved one by one without the sheet's layout", () => {
    const meta = { app: "x", image: "a.png", size: { w: 1, h: 1 }, frameTags: [], pixelfx: { id: "a/b", fps: 12, columns: 4, rows: 3, frames: 2 } };
    assert.deepEqual(framesMeta(meta, ["b_000.png", "b_001.png"]), {
      app: "x",
      frameTags: [],
      pixelfx: { id: "a/b", fps: 12, frames: 2 },
      files: ["b_000.png", "b_001.png"],
    });
  });
});

describe("pixelfx stage", () => {
  /** A canvas that keeps the last image put on it. */
  const fakeCanvas = () => {
    const canvas = {
      width: 0,
      height: 0,
      last: undefined as { data: Uint8ClampedArray } | undefined,
      getContext: () => ({
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: (image: { data: Uint8ClampedArray }) => {
          canvas.last = image;
        },
        fillRect() {},
      }),
    };
    return canvas;
  };
  const viewport = { getBoundingClientRect: () => ({ width: 800, height: 450 }) };

  it("keeps playing below 4 fps", () => {
    const fx = byId("fire/campfire");
    const state = { cfg: { ...defaultConfig(fx), fps: 2 }, playing: true, speed: 1 };
    const stage = new StageRunner(fakeCanvas(), viewport, state, { onFrame() {}, onError() {} });
    stage.setup(fx);
    for (let i = 0; i < 12; i++) stage.tick(0.1);
    assert.equal(stage.frameIdx, 2);
  });

  it("ends an act on its last pose and reports a broken setup", () => {
    const fx = byId("moves/sword-combo");
    const state = { cfg: defaultConfig(fx), playing: true, speed: 1 };
    const errors: unknown[] = [];
    const stage = new StageRunner(fakeCanvas(), viewport, state, { onFrame() {}, onError: (error: unknown) => error && errors.push(error) });
    stage.setup(fx);
    stage.seekFrame(stage.totalFrames - 1);
    assert.ok(Math.abs(stage.inst.t - actLength(fx.mod).end) < 1e-6);
    const broken = { ...fx, mod: { ...fx.mod, act: { poses: "not poses" } } };
    stage.setup(broken);
    assert.equal(errors.length, 1);
  });

  it("plays every built-in effect, and some scaled or flipped", () => {
    for (const [index, fx] of LIBRARY.entries()) {
      // Every effect as it comes, with its act or actor if it has one; every
      // eighth also drawn at twice its size, and flipped without its actor.
      const changes = index % 8 ? [{}] : [{}, { canvasW: fx.meta.size[0] * 2, canvasH: fx.meta.size[1] * 2 }, { actorMode: "hide", flip: true }];
      for (const change of changes) {
        const errors: unknown[] = [];
        const canvas = fakeCanvas();
        const state = { cfg: { ...defaultConfig(fx), fps: 4, ...change }, playing: true, speed: 1 };
        const stage = new StageRunner(canvas, viewport, state, { onFrame() {}, onError: (error: unknown) => error && errors.push(error) });
        stage.setup(fx);
        for (let i = 0; i < 6; i++) stage.tick(0.3);
        stage.seekFrame(stage.totalFrames - 1);
        assert.deepEqual(errors, [], `${fx.id} ${JSON.stringify(change)}`);
        assert.equal(canvas.last?.data.length, canvas.width * canvas.height * 4, fx.id);
        assert.ok(stage.frameIdx === stage.totalFrames - 1, fx.id);
      }
    }
  });
});

describe("pixelfx text", () => {
  it("has the same text in English and Chinese", () => {
    const shape = (value: unknown): unknown =>
      value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)])) : typeof value;
    const { backdrops: _en, ...en } = TEXT.en;
    const { backdrops: _zh, ...zh } = TEXT["zh-CN"];
    assert.deepEqual(shape(zh), shape(en));
  });
});

// The project's own effects: what a copy of a built-in effect needs beside it,
// the check ported from pixelfx's tools/check.mjs, and the presets file.

const LIB = fileURLToPath(new URL("../plugins/pixelfx/panel/lib/", import.meta.url));
const readLib = (file: string) => readFile(path.join(LIB, file), "utf8");
const libSource = (id: string) => readLib(`fx/${id}.js`);

/** Writes a plan as the panel does into a scratch project, so its effect can be imported from there. */
async function writePlan(root: string, writes: { path: string; text: string }[]) {
  for (const write of writes) {
    await mkdir(path.dirname(path.join(root, write.path)), { recursive: true });
    await writeFile(path.join(root, write.path), write.text);
  }
}

async function withScratch(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "pixelfx-project-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("pixelfx project files", () => {
  it("names effects by category and kebab-case name", () => {
    assert.equal(isEffectId("fire/torch"), true);
    assert.equal(isEffectId("my-fx/blue-torch-2"), true);
    for (const id of ["fire", "fire/Torch", "fire/_lib", "fire/torch/x", "../fire", "fire/torch.js", "fire/-x", ""]) assert.equal(isEffectId(id), false, id);
    assert.equal(effectIdOf("pixelfx/fx/fire/torch.js"), "fire/torch");
    for (const file of ["pixelfx/fx/fire/_lib.js", "pixelfx/fx/torch.js", "pixelfx/fx/fire/a/torch.js", "pixelfx/core/index.js", "pixelfx/fx/fire/Torch.js", "other/fx/fire/torch.js"])
      assert.equal(effectIdOf(file), undefined, file);
    assert.equal(freeEffectId("fire/torch", new Set()), "fire/torch");
    assert.equal(freeEffectId("fire/torch", new Set(["fire/torch", "fire/torch-2"])), "fire/torch-3");
  });

  it("reads relative imports and resolves them within the folder", () => {
    const source = `import { a,\n  b } from "../../core/index.js";\nimport { c } from './_lib.js';\nexport { d } from "../fire/fireball.js";\nconst e = await import("./more.js");\nimport "pixelfx";\n// from "nothing"`;
    assert.deepEqual(importsOf(source), ["../../core/index.js", "./_lib.js", "../fire/fireball.js", "./more.js"]);
    assert.equal(resolveImport("fx/fire/torch.js", "../../core/index.js"), "core/index.js");
    assert.equal(resolveImport("fx/moves/x.js", "../fire/fireball.js"), "fx/fire/fireball.js");
    assert.equal(resolveImport("fx/fire/torch.js", "./_lib.js"), "fx/fire/_lib.js");
    assert.equal(resolveImport("fx/fire/torch.js", "../../../escape.js"), undefined);
    // What a project effect imports that the project lacks, which the browser's import error doesn't name.
    const paths = new Set(["pixelfx/core/index.js", "pixelfx/fx/fire/_lib.js"]);
    assert.deepEqual(missingImports(source, "fire/x", paths), ["../fire/fireball.js", "./more.js"]);
    assert.deepEqual(missingImports(source, "mine/x", paths), ["./_lib.js", "../fire/fireball.js", "./more.js"]);
  });

  it("copies every built-in effect with all it imports, and the core whole", async () => {
    const core = (await readdir(path.join(LIB, "core"))).map((file) => `core/${file}`).sort();
    for (const id of Object.keys(effects)) {
      const at = `fx/${id}.js`;
      const files = await dependencies(await libSource(id), at, readLib);
      // Nothing it needs is left behind: each file's imports are in the copy too.
      for (const [file, text] of [[at, await libSource(id)], ...files] as [string, string][])
        for (const spec of importsOf(text)) {
          const dep = resolveImport(file, spec);
          assert.ok(dep === at || files.has(dep), `${id}: ${file} imports ${spec}, which isn't copied`);
        }
      assert.deepEqual([...files.keys()].filter((file) => file.startsWith("core/")).sort(), core, id);
      const cat = id.split("/")[0];
      if (/from "\.\/_lib\.js"/.test(await libSource(id))) assert.ok(files.has(`fx/${cat}/_lib.js`), id);
    }
    const move = await dependencies(await libSource("moves/fireball-throw"), "fx/moves/fireball-throw.js", readLib);
    assert.ok([...move.keys()].some((file) => /^fx\/(?!moves\/)[^/]+\/[^_][^/]*\.js$/.test(file)), "a move brings the effects it chains");
  });

  it("plans the files a project lacks, never replacing one it has", async () => {
    const license = licenseNotice(await readLib("LICENSE"));
    assert.match(license, /MIT License/);
    assert.doesNotMatch(license, /Patch Pixel/);
    const fresh = await planEffect({ id: "fire/torch", source: await libSource("fire/torch"), readLib, existing: new Set(), license });
    const written = fresh.writes.map((write: { path: string }) => write.path);
    assert.equal(written[0], "pixelfx/fx/fire/torch.js");
    assert.equal(fresh.writes[0].text, await libSource("fire/torch"));
    assert.ok(written.includes("pixelfx/core/index.js") && written.includes("pixelfx/fx/fire/_lib.js"));
    assert.ok(written.includes(VERSION_PATH) && written.includes(LICENSE_PATH));
    assert.deepEqual(fresh.kept, []);
    // A project that has them keeps its own: a changed core file, its version and its license.
    const existing = new Set(["pixelfx/core/math.js", VERSION_PATH, LICENSE_PATH, "pixelfx/fx/fire/_lib.js"]);
    const again = await planEffect({ id: "fire/torch-2", source: await libSource("fire/torch"), readLib, existing, license });
    const paths = again.writes.map((write: { path: string }) => write.path);
    for (const kept of existing) assert.equal(paths.includes(kept), false, kept);
    assert.deepEqual(new Set(again.kept), new Set(["pixelfx/core/math.js", "pixelfx/fx/fire/_lib.js"]));
    // An import the plugin doesn't have is the project's own business.
    const own = await planEffect({ id: "mine/x", source: `import { y } from "./helpers.js";`, readLib, existing: new Set(), license });
    assert.deepEqual(own.writes.map((write: { path: string }) => write.path), ["pixelfx/fx/mine/x.js", LICENSE_PATH]);
    await assert.rejects(planEffect({ id: "fire/Torch", source: "", readLib, existing: new Set() }), /kebab-case/);
  });

  it("leaves a folder a game imports as it is, and that passes the check", async () => {
    await withScratch(async (root) => {
      const existing = new Set<string>();
      for (const id of ["moves/fireball-throw", "melee/claw-swipe", "fire/brazier", "ui/crit-number"]) {
        const plan = await planEffect({ id, source: await libSource(id), readLib, existing, license: "MIT" });
        await writePlan(root, plan.writes);
        for (const write of plan.writes) existing.add(write.path);
      }
      for (const loop of [false, true]) {
        const id = `mine/${loop ? "loop" : "burst"}`;
        const plan = await planEffect({ id, source: effectTemplate(id, loop), readLib, existing, license: "MIT" });
        await writePlan(root, plan.writes);
      }
      for (const id of ["moves/fireball-throw", "melee/claw-swipe", "fire/brazier", "ui/crit-number", "mine/burst", "mine/loop"]) {
        const file = path.join(root, "pixelfx/fx", `${id}.js`);
        const mod = await import(pathToFileURL(file).href);
        const result = checkEffect(mod, await readFile(file, "utf8"));
        assert.deepEqual(result.errors, [], id);
        assert.equal(result.ok, true, id);
      }
    });
  });
});

describe("pixelfx check", () => {
  const good = { name: "Spark", desc: "A spark that flies out and fades.", tags: ["test"], size: [32, 32], origin: [16, 16], duration: 0.5, fps: 30 };
  const dot = (p: any, t: number) => {
    if (t < 0.4) p.px(0, 0, 0xffffffff);
  };

  it("passes a clean effect and states its frames", () => {
    const result = checkEffect({ meta: good, draw: dot }, "");
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.stats.frames, 15);
  });

  it("names what's wrong", () => {
    const errors = (mod: unknown, source = "") => checkEffect(mod, source).errors.join("\n");
    assert.match(errors({}), /exports no meta/);
    assert.match(errors({ meta: good }), /neither draw nor create/);
    assert.match(errors({ meta: { ...good, desc: "short" }, draw: dot }), /meta.desc/);
    assert.match(errors({ meta: { ...good, size: [4, 600] }, draw: dot }), /meta.size/);
    assert.match(errors({ meta: { ...good, bg: "pink" }, draw: dot }), /meta.bg/);
    assert.match(errors({ meta: { ...good, options: { x: 1 } }, draw: dot }), /reserved/);
    assert.match(errors({ meta: good, draw: dot }, "const r = Math.random();"), /Math.random/);
    assert.match(errors({ meta: good, draw: dot }, "const now = Date.now();"), /clock/);
    assert.match(errors({ meta: good, draw() {} }), /draws nothing/);
    assert.match(errors({ meta: good, draw() { throw new Error("boom"); } }), /boom/);
    let calls = 0;
    assert.match(errors({ meta: good, draw: (p: any) => p.px(calls++ % 5, 0, 0xffffffff) }), /not deterministic/);
  });

  it("warns about spills and one-shots that don't end empty", () => {
    const warnings = checkEffect({ meta: good, draw: (p: any) => (p.px(0, 0, 0xffffffff), p.px(30, 0, 0xffffffff)) }, "").warnings.join("\n");
    assert.match(warnings, /outside the 32x32 canvas/);
    assert.match(warnings, /still drawn at t = duration/);
  });

  it("checks a sample of the built-in effects clean", async () => {
    for (const id of ["fire/torch", "fire/brazier", "ui/crit-number", "melee/claw-swipe", "moves/fireball-throw", "weather/rain"]) {
      const result = checkEffect((effects as Record<string, unknown>)[id], await libSource(id));
      assert.deepEqual(result.errors, [], id);
      assert.deepEqual(result.warnings, [], id);
    }
  });
});

describe("pixelfx presets and settings", () => {
  const fx = byId("fire/torch");

  it("keeps the settings that differ from the effect's own and puts them back", () => {
    const base = defaultConfig(fx);
    assert.deepEqual(settingsOf(base, fx), { bg: base.bg });
    const { cfg, ignored } = applySettings(
      base,
      { seed: 7, palette: ["#112233", "#AABBCC"], fps: 12, size: [64, 64], flip: true, bg: "sky", options: { nope: 1 }, colour: "red" },
      fx,
    );
    assert.deepEqual(ignored, ["options.nope", "colour"]);
    const settings = settingsOf(cfg, fx);
    assert.deepEqual(settings, { seed: 7, bg: "sky", palette: ["#112233", "#aabbcc"], fps: 12, size: [64, 64], flip: true });
    assert.deepEqual(settingsOf(applySettings(defaultConfig(fx), settings, fx).cfg, fx), settings);
    assert.equal(applySettings(cfg, { palette: null }, fx).cfg.palette, null);
    assert.deepEqual(applySettings(base, { fps: 0, size: [8, 8], palette: ["red"], seed: 1.5 }, fx).ignored, ["fps", "size", "palette", "seed"]);
  });

  it("reads, adds and replaces presets, and refuses a file that isn't one", () => {
    assert.throws(() => parsePresets("{"), SyntaxError);
    assert.throws(() => parsePresets('{"presets": {}}'), /no "presets" list/);
    let doc = parsePresets('{"version": 1, "presets": [{"name": "x", "effect": "fire/torch", "source": "builtin", "settings": {}}, {"odd": true}], "mine": 1}');
    doc = withPreset(doc, { name: " Blue ", effect: "fire/torch", source: "builtin", settings: { seed: 2 } });
    doc = withPreset(doc, { name: "Blue", effect: "fire/torch", source: "builtin", settings: { seed: 3 } });
    doc = withPreset(doc, { name: "Blue", effect: "fire/torch", source: "project", settings: {} });
    assert.deepEqual(
      presetsFor(doc, "fire/torch", "builtin").map((preset: any) => [preset.name, preset.settings.seed]),
      [["x", undefined], ["Blue", 3]],
    );
    assert.equal(presetsFor(doc, "fire/torch", "project").length, 1);
    // What the panel doesn't know stays as it was.
    assert.equal(doc.mine, 1);
    assert.deepEqual(doc.presets[1], { odd: true });
    assert.deepEqual(parsePresets(presetsText(doc)), doc);
    assert.throws(() => withPreset(doc, { name: " ", effect: "fire/torch", source: "builtin", settings: {} }), /1 to 60/);
  });
});
