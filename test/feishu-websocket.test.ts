import assert from "node:assert/strict";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import protobuf from "protobufjs";
import { WebSocketServer, type WebSocket } from "ws";
import { FeishuTransport } from "../plugins/feishu/src/transport.ts";

// The official SDK's pbbp2 envelope. Exercise its actual socket, fragment decoder and event dispatcher.
const frame = protobuf
  .parse(
    `syntax = "proto2";
message Header { required string key = 1; required string value = 2; }
message Frame { required uint64 SeqID = 1; required uint64 LogID = 2; required int32 service = 3; required int32 method = 4; repeated Header headers = 5; optional bytes payload = 8; }`,
    { keepCase: true },
  )
  .root.lookupType("Frame");
async function until(check: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "socket condition timed out");
    await delay(10);
  }
}

test("closing while SDK connection discovery is pending cannot open a late socket", async () => {
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  let resolve!: (value: unknown) => void;
  let requested = false,
    connected = false;
  const pending = new Promise((done) => {
    resolve = done;
  });
  server.on("connection", () => {
    connected = true;
  });
  const transport = new FeishuTransport(
    "cli_1234567890abcdef",
    "fixture",
    fetch,
    Date.now,
    async () => {
      requested = true;
      return pending;
    },
  );
  try {
    await transport.start(() => assert.fail("No event expected"));
    await until(() => requested);
    transport.close();
    resolve({
      code: 0,
      data: {
        URL: `ws://127.0.0.1:${address.port}/?device_id=fixture&service_id=1`,
        ClientConfig: {
          PingInterval: 60,
          ReconnectCount: -1,
          ReconnectInterval: 0.01,
          ReconnectNonce: 0,
        },
      },
    });
    await delay(100);
    assert.equal(connected, false);
  } finally {
    transport.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test(
  "SDK socket receives framed events, reports persistence failure, reconnects, and stays closed after disposal",
  { timeout: 15_000 },
  async () => {
    const server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const sockets: WebSocket[] = [],
      acknowledgements: number[] = [],
      received: unknown[] = [];
    let reject = false;
    server.on("connection", (socket) => {
      sockets.push(socket);
      socket.on("message", (raw) => {
        const data = frame.decode(Buffer.from(raw as Buffer)) as unknown as {
          method: number;
          payload?: Uint8Array;
        };
        if (data.method === 1 && data.payload)
          acknowledgements.push(
            JSON.parse(Buffer.from(data.payload).toString()).code,
          );
      });
    });
    const transport = new FeishuTransport(
      "cli_1234567890abcdef",
      "fixture",
      fetch,
      Date.now,
      async () => ({
        code: 0,
        data: {
          URL: `ws://127.0.0.1:${address.port}/?device_id=fixture&service_id=1`,
          ClientConfig: {
            PingInterval: 60,
            ReconnectCount: -1,
            ReconnectInterval: 0.01,
            ReconnectNonce: 0,
          },
        },
      }),
    );
    const send = (socket: WebSocket, id: string) =>
      socket.send(
        frame
          .encode({
            SeqID: 1,
            LogID: 1,
            service: 1,
            method: 1,
            headers: [
              { key: "type", value: "event" },
              { key: "message_id", value: id },
              { key: "sum", value: "1" },
              { key: "seq", value: "0" },
            ],
            payload: Buffer.from(
              JSON.stringify({
                schema: "2.0",
                header: { event_type: "im.message.receive_v1", event_id: id },
                event: {
                  sender: {
                    sender_type: "user",
                    sender_id: { open_id: "ou_owner" },
                  },
                  message: {
                    message_id: "om_test",
                    chat_id: "oc_test",
                    chat_type: "p2p",
                    message_type: "text",
                    content: '{"text":"hello"}',
                    create_time: String(Date.now()),
                  },
                },
              }),
            ),
          })
          .finish(),
      );
    try {
      await transport.start((data) => {
        if (reject) throw new Error("disk unavailable");
        received.push(data);
      });
      await until(() => sockets.length === 1);
      await delay(30);
      send(sockets[0]!, "event-1");
      await until(() => acknowledgements.length === 1);
      assert.equal(acknowledgements[0], 200);
      assert.equal(
        (received[0] as { message: { content: string } }).message.content,
        '{"text":"hello"}',
      );
      reject = true;
      send(sockets[0]!, "event-2");
      await until(() => acknowledgements.length === 2);
      assert.equal(acknowledgements[1], 500);
      sockets[0]!.terminate();
      await until(() => sockets.length === 2);
      await delay(30);
      reject = false;
      send(sockets[1]!, "event-3");
      await until(() => received.length === 2);
      transport.close();
      await until(() => server.clients.size === 0);
      await delay(100);
      assert.equal(sockets.length, 2);
    } finally {
      transport.close();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
