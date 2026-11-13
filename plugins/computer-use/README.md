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
   access, and enable it in the project where you want to use it.
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

- **macOS 14+:** grant Accessibility and Screen Recording access to the runtime
  when macOS requests it. Open System Settings yourself; the agent should not
  operate permission dialogs. Restart the connection after changing permissions.
- **Windows:** use an interactive desktop session. Apps running with elevated
  privileges may be inaccessible. Focus-changing and foreground-input fallbacks
  stay off; an unsupported app action should report an error.
- **Linux:** requires an interactive desktop with AT-SPI2 accessibility support.
  Desktop sessions and apps differ, especially on Wayland. Global pointer and
  keyboard fallbacks stay off, so some coordinate or keyboard actions may fail.

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
