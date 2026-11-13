import { McpClient, StdioTransport } from "@earendil-works/pi-mcp";
import { desktopCall, desktopTools } from "./desktop.js";

const client = new McpClient({
  name: "ohmygame-desktop",
  version: "0.1.0",
  requestTimeoutMs: 60_000,
});
const transport = new StdioTransport({
  command: "npx",
  args: [
    "--yes",
    "--package",
    "@opensymph/open-computer-use@1.3.0",
    "open-computer-use",
    "mcp",
  ],
  stderr: "inherit",
});
const ready = client.connect(transport);
void ready.catch(() => {});
const pending = new Map<string | number, AbortController>();
let queue = Promise.resolve();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  for (const controller of pending.values()) controller.abort();
  await client.close();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
process.stdin.on("end", () => void close());
process.stdout.on("error", () => void close());

// Stdio JSON-RPC: notifications can cancel a queued or executing call. Desktop
// requests are serialized; an abandoned waiter never starts input later.
function receive(message: Record<string, any>) {
  if (message.method === "notifications/cancelled") {
    pending.get(message.params?.requestId)?.abort();
    return;
  }
  if (message.id === undefined) return;
  const id = message.id;
  if (typeof id !== "string" && typeof id !== "number") return;
  const controller = new AbortController();
  pending.set(id, controller);
  const respond = (body: object) => {
    if (!closing)
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, ...body })}\n`,
      );
  };
  const execute = async () => {
    try {
      controller.signal.throwIfAborted();
      await ready;
      controller.signal.throwIfAborted();
      let result: unknown;
      if (message.method === "initialize")
        result = {
          protocolVersion: client.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "ohmygame-desktop", version: "0.1.0" },
        };
      else if (message.method === "ping") result = {};
      else if (message.method === "tools/list")
        result = {
          tools: desktopTools(
            await client.listTools({ signal: controller.signal }),
          ),
        };
      else if (message.method === "tools/call") {
        const { name, arguments: args = {} } = message.params ?? {};
        if (
          typeof name !== "string" ||
          !args ||
          typeof args !== "object" ||
          Array.isArray(args)
        )
          throw new Error("Invalid tool call");
        result = await desktopCall(
          (tool, input, signal) => client.callTool(tool, input, { signal }),
          name,
          args,
          controller.signal,
        );
      } else {
        respond({ error: { code: -32601, message: "Method not found" } });
        return;
      }
      respond({ result });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      respond({ error: { code: -32603, message } });
    } finally {
      pending.delete(id);
    }
  };
  queue = queue.then(execute, execute);
}
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  if (buffer.length > 16 * 1024 * 1024) {
    void close();
    return;
  }
  let newline: number;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    try {
      const message = JSON.parse(line);
      if (message && typeof message === "object") receive(message);
    } catch {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
      );
    }
  }
});
