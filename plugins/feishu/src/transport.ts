import {
  EventDispatcher,
  LoggerLevel,
  WSClient,
  defaultHttpInstance,
} from "@larksuiteoapi/node-sdk";
import type { Transport } from "./bot.ts";

const ORIGIN = "https://open.feishu.cn";
type DiscoveryOptions = Parameters<
  NonNullable<
    ConstructorParameters<typeof WSClient>[0]["httpInstance"]
  >["request"]
>[0];
const quietLogger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** SDK owns framing, heartbeat and reconnect; our bounded REST client owns reply cancellation. */
export class FeishuTransport implements Transport {
  private token?: { value: string; until: number };
  private socket?: WSClient;
  private readonly lifetime = new AbortController();
  constructor(
    private appId: string,
    private appSecret: string,
    private fetcher = fetch,
    private now = Date.now,
    private discover = (
      options: DiscoveryOptions,
      signal: AbortSignal,
    ): Promise<unknown> => defaultHttpInstance.request({ ...options, signal }),
  ) {}
  async start(receive: (data: unknown) => void) {
    // SDK logs can contain endpoint credentials. Only fixed lifecycle messages leave this adapter.
    this.lifetime.signal.throwIfAborted();
    const httpInstance = Object.create(defaultHttpInstance) as NonNullable<
      ConstructorParameters<typeof WSClient>[0]["httpInstance"]
    >;
    // SDK 1.76 checks close only after discovery AND handshake. Reject late
    // discovery before it can open a socket for an already disposed plugin.
    httpInstance.request = async <T = unknown, R = T>(
      options: DiscoveryOptions,
    ): Promise<R> => {
      this.lifetime.signal.throwIfAborted();
      const result = await this.discover(options, this.lifetime.signal);
      this.lifetime.signal.throwIfAborted();
      return result as R;
    };
    this.socket = new WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: LoggerLevel.error,
      logger: quietLogger,
      httpInstance,
      handshakeTimeoutMs: 15_000,
      onReady: () => console.info("Feishu connected"),
      onReconnected: () => console.info("Feishu reconnected"),
      onReconnecting: () => console.warn("Feishu reconnecting"),
      onError: () =>
        console.error(
          "Feishu connection failed; check app credentials, event subscription and network, then restart the plugin",
        ),
    });
    await this.socket.start({
      eventDispatcher: new EventDispatcher({ logger: quietLogger }).register({
        "im.message.receive_v1": async (data) => {
          this.lifetime.signal.throwIfAborted();
          receive(data);
        },
      }),
    });
  }
  close() {
    this.lifetime.abort();
    this.socket?.close({ force: true });
  }
  private async post(
    endpoint: string,
    body: unknown,
    signal: AbortSignal,
    token?: string,
  ) {
    const response = await this.fetcher(`${ORIGIN}${endpoint}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Feishu HTTP ${response.status}`);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 128_000) throw new Error("Feishu response is too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (result.code !== 0) {
      this.token = undefined;
      throw new Error("Feishu rejected the request");
    }
    return result;
  }
  async reply(
    messageId: string,
    text: string,
    uuid: string,
    signal: AbortSignal,
  ) {
    if (!this.token || this.token.until <= this.now()) {
      const result = await this.post(
        "/open-apis/auth/v3/tenant_access_token/internal",
        { app_id: this.appId, app_secret: this.appSecret },
        signal,
      );
      if (
        typeof result.tenant_access_token !== "string" ||
        !result.tenant_access_token ||
        typeof result.expire !== "number" ||
        result.expire < 120
      )
        throw new Error("Invalid Feishu token response");
      this.token = {
        value: result.tenant_access_token,
        until: this.now() + Math.min(result.expire - 60, 7_000) * 1_000,
      };
    }
    await this.post(
      `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`,
      { msg_type: "text", content: JSON.stringify({ text }), uuid },
      signal,
      this.token.value,
    );
  }
}
