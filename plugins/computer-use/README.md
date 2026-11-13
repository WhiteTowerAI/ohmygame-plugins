# Computer Use

An optional OhMyGame plugin for inspecting and operating desktop applications.
On macOS, approve an app once with **Allow and remember**, or choose **Allow once**.
Revoke saved access in **Plugins → Computer Use → Settings**. Windows/Linux retain
per-call approval until the runtime offers unambiguous app identities. It is not
preinstalled and has no app-wide background connection or cross-project session access.

## Try locally

1. Use an OhMyGame build with plugin API **2.7 or newer** ([app #822](https://github.com/WhiteTowerAI/ohmygame/pull/822) is merged into `dev`; use that branch until a compatible app release is available).
2. Install Node.js **22.19+** with npm. `npx` must be on the PATH available to
   OhMyGame; restart the desktop app after installing Node.js.
3. In this repository, run `npm ci` and `npm run build:computer-use`.
4. In OhMyGame, open **Plugins → Add plugin → This computer**, select this
   `plugins/computer-use` folder with **Develop** on, review its native/process
   access. Turn **Every project** off for a project-only test, then enable it
   in the test project’s **Project plugins** panel.
5. Open a disposable document in a desktop app, then ask the agent to inspect
   that app. Review the app and arguments before approving. Reject the first
   request; it must not reach the app. Then allow and remember access, and try typing a short sentence
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
the platform appear. App/window observations can expose private content and
`get_app_state` can begin an app session. On macOS, `list_apps` returns only running
app names and bundle IDs without a prompt; usage history and window titles are
removed. Every other call needs the exact `app` bundle ID, even when targeting a
window. The proxy checks the window's actual owner, rejects ambiguous/mismatched
owners and the legacy `window_id` alias, and filters `list_windows` to that app.
OhMyGame and the development Electron host cannot be targets. Use fresh
observations; prefer accessibility elements over coordinates. No `launch_app`,
`activate_window`, full-display capture or raw shell tool is exposed. Native
actions may still affect focus or app state.

The native hook always checks the current call. On macOS it requests a target
scope; the host owns **Allow and remember**, **Allow once** and **Deny**. Only
explicit remembered consent persists across conversations/restarts; different
apps require separate consent. Revoking a target invalidates pending approvals
and the next call asks again. Plugin content changes also require fresh consent.
The host stores access in its own versioned data file; the plugin cannot grant
itself access. Uninstalling the last version clears it unless **Keep data** is
selected. External MCP clients without an active OhMyGame conversation cannot
consume remembered grants. The native runtime remains trusted: bundle IDs and
window-owner checks are consent routing, not code-signature verification or an
OS sandbox. A window check and a native action are separate operations, so they
do not provide an atomic OS identity guarantee.

Windows/Linux still require per-call approval. Their pinned runtime resolves
app names/PIDs using window-title matches too; persisting an app-name grant
would not reliably identify the target. Their existing supported tools remain
available without claiming macOS-equivalent remembered access.

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
actual manifest resolution, approval gate and a fixture MCP server, plus forged
window ownership, catalog filtering and target validation. The fixture
records calls and never controls a real desktop. Platform permissions, screen
capture and input must still be tested locally on each target OS before release.

The package is deliberately `private: true`. Remove that flag in a release PR
only after compatible OhMyGame builds ship and target-platform testing passes.
For a runtime update, review upstream tool schemas, startup/shutdown, permissions
and environment switches; keep the version pinned and rerun the approval and
package checks. The qualified MCP server name follows the host API 2.x contract
and is checked against `PluginServices`; revisit it if that host contract changes.

## 本地验收（macOS）

需要包含 [#822](https://github.com/WhiteTowerAI/ohmygame/pull/822) 的应用 **`dev` 分支（插件 API 2.7）**。
插件仍未发布，使用本仓库中的 `plugins/computer-use`。仓库已有依赖时，
执行 `npm run build:computer-use`；全新工作区先执行 `npm ci`。

1. 在 **插件 → 添加插件 → 本机** 选择 `plugins/computer-use` 文件夹，开启
   **开发模式**。确认插件页和列表显示蓝色显示器与光标图标。仅测试一个项目时，
   关闭 **所有项目**，在测试项目的 **项目插件** 中开启它。
2. 开发页 **检查结果 → 桌面 → 测试** 应连接并列出 12 个工具。这个检查不代表
   macOS 已授权。原有辅助功能、屏幕录制授权有效时，无需重配；缺权限再使用上面的
   `doctor` 命令，手动完成系统授权并重启应用。
3. 手动打开文本编辑，新建无重要内容的文档，输入 `CU-TEST`。新建对话，发送：
   **“使用电脑操作查看文本编辑的 CU-TEST 文档，告诉我文字，先不要修改。”**
   列出应用无需确认；首次访问文本编辑应显示应用标识（`com.apple.textedit`）和
   **允许并记住 / 仅允许这次 / 拒绝**。先拒绝，应无法读取或操作该应用。
4. 重试并选择 **仅允许这次**，下一次访问仍应询问。再次重试选择 **允许并记住**，
   再发送 **“在文档末尾新增一行 hello computer use，然后检查结果。”**，同一应用
   连续观察和操作应不再弹窗，文字只新增一行。
5. 新建对话、再退出并重启 OhMyGame，访问文本编辑仍应保留授权。尝试另一应用，
   应单独询问，不能沿用文本编辑的授权。
6. 在 **插件 → 电脑操作 → 设置 → 已记住的访问授权** 撤销文本编辑。再次访问应询问。
   等待询问时点对话的 **停止**，不应执行待确认操作或保存授权。已派发的操作不会
   因撤销或停止而自动回滚。
7. 等任务结束，在 **项目插件** 关闭电脑操作，该项目应不再能调用它；重新开启后
   仍遵守已保存或已撤销的应用授权。修改插件代码后需要重新授权属于预期行为。

先测内置 OhMyGame agent，再用常用的 Codex/Claude Code 重复授权、撤销和停止用例。
若有问题，记录步骤、错误原文、模型/agent 和系统版本；连接错误看开发页检查结果，
原生插件错误看插件页日志。Windows/Linux 仍逐次确认，需要在对应系统另行验收。
