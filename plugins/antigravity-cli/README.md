# Antigravity CLI

Adds Antigravity CLI to Settings → Agents, beside Claude Code and Codex. Install it, sign in with `agy acp --login`, then turn it on in Settings → Agents; OhMyGame reads its models from the agent. Use it with a Google account; Gemini Code Assist plans can also use Gemini CLI.

| Command | Sign in | Install |
| --- | --- | --- |
| `agy acp` | `agy acp --login` | [antigravity.google](https://antigravity.google/docs/cli/install) |

It speaks the [Agent Client Protocol](https://agentclientprotocol.com). It's off
until it's turned on in Settings → Agents; OhMyGame runs only `--version` before
that.

The logo belongs to its maker and is from [LobeHub Icons](https://github.com/lobehub/lobe-icons)
(MIT), as OhMyGame's built-in agents' are. OhMyGame shows it from plugin API
2.5.0; older versions show a terminal mark.

Published as `@ohmygame/antigravity-cli` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
