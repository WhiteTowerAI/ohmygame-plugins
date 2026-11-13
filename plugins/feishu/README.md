# Feishu

An optional OhMyGame plugin for a private conversation with your own Feishu
bot. It is not preinstalled. Requires plugin API **2.6** from
[OhMyGame PR #820](https://github.com/WhiteTowerAI/ohmygame/pull/820), including
the session service from #819. Install/update the app before this plugin.
The plugin manifest prevents API 2.5 hosts from activating this version.

## Set up

### Quick creation / 快捷创建

Enable the plugin for all projects, open **Settings → Connection**, and click
**Create a robot**. The official Feishu SDK opens a creation page: confirm with
your Feishu account, return to OhMyGame and click **Connect robot**. The app saves
the App ID and Secret without showing the secret on the page. When Feishu returns
the confirming account's `open_id`, it is bound automatically; otherwise use
**Bind account** below. Send `/panel` privately to verify both directions.

在插件设置点击 **快捷创建机器人** → 在飞书扫码确认 → 回来点 **连接机器人**。
通常无需复制 App ID、Secret 或查询用户 ID。确认创建的飞书账号会在返回身份时自动绑定，
之后仍可重新绑定或解绑。已有完整应用配置时不显示创建按钮，避免替换正在使用的机器人；
手动配置入口始终保留。

The preset requests only bot private-message receive/send permissions,
`im.message.receive_v1` and `card.action.trigger`; it requests no directory,
group-history or CardKit access. Feishu's preset/addons support is rollout-gated:
where unavailable, the platform may ignore the preset and use its default
creation flow. **Review the actual permissions in Feishu before confirming**.
After connecting, check that both events and callbacks use persistent connection,
that the subscriptions below are present, and that bot availability/publication
meet your tenant's requirements. Creation alone does not prove messages or card
clicks can reach this computer.

新增网络域名 `accounts.feishu.cn` 用于官方扫码创建；更新插件时需审阅这项权限。
预设能力受飞书灰度限制，最终权限以飞书确认页为准；若没有自动带入，请按下方手动步骤
补齐 **机器人能力、消息事件、卡片回调、长连接、可用范围及发布**。无需公网回调地址。

Creation stays active when Settings is hidden. It expires within ten minutes;
cancelling, disabling the plugin or quitting OhMyGame clears temporary local
credentials and stops polling. It does **not** delete an app already created in
Feishu. If interrupted after creation but before connecting, recover its App ID
and Secret from the Feishu Developer Console and enter them below. No device
codes, creation URLs or temporary secrets are persisted; connected credentials
use the app's existing private plugin-settings storage. Lark is not supported.

### Manual setup

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
4. In **Events and Callbacks → Callback configuration**, also select
   **Receive callbacks through persistent connection**, and add **Card action
   trigger** (`card.action.trigger`, the new callback, not `card.action.trigger_v1`).
   Save/publish as required by the console. This is separate from the message
   event subscription in step 3. No public URL, relay or card template is needed.
5. Once Settings shows **Connected**, click **Bind account**, copy the generated
   `/bind …` message and send it privately to this bot within five minutes.
   The plugin recognizes and saves your account, and the bot confirms binding.
   A connected socket alone does not prove the message subscription is working:
   this exchange confirms incoming and outgoing messages. If no confirmation
   appears, check the subscription and bot permissions above.
6. The binding reply opens an operation card. Choose a project and a conversation,
   or click **新建会话**. Select the model and thinking intensity for this
   conversation, then send text to start. Send `/panel` or `面板` to reopen it.
   Lists page by name; no copying IDs is needed. Configure/sign into models in
   OhMyGame first. Model and intensity changes also appear in the desktop app.
7. Keep OhMyGame open, or accept its offer to keep running after closing the
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
streaming replies or remote approval buttons. Use Feishu 7.20 or newer for JSON
2.0 cards. Feedback and controls are Chinese; agent answers retain their original
language and Markdown formatting. Plugin settings support English and Chinese.

### 已配置用户需要补什么

在飞书开发者后台进入 **事件与回调 → 回调配置**，选择 **使用长连接接收回调**，
添加 **卡片回传交互 `card.action.trigger`**，保存并按控制台要求发布。
已有的 `im.message.receive_v1` 消息事件继续保留。无需公网地址或手工发布卡片模板。

已有的 `im:message:send_as_bot` 权限支持发送和更新机器人自己的卡片；这次不需要
增加通讯录、历史消息、群聊或 CardKit 权限。模型和思考强度切换发生在本地 OhMyGame，
使用当前会话已有的模型账号。流式 CardKit 及其 `cardkit:card:write` 权限不在本次范围。
如果可以收到卡片但点击失败，先检查**回调配置**，再确认应用在线、版本已发布且账号仍已绑定。

本地验收：

- 未配置应用时点击快捷创建，在飞书确认后回来连接；检查 App ID 自动填入、Secret 仅显示已配置。
- 核对实际授权范围、长连接消息/卡片回调和应用发布状态；发送 `/panel` 验证自动绑定与消息往返。
- 创建途中切换设置页应保持进度；取消、过期、重启后应可重试，原有手动配置仍可用。

- 发送 `/panel`，选择项目、会话或新建会话；有多页时检查翻页和当前选择。
- 切换模型及思考强度，对照桌面当前会话；无思考选项的模型不显示该选择器。
- 发送文字，检查“正在处理”卡片随后原位变成 Markdown 结果；审批仍在桌面处理。
- 任务中点击“停止任务”，结束后再点旧按钮，确认不会停止新任务。
- 重复点击、转发卡片、应用重启后点击旧卡片；过期或已处理的操作应拒绝并提示重新打开面板。
- 检查中文反馈、代码块和长结果在桌面/手机飞书中的实际排版。

## Commands

| Command              | Action                                                              |
| -------------------- | ------------------------------------------------------------------- |
| `/panel` / `面板`     | Open the operation card                                           |
| `/projects`          | Open the project/conversation operation card                       |
| `/project <id>`      | Select a project; clear the selected conversation                   |
| `/conversations`     | Open the conversation operation card                               |
| `/models`            | Open the model and thinking-intensity controls                     |
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
`/stop` is explicit and stops the currently selected conversation. The card's
**停止任务** button instead carries its original turn ID: an old card never stops
a later turn. Pending approvals are reported once per request, and a
completed response replaces its task card, with ordered UTF-8-safe continuation
cards if needed. This is a status/final-result update, not token streaming.

Callbacks validate the bound owner, original chat/message, a persisted opaque
card/action token, selection and a 24-hour lifetime. A click consumes that card
revision and persists intent before returning a short toast; network and agent
work happen later in the worker. Repeated clicks do not repeat mutations. A
changed selection is checked again before execution. Refresh replaces the panel
in place. The callback's toast confirms receipt, not successful execution.

The plugin saves the bound account in a versioned App ID-scoped account file.
It also stores versioned chat selections, incoming message IDs, request text and
pending replies in its private app data folder. A ledger is scoped by App ID
and allowed open_id; changing the secret retains it, changing either identity
starts a separate ledger. Rebinding stops old-account delivery and polling;
it does not stop accepted agent tasks. Rebinding the same account retains its
ledger. The App Secret can change without losing the saved account. Delivery ledger v1 loads as v2 without dropping pending text replies (remove the migration no earlier than 0.3 and 2026-12-13). Unknown fields are preserved, and invalid or newer
stores are never overwritten. Keep one OhMyGame instance per data directory.

Incoming messages are persisted before acknowledgement. IDs are retained for
at least 24 hours; older events and events more than a minute in the future
are ignored. Persisted requests older than 24 hours at dispatch are reported
as expired without executing them, including after a restart. The ledger allows
2,000 records and 16 MiB, and refuses new work if full. Finished records expire
on subsequent receipt; unfinished tasks are
reported after a day and left running in OhMyGame. Disk write failures stop
further mutations until the plugin restarts; check the plugin log.

Send/create/stop/model/reasoning calls are never automatically retried after interruption.
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

Rollout: merge app #820 first. CI temporarily pins its API 2.6 commit; restore
`OHMYGAME_REF` to `dev` after that merge and before merging this plugin PR.
Publishing continues to use the app development branch. Do not publish the
plugin until API 2.6 app builds are available.

Tests also exercise the official registration protocol with a local adapter, minimal preset encoding, cancellation/expiry, identity binding and secret-free status. No test creates a real tenant app.

Tests cover durable deduplication, ambiguous sends, restart reconciliation,
owner isolation, approvals, bounded/partial retries, corrupted state and real
SDK WebSocket framing/reconnect/close and card callback ACKs against a local
server. Card cases cover model/effort changes, stale/forwarded/repeated callbacks,
turn-scoped stop, pagination, restart and v1 ledger migration. App tests exercise
the shared desktop/plugin model transitions and renderer settings events. Live tenant
subscription, permission approval and end-user delivery still need a real
Feishu test app; local fixtures cannot establish those outcomes.

Protocol references: [official Node SDK and app registration](https://github.com/larksuite/node-sdk#app-registration),
[receive-message event](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive),
[reply API](https://open.feishu.cn/document/server-docs/im-v1/message/reply),
[callback setup and three-second ACK](https://open.feishu.cn/document/event-subscription-guide/callback-subscription/receive-and-handle-callbacks),
[JSON 2.0 menus](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/single-select-dropdown-menu),
[message permissions](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1).

The plugin bundles the Feishu logo from the official website; source and
artwork attribution are in [assets/NOTICE.md](assets/NOTICE.md).
