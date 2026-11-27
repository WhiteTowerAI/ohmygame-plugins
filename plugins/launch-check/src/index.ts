import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginContext } from "../../../app/src/shared/extension-host-protocol.js";
import { LanServer, lanAddress } from "./lan.ts";
import { report, type Report } from "./profiles.ts";
import { scanBuild } from "./scan.ts";

// The Launch check panel's native side: `scan` reads the web build the app
// makes for it and keeps the report, `last` gives the report kept for this
// project. Reports live in the plugin's data folder, not the project, so a
// scan never changes the project's files.
//
// `lan` serves the web build to phones on the same network until `lan-stop`,
// the call's own end, or an hour. The build folder the app made lives as long
// as the call, so the call stays open while the server runs; that also keeps
// the plugin's host from stopping as idle.

export const BUSY = "OhMyGame couldn't build the game for the scan. It can't while the AI is working or another export or publish runs; try again once they finish.";
export const NO_NETWORK = "This computer isn't on a local network. Connect it to the same Wi-Fi as the phone and try again.";
/** The progress line that carries the address; the panel reads it. */
export const LAN_PREFIX = "lan-url: ";
const OVERLAY = new URL("../overlay/overlay.js", import.meta.url);

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

export interface ActivateOptions {
  /** The address phones use; tests give the loopback address. */
  host?: () => string | undefined;
}

export function activate(context: PluginContext, options: ActivateOptions = {}): void {
  const folder = context.project?.folder;
  if (!folder) return;
  const file = reportFile(context.dataFolder, folder);
  let lan: { server: LanServer; startedAt: string; stop: () => void } | undefined;
  context.onDispose?.(() => lan?.stop());

  context.registerCommand("scan", async (_input, call) => {
    if (!call.build) throw new Error(BUSY);
    call.progress("Reading the web build");
    const result = report(await scanBuild(call.build.folder));
    await saveReport(file, result);
    return result;
  });
  context.registerCommand("last", () => readReport(file));

  context.registerCommand("lan", async (_input, call) => {
    if (!call.build) throw new Error(BUSY);
    const host = (options.host ?? lanAddress)();
    if (!host) throw new Error(NO_NETWORK);
    lan?.stop();
    const server = new LanServer({ root: call.build.folder, overlay: await readFile(OVERLAY, "utf8"), host });
    const url = await server.start();
    let stop!: () => void;
    const stopped = new Promise<void>((resolve) => (stop = resolve));
    const session = { server, startedAt: new Date().toISOString(), stop };
    lan = session;
    call.progress(`${LAN_PREFIX}${url}`);
    call.signal.addEventListener("abort", stop, { once: true });
    if (call.signal.aborted) stop();
    try {
      await stopped;
    } finally {
      await server.stop();
      if (lan === session) lan = undefined;
    }
    return { devices: server.devices() };
  });
  context.registerCommand("lanStatus", () =>
    lan ? { running: true, url: lan.server.url, startedAt: lan.startedAt, devices: lan.server.devices() } : { running: false, devices: [] },
  );
  context.registerCommand("lanStop", () => {
    lan?.stop();
    return null;
  });
}
