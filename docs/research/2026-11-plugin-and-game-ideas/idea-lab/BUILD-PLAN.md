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

---

# 第二阶段：完整计划（2026-11-27 定）

## 目标（全部满足才算完成）

1. 第 3–7 项（下面）都提交并推送到 `claude/epic-pascal-6setut`；被阻塞的第 8 项写明原因。
2. 每一项都过了三道门：**测试**（新代码有 Vitest 覆盖，`npm run typecheck` 干净，官方打包检查通过）、**独立审查**（`/code-review high` 对这一项的改动，找出的问题修完或写明不修的理由）、**看一遍**（有界面的，Chromium 里亮暗两色、中英文截图检查，没有控制台报错）。
3. 全仓库测试除了已知与环境有关的 TapTap 进程测试外全部通过。
4. 最后给出汇总：做了什么、怎么验证的、还没验证什么。

## 设计原则（每项都按这几条做）

- 只读优先：检查类功能不改项目文件；要改的走插件写入，可以撤销。
- 判断来自可观察的结果，不来自 Agent 的自述。
- 每个外部数字带出处和核对日期；拿不准的标出来，不编。
- 发给 Agent 的文字用英文；界面文字中英两份。
- 最小权限：manifest 只声明用到的能力。
- 宿主做不到的照实写明，不绕过安全边界。

## 阶段与顺序

| # | 项目 | 内容 | 完成标准 |
|---|---|---|---|
| 3 | launch-check 真机测试（PR-B） | `lan` 命令在本机局域网托管网页构建（带令牌），只在托管的页面里注入诊断脚本；手机把报错、帧率、首帧时间、音频状态、视口和安全区回传；面板显示二维码和每台设备的数据；可停止 | 托管、令牌、注入、回传、停止都有测试；面板截图 |
| 4 | 小游戏激励视频 Skill（P4-04） | 微信、抖音插件各加 `minigame-rewarded-ad`：接法和六条自查规则，`rewarded.ts`（wx/tt 统一成 granted / closed / unavailable），`size-check.mjs`（主包 4 MB、总计 30 MB、引擎插件不计入、按分包统计、分包建议） | 适配和 size-check 有测试；现有 Skill 指向新内容 |
| 5 | 溢流排序原型 | JS 生成器和求解器（从实验移植，按"必须用溢流"挑关分难度）；单页可玩原型：每日关、撤销、重开、溢流预览、游戏测试桥 | 求解器与 Python 实验结果一致的抽样测试；Playwright 真点通关 |
| 6 | 落箭原型 | 共用管线：箭头 + 重力规则的求解器、生成器、可玩原型 | 同上 |
| 7 | 种子批量验证台 seed-lab（P4-05）MVP | 面板对项目里的纯规则模块批量跑种子，出可解率和难度分布；用第 5、6 项的求解器当样本 | 测试；面板截图；基线组对比写进验证记录（形态由它决定） |
| 8 | 真人试玩回路 playtest-loop | **阻塞**：依赖 H13 的答复，issue 按你的决定暂不发 | 写明阻塞原因和解除条件 |
| 9 | 收尾 | 全量测试、汇总、更新 FINAL.md 的进度 | 目标第 3、4 条 |
