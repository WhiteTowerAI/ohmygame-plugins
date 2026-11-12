# Command Code

Adds Command Code to OhMyGame as a coding agent, and as a model provider with
your own API key.

## Agent

| Command | Sign in | Install |
| --- | --- | --- |
| `command-code acp` | `command-code login` | [commandcode.ai](https://commandcode.ai/docs/quickstart) |

It speaks the [Agent Client Protocol](https://agentclientprotocol.com) and is
started as `command-code`, not `cmd`, which is a different program on Windows.
It's off until it's turned on in Settings → Agents; OhMyGame runs only
`--version` before that. Its logo is from commandcode.ai; OhMyGame shows it
from plugin API 2.5.0, and older versions show a terminal mark.

## Provider

- Base URL: `https://api.commandcode.ai/provider/v1`
- API key: From Command Code Studio → Settings → API Keys, on the Provider plan. Claude models are only served through Command Code's own protocol and aren't listed. ([docs](https://commandcode.ai/docs/provider-api))

Enter the key on the plugin's page or in Settings → Providers. Models are read
from the provider's `/models`, so new ones appear by themselves.

Published as `@ohmygame/command-code` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
