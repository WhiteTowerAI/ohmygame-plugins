#!/usr/bin/env node
// Measures a WeChat or Douyin mini-game build's packages right after building,
// against the platform's limits, and suggests what could move into subpackages.
//
//   node size-check.mjs <build folder> [--platform wechat|douyin] [--virtual-payment] [--json]
//
// The folder is the engine's mini-game output, with game.json at its top. The
// platform is read from project.config.json's appid (wx… or tt…) unless given.
//
// Limits (from each platform's code-package docs):
// - WeChat: main package 4 MB, each independent subpackage 4 MB, all packages 30 MB.
// - Douyin: main package 4 MB; each subpackage and all packages 20 MB (30 MB once
//   virtual payment is on, --virtual-payment); with no subpackages, the game 20 MB.
// An engine plugin game.json declares (such as Cocos' engine plugin) still
// counts toward the main package; only its plugin.json and signature.json don't.
// Dotfiles and Markdown files are left out; the developer tool decides exactly
// which files it uploads, and its size report, on preview and upload, is the
// one that counts. This only tells you sooner.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MB = 1024 * 1024;
export const LIMITS = {
  wechat: { main: 4 * MB, independent: 4 * MB, subpackage: undefined, total: 30 * MB, single: undefined },
  douyin: { main: 4 * MB, independent: undefined, subpackage: 20 * MB, total: 20 * MB, single: 20 * MB },
  douyinVirtualPayment: { main: 4 * MB, independent: undefined, subpackage: 30 * MB, total: 30 * MB, single: 20 * MB },
};
const PROJECT_FILES = new Set(["project.config.json", "project.private.config.json", "project.tt.json"]);
const PLUGIN_META = new Set(["plugin.json", "signature.json"]);
const ENTRY_FILES = new Set(["game.js", "game.json"]);

async function walk(root, folder = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await walk(root, relative)));
    else if (entry.isFile() && !/\.md$/i.test(entry.name)) files.push({ path: relative, bytes: (await stat(path.join(root, relative))).size });
  }
  return files;
}

const clean = (folder) => String(folder ?? "").replace(/^\.?\/+/, "").replace(/\/+$/, "");
const under = (file, root) => Boolean(root) && (file === root || file.startsWith(`${root}/`));

async function detectPlatform(root) {
  for (const name of ["project.config.json", "project.tt.json"]) {
    try {
      const appid = JSON.parse(await readFile(path.join(root, name), "utf8")).appid ?? "";
      if (/^tt/.test(appid)) return "douyin";
      if (/^wx/.test(appid)) return "wechat";
    } catch {
      // Not there, or not readable.
    }
  }
  return "wechat";
}

export async function sizeCheck(root, { platform, virtualPayment = false } = {}) {
  const which = platform ?? (await detectPlatform(root));
  const limits = which === "douyin" ? (virtualPayment ? LIMITS.douyinVirtualPayment : LIMITS.douyin) : LIMITS.wechat;
  const config = JSON.parse(await readFile(path.join(root, "game.json"), "utf8"));
  const subpackages = (config.subpackages ?? config.subPackages ?? [])
    .map((item) => ({ name: item.name ?? clean(item.root), root: clean(item.root), independent: Boolean(item.independent), bytes: 0, files: 0 }))
    .filter((item) => item.root);
  const plugins = Object.entries(config.plugins ?? {})
    .map(([name, plugin]) => ({ name, root: clean(plugin?.path), bytes: 0, files: 0 }))
    .filter((plugin) => plugin.root);
  const openData = clean(config.openDataContext);
  const files = (await walk(root)).filter((file) => !PROJECT_FILES.has(file.path));

  const main = [];
  for (const file of files) {
    const plugin = plugins.find((item) => under(file.path, item.root));
    if (plugin && PLUGIN_META.has(path.posix.basename(file.path))) continue;
    const subpackage = !plugin && subpackages.find((item) => under(file.path, item.root));
    if (subpackage) {
      subpackage.bytes += file.bytes;
      subpackage.files += 1;
      continue;
    }
    if (plugin) {
      plugin.bytes += file.bytes;
      plugin.files += 1;
    }
    main.push({ ...file, plugin: plugin?.name });
  }
  const mainBytes = main.reduce((sum, file) => sum + file.bytes, 0);
  const total = mainBytes + subpackages.reduce((sum, item) => sum + item.bytes, 0);
  const mainLimit = which === "douyin" && !subpackages.length ? limits.single : limits.main;
  for (const item of subpackages) {
    item.limit = item.independent ? limits.independent : limits.subpackage;
    item.over = item.limit !== undefined && item.bytes > item.limit;
  }

  // What could leave the main package: asset folders, never the entry, an
  // engine plugin, the engine's own scripts or the open-data context. Inside
  // assets/, a bundle (assets/<bundle>) is what moves.
  const fixed = (file) => ENTRY_FILES.has(file.path) || file.plugin || under(file.path, openData) || /^(cocos-js|cocos|src|libs|adapter|engine)(\/|$)/.test(file.path);
  const folders = new Map();
  for (const file of main) {
    if (fixed(file) || !file.path.includes("/")) continue;
    const parts = file.path.split("/");
    const folder = parts[0] === "assets" && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    if (folder === "assets/main" || folder === "assets/internal") continue;
    folders.set(folder, (folders.get(folder) ?? 0) + file.bytes);
  }
  const over = Math.max(0, mainBytes - mainLimit);
  const suggestions = [];
  if (over) {
    let moved = 0;
    for (const [folder, bytes] of [...folders].sort((a, b) => b[1] - a[1])) {
      if (moved >= over) break;
      suggestions.push({ folder, bytes });
      moved += bytes;
    }
  }
  return {
    platform: which,
    virtualPayment: which === "douyin" && virtualPayment,
    main: { bytes: mainBytes, limit: mainLimit, over: mainBytes > mainLimit, largest: [...main].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map(({ path: file, bytes }) => ({ path: file, bytes })) },
    total: { bytes: total, limit: limits.total, over: total > limits.total },
    subpackages: subpackages.map(({ name, root: folder, independent, bytes, files: count, limit, over: isOver }) => ({ name, root: folder, independent, bytes, files: count, limit, over: isOver })),
    enginePlugins: plugins.map(({ name, root: folder, bytes, files: count }) => ({ name, root: folder, bytes, files: count })),
    suggestions,
  };
}

const mb = (bytes) => `${(bytes / MB).toFixed(2)} MB`;

export function describe(result) {
  const tool = result.platform === "douyin" ? "Douyin's developer tool" : "WeChat DevTools";
  const lines = [
    `${tool} reports package sizes when previewing and uploading; its numbers count. This only tells you sooner.`,
    `Platform: ${result.platform === "douyin" ? `Douyin${result.virtualPayment ? " (virtual payment on)" : ""}` : "WeChat"}`,
    `Main package: ${mb(result.main.bytes)} of ${mb(result.main.limit)}${result.main.over ? " — OVER" : ""}`,
    `All packages: ${mb(result.total.bytes)} of ${mb(result.total.limit)}${result.total.over ? " — OVER" : ""}`,
  ];
  for (const item of result.subpackages)
    lines.push(`  ${item.independent ? "Independent subpackage" : "Subpackage"} ${item.name} (${item.root}): ${mb(item.bytes)}, ${item.files} files${item.limit ? ` of ${mb(item.limit)}${item.over ? " — OVER" : ""}` : ""}`);
  for (const item of result.enginePlugins) lines.push(`  Engine plugin ${item.name} (${item.root}/): ${mb(item.bytes)}, counted in the main package`);
  if (result.main.largest.length) {
    lines.push("Largest files in the main package:");
    for (const file of result.main.largest.slice(0, 5)) lines.push(`  ${mb(file.bytes)}  ${file.path}`);
  }
  if (result.suggestions.length) {
    lines.push("To get under the limit, consider moving these into subpackages (in the engine's build settings; load a subpackage before using it):");
    for (const item of result.suggestions) lines.push(`  ${item.folder}/ (${mb(item.bytes)})`);
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const folder = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--platform");
  const platform = args.includes("--platform") ? args[args.indexOf("--platform") + 1] : undefined;
  if (!folder || (platform && !["wechat", "douyin"].includes(platform))) {
    console.error("Usage: node size-check.mjs <mini-game build folder> [--platform wechat|douyin] [--virtual-payment] [--json]");
    process.exit(2);
  }
  const result = await sizeCheck(path.resolve(folder), { platform, virtualPayment: args.includes("--virtual-payment") });
  console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : describe(result));
  process.exit(result.main.over || result.total.over || result.subpackages.some((item) => item.over) ? 1 : 0);
}
