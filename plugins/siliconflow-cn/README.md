# SiliconFlow CN

Adds SiliconFlow CN to OhMyGame's Settings → Providers, with your own API key.

- Base URL: `https://api.siliconflow.cn/v1`
- API key: From cloud.siliconflow.cn → API Keys.

Enter the key on the plugin's page or in Settings → Providers. Models are read
from the provider's `/models`, so new ones appear by themselves.

It also makes pictures with Kolors and Qwen-Image, through
[`media/adapter.js`](media/adapter.js). OhMyGame runs that script in a sandbox: it reaches only
`api.siliconflow.cn` and the host SiliconFlow's results are on, and OhMyGame adds the key to its
requests. An OhMyGame too old for plugin image models leaves this part out.

Published as `@ohmygame/siliconflow-cn` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
