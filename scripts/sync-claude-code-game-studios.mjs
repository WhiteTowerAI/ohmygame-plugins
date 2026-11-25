#!/usr/bin/env node
// Replaces plugins/claude-code-game-studios/template with a release of
// Donchitos/Claude-Code-Game-Studios, as cloning it would give, less the
// files about developing the template itself.
//
//   node scripts/sync-claude-code-game-studios.mjs v1.3.0
//
// Then read the diff, hooks and scripts included, raise `version` in the
// plugin's package.json and plugin.json, and open a PR.

import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { x as extract } from "tar";

const REPOSITORY = "Donchitos/Claude-Code-Game-Studios";
const PLUGIN = fileURLToPath(new URL("../plugins/claude-code-game-studios/", import.meta.url));
/** About developing the template, not using it. */
const LEFT_OUT = [".github", "CONTRIBUTING.md", "SECURITY.md"];

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("Usage: node scripts/sync-claude-code-game-studios.mjs vX.Y.Z");
  process.exit(1);
}

const github = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "ohmygame-plugins" } });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response;
};

const { sha: commit } = await (await github(`https://api.github.com/repos/${REPOSITORY}/commits/${tag}`)).json();
const scratch = await mkdtemp(path.join(tmpdir(), "ccgs-"));
try {
  const source = path.join(scratch, "source");
  await mkdir(source);
  const archive = await github(`https://codeload.github.com/${REPOSITORY}/tar.gz/${commit}`);
  await pipeline(
    Readable.fromWeb(archive.body),
    // Only files and folders: a template may hold nothing else.
    extract({ cwd: source, strip: 1, filter: (_path, entry) => entry.type === "File" || entry.type === "Directory" }),
  );
  for (const item of LEFT_OUT) await rm(path.join(source, item), { recursive: true, force: true });
  // npm leaves .gitignore out; OhMyGame gives a template's `gitignore` its name back.
  await renameGitignores(source);

  const template = path.join(PLUGIN, "template");
  await rm(template, { recursive: true, force: true });
  await cp(source, template, { recursive: true });
  await writeFile(path.join(PLUGIN, "NOTICE.md"), notice(commit));
  console.log(`template/ is ${REPOSITORY} ${tag} (${commit}).`);
  console.log("Read the diff, then raise version in package.json and .ohmygame-plugin/plugin.json.");
} finally {
  await rm(scratch, { recursive: true, force: true });
}

async function renameGitignores(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const at = path.join(directory, item.name);
    if (item.isDirectory()) await renameGitignores(at);
    else if (item.name === ".gitignore") await rename(at, path.join(directory, "gitignore"));
  }
}

function notice(sha) {
  return `# Notice

\`template/\` is [Claude Code Game Studios](https://github.com/${REPOSITORY})
by Donchitos, release ${tag} (commit \`${sha}\`), under the MIT license in
\`template/LICENSE\`. It is copied as released, except:

- left out, as they're about developing the template: ${LEFT_OUT.map((item) => `\`${item}\``).join(", ")};
- each \`.gitignore\` is named \`gitignore\`, since npm leaves \`.gitignore\` out
  of packages; OhMyGame names it back when it installs the plugin.

Made with \`scripts/sync-claude-code-game-studios.mjs\` in
[ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
`;
}
