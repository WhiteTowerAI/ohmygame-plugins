// The checks one published version must pass to enter the index. The
// tarball is read in memory under the app's archive limits; only regular
// files with safe paths are kept, written to a private temporary folder and
// checked there by the app's own package check (`app/`, a checkout of
// WhiteTowerAI/ohmygame), so the index accepts what the app would install.
// Nothing from a package is run.

import { createHash, verify, type KeyObject } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";
import { Header, Parser, type ReadEntry } from "tar";

/** Packages named `@<publisher>/ohmygame-plugin-<name>` hold plugin `<publisher>/<name>`. */
export const PACKAGE_NAME = /^@([a-z0-9]+(?:-[a-z0-9]+)*)\/ohmygame-plugin-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const LOCALES = ["en", "zh-CN"] as const;

/** The npm registry's signature over one version, as its packument gives it. */
export interface RegistrySignature {
  keyid: string;
  sig: string;
}

/** What the package's contents say, which never changes for one integrity. */
export interface Verdict {
  plugin?: {
    id: string;
    /** By locale. */
    displayName: Record<string, string>;
    description: Record<string, string>;
    icon?: string;
    /** What it asks to be allowed, as the app's consent lists it. */
    grants: string[];
    /** How many of each contribution it adds. */
    adds: Record<string, number>;
  };
  /** Why it can't be installed; absent when it can. */
  rejected?: string[];
}

/** What the index says about one published version. */
export interface IndexedVersion extends Verdict {
  package: string;
  version: string;
  tarball: string;
  /** The tarball's `sha512-` integrity, which the app checks a download against. */
  integrity: string;
  /** The registry's signatures over `name@version:integrity`, which the app verifies with npm's keys. */
  signatures: RegistrySignature[];
  /** The npm account that published it. */
  publisher?: string;
  /** Where its provenance attestation is, when it has one. */
  provenance?: string;
  publishedAt?: string;
}

interface AppEntry {
  manifest: {
    id: string;
    version: string;
    displayName: string;
    description: string;
    icon?: string;
    contributes?: Record<string, unknown>;
  };
  strings: unknown;
}

/** The app code the checks use. */
export interface AppChecks {
  indexPluginPackage(root: string): Promise<{ ok: true; entry: AppEntry } | { ok: false; issues: { path: string; message: string }[] }>;
  localizePluginString(entry: AppEntry, value: string, locale: string): string;
  pluginApiIssue(manifest: AppEntry["manifest"]): string | undefined;
  capabilityGrants(manifest: AppEntry["manifest"]): string[];
  archiveMaxBytes: number;
  archiveMaxEntries: number;
  /** Which app code judged: its commit, so a verdict is redone when the checks change. */
  version: string;
}

/** Loads the checks from an OhMyGame checkout. */
export async function loadAppChecks(appRoot: string): Promise<AppChecks> {
  const load = (file: string) => import(pathToFileURL(path.resolve(appRoot, file)).href);
  const [manifest, plugins, index, projectPlugins] = await Promise.all([
    load("src/shared/plugin-manifest.ts"),
    load("src/shared/plugins.ts"),
    load("src/daemon/plugin-index.ts"),
    load("src/daemon/project-plugins.ts"),
  ]);
  const commit = await promisify(execFile)("git", ["-C", appRoot, "rev-parse", "HEAD"])
    .then(({ stdout }) => stdout.trim())
    .catch(() => undefined);
  return {
    indexPluginPackage: index.indexPluginPackage,
    localizePluginString: index.localizePluginString,
    pluginApiIssue: manifest.pluginApiIssue,
    capabilityGrants: projectPlugins.capabilityGrants,
    archiveMaxBytes: plugins.PLUGIN_ARCHIVE_MAX_BYTES,
    archiveMaxEntries: plugins.PLUGIN_ARCHIVE_MAX_ENTRIES,
    // Without a commit no verdict is reused.
    version: commit ?? `unknown-${Date.now()}`,
  };
}

/** npm's registry keys, by keyid; a key verifies only what was published before it expired. */
export type RegistryKeys = Map<string, { key: KeyObject; expires?: number }>;

/** Why the registry's signatures don't vouch for a version, or undefined when one does. */
export function signatureIssue(
  name: string,
  version: string,
  integrity: string,
  signatures: readonly RegistrySignature[],
  keys: RegistryKeys,
  publishedAt?: string,
): string | undefined {
  if (!signatures.length) return "no npm registry signature";
  const message = Buffer.from(`${name}@${version}:${integrity}`);
  const at = publishedAt ? Date.parse(publishedAt) : Date.now();
  for (const { keyid, sig } of signatures) {
    const key = keys.get(keyid);
    if (!key || (key.expires !== undefined && at > key.expires)) continue;
    if (verify("sha256", message, key.key, Buffer.from(sig, "base64"))) return undefined;
  }
  return "npm registry signature doesn't verify";
}

/** Why the tarball's bytes don't match its `sha512-` integrity, or undefined when they do. */
export function integrityIssue(bytes: Buffer, integrity: string): string | undefined {
  const sha512 = integrity.split(/\s+/).find((item) => item.startsWith("sha512-"));
  if (!sha512) return "no sha512 integrity";
  return createHash("sha512").update(bytes).digest("base64") === sha512.slice("sha512-".length)
    ? undefined
    : "integrity doesn't match the tarball";
}

/** A tarball the app couldn't install, and why. */
export class TarballError extends Error {}

const FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
/** Below what any file system takes, and the app's own folder depth. */
const MAX_PATH_BYTES = 1024;
const MAX_NAME_BYTES = 255;
const MAX_DEPTH = 20;
/** Room beyond the files themselves for tar headers and metadata records. */
const METADATA_ALLOWANCE = 8 * 1024 * 1024;

/**
 * The package's files (paths inside `package/`), read from a gzipped
 * tarball in memory. Every entry must be a file or folder under `package/`
 * whose path has no `.`/`..` segment, backslash or root, and no two may
 * name the same path, by case too; entries and bytes stay within the limits.
 * The whole decompressed stream, metadata records included, stays within
 * the file limit plus a small allowance, and parsing stops at the first
 * problem.
 */
export async function readTarball(bytes: Buffer, limits: { maxEntries: number; maxBytes: number }): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const taken = new Map<string, "file" | "folder">();
  let entries = 0;
  let total = 0;
  let failure: TarballError | undefined;
  const fail = (error: TarballError) => {
    failure ??= error;
    parser.abort(failure);
  };
  const parser: Parser = new Parser({
    strict: true,
    // Already decompressed below, within the budget; nothing may decompress again.
    brotli: false,
    zstd: false,
    onReadEntry: (entry: ReadEntry) => {
      try {
        if (failure) throw failure;
        if (++entries > limits.maxEntries) throw new TarballError("has too many files");
        const relative = packagePath(entry.path);
        if (entry.type === "Directory") {
          if (relative) claim(taken, relative, "folder");
          entry.resume();
          return;
        }
        if (!relative) throw new TarballError("package is a file, not a folder");
        if (!FILE_TYPES.has(entry.type)) throw new TarballError(`${entry.path} is a ${entry.type}, not a file or folder`);
        claim(taken, relative, "file");
        if (entry.size > limits.maxBytes || (total += entry.size) > limits.maxBytes) throw new TarballError("is larger than the app allows unpacked");
        const chunks: Buffer[] = [];
        let received = 0;
        entry.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > entry.size) fail(new TarballError(`${entry.path} is longer than its header says`));
          else chunks.push(chunk);
        });
        entry.on("end", () => files.set(relative, Buffer.concat(chunks)));
      } catch (error) {
        entry.resume();
        fail(error instanceof TarballError ? error : new TarballError(String(error)));
      }
    },
  });
  const budget = limits.maxBytes + METADATA_ALLOWANCE;
  let decompressed = 0;
  let head: Buffer | undefined = Buffer.alloc(0);
  const bounded = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      decompressed += chunk.length;
      if (decompressed > budget) return done(failure ??= new TarballError("is larger than the app allows unpacked"));
      if (!head) return done(null, chunk);
      // The first block must be a tar header, so a tarball compressed twice
      // can't decompress again in the parser, outside the budget.
      head = Buffer.concat([head, chunk]);
      if (head.length < 512) return done();
      const first = head;
      head = undefined;
      if (!startsWithTarHeader(first)) return done(failure ??= new TarballError("is not a tar archive inside one gzip layer"));
      done(null, first);
    },
    flush(done) {
      if (head?.length) return done(failure ??= new TarballError("is not a tar archive inside one gzip layer"));
      done();
    },
  });
  try {
    await pipeline(Readable.from([bytes]), createGunzip(), bounded, parser);
  } catch (error) {
    throw failure ?? new TarballError(`can't be read as a gzipped tarball (${(error as Error).message})`);
  }
  if (failure) throw failure;
  return files;
}

function startsWithTarHeader(bytes: Buffer): boolean {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return false;
  try {
    return new Header(bytes.subarray(0, 512)).cksumValid;
  } catch {
    return false;
  }
}

/** The path inside `package/` (empty for `package/` itself), refusing anything that could land elsewhere. */
function packagePath(name: string): string {
  if (Buffer.byteLength(name) > MAX_PATH_BYTES) throw new TarballError("has a path that is too long");
  if (!name || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw new TarballError(`${name} is not a safe path`);
  const segments = name.split("/").filter(Boolean);
  if (segments.some((part) => part === "." || part === "..") || segments[0] !== "package")
    throw new TarballError(`${name} is not a safe path inside package/`);
  if (segments.length > MAX_DEPTH + 1) throw new TarballError("has folders that nest too deeply");
  if (segments.some((part) => Buffer.byteLength(part) > MAX_NAME_BYTES)) throw new TarballError("has a file name that is too long");
  return segments.slice(1).join("/");
}

/** Records a path, refusing one already taken (by case too) or a file where a folder is. */
function claim(taken: Map<string, "file" | "folder">, relative: string, kind: "file" | "folder"): void {
  const segments = relative.toLowerCase().split("/");
  for (let index = 1; index < segments.length; index++) {
    const parent = segments.slice(0, index).join("/");
    if (taken.get(parent) === "file") throw new TarballError(`${relative} is inside a file`);
    taken.set(parent, "folder");
  }
  const key = segments.join("/");
  const before = taken.get(key);
  if (before === "file" || (before === "folder" && kind === "file")) throw new TarballError(`${relative} is in the tarball twice`);
  taken.set(key, kind);
}

/** Checks one version's tarball with the app's package check, and that the package agrees with it. */
export async function judgeTarball(app: AppChecks, name: string, version: string, bytes: Buffer): Promise<Verdict> {
  let files: Map<string, Buffer>;
  try {
    files = await readTarball(bytes, { maxEntries: app.archiveMaxEntries, maxBytes: app.archiveMaxBytes });
  } catch (error) {
    if (error instanceof TarballError) return { rejected: [`the tarball ${error.message}`] };
    throw error;
  }
  const rejected: string[] = [];
  let scripts: Record<string, unknown> = {};
  try {
    const pkg = files.get("package.json");
    scripts = pkg ? (JSON.parse(pkg.toString("utf8")).scripts ?? {}) : {};
  } catch {
    rejected.push("package.json is not JSON");
  }
  // The app never runs them, so a package that needs them wouldn't work.
  for (const script of ["preinstall", "install", "postinstall"])
    if (scripts[script]) rejected.push(`has a ${script} script, which the app never runs`);

  const folder = await mkdtemp(path.join(tmpdir(), "ohmygame-plugin-check-"));
  try {
    const root = path.join(folder, "package");
    await mkdir(root, { mode: 0o700 });
    let result: Awaited<ReturnType<AppChecks["indexPluginPackage"]>>;
    // Whatever goes wrong from here on comes from the package's own files.
    try {
      for (const [file, content] of files) {
        const target = path.join(root, ...file.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content, { flag: "wx" });
      }
      result = await app.indexPluginPackage(root);
    } catch (error) {
      return { rejected: [...rejected, `the package can't be checked: ${(error as Error).message}`] };
    }
    if (!result.ok) return { rejected: [...rejected, ...result.issues.map((issue) => `${issue.path || "package"} ${issue.message}`)] };
    const { entry } = result;
    const manifest = entry.manifest;
    const match = PACKAGE_NAME.exec(name);
    if (!match) rejected.push("package name must be @<publisher>/ohmygame-plugin-<name>");
    else if (`${match[1]}/${match[2]}` !== manifest.id) rejected.push(`package ${name} must hold plugin ${match[1]}/${match[2]}, not ${manifest.id}`);
    if (manifest.version !== version) rejected.push(`plugin.json says version ${manifest.version}, the package ${version}`);
    const apiIssue = app.pluginApiIssue(manifest);
    if (apiIssue) rejected.push(apiIssue);
    if (rejected.length) return { rejected };
    const text = (value: string) => Object.fromEntries(LOCALES.map((locale) => [locale, app.localizePluginString(entry, value, locale)]));
    const displayName = text(manifest.displayName);
    const description = text(manifest.description);
    // A `%key%` must name a string the locale file itself holds, not, say, `%toString%`.
    for (const [field, values] of Object.entries({ displayName, description }))
      for (const [locale, value] of Object.entries(values))
        if (typeof value !== "string" || !value.trim()) rejected.push(`${field} isn't text in ${locale}`);
    if (rejected.length) return { rejected };
    return {
      plugin: {
        id: manifest.id,
        displayName,
        description,
        ...(manifest.icon ? { icon: manifest.icon } : {}),
        grants: app.capabilityGrants(manifest),
        adds: Object.fromEntries(
          Object.entries(manifest.contributes ?? {})
            .filter(([, value]) => Array.isArray(value))
            .map(([key, value]) => [key, (value as unknown[]).length]),
        ),
      },
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
