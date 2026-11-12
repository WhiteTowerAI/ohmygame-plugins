# Gemini CLI

Adds Gemini CLI to Settings → Agents, beside Claude Code and Codex. Install it, sign in by running `gemini`, then turn it on in Settings → Agents; OhMyGame reads its models from the agent. Gemini CLI is for Gemini Code Assist plans; other Google accounts use Antigravity CLI.

| Command | Sign in | Install |
| --- | --- | --- |
| `gemini --acp` | `gemini` | [geminicli.com](https://geminicli.com/docs/get-started/installation/) |

It speaks the [Agent Client Protocol](https://agentclientprotocol.com). It's off
until it's turned on in Settings → Agents; OhMyGame runs only `--version` before
that.

The logo belongs to its maker and is from [LobeHub Icons](https://github.com/lobehub/lobe-icons)
(MIT), as OhMyGame's built-in agents' are. OhMyGame shows it from plugin API
2.5.0; older versions show a terminal mark.

Published as `@ohmygame/gemini-cli` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
