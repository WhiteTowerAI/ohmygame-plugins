# Seedream & Seedance (Beta)

An optional OhMyGame plugin for Seedream images and Seedance videos. Requires
OhMyGame plugin API **2.8**. Install only on a compatible app; this package does
not install itself, enable providers, copy keys or change saved model choices.

## Connect

1. Enable the image/video models you need in your provider's console.
2. Add the plugin and approve its listed API/result-download hosts.
3. In plugin settings, enter the **Volcengine Ark API key** for China and/or the
   **BytePlus ModelArk API key** for your BytePlus account. Turn on **Every project**.
4. Select the plugin's provider and model in the asset canvas or model settings.

Ark images and videos share one key. BytePlus has a separate key and video
provider. Keys stay in the app; the sandbox only asks the host to authenticate
API calls. Result downloads do not carry the key.

## Supported operations

- Ark images: Seedream 5.0 Pro / Flash (1K, 2K; up to 10 reference images), and
  Seedream 5.0 / Lite `doubao-seedream-5-0-260128` (2K, 4K; up to 14 references).
  One PNG per request, preserving the existing built-in size choices.
- Ark and BytePlus videos: Seedance 2.5 (4–30 seconds, 480p/720p/1080p, up to
  30 reference images) and 2.0 (4–15 seconds, including 4K, up to 9 references).
  Text, image references and first/last frames are supported. Frame mode takes
  at most two images; 2.5 uses adaptive frame aspect ratio. Synchronized audio
  is enabled, as in the built-in provider.
- Video task IDs are stored by OhMyGame. After restarting, retry checks the
  original task. A lost submission response blocks retry from starting another
  paid task; check the provider console before intentionally creating a new job.
- Stop ends local waiting. This adapter does not call DELETE, which can remove
  completed task records. Remote work may continue and incur charges.

This increment matches the app's existing image-reference workflow. It does not
add video/audio references, video editing/extension, draft-to-final conversion,
image layers or OCR. Sandbox payload limits still apply; the reference count
limit is not permission to send arbitrarily large files. Image requests have no
durable vendor task ID: after a lost image response, inspect the account before
manually generating again. Result URLs expire; resume promptly.

The provider lists Seedream 5.0/Lite as retiring. Existing saved choices must not
be silently replaced with a different model; check its availability before use.
Do not use this plugin to reinterpret unfinished built-in tasks. Existing
built-in credentials and historical jobs remain owned by the app until its
separate migration is enabled.

## Local testing / 本地测试

Use a temporary profile or a copied test project. Real generation costs money.

1. 在支持 API 2.8 的应用中以开发模式添加此目录，确认 Beta、图标和中英文设置正常。
2. 仅填方舟密钥，确认图片和视频共用此密钥；再填 BytePlus 密钥，确认服务独立。清空某个密钥或关闭插件，对应模型应不可用。
3. 生成一张 Seedream 图片，验证 1K/2K 或 2K/4K、横竖比例及参考图。检查作品尺寸、格式和保存结果。
4. 分别测试 Seedance 2.5/2.0 的文字、首尾帧与多图参考。2.5 首尾帧仅允许自适应比例，参考图上限为 30；2.0 上限为 9。
5. 视频提交后退出应用并重开，重试应查询原任务；在供应商控制台核对只有一个付费任务。
6. 模拟查询断网、停止等待及下载失败后重试，应保留原任务。请求已提交但返回丢失时不得自动重新提交。
7. 检查账户额度不足、密钥错误、任务失败和超时反馈。不要用现有未完成的内置任务验证新插件。

## API sources

Reviewed 2026-11-14:

- [Ark image API](https://console.volcengine.com/ark/region:cn-beijing/docs/image-generation-api)
- [Ark video create](https://console.volcengine.com/ark/region:cn-beijing/docs/create-video-generation-task-api)
- [Ark video query](https://console.volcengine.com/ark/region:cn-beijing/docs/get-video-generation-task-api)
- [Ark model list](https://console.volcengine.com/ark/region:cn-beijing/docs/model-list)
- [BytePlus video tutorial](https://docs.byteplus.com/en/docs/modelark/video-generation-tutorial)
- [BytePlus video query](https://docs.byteplus.com/en/docs/modelark/get-video-generation-task-api)

The package advertises API 2.8 for its 30-image model declaration. Publish after
the corresponding host support and task-retention fix are merged and verified.
