import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import type {
  PluginSessions,
  PluginSessionMessage,
  PluginSessionRequest,
} from "../app/src/shared/plugin-sessions.js";
import { Bot, type Transport } from "../plugins/feishu/src/bot.ts";
import {
  DAY,
  Store,
  parts,
  type Delivery,
} from "../plugins/feishu/src/store.ts";
import { FeishuTransport } from "../plugins/feishu/src/transport.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

test("a failed persistence attempt is never acknowledged as a duplicate on redelivery", () => {
  const f = fixture();
  renameSync(f.store.file, `${f.store.file}.original`);
  mkdirSync(f.store.file);
  const event = f.event("Build");
  assert.throws(() => f.bot.receive(event));
  assert.throws(() => f.bot.receive(event), /restart/);
  assert.equal(
    JSON.parse(readFileSync(`${f.store.file}.original`, "utf8")).deliveries
      .length,
    0,
  );
});

test("the distributable activates in standalone ESM without node_modules and disposes its connection", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "omg-feishu-packed-"));
  folders.push(folder);
  writeFileSync(
    path.join(folder, "index.mjs"),
    readFileSync(
      fileURLToPath(
        new URL("../plugins/feishu/dist/index.mjs", import.meta.url),
      ),
    ),
  );
  writeFileSync(
    path.join(folder, "check.mjs"),
    `
    import assert from 'node:assert/strict';
    import { activate } from './index.mjs';
    const disposers = []; let started = 0, closed = 0;
    await activate({ sessions: { request: async () => { throw Error('Unexpected session request'); } }, configuration: { appId: 'cli_1234567890abcdef', appSecret: 'fixture', ownerOpenId: 'ou_owner' }, dataFolder: ${JSON.stringify(folder)}, registerCommand: () => {}, onDispose: fn => disposers.push(fn) }, () => ({ start: async () => { started++; }, close: () => { closed++; }, reply: async () => {} }));
    assert.equal(started, 1); for (const dispose of disposers) await dispose(); assert.equal(closed, 1);
  `,
  );
  await promisify(execFile)(
    process.execPath,
    [path.join(folder, "check.mjs")],
    { cwd: folder, timeout: 10_000 },
  );
});
function fixture() {
  const folder = mkdtempSync(path.join(tmpdir(), "omg-feishu-"));
  folders.push(folder);
  let now = 1_800_000_000_000;
  let status = "idle",
    needsApproval = false,
    loseSend = false,
    failReply = false;
  const messages: PluginSessionMessage[] = [];
  const calls: PluginSessionRequest[] = [],
    replies: { id: string; text: string; uuid: string }[] = [];
  const sessions = {
    request: async (r: PluginSessionRequest) => {
      calls.push(r);
      switch (r.operation) {
        case "projects":
          return { projects: [{ id: "p", name: "Project" }], truncated: false };
        case "conversations":
          return {
            conversations: [{ id: "c", title: "Conversation" }],
            truncated: false,
          };
        case "create":
          return { id: "c" };
        case "send":
          assert.equal(status, "idle");
          status = "running";
          messages.push({
            id: "u",
            turnId: "t",
            role: "user",
            text: r.text,
            source: { plugin: "ohmygame/feishu" },
          });
          if (loseSend) throw new Error("Lost acknowledgement");
          return { turnId: "t" };
        case "read":
          return {
            messages,
            status,
            needsApproval,
            truncated: false,
            cursor: "epoch:1",
          };
        case "stop":
          status = "idle";
          return { stopped: true };
        default:
          throw new Error("Unexpected operation");
      }
    },
  } as PluginSessions;
  const transport: Transport = {
    async reply(id, text, uuid) {
      replies.push({ id, text, uuid });
      if (failReply) throw new Error("Lost reply ack");
    },
  };
  const store = new Store(folder, "app:owner");
  store.state.bindings.oc_chat = { projectId: "p", conversationId: "c" };
  store.save();
  const bot = new Bot(store, sessions, transport, "ou_owner", () => now);
  const event = (text: string, id = "om_1") => ({
    sender: { sender_type: "user", sender_id: { open_id: "ou_owner" } },
    message: {
      message_id: id,
      chat_id: "oc_chat",
      chat_type: "p2p",
      message_type: "text",
      content: JSON.stringify({ text }),
      create_time: String(now),
    },
  });
  return {
    folder,
    store,
    bot,
    sessions,
    transport,
    calls,
    replies,
    messages,
    event,
    clock: () => now,
    advance(ms: number) {
      now += ms;
    },
    failReply(value: boolean) {
      failReply = value;
    },
    loseSend() {
      loseSend = true;
    },
    approval() {
      needsApproval = true;
    },
    finish(
      text = "Finished",
      outcome: PluginSessionMessage["status"] = "completed",
    ) {
      needsApproval = false;
      status = "idle";
      messages.push({
        id: "a",
        turnId: "t",
        role: "assistant",
        text,
        status: outcome,
      });
    },
    restart() {
      return new Bot(
        new Store(folder, "app:owner"),
        sessions,
        transport,
        "ou_owner",
        () => now,
      );
    },
  };
}

test("only the configured open_id in private text chat reaches sessions; stale/future/malformed events are ignored", async () => {
  const f = fixture();
  const stranger = f.event("/projects");
  stranger.sender.sender_id.open_id = "ou_stranger";
  const group = f.event("/projects");
  group.message.chat_type = "group";
  const bot = f.event("/projects");
  bot.sender.sender_type = "app";
  const old = f.event("/projects");
  old.message.create_time = String(f.clock() - DAY - 1);
  const future = f.event("/projects");
  future.message.create_time = String(f.clock() + 60_001);
  const malformed = f.event("/projects");
  malformed.message.content = "bad json";
  for (const event of [stranger, group, bot, old, future, malformed, {}, null])
    f.bot.receive(event);
  await f.bot.tick();
  assert.equal(f.calls.length, 0);
  assert.equal(f.replies.length, 0);
});

test("deduplicates before execution, persists on receipt, and resumes a turn across restart with changed history IDs", async () => {
  const f = fixture();
  const event = f.event("Build café 中文 🎮");
  f.bot.receive(event);
  f.bot.receive(event);
  assert.equal(new Store(f.folder, "app:owner").state.deliveries.length, 1);
  await f.bot.tick();
  assert.equal(f.calls.filter((c) => c.operation === "send").length, 1);
  await f.bot.close();
  f.messages[0]!.id = "stored-user";
  f.messages[0]!.turnId = "stored-turn";
  const restarted = f.restart();
  restarted.receive(event);
  f.finish();
  await restarted.tick();
  assert.equal(f.calls.filter((c) => c.operation === "send").length, 1);
  assert.equal(f.replies.at(-1)?.text, "Finished");
  await restarted.close();
});

test("lost send acknowledgements reconcile the external marker without repeating an accepted task", async () => {
  const f = fixture();
  f.loseSend();
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  assert.equal(f.store.state.deliveries[0]?.phase, "watching");
  f.finish();
  await f.bot.tick();
  assert.equal(f.calls.filter((c) => c.operation === "send").length, 1);
  assert.equal(f.replies.at(-1)?.text, "Finished");
});

test("an empty cancelled response reports cancellation instead of success", async () => {
  const f = fixture();
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  f.finish("", "cancelled");
  await f.bot.tick();
  assert.match(f.replies.at(-1)!.text, /Task cancelled/);
});

test("disposal cancels an in-flight waiter without issuing a stop or repeating its send", async () => {
  const f = fixture();
  const original = f.sessions.request.bind(f.sessions);
  let reached = false;
  f.sessions.request = ((
    request: PluginSessionRequest,
    options?: { signal?: AbortSignal },
  ) => {
    if (request.operation !== "send") return original(request, options);
    reached = true;
    return new Promise((_resolve, reject) =>
      options!.signal!.addEventListener(
        "abort",
        () => reject(new Error("disposed")),
        { once: true },
      ),
    );
  }) as PluginSessions["request"];
  f.bot.receive(f.event("Build"));
  const waiting = f.bot.tick();
  assert.equal(reached, true);
  await f.bot.close();
  await assert.rejects(waiting);
  assert.equal(f.calls.filter((c) => c.operation === "stop").length, 0);
  assert.equal(
    new Store(f.folder, "app:owner").state.deliveries[0]?.phase,
    "dispatching",
  );
});

test("an interrupted dispatch with no matching history is disclosed and never resent", async () => {
  const f = fixture();
  f.bot.receive(f.event("Build"));
  const d = f.store.state.deliveries[0]!;
  d.phase = "dispatching";
  d.target = { projectId: "p", conversationId: "c" };
  d.prompt = `[Feishu message ${d.id}]\n\nBuild`;
  f.store.save();
  const restarted = f.restart();
  await restarted.tick();
  assert.equal(f.calls.filter((c) => c.operation === "send").length, 0);
  assert.match(f.replies.at(-1)!.text, /not confirmed/);
});

test("approval is reported once across restart; bot text cannot grant it, and stop is an explicit command", async () => {
  const f = fixture();
  f.bot.receive(f.event("Write"));
  await f.bot.tick();
  f.approval();
  await f.bot.tick();
  assert.match(f.replies[0]!.text, /cannot approve/);
  await f.bot.close();
  const restarted = f.restart();
  await restarted.tick();
  assert.equal(f.replies.length, 1);
  restarted.receive(f.event("/approve", "om_2"));
  await restarted.tick();
  assert.equal(f.calls.filter((c) => c.operation === "send").length, 1);
  assert.match(f.replies.at(-1)!.text, /Approvals must be handled in OhMyGame/);
  restarted.receive(f.event("/stop", "om_3"));
  await restarted.tick();
  assert.equal(f.calls.filter((c) => c.operation === "stop").length, 1);
});

test("new input is not queued and bindings cannot change while a task is pending", async () => {
  const f = fixture();
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  f.bot.receive(f.event("Another task", "om_2"));
  f.bot.receive(f.event("/new", "om_3"));
  await f.bot.tick();
  await f.bot.tick();
  assert.equal(f.calls.filter((c) => c.operation === "send").length, 1);
  assert.equal(f.calls.filter((c) => c.operation === "create").length, 0);
  assert.ok(f.replies.some((r) => r.text.includes("not queued")));
});

test("reply retries use the same UUID after a lost acknowledgement/restart, then stop before the remote deduplication window expires", async () => {
  const f = fixture();
  f.failReply(true);
  f.bot.receive(f.event("/help"));
  await f.bot.tick();
  await f.bot.close();
  const restarted = f.restart();
  f.advance(10_000);
  await restarted.tick();
  assert.equal(f.replies.length, 2);
  assert.equal(f.replies[0]?.uuid, f.replies[1]?.uuid);
  f.advance(51 * 60_000);
  await restarted.tick();
  assert.equal(f.replies.length, 2);
  assert.equal(
    new Store(f.folder, "app:owner").state.deliveries[0]?.outgoing[0]?.state,
    "failed",
  );
});

test("clock rollback terminates retries even before the next scheduled attempt", async () => {
  const f = fixture();
  f.failReply(true);
  f.bot.receive(f.event("/help"));
  await f.bot.tick();
  f.advance(-1_000);
  await f.bot.tick();
  assert.equal(f.store.state.deliveries[0]!.outgoing[0]!.state, "failed");
  f.advance(20_000);
  await f.bot.tick();
  assert.equal(f.replies.length, 1);
});

test("an exhausted approval notice does not suppress the final result after restart", async () => {
  const f = fixture();
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  f.approval();
  f.failReply(true);
  for (let i = 0; i < 5; i++) {
    await f.bot.tick();
    f.advance(60_000);
  }
  assert.equal(f.replies.length, 5);
  await f.bot.close();
  f.failReply(false);
  f.finish("Finished after approval");
  const restarted = f.restart();
  await restarted.tick();
  await restarted.tick();
  assert.equal(f.replies.length, 6);
  assert.equal(f.replies.at(-1)!.text, "Finished after approval");
});

test("failed partial replies abandon only their remaining chunks and become prunable, including old stored failures", async () => {
  for (const legacyFailure of [false, true]) {
    const f = fixture();
    f.bot.receive(f.event("Build"));
    await f.bot.tick();
    f.finish("界".repeat(9_000));
    await f.bot.tick();
    f.failReply(true);
    await f.bot.tick();
    const d = f.store.state.deliveries[0]!;
    assert.equal(d.outgoing.length, 3);
    if (legacyFailure) {
      d.outgoing[1]!.state = "failed";
      f.store.save();
    }
    await f.bot.close();
    f.advance(51 * 60_000);
    f.failReply(false);
    const restarted = f.restart();
    await restarted.tick();
    assert.deepEqual(
      new Store(f.folder, "app:owner").state.deliveries[0]!.outgoing.map(
        (o) => o.state,
      ),
      ["sent", "failed", "failed"],
    );
    assert.equal(f.replies.length, 2);
    f.advance(DAY);
    restarted.receive(f.event("/help", "om_2"));
    assert.deepEqual(
      new Store(f.folder, "app:owner").state.deliveries.map((d) => d.id),
      ["om_2"],
    );
  }
});

test("restart never executes persisted requests that expired before dispatch", async () => {
  for (const text of ["Build", "/new", "/stop", "/project p"]) {
    const f = fixture();
    f.bot.receive(f.event(text));
    await f.bot.close();
    f.advance(DAY + 1);
    await f.restart().tick();
    assert.equal(f.calls.length, 0);
    assert.match(f.replies[0]!.text, /expired.*not executed/i);
    assert.deepEqual(new Store(f.folder, "app:owner").state.bindings.oc_chat, {
      projectId: "p",
      conversationId: "c",
    });
  }
});

test("completed, failed and empty cancelled turns preserve outcomes; chunking is Unicode safe and partial reply order survives restart", async () => {
  const f = fixture();
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  const content = '中文🎮\n"'.repeat(3_000);
  f.finish(content, "failed");
  await f.bot.tick();
  await f.bot.close();
  const restarted = f.restart();
  for (let i = 0; i < 15; i++) await restarted.tick();
  assert.equal(
    f.replies.map((r) => r.text).join(""),
    content + "\n\nTask failed. Check OhMyGame for details.",
  );
  assert.ok(
    f.replies.every(
      (r) => Buffer.byteLength(JSON.stringify({ text: r.text })) <= 12_000,
    ),
  );
  assert.equal(new Set(f.replies.map((r) => r.uuid)).size, f.replies.length);
  assert.equal(parts(content).join(""), content);
});

test("unknown/damaged stores stay untouched, unknown fields survive writes, and credential identity changes isolate bindings", () => {
  const f = fixture();
  const original = readFileSync(f.store.file, "utf8");
  writeFileSync(f.store.file, '{"version":2}');
  assert.throws(() => new Store(f.folder, "app:owner"));
  assert.equal(readFileSync(f.store.file, "utf8"), '{"version":2}');
  writeFileSync(f.store.file, "{broken");
  assert.throws(() => new Store(f.folder, "app:owner"));
  assert.equal(readFileSync(f.store.file, "utf8"), "{broken");
  const value = JSON.parse(original);
  value.futureField = { intact: true };
  writeFileSync(f.store.file, JSON.stringify(value));
  new Store(f.folder, "app:owner").save();
  assert.deepEqual(JSON.parse(readFileSync(f.store.file, "utf8")).futureField, {
    intact: true,
  });
  assert.deepEqual(new Store(f.folder, "different:owner").state.bindings, {});
});

test("REST transport refreshes tokens and preserves reply UUID/content, rejects API errors and oversized responses", async () => {
  const requests: {
    url: string;
    body: Record<string, unknown>;
    headers: HeadersInit | undefined;
  }[] = [];
  let now = 0,
    error = false,
    oversized = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      body: JSON.parse(init!.body as string),
      headers: init!.headers,
    });
    return new Response(
      oversized
        ? "x".repeat(128_001)
        : JSON.stringify(
            url.includes("tenant_access_token")
              ? { code: 0, tenant_access_token: "fixture-token", expire: 7_200 }
              : { code: error ? 999 : 0 },
          ),
    );
  };
  const transport = new FeishuTransport(
    "cli_fixture",
    "secret",
    fetcher,
    () => now,
  );
  const signal = new AbortController().signal;
  await transport.reply("om_1", "中文", "uuid", signal);
  await transport.reply("om_1", "中文", "uuid", signal);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[1]?.body, {
    msg_type: "text",
    content: JSON.stringify({ text: "中文" }),
    uuid: "uuid",
  });
  now = 8_000_000;
  await transport.reply("om_1", "text", "id", signal);
  assert.equal(requests.length, 5);
  error = true;
  await assert.rejects(
    transport.reply("om_1", "text", "id", signal),
    /rejected/,
  );
  oversized = true;
  await assert.rejects(
    transport.reply("om_1", "text", "id", signal),
    /too large/,
  );
});

test("pairing requires a fresh local code in a private user message; one concurrent sender wins", async () => {
  const f = fixture();
  const { Pairing } = await import("../plugins/feishu/src/pairing.ts");
  const pair = new Pairing(
    f.folder,
    "pair-app",
    f.sessions,
    f.transport,
    undefined,
    f.clock,
    f.clock,
  );
  await assert.rejects(pair.begin(), /connection/);
  pair.connection = "connected";
  await pair.receive(f.event("/projects"));
  await pair.tick();
  assert.equal(f.calls.length, 0);
  await pair.begin();
  const code = pair.status().code!;
  await pair.begin();
  assert.deepEqual(pair.status().code, code);
  const group = f.event(code.text);
  group.message.chat_type = "group";
  const app = f.event(code.text);
  app.sender.sender_type = "app";
  const stale = f.event(code.text);
  stale.message.create_time = String(f.clock() - 60_001);
  for (const event of [group, app, stale, f.event("/bind wrong")])
    await pair.receive(event);
  assert.equal(pair.account.owner, null);
  const other = f.event(code.text, "om_other");
  other.sender.sender_id.open_id = "ou_other";
  await Promise.all([pair.receive(f.event(code.text)), pair.receive(other)]);
  assert.equal(pair.account.owner, "ou_owner");
  assert.equal(pair.status().code, undefined);
  await pair.tick();
  assert.equal(f.calls.length, 0, "pairing must never dispatch an agent task");
  assert.match(f.replies[0]!.text, /Account bound/);
  const ledger = new Store(f.folder, "pair-app:ou_owner");
  assert.equal(
    ledger.state.deliveries[0]!.text,
    "/bind",
    "consumed code is not stored",
  );
  await pair.receive(f.event("/projects", "om_projects"));
  await pair.tick();
  assert.equal(f.calls[0]?.operation, "projects");
  await pair.close();
});

test("pairing expires without renewal on reads, on clock rollback and on restart", async () => {
  const f = fixture();
  const { Pairing } = await import("../plugins/feishu/src/pairing.ts");
  let monotonic = 0;
  const make = () =>
    new Pairing(
      f.folder,
      "expiry-app",
      f.sessions,
      f.transport,
      undefined,
      f.clock,
      () => monotonic,
    );
  let pair = make();
  pair.connection = "connected";
  await pair.begin();
  let code = pair.status().code!;
  monotonic += 300_000;
  await pair.receive(f.event(code.text));
  assert.equal(pair.account.owner, null);
  assert.equal(pair.status().code, undefined);
  await pair.begin();
  code = pair.status().code!;
  f.advance(-1);
  await pair.receive(f.event(code.text));
  assert.equal(pair.account.owner, null);
  await pair.begin();
  code = pair.status().code!;
  await pair.close();
  pair = make();
  pair.connection = "connected";
  await pair.receive(f.event(code.text));
  assert.equal(pair.account.owner, null);
  await pair.begin();
  code = pair.status().code!;
  f.advance(300_000);
  await pair.receive(f.event(code.text));
  assert.equal(pair.account.owner, null);
  await pair.close();
});

test("rebind keeps the old owner until success, isolates ledgers and persists explicit unbind", async () => {
  const f = fixture();
  const { Pairing } = await import("../plugins/feishu/src/pairing.ts");
  const make = () =>
    new Pairing(
      f.folder,
      "rebind-app",
      f.sessions,
      f.transport,
      "ou_owner",
      f.clock,
      f.clock,
    );
  let pair = make();
  pair.connection = "connected";
  const oldLedger = new Store(f.folder, "rebind-app:ou_owner");
  await pair.begin();
  await pair.cancel();
  assert.equal(pair.account.owner, "ou_owner");
  assert.equal(pair.status().code, undefined);
  await pair.begin();
  await pair.receive(f.event("/project p", "om_select"));
  await pair.tick();
  assert.equal(
    new Store(f.folder, "rebind-app:ou_owner").state.bindings.oc_chat
      ?.projectId,
    "p",
  );
  const event = f.event(pair.status().code!.text, "om_bind2");
  event.sender.sender_id.open_id = "ou_second";
  await pair.receive(event);
  await pair.tick();
  assert.equal(pair.account.owner, "ou_second");
  assert.deepEqual(
    new Store(f.folder, "rebind-app:ou_second").state.bindings,
    {},
  );
  const before = f.calls.length;
  await pair.receive(f.event("/projects", "om_old"));
  await pair.tick();
  assert.equal(f.calls.length, before);
  await pair.close();
  pair = make();
  assert.equal(pair.account.owner, "ou_second");
  await pair.unbind();
  await pair.close();
  pair = make();
  assert.equal(
    pair.account.owner,
    null,
    "legacy owner must not resurrect after unbind",
  );
  assert.ok(readFileSync(oldLedger.file, "utf8").includes("om_select"));
  await pair.close();
});

test("account files preserve unknown data and reject damaged/newer formats; failed writes cannot grant a new owner", async () => {
  const f = fixture();
  const { AccountStore } = await import("../plugins/feishu/src/store.ts");
  const { Pairing } = await import("../plugins/feishu/src/pairing.ts");
  const account = new AccountStore(f.folder, "account-app", "ou_owner");
  writeFileSync(
    account.file,
    JSON.stringify({ version: 1, owner: "ou_owner", future: { keep: true } }),
  );
  new AccountStore(f.folder, "account-app").set(null);
  assert.deepEqual(JSON.parse(readFileSync(account.file, "utf8")).future, {
    keep: true,
  });
  for (const raw of [
    '{"version":2,"owner":null}',
    '{"version":1,"owner":42}',
    "broken",
  ]) {
    writeFileSync(account.file, raw);
    assert.throws(() => new AccountStore(f.folder, "account-app", "ou_owner"));
    assert.equal(readFileSync(account.file, "utf8"), raw);
  }
  const pair = new Pairing(
    f.folder,
    "failure-app",
    f.sessions,
    f.transport,
    "ou_owner",
    f.clock,
    f.clock,
  );
  pair.connection = "connected";
  await pair.begin();
  renameSync(pair.account.file, `${pair.account.file}.saved`);
  mkdirSync(pair.account.file);
  const event = f.event(pair.status().code!.text);
  event.sender.sender_id.open_id = "ou_second";
  await assert.rejects(pair.receive(event));
  assert.equal(pair.account.owner, "ou_owner");
  await assert.rejects(pair.unbind());
  assert.equal(pair.account.owner, "ou_owner");
  await pair.close();
});

test("rebinding aborts the old delivery waiter without stopping accepted daemon tasks", async () => {
  const f = fixture();
  const { Pairing } = await import("../plugins/feishu/src/pairing.ts");
  const ledger = new Store(f.folder, "lifetime-app:ou_owner");
  ledger.state.bindings.oc_chat = { projectId: "p", conversationId: "c" };
  ledger.save();
  let waiting = false,
    aborted = false;
  const sessions = {
    request: async (
      request: PluginSessionRequest,
      options?: { signal?: AbortSignal },
    ) => {
      if (request.operation === "send") {
        waiting = true;
        return new Promise((_resolve, reject) =>
          options?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(options.signal!.reason);
            },
            { once: true },
          ),
        );
      }
      return f.sessions.request(request);
    },
  } as PluginSessions;
  const pair = new Pairing(
    f.folder,
    "lifetime-app",
    sessions,
    f.transport,
    "ou_owner",
    f.clock,
    f.clock,
  );
  pair.connection = "connected";
  await pair.receive(f.event("Build", "om_build"));
  const tick = pair.tick().catch(() => {});
  for (let i = 0; i < 20 && !waiting; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(waiting, true);
  await pair.begin();
  const event = f.event(pair.status().code!.text, "om_switch");
  event.sender.sender_id.open_id = "ou_second";
  await pair.receive(event);
  await tick;
  assert.equal(aborted, true);
  assert.equal(pair.account.owner, "ou_second");
  assert.equal(
    f.calls.some((call) => call.operation === "stop"),
    false,
  );
  assert.equal(
    f.replies.some((reply) => reply.id === "om_build"),
    false,
  );
  await pair.close();
});

// Card mode uses the same durable worker as legacy text delivery.
function cardFixture() {
  const f = fixture();
  const sent: {
    id: string;
    card: import("../plugins/feishu/src/cards.ts").Card;
    update: boolean;
  }[] = [];
  const original = f.sessions.request;
  let selected = { provider: "test", id: "one" },
    level = "low";
  f.sessions.request = (async (r: PluginSessionRequest) => {
    if (["settings", "model", "reasoning"].includes(r.operation))
      f.calls.push(r);
    if (r.operation === "settings")
      return {
        models: ["one", "two"].map((id) => ({
          provider: "test",
          id,
          name: id,
          providerName: "Test",
          levels: ["low", "high"],
        })),
        model: selected,
        level,
        busy: false,
        loading: false,
        truncated: false,
      };
    if (r.operation === "model") {
      selected = r.model;
      return { changed: true };
    }
    if (r.operation === "reasoning") {
      assert.deepEqual(r.model, selected);
      level = r.level;
      return { changed: true };
    }
    return original(r);
  }) as PluginSessions["request"];
  let next = 0;
  f.transport.card = async (id, card, _uuid, _signal, update = false) => {
    const messageId = update ? id : `om_card${++next}`;
    sent.push({ id: messageId, card: structuredClone(card), update });
    return messageId;
  };
  const latest = () => sent.at(-1)!;
  const click = (kind: string, option?: string, entry = latest()) => {
    const [token, action] = Object.entries(entry.card.actions).find(
      ([, a]) =>
        a.kind === kind &&
        (!option ||
          (a.kind === "model"
            ? a.model.id
            : a.kind === "reasoning"
              ? a.level
              : "") === option),
    )!;
    const select = ["project", "conversation", "model", "reasoning"].includes(
      action.kind,
    );
    return {
      operator: { open_id: "ou_owner" },
      host: "im_message",
      context: { open_chat_id: "oc_chat", open_message_id: entry.id },
      action: {
        tag: select ? "select_static" : "button",
        value: { card: entry.card.id, ...(select ? {} : { action: token }) },
        ...(select ? { option: token } : {}),
      },
    };
  };
  return { ...f, sent, latest, click };
}

test("cards persist and acknowledge before model/reasoning work, update the original panel, and reject repeats and strangers", async () => {
  const f = cardFixture();
  f.bot.receive(f.event("/panel"));
  await f.bot.tick();
  assert.equal(f.latest().card.panel, true);
  const initial = f.latest();
  const click = f.click("model", "two");
  const foreign = structuredClone(click);
  foreign.operator.open_id = "ou_other";
  assert.equal(f.bot.action(foreign).toast.type, "error");
  assert.equal(f.bot.action(click).toast.type, "info");
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 0);
  assert.equal(f.bot.action(click).toast.type, "error");
  assert.ok(
    new Store(f.folder, "app:owner").state.deliveries.some(
      (d) => d.action?.kind === "model",
    ),
  );
  await f.bot.tick();
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 1);
  assert.equal(f.latest().id, initial.id);
  assert.equal(f.latest().update, true);
  assert.notEqual(f.latest().card.id, initial.card.id);
  assert.equal(f.bot.action(f.click("reasoning", "high")).toast.type, "info");
  await f.bot.tick();
  assert.deepEqual(
    f.calls.find((r) => r.operation === "reasoning"),
    {
      operation: "reasoning",
      projectId: "p",
      conversationId: "c",
      model: { provider: "test", id: "two" },
      level: "high",
    },
  );
  assert.match(JSON.stringify(f.latest().card.payload), /思考：高/);
});

test("card actions recover once after restart, never repeat an uncertain mutation, and reject malformed stored actions", async () => {
  const f = cardFixture();
  f.bot.receive(f.event("/panel"));
  await f.bot.tick();
  f.bot.action(f.click("model", "two"));
  const restarted = f.restart();
  await restarted.tick();
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 1);
  const state = JSON.parse(readFileSync(f.store.file, "utf8"));
  const action = state.deliveries.find((d: Delivery) => d.action);
  action.phase = "dispatching";
  action.outgoing = [];
  writeFileSync(f.store.file, JSON.stringify(state));
  await f.restart().tick();
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 1);
  assert.match(JSON.stringify(f.latest().card.payload), /未能确认/);
  action.action = { kind: "reasoning", level: "high" };
  writeFileSync(f.store.file, JSON.stringify(state));
  assert.throws(() => new Store(f.folder, "app:owner"), /preserved/);
});

test("stale selections and forwarded cards cannot mutate a different conversation; clock rollback and expiry reject callbacks", async () => {
  const f = cardFixture();
  f.bot.receive(f.event("/panel"));
  await f.bot.tick();
  const click = f.click("model", "two");
  const forwarded = structuredClone(click);
  forwarded.context.open_chat_id = "oc_elsewhere";
  assert.equal(f.bot.action(forwarded).toast.type, "error");
  f.store.state.bindings.oc_chat!.conversationId = "different";
  assert.equal(f.bot.action(click).toast.type, "error");
  f.store.state.bindings.oc_chat!.conversationId = "c";
  f.advance(-1);
  assert.equal(f.bot.action(click).toast.type, "error");
  f.advance(DAY + 2);
  assert.equal(f.bot.action(click).toast.type, "error");
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 0);
});

test("queued card actions recheck the selection before mutating", async () => {
  const f = cardFixture();
  f.bot.receive(f.event("/panel", "om_1"));
  await f.bot.tick();
  const first = f.latest();
  f.bot.receive(f.event("/panel", "om_2"));
  await f.bot.tick();
  f.bot.action(f.click("model", "two", first));
  f.store.state.bindings.oc_chat!.conversationId = "changed-after-ack";
  await f.bot.tick();
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 0);
});

test("task cards keep Markdown results in place and stop only the recorded turn", async () => {
  const f = cardFixture();
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  const progress = f.latest();
  assert.match(JSON.stringify(progress.card.payload), /正在处理/);
  assert.equal(f.bot.action(f.click("stop")).toast.type, "info");
  await f.bot.tick();
  assert.deepEqual(
    f.calls.find((r) => r.operation === "stop"),
    { operation: "stop", projectId: "p", conversationId: "c", turnId: "t" },
  );
  f.finish("## 完成\n\n```ts\nconst x = a < b;\n```");
  await f.bot.tick();
  const result = f.sent.findLast((s) => s.id === progress.id)!;
  assert.match(JSON.stringify(result.card.payload), /## 完成/);
  assert.match(JSON.stringify(result.card.payload), /a < b/);
  assert.ok(!Object.values(result.card.actions).some((a) => a.kind === "stop"));
});

test("failed callback persistence returns an error and cannot execute from mutated memory", async () => {
  const f = cardFixture();
  f.bot.receive(f.event("/panel"));
  await f.bot.tick();
  const click = f.click("model", "two");
  renameSync(f.store.file, `${f.store.file}.original`);
  mkdirSync(f.store.file);
  assert.equal(f.bot.action(click).toast.type, "error");
  await assert.rejects(f.bot.tick(), /restart/);
  assert.equal(f.calls.filter((r) => r.operation === "model").length, 0);
});

test("v1 outboxes migrate without dropping pending replies or unknown data; newer versions stay untouched", () => {
  const f = fixture();
  f.bot.receive(f.event("/help"));
  const old = JSON.parse(readFileSync(f.store.file, "utf8"));
  old.version = 1;
  old.extra = { retained: true };
  writeFileSync(f.store.file, JSON.stringify(old));
  const migrated = new Store(f.folder, "app:owner");
  migrated.save();
  const saved = JSON.parse(readFileSync(f.store.file, "utf8"));
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.deliveries, old.deliveries);
  assert.deepEqual(saved.extra, old.extra);
  saved.version = 3;
  const raw = JSON.stringify(saved);
  writeFileSync(f.store.file, raw);
  assert.throws(() => new Store(f.folder, "app:owner"), /preserved/);
  assert.equal(readFileSync(f.store.file, "utf8"), raw);
});

test("REST cards use interactive replies, retain the returned message ID and PATCH the same message without another permission", async () => {
  const { resultCard } = await import("../plugins/feishu/src/cards.ts");
  const requests: { url: string; method: string; body: unknown }[] = [];
  const transport = new FeishuTransport(
    "cli_1234567890abcdef",
    "fixture",
    (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init!.method!,
        body: JSON.parse(init!.body as string),
      });
      return Response.json(
        String(url).includes("tenant_access_token")
          ? { code: 0, tenant_access_token: "fixture", expire: 7200 }
          : { code: 0, data: { message_id: "om_created" } },
      );
    }) as typeof fetch,
  );
  const signal = new AbortController().signal;
  const card = resultCard("## 完成\n\n结果 **已保存**。");
  assert.equal(
    await transport.card("om_user", card, "stable-uuid", signal),
    "om_created",
  );
  await transport.card("om_created", card, "stable-uuid", signal, true);
  assert.equal(requests[1]!.method, "POST");
  assert.deepEqual(requests[1]!.body, {
    msg_type: "interactive",
    content: JSON.stringify(card.payload),
    uuid: "stable-uuid",
  });
  assert.equal(requests[2]!.method, "PATCH");
  assert.ok(requests[2]!.url.endsWith("/messages/om_created"));
  assert.deepEqual(requests[2]!.body, {
    content: JSON.stringify(card.payload),
  });
});

test("panel pagination retains all choices and identifies current selections outside the visible page", async () => {
  const { panel } = await import("../plugins/feishu/src/cards.ts");
  const f = cardFixture();
  const original = f.sessions.request;
  f.sessions.request = (async (r: PluginSessionRequest) =>
    r.operation === "projects"
      ? {
          projects: Array.from({ length: 45 }, (_, i) => ({
            id: i === 44 ? "p" : `p${i}`,
            name: `项目 ${i}`,
          })),
          truncated: false,
        }
      : original(r)) as PluginSessions["request"];
  const first = await panel(
    f.sessions.request,
    f.store.state.bindings.oc_chat,
    false,
  );
  const third = await panel(
    f.sessions.request,
    f.store.state.bindings.oc_chat,
    false,
    2,
    "projects",
  );
  assert.equal(
    Object.values(first.actions).filter((a) => a.kind === "project").length,
    20,
  );
  assert.equal(
    Object.values(third.actions).filter((a) => a.kind === "project").length,
    5,
  );
  assert.match(JSON.stringify(first.payload), /项目 44/);
  assert.ok(
    Object.values(third.actions).some(
      (a) => a.kind === "project" && a.projectId === "p",
    ),
  );
  assert.ok(Buffer.byteLength(JSON.stringify(first.payload)) < 30_000);
});

test("a lost card-create acknowledgement reuses its UUID and updates the recovered message with the final result", async () => {
  const f = cardFixture();
  const uuids: string[] = [];
  let created = false;
  f.transport.card = async (id, card, uuid, _signal, update = false) => {
    if (!update) {
      uuids.push(uuid);
      if (!created) {
        created = true;
        throw new Error("Lost acknowledgement after remote creation");
      }
      return "om_remote";
    }
    assert.equal(id, "om_remote");
    f.sent.push({ id, card: structuredClone(card), update });
    return id;
  };
  f.bot.receive(f.event("Build"));
  await f.bot.tick();
  f.finish("## 完成\n\n恢复后的结果");
  const bot = f.restart();
  await bot.tick();
  assert.equal(uuids.length, 2);
  assert.equal(uuids[0], uuids[1]);
  assert.match(JSON.stringify(f.latest().card.payload), /恢复后的结果/);
  assert.equal(f.calls.filter((r) => r.operation === "send").length, 1);
});
