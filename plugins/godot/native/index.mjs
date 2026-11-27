// The Godot plugin's native entry. It runs in the project's extension host
// and starts Godot as a child process: headless runs and checks for the
// agent, the web export the game panel plays, and the full editor on request.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { findGodot as findGodotAt } from "./godot.mjs";
import { godotBuild, hasWebTemplates, installWebTemplates, isSelfContained, templatesFolder, templatesProblem } from "./templates.mjs";

const OUTPUT_MAX_CHARS = 40_000;
const WEB_BUILD_FOLDER = ".ohmygame/build/web";
const WEB_PRESET = "Web";

/** Runs Godot and collects its output; the call's signal stops it. */
function run(executable, args, { cwd, signal, timeoutMs = 120_000, progress }) {
  return new Promise((resolve, reject) => {
    // A call cancelled while it got ready never starts Godot.
    if (signal?.aborted) {
      reject(new Error("Stopped"));
      return;
    }
    const child = spawn(executable, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const append = (chunk) => {
      const text = chunk.toString("utf8");
      output = (output + text).slice(-OUTPUT_MAX_CHARS);
      const line = text.trim().split("\n").pop();
      if (line) progress?.(line);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const stop = () => child.kill();
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (signal?.aborted) reject(new Error("Stopped"));
      else resolve({ exitCode, output, errors: errorLines(output) });
    });
  });
}

function errorLines(output) {
  return output
    .split("\n")
    .filter((line) => /^\s*(?:SCRIPT ERROR|ERROR|Parse Error|USER ERROR)\b/.test(line))
    .slice(0, 50)
    .map((line) => line.trim());
}

/** The Godot this call uses, from the plugin's setting, then the usual places. */
const findGodot = (call) => findGodotAt(call?.configuration?.godotPath);

async function requireGodot(call) {
  const executable = await findGodot(call);
  if (!executable)
    throw new Error("Godot isn't installed or wasn't found. Install Godot 4.3 or later, or set its executable in the Godot plugin's settings.");
  return executable;
}

/** Where this Godot looks for its templates: a self-contained editor keeps them beside itself. */
async function templateOptions(executable) {
  return { executable, selfContained: await isSelfContained(executable) };
}

async function godotVersion(executable, signal) {
  const { output } = await run(executable, ["--version"], { signal, timeoutMs: 15_000 });
  return output.trim().split("\n").pop() || null;
}

/**
 * Refuses a path in the project whose existing parts include a link, so
 * nothing written there can land outside the project.
 */
async function assertNoLinks(project, relative) {
  let current = project;
  let stats;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    stats = await lstat(current).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!stats) return;
    if (stats.isSymbolicLink()) throw new Error(`${path.relative(project, current)} is a link; the web export writes only inside the project`);
  }
  return stats;
}

/**
 * Empties the build folder before each export, so a stale or linked file
 * never stays in what the panel serves.
 */
async function freshBuildFolder(project) {
  await assertNoLinks(project, path.dirname(WEB_BUILD_FOLDER));
  await rm(path.join(project, WEB_BUILD_FOLDER), { recursive: true, force: true });
  await mkdir(path.join(project, WEB_BUILD_FOLDER), { recursive: true });
}

// Replace the config only after the complete new file has been written.
async function savePreset(file, text, mode) {
  if (mode !== undefined) await access(file, constants.W_OK);
  const staging = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(staging, text, { flag: "wx", mode });
    if (mode !== undefined) await chmod(staging, mode & 0o777);
    await rename(staging, file);
  } catch (error) {
    if (error.code !== "EEXIST") await rm(staging, { force: true });
    throw error;
  }
}

/** Creates the Web preset or supplies the include filter missing from older presets. */
export async function ensureWebPreset(folder) {
  const file = path.join(folder, "export_presets.cfg");
  const existing = await assertNoLinks(folder, "export_presets.cfg");
  const text = existing ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(file)) : "";
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  // Keep the original bytes of other presets, their options, and any explicit filter.
  const sections = text.split(/\n(?=[ \t]*\[[^\]\r\n]+\])/);
  const webName = /^[ \t]*name[ \t]*=[ \t]*"Web"[ \t]*(?:;[^\r\n]*)?$/m;
  let next = 0;
  for (const [index, section] of sections.entries()) {
    const header = /^\[preset\.(\d+)\]/.exec(section.trimStart());
    if (!header) continue;
    next = Math.max(next, Number(header[1]) + 1);
    if (!webName.test(section)) continue;
    if (!/^[ \t]*platform[ \t]*=[ \t]*"Web"/m.test(section)) return;
    if (!/^[ \t]*include_filter[ \t]*=/m.test(section)) {
      sections[index] = section.replace(webName, `include_filter=""${newline}$&`);
      await savePreset(file, sections.join("\n"), existing.mode);
    }
    return;
  }
  const preset = [
    `[preset.${next}]`,
    "",
    `name="${WEB_PRESET}"`,
    'platform="Web"',
    "runnable=true",
    'export_filter="all_resources"',
    'include_filter=""',
    'exclude_filter=".ohmygame/*"',
    `export_path="${WEB_BUILD_FOLDER}/index.html"`,
    "",
    `[preset.${next}.options]`,
    "",
    "variant/thread_support=false",
    "",
  ].join(newline);
  const prefix = text.endsWith("\n") ? text : text + newline;
  await savePreset(file, text ? prefix + newline + preset : preset, existing?.mode);
}

const MB = (bytes) => (bytes / 1_048_576).toFixed(1);

/** Settings text, in the app's language. */
function text(locale) {
  return locale === "zh-CN"
    ? {
        notFound: "没有找到 Godot。请安装 Godot 4.3 或更高版本，或在上方选择它的可执行文件。",
        noVersion: (executable) => `${executable} 没有报告版本，可能不是 Godot。请在上方选择 Godot 的可执行文件。`,
        found: (version, executable) => `Godot ${version} · ${executable}`,
        installed: "Web 导出模板已安装，游戏面板可以播放 Godot 游戏。",
        missing: "缺少 Web 导出模板，游戏面板需要它们来播放 Godot 游戏。将从 Godot 官方发布中只下载 Web 所需的约 17 MB。",
        downloading: (received, total) => `${total ? `正在下载 Web 导出模板：${MB(received)} / ${MB(total)} MB` : "正在准备下载 Web 导出模板…"}\n完成前请保持此页打开。`,
        failed: (error) => `上次安装失败：${error}。可以重试，或在 Godot 中通过「编辑器 > 管理导出模板」安装。`,
        mono: "这是 Godot 的 .NET 版本。Godot 4 还不能把 C# 项目导出到 Web；只用 GDScript 的项目请改用标准版 Godot。",
        custom: "这不是 Godot 官方构建，没有对应的官方模板。请在 Godot 中通过「编辑器 > 管理导出模板」安装。",
        unknown: "无法从版本号确定模板。请在 Godot 中通过「编辑器 > 管理导出模板」安装。",
        old: "游戏面板播放的 Web 构建需要 Godot 4.3 或更新版本。请升级 Godot，或在上方选择较新的 Godot。",
      }
    : {
        notFound: "Godot wasn't found. Install Godot 4.3 or later, or choose its executable above.",
        noVersion: (executable) => `${executable} didn't report a version and may not be Godot. Choose Godot's executable above.`,
        found: (version, executable) => `Godot ${version} · ${executable}`,
        installed: "Web export templates are installed, so the Game panel can play Godot games.",
        missing: "Web export templates are missing. The Game panel needs them to play Godot games. Only the about 17 MB the web build uses is downloaded, from Godot's official release.",
        downloading: (received, total) => `${total ? `Downloading web export templates: ${MB(received)} / ${MB(total)} MB` : "Getting ready to download web export templates…"}\nKeep this page open until it finishes.`,
        failed: (error) => `The last install failed: ${error}. Try again, or install them in Godot with Editor > Manage Export Templates.`,
        mono: "This is Godot's .NET build. Godot 4 can't export C# projects to the web yet; for a GDScript-only project, use the standard Godot.",
        custom: "This isn't an official Godot build, so there are no official templates for it. Install them in Godot with Editor > Manage Export Templates.",
        unknown: "The templates for this version can't be told from its version number. Install them in Godot with Editor > Manage Export Templates.",
        old: "The web build the Game panel plays needs Godot 4.3 or later. Update Godot, or choose a newer one above.",
      };
}

export function activate(context) {
  const folder = context.project?.folder;
  const needFolder = () => {
    if (!folder) throw new Error("The Godot plugin works in a project");
    return folder;
  };

  // The preview's builds and the agent's exports share one build folder, and
  // each export empties it first, so they take turns.
  let exporting = Promise.resolve();
  const exportWeb = (call) => {
    const turn = exporting.catch(() => {}).then(() => {
      if (call.signal?.aborted) throw call.signal.reason ?? new Error("Cancelled");
      return exportWebNow(call);
    });
    exporting = turn;
    return turn;
  };

  const exportWebNow = async (call) => {
    const project = needFolder();
    const executable = await requireGodot(call);
    const version = await godotVersion(executable, call.signal);
    if (!(await hasWebTemplates(version ?? "", await templateOptions(executable))))
      throw new Error(`Godot's web export templates for ${version ?? "this Godot"} aren't installed. Install them from the Godot plugin's settings in OhMyGame, or in Godot with Editor > Manage Export Templates.`);
    await ensureWebPreset(project);
    await freshBuildFolder(project);
    call.progress("Importing assets");
    await run(executable, ["--headless", "--path", project, "--import"], { cwd: project, signal: call.signal, timeoutMs: 300_000, progress: call.progress });
    call.progress("Exporting the web build");
    const result = await run(
      executable,
      ["--headless", "--path", project, "--export-release", WEB_PRESET, path.join(project, WEB_BUILD_FOLDER, "index.html")],
      { cwd: project, signal: call.signal, timeoutMs: 600_000, progress: call.progress },
    );
    if (result.exitCode !== 0)
      throw new Error(`The web export failed (exit ${result.exitCode}):\n${result.errors.join("\n") || result.output.slice(-4_000)}`);
    return result;
  };

  context.registerProjectType("godot-game", {
    buildWeb: async (_input, call) => {
      await exportWeb(call);
      return { folder: WEB_BUILD_FOLDER, entry: "index.html" };
    },
  });

  context.registerTool("godot_status", async (_input, call) => {
    const executable = await findGodot(call);
    if (!executable) return { executable: null, version: null, webTemplates: false, problem: "Godot wasn't found" };
    const version = await godotVersion(executable, call.signal).catch(() => null);
    return { executable, version, webTemplates: await hasWebTemplates(version ?? "", await templateOptions(executable)) };
  });

  context.registerTool("run_headless", async (input, call) => {
    const project = needFolder();
    const executable = await requireGodot(call);
    const frames = Number.isInteger(input?.frames) ? input.frames : 60;
    const args = ["--headless", "--path", project, "--quit-after", String(frames)];
    if (typeof input?.scene === "string") args.push(input.scene);
    return run(executable, args, { cwd: project, signal: call.signal, timeoutMs: 120_000, progress: call.progress });
  });

  context.registerTool("export_web", (_input, call) => exportWeb(call));

  // Settings: what this computer has for Godot, and installing the web templates.
  // An install runs on in the background; status reads report its progress.
  let install;
  let found;
  const godotFor = async (call) => {
    const setting = call?.configuration?.godotPath ?? "";
    if (found && found.setting === setting && Date.now() - found.at < 10_000) return found;
    const executable = await findGodot(call);
    const version = executable ? await godotVersion(executable, call?.signal).catch(() => null) : null;
    const result = { setting, at: Date.now(), executable, version, options: await templateOptions(executable) };
    // A read stopped partway (the tab closed, or a slow first start) proves nothing, so it isn't kept.
    if (!call?.signal?.aborted && (version || !executable)) found = result;
    return result;
  };

  const status = async (input, call) => {
    const say = text(input?.locale);
    const { executable, version, options } = await godotFor(call);
    if (!executable) return { message: say.notFound, actions: [] };
    if (!version) return { message: say.noVersion(executable), actions: [] };
    const message = say.found(version, executable);
    if (install?.version === version && install.state === "running")
      return { message, detail: say.downloading(install.received, install.total), actions: [] };
    if (await hasWebTemplates(version, options)) return { message, detail: say.installed, actions: [] };
    const problem = templatesProblem(godotBuild(version));
    if (problem) return { message, detail: say[problem], actions: [] };
    const failed = install?.version === version && install.state === "failed" ? `\n${say.failed(install.error)}` : "";
    return { message, detail: `${say.missing}${failed}`, actions: ["install-web-templates"] };
  };
  context.registerCommand("settingsStatus", status);

  context.registerCommand("installWebTemplatesInBackground", async (input, call) => {
    const { version, options } = await godotFor(call);
    if (version && !templatesProblem(godotBuild(version)) && !(install?.version === version && install.state === "running") && !(await hasWebTemplates(version, options))) {
      const controller = new AbortController();
      const current = { version, state: "running", received: 0, total: 0, controller };
      install = current;
      context.onDispose(() => controller.abort());
      installWebTemplates(version, {
        folder: templatesFolder(version, options),
        signal: controller.signal,
        onProgress: (received, total) => Object.assign(current, { received, total }),
      }).then(
        () => { current.state = "done"; },
        (error) => Object.assign(current, { state: "failed", error: (error instanceof Error ? error.message : String(error)).slice(0, 300) }),
      );
    }
    return status(input, call);
  });

  // The full editor, for what the web build can't do. It runs until the
  // person closes it or the project's host stops.
  context.registerCommand("runInGodot", async (_input, call) => {
    const project = needFolder();
    const executable = await requireGodot(call);
    if (call.signal.aborted) throw new Error("Stopped");
    const child = spawn(executable, ["--path", project, "--editor"], { cwd: project, stdio: "ignore", windowsHide: false });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    // Cancelled while it started: the editor doesn't stay open.
    if (call.signal.aborted) {
      child.kill();
      throw new Error("Stopped");
    }
    context.onDispose(() => {
      if (child.exitCode === null) child.kill();
    });
    return { started: true };
  });
}
