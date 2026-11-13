import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  chmod,
} from "node:fs/promises";
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
      { PluginToolApprovals },
      { writeProjectFile },
    ] = await Promise.all([
      loadApp("plugin-services"),
      loadApp("plugin-hooks"),
      loadApp("plugin-mcp-host"),
      loadApp("plugin-tool-approvals"),
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
      assert.equal(definition.command, "node");
      assert.deepEqual(definition.args, ["./dist/server.mjs"]);
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
          beforeCall(call(tool, { app: "fixture" }), "linux").decision,
          "ask",
          tool,
        );
        assert.equal(
          beforeCall(
            {
              ...call(tool, { window: { id: 7 } }),
              source: "external",
            },
            "linux",
          ).decision,
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
          beforeCall(call(tool, { app: "fixture" }), "linux").decision,
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

      const approvalsStore = new PluginToolApprovals(dir);
      const hooks = new PluginHooks({
        approvals: approvalsStore,
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
        hooks
          .tools(folder)
          .before(call("get_app_state", { app: "com.example.fixture" })),
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
            args: { app: "com.example.fixture" },
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
        assert.equal(
          approvals,
          process.platform === "darwin" ? 4 : 5,
          "macOS app discovery exposes only app identities without another prompt",
        );
        await execute("capture_display");
        const calls = (await readFile(log, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        assert.deepEqual(
          calls.map((value) => value.name),
          ["click", "click", "list_apps"],
        );
        assert.deepEqual(calls[0].arguments, { app: "com.example.fixture" });
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
      // Allow once never retains consent, including in a fresh MCP session.
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
            args: { app: "com.example.fixture" },
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

it("binds remembered macOS consent to explicit bundle IDs and keeps other platforms per-call", () => {
  const server = "plugin-ecf269c30f24-v2-desktop";
  const call = (
    tool: string,
    args: Record<string, unknown> = {},
  ): ToolHookInput => ({ callId: "one", source: "mcp", server, tool, args });
  assert.equal(beforeCall(call("list_apps"), "darwin").decision, "allow");
  for (const tool of manifest.contributes.mcpServers[0]!.tools.filter(
    (tool) => tool !== "list_apps",
  )) {
    assert.deepEqual(
      beforeCall(call(tool, { app: "com.apple.TextEdit" }), "darwin"),
      {
        decision: "ask",
        reason:
          "Read screenshots and UI text with the selected model, and operate this app on your behalf.",
        remember: {
          key: "app:macos:com.apple.textedit",
          label: "com.apple.textedit",
        },
      },
    );
    for (const args of [
      {},
      { window: { id: 123 } },
      { app: "TextEdit" },
      { app: "ai.ohmygame.desktop" },
      { app: "com.github.Electron" },
    ])
      assert.equal(beforeCall(call(tool, args), "darwin").decision, "deny");
    for (const platform of ["win32", "linux"] as const)
      assert.ok(
        !("remember" in beforeCall(call(tool, { app: "TextEdit" }), platform)),
      );
  }
});

it("filters discovery and verifies actual window owners before any capture or input", async () => {
  const { desktopCall, desktopTools } =
    await import("../plugins/computer-use/src/desktop.ts");
  const text = (value: string) => ({
    content: [{ type: "text" as const, text: value }],
  });
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  let duplicateName = false;
  let actualOwner = "TextEdit";
  const invoke = async (tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    if (tool === "list_apps")
      return text(
        [
          "TextEdit — com.apple.TextEdit [running, uses=99]",
          "Safari — com.apple.Safari [running, last-used=private]",
          "Closed — com.example.closed [uses=3]",
          "OhMyGame — ai.ohmygame.desktop [running]",
          ...(duplicateName
            ? ["TextEdit — com.example.duplicate [running]"]
            : []),
        ].join("\n"),
      );
    if (tool === "list_windows")
      return text(
        JSON.stringify([
          { app: "TextEdit", id: 1, title: "Allowed document" },
          { app: "Safari", id: 2, title: "Private tab" },
        ]),
      );
    if (tool === "get_window")
      return text(
        JSON.stringify({
          app: actualOwner,
          id: (args.window as { id: number }).id,
          title: "Document",
        }),
      );
    return text("target result");
  };
  const run = (tool: string, args: Record<string, unknown> = {}) =>
    desktopCall(invoke, tool, args, undefined, "darwin");
  const found = JSON.stringify(await run("list_apps"));
  assert.match(found, /com.apple.textedit/);
  assert.doesNotMatch(found, /uses|last-used|private|closed|ohmygame/);
  const listed = JSON.stringify(
    await run("list_windows", { app: "com.apple.textedit" }),
  );
  assert.match(listed, /Allowed document/);
  assert.doesNotMatch(listed, /Private tab|Safari/);
  await run("click", {
    app: "com.apple.TextEdit",
    window: { id: 1, app: "forged" },
    screenshotId: "fresh-token",
    element_index: "0",
  });
  assert.deepEqual(calls.at(-1), {
    tool: "click",
    args: {
      app: "com.apple.textedit",
      window: { id: 1, app: "TextEdit", title: "Document" },
      screenshotId: "fresh-token",
      element_index: "0",
    },
  });
  actualOwner = "Safari";
  const actions = () => calls.filter((call) => call.tool === "click").length;
  for (const args of [
    { app: "com.apple.textedit", window: { id: 2, app: "TextEdit" } },
    { app: "com.apple.textedit", window_id: 2 },
    { app: "com.apple.closed" },
    { app: "TextEdit" },
    { app: "ai.ohmygame.desktop" },
    { app: "com.apple.textedit", click_method: "global" },
  ])
    await assert.rejects(run("click", args));
  actualOwner = "TextEdit";
  duplicateName = true;
  await assert.rejects(
    run("click", { app: "com.apple.textedit", window: { id: 1 } }),
    /does not belong/,
  );
  assert.equal(actions(), 1, "no invalid target reaches native input");
  await assert.rejects(run("capture_display", {}), /unavailable/);
  await assert.rejects(
    desktopCall(
      async () => ({ ...text("denied"), isError: true }),
      "click",
      { app: "com.apple.textedit" },
      undefined,
      "darwin",
    ),
    /Cannot resolve/,
  );
  const tools = desktopTools(
    ["list_apps", "click", "capture_display"].map((name) => ({
      name,
      inputSchema: {
        type: "object",
        properties: { screenshotId: { type: "string" } },
        required: ["screenshotId"],
      },
    })),
    "darwin",
  );
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["list_apps", "click"],
  );
  assert.deepEqual(tools[1]!.inputSchema.required, ["screenshotId", "app"]);
});

it(
  "runs the bundled proxy protocol, cancels queued input and closes its native process",
  { skip: process.platform === "win32", timeout: 15_000 },
  async () => {
    const { McpClient, StdioTransport } =
      await import("@earendil-works/pi-mcp");
    const directory = await mkdtemp(path.join(tmpdir(), "desktop-proxy-"));
    const log = path.join(directory, "calls.jsonl");
    const pidFile = path.join(directory, "pid");
    const fixture = path.join(directory, "native.mjs");
    const client = new McpClient({ name: "test", version: "1" });
    try {
      await writeFile(log, "");
      await writeFile(
        fixture,
        `
      import { createInterface } from "node:readline";
      import { appendFileSync, writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      createInterface({input:process.stdin}).on("line", line => {
        const request=JSON.parse(line);
        if(request.id===undefined)return;
        const send=result=>process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,result})+"\\n");
        const text=text=>({content:[{type:"text",text}]});
        if(request.method==="initialize")return send({protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:"fixture",version:"1"}});
        if(request.method==="tools/list")return send({tools:["list_apps","get_app_state","click","capture_display"].map(name=>({name,inputSchema:{type:"object",properties:{app:{type:"string"}}}}))});
        if(request.method==="tools/call"){
          appendFileSync(${JSON.stringify(log)},JSON.stringify(request.params)+"\\n");
          if(request.params.name==="get_app_state")return setTimeout(()=>send(text("Observed")),300);
          return send(text("TextEdit — com.apple.TextEdit [running]"));
        }
        send({});
      });
    `,
      );
      const quote = (value: string) =>
        "'" + value.replaceAll("'", "'\\''") + "'";
      const launcher = path.join(directory, "npx");
      await writeFile(
        launcher,
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`,
      );
      await chmod(launcher, 0o755);
      await client.connect(
        new StdioTransport({
          command: process.execPath,
          args: [path.join(pluginRoot, "dist/server.mjs")],
          env: { PATH: `${directory}:${process.env.PATH}` },
        }),
      );
      const tools = await client.listTools();
      assert.deepEqual(
        tools.map((tool) => tool.name),
        ["list_apps", "get_app_state", "click"],
      );
      const first = client.callTool("get_app_state", {
        app: "com.apple.textedit",
      });
      for (
        let count = 0;
        !(await readFile(log, "utf8")).includes("get_app_state");
        count++
      ) {
        assert.ok(count < 100, "native observation started");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const abort = new AbortController();
      const second = client.callTool(
        "click",
        { app: "com.apple.textedit" },
        { signal: abort.signal },
      );
      const rejected = assert.rejects(second, /abort/i);
      abort.abort();
      await rejected;
      await first;
      await client.ping();
      assert.doesNotMatch(await readFile(log, "utf8"), /"name":"click"/);
      const pid = Number(await readFile(pidFile, "utf8"));
      await client.close();
      for (let count = 0; ; count++) {
        try {
          process.kill(pid, 0);
        } catch {
          break;
        }
        assert.ok(count < 100, "native process exits after proxy shutdown");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
