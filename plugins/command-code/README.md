# Command Code

Adds Command Code to OhMyGame's Settings → Providers, with your own API key.

- Base URL: `https://api.commandcode.ai/provider/v1`
- API key: From Command Code Studio → Settings → API Keys, on the Provider plan. Claude models are only served through Command Code's own protocol and aren't listed. ([docs](https://commandcode.ai/docs/provider-api))

Enter the key on the plugin's page or in Settings → Providers. Models are read
from the provider's `/models`, so new ones appear by themselves.

Published as `@ohmygame/command-code` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
