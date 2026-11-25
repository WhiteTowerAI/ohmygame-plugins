import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, mock } from "node:test";
// @ts-expect-error The plugin's native code is plain JavaScript.
import { activate } from "../plugins/godot/native/index.mjs";
import { crc32, deflateRawSync } from "node:zlib";
// @ts-expect-error The plugin's native code is plain JavaScript.
import { godotBuild, installWebTemplates, isSelfContained, templatesFolder, templatesProblem, templatesUrl } from "../plugins/godot/native/templates.mjs";

/** A zip as Godot's .tpz is one: stored and deflated entries under `templates/`. */
function zip(files: Record<string, Buffer>, { stored = [] as string[], corrupt = "" } = {}) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const method = stored.includes(name) ? 0 : 8;
    const data = method ? deflateRawSync(content) : content;
    const nameBytes = Buffer.from(name);
    const crc = name === corrupt ? (crc32(content) ^ 1) >>> 0 : crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Serves an archive with byte ranges, as GitHub's release downloads do; `ranges: false` ignores them. */
function serving(archive: Buffer, { ranges = true } = {}) {
  const requests: string[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    const range = new Headers(init.headers).get("range");
    requests.push(`${init.method ?? "GET"} ${range ?? ""}`.trim());
    if (init.method === "HEAD") return new Response(null, { headers: { "content-length": String(archive.length) } });
    const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
    if (!ranges || !match) return new Response(new Uint8Array(archive));
    return new Response(new Uint8Array(archive.subarray(Number(match[1]), Number(match[2]) + 1)), { status: 206 });
  };
  return { fetch, requests };
}

const release = Buffer.from("web release template ".repeat(5000));
const debug = Buffer.from("web debug template ".repeat(5000));
const others = { "templates/linux_release.x86_64": Buffer.alloc(200_000, 7), "templates/web_release.zip": Buffer.from("threads") };

it("reads Godot builds and finds their official template archives", () => {
  assert.deepEqual(godotBuild("4.3.stable.official.77dcf97d8"), { number: "4.3", status: "stable", folder: "4.3.stable", mono: false, official: true });
  assert.equal(templatesUrl(godotBuild("4.3.stable.official.77dcf97d8")), "https://github.com/godotengine/godot/releases/download/4.3-stable/Godot_v4.3-stable_export_templates.tpz");
  assert.equal(templatesUrl(godotBuild("4.4.1.rc2.official.abc")), "https://github.com/godotengine/godot-builds/releases/download/4.4.1-rc2/Godot_v4.4.1-rc2_export_templates.tpz");
  assert.equal(templatesProblem(godotBuild("4.3.stable.mono.official.77dcf97d8")), "mono");
  assert.equal(templatesProblem(godotBuild("4.3.stable.custom_build.77dcf97d8")), "custom");
  assert.equal(templatesProblem(undefined), "unknown");
  assert.equal(templatesFolder("4.6.1.stable.official.14d19694e", { platform: "linux", env: {}, home: "/home/me" }), "/home/me/.local/share/godot/export_templates/4.6.1.stable");
  // The .NET build has its own folder; Godot ignores a relative data folder.
  assert.equal(godotBuild("4.3.stable.mono.official.77dcf97d8")!.folder, "4.3.stable.mono");
  assert.equal(templatesFolder("4.3.stable.official", { platform: "linux", env: { XDG_DATA_HOME: "" }, home: "/home/me" }), "/home/me/.local/share/godot/export_templates/4.3.stable");
  assert.equal(templatesFolder("4.3.stable.official", { platform: "linux", env: { XDG_DATA_HOME: "data" }, home: "/home/me" }), "/home/me/.local/share/godot/export_templates/4.3.stable");
  assert.equal(templatesFolder("4.3.stable.official", { platform: "win32", env: {}, home: "C:/Users/me" }), path.join("C:/Users/me", "AppData", "Roaming", "Godot", "export_templates", "4.3.stable"));
  assert.equal(templatesFolder("4.3.stable.official", { platform: "linux", env: {}, home: "/home/me", executable: "/opt/godot/godot", selfContained: true }), "/opt/godot/editor_data/export_templates/4.3.stable");
  // Before 4.3 there are no no-threads web templates to install.
  assert.equal(templatesProblem(godotBuild("4.2.2.stable.official.abc")), "old");
  assert.equal(templatesProblem(godotBuild("3.6.stable.official.abc")), "old");
  assert.equal(templatesProblem(godotBuild("4.3.stable.official.abc")), undefined);
});

it("tells a self-contained editor by the file beside it", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "godot-sc-"));
  try {
    const executable = path.join(folder, "godot");
    assert.equal(await isSelfContained(executable, "linux"), false);
    await writeFile(path.join(folder, "._sc_"), "");
    assert.equal(await isSelfContained(executable, "linux"), true);
    assert.equal(await isSelfContained(executable, "darwin"), false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

it("installs only the web templates, read with ranges and checked", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "godot-templates-"));
  try {
    const target = path.join(folder, "4.3.stable");
    await mkdir(target);
    await writeFile(path.join(target, "linux_release.x86_64"), "already here");
    const archive = zip({ ...others, "templates/version.txt": Buffer.from("4.3.stable"), "templates/web_nothreads_release.zip": release, "templates/web_nothreads_debug.zip": debug }, { stored: ["templates/version.txt"] });
    const { fetch, requests } = serving(archive);
    const progress: number[] = [];
    await installWebTemplates("4.3.stable.official.77dcf97d8", { fetch, folder: target, onProgress: (received: number) => progress.push(received) });
    assert.deepEqual((await readdir(target)).sort(), ["linux_release.x86_64", "version.txt", "web_nothreads_debug.zip", "web_nothreads_release.zip"]);
    assert.deepEqual(await readFile(path.join(target, "web_nothreads_release.zip")), release);
    assert.equal(await readFile(path.join(target, "linux_release.x86_64"), "utf8"), "already here");
    assert.ok(progress.at(-1)! > 0);
    // Never the whole archive: every read is a range, and the other platforms' files aren't among them.
    assert.ok(requests.every((request) => request === "HEAD" || request.startsWith("GET bytes=")));
    // No staging folder is left beside the templates.
    assert.deepEqual(await readdir(folder), ["4.3.stable"]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

it("leaves nothing behind when a file is damaged, missing, or ranges aren't served", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "godot-templates-"));
  try {
    const target = path.join(folder, "4.3.stable");
    const damaged = zip({ "templates/web_nothreads_release.zip": release, "templates/web_nothreads_debug.zip": debug }, { corrupt: "templates/web_nothreads_debug.zip" });
    await assert.rejects(installWebTemplates("4.3.stable.official", { fetch: serving(damaged).fetch, folder: target }), /intact/);
    const missing = zip({ "templates/web_nothreads_release.zip": release });
    await assert.rejects(installWebTemplates("4.3.stable.official", { fetch: serving(missing).fetch, folder: target }), /no web_nothreads_debug/);
    const whole = zip({ "templates/web_nothreads_release.zip": release, "templates/web_nothreads_debug.zip": debug });
    await assert.rejects(installWebTemplates("4.3.stable.official", { fetch: serving(whole, { ranges: false }).fetch, folder: target }), /partial downloads/);
    await assert.rejects(installWebTemplates("4.3.stable.mono.official", { fetch: serving(whole).fetch, folder: target }), /mono/);
    assert.deepEqual(await readdir(folder), []);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

function editorCommand(
  start?: (options: unknown) => Promise<{ stop: () => Promise<void> }>,
  onDispose: (cleanup: () => void) => void = () => assert.fail("The host owns managed sessions"),
) {
  type Command = (input: unknown, call: unknown) => Promise<unknown>;
  const commands = new Map<string, Command>();
  activate({
    project: { folder: tmpdir() },
    registerProjectType() {},
    registerTool() {},
    registerCommand: (name: string, handler: Command) => commands.set(name, handler),
    onDispose,
    nativeSessions: start && { start },
  });
  return (signal = new AbortController().signal) =>
    commands.get("runInGodot")!({}, { configuration: { godotPath: process.execPath }, signal });
}

it("launches the managed editor and propagates a rejected second launch", async () => {
  const stop = mock.fn(async () => {});
  const start = mock.fn(async (_options: unknown) => ({ stop }));
  const run = editorCommand(start);
  assert.deepEqual(await run(), { started: true });
  assert.deepEqual(start.mock.calls[0]?.arguments, [{
    executable: process.execPath, args: ["--path", tmpdir(), "--editor"], label: "Godot",
  }]);
  const busy = new Error("already running");
  start.mock.mockImplementation(async () => { throw busy; });
  await assert.rejects(run(), (error) => error === busy);
  assert.equal(stop.mock.callCount(), 0);
});

it("stops a managed session cancelled while it starts", async () => {
  const controller = new AbortController();
  const stop = mock.fn(async () => {});
  const run = editorCommand(async () => {
    controller.abort();
    return { stop };
  });
  await assert.rejects(run(controller.signal), /Stopped/);
  assert.equal(stop.mock.callCount(), 1);
});

it("registers cleanup for the child it spawns on older hosts", async () => {
  const onDispose = mock.fn((_cleanup: () => void) => {});
  const run = editorCommand(undefined, onDispose);
  assert.deepEqual(await run(), { started: true });
  assert.equal(onDispose.mock.callCount(), 1);
  onDispose.mock.calls[0]!.arguments[0]();
});
