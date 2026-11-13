import type { PluginContext } from "../../../app/src/shared/extension-host-protocol.js";
import { Store } from "./store.ts";
import { Bot, type Transport } from "./bot.ts";
import { FeishuTransport } from "./transport.ts";

interface Connection extends Transport {
  start(receive: (data: unknown) => void): Promise<void>;
  close(): void;
}
export async function activate(
  context: PluginContext,
  connect: (appId: string, appSecret: string) => Connection = (id, secret) =>
    new FeishuTransport(id, secret),
) {
  if (!context.sessions) return;
  const { appId, appSecret, ownerOpenId } = context.configuration;
  if (
    typeof appId !== "string" ||
    !/^cli_[0-9a-fA-F]{16}$/.test(appId) ||
    typeof appSecret !== "string" ||
    !appSecret.trim() ||
    typeof ownerOpenId !== "string" ||
    !/^ou_[a-zA-Z0-9_-]{1,100}$/.test(ownerOpenId)
  ) {
    console.warn(
      "Set the Feishu App ID, App Secret and your allowed user open_id in the plugin's settings to connect",
    );
    return;
  }
  const store = new Store(context.dataFolder, `${appId}:${ownerOpenId}`);
  const transport = connect(appId, appSecret);
  const bot = new Bot(store, context.sessions, transport, ownerOpenId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let warned = false;
  context.onDispose(async () => {
    stopped = true;
    clearTimeout(timer);
    transport.close();
    await bot.close();
  });
  const poll = async () => {
    if (stopped) return;
    try {
      await bot.tick();
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
  await transport.start((data) => {
    try {
      bot.receive(data);
      receiveWarned = false;
    } catch (error) {
      if (!receiveWarned)
        console.error(
          "Feishu message could not be saved; it was not acknowledged. Check the plugin data folder and restart.",
        );
      receiveWarned = true;
      throw error;
    }
  });
  void poll();
}
