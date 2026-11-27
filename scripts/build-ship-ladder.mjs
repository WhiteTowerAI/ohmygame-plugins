import { build } from "esbuild";
import { rm } from "node:fs/promises";

// The native entry, bundled: it imports only Node's own modules, and the app's
// types, which go away in the build.
const output = "plugins/ship-ladder/dist";
await rm(output, { recursive: true, force: true });
const result = await build({
  entryPoints: ["plugins/ship-ladder/src/index.ts"],
  outdir: output,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  metafile: true,
});
const external = Object.keys(result.metafile.inputs).filter((input) => !input.startsWith("plugins/ship-ladder/src/"));
if (external.length) throw new Error(`The ship-ladder entry bundles code from outside its source: ${external.join(", ")}`);
