import { randomBytes } from "node:crypto";
import type { PluginSessions } from "../../../app/src/shared/plugin-sessions.js";
import { AccountStore, Store } from "./store.ts";
import { Bot, parseMessage, type Transport } from "./bot.ts";

export type ConnectionState = "connecting" | "connected" | "error";
const LIFETIME = 5 * 60_000;

/** One app activation owns the account, challenge and bot; settings requests are only waiters. */
export class Pairing {
  private bot?: Bot;
  private pending?: {
    text: string;
    startedAt: number;
    expiresAt: number;
    deadline: number;
  };
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  connection: ConnectionState = "connecting";
  readonly account: AccountStore;
  constructor(
    private folder: string,
    private appId: string,
    private sessions: PluginSessions,
    private transport: Transport,
    legacyOwner?: unknown,
    private now = Date.now,
    private monotonic = () => performance.now(),
  ) {
    this.account = new AccountStore(folder, appId, legacyOwner);
    if (this.account.owner) this.bot = this.makeBot(this.account.owner);
  }
  private makeBot(owner: string) {
    return new Bot(
      new Store(this.folder, `${this.appId}:${owner}`),
      this.sessions,
      this.transport,
      owner,
      this.now,
    );
  }
  private serial<T>(work: () => Promise<T> | T): Promise<T> {
    const result = this.queue.then(() => {
      if (this.stopped) throw new Error("Feishu connection stopped");
      return work();
    });
    this.queue = result.catch(() => {});
    return result;
  }
  private challenge() {
    const p = this.pending;
    if (
      p &&
      (this.now() < p.startedAt ||
        this.now() >= p.expiresAt ||
        this.monotonic() >= p.deadline)
    )
      this.pending = undefined;
    return this.pending;
  }
  status(locale: unknown = "en"): {
    message: string;
    detail?: string;
    code?: { text: string; expiresAt: number };
    actions: string[];
  } {
    const zh = locale === "zh-CN";
    const pending = this.challenge();
    const owner = this.account.owner;
    const connected = this.connection === "connected";
    const message = connected
      ? owner
        ? zh
          ? "已连接 · 已绑定账号"
          : "Connected · Account bound"
        : zh
          ? "已连接 · 等待绑定"
          : "Connected · No account bound"
      : this.connection === "error"
        ? zh
          ? "连接失败，请检查凭据、事件订阅和网络后重启插件。"
          : "Connection failed. Check credentials, event subscription and network, then restart the plugin."
        : zh
          ? "正在连接飞书…"
          : "Connecting to Feishu…";
    return {
      message,
      ...(pending
        ? {
            detail: zh
              ? `复制下方消息，私聊发送给机器人以完成绑定。${owner ? "完成前原账号仍可使用。" : ""}`
              : `Copy this message and send it privately to the bot to bind your account.${owner ? " The current account stays active until then." : ""}`,
            code: { text: pending.text, expiresAt: pending.expiresAt },
          }
        : owner
          ? { detail: owner }
          : {}),
      actions: pending
        ? ["cancel-pair"]
        : [
            ...(connected ? [owner ? "rebind" : "pair"] : []),
            ...(owner ? ["unbind"] : []),
          ],
    };
  }
  begin() {
    return this.serial(() => {
      if (this.connection !== "connected")
        throw new Error("Wait for the Feishu connection before binding");
      // Repeated clicks/requests return the same challenge; reads never extend its lifetime.
      if (this.challenge()) return;
      const startedAt = this.now();
      this.pending = {
        text: `/bind ${randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")}`,
        startedAt,
        expiresAt: startedAt + LIFETIME,
        deadline: this.monotonic() + LIFETIME,
      };
    });
  }
  cancel() {
    return this.serial(() => {
      this.pending = undefined;
    });
  }
  unbind() {
    return this.serial(async () => {
      this.account.set(null);
      this.pending = undefined;
      const old = this.bot;
      this.bot = undefined;
      await old?.close();
    });
  }
  action(event: unknown) {
    if (this.stopped || !this.bot)
      return {
        toast: { type: "error", content: "请先在 OhMyGame 绑定账号。" },
      };
    return this.bot.action(event);
  }
  receive(event: unknown) {
    return this.serial(async () => {
      const message = parseMessage(event, this.now());
      if (!message) return;
      if (/^\/bind(?:\s|$)/i.test(message.text)) {
        const pending = this.challenge();
        if (
          !pending ||
          message.text !== pending.text ||
          message.at < pending.startedAt - 60_000
        )
          return;
        const next =
          message.owner === this.account.owner && this.bot
            ? this.bot
            : this.makeBot(message.owner);
        // Save the receipt before acknowledging the event. Never store the single-use secret.
        next.store.receive(
          {
            id: message.id,
            chatId: message.chatId,
            at: message.at,
            text: "/bind",
          },
          this.now(),
        );
        this.account.set(message.owner);
        this.pending = undefined;
        const old = this.bot;
        this.bot = undefined;
        if (old !== next) await old?.close(); // Aborts only delivery/waiters; daemon-owned accepted tasks keep running.
        if (this.stopped) await next.close();
        else this.bot = next;
        return;
      }
      this.bot?.receive(event);
    });
  }
  tick() {
    return this.bot?.tick() ?? Promise.resolve();
  }
  async close() {
    this.stopped = true;
    this.pending = undefined;
    await this.bot?.close();
    await this.queue;
  }
}
