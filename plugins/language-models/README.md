# Language Models

Adds NVIDIA's hosted models and Command Code's Provider API to OhMyGame's
Settings → Providers.

| Provider | Base URL | API key |
| --- | --- | --- |
| NVIDIA | `https://integrate.api.nvidia.com/v1` | [build.nvidia.com](https://build.nvidia.com/settings/api-keys) |
| Command Code | `https://api.commandcode.ai/provider/v1` | Command Code Studio → Settings → API Keys ([docs](https://commandcode.ai/docs/provider-api)) |

Enter a key on the plugin's page in OhMyGame and that provider joins; leave it
empty and it stays out. Models are read from each provider's `/models`, so new
ones appear by themselves. Command Code serves Claude models only through its
Anthropic-style endpoint, so they aren't listed here.

Published as `@ohmygame/language-models` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
