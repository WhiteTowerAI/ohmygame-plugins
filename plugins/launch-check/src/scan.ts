import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { init, parse } from "es-module-lexer";

// Reads a game's web build, the folder a static host serves, and says what a
// player downloads first, what loads later, what nothing names, and the paths
// and requests that break once the game is hosted somewhere else. It only
// reads files; it never runs the game.

/** How a finding's kind reads in the report. */
export type FindingKind =
  | "absolute-path" // a reference starting with "/", which breaks when the game is served from a subfolder
  | "external-request" // a file or font fetched from another site
  | "insecure-request" // the same over http://
  | "missing-file" // a reference to a file the build doesn't have
  | "case-mismatch" // a reference that only matches a file with different capitals
  | "bare-import" // an import of a package name, which a browser can't load without an import map
  | "unreferenced" // a file no other file names
  | "source-map"; // a .map file shipped with the game

export interface Finding {
  kind: FindingKind;
  /** The file the problem is in, relative to the build, with "/" separators. */
  file: string;
  /** What it names, or for unreferenced files and source maps, the file itself. */
  target: string;
  bytes?: number;
}

export interface Part {
  files: string[];
  /** Bytes on disk. */
  bytes: number;
  /** Bytes a player downloads: text compressed as a host gzips it, media as it is. */
  transfer: number;
}

export interface ScanResult {
  version: 1;
  files: number;
  bytes: number;
  transfer: number;
  hasIndex: boolean;
  longestPath: { path: string; length: number };
  largest: { path: string; bytes: number }[];
  /** The page and what it loads before anything else runs: its scripts, their static imports, styles and what those name. */
  entry: Part;
  /** Files only the entry's code or data files name, which a game usually loads before play starts. */
  named: Part;
  /** Code split off behind dynamic import(), and what only it names. */
  lazy: Part;
  /** Files nothing names by path or file name. They may still be loaded by a name built at run time. */
  unreferenced: Part;
  findings: Finding[];
  /** Findings left out of `findings` per kind, beyond the first 50 of each. */
  omitted: Partial<Record<FindingKind, number>>;
  externalHosts: string[];
}

const MAX_FINDINGS = 50;
const MAX_GZIP = 32 * 1024 * 1024;

const SCRIPT = new Set([".js", ".mjs", ".cjs"]);
const STYLE = new Set([".css"]);
const HTML = new Set([".html", ".htm"]);
/** Files a game's code or data may name others in. */
const TEXT = new Set([
  ...SCRIPT, ...STYLE, ...HTML,
  ".json", ".txt", ".xml", ".svg", ".atlas", ".fnt", ".tmj", ".tsj", ".tmx", ".tsx", ".plist", ".csv", ".yaml", ".yml", ".gltf", ".webmanifest", ".ldtk",
]);
/** Files a host compresses on the way; media is already compressed. */
const COMPRESSIBLE = new Set([...TEXT, ".wasm", ".map"]);

/** Hosts a game's code names that are fetched at run time: fonts, CDNs and trackers. */
const KNOWN_HOSTS = [
  "fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "esm.sh",
  "cdn.skypack.dev", "ajax.googleapis.com", "www.googletagmanager.com", "www.google-analytics.com", "connect.facebook.net",
  "use.typekit.net", "kit.fontawesome.com", "cdn.tailwindcss.com", "www.gstatic.com",
];
const HOST_PATTERN = new RegExp(`(?:https?:)?//(${KNOWN_HOSTS.map((host) => host.replaceAll(".", "\\.")).join("|")})(?=[/"'\`?#])`, "g");

const extension = (file: string) => path.posix.extname(file).toLowerCase();

async function walk(root: string, folder = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, folder), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    // A link could point anywhere on the computer; a host wouldn't serve it.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...(await walk(root, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

type Ref =
  | { type: "local"; path: string; absolute: boolean }
  | { type: "external"; url: string; host: string; secure: boolean }
  | { type: "bare"; name: string }
  | { type: "outside" }
  | { type: "ignored" };

/** Where a reference in `from` points, `from` and the result relative to the build. */
export function resolveRef(from: string, raw: string, { code = false } = {}): Ref {
  const ref = raw.trim();
  if (!ref || ref.startsWith("#") || /^(?:data|blob|javascript|about|mailto|tel):/i.test(ref)) return { type: "ignored" };
  const external = /^(https?:)?\/\/([^/?#:]+)/i.exec(ref);
  if (external) return { type: "external", url: ref, host: external[2]!.toLowerCase(), secure: external[1]?.toLowerCase() !== "http:" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return { type: "ignored" };
  const bare = ref.replace(/[?#].*$/, "");
  if (!bare) return { type: "ignored" };
  if (code && !/^(?:\.{1,2}\/|\/)/.test(bare)) return { type: "bare", name: bare };
  let decoded = bare;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // Keep it as written.
  }
  const absolute = decoded.startsWith("/");
  const joined = absolute ? path.posix.normalize(decoded.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded));
  if (joined === ".." || joined.startsWith("../") || joined === ".") return { type: "outside" };
  return { type: "local", path: joined, absolute };
}

const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attributes(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) values.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  return values;
}

interface HtmlRefs {
  /** References a page loads as it opens, with how. */
  loads: { ref: string; kind: "script" | "style" | "asset" }[];
  /** References to other sites that the page only connects to, such as preconnect. */
  connects: string[];
  inlineScripts: string[];
  inlineStyles: string[];
}

const LOADING_LINKS = new Set(["stylesheet", "modulepreload", "preload", "icon", "shortcut", "apple-touch-icon", "manifest", "prefetch"]);
const CONNECTING_LINKS = new Set(["preconnect", "dns-prefetch"]);

export function htmlRefs(html: string): HtmlRefs {
  const result: HtmlRefs = { loads: [], connects: [], inlineScripts: [], inlineStyles: [] };
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const match of withoutComments.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const tag = match[1]!.toLowerCase();
    const attrs = attributes(match[2]!);
    if (tag === "script") {
      const src = attrs.get("src");
      if (src !== undefined) result.loads.push({ ref: src, kind: "script" });
      else if (match[3]!.trim()) result.inlineScripts.push(match[3]!);
    } else if (match[3]!.trim()) result.inlineStyles.push(match[3]!);
  }
  for (const match of withoutComments.matchAll(/<(link|img|source|audio|video|iframe|embed|track)\b([^>]*)>/gi)) {
    const tag = match[1]!.toLowerCase();
    const attrs = attributes(match[2]!);
    if (tag === "link") {
      const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
      const href = attrs.get("href");
      if (href === undefined) continue;
      if (rel.some((value) => CONNECTING_LINKS.has(value))) result.connects.push(href);
      else if (rel.includes("stylesheet")) result.loads.push({ ref: href, kind: "style" });
      else if (rel.includes("modulepreload") || (rel.includes("preload") && attrs.get("as") === "script")) result.loads.push({ ref: href, kind: "script" });
      else if (rel.some((value) => LOADING_LINKS.has(value))) result.loads.push({ ref: href, kind: "asset" });
      continue;
    }
    for (const name of ["src", "poster"]) {
      const value = attrs.get(name);
      if (value) result.loads.push({ ref: value, kind: "asset" });
    }
    const srcset = attrs.get("srcset");
    if (srcset) for (const candidate of srcset.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) result.loads.push({ ref: url, kind: "asset" });
    }
  }
  return result;
}

/** What a style sheet loads: `@import`s and `url()`s. */
export function cssRefs(css: string): string[] {
  const refs: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)) refs.push(match[1]!);
  for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]+))\s*\)/gi)) refs.push(match[1] ?? match[2] ?? match[3] ?? "");
  return [...new Set(refs.filter(Boolean))];
}

/** A script's module imports: static ones load with it, dynamic ones later. */
export function scriptImports(source: string): { static: string[]; dynamic: string[] } {
  try {
    const [imports] = parse(source);
    const result = { static: [] as string[], dynamic: [] as string[] };
    for (const item of imports) {
      if (item.type === "static" || item.type === "reexport-star") result.static.push(item.specifier);
      else if (item.type === "dynamic" && item.specifier !== undefined && !item.glob) result.dynamic.push(item.specifier);
    }
    return result;
  } catch {
    // Not something the lexer reads, such as an old script with a syntax it
    // doesn't know: fall back to what plainly looks like an import.
    return {
      static: [...source.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]+from\s*)?["']([^"']+)["']/g)].map((match) => match[1]!),
      dynamic: [...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]!),
    };
  }
}

/** Absolute paths a script names as plain strings, such as Vite's preload list with `base: "/"`. */
function absoluteStrings(source: string, has: (file: string) => boolean): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/["'`](\/[^"'`\s/][^"'`\s]*\.[a-zA-Z0-9]{1,6})["'`]/g)) {
    const target = match[1]!;
    if (has(target.slice(1).replace(/[?#].*$/, ""))) found.push(target);
  }
  return found;
}

/**
 * Names a game builds at run time, as patterns: a template literal such as
 * `assets/enemy-${n}.png`, or the start of a string joined with `+`, such as
 * "enemy-" + n. A pattern counts only with enough fixed text to name something,
 * so `${dir}/${file}` doesn't make every file look used.
 */
export function builtNames(source: string): { patterns: RegExp[]; prefixes: string[] } {
  const patterns: RegExp[] = [];
  for (const match of source.matchAll(/`([^`\\]*\$\{[^`]*)`/g)) {
    const pieces = match[1]!.split(/\$\{[^}]*\}/);
    const fixed = pieces.join("").replace(/\.[a-z0-9]{2,5}$/i, "");
    if ((fixed.match(/[a-z0-9_]/gi) ?? []).length < 3) continue;
    const escaped = pieces.map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    patterns.push(new RegExp(`(?:^|/)${escaped.join("[^/]*")}$`));
  }
  const prefixes = [...source.matchAll(/["']([\w./-]{4,})["']\s*\+/g)]
    .map((match) => match[1]!)
    .filter((prefix) => /[a-z]/i.test(prefix) && !/^\.?\w{1,4}$/.test(prefix));
  return { patterns, prefixes };
}

class Findings {
  readonly list: Finding[] = [];
  readonly omitted: Partial<Record<FindingKind, number>> = {};
  #counts = new Map<FindingKind, number>();
  #seen = new Set<string>();
  add(finding: Finding) {
    const key = `${finding.kind}\0${finding.file}\0${finding.target}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    const count = (this.#counts.get(finding.kind) ?? 0) + 1;
    this.#counts.set(finding.kind, count);
    if (count <= MAX_FINDINGS) this.list.push(finding);
    else this.omitted[finding.kind] = (this.omitted[finding.kind] ?? 0) + 1;
  }
}

export async function scanBuild(root: string): Promise<ScanResult> {
  await init;
  const files = (await walk(root)).sort();
  const sizes = new Map<string, { bytes: number; transfer: number }>();
  const texts = new Map<string, string>();
  const byLowerCase = new Map<string, string>();
  for (const file of files) {
    const data = await readFile(path.join(root, file));
    const type = extension(file);
    const transfer = COMPRESSIBLE.has(type) && data.length <= MAX_GZIP && data.length > 0 ? Math.min(data.length, gzipSync(data).length) : data.length;
    sizes.set(file, { bytes: data.length, transfer });
    if (TEXT.has(type)) texts.set(file, data.toString("utf8"));
    byLowerCase.set(file.toLowerCase(), file);
  }
  const has = (file: string) => sizes.has(file);
  const findings = new Findings();
  const hosts = new Set<string>();

  const entry = new Set<string>();
  const lazy = new Set<string>();
  /** Text that runs or is read before play, and text only lazy code has. */
  const entryText: string[] = [];
  const lazyText: string[] = [];

  /** Follows a reference from `from`; returns the file it names when the build has it. */
  const follow = (from: string, raw: string, { code = false } = {}): string | undefined => {
    const ref = resolveRef(from, raw, { code });
    if (ref.type === "external") {
      hosts.add(ref.host);
      findings.add({ kind: ref.secure ? "external-request" : "insecure-request", file: from, target: ref.url });
      return undefined;
    }
    if (ref.type === "bare") {
      findings.add({ kind: "bare-import", file: from, target: ref.name });
      return undefined;
    }
    if (ref.type === "outside") {
      findings.add({ kind: "missing-file", file: from, target: raw });
      return undefined;
    }
    if (ref.type !== "local") return undefined;
    if (ref.absolute) findings.add({ kind: "absolute-path", file: from, target: raw });
    if (has(ref.path)) return ref.path;
    const other = byLowerCase.get(ref.path.toLowerCase());
    if (other) {
      findings.add({ kind: "case-mismatch", file: from, target: `${raw} → ${other}` });
      return undefined;
    }
    findings.add({ kind: "missing-file", file: from, target: raw });
    return undefined;
  };

  const scripts: { file: string; lazy: boolean }[] = [];
  const styles: { file: string; lazy: boolean }[] = [];
  const reach = (file: string, isLazy: boolean) => {
    const set = isLazy ? lazy : entry;
    if (set.has(file) || (isLazy && entry.has(file))) return;
    set.add(file);
    const type = extension(file);
    if (SCRIPT.has(type)) scripts.push({ file, lazy: isLazy });
    else if (STYLE.has(type)) styles.push({ file, lazy: isLazy });
  };

  const readScript = (file: string, source: string, isLazy: boolean) => {
    (isLazy ? lazyText : entryText).push(source);
    const { static: statics, dynamic } = scriptImports(source);
    for (const specifier of statics) {
      const target = follow(file, specifier, { code: true });
      if (target) reach(target, isLazy);
    }
    for (const specifier of dynamic) {
      const target = follow(file, specifier, { code: true });
      if (target) reach(target, true);
    }
    for (const target of absoluteStrings(source, has)) findings.add({ kind: "absolute-path", file, target });
    for (const match of source.matchAll(HOST_PATTERN)) {
      hosts.add(match[1]!);
      findings.add({ kind: "external-request", file, target: match[1]! });
    }
  };
  const readStyle = (file: string, source: string, isLazy: boolean) => {
    (isLazy ? lazyText : entryText).push(source);
    for (const ref of cssRefs(source)) {
      const target = follow(file, ref);
      if (target) reach(target, isLazy);
    }
  };

  const index = "index.html";
  for (const page of files.filter((file) => HTML.has(extension(file)))) {
    // Only the page players open starts the game; other pages count as files it may name.
    if (page !== index) continue;
    entry.add(page);
    const html = texts.get(page) ?? "";
    entryText.push(html);
    const refs = htmlRefs(html);
    for (const { ref, kind } of refs.loads) {
      const target = follow(page, ref, { code: false });
      if (!target) continue;
      if (kind === "asset") entry.add(target);
      else reach(target, false);
    }
    for (const ref of refs.connects) {
      const resolved = resolveRef(page, ref);
      if (resolved.type === "external") {
        hosts.add(resolved.host);
        findings.add({ kind: "external-request", file: page, target: ref });
      }
    }
    for (const source of refs.inlineScripts) readScript(page, source, false);
    for (const source of refs.inlineStyles) readStyle(page, source, false);
  }

  // Scripts and styles reached so far name more; keep going until nothing new is.
  while (scripts.length || styles.length) {
    const script = scripts.shift();
    if (script) readScript(script.file, texts.get(script.file) ?? "", script.lazy);
    const style = styles.shift();
    if (style) readStyle(style.file, texts.get(style.file) ?? "", style.lazy);
  }

  // Everything else is loaded by name at run time, if anything names it. Data
  // files a game reads (JSON levels, atlases) can name others too.
  const loaded = new Set([...entry, ...lazy]);
  const otherText = [...texts].filter(([file]) => !loaded.has(file)).map(([file, text]) => ({ file, text }));
  const entryCorpus = entryText.join("\n");
  const lazyCorpus = lazyText.join("\n");
  const named = new Set<string>();
  const lazyNamed = new Set<string>();
  const unreferenced = new Set<string>();
  const mentions = (corpus: string, needles: string[]) => needles.some((needle) => corpus.includes(needle));
  const entryBuilt = builtNames(entryCorpus + "\n" + otherText.map(({ text }) => text).join("\n"));
  const lazyBuilt = builtNames(lazyCorpus);
  const built = (names: { patterns: RegExp[]; prefixes: string[] }, file: string) => {
    const base = path.posix.basename(file);
    return names.patterns.some((pattern) => pattern.test(file)) || names.prefixes.some((prefix) => file.startsWith(prefix) || base.startsWith(prefix) || file.includes(`/${prefix}`));
  };
  for (const file of files) {
    if (loaded.has(file) || file === index) continue;
    const type = extension(file);
    if (type === ".map") {
      findings.add({ kind: "source-map", file, target: file, bytes: sizes.get(file)!.bytes });
      continue;
    }
    const base = path.posix.basename(file);
    const stem = base.slice(0, base.length - type.length);
    // A name long enough not to match by chance; games often build "hero" + ".png".
    const needles = [file, base, ...(stem.length >= 4 ? [stem] : [])];
    const elsewhere = () => otherText.some(({ file: other, text }) => other !== file && mentions(text, needles));
    if (mentions(entryCorpus, needles) || elsewhere() || built(entryBuilt, file)) named.add(file);
    else if (mentions(lazyCorpus, needles) || built(lazyBuilt, file)) lazyNamed.add(file);
    else {
      unreferenced.add(file);
      findings.add({ kind: "unreferenced", file, target: file, bytes: sizes.get(file)!.bytes });
    }
  }

  const part = (set: Iterable<string>): Part => {
    const list = [...set].sort();
    return {
      files: list,
      bytes: list.reduce((sum, file) => sum + sizes.get(file)!.bytes, 0),
      transfer: list.reduce((sum, file) => sum + sizes.get(file)!.transfer, 0),
    };
  };
  const all = [...sizes.values()];
  const longest = files.reduce((best, file) => (file.length > best.length ? file : best), "");
  return {
    version: 1,
    files: files.length,
    bytes: all.reduce((sum, size) => sum + size.bytes, 0),
    transfer: all.reduce((sum, size) => sum + size.transfer, 0),
    hasIndex: has(index),
    longestPath: { path: longest, length: longest.length },
    largest: files
      .map((file) => ({ path: file, bytes: sizes.get(file)!.bytes }))
      .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path))
      .slice(0, 10),
    entry: part(entry),
    named: part(named),
    lazy: part([...lazy, ...lazyNamed].filter((file) => !entry.has(file))),
    unreferenced: part(unreferenced),
    findings: findings.list,
    omitted: findings.omitted,
    externalHosts: [...hosts].sort(),
  };
}
