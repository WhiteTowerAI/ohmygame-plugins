# ACP Agents

Adds coding agents that speak the [Agent Client Protocol](https://agentclientprotocol.com)
to OhMyGame's Settings → Agents.

| Agent | Command | Sign in | Install |
| --- | --- | --- | --- |
| Antigravity CLI | `agy acp` | `agy acp --login` | [antigravity.google](https://antigravity.google/docs/cli/install) |
| CodeBuddy Code | `codebuddy --acp` | `codebuddy` | [codebuddy.ai](https://www.codebuddy.ai/docs/cli/installation) |
| Command Code | `command-code acp` | `command-code login` | [commandcode.ai](https://commandcode.ai/docs/quickstart) |
| Gemini CLI | `gemini --acp` | `gemini` | [geminicli.com](https://geminicli.com/docs/get-started/installation/) |

Command Code is started as `command-code`, not `cmd`, which is a different
program on Windows. Gemini CLI is for Gemini Code Assist plans; other Google
accounts use Antigravity CLI.

An agent is off until it's turned on in Settings → Agents. OhMyGame runs only
`--version` before that.

The agents' logos belong to their makers. Antigravity's, CodeBuddy's and Gemini
CLI's are from [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT), as
OhMyGame's built-in agents' are; Command Code's is from commandcode.ai. OhMyGame
shows them from plugin API 2.5.0; older versions show a terminal mark.

Published as `@ohmygame/acp-agents` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
