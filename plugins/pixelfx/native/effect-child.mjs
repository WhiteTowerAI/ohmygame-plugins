// Runs one project effect for runProjectEffect, in a process that may read
// only its copy of the project's effects and the plugin: reads
// `{ copy, id, text, flip, seed?, render }` on stdin and writes
// `{ check, sheet? }` on fd 3, the sheet's PNG as base64, leaving stdout to
// whatever the effect logs.

import { createWriteStream } from "node:fs";
import { checkLoaded, loadEffectFrom, renderSheet, sheetConfig } from "./render.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { copy, id, text, flip, seed, render } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const loaded = await loadEffectFrom(copy, id);
const check = checkLoaded({ ...loaded, text });
let sheet;
if (loaded.fx && check.ok && render) {
  const { png, ...rest } = renderSheet(loaded.fx, sheetConfig(loaded.fx, { flip, seed }));
  sheet = { ...rest, png: png.toString("base64") };
}
const answer = createWriteStream(null, { fd: 3 });
answer.end(JSON.stringify({ check, ...(sheet ? { sheet } : {}) }));
