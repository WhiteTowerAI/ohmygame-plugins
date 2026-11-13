import { defaultHttpInstance, registerApp } from "@larksuiteoapi/node-sdk";
import type { PluginSettingsStatus } from "../../../app/src/shared/plugin-settings.js";
import { AccountStore } from "./store.ts";

type RegisterAppOptions = Parameters<typeof registerApp>[0];
type Result = Awaited<ReturnType<typeof registerApp>>;
type Register = (options: RegisterAppOptions) => Promise<Result>;

/** Restrict the SDK's registration requests without changing its WebSocket discovery or bot calls. */
export async function register(options: RegisterAppOptions): Promise<Result> {
  const interceptor = defaultHttpInstance.interceptors.request.use(
    (request) => {
      const url = new URL(request.url!);
      if (url.pathname !== "/oauth/v1/app/registration") return request;
      if (url.origin !== "https://accounts.feishu.cn")
        throw new Error("Unsupported registration domain");
      return {
        ...request,
        timeout: 8_000,
        maxRedirects: 0,
        maxContentLength: 128_000,
        maxBodyLength: 32_000,
        signal: options.signal,
      };
    },
  );
  try {
    return await registerApp(options);
  } finally {
    defaultHttpInstance.interceptors.request.eject(interceptor);
  }
}

/** The activation owns registration; Settings only starts, observes, cancels or connects it. */
export class Registration {
  private phase: "idle" | "starting" | "waiting" | "ready" | "error" = "idle";
  private error: "failed" | "expired" | "denied" | "lark" = "failed";
  private controller?: AbortController;
  private result?: Result;
  private link?: { url: string; expiresAt: number };
  private startedAt = 0;
  private deadline = 0;
  private expiry?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private disposed = false;
  constructor(
    private folder: string,
    private run: Register = register,
    private now = Date.now,
    private monotonic = () => performance.now(),
  ) {}

  private expire() {
    if (
      (this.phase === "starting" ||
        this.phase === "waiting" ||
        this.phase === "ready") &&
      (this.now() < this.startedAt ||
        this.monotonic() >= this.deadline ||
        (this.link && this.now() >= this.link.expiresAt))
    ) {
      this.cancel();
      this.phase = "error";
      this.error = "expired";
    }
  }
  status(locale?: string): PluginSettingsStatus {
    this.expire();
    const t = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
    if (this.phase === "starting")
      return {
        message: t(
          "Preparing the Feishu creation page…",
          "正在准备飞书创建页面…",
        ),
        actions: ["cancel-setup"],
      };
    if (this.phase === "waiting")
      return {
        message: t(
          "Confirm the robot and permissions in Feishu.",
          "请在飞书确认机器人和权限。",
        ),
        ...(this.link
          ? {
              link: {
                ...this.link,
                title: t("Continue in Feishu", "继续在飞书创建"),
              },
            }
          : {}),
        actions: ["cancel-setup"],
      };
    if (this.phase === "ready")
      return {
        message: t(
          "Robot created. Connect it to OhMyGame.",
          "机器人已创建，可以连接到 OhMyGame。",
        ),
        actions: ["finish-setup", "cancel-setup"],
      };
    if (this.phase === "error")
      return {
        message:
          this.error === "lark"
            ? t(
                "Use a Feishu account; Lark is not supported.",
                "请使用飞书账号，暂不支持 Lark。",
              )
            : this.error === "denied"
              ? t("Creation was declined in Feishu.", "已在飞书取消授权。")
              : this.error === "expired"
                ? t(
                    "The creation link expired. Start again.",
                    "创建链接已过期，请重新开始。",
                  )
                : t(
                    "Could not complete creation. Try again or enter existing credentials below.",
                    "未能完成创建，请重试或在下方填写已有应用凭据。",
                  ),
        actions: ["begin-setup"],
      };
    return {
      message: t(
        "Create a Feishu robot, or enter an existing app below.",
        "快捷创建飞书机器人，也可在下方填写已有应用。",
      ),
      actions: ["begin-setup"],
    };
  }

  async begin() {
    this.expire();
    if (this.disposed) throw new Error("Registration stopped");
    if (["starting", "waiting", "ready"].includes(this.phase)) return;
    const generation = ++this.generation;
    const controller = (this.controller = new AbortController());
    this.phase = "starting";
    this.startedAt = this.now();
    this.deadline = this.monotonic() + 600_000;
    let ready!: () => void;
    const prepared = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const current = () =>
      !this.disposed &&
      generation === this.generation &&
      !controller.signal.aborted;
    const fail = (code: typeof this.error) => {
      if (!current()) return;
      this.cancel();
      this.phase = "error";
      this.error = code;
      ready();
    };
    this.expiry = setTimeout(() => fail("expired"), 600_000);
    this.expiry.unref();
    // Do not persist device codes, URLs or credentials while the person is still authorizing.
    void Promise.resolve()
      .then(() =>
        this.run({
          source: "ohmygame",
          createOnly: true,
          signal: controller.signal,
          appPreset: {
            name: "OhMyGame",
            desc: "在飞书中与 OhMyGame 对话，操作项目和会话。",
          },
          addons: {
            preset: false,
            scopes: {
              tenant: ["im:message.p2p_msg:readonly", "im:message:send_as_bot"],
            },
            events: { items: { tenant: ["im.message.receive_v1"] } },
            callbacks: { items: ["card.action.trigger"] },
          },
          onQRCodeReady: ({ url, expireIn }) => {
            if (!current()) return;
            const parsed = new URL(url);
            if (
              url.length > 8192 ||
              parsed.origin !== "https://open.feishu.cn" ||
              parsed.username ||
              parsed.password ||
              !Number.isFinite(expireIn) ||
              expireIn <= 0
            )
              throw new Error("Invalid registration link");
            const lifetime = Math.min(expireIn * 1000, 600_000);
            this.link = { url, expiresAt: this.now() + lifetime };
            this.deadline = Math.min(
              this.deadline,
              this.monotonic() + lifetime,
            );
            this.phase = "waiting";
            ready();
          },
          onStatusChange: ({ status }) => {
            if (status === "domain_switched") fail("lark");
          },
        }),
      )
      .then((value) => {
        this.expire();
        if (!current()) return;
        if (value.user_info?.tenant_brand === "lark") return fail("lark");
        if (
          !/^cli_[0-9a-fA-F]{16}$/.test(value.client_id) ||
          typeof value.client_secret !== "string" ||
          !value.client_secret.trim() ||
          value.client_secret.length > 4096 ||
          /[\u0000-\u001f]/.test(value.client_secret) ||
          (value.user_info?.open_id !== undefined &&
            !/^ou_[a-zA-Z0-9_-]{1,100}$/.test(value.user_info.open_id))
        )
          return fail("failed");
        this.result = value;
        this.link = undefined;
        this.phase = "ready";
        ready();
      })
      .catch((error: unknown) => {
        const code = (error as { code?: string } | null)?.code;
        fail(
          code === "access_denied"
            ? "denied"
            : code === "expired_token"
              ? "expired"
              : "failed",
        );
        ready();
      });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      prepared,
      new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          fail("failed");
          resolve();
        }, 8_500);
      }),
    ]);
    clearTimeout(timeout);
  }

  finish(locale?: string) {
    this.expire();
    if (this.disposed || this.phase !== "ready" || !this.result)
      throw new Error("Create and authorize the robot first");
    const { client_id, client_secret, user_info } = this.result;
    // SDK identity is the person who explicitly authorized this newly created app.
    // Missing identity falls back to the existing local pairing-code flow.
    if (user_info?.open_id)
      new AccountStore(this.folder, client_id).set(user_info.open_id);
    return {
      message: locale === "zh-CN" ? "正在连接机器人…" : "Connecting the robot…",
      actions: [],
      configuration: { appId: client_id, appSecret: client_secret },
    };
  }
  cancel() {
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    clearTimeout(this.expiry);
    this.expiry = undefined;
    this.link = undefined;
    this.result = undefined;
    this.phase = "idle";
  }
  close() {
    this.disposed = true;
    this.cancel();
  }
}
