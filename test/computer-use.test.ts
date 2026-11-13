import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { it } from "node:test";
import manifest from "../plugins/computer-use/.ohmygame-plugin/plugin.json" with { type: "json" };
import { beforeCall } from "../plugins/computer-use/src/index.ts";
import type { ToolHookInput } from "../app/src/shared/plugin-hooks.js";

const pluginRoot = fileURLToPath(
  new URL("../plugins/computer-use", import.meta.url),
);
const loadApp = (name: string) =>
  import(
    pathToFileURL(
      path.resolve(process.env.OHMYGAME_APP ?? "app", `src/daemon/${name}.ts`),
    ).href
  );

it(
  "resolves the packaged desktop server and gates real MCP dispatch through the native hook",
  { timeout: 60_000 },
  async () => {
    const [
      { PluginServices },
      { PluginHooks },
      { PluginMcpHost },
      { writeProjectFile },
    ] = await Promise.all([
      loadApp("plugin-services"),
      loadApp("plugin-hooks"),
      loadApp("plugin-mcp-host"),
      loadApp("project-plugins"),
    ]);
    const dir = await mkdtemp(path.join(tmpdir(), "ohmygame-computer-use-"));
    const folder = path.join(dir, "project");
    await mkdir(folder);
    const services = new PluginServices({ directory: path.join(dir, "store") });
    const host = new PluginMcpHost();
    try {
      const installed = await services.install(pluginRoot);
      assert.equal(installed.ok, true, JSON.stringify(installed.issues));
      await writeProjectFile(folder, (file: unknown) => file, {
        type: "general",
      });
      // Resolving a disabled plugin must neither expose tools nor launch npx.
      assert.deepEqual(await services.mcpServers(folder), {});
      await services.setEveryProject(manifest.id, true);
      const servers = await services.mcpServers(folder);
      const [serverName] = Object.keys(servers);
      assert.ok(serverName);
      assert.equal(Object.keys(servers).length, 1);
      const definition = servers[serverName];
      assert.equal(definition.command, "npx");
      assert.deepEqual(definition.args, [
        "--yes",
        "--package",
        "@opensymph/open-computer-use@1.3.0",
        "open-computer-use",
        "mcp",
      ]);
      assert.deepEqual(
        definition.includeTools,
        manifest.contributes.mcpServers[0]!.tools,
      );
      for (const key of [
        "OPEN_COMPUTER_USE_ALLOW_GLOBAL_POINTER_FALLBACKS",
        "OPEN_COMPUTER_USE_MACOS_ALLOW_FOREGROUND_INPUT",
        "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOREGROUND_INPUT",
        "OPEN_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH",
        "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS",
        "OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK",
      ])
        assert.equal(definition.env[key], "0");
      assert.equal(
        definition.env.OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY,
        "1",
      );
      assert.equal(definition.env.npm_config_ignore_scripts, "true");

      const call = (
        tool: string,
        args: Record<string, unknown> = {},
      ): ToolHookInput => ({
        callId: "test",
        source: "mcp",
        server: serverName,
        tool,
        args,
      });
      for (const tool of definition.includeTools) {
        assert.equal(
          beforeCall(call(tool, { app: "fixture" })).decision,
          "ask",
          tool,
        );
        assert.equal(
          beforeCall({
            ...call(tool, { window: { id: 7 } }),
            source: "external",
          }).decision,
          "ask",
        );
      }
      for (const tool of [
        "capture_display",
        "launch_app",
        "activate_window",
        "shell",
        "future_tool",
      ])
        assert.equal(
          beforeCall(call(tool, { app: "fixture" })).decision,
          "deny",
          tool,
        );
      for (const args of [
        {},
        { app: " " },
        { window: {} },
        { window: { id: -1 } },
        { window: { id: NaN } },
        { window: [] },
        { app: "fixture", input_method: "global" },
        { app: "fixture", click_method: "global" },
      ])
        assert.equal(
          beforeCall(call("click", args)).decision,
          "deny",
          JSON.stringify(args),
        );
      for (const other of [
        { ...call("click"), server: "another-desktop" },
        { ...call("click"), source: "agent" as const, server: undefined },
      ])
        assert.equal(beforeCall(other).decision, "allow");

      const hooks = new PluginHooks({
        resolve: (target: string) => services.resolve(target),
        native: services.native,
      });
      let approved = false;
      let approvals = 0;
      let abortOnApproval: AbortController | undefined;
      let duringApproval: (() => Promise<void>) | undefined;
      const gates = hooks.tools(
        folder,
        async (_plugin: string, input: ToolHookInput) => {
          approvals++;
          assert.equal(input.server, serverName);
          abortOnApproval?.abort();
          await duringApproval?.();
          return approved;
        },
      );
      await assert.rejects(
        hooks.tools(folder).before(call("list_apps")),
        /active conversation/,
      );
      const log = path.join(dir, "calls.jsonl");
      await writeFile(log, "");
      const fixture = path.join(dir, "desktop.mjs");
      await writeFile(
        fixture,
        `
      import { createInterface } from "node:readline";
      import { appendFileSync } from "node:fs";
      createInterface({ input: process.stdin }).on("line", line => {
        const request = JSON.parse(line);
        if (request.id === undefined) return;
        let result = {};
        if (request.method === "initialize") result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "desktop-fixture", version: "1" } };
        if (request.method === "tools/list") result = { tools: ["click", "list_apps", "capture_display"].map(name => ({ name, description: name, annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: { app: { type: "string" } } } })) };
        if (request.method === "tools/call") {
          appendFileSync(process.argv[2], JSON.stringify(request.params) + "\\n");
          result = { content: [{ type: "text", text: "fixture action completed" }] };
        }
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
      });
    `,
      );
      // Replace only the launch command with a recording fixture. The actual
      // server identity, native hook and host adapter are used end to end.
      const native = await host.tool(
        {
          mcpServers: {
            [serverName]: {
              ...definition,
              command: process.execPath,
              args: [fixture, log],
            },
          },
        },
        folder,
        undefined,
        gates,
      );
      const execute = (tool: string, signal?: AbortSignal) =>
        native.tool.execute(
          "call",
          {
            server: serverName,
            tool: `${serverName}_${tool}`,
            args: { app: "fixture" },
          },
          signal,
          undefined,
          undefined,
        );
      try {
        assert.match(JSON.stringify(await execute("click")), /did not approve/);
        assert.equal(await readFile(log, "utf8"), "");
        approved = true;
        const abort = new AbortController();
        abortOnApproval = abort;
        const cancelled = await execute("click", abort.signal).catch(
          (error: Error) => ({ error: error.message }),
        );
        assert.match(JSON.stringify(cancelled), /abort/i);
        assert.equal(
          await readFile(log, "utf8"),
          "",
          "stopping during approval must not dispatch input",
        );
        abortOnApproval = undefined;
        assert.match(
          JSON.stringify(await execute("click")),
          /fixture action completed/,
        );
        assert.match(
          JSON.stringify(await execute("click")),
          /fixture action completed/,
        );
        assert.equal(
          approvals,
          4,
          "each call asks even when the adapter cached consent and upstream marked it read-only",
        );
        assert.match(
          JSON.stringify(await execute("list_apps")),
          /fixture action completed/,
        );
        assert.equal(approvals, 5, "observations ask too");
        await execute("capture_display");
        const calls = (await readFile(log, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        assert.deepEqual(
          calls.map((value) => value.name),
          ["click", "click", "list_apps"],
        );
        assert.deepEqual(calls[0].arguments, { app: "fixture" });
        // Revocation while the person is reviewing invalidates that approval.
        duringApproval = () => services.setEveryProject(manifest.id, false);
        assert.match(JSON.stringify(await execute("click")), /hooks changed/);
        assert.equal(
          (await readFile(log, "utf8")).trim().split("\n").length,
          3,
        );
        assert.deepEqual(await services.mcpServers(folder), {});
        duringApproval = undefined;
        await services.setEveryProject(manifest.id, true);
        approved = false;
        assert.match(JSON.stringify(await execute("click")), /did not approve/);
        assert.equal(
          (await readFile(log, "utf8")).trim().split("\n").length,
          3,
        );
      } finally {
        await native.close();
      }
      // A fresh MCP session also starts without a retained approval.
      const reconnected = await host.tool(
        {
          mcpServers: {
            [serverName]: {
              ...definition,
              command: process.execPath,
              args: [fixture, log],
            },
          },
        },
        folder,
        undefined,
        gates,
      );
      try {
        const count = approvals;
        const result = await reconnected.tool.execute(
          "reconnected",
          {
            server: serverName,
            tool: `${serverName}_click`,
            args: { app: "fixture" },
          },
          undefined,
          undefined,
          undefined,
        );
        assert.match(JSON.stringify(result), /did not approve/);
        assert.equal(approvals, count + 1);
        assert.equal(
          (await readFile(log, "utf8")).trim().split("\n").length,
          3,
        );
      } finally {
        await reconnected.close();
      }
      await services.setEveryProject(manifest.id, false);
      assert.deepEqual(await services.mcpServers(folder), {});
    } finally {
      await host.close();
      await services.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
