import { randomUUID } from "node:crypto";
import type { PluginSessions } from "../../../app/src/shared/plugin-sessions.js";
import type { Binding, Target } from "./store.ts";

export type CardAction =
  | {
      kind: "panel";
      page?: number;
      section?: "projects" | "conversations" | "models";
    }
  | { kind: "project"; projectId: string }
  | { kind: "conversation"; target: Target }
  | { kind: "new"; projectId: string }
  | { kind: "model"; target: Target; model: { provider: string; id: string } }
  | {
      kind: "reasoning";
      target: Target;
      model: { provider: string; id: string };
      level: string;
    }
  | { kind: "stop"; target: Target; turnId: string };
export type Card = {
  id: string;
  payload: Record<string, unknown>;
  actions: Record<string, CardAction>;
  binding?: Binding;
  consumed?: boolean;
  panel: boolean;
};
const plain = (content: string) => ({ tag: "plain_text", content });
const markdown = (content: string) => ({ tag: "markdown", content });
const labels: Record<string, string> = {
  off: "关闭",
  minimal: "最低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "最高",
  max: "最大",
  none: "无",
  default: "默认",
};

class Builder {
  readonly card: Card;
  readonly elements: Record<string, unknown>[] = [];
  constructor(title: string, panel: boolean, binding?: Binding) {
    this.card = {
      id: randomUUID(),
      panel,
      actions: {},
      ...(binding ? { binding: { ...binding } } : {}),
      payload: {
        schema: "2.0",
        config: { update_multi: true },
        header: { title: plain(title) },
        body: { elements: this.elements },
      },
    };
  }
  text(text: string) {
    this.elements.push(markdown(text));
  }
  token(action: CardAction) {
    const id = randomUUID();
    this.card.actions[id] = action;
    return id;
  }
  behavior(action?: string) {
    return [
      {
        type: "callback",
        value: { card: this.card.id, ...(action ? { action } : {}) },
      },
    ];
  }
  button(title: string, action: CardAction, disabled = false) {
    this.elements.push({
      tag: "button",
      text: plain(title),
      type: "default",
      disabled,
      behaviors: this.behavior(this.token(action)),
    });
  }
  select(
    title: string,
    options: { label: string; action: CardAction; selected?: boolean }[],
    disabled: boolean,
  ) {
    if (!options.length) return;
    const items = options.map((o) => ({
      text: plain(o.label.slice(0, 100)),
      value: this.token(o.action),
      selected: o.selected,
    }));
    const selected = items.find((o) => o.selected)?.value;
    this.elements.push({
      tag: "select_static",
      placeholder: plain(title),
      width: "fill",
      disabled,
      ...(selected ? { initial_option: selected } : {}),
      options: items.map(({ selected: _, ...o }) => o),
      behaviors: this.behavior(),
    });
  }
}

/** Choices are snapshotted into opaque action tokens. Callback values never contain executable commands. */
export async function panel(
  request: PluginSessions["request"],
  binding: Binding | undefined,
  pending: boolean,
  page = 0,
  section = "projects",
  notice?: string,
): Promise<Card> {
  const b = new Builder("OhMyGame", true, binding);
  if (notice) b.text(notice);
  const pageSize = 20;
  function choices<T>(
    items: T[],
    group: "projects" | "conversations" | "models",
    title: string,
    map: (item: T) => { label: string; action: CardAction; selected?: boolean },
    disabled: boolean,
  ) {
    const current =
      section === group
        ? Math.min(
            Math.max(0, page),
            Math.max(0, Math.ceil(items.length / pageSize) - 1),
          )
        : 0;
    b.select(
      title,
      items.slice(current * pageSize, (current + 1) * pageSize).map(map),
      disabled,
    );
    if (current > 0)
      b.button(`${title} · 上一页`, {
        kind: "panel",
        section: group,
        page: current - 1,
      });
    if ((current + 1) * pageSize < items.length)
      b.button(`${title} · 下一页`, {
        kind: "panel",
        section: group,
        page: current + 1,
      });
  }
  const projects = await request({ operation: "projects" });
  const project = projects.projects.find((p) => p.id === binding?.projectId);
  choices(
    projects.projects,
    "projects",
    "选择项目",
    (p) => ({
      label: p.name,
      selected: p.id === binding?.projectId,
      action: { kind: "project", projectId: p.id },
    }),
    pending,
  );
  if (!projects.projects.length) b.text("还没有项目，请先在 OhMyGame 创建。");
  if (projects.truncated) b.text("部分项目未列出，请在 OhMyGame 查看。");
  if (project && binding) {
    const conversations = await request({
      operation: "conversations",
      projectId: project.id,
    });
    const conversation = conversations.conversations.find(
      (c) => c.id === binding.conversationId,
    );
    // Plain text avoids interpreting project titles as card markup.
    b.elements.push({
      tag: "div",
      text: plain(
        `${project.name.slice(0, 100)}${conversation ? ` / ${conversation.title.slice(0, 100)}` : ""}`,
      ),
    });
    choices(
      conversations.conversations,
      "conversations",
      "选择会话",
      (c) => ({
        label: c.title || "新会话",
        selected: c.id === binding.conversationId,
        action: {
          kind: "conversation",
          target: { projectId: project.id, conversationId: c.id },
        },
      }),
      pending,
    );
    b.button("新建会话", { kind: "new", projectId: project.id }, pending);
    if (conversations.truncated) b.text("部分会话未列出，请在 OhMyGame 查看。");
    if (binding.conversationId && !conversation)
      b.text("原会话已不可用，请重新选择或新建会话。");
    if (conversation) {
      const target = { projectId: project.id, conversationId: conversation.id };
      const settings = await request({ operation: "settings", ...target });
      const selected = settings.models.find(
        (m) =>
          m.provider === settings.model?.provider && m.id === settings.model.id,
      );
      const busy = pending || settings.busy;
      b.elements.push({
        tag: "div",
        text: plain(
          `模型：${selected?.name ?? (settings.model ? settings.model.id : "未选择（发送时使用默认模型）")}${settings.level ? ` · 思考：${labels[settings.level] ?? settings.level}` : ""}`,
        ),
      });
      choices(
        settings.models,
        "models",
        "切换模型",
        (m) => ({
          label: `${m.providerName} · ${m.name}`,
          selected: m === selected,
          action: {
            kind: "model",
            target,
            model: { provider: m.provider, id: m.id },
          },
        }),
        busy,
      );
      if (selected && selected.levels.length)
        b.select(
          "思考强度",
          selected.levels.map((level) => ({
            label: labels[level] ?? level,
            selected: level === settings.level,
            action: {
              kind: "reasoning",
              target,
              model: { provider: selected.provider, id: selected.id },
              level,
            },
          })),
          busy,
        );
      if (busy) b.text("任务进行中，完成后可切换模型和思考强度。");
      if (settings.loading) b.text("模型列表加载中，请稍后刷新。");
      if (!settings.models.length && !settings.loading)
        b.text("没有可用模型，请先在 OhMyGame 配置模型或登录账号。");
      if (settings.truncated) b.text("部分模型未列出，请在 OhMyGame 查看。");
    }
  } else if (binding) b.text("原项目已不可用，请重新选择。");
  b.button("刷新", { kind: "panel" });
  return b.card;
}

export function resultCard(
  text: string,
  title = "OhMyGame",
  stop?: { target: Target; turnId: string },
): Card {
  const b = new Builder(title, false);
  b.text(text);
  if (stop) b.button("停止任务", { kind: "stop", ...stop });
  else b.button("操作面板", { kind: "panel" });
  return b.card;
}

export function validAction(value: unknown): value is CardAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  const str = (v: unknown) =>
    typeof v === "string" && v.length > 0 && v.length <= 500;
  const target = a.target as Target | undefined;
  const model = a.model as { provider?: string; id?: string } | undefined;
  if (a.kind === "panel")
    return (
      (a.page === undefined ||
        (Number.isInteger(a.page) &&
          (a.page as number) >= 0 &&
          (a.page as number) <= 25)) &&
      (a.section === undefined ||
        ["projects", "conversations", "models"].includes(a.section as string))
    );
  if (a.kind === "project" || a.kind === "new") return str(a.projectId);
  if (!target || !str(target.projectId) || !str(target.conversationId))
    return false;
  if (a.kind === "conversation") return true;
  if (a.kind === "stop") return str(a.turnId);
  return (
    (a.kind === "model" || (a.kind === "reasoning" && str(a.level))) &&
    !!model &&
    str(model.provider) &&
    str(model.id)
  );
}
export function validCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const c = value as Card;
  return (
    typeof c.id === "string" &&
    c.id.length <= 128 &&
    typeof c.panel === "boolean" &&
    (c.consumed === undefined || typeof c.consumed === "boolean") &&
    !!c.payload &&
    typeof c.payload === "object" &&
    JSON.stringify(c.payload).length < 60_000 &&
    !!c.actions &&
    typeof c.actions === "object" &&
    Object.keys(c.actions).length <= 100 &&
    Object.values(c.actions).every(validAction) &&
    (c.binding === undefined ||
      (typeof c.binding.projectId === "string" &&
        (c.binding.conversationId === undefined ||
          typeof c.binding.conversationId === "string")))
  );
}
