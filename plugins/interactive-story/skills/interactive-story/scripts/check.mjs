#!/usr/bin/env node
// Checks the story in the current folder: node check.mjs [--publish]
//
// graph.json's references (Start, Exits, connections, Assets, Variables), each
// Scene's files and what they import by relative path, and the page's story
// ID. With --publish, every Exit that isn't navigation must be connected and
// the story must have a Scene. Reads only; exits with 1 when it finds issues.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const project = process.cwd();
const publish = process.argv.includes("--publish");
const issues = [];
const issue = (where, message) => issues.push(`${where}: ${message}`);

let graph;
try {
  graph = JSON.parse(await readFile(path.join(project, "graph.json"), "utf8"));
} catch (cause) {
  console.error(`graph.json can't be read: ${cause.message}`);
  process.exit(1);
}

for (const key of ["nodes", "edges"]) if (!Array.isArray(graph[key])) issue("graph.json", `${key} must be a list.`);
if (!graph.assets || typeof graph.assets !== "object") issue("graph.json", "assets must be an object.");
if (!graph.initialState || typeof graph.initialState !== "object" || Array.isArray(graph.initialState)) issue("graph.json", "initialState must be an object.");
if (issues.length) finish();

for (const name of Object.keys(graph.variables ?? {})) {
  if (!Object.hasOwn(graph.initialState, name)) issue(`variables.${name}`, "is described but has no starting value in initialState.");
}

const scenes = new Map();
for (const node of graph.nodes) {
  if (scenes.has(node.id)) issue(`Scene ${node.id}`, "its ID is used twice.");
  scenes.set(node.id, node);
}
if (!graph.nodes.length) {
  if (publish) issue("graph.json", "the story has no Scenes.");
} else if (!scenes.has(graph.entryNodeId)) {
  issue("entryNodeId", `the Start "${graph.entryNodeId}" is not a Scene.`);
}

for (const [id, asset] of Object.entries(graph.assets)) {
  if (asset?.source?.kind === "workspace" && !(await exists(asset.source.path))) issue(`Asset ${id}`, `${asset.source.path} doesn't exist.`);
}

const edgeIds = new Set();
const routed = new Set();
for (const edge of graph.edges) {
  if (edgeIds.has(edge.id)) issue(`connection ${edge.id}`, "its ID is used twice.");
  edgeIds.add(edge.id);
  const source = scenes.get(edge.source?.nodeId);
  if (!source) issue(`connection ${edge.id}`, `leaves from "${edge.source?.nodeId}", which is not a Scene.`);
  else if (!source.signals.some((signal) => signal.id === edge.source.signal)) issue(`connection ${edge.id}`, `leaves from Exit "${edge.source.signal}", which ${edge.source.nodeId} doesn't declare.`);
  if (!scenes.has(edge.targetNodeId)) issue(`connection ${edge.id}`, `goes to "${edge.targetNodeId}", which is not a Scene.`);
  if (edge.mode !== "replace" && edge.mode !== "push") issue(`connection ${edge.id}`, 'mode must be "replace" or "push".');
  const key = `${edge.source?.nodeId}\0${edge.source?.signal}`;
  if (routed.has(key)) issue(`connection ${edge.id}`, `Exit ${edge.source.nodeId}.${edge.source.signal} has more than one connection.`);
  routed.add(key);
}

const checked = new Set();
for (const node of graph.nodes) {
  const where = `Scene ${node.id}`;
  const exits = new Set();
  for (const signal of node.signals ?? []) {
    if (exits.has(signal.id)) issue(where, `Exit "${signal.id}" is declared twice.`);
    exits.add(signal.id);
    if (publish && signal.role !== "navigation" && !routed.has(`${node.id}\0${signal.id}`)) issue(where, `Exit "${signal.id}" must be connected before publishing.`);
  }
  for (const asset of node.assets ?? []) if (!Object.hasOwn(graph.assets, asset)) issue(where, `uses Asset "${asset}", which graph.json doesn't declare.`);
  for (const kind of ["html", "css", "javascript"]) {
    const file = node.source?.[kind];
    if (!file || !(await exists(file))) issue(where, `its ${kind} file ${file ?? ""} doesn't exist.`);
  }
  if (node.source?.javascript && await exists(node.source.javascript)) {
    const code = await readFile(path.join(project, node.source.javascript), "utf8");
    if (!/export\s+(async\s+)?function\s+mount\b|export\s*\{[^}]*\bmount\b/.test(code)) issue(where, `${node.source.javascript} must export a mount function.`);
    await imports(node.source.javascript, where);
  }
  if (node.source?.css && await exists(node.source.css)) await imports(node.source.css, where);
}

const page = await readFile(path.join(project, "index.html"), "utf8").catch(() => undefined);
if (page === undefined) issue("index.html", "the page that plays the story is missing.");
else if (!/name="ohmygame-story" content="[^"]+"/.test(page)) issue("index.html", 'the ohmygame-story meta tag needs a story ID, such as a new UUID, so players\' saves are this story\'s own.');

finish();

/** Follows a module's or stylesheet's relative imports the way the page loads them. */
async function imports(file, where) {
  if (checked.has(file)) return;
  checked.add(file);
  const text = await readFile(path.join(project, file), "utf8");
  const found = file.endsWith(".css")
    ? [...text.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)].map((match) => match[1])
    : [...text.matchAll(/(?:^|[;\s])(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|[;\s])import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
      .map((match) => match[1] ?? match[2] ?? match[3]);
  for (const specifier of found) {
    if (/^[a-z]+:/i.test(specifier) || specifier.startsWith("//")) continue;
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      issue(where, `${file} imports "${specifier}", which a browser can't load without a bundler. Import project files by relative path.`);
      continue;
    }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.split(/[?#]/)[0]));
    if (target.startsWith("..")) issue(where, `${file} imports ${specifier}, outside the project.`);
    else if (!(await exists(target))) issue(where, `${file} imports ${specifier}, which doesn't exist.`);
    else if (/\.(m?js|css)$/.test(target)) await imports(target, where);
  }
}

async function exists(file) {
  return stat(path.join(project, file)).then((info) => info.isFile(), () => false);
}

function finish() {
  if (!issues.length) {
    console.log(`The story passes the ${publish ? "publish" : "draft"} check.`);
    process.exit(0);
  }
  console.log(`The story has ${issues.length} ${issues.length === 1 ? "issue" : "issues"}:`);
  for (const line of issues) console.log(`- ${line}`);
  process.exit(1);
}
