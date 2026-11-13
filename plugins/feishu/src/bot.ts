import type { PluginSessions } from "../../../app/src/shared/plugin-sessions.js";
import { DAY, Store, parts, replyUuid, type Delivery } from "./store.ts";

export interface Transport {
  reply(
    messageId: string,
    text: string,
    uuid: string,
    signal: AbortSignal,
  ): Promise<void>;
}
const HELP =
  "/projects — list projects\n/project <id> — choose a project\n/conversations — list conversations\n/conversation <id> — choose a conversation\n/new — create a conversation\n/status — current conversation and delivery status\n/stop — stop the selected conversation\n/help — show commands\n\nSend text after selecting a conversation. Approve actions in OhMyGame.";
const UNCERTAIN =
  "The request was not confirmed. Check the conversation in OhMyGame before sending it again; it will not be retried automatically.";

export function parseMessage(event: unknown, now: number) {
  if (!event || typeof event !== "object") return;
  const { sender, message } = event as {
    sender?: { sender_type?: string; sender_id?: { open_id?: string } };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      create_time?: string;
    };
  };
  // Do not acknowledge strangers with project information, or trust user_id/union_id fallbacks.
  if (
    sender?.sender_type !== "user" ||
    !/^ou_[a-zA-Z0-9_-]{1,100}$/.test(sender.sender_id?.open_id ?? "") ||
    message?.chat_type !== "p2p" ||
    message.message_type !== "text"
  )
    return;
  if (
    !/^om_[a-zA-Z0-9_-]{1,100}$/.test(message.message_id ?? "") ||
    !/^oc_[a-zA-Z0-9_-]{1,100}$/.test(message.chat_id ?? "")
  )
    return;
  const at = Number(message.create_time);
  if (
    !Number.isSafeInteger(at) ||
    at < now - DAY ||
    at > now + 60_000 ||
    typeof message.content !== "string" ||
    message.content.length > 64_000
  )
    return;
  let text: unknown;
  try {
    text = JSON.parse(message.content).text;
  } catch {
    return;
  }
  if (typeof text !== "string" || !text.trim() || text.length > 31_000) return;
  return {
    id: message.message_id!,
    chatId: message.chat_id!,
    text: text.trim(),
    at,
    owner: sender.sender_id!.open_id!,
  };
}

/** Only this worker mutates bindings and delivery phases. Receive persists before acknowledging Feishu. */
export class Bot {
  private readonly controller = new AbortController();
  private work: Promise<void> = Promise.resolve();
  private running = false;
  constructor(
    readonly store: Store,
    private sessions: PluginSessions,
    private transport: Transport,
    private owner: string,
    private now = Date.now,
  ) {}

  receive(event: unknown) {
    if (this.controller.signal.aborted) return;
    const message = parseMessage(event, this.now());
    if (!message || message.owner !== this.owner) return;
    const { owner: _, ...input } = message;
    this.store.receive(input, this.now());
  }

  tick(): Promise<void> {
    if (this.running || this.controller.signal.aborted) return this.work;
    this.running = true;
    this.work = this.cycle().finally(() => {
      this.running = false;
    });
    return this.work;
  }
  async close() {
    this.controller.abort();
    await this.work.catch(() => {});
  }
  private request: PluginSessions["request"] = (request) =>
    this.sessions.request(request, { signal: this.controller.signal });
  private save() {
    this.controller.signal.throwIfAborted();
    this.store.save();
  }
  private say(d: Delivery, key: string, text: string) {
    if (d.outgoing.some((o) => o.key === `${key}:0`)) return;
    parts(text).forEach((part, i) =>
      d.outgoing.push({
        key: `${key}:${i}`,
        text: part,
        state: "pending",
        attempts: 0,
        nextAt: 0,
      }),
    );
  }
  private done(d: Delivery, text: string) {
    d.phase = "done";
    this.say(d, "result", text);
    this.save();
  }

  private async cycle() {
    for (const d of this.store.state.deliveries) {
      this.controller.signal.throwIfAborted();
      if (d.phase === "dispatching") {
        // Interrupted after persisting intent. Reconcile the unique source marker, never dispatch again.
        if (d.target && d.prompt) d.phase = "watching";
        else this.done(d, UNCERTAIN);
      }
      if (d.phase === "new") {
        if (this.now() - d.at > DAY)
          this.done(
            d,
            "This request expired before dispatch and was not executed. Send a new message to try again.",
          );
        else await this.dispatch(d);
      }
      if (d.phase === "watching") await this.observe(d);
    }
    // One chunk per tick, in order within each reply. A failed approval notice must not block the result.
    for (const d of this.store.state.deliveries) {
      const now = this.now();
      const group = (key: string) => key.replace(/:\d+$/, "");
      const failed = new Set(
        d.outgoing
          .filter(
            (o) =>
              o.state === "failed" ||
              (o.state !== "sent" &&
                (o.attempts >= 5 ||
                  (o.firstAt !== undefined &&
                    (now < o.firstAt || now - o.firstAt > 50 * 60_000)))),
          )
          .map((o) => group(o.key)),
      );
      let changed = false;
      // Also settle pending siblings from older stores, so finished records can expire.
      for (const o of d.outgoing) {
        if (
          (o.state === "pending" || o.state === "sending") &&
          failed.has(group(o.key))
        ) {
          o.state = "failed";
          changed = true;
        }
      }
      if (changed) this.save();
      const next = d.outgoing.find(
        (o) => o.state === "pending" || o.state === "sending",
      );
      if (!next || next.nextAt > now) continue;
      next.state = "sending";
      next.firstAt ??= this.now();
      next.attempts++;
      this.save();
      try {
        await this.transport.reply(
          d.id,
          next.text,
          replyUuid(d.id, next.key),
          this.controller.signal,
        );
        next.state = "sent";
      } catch {
        this.controller.signal.throwIfAborted();
        next.state = "pending";
        next.nextAt = this.now() + Math.min(60_000, 2_000 * 2 ** next.attempts);
      }
      this.save();
      break;
    }
  }

  private async dispatch(d: Delivery) {
    d.phase = "dispatching";
    this.save();
    const [command, argument, ...extra] = d.text.split(/\s+/);
    const binding = this.store.state.bindings[d.chatId];
    const pending = this.store.state.deliveries.some(
      (other) =>
        other !== d && other.chatId === d.chatId && other.phase === "watching",
    );
    try {
      if (command === "/bind")
        return this.done(
          d,
          "Account bound. Send /projects to choose a project, then /new to start a conversation.",
        );
      if (command === "/help") return this.done(d, HELP);
      if (command === "/projects") {
        const result = await this.request({ operation: "projects" });
        return this.done(
          d,
          result.projects
            .slice(0, 30)
            .map((p) => `${p.name.slice(0, 100)}\n/project ${p.id}`)
            .join("\n\n") +
            (result.projects.length > 30 || result.truncated
              ? "\nMore projects are available in OhMyGame."
              : "") || "No projects. Create one in OhMyGame first.",
        );
      }
      if (
        ["/project", "/conversation"].includes(command!) &&
        (!argument || extra.length || !/^[a-zA-Z0-9_-]{1,128}$/.test(argument))
      )
        return this.done(d, `Usage: ${command} <id>`);
      if (["/project", "/conversation", "/new"].includes(command!) && pending)
        return this.done(
          d,
          "Wait for the current request to finish, or use /stop before switching conversations.",
        );
      if (command === "/project") {
        const { projects } = await this.request({ operation: "projects" });
        if (!projects.some((p) => p.id === argument))
          return this.done(d, "Project not found. Use /projects.");
        this.store.state.bindings[d.chatId] = { projectId: argument! };
        return this.done(d, "Project selected. Use /conversations or /new.");
      }
      if (!binding)
        return this.done(
          d,
          "Choose a project with /projects and /project <id> first.",
        );
      if (command === "/conversations") {
        const result = await this.request({
          operation: "conversations",
          projectId: binding.projectId,
        });
        return this.done(
          d,
          result.conversations
            .slice(0, 30)
            .map((c) => `${c.title.slice(0, 100)}\n/conversation ${c.id}`)
            .join("\n\n") +
            (result.conversations.length > 30 || result.truncated
              ? "\nMore conversations are available in OhMyGame."
              : "") || "No conversations. Use /new.",
        );
      }
      if (command === "/new") {
        const { id } = await this.request({
          operation: "create",
          projectId: binding.projectId,
        });
        binding.conversationId = id;
        return this.done(
          d,
          `Conversation ${id} selected. Send a message to start. Empty conversations do not survive an app restart.`,
        );
      }
      if (command === "/conversation") {
        await this.request({
          operation: "read",
          projectId: binding.projectId,
          conversationId: argument!,
        });
        binding.conversationId = argument;
        return this.done(d, `Conversation ${argument} selected.`);
      }
      if (!binding.conversationId)
        return this.done(
          d,
          "Choose a conversation with /conversations or /new first.",
        );
      const target = {
        projectId: binding.projectId,
        conversationId: binding.conversationId,
      };
      if (command === "/status") {
        const read = await this.request({ operation: "read", ...target });
        const failed = this.store.state.deliveries.filter(
          (other) =>
            other.chatId === d.chatId &&
            other.outgoing.some((o) => o.state === "failed"),
        ).length;
        return this.done(
          d,
          `Project ${target.projectId}\nConversation ${target.conversationId}\n${read.status}${read.needsApproval ? "\nWaiting for your approval in OhMyGame." : ""}${failed ? `\n${failed} replies could not be delivered. Check OhMyGame; tasks were not resent.` : ""}`,
        );
      }
      if (command === "/stop") {
        const result = await this.request({ operation: "stop", ...target });
        return this.done(
          d,
          result.stopped
            ? "Stop requested for the selected conversation."
            : "The selected conversation is not running.",
        );
      }
      if (command?.startsWith("/"))
        return this.done(
          d,
          "Unknown command. Use /help. Approvals must be handled in OhMyGame.",
        );
      if (pending)
        return this.done(
          d,
          "A request is still running. Use /status or /stop; this message was not queued.",
        );
      d.target = target;
      // The session API's runtime turn IDs change on reload. A stable marker can be reconciled from stored history.
      d.prompt = `[Feishu message ${d.id}]\n\n${d.text}`;
      this.save();
      const { turnId } = await this.request({
        operation: "send",
        ...target,
        text: d.prompt,
      });
      d.turnId = turnId;
      d.phase = "watching";
      this.save();
    } catch {
      this.controller.signal.throwIfAborted();
      // Includes lost acknowledgements. Observe history if this was a send; never automatically repeat mutations.
      if (d.target && d.prompt) {
        d.phase = "watching";
        this.save();
      } else
        this.done(
          d,
          "The request could not be confirmed. Check the selected project/conversation in OhMyGame, then choose it again. Mutations are not retried.",
        );
    }
  }

  private async observe(d: Delivery) {
    if (this.now() - d.at > DAY)
      return this.done(
        d,
        "This request has been pending for a day. Check OhMyGame for its outcome; the task was not cancelled.",
      );
    try {
      const read = await this.request({ operation: "read", ...d.target! });
      const start = read.messages.findIndex(
        (m) =>
          m.role === "user" &&
          m.source?.plugin === "ohmygame/feishu" &&
          m.text === d.prompt,
      );
      if (start < 0) return this.done(d, UNCERTAIN);
      if (read.needsApproval && !d.approvalNotified) {
        d.approvalNotified = true;
        this.say(
          d,
          "approval",
          "Open OhMyGame to review and approve the pending action. Replying here cannot approve it. Use /stop to cancel the selected conversation.",
        );
        this.save();
      }
      const following = read.messages.slice(start + 1);
      const end = following.findIndex((m) => m.role === "user");
      const answers = (end < 0 ? following : following.slice(0, end)).filter(
        (m) => m.role === "assistant",
      );
      if (
        read.status === "running" ||
        read.status === "cancelling" ||
        read.needsApproval ||
        answers.some((m) => m.status === "inProgress")
      )
        return;
      const failure = answers.find(
        (m) =>
          m.status === "failed" ||
          m.status === "cancelled" ||
          m.status === "interrupted",
      );
      const content = answers
        .map((m) => m.text)
        .filter(Boolean)
        .join("\n\n");
      const suffix = failure
        ? `\n\nTask ${failure.status}. Check OhMyGame for details.`
        : "";
      this.done(
        d,
        (content.slice(0, 32_000) ||
          "No text response. Check OhMyGame for the outcome.") +
          suffix +
          (read.truncated || content.length > 32_000
            ? "\n\nResponse shortened. Read the full conversation in OhMyGame."
            : ""),
      );
    } catch {
      this.controller.signal.throwIfAborted();
      // Temporary daemon/read failures leave accepted tasks pending; the worker retries only the read.
    }
  }
}
