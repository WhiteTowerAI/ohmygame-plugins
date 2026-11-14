# Tripo (Beta)

An optional OhMyGame plugin for Tripo 3D generation and processing. Requires
OhMyGame plugin API **2.16**. Installing it does not replace native providers
or migrate credentials, model choices, canvas references or historical tasks.

## Connect

1. Create an API key in your [Tripo developer account](https://developers.tripo3d.ai/).
2. Add the plugin, approve its API and download hosts, enter the key and enable
   **Every project**.
3. Select the plugin's Tripo models in the asset canvas or provider settings.

Credentials remain in the host. File uploads use host-owned handles, and result
downloads never carry the API key. The balance query and local animation preset
list do not start paid jobs.

## Supported operations

- Text, image and multiview generation with P1, H3.1, P2, H3.0 and H2.5. P1
  retains its 50-face minimum and P2 its 48-face minimum. Text prompts accept up
  to 1,024 characters; references are JPEG/PNG, up to four images and 20 MB each.
  Multiple references use front, left, back and right in that order.
- Remesh a GLB to 500–20,000 faces with Tripo v3.0, preserving the four native
  face-count shortcuts. Retexture with a prompt or one image and a selected
  texture version/quality. Fast textures require v3.5.
- Check rig compatibility, rig the source and apply 1–30 selected animations.
  The plugin sends batches of at most five actions using the same rig and the
  host validates and merges the clips. Rig versions and types keep separate
  preset lists. Tripo currently handles v2.5 biped requests with its v3 rig;
  already-created v2.5 biped rigs require re-rigging for the newer presets.
- Show account credits and edit model defaults or add manual model versions.
  A manual version needs an actual supported Tripo ID and correct limits;
  saving one does not check vendor availability.

Uploads and each task stage have durable receipts. Restarting, retrying a failed
query or downloading again reuses those receipts. All animation batch URLs are
queried again before downloading, since signed URLs expire. A lost submission
response prevents automatic resubmission; inspect the Tripo account before
starting a separate generation. Each attempt waits up to 60 minutes.

Stop ends local waiting. Remote work can continue and incur charges. This
adapter does not delete vendor task records, and does not yet share rigs across
separate jobs; a resumed job keeps its own existing rig. Existing native tasks
retain their original provider ownership.

## Local testing / 本地测试

使用测试项目；真实生成和处理会消耗 Tripo 积分。当前需要支持 API 2.16 的应用。

1. 检查 Beta、图标、密钥、中英文设置、余额；关闭插件或清空密钥后，对应服务应不可用。
2. 测试文字、单图和多视角图片生成，检查 P1/P2 的低面数设置、贴图/PBR、默认值与结果保存。
3. 对已有 GLB 测试网格重建、提示词贴图、单图贴图及贴图版本/质量；旧贴图版本配快速质量应报错。
4. 按模型类型选择骨骼版本、类型和动作，测试超过五个动作，确认最终 GLB 包含全部动作。错误骨骼类型应停止后续付费处理。
5. 在上传后、骨骼生成中、动画生成中分别退出并重开，重试应继续原任务；在供应商任务记录核对没有重复提交。
6. 检查断网、错误密钥、额度不足、查询失败和下载失败后重试；修改密钥或请求内容不能接管原任务。
7. 编辑预设默认值，新增、隐藏和恢复手动版本，重开后应保留设置。不要使用原有未完成的内置任务验证新插件恢复。

## API sources

Reviewed 2026-11-14 against the native provider and current primary documentation:

- [Models and versions](https://developers.tripo3d.ai/en/docs/models-and-versions)
- [File upload](https://developers.tripo3d.ai/en/docs/files) and [task query](https://developers.tripo3d.ai/en/docs/task-query)
- [Texture](https://developers.tripo3d.ai/en/docs/models-texture) and [retopology](https://developers.tripo3d.ai/en/docs/mesh-decimate)
- [Rig check](https://developers.tripo3d.ai/en/docs/animations-rig-check), [rigging](https://developers.tripo3d.ai/en/docs/animations-rig) and [retargeting](https://developers.tripo3d.ai/en/docs/animations-retarget)
- [Balance](https://developers.tripo3d.ai/en/docs/account)
