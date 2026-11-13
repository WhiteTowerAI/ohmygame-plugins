import type { PluginContext } from "../../../app/src/shared/extension-host-protocol.js";
import type { Transport } from "./bot.ts";
import { Pairing, type ConnectionState } from "./pairing.ts";
import { FeishuTransport } from "./transport.ts";

interface Connection extends Transport {
  start(
    receive: (data: unknown) => Promise<void>,
    status: (state: ConnectionState) => void,
  ): Promise<void>;
  close(): void;
}
export async function activate(
  context: PluginContext,
  connect: (appId: string, appSecret: string) => Connection = (id, secret) =>
    new FeishuTransport(id, secret),
) {
  if (!context.sessions) return;
  let pairing: Pairing | undefined;
  let failed = false;
  const status = (input: unknown) => {
    const locale = (input as { locale?: string } | null)?.locale;
    return (
      pairing?.status(locale) ?? {
        message:
          locale === "zh-CN"
            ? failed
              ? "无法读取账号数据，请查看插件日志。原文件已保留。"
              : "保存 App ID 和 App Secret 后连接飞书。"
            : failed
              ? "Cannot load account data. Check the plugin log; original files were preserved."
              : "Save your App ID and App Secret to connect to Feishu.",
        actions: [],
      }
    );
  };
  context.registerCommand("settingsStatus", status);
  for (const [handler, action] of [
    ["beginPairing", "begin"],
    ["cancelPairing", "cancel"],
    ["unbind", "unbind"],
  ] as const)
    context.registerCommand(handler, async (input) => {
      if (!pairing) throw new Error("Configure the Feishu connection first");
      await pairing[action]();
      return status(input);
    });
  const { appId, appSecret, ownerOpenId } = context.configuration;
  if (
    typeof appId !== "string" ||
    !/^cli_[0-9a-fA-F]{16}$/.test(appId) ||
    typeof appSecret !== "string" ||
    !appSecret.trim()
  )
    return;
  const transport = connect(appId, appSecret);
  try {
    pairing = new Pairing(
      context.dataFolder,
      appId,
      context.sessions,
      transport,
      ownerOpenId,
    );
  } catch {
    failed = true;
    transport.close();
    console.error(
      "Feishu account or delivery data could not be read; original files preserved.",
    );
    return;
  }
  const connection = pairing;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let warned = false;
  context.onDispose(async () => {
    stopped = true;
    clearTimeout(timer);
    transport.close();
    await connection.close();
  });
  const poll = async () => {
    if (stopped) return;
    try {
      await connection.tick();
      warned = false;
    } catch {
      if (!stopped && !warned)
        console.error(
          "Feishu delivery processing failed; check the plugin's data folder and restart. Accepted tasks continue in OhMyGame.",
        );
      warned = true;
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void poll();
      }, 1_000);
      timer.unref();
    }
  };
  let receiveWarned = false;
  try {
    await transport.start(
      async (data) => {
        try {
          await connection.receive(data);
          receiveWarned = false;
        } catch (error) {
          if (!receiveWarned)
            console.error(
              "Feishu message could not be saved; it was not acknowledged. Check the plugin data folder and restart.",
            );
          receiveWarned = true;
          throw error;
        }
      },
      (state) => {
        if (!stopped) connection.connection = state;
      },
    );
  } catch {
    connection.connection = "error";
  }
  void poll();
}
