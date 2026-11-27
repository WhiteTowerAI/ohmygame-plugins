import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginContext } from "../../../app/src/shared/extension-host-protocol.js";
import { report, type Report } from "./profiles.ts";
import { scanBuild } from "./scan.ts";

// The Launch check panel's native side: `scan` reads the web build the app
// makes for it and keeps the report, `last` gives the report kept for this
// project. Reports live in the plugin's data folder, not the project, so a
// scan never changes the project's files.

export const BUSY = "OhMyGame couldn't build the game for the scan. It can't while the AI is working or another export or publish runs; try again once they finish.";

export function reportFile(dataFolder: string, projectFolder: string): string {
  const key = createHash("sha256").update(path.resolve(projectFolder)).digest("hex").slice(0, 32);
  return path.join(dataFolder, "reports", `${key}.json`);
}

export async function readReport(file: string): Promise<Report | null> {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as Report;
    return value?.version === 1 ? value : null;
  } catch {
    return null;
  }
}

async function saveReport(file: string, value: Report): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, file);
}

export function activate(context: PluginContext): void {
  const folder = context.project?.folder;
  if (!folder) return;
  const file = reportFile(context.dataFolder, folder);

  context.registerCommand("scan", async (_input, call) => {
    if (!call.build) throw new Error(BUSY);
    call.progress("Reading the web build");
    const result = report(await scanBuild(call.build.folder));
    await saveReport(file, result);
    return result;
  });
  context.registerCommand("last", () => readReport(file));
}
