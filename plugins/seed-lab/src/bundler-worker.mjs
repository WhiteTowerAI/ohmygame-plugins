// Bundles a project's simulation module into one ES module, in its own
// thread. It uses esbuild's WebAssembly build in-process: esbuild's Node API
// would start a `node` process to run the wasm, and the app's own Node may
// not be on the PATH. The browser build reads `self`, which is defined here,
// in this thread only, rather than in the host other plugins share.
//
// workerData: { entry, root, esbuild: { script, wasm } }, esbuild being the
// paths of browser.min.js and esbuild.wasm. Posts { code } or { error }.
import { readFile, stat } from "node:fs/promises";
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
const inside = (file) => {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

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
        // A package: resolved from the project's own node_modules.
        try {
          file = createRequire(path.join(args.resolveDir || root, "noop.js")).resolve(args.path);
        } catch {
          file = undefined;
        }
      }
      if (!file) return { errors: [{ text: `Can't find "${args.path}"${args.importer ? ` imported by ${path.relative(root, args.importer)}` : ""}.` }] };
      if (!inside(file)) return { errors: [{ text: `"${args.path}" is outside the project; the simulation module can only use the project's own files.` }] };
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
    sourcemap: "inline",
    sourceRoot: root,
    plugins: [projectFiles],
  });
  parentPort.postMessage({ code: result.outputFiles[0].text });
} catch (error) {
  const messages = error?.errors?.map((item) => (item.location ? `${path.relative(root, item.location.file) || item.location.file}:${item.location.line}: ${item.text}` : item.text));
  parentPort.postMessage({ error: messages?.length ? messages.join("\n") : String(error?.message ?? error) });
}
