#!/usr/bin/env node
// Adds a Scene to the story in the current folder from one of this Skill's
// starters: node add-scene.mjs <starter> <id> [title]
//
// Writes nodes/<id>/ from scenes/<starter>/, adds the Scene to graph.json with
// the starter's Exits, and copies the shared files the starter uses when the
// project doesn't have them. The first Scene becomes the Start. A story whose
// page has no story ID gets one, so players' saves are its own.
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SCENES = path.join(import.meta.dirname, "..", "scenes");
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const [starter, id, ...rest] = process.argv.slice(2);
const project = process.cwd();
const starters = (await readdir(SCENES, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

if (!starter || !id) fail(`Usage: node add-scene.mjs <starter> <id> [title]\nStarters: ${starters.join(", ")}`);
if (!starters.includes(starter)) fail(`Unknown starter "${starter}". Starters: ${starters.join(", ")}`);
if (!ID.test(id)) fail(`Invalid Scene ID "${id}". Use letters, digits, dots, dashes and underscores, starting with a letter or digit.`);

const graphFile = path.join(project, "graph.json");
const graph = JSON.parse(await readFile(graphFile, "utf8").catch(() => fail("No graph.json here. Run this from the story's project folder.")));
if (graph.nodes.some((node) => node.id === id)) fail(`Scene "${id}" already exists.`);
const folder = path.join(SCENES, starter);
const meta = JSON.parse(await readFile(path.join(folder, "scene.json"), "utf8"));
const title = (rest.join(" ").trim() || nextTitle(graph.nodes)).slice(0, 120);
const shown = rest.length ? title : meta.label;

const written = [];
for (const name of await readdir(folder)) {
  if (name === "scene.json" || name === "project") continue;
  const target = `nodes/${id}/${name}`;
  let text = (await readFile(path.join(folder, name), "utf8")).replaceAll("{{id}}", id);
  if (name === "index.html") text = text.replaceAll("{{title}}", escapeHtml(shown));
  await put(target, text);
  written.push(target);
}
for (const file of await files(path.join(folder, "project"))) {
  if (await exists(path.join(project, file))) continue;
  await mkdir(path.dirname(path.join(project, file)), { recursive: true });
  await copyFile(path.join(folder, "project", file), path.join(project, file));
  written.push(file);
}

graph.nodes.push({
  id,
  title,
  source: { html: `nodes/${id}/index.html`, css: `nodes/${id}/style.css`, javascript: `nodes/${id}/node.js` },
  assets: [],
  signals: meta.signals,
});
if (!graph.nodes.some((node) => node.id === graph.entryNodeId)) graph.entryNodeId = graph.nodes[0].id;
await writeFile(graphFile, `${JSON.stringify(graph, null, 2)}\n`);

const page = await readFile(path.join(project, "index.html"), "utf8").catch(() => undefined);
if (page?.includes('name="ohmygame-story" content=""')) {
  await writeFile(path.join(project, "index.html"), page.replace('name="ohmygame-story" content=""', `name="ohmygame-story" content="${randomUUID()}"`));
}

console.log([
  `Added Scene "${id}" (${title}) from the ${starter} starter.`,
  `Files: ${written.join(", ")}`,
  `Exits: ${meta.signals.map((signal) => signal.id).join(", ") || "none"}`,
  meta.brief,
].join("\n"));

function nextTitle(nodes) {
  const taken = new Set(nodes.map((node) => node.title));
  for (let number = nodes.length + 1; ; number += 1) if (!taken.has(`Scene ${number}`)) return `Scene ${number}`;
}

async function put(file, text) {
  await mkdir(path.dirname(path.join(project, file)), { recursive: true });
  await writeFile(path.join(project, file), text);
}

async function files(directory, prefix = "") {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await files(directory, relative));
    else found.push(relative);
  }
  return found;
}

async function exists(file) {
  return stat(file).then(() => true, () => false);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
