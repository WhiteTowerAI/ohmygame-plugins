# Feishu

An optional OhMyGame plugin for a private conversation with your own Feishu
bot. It is not preinstalled. Requires the app's API 2.5 session support
(OhMyGame PR #819) and the connection settings UI from PR #820. Older
API 2.5 builds lack the pairing controls; use a build including both PRs.

## Set up

1. Create an enterprise self-built app in the [Feishu Developer Console](https://open.feishu.cn/app).
   Enable its bot, add yourself to its availability scope, and enable the
   permissions to receive private messages (`im:message.p2p_msg:readonly`) and
   send bot messages (`im:message:send_as_bot`). Publish the app version with
   those permissions according to your tenant's approval process.
2. Add this plugin in OhMyGame and review its native code, secrets and
   cross-project session access. In its Settings, enter the App ID and App Secret,
   then save. You do not need to look up a user ID.
3. Enable the plugin for all projects. In Feishu's Events and Callbacks, select
   **Receive events through persistent connection**, then subscribe to
   `im.message.receive_v1`. The plugin must be running while Feishu verifies
   the connection. Save/publish the subscription as required by the console.
4. Once Settings shows **Connected**, click **Bind account**, copy the generated
   `/bind …` message and send it privately to this bot within five minutes.
   The plugin recognizes and saves your account, and the bot confirms binding.
   A connected socket alone does not prove the message subscription is working:
   this exchange confirms incoming and outgoing messages. If no confirmation
   appears, check the subscription and bot permissions above.
5. Private-message the bot with `/projects`, then `/project <id>` and `/new`
   (or `/conversations` and `/conversation <id>`). Send a text message to start.
   Choose a default model in OhMyGame first, or use an existing conversation
   with its selected model.
6. Keep OhMyGame open, or accept its offer to keep running after closing the
   window. Quit stops the bot; sleep interrupts connectivity. Reopen normally
   to reconnect. Approve pending actions in OhMyGame, never through bot text.

Use **Rebind account** to generate a new code for another account. The current
account keeps working until that code is received. **Cancel binding** keeps the
current account; **Unbind account** removes access immediately. Codes are
single-use, expire after five minutes and do not survive a plugin restart.
Closing the Settings tab does not cancel one. Ordinary first messages, wrong
codes and group messages never bind an account or receive project information.

Existing manually configured `ownerOpenId` values are imported once when no
account file exists. The field is hidden in the new settings UI. An explicit
unbind stays unbound after restart, even if that old setting is still stored.

No public callback URL or relay is required. This version supports Feishu
self-built apps and private text messages only: no Lark, groups, attachments,
streaming replies or remote approval buttons. Bot command replies are English;
the plugin settings are localized in English and Chinese.

## Commands

| Command              | Action                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `/projects`          | List up to 30 projects with their IDs                               |
| `/project <id>`      | Select a project; clear the selected conversation                   |
| `/conversations`     | List up to 30 conversations in that project                         |
| `/conversation <id>` | Select an existing conversation                                     |
| `/new`               | Create and select a conversation (send text to persist it)          |
| `/status`            | Show the selection, agent status and failed reply count             |
| `/stop`              | Stop the selected conversation, including a turn started in the app |
| `/help`              | Show commands                                                       |

Switching is refused while this chat has an unfinished request. Additional
text is refused while a request runs; it is not queued. Empty conversations
do not survive app restart. Deleted/archived conversations must be selected
again. The plugin sends only responses to its own text requests, not an
automatic mirror of unrelated conversation history. Output may contain project
content and leaves the computer for Feishu.

## Delivery and storage

The app owns accepted agent tasks. Disabling the plugin, changing its settings,
closing its connection or restarting its host does not stop those tasks.
`/stop` is explicit. Pending approvals are reported once per request, and a
completed response is split into ordered UTF-8-safe chunks if needed.

The plugin saves the bound account in a versioned App ID-scoped account file.
It also stores versioned chat selections, incoming message IDs, request text and
pending replies in its private app data folder. A ledger is scoped by App ID
and allowed open_id; changing the secret retains it, changing either identity
starts a separate ledger. Rebinding stops old-account delivery and polling;
it does not stop accepted agent tasks. Rebinding the same account retains its
ledger. The App Secret can change without losing the saved account. Unknown fields are preserved, and invalid or newer
stores are never overwritten. Keep one OhMyGame instance per data directory.

Incoming messages are persisted before acknowledgement. IDs are retained for
at least 24 hours; older events and events more than a minute in the future
are ignored. Persisted requests older than 24 hours at dispatch are reported
as expired without executing them, including after a restart. The ledger allows
2,000 records and 16 MiB, and refuses new work if full. Finished records expire
on subsequent receipt; unfinished tasks are
reported after a day and left running in OhMyGame. Disk write failures stop
further mutations until the plugin restarts; check the plugin log.

Send/create/stop calls are never automatically retried after interruption.
Agent prompts include a stable `[Feishu message om_…]` marker, so a lost send
acknowledgement can be reconciled from source-attributed history even after
runtime turn IDs change. If no matching history can be found (including
truncation or edits), the bot reports uncertainty and asks you to inspect the
app before resending. This deliberately prefers a visible missed request over
executing a task twice.

Outbound chunks use a deterministic UUID with Feishu's reply deduplication.
They get at most five attempts, within 50 minutes of the first attempt; a
clock rollback also stops retries. An expired or exhausted reply is marked
failed, and later chunks of that reply are also marked failed. A failed approval
notice does not prevent delivery of the task's final result. `/status` reports
failed replies; the full conversation remains in OhMyGame. This is bounded retry, not a claim
of permanent exactly-once delivery. Clearing the data folder discards this
protection and the chat selection.

## Development and verification

From the repository root, run `npm ci`, `npm run build:feishu`,
`npm run typecheck` and `npm test`. Then add `plugins/feishu` from This computer
with Develop on. The build bundles the pinned official Node SDK and includes
its dependency licenses; the installed app runs no package installation.
The test/publish workflows build the same artifact before packing it.

Tests cover durable deduplication, ambiguous sends, restart reconciliation,
owner isolation, approvals, bounded/partial retries, corrupted state and real
SDK WebSocket framing/reconnect/close against a local server. Live tenant
subscription, permission approval and end-user delivery still need a real
Feishu test app; local fixtures cannot establish those outcomes.

Protocol references: [official Node SDK](https://github.com/larksuite/node-sdk),
[receive-message event](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive),
[reply API](https://open.feishu.cn/document/server-docs/im-v1/message/reply).

The plugin bundles the Feishu logo from the official website; source and
artwork attribution are in [assets/NOTICE.md](assets/NOTICE.md).
