import { validAction, validCard, type Card, type CardAction } from "./cards.ts";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type Target = { projectId: string; conversationId: string };
export type Outgoing = {
  key: string;
  text: string;
  state: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  nextAt: number;
  firstAt?: number;
  card?: Card;
  messageId?: string;
};
export type Delivery = {
  id: string;
  chatId: string;
  text: string;
  at: number;
  phase: "new" | "dispatching" | "watching" | "done";
  target?: Target;
  prompt?: string;
  turnId?: string;
  approvalNotified?: boolean;
  action?: CardAction;
  expectedBinding?: Binding;
  replyTo?: string;
  updateMessageId?: string;
  outgoing: Outgoing[];
};
export type Binding = { projectId: string; conversationId?: string };
type State = {
  version: 2;
  bindings: Record<string, Binding>;
  deliveries: Delivery[];
};
export const DAY = 86_400_000;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown, max = 128): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const binding = (v: unknown): v is Binding =>
  object(v) &&
  string(v.projectId) &&
  (v.conversationId === undefined || string(v.conversationId));
const target = (v: unknown): v is Target =>
  binding(v) && string(v.conversationId);

/** One app activation owns this file. Unknown fields are retained; unknown versions fail closed. */
export class Store {
  readonly file: string;
  readonly state: State;
  private failed = false;
  constructor(folder: string, identity: string) {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    this.file = path.join(
      folder,
      `feishu-${createHash("sha256").update(identity).digest("hex")}.json`,
    );
    if (!existsSync(this.file)) {
      this.state = { version: 2, bindings: {}, deliveries: [] };
      return;
    }
    const raw = readFileSync(this.file);
    if (raw.length > 16 * 1024 * 1024)
      throw new Error(
        "Feishu delivery store is too large; original file preserved",
      );
    const v: unknown = JSON.parse(raw.toString("utf8"));
    if (
      !object(v) ||
      (v.version !== 1 && v.version !== 2) ||
      !object(v.bindings) ||
      !Object.entries(v.bindings).every(
        ([key, value]) => string(key) && binding(value),
      ) ||
      !Array.isArray(v.deliveries) ||
      v.deliveries.length > 2_000 ||
      !v.deliveries.every(
        (d: unknown) =>
          object(d) &&
          string(d.id) &&
          string(d.chatId) &&
          string(d.text, 32_000) &&
          number(d.at) &&
          ["new", "dispatching", "watching", "done"].includes(
            d.phase as string,
          ) &&
          (d.action === undefined || validAction(d.action)) &&
          (d.expectedBinding === undefined || binding(d.expectedBinding)) &&
          (d.replyTo === undefined || string(d.replyTo)) &&
          (d.updateMessageId === undefined || string(d.updateMessageId)) &&
          (d.target === undefined || target(d.target)) &&
          (d.prompt === undefined || string(d.prompt, 32_000)) &&
          (d.turnId === undefined || string(d.turnId)) &&
          (d.approvalNotified === undefined ||
            typeof d.approvalNotified === "boolean") &&
          (d.phase !== "watching" ||
            (target(d.target) && string(d.prompt, 32_000))) &&
          Array.isArray(d.outgoing) &&
          d.outgoing.length <= 16 &&
          d.outgoing.every(
            (o: unknown) =>
              object(o) &&
              string(o.key) &&
              string(o.text, 32_000) &&
              ["pending", "sending", "sent", "failed"].includes(
                o.state as string,
              ) &&
              number(o.attempts) &&
              number(o.nextAt) &&
              (o.firstAt === undefined || number(o.firstAt)) &&
              (o.messageId === undefined || string(o.messageId)) &&
              (o.card === undefined || validCard(o.card)),
          ),
      ) ||
      new Set(v.deliveries.map((d) => d.id)).size !== v.deliveries.length
    )
      throw new Error(
        "Cannot read Feishu delivery store; original file preserved",
      );
    // compat: since 0.1.0, remove from 0.3 and 2026-12-13. Keep pending v1 text replies.
    const migrate = v.version === 1;
    v.version = 2;
    this.state = v as unknown as State;
    if (migrate) this.save();
  }
  save() {
    if (this.failed)
      throw new Error(
        "Feishu delivery store needs a restart after a write failure",
      );
    const temp = `${this.file}.${randomUUID()}.tmp`;
    let fd: number | undefined;
    try {
      const data = JSON.stringify(this.state);
      if (Buffer.byteLength(data) > 16 * 1024 * 1024)
        throw new Error("Feishu delivery store is full");
      fd = openSync(temp, "wx", 0o600);
      writeFileSync(fd, data);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temp, this.file);
    } catch (error) {
      // Never continue with memory that claims an intent was safely persisted.
      this.failed = true;
      throw error;
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
  receive(
    input: Pick<
      Delivery,
      | "id"
      | "chatId"
      | "text"
      | "at"
      | "action"
      | "expectedBinding"
      | "replyTo"
      | "updateMessageId"
    >,
    now: number,
  ) {
    if (this.failed)
      throw new Error(
        "Feishu delivery store needs a restart after a write failure",
      );
    if (this.state.deliveries.some((d) => d.id === input.id)) return false;
    this.state.deliveries = this.state.deliveries.filter(
      (d) =>
        d.at >= now - DAY ||
        d.phase !== "done" ||
        d.outgoing.some((o) => o.state === "pending" || o.state === "sending"),
    );
    if (this.state.deliveries.length >= 2_000)
      throw new Error("Feishu delivery store is full; try again later");
    this.state.deliveries.push({ ...input, phase: "new", outgoing: [] });
    this.save();
    return true;
  }
}

/** Keep each Feishu text body below its UTF-8 size limit, including JSON escaping. */
export function parts(text: string): string[] {
  const result: string[] = [];
  let part = "";
  for (const character of text) {
    if (
      Buffer.byteLength(JSON.stringify({ text: part + character })) > 12_000
    ) {
      result.push(part);
      part = "";
    }
    part += character;
  }
  if (part) result.push(part);
  return result;
}

export function replyUuid(id: string, key: string) {
  return createHash("sha256").update(`${id}:${key}`).digest("hex").slice(0, 32);
}

/** App-scoped owner. A null owner is an explicit unbind, not missing configuration. */
export class AccountStore {
  readonly file: string;
  private state: Record<string, unknown> & { version: 1; owner: string | null };
  get owner() {
    return this.state.owner;
  }
  constructor(folder: string, appId: string, legacyOwner?: unknown) {
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    this.file = path.join(
      folder,
      `feishu-account-${createHash("sha256").update(appId).digest("hex")}.json`,
    );
    if (existsSync(this.file)) {
      const raw = readFileSync(this.file);
      if (raw.length > 64_000)
        throw new Error(
          "Feishu account store is too large; original file preserved",
        );
      const v: unknown = JSON.parse(raw.toString("utf8"));
      if (
        !object(v) ||
        v.version !== 1 ||
        (v.owner !== null && !validOwner(v.owner))
      )
        throw new Error(
          "Cannot read Feishu account store; original file preserved",
        );
      this.state = v as typeof this.state;
    } else {
      this.state = { version: 1, owner: null };
      // compat: since 0.1.0, remove from 0.3 and 2026-12-13. Import the early manual-owner setting once.
      // Persist null too: later configuration changes must never resurrect a previous owner.
      this.set(validOwner(legacyOwner) ? legacyOwner : null);
    }
  }
  set(owner: string | null) {
    if (owner !== null && !validOwner(owner))
      throw new Error("Invalid Feishu account");
    const next = { ...this.state, owner };
    const data = JSON.stringify(next);
    if (Buffer.byteLength(data) > 64_000)
      throw new Error(
        "Feishu account store is too large; original file preserved",
      );
    const temp = `${this.file}.${randomUUID()}.tmp`;
    let fd: number | undefined;
    try {
      fd = openSync(temp, "wx", 0o600);
      writeFileSync(fd, data);
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temp, this.file);
      this.state = next;
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
}
function validOwner(value: unknown): value is string {
  return typeof value === "string" && /^ou_[a-zA-Z0-9_-]{1,100}$/.test(value);
}
