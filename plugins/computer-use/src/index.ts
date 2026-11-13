import { createHash } from "node:crypto";
import { appId, hostApp } from "./desktop.js";
import manifest from "../.ohmygame-plugin/plugin.json" with { type: "json" };
import type { PluginContext } from "../../../app/src/shared/extension-host-protocol.js";
import type {
  ToolHookDecision,
  ToolHookInput,
} from "../../../app/src/shared/plugin-hooks.js";

const server = manifest.contributes.mcpServers[0]!;
const tools = new Set(server.tools);
// API 2.x's qualified server name. The integration test resolves the actual
// manifest through PluginServices so a host naming change cannot bypass this gate.
const serverName = `plugin-${createHash("sha256").update(manifest.id).digest("hex").slice(0, 12)}-v2-${server.id}`;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();

export function beforeCall(
  call: ToolHookInput,
  platform = process.platform,
): ToolHookDecision {
  if (call.server !== serverName) return { decision: "allow" };
  if (!tools.has(call.tool))
    return {
      decision: "deny",
      reason: "This desktop tool is not available in Computer Use.",
    };
  if (
    call.args.click_method === "global" ||
    call.args.input_method === "global"
  )
    return {
      decision: "deny",
      reason:
        "Global mouse and keyboard input is disabled. Use a supported app-targeted action.",
    };
  if (platform === "darwin") {
    if (call.tool === "list_apps") return { decision: "allow" };
    if (!appId(call.args.app) || hostApp(call.args.app))
      return {
        decision: "deny",
        reason:
          "Select an explicit app id from list_apps. OhMyGame cannot automate its own approvals.",
      };
    const id = call.args.app.toLowerCase();
    return {
      decision: "ask",
      reason:
        "Read screenshots and UI text with the selected model, and operate this app on your behalf.",
      remember: { key: `app:macos:${id}`, label: id },
    };
  }
  if (call.tool !== "list_apps" && call.tool !== "list_windows") {
    const window = call.args.window as
      Record<string, unknown> | null | undefined;
    const windowId =
      window && typeof window === "object" && !Array.isArray(window)
        ? window.id
        : undefined;
    const hasWindow =
      nonempty(windowId) ||
      (Number.isSafeInteger(windowId) && Number(windowId) >= 0);
    if (!nonempty(call.args.app) && !hasWindow)
      return {
        decision: "deny",
        reason:
          "Select an explicit app or window from a fresh desktop observation first.",
      };
  }
  // Observations may capture private UI, app history or start an app session.
  // Do not infer consent from upstream readOnlyHint annotations or previous calls.
  return {
    decision: "ask",
    reason:
      call.tool.startsWith("list_") || call.tool.startsWith("get_")
        ? "Allow this desktop observation? App information, UI text or screenshots will be shared with the selected model."
        : "Allow this desktop action? It can change the target app and cannot be undone by stopping the agent.",
  };
}

export function activate(context: PluginContext) {
  context.registerHook("tool.beforeCall", (input) =>
    beforeCall(input as ToolHookInput),
  );
}
