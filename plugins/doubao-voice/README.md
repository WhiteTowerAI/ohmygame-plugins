# Doubao Voice Beta

Optional `@ohmygame/doubao-voice` for OhMyGame API **2.38 or newer**.
Installing it does not migrate or disconnect built-in services or their tasks.

Includes Speech Synthesis 2.0 (text-to-speech, preset/custom/cloned speakers,
pronunciation, SSML, language, dialect, delivery, speed, pitch and volume) and
Seed Audio 1.0 (prompt-directed speech, effects and music with optional reference
speakers). TTS accepts up to 10,000 characters, MP3 or Ogg Opus; Seed Audio
accepts up to 2,744 prompt characters and 120 seconds, MP3, WAV or Ogg Opus.
Format-specific sample rates follow the existing native service. TTS is mono;
Seed Audio does not expose channel selection or guaranteed seamless loops.

## Setup

1. Enable the required services in the Volcengine Doubao Speech console. Create
   an API key with access to the service you use. Cloned voices need access to
   the cloning resource and your own authorized Speaker ID.
2. Install this plugin, enable it for every project, and save the API key in
   its settings. Generation consumes your own account quota.
3. Select **Doubao Voice (plugin)** in the canvas or audio tool. Choose a TTS
   voice explicitly, or save its Speaker ID in **Default Speaker ID**. The
   plugin does not choose a default on your behalf. Select **Cloned** for a
   cloned voice; an ID beginning with `S_` alone does not change the resource.
4. Seed Audio references are independent of the TTS default. Saved TTS-only
   options remain on the node but are not sent to Seed Audio; the canvas warns
   about incompatible options, so they are available again when switching back.

Only `openspeech.bytedance.com` receives the key. No webhook, callback server,
robot, screen-recording or computer-control permission is required. This plugin
currently uses one key for both services. Native per-service keys and explicit
disconnections are not merged or overwritten; migration must preserve them or
remain deferred.

## Recovery and limits

The host decodes JSON/Base64 outside the plugin sandbox and saves a paid-step
receipt with the audio. Confirmed responses can be restored after restart without
submitting again. An interrupted request without a confirmed receipt is uncertain;
retry refuses another paid request. Check your vendor usage before deliberately
starting a new generation. Stopping local work does not prove vendor billing stopped.

Audio is limited to 64 MiB and a five-minute response deadline. Request UUIDs are
generated only when sending and kept with the receipt; vendor log IDs, character
usage and original billing duration are retained when provided. Billing duration
is distinct from the actual decoded file duration. Streams without a terminal
marker rely on clean HTTP completion, not a stronger vendor completion guarantee.
Missing/corrupt receipt files never trigger automatic resubmission.

## Local acceptance

1. Verify logo, Beta badge, Chinese/English settings, missing or incorrect key,
   disabled plugin and service authorization errors.
2. Generate Chinese TTS using a preset; test default voice persistence, explicit
   override, speed/pitch/volume and supported dialect/delivery. Check MP3 and
   Ogg Opus. If your account has a cloned voice, select Cloned and verify its model.
3. Try SSML and pronunciation separately, low bit rate and silence/section options.
   Unsupported combinations must fail before another generation is submitted.
4. Generate short Seed Audio speech/effects/music, then use a reference speaker.
   Verify format/sample rate and confirm that the TTS default is not inherited.
5. After a confirmed response, close/reopen and retry; confirm the vendor has no
   second generation. Separately interrupt an unconfirmed response: retry should
   report uncertainty. Keep existing native settings and unfinished tasks intact.

Repository tests simulate vendor responses; they do not verify live permissions,
billing, audio quality or real account availability.

## 中文说明

需要 OhMyGame API **2.38 或更新版本**。这是使用你自己账户的可选 Beta 插件。
支持豆包语音合成 2.0 与 Seed Audio 1.0。安装不会迁移、覆盖或关闭现有内置服务。
在火山引擎开通所需语音服务并创建密钥，启用插件后保存 API Key，再选择
**豆包语音（插件）** 模型。不需要回调、机器人或电脑操作权限，生成消耗你的额度。

语音合成需要选择音色，或在插件设置中保存默认 Speaker ID。复刻音色要明确选择
“复刻”并使用已授权的音色；仅填写 `S_` 开头的 ID 不会自动切换资源。
Seed Audio 的参考音色单独选择，不继承语音合成默认值。切换模型时，不适用的
旧参数保留在画布上并提示，不发送给不支持的模型。

完整音频与付费回执保存后，重启重试会读取原结果；请求尚未确认时不会自动重发，
请先检查供应商用量。测试请覆盖中文、音色持久化/覆盖、复刻音色、语速音高音量、
格式与采样率、SSML/发音词典、Seed Audio 参考音色、权限错误，以及两种退出恢复。
原生服务的独立密钥或断开状态暂不合并，迁移前会保留并检查这些设置。

## Sources and assets

Contract reviewed against the existing application providers and Volcengine docs:

- [Streaming TTS HTTP](https://docs.volcengine.com/docs/doubao-voice/unidirectional-streaming-text-to-speech-http?lang=zh)
- [Audio generation HTTP](https://docs.volcengine.com/docs/doubao-voice/audio-generation-http?lang=zh)
- [Error codes](https://docs.volcengine.com/docs/doubao-voice/error-code-query-1?lang=zh)

Preset constraints are a snapshot of the application's generated
`src/shared/doubao-voices.ts`; refresh and review them alongside upstream voice
catalog changes. Custom and cloned Speaker IDs remain allowed.

Logo: Doubao color asset from the application's `@lobehub/icons-static-svg`
1.94.0 (MIT; notice included in `assets/LICENSE`).
