# Language Models

Adds model providers to OhMyGame's Settings → Providers, each with your own
API key. It holds the providers OhMyGame doesn't include; more join over time.

| Provider | Base URL | API key |
| --- | --- | --- |
| SiliconFlow CN | `https://api.siliconflow.cn/v1` | From cloud.siliconflow.cn → API Keys. |
| SiliconFlow | `https://api.siliconflow.com/v1` | From cloud.siliconflow.com → API Keys. Its accounts are apart from SiliconFlow CN's. |
| ModelScope | `https://api-inference.modelscope.cn/v1` | Your access token from modelscope.cn → Account → Access Token. It has a free daily quota once an Alibaba Cloud account is linked. |
| StepFun | `https://api.stepfun.com/v1` | From platform.stepfun.com → API Keys. |
| Tencent Hunyuan | `https://api.hunyuan.cloud.tencent.com/v1` | From the Tencent Cloud console → Hunyuan → API Key. |
| Baidu Qianfan | `https://qianfan.baidubce.com/v2` | An API key from the Baidu AI Cloud console → Qianfan → API Key (starts with bce-v3/). |
| PPIO | `https://api.ppinfra.com/v3/openai` | From ppio.com → Settings → API Keys. |
| Novita AI | `https://api.novita.ai/openai/v1` | From novita.ai → Settings → Key Management. |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | From deepinfra.com → Dashboard → API Keys. |
| SambaNova | `https://api.sambanova.ai/v1` | From cloud.sambanova.ai → APIs. |
| Nebius Token Factory | `https://api.tokenfactory.nebius.com/v1` | From tokenfactory.nebius.com → API Keys. |
| Command Code | `https://api.commandcode.ai/provider/v1` | Command Code Studio → Settings → API Keys ([docs](https://commandcode.ai/docs/provider-api)) |

Enter a key on the plugin's page or in Settings → Providers and that provider
joins; leave it empty and it stays out. Models are read from each provider's `/models`, so new
ones appear by themselves. Command Code serves Claude models only through its
Anthropic-style endpoint, so they aren't listed here.

Published as `@ohmygame/language-models` from [ohmygame-plugins](https://github.com/WhiteTowerAI/ohmygame-plugins).
