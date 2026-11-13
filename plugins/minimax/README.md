# MiniMax Video

Optional MiniMax H3 and H3 Max video provider for OhMyGame, with independent China
and Global API keys. Includes text-to-video, first/last frames and up to nine
reference images. The provider and plugin details use the MiniMax logo.

This package is private while the first adapter increment is tested. It needs
OhMyGame API 2.7 with reference-dependent video aspect ratios ([app #825](https://github.com/WhiteTowerAI/ohmygame/pull/825)).
Do not publish it until that app version ships and the local acceptance below
passes. It is not preinstalled. Existing built-in MiniMax keys, switches, model
selections and saved boards are unchanged; their migration is a later increment.
During testing the provider names include “(plugin)” to distinguish them.

## Local testing / 本地测试

1. Run the companion app branch. In Plugins, install this `plugins/minimax`
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
6. Existing built-in provider keys/switches and saved boards must still work.
   Disable this plugin and confirm only its two providers disappear.
   禁用本插件后，原内置服务与已保存画布保持不变。

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
