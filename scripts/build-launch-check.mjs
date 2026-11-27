import { build } from "esbuild";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";

// The native entry, bundled with the one package it reads modules with,
// es-module-lexer, whose license goes beside it.
const output = "plugins/launch-check/dist";
const allowed = ["es-module-lexer"];
await rm(output, { recursive: true, force: true });
const result = await build({
  entryPoints: ["plugins/launch-check/src/index.ts"],
  outdir: output,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  metafile: true,
  legalComments: "eof",
});
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  if (input.startsWith("plugins/launch-check/src/")) continue;
  const name = input.startsWith("node_modules/") ? input.split("/")[1] : undefined;
  if (!name || !allowed.includes(name)) throw new Error(`The launch-check entry bundles code from outside its source: ${input}`);
  packages.add(name);
}
const notices = [];
for (const name of [...packages].sort()) {
  const folder = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${folder}/package.json`, "utf8"));
  const licenseFile = (await readdir(folder)).filter((file) => /^licen[cs]e(?:[-.].*)?$/i.test(file)).sort()[0];
  if (!licenseFile) throw new Error(`Missing bundled dependency license: ${name}`);
  notices.push(`${pkg.name}@${pkg.version}\n${await readFile(`${folder}/${licenseFile}`, "utf8")}`);
}
await writeFile(`${output}/THIRD-PARTY-NOTICES.txt`, notices.join("\n\n---\n\n"));
