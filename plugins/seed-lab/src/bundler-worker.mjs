// Bundles a project's simulation module into one ES module, in its own
// thread. It uses esbuild's WebAssembly build in-process: esbuild's Node API
// would start a `node` process to run the wasm, and the app's own Node may
// not be on the PATH. The browser build reads `self`, which is defined here,
// in this thread only, rather than in the host other plugins share.
//
// workerData: { entry, root, esbuild: { script, wasm } }, esbuild being the
// paths of browser.min.js and esbuild.wasm. Posts { code } or { error }.
import { readFile, realpath, stat } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

const { entry, root, esbuild: files } = workerData;
const LOADERS = { ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx", ".json": "json" };
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx", ".cjs", ".json"];
const builtins = new Set(builtinModules);

const isFile = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};
const realRoot = await realpath(root);
/** Inside the project where the file really is, so a symlink can't reach out. */
const inside = async (file) => {
  const relative = path.relative(realRoot, await realpath(file));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

// Packages resolve as an ES module import does: `exports` with these
// conditions, then `module`, then `main`. CommonJS resolution is the fallback.
const CONDITIONS = ["import", "module", "default", "node", "require"];

/** One `exports` target for a subpath, or undefined. */
function exportTarget(exports, subpath) {
  if (typeof exports === "string" || Array.isArray(exports)) return subpath === "." ? pick(exports) : undefined;
  if (!exports || typeof exports !== "object") return undefined;
  const keys = Object.keys(exports);
  // Conditions at the top: the same as { ".": conditions }.
  if (!keys.some((key) => key.startsWith("."))) return subpath === "." ? pick(exports) : undefined;
  if (exports[subpath] !== undefined) return pick(exports[subpath]);
  for (const key of keys.filter((item) => item.includes("*"))) {
    const [before, after] = key.split("*");
    if (subpath.startsWith(before) && subpath.endsWith(after) && subpath.length >= key.length - 1) {
      const target = pick(exports[key]);
      return target?.replaceAll("*", subpath.slice(before.length, subpath.length - after.length));
    }
  }
  return undefined;
}
function pick(target) {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const item of target) {
      const found = pick(item);
      if (found) return found;
    }
    return undefined;
  }
  if (target && typeof target === "object") for (const key of Object.keys(target)) if (CONDITIONS.includes(key)) {
    const found = pick(target[key]);
    if (found) return found;
  }
  return undefined;
}

async function findPackage(specifier, from) {
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const subpath = `.${specifier.slice(name.length)}`;
  for (let folder = from; ; folder = path.dirname(folder)) {
    // Only the project's own node_modules folders, from the importer up to the project.
    const relative = path.relative(root, folder);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
    const packageFolder = path.join(folder, "node_modules", name);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(packageFolder, "package.json"), "utf8"));
    } catch {
      manifest = undefined;
    }
    if (manifest) {
      if (manifest.exports !== undefined) {
        const target = exportTarget(manifest.exports, subpath);
        return target ? findFile(path.join(packageFolder, target)) : undefined;
      }
      if (subpath !== ".") return findFile(path.join(packageFolder, subpath));
      return findFile(path.join(packageFolder, manifest.module ?? manifest.main ?? "index.js"));
    }
    if (folder === path.dirname(folder)) return undefined;
  }
}

/** A relative import the way bundlers find it: as written, with an extension, or a folder's index. */
async function findFile(base) {
  // TypeScript lets `./rules.js` name `./rules.ts`.
  const swapped = base.replace(/\.(m|c)?js$/, (_, kind) => `.${kind ?? ""}ts`);
  const candidates = [base, ...(swapped !== base ? [swapped] : []), ...EXTENSIONS.map((extension) => base + extension), ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`))];
  for (const candidate of candidates) if (await isFile(candidate)) return candidate;
  return undefined;
}

const projectFiles = {
  name: "project-files",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.path.startsWith("node:") || builtins.has(args.path)) return { path: args.path, external: true };
      let file;
      if (args.kind === "entry-point" || path.isAbsolute(args.path)) file = await findFile(path.resolve(root, args.path));
      else if (args.path.startsWith(".")) file = await findFile(path.resolve(args.resolveDir, args.path));
      else {
        // A package: from the project's own node_modules.
        file = await findPackage(args.path, args.resolveDir || root);
        if (!file) {
          try {
            file = createRequire(path.join(args.resolveDir || root, "noop.js")).resolve(args.path);
          } catch {
            file = undefined;
          }
        }
      }
      if (!file) return { errors: [{ text: `Can't find "${args.path}"${args.importer ? ` imported by ${path.relative(root, args.importer)}` : ""}.` }] };
      if (!(await inside(file))) return { errors: [{ text: `"${args.path}" is outside the project; the simulation module can only use the project's own files.` }] };
      return { path: file };
    });
    build.onLoad({ filter: /.*/ }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: LOADERS[path.extname(args.path)] ?? "js",
      resolveDir: path.dirname(args.path),
    }));
  },
};

try {
  globalThis.self ??= globalThis;
  const esbuild = await import(pathToFileURL(files.script).href);
  await esbuild.initialize({ wasmModule: await WebAssembly.compile(await readFile(files.wasm)), worker: false });
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    logLevel: "silent",
    // Sources relative to the project, under a root the seed threads strip,
    // so an error says "sim/solver.ts:42".
    sourcemap: "inline",
    absWorkingDir: root,
    sourceRoot: "project:///",
    plugins: [projectFiles],
  });
  parentPort.postMessage({ code: result.outputFiles[0].text });
} catch (error) {
  const messages = error?.errors?.map((item) => (item.location ? `${path.relative(root, item.location.file) || item.location.file}:${item.location.line}: ${item.text}` : item.text));
  parentPort.postMessage({ error: messages?.length ? messages.join("\n") : String(error?.message ?? error) });
}
