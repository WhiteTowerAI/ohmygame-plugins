# MiniMax Video

Optional MiniMax H3 and H3 Max video provider for OhMyGame, with independent China
and Global API keys. Includes text-to-video, first/last frames and up to nine
reference images. The provider and plugin details use the MiniMax logo.

This is an optional beta plugin. It needs OhMyGame API 2.7 with
reference-dependent video aspect ratios ([app #825](https://github.com/WhiteTowerAI/ohmygame/pull/825)).
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

1. Use an app with OhMyGame API 2.7. In Plugins, install this `plugins/minimax`
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
   not call it. Retry after a deliberate stop is a new generation.
   停止仅结束本地等待，远端任务可能继续并计费；停止后重试会创建新任务。
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

## Protocol and release notes

The sandbox cannot read keys or local files. The app adds the selected region's
Bearer key to API requests and downloads outputs without it. Allowed hosts are
`api.minimax.cn`, `api.minimax.io` and `cdn.hailuoai.com` (the official query example's
output host). A new CDN host requires review and an updated network grant; an
unexpected host fails visibly instead of broadening access.

A lost create response or server error is treated as possibly accepted; retry
cannot submit another paid job. Check the vendor console before starting a new
one. A structured 4xx rejection allows a corrected retry. Repeated polling errors
end the attempt under the host's existing retry policy; they never submit a new
task automatically. Only a normal app shutdown preserves a pending job for resume.

Sources checked 2026-11-14:
[create](https://platform.minimax.io/docs/api-reference/video-generation-v2-create),
[query](https://platform.minimax.io/docs/api-reference/video-generation-v2-query),
[cancel/delete](https://platform.minimax.io/docs/api-reference/video-generation-v2-delete),
[China endpoint](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create).
