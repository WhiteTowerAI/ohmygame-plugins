# Computer Use

An optional OhMyGame plugin for inspecting and operating desktop applications.
Each observation and action requires approval in the conversation. It is not
preinstalled and has no app-wide background connection or cross-project session access.

## Try locally

1. Use an OhMyGame build with plugin API **2.5 or newer** (current `dev`).
2. Install Node.js **22.19+** with npm. `npx` must be on the PATH available to
   OhMyGame; restart the desktop app after installing Node.js.
3. In this repository, run `npm ci` and `npm run build:computer-use`.
4. In OhMyGame, open **Plugins → Add plugin → This computer**, select this
   `plugins/computer-use` folder with **Develop** on, review its native/process
   access. Turn **Every project** off for a project-only test, then enable it
   in the test project’s **Project plugins** panel.
5. Open a disposable document in a desktop app, then ask the agent to inspect
   that app. Review the tool and arguments in OhMyGame before approving. Reject
   one action first; it must not reach the app. Then try typing a short sentence
   into the disposable document and verifying the result.

The first MCP connection downloads **`@opensymph/open-computer-use@1.3.0`** from
npm's official registry into npm's cache. Subsequent connections reuse it.
There is no floating version, shell command string, global installation, npm
lifecycle script, or automatic OS permission grant. A connection can take longer
on its first run; use the plugin's MCP diagnostics to inspect startup failures.
The wrapper does not change other clients' MCP configuration.

## OS setup

The upstream runtime provides macOS, Windows and Linux binaries for arm64 and
x64. This is upstream support, not a claim that all apps work on every platform.

- **macOS 14+:** grant Accessibility and Screen Recording access to the runtime.
  A successful MCP connection only proves startup and tool discovery; it does not
  prove these OS permissions are granted. The MCP server may report missing
  permission without opening an authorization dialog. Use the pinned runtime's
  permission assistant below, complete its steps yourself, then quit and reopen
  OhMyGame so the runtime sees the new grants.
- **Windows:** use an interactive desktop session. Apps running with elevated
  privileges may be inaccessible. Focus-changing and foreground-input fallbacks
  stay off; an unsupported app action should report an error.
- **Linux:** requires an interactive desktop with AT-SPI2 accessibility support.
  Desktop sessions and apps differ, especially on Wayland. Global pointer and
  keyboard fallbacks stay off, so some coordinate or keyboard actions may fail.

On macOS, run this in Terminal if permissions are missing (it opens the upstream
permission assistant; it does not grant permissions automatically):

```sh
OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY=1 \
  npm_config_ignore_scripts=true \
  npm_config_registry=https://registry.npmjs.org \
  npx --yes --package @opensymph/open-computer-use@1.3.0 open-computer-use doctor
```

Keep the version and environment above consistent with the plugin. In System
Settings, follow the assistant's runtime app identity/path; granting only OhMyGame
or a different installation is not proof that this runtime has access. Complete
or close the assistant yourself. Do not run any `install-*-mcp` commands: they
configure other agent clients and are not part of this plugin's setup.

Follow the [upstream setup guide](https://github.com/opensymph/open-computer-use/tree/v1.3.0)
for platform prerequisites. If an app does not support a background action,
perform that step yourself; do not enable a global-input workaround.

## Scope and limits

The MCP allowlist contains `list_apps`, `list_windows`, `get_app_state`,
`get_window`, `get_window_state`, `click`, `perform_secondary_action`, `scroll`,
`drag`, `type_text`, `press_key`, and `set_value`. Only tools actually offered by
the platform appear. App/window observations are approved too: they can expose
private content and `get_app_state` can begin an app session. Use an explicit
app/window target and a fresh observation; prefer accessibility elements over
coordinates. No `launch_app`, `activate_window`, full-display capture or raw
shell tool is exposed. Native app-targeted actions can still affect focus or app
state; disabling global fallbacks is not a guarantee that an app never reacts.

The native hook returns `ask` for every allowed desktop call, rejects unknown
calls to this server and explicit global-input requests, and leaves other tools
alone. OhMyGame owns approval, argument display, cancellation and server lifetime.
A pending approval is not an execution grant; declining or stopping prevents that
call. There is no "allow for this session" decision. External MCP clients without
an active OhMyGame conversation cannot grant these approvals.

Once dispatched, an OS action might complete even if the request times out or
the agent stops. This runtime does not guarantee cancellation of in-flight
input, and stopping does not undo changes. Observe the app again before retrying;
never automatically repeat an operation whose outcome is uncertain. On macOS,
the shared app-agent proxy is disabled so this connection does not attach to or
replace another client's persistent helper. Closing the MCP transport ends its
own runtime process; OS permissions and npm's cache remain until you remove them.

The desktop is shared across projects, conversations and people. Run one computer
operation task at a time; the plugin does not lock other apps or clients out.
The plugin saves no desktop state or approval grants itself. The host transcript
and upstream runtime may retain observations or logs under their own policies.
Screenshots and accessibility text are sent to your selected model provider.
The native runtime runs with your user account's permissions, outside a desktop
sandbox. Project enablement and the tool allowlist are host routing/consent
boundaries, not containment of a compromised executable or other shell tools.

## Development and release

`npm test` includes the package checks plus tests of this hook with the app's
actual manifest resolution, approval gate and a fixture MCP server. The fixture
records calls and never controls a real desktop. Platform permissions, screen
capture and input must still be tested locally on each target OS before release.

The package is deliberately `private: true`. Remove that flag in a release PR
only after compatible OhMyGame builds ship and target-platform testing passes.
For a runtime update, review upstream tool schemas, startup/shutdown, permissions
and environment switches; keep the version pinned and rerun the approval and
package checks. The qualified MCP server name follows the host API 2.x contract
and is checked against `PluginServices`; revisit it if that host contract changes.

## 本地验收（macOS）

使用包含应用 #820 的开发版本；插件目前不在市场上发布。仓库已有依赖时，
只需要在仓库根目录执行 `npm run build:computer-use`。全新工作区先执行 `npm ci`。

1. 在 **插件 → 添加插件 → 本机** 选择 `plugins/computer-use` 文件夹，开启
   **开发模式**，按界面完成添加并确认权限。若只想在测试项目中使用，关闭插件页
   **所有项目**，再到测试项目的 **项目插件** 开启 **电脑操作**。
2. 在插件开发页的 **检查结果** 找到 **桌面**，点击 **测试**。首次需要联网下载。
   macOS 正常显示已连接、12 个工具。此处成功不代表已具备截图或辅助功能权限。
3. 如果后面的观察报告权限不足，在终端运行上面的 `doctor` 命令，按助手提示为
   对应运行时授予辅助功能和屏幕录制权限。完成后退出并重新打开 OhMyGame。
   无需重置系统权限，也不要运行给其他客户端安装 MCP 的命令。
4. 手动打开“文本编辑”，新建一个无重要内容的文档，输入 `CU-TEST`。在测试项目
   新建对话，选择支持工具调用和图片输入的模型，并发送：
   **“使用电脑操作插件查看文本编辑中的 CU-TEST 文档，告诉我当前文字，先不要修改。”**
   每次观察都应出现审批；允许后应能正确读取界面，而不是只宣称已连接。
5. 发送：**“在该测试文档末尾输入一行 hello computer use，然后检查结果。”**
   可以允许前面的观察；遇到输入操作审批时先点 **拒绝**。文档应保持原样。
   另发一条明确重试的消息，允许观察和输入；应只新增一行，随后能确认结果。
6. 再要求输入 `SHOULD-NOT-APPEAR`，在输入审批等待时点击对话的 **停止**。
   文档不应出现该文字，任务应结束。这个用例检查待审批取消；已经执行的输入
   不会因停止而撤销。
7. 等任务结束后，在 **项目插件** 关闭电脑操作，再要求使用它：该项目不应再能
   调用桌面工具。重新开启、新建对话后，观察和输入仍需逐次确认。插件如果在
   **所有项目** 开启，项目中的明确关闭应覆盖默认值。
8. 退出并重启 OhMyGame，重复一次观察。应能重新连接，且仍会审批。若有问题，
   记录卡住的步骤、错误原文、使用的模型/agent 和系统版本；连接错误查看开发页
   **检查结果** 的错误详情，原生插件错误查看插件页 **查看日志**。

先测内置 OhMyGame agent；若平时使用 Codex/Claude Code 等 agent，再用常用 agent
重复拒绝和停止用例。无效的目标、权限不足和不支持的输入方式应明确报错，不应改用
全局输入或终端命令绕过。Windows/Linux 的权限和输入行为需在对应系统另行验证。
