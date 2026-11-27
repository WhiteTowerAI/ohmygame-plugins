import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

// Turns the project's simulation module (TypeScript or JavaScript, any number
// of files) into one ES module the seed threads import. Bundling runs once per
// run, in its own thread (see bundler-worker.mjs), and the result is written
// to the plugin's data folder, never the project.

export const DEFAULT_ENTRY = "sim/index.ts";
/** Bundles kept in the data folder: each change to the module makes a new one. */
const KEEP_BUNDLES = 5;

/** esbuild's WebAssembly build: copied beside the built entry, or the repository's own package when run from source. */
export function esbuildFiles(): { script: string; wasm: string } {
  const beside = fileURLToPath(new URL("./esbuild/", import.meta.url));
  if (existsSync(path.join(beside, "esbuild.wasm"))) return { script: path.join(beside, "browser.min.js"), wasm: path.join(beside, "esbuild.wasm") };
  const root = path.dirname(createRequire(import.meta.url).resolve("esbuild-wasm/package.json"));
  return { script: path.join(root, "esm", "browser.min.js"), wasm: path.join(root, "esbuild.wasm") };
}

/** The entry inside the project, or an error that says why not. */
export function resolveEntry(project: string, entry = DEFAULT_ENTRY): string {
  const file = path.resolve(project, entry);
  const relative = path.relative(project, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`The simulation module must be inside the project; "${entry}" isn't.`);
  return file;
}

export async function bundle(project: string, entry: string, outFolder: string, signal?: AbortSignal): Promise<{ file: string; url: string }> {
  signal?.throwIfAborted();
  const file = resolveEntry(project, entry);
  if (!existsSync(file)) throw new Error(`There is no ${entry} in this project. The seed-lab skill explains how to split the level generator and solver into one.`);
  const files = esbuildFiles();
  const code = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL("./bundler-worker.mjs", import.meta.url), { workerData: { entry: file, root: project, esbuild: files } });
    const stop = () => {
      void worker.terminate();
      reject(signal?.reason ?? new Error("Stopped"));
    };
    signal?.addEventListener("abort", stop, { once: true });
    worker.once("message", (answer: { code?: string; error?: string }) => {
      signal?.removeEventListener("abort", stop);
      void worker.terminate();
      if (answer.error !== undefined) reject(new Error(`Couldn't bundle ${entry}:\n${answer.error}`));
      else resolve(answer.code!);
    });
    worker.once("error", (error) => {
      signal?.removeEventListener("abort", stop);
      reject(error);
    });
  });
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 16);
  await mkdir(outFolder, { recursive: true });
  const out = path.join(outFolder, `${hash}.mjs`);
  if (!existsSync(out)) {
    const temporary = `${out}.${process.pid}.tmp`;
    await writeFile(temporary, code);
    await rename(temporary, out);
  }
  await prune(outFolder, out);
  return { file: out, url: pathToFileURL(out).href };
}

/** Keeps the newest few bundles, and always the one about to run. */
async function prune(folder: string, keep: string): Promise<void> {
  const bundles = await Promise.all(
    (await readdir(folder))
      .filter((name) => name.endsWith(".mjs"))
      .map(async (name) => ({ file: path.join(folder, name), at: (await stat(path.join(folder, name)).catch(() => undefined))?.mtimeMs ?? 0 })),
  );
  bundles.sort((a, b) => b.at - a.at);
  for (const { file } of bundles.slice(KEEP_BUNDLES)) if (file !== keep) await rm(file, { force: true });
}
