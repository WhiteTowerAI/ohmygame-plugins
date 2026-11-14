# Meshy (Beta)

An optional OhMyGame plugin for Meshy 3D generation and processing. Requires
OhMyGame plugin API **2.16**. Installing it does not enable the provider, copy
keys, replace built-in models or take over historical tasks.

## Connect

1. Create an API key in your [Meshy account](https://www.meshy.ai/settings/api).
2. Add the plugin and approve its API and result-download hosts.
3. Enter the key in plugin settings and enable **Every project**.
4. Select Meshy from the plugin providers in the asset canvas or model settings.

The key remains in OhMyGame. The sandbox receives file handles instead of raw
model bytes and asks the host to authenticate requests. Downloads never carry
the API key. The settings balance query and animation library do not create jobs.

## Supported operations

- Text and image generation: Meshy T2, T2.5, 7.1, 7, 6, 6 Lite and Latest.
  T2/T2.5 use one image and smart topology; other presets accept up to four
  images. Text prompts are limited to 800 characters. Texturing, PBR, pose and
  model-specific polygon limits follow the selected preset.
- Remesh a GLB to 100–300,000 faces, or retexture it using one style image or a
  prompt. Texture versions: Latest, Meshy 7, Meshy 6 and Meshy 6 Lite.
- Rig a humanoid GLB and apply 1–30 distinct library animations. Each paid
  animation batch contains up to ten actions. The host validates matching
  skeletons and merges all batch clips into the final GLB.
- Reuse a paid rig for the same account, source, height and options, including
  after an app restart. A pending rig can serve concurrent jobs. A failed rig or
  a completed rig with less than an hour of remaining lifetime is replaced for
  new jobs. Unknown status, missing expiry or a failed status query reports an
  error and preserves the original rig; it does not silently charge again.
- Read current API balance, edit preset defaults, and add manual model versions
  in provider settings. Manual versions need a real Meshy model ID and its
  correct endpoint/topology capabilities; saving one does not verify vendor
  availability. Hidden models and saved choices stay under the app's control.

Each paid step (preview, refine, rig, animation batch) has a durable host receipt.
Retry after restart or download failure resumes that work. An ambiguous response
prevents another automatic submission: inspect your Meshy task history before
starting a separate job. Each attempt waits up to 60 minutes. Results expire;
resume promptly. Stop ends local waiting, without deleting remote work; remote
jobs can continue and incur charges.

Meshy 7 generation is marked deprecated in the preset list. The vendor currently
announces retirement on December 31, 2026; texture Meshy 7 is separate. Saved
model choices are not silently replaced. Existing built-in keys and unfinished
jobs keep their original ownership until a separately tested app migration.

## Local testing / 本地测试

使用测试项目；真实生成和处理会消耗 Meshy 积分。当前需要支持 API 2.16 的应用。

1. 添加插件，检查 Beta、图标、中英文设置；填入密钥并开启“所有项目”。确认余额和动作列表正常，关闭插件或清空密钥后不可用。
2. 分别用 T2/T2.5 单图和 7.1 多图生成；验证面数、贴图、PBR、姿态和结果保存。测试文字生成及后续贴图阶段。
3. 文字生成进入贴图阶段后退出应用，再打开并重试；在 Meshy 任务记录中核对预览和贴图各只有一次提交。
4. 对已有 GLB 测试重建网格、提示词贴图、单图贴图，以及不同贴图版本。提示词和参考图不能同时用作贴图风格。
5. 用适合绑定骨骼的人形模型生成动画，选择超过十个动作，确认最终 GLB 含全部动作；再次选择其他动作时应复用同一骨骼。动画生成中退出重开后应恢复原任务。
6. 编辑预设默认值、添加手动模型版本、隐藏和恢复模型；重开应用后设置应保留。不要用手动版本绕过供应商的实际面数或图片限制。
7. 测试错误密钥、额度不足、查询断网、停止等待和下载失败后的反馈与重试。未知状态不应触发新的付费任务。不要用未完成的内置任务测试插件恢复。

真实验收通过后再切换旧内置服务。此包不迁移旧密钥、默认模型、画布引用或历史任务。

## API sources

Reviewed 2026-11-14 against the existing native provider and Meshy's documentation:

- [Text generation](https://docs.meshy.ai/en/api/text-to-3d)
- [Image generation](https://docs.meshy.ai/en/api/image-to-3d) and [multiple images](https://docs.meshy.ai/en/api/multi-image-to-3d)
- [Remesh](https://docs.meshy.ai/en/api/remesh) and [retexture](https://docs.meshy.ai/en/api/retexture)
- [Rigging](https://docs.meshy.ai/en/api/rigging), [animation and action library](https://docs.meshy.ai/en/api/animation)
- [Balance](https://docs.meshy.ai/en/api/balance)
