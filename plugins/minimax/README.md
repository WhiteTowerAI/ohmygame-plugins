# MiniMax Video and Speech (Beta)

Optional MiniMax H3 and H3 Max video provider for OhMyGame, with independent China
and Global API keys. Includes text-to-video, first/last frames and up to nine
reference images. The provider and plugin details use the MiniMax logo.

Version 0.2.0 adds Speech 2.8 HD/Turbo with six reviewed system voice presets,
speed, pitch, volume and MP3/WAV output. Both regions reuse their existing keys.

This is an optional beta plugin. It needs OhMyGame API 2.26 for nested speech
response decoding ([app #908](https://github.com/WhiteTowerAI/ohmygame/pull/908));
video task recovery uses the existing durable retry ownership.
Install it from the plugin catalog in a compatible app. It is not preinstalled.
Apps with MiniMax migration support can move existing keys, switches, global and
project defaults, and saved canvas selections to this plugin. Migration requires
an enabled, authorized official npm release whose exact contents the app has
reviewed. An unpacked development folder is not a migration target. Installing or
updating the plugin alone does not activate migration; see the app's
[migration and cutover guide](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/media-provider-plugins.md#minimax-committed-profile-cutover).

After migration commits, manage MiniMax credentials in this plugin. The app keeps
original keys and task history, hides the built-in connection, and does not
reactivate it if the plugin is disabled or removed. Old built-in jobs have no
recoverable vendor task ID: check their status in MiniMax before intentionally
starting a new generation. Plugin jobs retain the recovery behavior below.

支持迁移的应用会在确认官方 npm 包、启用状态和授权后，迁移密钥、开关、默认模型和
画布选择。迁移后在插件中管理密钥；停用或卸载插件不会恢复旧内置服务。原密钥及
任务记录保留，旧内置任务无法安全恢复，请先在 MiniMax 确认任务状态再决定是否重新生成。

## Local testing / 本地测试

1. Use an app with OhMyGame API 2.26. In Plugins, install this `plugins/minimax`
   folder, review its three network hosts, then enable it for every project.
   在配套应用分支中，打开插件页，安装本目录并启用；检查图标和中英文说明。
2. Set either **China API key** from [platform.minimax.cn](https://platform.minimax.cn/)
   or **Global API key** from [platform.minimax.io](https://platform.minimax.io/).
   Only the configured region's provider should appear in the video picker.
   两区密钥独立；仅填写一区时，另一地区不应出现在可用视频模型中。
3. Select **MiniMax China (plugin)** or **MiniMax Global (plugin)** in an asset
   canvas. Check H3 (4–15 s, 768p/2K) and H3 Max (5–15 s, 480p/768p). Without
   pictures choose a concrete ratio; first/last frames offer only adaptive;
   reference mode offers adaptive and concrete ratios, with at most nine images.
   切换文字、首尾帧与参考图时检查画幅选项；首尾帧最多两张，参考图最多九张。
4. With your own account, generate one short video and confirm the MP4 saves and
   plays. This makes a paid vendor request. Inspect its task in the MiniMax
   console. Quit while another task is pending, reopen and retry the same job:
   it should query the original task, without a second creation request.
   自行测试一次真实生成与重启恢复；确认控制台没有重复付费任务。
5. Stop a pending job. Local waiting should end promptly; inspect the original
   job in MiniMax yourself. **Stop does not cancel the remote job or its charges.**
   MiniMax's DELETE endpoint also deletes completed records, so this plugin does
   not call it. Retry checks the same task; it must not send a second create request.
   停止仅结束本地等待，远端任务可能继续并计费；重试继续查询原任务，不重复创建。
6. For migration testing, use an isolated profile and the official npm version
   reviewed by the app. Restart after enabling it for every project. Check both
   regions' choices, defaults and saved boards; original keys and historical
   task inputs must remain on disk. After migration, disable the plugin: its
   models disappear and the old built-in provider stays retired. A profile
   whose migration is deferred keeps its existing built-in connection.
   使用独立测试目录及应用已校验的官方 npm 版本验证迁移；确认密钥、开关、默认选择
   和历史任务保留。迁移后禁用插件不能回退到旧服务；尚未迁移的账户保持原行为。

Automated tests use the actual sandbox adapter, host permission/network boundary,
regional secret lookup and durable journals with mocked HTTP. They cover request
roles and ratios, restart, ambiguous submission, transient checks, rejected CDN
hosts and downloads without keys. They make no live or paid vendor requests.

## Speech / 配音

Create an Audio node, choose Speech and the MiniMax China/Global Speech 2.8 HD or
Turbo model, then choose a voice and enter the actual words to speak. The picker
provides six reviewed Chinese, Cantonese, English and Japanese system presets,
with local name/ID search. It is not your complete account voice list. Agent audio
requests can also supply an existing voice ID accepted by the host (letters,
numbers, `_` and `-`); IDs containing spaces or parentheses are not yet supported.

在音频节点选择“语音”和 MiniMax 对应区域模型，选择音色后输入台词。首版提供六个
经过文档核对的系统音色，不等于完整账号音色库。音色与音频参数保存在节点中。

The official account voice-list endpoint uses POST. The host's voice-query API
allows only reads via GET/HEAD; this release does not weaken that boundary or
claim to load private/cloned voices. Voice creation/cloning, mixing, subtitles,
streaming playback, music and sound effects are outside this increment.

Speech accepts fewer than 10,000 characters per request, speed 0.5–2×, pitch
−12…12 and the app's volume range −50…100 (mapped to gain 0.5–2×). MP3/WAV accept
8/16/22.05/24/32/44.1 kHz and mono/stereo; unspecified output uses 32 kHz mono.
The host decodes MiniMax's nested hexadecimal response outside the plugin sandbox,
checks the business status and keeps the confirmed file for recovery. A lost or
invalid response cannot silently become another billable request. This is complete
file generation, not live playback. Speech quota/model-access depends on your
account and is separate from previously accepted video testing.

Additional local acceptance / 新增本地验收：

1. Update using an API 2.26 app. Confirm the Beta badge/logo, existing region keys,
   global/project switches and saved video model choices are preserved.
2. In each region you use, generate a short Chinese/English line with HD/Turbo.
   Check the selected voice, speed/pitch/volume, playback and Library/canvas asset.
3. Try MP3 44.1 kHz and WAV 16 kHz, mono/stereo. Save/reopen and confirm selections.
4. Quit during synthesis. A confirmed response should recover; an uncertain
   response should be reported without automatically submitting another request.
5. Existing H3/H3 Max video nodes should still generate/query their original jobs.
   Migration from built-in settings still requires the app's reviewed npm package
   list; this new release alone does not authorize a new migration target.

Official speech contracts checked 2026-11-15:
[Global TTS](https://platform.minimax.io/docs/api-reference/speech-t2a-http),
[China TTS](https://platform.minimax.cn/docs/api-reference/speech-t2a-http),
[Global voices](https://platform.minimax.io/docs/faq/system-voice-id),
[China voices](https://platform.minimax.cn/docs/faq/system-voice-id),
[account voice query](https://platform.minimax.io/docs/api-reference/voice-management-get).
Automated checks use synthetic audio and mocked HTTP, not live quality/availability.

## Video protocol and release notes

The sandbox cannot read keys or local files. The app adds the selected region's
Bearer key to API requests and downloads outputs without it. Allowed hosts are
`api.minimax.cn`, `api.minimax.io` and `cdn.hailuoai.com` (the official query example's
output host). A new CDN host requires review and an updated network grant; an
unexpected host fails visibly instead of broadening access.

A lost create response or server error is treated as possibly accepted; retry
cannot submit another paid job. Check the vendor console before starting a new
one. A structured 4xx rejection allows a corrected retry. Repeated polling errors
end the local attempt and preserve its task for retry, as do local stop, timeout,
app shutdown and interrupted downloads. Retry queries the original task rather
than submitting a replacement. A definite terminal vendor error clears the task;
starting a new generation is a separate intentional action.

Sources checked 2026-11-14:
[create](https://platform.minimax.io/docs/api-reference/video-generation-v2-create),
[query](https://platform.minimax.io/docs/api-reference/video-generation-v2-query),
[cancel/delete](https://platform.minimax.io/docs/api-reference/video-generation-v2-delete),
[China endpoint](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create).
