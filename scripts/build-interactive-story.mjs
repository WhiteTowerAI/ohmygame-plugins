import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// The story runtime a new story carries under `story/`, built from
// `plugins/interactive-story/runtime/` into the template. Each module is one
// source file with its types removed and its comments kept, so the Agent can
// read and change it like any project code. `--check` fails when the template
// doesn't match the source instead of writing it.
const plugin = "plugins/interactive-story";
const source = `${plugin}/runtime`;
const output = `${plugin}/templates/story/story`;
const check = process.argv.includes("--check");

const { metafile } = await build({
  entryPoints: [`${source}/story-web/runtime.ts`],
  bundle: true,
  format: "esm",
  write: false,
  metafile: true,
});
const modules = {};
for (const input of Object.keys(metafile.inputs)) {
  if (!input.startsWith(`${source}/`)) throw new Error(`The story runtime imports code from outside its source: ${input}`);
  const relative = path.relative(source, input).replace(/\.ts$/, ".js");
  modules[relative] = ts.transpileModule(await readFile(input, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

if (check) {
  const stale = [];
  for (const [relative, content] of Object.entries(modules)) {
    const current = await readFile(path.join(output, relative), "utf8").catch(() => undefined);
    if (current !== content) stale.push(relative);
  }
  if (stale.length) throw new Error(`The template's story runtime is out of date (${stale.join(", ")}). Run npm run build:interactive-story.`);
} else {
  await rm(output, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(modules)) {
    await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await writeFile(path.join(output, relative), content);
  }
  console.log(`Built ${Object.keys(modules).length} story runtime modules.`);
}
