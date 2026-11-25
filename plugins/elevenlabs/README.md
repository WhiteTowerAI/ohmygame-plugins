# ElevenLabs Beta

Optional `@ohmygame/elevenlabs` plugin for OhMyGame API **2.21 or newer**.
Use your own ElevenLabs API key. Installing this plugin does not move or disable
existing built-in settings, models or unfinished tasks.

Includes Eleven v4 and Flash v2.5 speech, Sound Effects v3/v2, Music v2.5/v1,
and Scribe v2 transcription. Speech uses your account's voices, with search,
pagination and supported public previews. Choose a voice explicitly. Flash
supports 0.7×–1.2× speech speed; v4 uses its original speed, following the
model-specific documentation. Speech limits are 10,000/40,000 characters.
Sound effects support 0.5–30 seconds and looping; music supports 3–600 seconds,
up to 4,100 prompt characters and instrumental output. Generated audio is MP3
at 44.1 kHz/128 kbps, matching the existing app output. Sound Effects v2 remains
for existing choices; the vendor currently schedules its removal for March 2027.

## Setup

1. Install the plugin and enable it for every project.
2. Create an API key in your ElevenLabs account and save it in the plugin's
   **API key** setting. Restricted keys need read access to voices and access
   to each endpoint you use: Text to Speech, Sound Effects, Music and Speech to
   Text. Account plans and credit limits still apply; Music API needs a paid plan.
3. Choose the **ElevenLabs (plugin)** model in the canvas or audio tool. Speech
   needs an account voice. The canvas transcription action uses the first ready
   transcription model; to test this plugin, temporarily disable other
   transcription providers.

Only `api.elevenlabs.io` receives the API key. Optional preview audio uses the
public `storage.googleapis.com/eleven-public-prod/` bucket documented by
ElevenLabs. Unrecognized preview hosts are omitted without disabling voice
selection. No webhook, background service or callback setup is needed.

## Recovery

Each generation has one durable paid-step receipt. Once the full binary audio
response and receipt are saved, retry restores the same local result without
another generation. If the app exits or the connection fails before that receipt
is saved, the result is uncertain: retry refuses to resubmit. Check ElevenLabs
before deliberately starting a new generation. Stopping local work does not
prove the vendor stopped billing. Responses have a five-minute deadline and
64 MiB host limit. Corrupt or missing saved files retain their paid receipt. Vendor request IDs
are retained with generated audio metadata for troubleshooting, including after
recovery.

Transcription uploads a host-owned input of at most 64 MiB and waits for a text
result. It has no automatic retry or restart recovery; another explicit attempt
can use additional credits. No live account or audio quality is verified by the
repository's simulated API tests.

## Local acceptance

1. Check the Beta badge, logo, English/Chinese settings, missing key, wrong key,
   and disabled plugin behavior.
2. Search and page through account voices, play an available preview, select a
   voice, and verify it remains selected after search/restart.
3. Generate speech with v4 and Flash. Check Chinese text, Flash speed, and model
   switching. Generate a short looping effect and instrumental music.
4. Stop/reopen after a confirmed audio result and retry: compare vendor history
   and ensure no duplicate request. Interrupt an in-flight request separately:
   retry must report uncertainty rather than automatically submit again.
5. Transcribe an audio asset, including Chinese speech and silence. Test an
   unavailable endpoint/insufficient credits and confirm clear errors.
6. Confirm existing native settings and old unfinished native jobs remain intact.

## 中文说明

需要 OhMyGame API **2.21 或更新版本**。这是可选 Beta 插件，安装不会迁移或关闭
现有内置服务和未完成任务。保存 ElevenLabs API 密钥并启用所有项目后，选择
**ElevenLabs（插件）** 模型。受限密钥应开放音色读取及所用的语音、音效、音乐、
语音转文字权限；音乐 API 需要付费套餐。不需要额外回调或机器人配置。

支持账户音色搜索、翻页和公开试听；语音需要明确选择音色。Flash 可调语速，
v4 使用原速。音效支持循环，音乐支持纯音乐。输出为 44.1 kHz/128 kbps MP3。
画布转录使用第一个可用转录服务，测试时可暂时关闭其他转录服务。

完整音频和付费回执保存后，重启重试会读取原结果。响应未确认时不会自动重新
提交，请先核对 ElevenLabs 的任务或用量记录，再决定是否新建生成。停止本地
等待不代表供应商已停止计费。转录没有重启恢复或自动重试，再次操作可能再次
使用额度。请按上面的验收步骤检查生成、退出恢复、中文、权限与错误反馈。

## Sources

Reviewed 2026-11-15 against the native provider and primary documentation:

- [Models](https://elevenlabs.io/docs/overview/models) and [speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [Model-specific speed support](https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control)
- [Account voices](https://elevenlabs.io/docs/api-reference/voices/search) and [documented preview URLs](https://elevenlabs.io/docs/api-reference/text-to-voice/create/)
- [Sound effects](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [music](https://elevenlabs.io/docs/api-reference/music/compose) and [transcription](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)

Logo: the app's existing ElevenLabs asset from
[`@lobehub/icons-static-svg` 1.94.0](https://github.com/lobehub/lobe-icons) (MIT; notice included in `assets/LICENSE`). The SVG uses explicit pixel dimensions and a white tile so the black mark remains visible in both app themes.
