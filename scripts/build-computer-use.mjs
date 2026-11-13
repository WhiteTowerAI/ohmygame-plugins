import { build } from "esbuild";

await build({
  entryPoints: ["plugins/computer-use/src/index.ts"],
  outfile: "plugins/computer-use/dist/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
