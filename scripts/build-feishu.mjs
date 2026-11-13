import { build } from "esbuild";
import { readFile, writeFile, readdir, rm } from "node:fs/promises";

const output = "plugins/feishu/dist/index.mjs";
await rm("plugins/feishu/dist", { recursive: true, force: true });
const result = await build({
  entryPoints: ["plugins/feishu/src/index.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  mainFields: ["module", "main"],
  minify: true,
  metafile: true,
  legalComments: "eof",
  banner: {
    js: 'import { createRequire } from "node:module"; import { fileURLToPath } from "node:url"; import { dirname } from "node:path"; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);',
  },
});
const packages = new Set(
  Object.keys(result.metafile.inputs).flatMap((input) => {
    if (!input.startsWith("node_modules/")) return [];
    const segments = input.split("/");
    return [segments.slice(0, segments[1].startsWith("@") ? 3 : 2).join("/")];
  }),
);
const notices = [];
for (const folder of [...packages].sort()) {
  const pkg = JSON.parse(await readFile(`${folder}/package.json`, "utf8"));
  let license;
  // Preserve the actual filename: macOS accepts LICENSE for License, Linux does not.
  const licenseFile = (await readdir(folder, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && /^licen[cs]e(?:[-.].*)?$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()[0];
  if (licenseFile) license = await readFile(`${folder}/${licenseFile}`, "utf8");
  if (!license && ["agent-base", "https-proxy-agent"].includes(pkg.name)) {
    const readme = await readFile(`${folder}/README.md`, "utf8");
    license = readme.slice(readme.indexOf("(The MIT License)"));
    if (!license.includes("Permission is hereby granted"))
      throw new Error(`${pkg.name} license changed`);
  }
  if (!license)
    throw new Error(`Missing bundled dependency license: ${pkg.name}`);
  notices.push(`${pkg.name}@${pkg.version}\n${license}`);
}
await writeFile(
  "plugins/feishu/dist/THIRD-PARTY-NOTICES.txt",
  notices.join("\n\n---\n\n"),
);
