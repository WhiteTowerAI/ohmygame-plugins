import type { CallToolResult, Tool } from "@earendil-works/pi-mcp";
import manifest from "../.ohmygame-plugin/plugin.json" with { type: "json" };

const allowed = new Set(manifest.contributes.mcpServers[0]!.tools);
export const appId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9.-]{1,189}$/.test(value) &&
  value.includes(".");
const ownApps = new Set(["ai.ohmygame.desktop", "com.github.electron"]);
export const hostApp = (id: string) => ownApps.has(id.toLowerCase());
const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});
const texts = (result: CallToolResult) =>
  result.content.flatMap((item) => (item.type === "text" ? [item.text] : []));
type App = { id: string; name: string };
type Window = { app: string; id: number; title?: string };
export type DesktopCall = (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<CallToolResult>;

/** Pinned 1.3.0 macOS catalog. Do not disclose usage history or other apps' window titles. */
export function catalog(result: CallToolResult): App[] {
  if (result.isError)
    throw new Error(
      "Cannot resolve desktop apps; check the runtime permissions.",
    );
  const apps: App[] = [];
  for (const line of texts(result).join("\n").split("\n")) {
    const match = /^(.*?) — ([a-zA-Z0-9.-]+) \[([^\]]*)\]$/.exec(line);
    if (
      !match ||
      !appId(match[2]) ||
      !match[3]!.split(", ").includes("running")
    )
      continue;
    const id = match[2].toLowerCase();
    if (hostApp(id)) continue;
    apps.push({ id, name: match[1]! });
  }
  return apps;
}

function windows(result: CallToolResult): Window[] {
  if (result.isError)
    throw new Error("Cannot resolve the window; observe the target app again.");
  const parts = texts(result);
  if (parts.length !== 1)
    throw new Error("Unexpected window response from desktop runtime");
  const value: unknown = JSON.parse(parts[0]!);
  const list = Array.isArray(value) ? value : [value];
  if (
    !list.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.app === "string" &&
        Number.isSafeInteger(item.id) &&
        item.id >= 0,
    )
  )
    throw new Error("Unexpected window identity from desktop runtime");
  return list;
}

/** Keep upstream schemas and screenshot tokens. Only add an explicit app identity on macOS. */
export function desktopTools(
  tools: Tool[],
  platform = process.platform,
): Tool[] {
  return tools
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => {
      if (platform !== "darwin" || tool.name === "list_apps") return tool;
      return {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          properties: {
            ...((tool.inputSchema.properties as Record<string, unknown>) ?? {}),
            app: {
              type: "string",
              description:
                "Exact running app id from list_apps. Required even when targeting a window.",
            },
          },
          required: [
            ...new Set([
              ...((tool.inputSchema.required as string[] | undefined) ?? []),
              "app",
            ]),
          ],
        },
      };
    });
}

export async function desktopCall(
  call: DesktopCall,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  platform = process.platform,
): Promise<CallToolResult> {
  if (!allowed.has(name)) throw new Error("This desktop tool is unavailable");
  if (args.input_method === "global" || args.click_method === "global")
    throw new Error("Global input is disabled");
  // Windows/Linux retain single-call consent until their runtime exposes stable,
  // unambiguous app identities (their name/PID lookup also matches window titles).
  if (platform !== "darwin") return call(name, args, signal);
  signal?.throwIfAborted();
  const apps = catalog(await call("list_apps", {}, signal));
  if (name === "list_apps") return text(apps);
  if (!appId(args.app) || hostApp(args.app))
    throw new Error(
      "Select an app id from list_apps; OhMyGame cannot automate its own approvals.",
    );
  if (args.window_id !== undefined)
    throw new Error(
      "Use an explicit window object from list_windows, not window_id",
    );
  const id = args.app.toLowerCase();
  const matches = apps.filter((app) => app.id === id);
  if (matches.length !== 1)
    throw new Error(
      "The target app is not running or is ambiguous. Ask the person to open it, then list apps again.",
    );
  const owner = (window: Window) => {
    const candidates = apps.filter(
      (app) => app.name === window.app || app.id === window.app.toLowerCase(),
    );
    return candidates.length === 1 ? candidates[0]!.id : undefined;
  };
  if (name === "list_windows")
    return text(
      windows(await call("list_windows", {}, signal)).filter(
        (window) => owner(window) === id,
      ),
    );
  const forwarded: Record<string, unknown> = { ...args, app: id };
  if (args.window !== undefined) {
    const target = args.window as Record<string, unknown> | null;
    if (!target || !Number.isSafeInteger(target.id) || Number(target.id) < 0)
      throw new Error("Select a valid window from list_windows");
    // The backend resolves by id and ignores window.app. Never trust the caller's label.
    const actual = windows(
      await call("get_window", { window: { id: target.id } }, signal),
    );
    if (
      actual.length !== 1 ||
      actual[0]!.id !== target.id ||
      owner(actual[0]!) !== id
    )
      throw new Error(
        "The window does not belong to the authorized app. Observe its windows again.",
      );
    forwarded.window = actual[0];
  }
  signal?.throwIfAborted();
  return call(name, forwarded, signal);
}
