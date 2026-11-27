# 开工计划（2026-11-27）

依据 `FINAL.md` 第 8.1 节的先后顺序。只做 MVP 不需要宿主改动、能离线验证的部分。所有代码在 `ohmygame-plugins` 的 `claude/epic-pascal-6setut` 分支，一项一个提交，暂不开 PR。

## 阶段 0：保存成果、准备依赖

- 把调研报告和 `idea-lab/` 整理进 `ohmygame-plugins/docs/research/2026-11-plugin-and-game-ideas/` 并提交（容器会被回收）。
- 安装 `ohmygame`（`bun install --ignore-scripts`）和插件仓库依赖，`app` 链到 `../ohmygame`，先跑通现有测试作为基线。
- 起草两份给主仓库的 issue（H13：发布游戏的外发网络和网址参数写成文档；H1：试玩事件收集）。**只写草稿，不发**，等你确认。

## 阶段 1：launch-check PR-A（发布前检查：构建扫描）

照 Game Tests 分支的写法（`src/` TypeScript → esbuild 打包到 `dist/`，Vitest 测试）。

- `plugins/launch-check/`：manifest（`ohmygame/launch-check`，API `^2.37.0`，`appliesTo: web-game, general`，`native`、`composer`、`project.files: read`）；命令 `scan`（原生，`build: "web"`，`changesFiles: false`，放进发布菜单）和 `open`；面板 `launch`（按需打开，只有报告视图）。
- `src/scan/`：解析入口 HTML 和 JS import 图，分出首包和懒加载；列最大文件、未引用素材、外部请求、绝对路径、文件数；对照 `profiles.json` 里各平台的预算（社区、itch、CrazyGames、YouTube Playables、Poki 两种说法），每个数字带来源和核对日期。报告写进 `.ohmygame/launch/report.json`。
- 测试：五个夹具构建（Vite 风格、带懒加载块、含绝对路径、含 Google Fonts、含未引用素材），预算数字都有来源，manifest 检查。

## 阶段 2：ship-ladder（必发阶梯）MVP

- `plugins/ship-ladder/`：`design/ship.json` 模板和 schema；首页提示词命令；工具栏打开面板；面板编辑 ship.json、显示前三级阶梯和 Jam 倒计时。
- 纯函数：Game Tests 结果第一行解析（通过 / 未通过 / 未知七种情况）、各级状态、Jam 是否该提醒。
- 钩子：`tool.afterCall`（读 game_test 结果）、`turn.completed`（Jam 提醒一次）；回退检查用 `capabilities.game`。
- 测试：照提案列的五组。

## 之后（这次不做）

- launch-check PR-B（局域网扫码真机）。
- P4-04 小游戏激励视频 Skill 和夹具 A/B。
- 溢流排序 + 落箭的一周原型（求解器已有）。
- playtest-loop 等 H13 答复；seed-lab 最后，先跑基线组。

## 每项完成的标准

`npm run typecheck`、`npm test`（含官方插件打包检查）通过；新插件能被 app 的包检查接受。不能手动在桌面版里验证的，在提交说明里写明。
