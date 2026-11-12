# Language Models

Adds model providers to OhMyGame's Settings → Providers, each with your own
API key. It holds the providers OhMyGame doesn't include; more join over time.

| Provider | Base URL | API key |
| --- | --- | --- |
| Command Code | `https://api.commandcode.ai/provider/v1` | Command Code Studio → Settings → API Keys ([docs](https://commandcode.ai/docs/provider-api)) |

Enter a key on the plugin's page or in Settings → Providers and that provider
joins; leave it empty and it stays out. Models are read from each provider's `/models`, so new
ones appear by themselves. Command Code serves Claude models only through its
Anthropic-style endpoint, so they aren't listed here.

Published as `@ohmygame/language-models` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
