import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

// The native entry, its two worker threads, and esbuild's WebAssembly build,
// which bundles each project's simulation module in-process. esbuild's own
// license goes beside it.
const output = "plugins/seed-lab/dist";
await rm(output, { recursive: true, force: true });
const result = await build({
  entryPoints: ["plugins/seed-lab/src/index.ts"],
  outdir: output,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  metafile: true,
  legalComments: "eof",
});
for (const input of Object.keys(result.metafile.inputs))
  if (!input.startsWith("plugins/seed-lab/src/")) throw new Error(`The seed-lab entry bundles code from outside its source: ${input}`);
for (const worker of ["bundler-worker.mjs", "seed-worker.mjs"]) await copyFile(`plugins/seed-lab/src/${worker}`, `${output}/${worker}`);
const wasm = "node_modules/esbuild-wasm";
const pkg = JSON.parse(await readFile(`${wasm}/package.json`, "utf8"));
await mkdir(`${output}/esbuild`, { recursive: true });
await copyFile(`${wasm}/esm/browser.min.js`, `${output}/esbuild/browser.min.js`);
await copyFile(`${wasm}/esbuild.wasm`, `${output}/esbuild/esbuild.wasm`);
await writeFile(`${output}/THIRD-PARTY-NOTICES.txt`, `${pkg.name}@${pkg.version}\n${await readFile(`${wasm}/LICENSE.md`, "utf8")}`);
