// Godot's Web export templates. Godot ships every platform's templates in one
// archive of about 1 GB per version; the web build needs two files from it of
// about 9 MB each. They're read out of the official release's archive with
// HTTP range requests, checked against the archive's CRC-32s, and placed where
// Godot's own template manager puts them.

import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";

/** The files the web build uses: the no-threads variants, as the Web preset turns threads off. */
export const WEB_TEMPLATE_FILES = ["web_nothreads_release.zip", "web_nothreads_debug.zip"];
const ENTRY_MAX_BYTES = 64 * 1024 * 1024;
const DIRECTORY_MAX_BYTES = 1024 * 1024;

/**
 * What a `godot --version` line says about its build: `4.3.stable.official.77dcf97d8`,
 * `4.4.beta1.mono.official.4ce466d7f`. Undefined when it isn't a Godot version.
 */
export function godotBuild(version) {
  const match = /^(\d+\.\d+(?:\.\d+)?)\.([a-z]+\d*)((?:\.[a-z0-9]+)*)/.exec(String(version ?? "").trim());
  if (!match) return undefined;
  const flags = match[3].split(".").filter(Boolean);
  const mono = flags.includes("mono");
  return {
    number: match[1],
    status: match[2],
    /** Godot looks for templates in a folder with this name: the .NET build's have their own. */
    folder: `${match[1]}.${match[2]}${mono ? ".mono" : ""}`,
    mono,
    official: flags.includes("official"),
  };
}

/** An environment variable that names an absolute folder, as Godot only uses those. */
const absolute = (value) => (value && path.isAbsolute(value) ? value : undefined);

/**
 * Where Godot keeps a version's export templates: beside a self-contained
 * editor (a `_sc_` or `._sc_` file next to its executable, on Windows and
 * Linux), else in its data folder.
 */
export function templatesFolder(version, { platform = process.platform, env = process.env, home = os.homedir(), executable, selfContained } = {}) {
  const id = godotBuild(version)?.folder ?? version;
  if (executable && platform !== "darwin" && selfContained) return path.join(path.dirname(executable), "editor_data", "export_templates", id);
  const base =
    platform === "darwin"
      ? path.join(home, "Library/Application Support/Godot")
      : platform === "win32"
        ? path.join(absolute(env.APPDATA) ?? path.join(home, "AppData", "Roaming"), "Godot")
        : path.join(absolute(env.XDG_DATA_HOME) ?? path.join(home, ".local/share"), "godot");
  return path.join(base, "export_templates", id);
}

/** Whether an editor is self-contained: it keeps its data, templates included, next to itself. */
export async function isSelfContained(executable, platform = process.platform) {
  if (!executable || platform === "darwin") return false;
  const folder = path.dirname(executable);
  for (const name of ["_sc_", "._sc_"]) if (await stat(path.join(folder, name)).then(() => true, () => false)) return true;
  return false;
}

export async function hasWebTemplates(version, options) {
  if (!version) return false;
  const files = await readdir(templatesFolder(version, options)).catch(() => []);
  return files.some((file) => file.startsWith("web_nothreads_release"));
}

/**
 * The official archive of a build's templates. Stable releases are on
 * godotengine/godot; previews (dev, beta, rc) only on godotengine/godot-builds.
 */
export function templatesUrl(build) {
  const tag = `${build.number}-${build.status}`;
  const repository = build.status === "stable" ? "godot" : "godot-builds";
  return `https://github.com/godotengine/${repository}/releases/download/${tag}/Godot_v${tag}${build.mono ? "_mono" : ""}_export_templates.tpz`;
}

/** Why the web templates can't be installed for this build, or undefined when they can. */
export function templatesProblem(build) {
  if (!build) return "unknown";
  // The no-threads web templates the build uses came with 4.3.
  const [major, minor] = build.number.split(".").map(Number);
  if (major < 4 || (major === 4 && minor < 3)) return "old";
  // Godot 4 can't export C# projects to the web; its .NET build has no web templates to use.
  if (build.mono && Number(build.number.split(".")[0]) >= 4) return "mono";
  if (!build.official) return "custom";
  return undefined;
}

class RangeReader {
  constructor(url, fetcher, signal) {
    this.url = url;
    this.fetch = fetcher;
    this.signal = signal;
  }

  async size() {
    const response = await this.fetch(this.url, { method: "HEAD", signal: this.signal });
    if (!response.ok) throw new Error(`The templates download answered ${response.status}`);
    const size = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(size) || size < 22) throw new Error("The templates download has no size");
    return size;
  }

  /** Bytes `start` to `end` inclusive; a server that ignores ranges is refused rather than read in full. */
  async read(start, end, onBytes) {
    const response = await this.fetch(this.url, { headers: { range: `bytes=${start}-${end}` }, signal: this.signal });
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`The templates download doesn't allow partial downloads (${response.status})`);
    }
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    let offset = 0;
    for await (const chunk of response.body) {
      if (offset + chunk.length > length) throw new Error("The templates download sent more than it was asked for");
      buffer.set(chunk, offset);
      offset += chunk.length;
      onBytes?.(chunk.length);
    }
    if (offset !== length) throw new Error("The templates download ended early");
    return buffer;
  }
}

/** The archive's central directory: each file's name, sizes, CRC-32 and header offset. */
async function centralDirectory(reader) {
  const size = await reader.size();
  const tailStart = Math.max(0, size - 65_557);
  const tail = await reader.read(tailStart, size - 1);
  const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("The templates archive has no directory");
  let count = tail.readUInt16LE(end + 10);
  let length = tail.readUInt32LE(end + 12);
  let offset = tail.readUInt32LE(end + 16);
  // ZIP64 when the classic fields overflow: its locator sits just before the end record.
  if (offset === 0xffffffff || length === 0xffffffff || count === 0xffff) {
    const locator = end - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) throw new Error("The templates archive's directory can't be read");
    const record = Number(tail.readBigUInt64LE(locator + 8));
    const zip64 = await reader.read(record, record + 55);
    if (zip64.readUInt32LE(0) !== 0x06064b50) throw new Error("The templates archive's directory can't be read");
    count = Number(zip64.readBigUInt64LE(32));
    length = Number(zip64.readBigUInt64LE(40));
    offset = Number(zip64.readBigUInt64LE(48));
  }
  if (length > DIRECTORY_MAX_BYTES || offset + length > size) throw new Error("The templates archive's directory is too large");
  const directory = await reader.read(offset, offset + length - 1);
  const files = new Map();
  let at = 0;
  for (let index = 0; index < count && at + 46 <= directory.length; index++) {
    if (directory.readUInt32LE(at) !== 0x02014b50) break;
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    const name = directory.toString("utf8", at + 46, at + 46 + nameLength);
    let compressed = directory.readUInt32LE(at + 20);
    let uncompressed = directory.readUInt32LE(at + 24);
    let header = directory.readUInt32LE(at + 42);
    // ZIP64 extra field: only the overflowing values are there, in this order.
    for (let extra = at + 46 + nameLength; extra + 4 <= at + 46 + nameLength + extraLength;) {
      const id = directory.readUInt16LE(extra);
      const size = directory.readUInt16LE(extra + 2);
      if (id === 0x0001) {
        let field = extra + 4;
        if (uncompressed === 0xffffffff) { uncompressed = Number(directory.readBigUInt64LE(field)); field += 8; }
        if (compressed === 0xffffffff) { compressed = Number(directory.readBigUInt64LE(field)); field += 8; }
        if (header === 0xffffffff) header = Number(directory.readBigUInt64LE(field));
      }
      extra += 4 + size;
    }
    files.set(name, { method: directory.readUInt16LE(at + 10), crc: directory.readUInt32LE(at + 16), compressed, uncompressed, header });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

async function readEntry(reader, file, onBytes) {
  if (file.uncompressed > ENTRY_MAX_BYTES || file.compressed > ENTRY_MAX_BYTES) throw new Error("A template file is larger than expected");
  const header = await reader.read(file.header, file.header + 29);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("The templates archive is damaged");
  const start = file.header + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = file.compressed ? await reader.read(start, start + file.compressed - 1, onBytes) : Buffer.alloc(0);
  const bytes = file.method === 0 ? data : file.method === 8 ? inflateRawSync(data, { maxOutputLength: ENTRY_MAX_BYTES }) : undefined;
  if (!bytes) throw new Error("A template file uses a compression this plugin can't read");
  if (bytes.length !== file.uncompressed || crc32(bytes) !== file.crc) throw new Error("A template file didn't arrive intact");
  return bytes;
}

/**
 * Installs the Web export templates for a Godot build from its official
 * release, reading only the files the web build needs. `onProgress` gets the
 * bytes received and the total. Files go to a temporary folder first, so a
 * stopped or failed download leaves no partial templates behind.
 */
export async function installWebTemplates(version, { fetch: fetcher = globalThis.fetch, signal, onProgress, folder } = {}) {
  const build = godotBuild(version);
  const problem = templatesProblem(build);
  if (problem) throw Object.assign(new Error(`Web export templates can't be installed for ${version} (${problem})`), { code: problem });
  const reader = new RangeReader(templatesUrl(build), fetcher, signal);
  const files = await centralDirectory(reader);
  const wanted = WEB_TEMPLATE_FILES.map((name) => [name, files.get(`templates/${name}`)]);
  const missing = wanted.filter(([, file]) => !file).map(([name]) => name);
  if (missing.length) throw new Error(`The templates archive has no ${missing.join(", ")}`);
  const total = wanted.reduce((sum, [, file]) => sum + file.compressed, 0);
  let received = 0;
  onProgress?.(0, total);
  const target = folder ?? templatesFolder(version);
  // A dot folder, so neither Godot nor this plugin takes one left by a stopped app for a version's templates.
  const staging = path.join(path.dirname(target), `.ohmygame-staging-${path.basename(target)}-${process.pid}-${Date.now()}`);
  await mkdir(staging, { recursive: true });
  try {
    for (const [name, file] of wanted) {
      const bytes = await readEntry(reader, file, (count) => {
        received += count;
        onProgress?.(received, total);
      });
      await writeFile(path.join(staging, name), bytes);
    }
    const versionFile = files.get("templates/version.txt");
    if (versionFile && versionFile.uncompressed < 200) await writeFile(path.join(staging, "version.txt"), await readEntry(reader, versionFile));
    await mkdir(target, { recursive: true });
    // Templates Godot already has, for other platforms, stay; these replace their own names only.
    // The release template last: Godot and the status read take it as the sign that the rest is there.
    const names = (await readdir(staging)).sort((a, b) => Number(a === WEB_TEMPLATE_FILES[0]) - Number(b === WEB_TEMPLATE_FILES[0]));
    for (const name of names) await rename(path.join(staging, name), path.join(target, name));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { folder: target, files: WEB_TEMPLATE_FILES };
}
