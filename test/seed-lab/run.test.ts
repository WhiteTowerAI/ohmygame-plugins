import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundle } from "../../plugins/seed-lab/src/bundle.ts";
import { activate, lastRun, MAX_SEEDS, readInput, run, runsFolder } from "../../plugins/seed-lab/src/index.ts";
import { runSeeds } from "../../plugins/seed-lab/src/pool.ts";

// The run end to end against real projects: bundling with esbuild's
// WebAssembly build, threads, time limits, and what is kept.

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));
const ARROWS = fixture("arrow-exit");
const call = () => ({ signal: new AbortController().signal, progress: () => {} });
let data: string;

beforeEach(async () => {
  data = await mkdtemp(path.join(tmpdir(), "seed-lab-"));
});
afterEach(async () => {
  await rm(data, { recursive: true, force: true });
});

describe("bundling the simulation module", () => {
  it("handles enums and extensionless imports, which Node's own TypeScript support can't", async () => {
    const { file, url } = await bundle(ARROWS, "sim/index.ts", data);
    const sim = await import(url);
    const level = sim.generate(3, {});
    expect(level.cells).toHaveLength(25);
    expect(typeof sim.evaluate(level).solvable).toBe("boolean");
    // The same code bundles to the same file.
    expect((await bundle(ARROWS, "sim/index.ts", data)).file).toBe(file);
  }, 30_000);

  it("says what's wrong: no module, a syntax error with its line, a file outside the project", async () => {
    await expect(bundle(ARROWS, "sim/missing.ts", data)).rejects.toThrow(/There is no sim\/missing\.ts in this project/);
    await expect(bundle(ARROWS, "../outside.ts", data)).rejects.toThrow(/must be inside the project/);
    await expect(bundle(fixture("broken"), "sim/index.ts", data)).rejects.toThrow(/sim\/index\.ts:3:/);
    await expect(bundle(fixture("escape"), "sim/index.ts", data)).rejects.toThrow(/outside the project/);
  }, 30_000);

  it("imports packages that are ES modules only, and their subpaths", async () => {
    const sim = await import((await bundle(fixture("with-package"), "sim/index.ts", data)).url);
    expect(sim.generate(3)).toEqual({ value: 2 });
  }, 30_000);

  it("refuses a symlink that leads out of the project", async () => {
    const project = path.join(data, "project");
    await mkdir(path.join(project, "sim"), { recursive: true });
    await writeFile(path.join(data, "secret.ts"), "export const secret = 1;\n");
    await symlink(path.join(data, "secret.ts"), path.join(project, "sim", "secret.ts"));
    await writeFile(path.join(project, "sim", "index.ts"), 'import { secret } from "./secret";\nexport const generate = () => secret;\nexport const evaluate = () => ({ solvable: true });\n');
    await expect(bundle(project, "sim/index.ts", path.join(data, "out"))).rejects.toThrow(/outside the project/);
  }, 30_000);

  it("doesn't start for a cancelled call, and keeps only the newest bundles", async () => {
    const cancelled = new AbortController();
    cancelled.abort(new Error("cancelled"));
    await expect(bundle(ARROWS, "sim/index.ts", data, cancelled.signal)).rejects.toThrow("cancelled");
    const old = new Date(Date.now() - 60_000);
    for (let i = 0; i < 7; i += 1) {
      await writeFile(path.join(data, `old-${i}.mjs`), "");
      await utimes(path.join(data, `old-${i}.mjs`), old, old);
    }
    const { file } = await bundle(ARROWS, "sim/index.ts", data);
    const left = (await readdir(data)).filter((name) => name.endsWith(".mjs"));
    expect(left).toHaveLength(5);
    expect(left).toContain(path.basename(file));
  }, 30_000);
});

describe("running seeds", () => {
  it("gives the same results for the same seeds, however many threads", async () => {
    const { url } = await bundle(ARROWS, "sim/index.ts", data);
    const one = await runSeeds({ bundle: url, from: 100, count: 60, threads: 1 });
    const three = await runSeeds({ bundle: url, from: 100, count: 60, threads: 3 });
    const strip = (results: { ms?: number }[]) => results.map(({ ms, ...rest }) => rest);
    expect(strip(three.results)).toEqual(strip(one.results));
    expect(one.results.map((result) => result.seed)).toEqual(Array.from({ length: 60 }, (_, i) => 100 + i));
  }, 30_000);

  it("records a stuck seed as timed out and a throwing one as an error, and finishes the rest", async () => {
    const { url } = await bundle(ARROWS, "sim/index.ts", data);
    const { results } = await runSeeds({ bundle: url, from: 0, count: 30, threads: 2, timeoutMs: 300, params: { hangSeed: 4, throwSeed: 9 } });
    expect(results[4]).toMatchObject({ seed: 4, timeout: true });
    // The error says where, in the project's own file, through the source map.
    expect(results[9].error).toMatch(/^RangeError: seed 9 is broken on purpose \(sim\/index\.ts:\d+\)$/);
    expect(results.filter((result) => typeof result.solvable === "boolean")).toHaveLength(28);
  }, 30_000);

  it("stops when asked, and says nothing more afterwards", async () => {
    const { url } = await bundle(ARROWS, "sim/index.ts", data);
    const controller = new AbortController();
    let after = 0;
    const running = runSeeds({ bundle: url, from: 0, count: 20, threads: 1, timeoutMs: 600, params: { hangSeed: 0 }, signal: controller.signal, onProgress: () => controller.signal.aborted && (after += 1) });
    setTimeout(() => controller.abort(new Error("cancelled")), 200);
    await expect(running).rejects.toThrow("cancelled");
    // The stuck seed's time limit would have passed by now.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(after).toBe(0);
  }, 30_000);


  it("fails the run at once when the module doesn't export generate and evaluate", async () => {
    const { url } = await bundle(fixture("no-exports"), "sim/index.ts", data);
    await expect(runSeeds({ bundle: url, from: 0, count: 5 })).rejects.toThrow(/must export generate\(seed, params\) and evaluate\(level, params\)/);
  }, 30_000);
});

describe("the native side", () => {
  it("checks its input", () => {
    expect(readInput(undefined)).toEqual({ entry: "sim/index.ts", from: 0, count: 1000, timeoutMs: 5000, params: undefined, difficulty: undefined });
    expect(() => readInput({ count: 0 })).toThrow(/count must be a whole number from 1/);
    expect(() => readInput({ count: MAX_SEEDS + 1 })).toThrow(/count/);
    expect(() => readInput({ from: 1.5 })).toThrow(/from/);
    expect(() => readInput({ params: [1] })).toThrow(/params must be an object/);
    expect(() => readInput({ entry: " " })).toThrow(/entry/);
  });

  it("answers the agent with the report, keeps the run outside the project, and gives the panel the last run", async () => {
    const tools = new Map<string, (input: unknown, call: unknown) => unknown>();
    const commands = new Map<string, (input: unknown, call: unknown) => unknown>();
    activate({
      pluginId: "ohmygame/seed-lab",
      version: "0.1.0",
      project: { folder: ARROWS },
      dataFolder: data,
      registerTool: (name: string, handler: never) => (tools.set(name, handler), { dispose() {} }),
      registerCommand: (name: string, handler: never) => (commands.set(name, handler), { dispose() {} }),
    } as never);
    expect([...tools.keys()]).toEqual(["seedlab_run"]);
    expect([...commands.keys()].sort()).toEqual(["last", "run"]);
    const progress: string[] = [];
    const text = (await tools.get("seedlab_run")!({ count: 200, difficulty: "rounds" }, { ...call(), progress: (message: string) => progress.push(message) })) as string;
    expect(text).toMatch(/^Seed lab: sim\/index\.ts, seeds 0–199 \(200\)/);
    expect(text).toContain("Difficulty buckets by rounds");
    expect(progress[0]).toBe("Bundling sim/index.ts");
    expect(progress.at(-1)).toBe("200 of 200 seeds");
    const last = (await commands.get("last")!(undefined, call())) as Awaited<ReturnType<typeof lastRun>>;
    expect(last).toMatchObject({ version: 1, entry: "sim/index.ts", count: 200, summary: { total: 200 } });
    const lines = (await readFile(last!.file!, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(200);
    expect(path.relative(ARROWS, last!.file!).startsWith("..")).toBe(true);
  }, 60_000);

  it("keeps the last ten runs", async () => {
    const scoped = { dataFolder: data, project: { folder: ARROWS } };
    for (let i = 0; i < 12; i += 1) await run(scoped, { from: i, count: 2 }, call(), { threads: 1 });
    const files = await readdir(runsFolder(data, ARROWS));
    expect(files.filter((name) => name.endsWith(".json"))).toHaveLength(10);
    expect(files.filter((name) => name.endsWith(".jsonl"))).toHaveLength(10);
    expect((await lastRun(runsFolder(data, ARROWS)))?.from).toBe(11);
  }, 60_000);
});

describe("the built plugin", () => {
  const dist = fileURLToPath(new URL("../../plugins/seed-lab/dist/", import.meta.url));

  it("runs from dist with its own copy of esbuild, and stays well inside the 50 MiB package limit", async () => {
    const entry = path.join(dist, "index.mjs");
    const built = await import(entry);
    const scoped = { dataFolder: data, project: { folder: ARROWS } };
    const saved = await built.run(scoped, { count: 50 }, call());
    expect(saved.summary.total).toBe(50);
    let bytes = 0;
    for (const name of await readdir(dist, { recursive: true })) {
      const info = await stat(path.join(dist, name));
      if (info.isFile()) bytes += info.size;
    }
    expect(bytes).toBeLessThan(20 * 1024 * 1024);
    expect(await readFile(path.join(dist, "THIRD-PARTY-NOTICES.txt"), "utf8")).toMatch(/^esbuild-wasm@0\.28\.2\nMIT License/);
  }, 60_000);
});
