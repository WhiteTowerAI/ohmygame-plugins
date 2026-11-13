import { randomUUID } from "node:crypto";
import { panel, resultCard, type Card } from "./cards.ts";
import type { PluginSessions } from "../../../app/src/shared/plugin-sessions.js";
import { DAY, Store, parts, replyUuid, type Delivery } from "./store.ts";

export interface Transport {
  card?(
    messageId: string,
    card: Card,
    uuid: string,
    signal: AbortSignal,
    update?: boolean,
  ): Promise<string>;
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

  /** No network work before the callback ACK. The durable worker owns accepted actions. */
  action(event: unknown) {
    const toast = (content: string, type = "error") => ({
      toast: { type, content },
    });
    if (this.controller.signal.aborted || !event || typeof event !== "object")
      return toast("连接已关闭，请重新打开面板。");
    const e = event as {
      operator?: { open_id?: string };
      host?: string;
      context?: { open_chat_id?: string; open_message_id?: string };
      action?: {
        tag?: string;
        option?: string;
        value?: { card?: string; action?: string };
      };
    };
    if (e.operator?.open_id !== this.owner || e.host !== "im_message")
      return toast("此卡片不属于当前绑定账号。");
    const id = e.action?.value?.card;
    const d = this.store.state.deliveries.find(
      (d) =>
        d.chatId === e.context?.open_chat_id &&
        d.outgoing.some(
          (o) =>
            o.card?.id === id && o.messageId === e.context?.open_message_id,
        ),
    );
    const out = d?.outgoing.find((o) => o.card?.id === id);
    const card = out?.card;
    if (
      !d ||
      !card ||
      !out ||
      this.now() < d.at ||
      this.now() - d.at > DAY ||
      card.consumed
    )
      return toast("卡片已过期或操作已收到，请发送 /panel 打开最新面板。");
    const token =
      e.action?.tag === "select_static"
        ? e.action.option
        : e.action?.tag === "button"
          ? e.action.value?.action
          : undefined;
    const action =
      token && Object.hasOwn(card.actions, token)
        ? card.actions[token]
        : undefined;
    if (!action) return toast("无效操作，请刷新面板。");
    const binding = this.store.state.bindings[d.chatId];
    if (
      action.kind !== "panel" &&
      action.kind !== "stop" &&
      (binding?.projectId !== card.binding?.projectId ||
        binding?.conversationId !== card.binding?.conversationId)
    )
      return toast("当前会话已改变，请刷新面板。");
    try {
      card.consumed = true;
      this.store.receive(
        {
          id: `ca_${randomUUID()}`,
          chatId: d.chatId,
          text: "/card",
          at: this.now(),
          action,
          ...(card.binding ? { expectedBinding: { ...card.binding } } : {}),
          replyTo: d.replyTo ?? d.id,
          ...(card.panel ? { updateMessageId: out.messageId } : {}),
        },
        this.now(),
      );
      return toast("已收到，正在处理。", "info");
    } catch {
      return toast("操作未保存，请重启插件后重试。");
    }
  }
  private t(en: string, zh: string) {
    return this.transport.card ? zh : en;
  }
  private pending(d: Delivery) {
    return this.store.state.deliveries.some(
      (other) =>
        other !== d &&
        other.chatId === d.chatId &&
        (other.phase === "watching" ||
          (other.action && other.phase === "dispatching")),
    );
  }
  private async showPanel(d: Delivery, notice?: string) {
    const action = d.action?.kind === "panel" ? d.action : undefined;
    const card = await panel(
      this.request,
      this.store.state.bindings[d.chatId],
      this.pending(d),
      action?.page,
      action?.section,
      notice,
    );
    d.phase = "done";
    d.outgoing.push({
      key: "panel:0",
      text: "操作面板",
      card,
      ...(d.updateMessageId ? { messageId: d.updateMessageId } : {}),
      state: "pending",
      attempts: 0,
      nextAt: 0,
    });
    this.save();
  }
  private async dispatchAction(d: Delivery) {
    const a = d.action!;
    if (a.kind === "panel") return this.showPanel(d);
    if (a.kind !== "stop" && this.pending(d))
      return this.showPanel(d, "请等待当前任务完成，或先停止任务。");
    const binding = this.store.state.bindings[d.chatId];
    if (
      a.kind !== "stop" &&
      (binding?.projectId !== d.expectedBinding?.projectId ||
        binding?.conversationId !== d.expectedBinding?.conversationId)
    )
      return this.showPanel(d, "当前会话已改变，请重新选择操作。");
    if (a.kind === "project") {
      const projects = await this.request({ operation: "projects" });
      if (!projects.projects.some((p) => p.id === a.projectId))
        throw new Error("Project unavailable");
      this.store.state.bindings[d.chatId] = { projectId: a.projectId };
    } else if (a.kind === "new") {
      if (binding?.projectId !== a.projectId)
        throw new Error("Selection changed");
      const { id } = await this.request({
        operation: "create",
        projectId: a.projectId,
      });
      binding.conversationId = id;
    } else if (a.kind === "stop") {
      const { stopped } = await this.request({
        operation: "stop",
        ...a.target,
        turnId: a.turnId,
      });
      return this.done(
        d,
        stopped ? "已请求停止此任务。" : "此任务已结束，没有停止其他任务。",
      );
    } else {
      if (
        binding?.projectId !== a.target.projectId ||
        (a.kind !== "conversation" &&
          binding.conversationId !== a.target.conversationId)
      )
        throw new Error("Selection changed");
      if (a.kind === "conversation") {
        await this.request({ operation: "read", ...a.target });
        binding.conversationId = a.target.conversationId;
      } else if (a.kind === "model")
        await this.request({ operation: "model", ...a.target, model: a.model });
      else
        await this.request({
          operation: "reasoning",
          ...a.target,
          model: a.model,
          level: a.level,
        });
    }
    // The mutation is committed before the optional presentation refresh. A failed read never repeats it.
    d.phase = "done";
    this.save();
    await this.showPanel(d);
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
    const progress =
      key === "result"
        ? d.outgoing.find((o) => o.key === "progress:0")
        : undefined;
    parts(text).forEach((part, i) =>
      i === 0 && progress
        ? Object.assign(progress, {
            text: part,
            card: resultCard(part, "任务结果"),
            state: "pending",
            attempts: 0,
            nextAt: 0,
            firstAt: undefined,
          })
        : d.outgoing.push({
            key: `${key}:${i}`,
            ...(this.transport.card
              ? {
                  card: resultCard(
                    part,
                    key === "result" ? "OhMyGame" : "需要处理",
                  ),
                  ...(d.updateMessageId && i === 0
                    ? { messageId: d.updateMessageId }
                    : {}),
                }
              : {}),
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
        else
          this.done(
            d,
            this.t(
              UNCERTAIN,
              "操作结果未能确认，请在 OhMyGame 检查后再试；不会自动重复执行。",
            ),
          );
      }
      if (d.phase === "new") {
        if (this.now() - d.at > DAY)
          this.done(
            d,
            this.t(
              "This request expired before dispatch and was not executed. Send a new message to try again.",
              "消息已过期，尚未执行。请重新发送。",
            ),
          );
        else await this.dispatch(d);
      }
      if (d.phase === "watching") await this.observe(d);
    }
    // One chunk per tick, in order within each reply. A failed approval notice must not block the result.
    for (const d of this.store.state.deliveries) {
      const now = this.now();
      const group = (key: string) =>
        key.replace(/^progress:/, "result:").replace(/:\d+$/, "");
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
        if (next.card && this.transport.card) {
          if (!next.messageId) {
            next.messageId = await this.transport.card(
              d.replyTo ?? d.id,
              next.card,
              replyUuid(d.id, next.key),
              this.controller.signal,
            );
            this.save();
          }
          // Also repair a create whose acknowledgement was lost before a newer payload was stored.
          await this.transport.card(
            next.messageId,
            next.card,
            replyUuid(d.id, next.key),
            this.controller.signal,
            true,
          );
        } else
          await this.transport.reply(
            d.replyTo ?? d.id,
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
      if (d.action) return await this.dispatchAction(d);
      if (
        this.transport.card &&
        [
          "/bind",
          "/panel",
          "面板",
          "/projects",
          "/conversations",
          "/models",
        ].includes(command!)
      )
        return await this.showPanel(d);
      if (command === "/bind")
        return this.done(
          d,
          "Account bound. Send /projects to choose a project, then /new to start a conversation.",
        );
      if (command === "/help")
        return this.done(
          d,
          this.t(
            HELP,
            "/panel 或「面板」— 选择项目、会话、模型和思考强度\n/new — 新建会话\n/status — 查看状态\n/stop — 停止当前任务\n/help — 查看帮助\n\n选择会话后直接发文字即可开始。需要审批的操作请在 OhMyGame 处理。",
          ),
        );
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
        return this.done(
          d,
          this.t(
            `Usage: ${command} <id>`,
            `用法：${command} <id>，也可发送 /panel 直接选择。`,
          ),
        );
      if (["/project", "/conversation", "/new"].includes(command!) && pending)
        return this.done(
          d,
          this.t(
            "Wait for the current request to finish, or use /stop before switching conversations.",
            "请等待当前任务完成，或发送 /stop 停止后再切换会话。",
          ),
        );
      if (command === "/project") {
        const { projects } = await this.request({ operation: "projects" });
        if (!projects.some((p) => p.id === argument))
          return this.done(
            d,
            this.t(
              "Project not found. Use /projects.",
              "项目不存在，请发送 /panel 重新选择。",
            ),
          );
        this.store.state.bindings[d.chatId] = { projectId: argument! };
        return this.done(
          d,
          this.t(
            "Project selected. Use /conversations or /new.",
            "已选择项目。发送 /panel 选择会话，或 /new 新建。",
          ),
        );
      }
      if (!binding)
        return this.done(
          d,
          this.t(
            "Choose a project with /projects and /project <id> first.",
            "请先发送 /panel 选择项目。",
          ),
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
          this.t(
            `Conversation ${id} selected. Send a message to start. Empty conversations do not survive an app restart.`,
            "已新建会话，直接发送文字即可开始。空会话不会在应用重启后保留。",
          ),
        );
      }
      if (command === "/conversation") {
        await this.request({
          operation: "read",
          projectId: binding.projectId,
          conversationId: argument!,
        });
        binding.conversationId = argument;
        return this.done(
          d,
          this.t(
            `Conversation ${argument} selected.`,
            "已选择会话，直接发送文字即可开始。",
          ),
        );
      }
      if (!binding.conversationId)
        return this.done(
          d,
          this.t(
            "Choose a conversation with /conversations or /new first.",
            "请发送 /panel 选择会话，或 /new 新建。",
          ),
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
          this.t(
            `Project ${target.projectId}\nConversation ${target.conversationId}\n${read.status}${read.needsApproval ? "\nWaiting for your approval in OhMyGame." : ""}${failed ? `\n${failed} replies could not be delivered. Check OhMyGame; tasks were not resent.` : ""}`,
            `${read.status === "running" ? "任务进行中" : read.status === "cancelling" ? "正在停止" : "当前没有运行中的任务"}${read.needsApproval ? "\n请在 OhMyGame 处理待审批操作。" : ""}${failed ? `\n有 ${failed} 条回复未能送达，请在 OhMyGame 查看。任务没有重新发送。` : ""}`,
          ),
        );
      }
      if (command === "/stop") {
        const result = await this.request({ operation: "stop", ...target });
        return this.done(
          d,
          result.stopped
            ? this.t(
                "Stop requested for the selected conversation.",
                "已请求停止当前会话的任务。",
              )
            : this.t(
                "The selected conversation is not running.",
                "当前会话没有运行中的任务。",
              ),
        );
      }
      if (command?.startsWith("/"))
        return this.done(
          d,
          this.t(
            "Unknown command. Use /help. Approvals must be handled in OhMyGame.",
            "未知命令，发送 /help 查看帮助。需要审批的操作请在 OhMyGame 处理。",
          ),
        );
      if (pending)
        return this.done(
          d,
          this.t(
            "A request is still running. Use /status or /stop; this message was not queued.",
            "任务仍在进行中，可发送 /status 查看或 /stop 停止。这条消息没有加入队列。",
          ),
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
      if (this.transport.card)
        d.outgoing.push({
          key: "progress:0",
          text: "正在处理",
          card: resultCard("正在处理…", "任务进行中", { target, turnId }),
          state: "pending",
          attempts: 0,
          nextAt: 0,
        });
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
          this.t(
            "The request could not be confirmed. Check the selected project/conversation in OhMyGame, then choose it again. Mutations are not retried.",
            "操作未能确认。请在 OhMyGame 检查项目、会话和模型状态，再发送 /panel 刷新。不会自动重复执行。",
          ),
        );
    }
  }

  private async observe(d: Delivery) {
    if (this.now() - d.at > DAY)
      return this.done(
        d,
        this.t(
          "This request has been pending for a day. Check OhMyGame for its outcome; the task was not cancelled.",
          "任务已等待一天，请在 OhMyGame 查看结果。任务没有被取消。",
        ),
      );
    try {
      const read = await this.request({ operation: "read", ...d.target! });
      const start = read.messages.findIndex(
        (m) =>
          m.role === "user" &&
          m.source?.plugin === "ohmygame/feishu" &&
          m.text === d.prompt,
      );
      if (start < 0)
        return this.done(
          d,
          this.t(
            UNCERTAIN,
            "请求结果未能确认，请在 OhMyGame 检查后再发送；不会自动重试。",
          ),
        );
      if (read.needsApproval && !d.approvalNotified) {
        d.approvalNotified = true;
        this.say(
          d,
          "approval",
          this.t(
            "Open OhMyGame to review and approve the pending action. Replying here cannot approve it. Use /stop to cancel the selected conversation.",
            "请打开 OhMyGame 审查并批准待处理操作。飞书回复不能批准；可发送 /stop 停止任务。",
          ),
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
        ? this.t(
            `\n\nTask ${failure.status}. Check OhMyGame for details.`,
            `\n\n任务${failure.status === "failed" ? "失败" : failure.status === "cancelled" ? "已取消" : "已中断"}，请在 OhMyGame 查看详情。`,
          )
        : "";
      this.done(
        d,
        (content.slice(0, 32_000) ||
          this.t(
            "No text response. Check OhMyGame for the outcome.",
            "没有文本回复，请在 OhMyGame 查看结果。",
          )) +
          suffix +
          (read.truncated || content.length > 32_000
            ? this.t(
                "\n\nResponse shortened. Read the full conversation in OhMyGame.",
                "\\n\\n结果已缩短，请在 OhMyGame 查看完整会话。",
              )
            : ""),
      );
    } catch {
      this.controller.signal.throwIfAborted();
      // Temporary daemon/read failures leave accepted tasks pending; the worker retries only the read.
    }
  }
}
