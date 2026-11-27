# 第 2 代插件提案（生成者）

- 日期：2026-11-24。依据：`GOAL.md`、`RUBRIC.md`、`PROCESS.md`、`CONTEXT.md`、`EVIDENCE.md`（E1–E110）、`generations/gen-1-plugins-proposals.md`、`generations/gen-1-plugins-review.md`、`pool/plugins.md`、`generations/gen-1-games-review.md` 第 4 节（能力缺口）。
- 核对的代码：`ohmygame`（dev，d6eac678，beta.5.11）的 `docs/` 与 `src/`、`packages/game-sdk/src/`；`ohmygame-plugins/plugins/` 下 36 个插件；`origin/feat/game-tests` 上的 `plugins/game-tests/README.md`。
- 本代做法：
  1. 按评审意见逐个处理第 1 代的存活和待修正候选：修正、合并或淘汰。
  2. 针对 `pool/plugins.md` 列出的 5 个未覆盖痛点和游戏线的能力缺口，补 4 个新候选。
  3. 最后保留 10 个候选。合并后每个插件对应一类用户、一个时间点。
- **新规则：已有能力核对。** 每个候选都写了"已核对的相关已有能力（路径）与增量"。凡写"今天能做"的，都只用 API 2.37 文档里写明的能力；需要宿主改动的单独列出，并尽量写成最小改动。

---

## 0. 本代核对中新发现、会影响多个候选的事实

| # | 事实 | 出处 | 影响 |
|---|---|---|---|
| F1 | **微信、抖音插件只适用于 `general` 项目，走 Cocos/Unity 的导出路线**，原话："A generic Web or WebGL build is not a mini game; do not hand-write a conversion"。OhMyGame 的主力类型 `web-game`（Phaser、Three.js）**今天没有任何发到小游戏的路线**。 | `ohmygame-plugins/plugins/wechat-minigame/skills/wechat-minigame/SKILL.md`；`douyin-minigame/.ohmygame-plugin/plugin.json` 的 `appliesTo: ["general"]`；`cocos-creator/skills/cocos-creator/SKILL.md` | 国内小游戏类候选（P2-07）的受众在 OhMyGame 里目前只有 Cocos Creator（以及 Unity）项目，比"国内小游戏开发者"这个总盘子小得多 |
| F2 | 游戏 SDK 明说自己"is not a native-engine or mini-game API"，SDK 里没有广告、分享、埋点、回放、本地化模块 | `src/daemon/agent-prompts.ts:24`；`packages/game-sdk/src/`（文件列表：account、cloud、multiplayer、playtest、prediction 等） | P2-03、P2-07、P2-08、P2-09 都不和 SDK 重复 |
| F3 | ffmpeg：宿主用 `ffmpeg-static` 打包了二进制，但只给宿主自己的媒体工具用；互动故事发布还在 PATH 上找 ffmpeg（"No encoder is bundled"）；插件 API 里没有 ffmpeg 接口 | `docs/media-tools.md:77-85`；`docs/runtime.md:1259`；`package.json:96` | P2-02、P2-05 只能自己按需下载 ffmpeg（GPL），或者请宿主开放路径（H4） |
| F4 | Tune 面板："AI test pages get nothing over the stream, so a test plays what is saved"；任何人改了 `tuning.json`，新值都会直接送进正在运行的游戏，不重载页面 | `docs/preview-runtime.md:292-319` | P2-06 可以靠写 `tuning.json` 在人玩的窗口里即时切换变体，不需要宿主改动 |
| F5 | 插件的 `capabilities.game` 在 2.37 有 `game.open({ path })`、`actTogether`、`reload`、`setOnline`；但 `runtime.md` 还写着"Plugin runtimes and plugins playing a project's game do not offer it"（指 `actTogether`），两份文档对不上 | `docs/plugins.md:477-500`；`docs/runtime.md`（Agent game use 一节） | 以 `plugins.md`（2.37）为准；凡用到插件 `actTogether` 的地方都标"需实测" |
| F6 | 发布记录（`publication.publishedAt`）存在 daemon 的 `project.json` 里，不在项目文件夹中，插件读不到；但 `build.started/completed` 带 `purpose: "export" \| "publish"` | `src/daemon/projects.ts:1441-1470,1969`；`src/shared/plugin-hooks.ts:47-49` | P2-01 判断"发过布了吗"只能用 `build.completed(purpose=publish)` 近似 |
| F7 | `tool.afterCall` 覆盖"OhMyGame and plugin tools exposed to coding agents"；但原生编码 Agent 自己的文件和 shell 工具不在范围内 | `docs/plugins.md:580-589` | P2-04 能看到 Claude Code 调用的 `game_use`（需实测），看不到它直接改的文件；改动列表改从 `turn.completed.changes` 取 |
| F8 | Claude Code Game Studios（CCGS）模板里已有 `prototype`（建议"做 2–3 个变体再挑"）、`localize`（扫硬编码字符串、校验长度、RTL）、`launch-checklist`/`release-checklist`（`cert_tier: none\|itch\|steam\|console`）、`playtest-report`、`scope-check`、`cut`、`sprint-plan`、`balance-check` | `ohmygame-plugins/plugins/claude-code-game-studios/template/.claude/skills/*/SKILL.md` | 只对用这个模板、用 Claude Code 开的项目生效，而且要手动调用。P2-01、P2-06、P2-09、P2-10 都要在 CCGS 项目里让位或接上它 |
| F9 | 插件页面不能直接嵌入人玩的游戏窗口；Play 窗口每个项目只有一个（`runtime.md` Agent game use 一节）；插件会话是隐藏窗口，录屏最长 60 秒，存进 Library | `docs/runtime.md`；`docs/plugins.md:486` | P2-05、P2-06、P2-08 的设计都绕开了这一点 |

---

## 1. 本代新证据（N 编号，未写入 EVIDENCE.md，供评审核对）

| ID | 结论 | 关键数字 | 强度 | 来源 |
|---|---|---|---|---|
| N1 | 网页游戏开发者主要找亲友试玩，近 1/5 找不到试玩者，1/5 要到做完才第一次给外人玩；发布以 itch 为主，Steam 约 16% | Gamedev.js Survey 2025 原始答卷（n=445，2024-12 收集），本代用 `answers-2025.csv` 统计（多选题按提到该项的人数算）：<br>**试玩人从哪来**（n=437）：亲友 60.9%，社交平台 35.9%，自己的社区 32.7%，公开放测试版 30.7%，**找不到人试玩 17.6%**，招募机构或工具 1.1%。<br>**外人（不含亲友）第一次玩的时间**（n=433）：第一个原型 39.7%，开发中某个阶段 26.1%，**完全做完时 21.0%**，概念阶段 9.0%。<br>**怎么测代码**（n=440）：自己测 95.0%，亲友 50.0%，社区 25.0%，QA 团队 8.2%。<br>**发布到哪**（n=440）：itch.io 类 67.3%，自己的网站 38.2%，**Steam 15.9%**，Google Play 15.7%，还没发布过 10.5%（问卷没有 Poki、CrazyGames 选项，自填共约 1%）。<br>**宣传平台**（n=437）：Discord 43.7%，X 34.3%，YouTube 32.7%，**不宣传 24.9%**，TikTok 11.4%。<br>**开放题"开发中遇到的困难"**（n=294，关键词粗统计）：时间、动力、做完相关 21.4%，美术和音频 9.2%，营销和可见度 8.8%，试玩和反馈 1.4%，本地化 0.3% | 中（社区自选样本，以网页开发者为主；比例是本代计算的） | https://github.com/GamedevJS/Gamedev.js-Survey （`answers-2025.csv`）；https://dev.to/end3r/report-on-the-current-state-of-web-game-development-in-2025-is-out-mo9 |
| N2 | 微信小游戏激励视频的官方规则：必须看完才能发奖，每人每天次数有上限，拉取失败要重试 | `wx.createRewardedVideoAd` 返回全局单例，默认隐藏；"the number of times each user can watch rewarded video ads per day is currently limited"；建议拉取成功后再显示广告按钮；自动拉取失败后 `show()` 会被拒，要先 `load()`；基础库 2.1.0 起"developers must check `res.isEnded`"，`false` 表示中途关闭，不能发奖；只能由用户点"关闭广告"，开发者控制不了隐藏；3.7.7 起错误码 1004 会走兜底分享页（可用 `disableFallbackSharePage` 关掉）；可选服务端校验防作弊 | 强（官方文档） | https://developers.weixin.qq.com/minigame/en/dev/guide/open-ability/ad/rewarded-video-ad.html |
| N3 | Steam 上简体中文用户已和英文同一量级 | Steam 硬件与软件调查 2025-06：English 36.31%、Simplified Chinese 26.73%。2025-02 简体中文冲到 50.06%（春节季节性，加上疑似合并了国服客户端的数据，不可当常态） | 强（Valve 官方调查），但月度波动大 | https://www.gamingonlinux.com/2025/07/steam-hardware-software-survey-for-june-2025-is-out-heres-the-latest-for-linux-and-steamos ; https://www.tomshardware.com/desktops/gaming-pcs/huge-os-and-ram-usage-swings-in-steam-survey-likely-to-have-been-influenced-by-china-influx |
| N4 | 工业化原型筛选：做很多变体，只留极少数 | Voodoo 招聘页称每年测约 2,000 个原型；其博客称约 0.4%（每年约 4 款）进入正式发行；测试平台 Ducky 称平均测 40 个项目才有 1 个指标达标 | 弱（厂商自述） | https://www.deconstructoroffun.com/blog/2025/06/02/how-voodoo-builds-hits-four-product-lessons-from-a-2000-prototypes-a-year-machine ; https://voodoo.io/news/voodoo-s-secret-sauce-from-0-to-250m-hybridcasual-revenue-in-3-years ; https://www.pocketgamer.biz/ducky-ivan-fedyanin-key-hypercasual-kpis |
| N5 | 微信、抖音小游戏平台自带游戏录屏接口，录屏分享要审核过的模板 | 微信有官方 `GameRecorder` API；抖音示例用 `tt.getGameRecorderManager()` 录屏后，经 `tt.shareAppMessage({ channel: "video", templateId })` 分享，`templateId` 要"通过审核"（开发者代码注释）。结合 E83：抖音验收指南把"录屏功能异常"列为驳回情形 | 强（微信 API 文档）/弱（抖音论坛示例） | https://developers.weixin.qq.com/minigame/dev/api/game-recorder/GameRecorder.html ; https://forum.cocos.org/t/topic/105049 |
| N6 | 网页引擎上微信小游戏要靠第三方适配层，Phaser 3 没有成熟方案 | 微信文档把 weapp-adapter 列为第三方库，且不保证所有引擎都能接上；腾讯云一篇文章称 Adapter 已不再维护（日期未知）；社区方案多停在 Phaser 2/CE（有作者称更新版本在显示对象多时卡顿） | 中（官方文档）/弱（社区） | https://developers.weixin.qq.com/minigame/dev/game-engine/workflow/adapter.html ; https://gitee.com/codeveryday/phaser-ce2.6.2_wechat ; https://cloud.tencent.com/developer/article/1547599 |
| N7 | 网页游戏上 Steam 有现成路线，但走的人少 | Phaser 官方 2025-03 发文介绍 Electron + electron-builder + Steamworks 上架流程；SteamDB 的 Electron 容器页显示约 100 款产品（快照日期未知；SteamDB 按文件名识别，会低估） | 弱 | https://phaser.io/news/2025/03/publishing-web-games-on-steam-with-electron ; https://steamdb.info/tech/Container/Electron |

**搜了但没找到的**（不引用，记为证据空白）：
- 微信流量主的开通门槛（独立访客数）；
- 微信官方"诱导分享"的判定条文；
- Steam Playtest 的报名人数；
- 游戏内分享按钮或片段对新增玩家的提升；
- 文字溢出的发生频率。

---

## 2. 候选一览（10 个）

| ID | 名称 | 谱系 | 主攻痛点（索引） | 一句话 |
|---|---|---|---|---|
| P2-01 | 必发阶梯（ship-ladder） | 来自 P1-14 | 2、3 | 开局三问加"不做"清单；能自动打勾的里程碑阶梯；Jam 倒计时和保底版本 |
| P2-02 | 发布前检查与网页渠道适配（launch-check） | 合并 P1-04、P1-05、P1-11，并接收 P1-15 的 Discord 部分（二期） | 6、7、8、14 | 按目标平台算预算并一键压缩；移动端规则检查；局域网真机扫码；CrazyGames 适配；来源与授权账本 |
| P2-03 | 真人试玩回路（含招募）（playtest-loop） | 来自 P1-03，新增"招募"模块 | 4、3 | 试玩构建收回漏斗、退出点和无偏问卷，聚类反馈；招募帖和互评交换 |
| P2-04 | 交付质量门（delivery-gate） | 合并 P1-01 和 P1-12 的回合后扫描；先跑埋 bug 基准 | 5、13 | 客观判断"改完有没有跑过"；只看画面的盲评；回合后扫已废弃 API |
| P2-05 | 玩法片段工作室（clip-studio） | 合并 P1-06 和 P1-08 | 1 | 从可复现的自动试玩里录出竖屏和横屏的 6/15/30 秒片段和 GIF，附尺寸包和文案 |
| P2-06 | 变体擂台（含数值模拟）（variant-arena） | **新**，吸收 P1-02 | 3、4 | 同一玩法的 2–3 个变体即时切换盲玩；规则类和放置类游戏用机器人批量跑，按变体对比 |
| P2-07 | 小游戏上架助手（IAA、分享与提审材料）（minigame-launch） | **新**，吸收 P1-13 | 7、15、16 | 微信和抖音激励视频、插屏、分享、录屏的统一接口；模拟广告层；规则检查；主包预算；软著材料 |
| P2-08 | 网页玩家回放与分享（含主播模式）（clip-share） | **新** | 1 | 游戏内录下最后 N 秒、生成分享卡和挑战链接；主播模式隐藏邀请码和昵称 |
| P2-09 | 本地化与文字溢出检查（loc-check） | **新** | 7、11 | 抽取字符串、伪本地化、带术语表翻译；按语言和视口截图查溢出 |
| P2-10 | Steam 上架通道（steam-ship） | 来自 P1-07，因游戏线需求重新评估 | 1、7 | 先发上线节奏 skill；再做桌面套壳、steamcmd 上传、Deck 自检、网页 demo 的愿望单入口 |

---

## P2-01 必发阶梯（ship-ladder）· 来自 P1-14

**用户与场景**：在 OhMyGame 开新项目的人，尤其是 Jam 参赛者、第一次做游戏的人，以及做了几个月还没发出去的人。Agent 让"再加一个功能"几乎零成本，范围越加越大，项目停在 80%。

**证据**
- E12（强，论文）：planning、scope、feature creep、cutting features、delays 合计约占复盘问题的 20%。
- E13（强）：Underestimation 34 次，Unclear game design vision 28 次。
- E14（强）：小团队 50% 列出 obstacles，schedule 25%；引语 "Feature creep ruled our roost"。
- E16、E17（中，计算值，按评审意见视为**上限**）：大型 jam 只有约 10–30% 的报名者提交；LD 约一半草稿没发布。E89（中）：聚光灯 GameJam 完赛率约 50–60%。
- **N1（中）**：开放题"开发中遇到的困难"里，"时间、动力、做完"被提到最多（21.4%）；10.5% 的人还没发布过任何作品。
- E97（弱，单案例）：PEAK 靠固定的发布日避免范围蔓延。
- **正视空白**：没有任何证据说明工具能提高完成率；E15 说缺纪律、缺时间是第一障碍，这两样工具解决不了。所以本插件的成功指标写成一个可证伪的实验（见下）。

**已核对的已有能力与增量**
- `ohmygame-plugins/plugins/game-studio/skills/game-studio/SKILL.md`（Create A Game 第 1、3 步）和 `web-game-studio/skills/web-game-studio/SKILL.md:26`：开局时定下"first playable scope"，写进画布设计文档；之后不再跟踪，并明说"without adding an approval checkpoint"。
- `src/daemon/agent-prompts.ts:19`：要求 Agent 在回合末尾用一段话总结改动、检查和没验证的部分。只总结单个回合，不对照范围。
- CCGS 的 `scope-check`、`cut`、`sprint-plan`、`milestone-review`、`gate-check`、`estimate`（`claude-code-game-studios/template/.claude/skills/`）：只对 CCGS 模板加 Claude Code 生效，而且要手动调用。
- 宿主的 Agent 通知只报"完成"（`docs/runtime.md` Agent notifications 一节）。发布记录插件读不到（F6）。
- **增量**：
  1. 能**自动验收**的阶梯，适用于任何 Agent；
  2. "不做"清单通过 instructions 送到每个 Agent；
  3. Jam 倒计时和截止前 24 小时的保底版本；
  4. 每天一次的偏离摘要。
- **与 CCGS 的分工**：检测到 `.claude/skills/scope-check/` 时，本插件不重复做范围管理，只显示阶梯，并提示用 `/scope-check`、`/cut`。

**MVP**
1. **开局卡**（`home.starters` 入口加面板）：问三件事，发布日、目标平台、一句话核心玩法；生成 `design/ship.json`，包含支柱、核心动词、单局时长、**不做清单**。静态 instructions 要求所有 Agent 在加功能前读这个文件，碰到不做清单里的项先问用户。
2. **五级阶梯**，每级都有机检条件：
   - 可启动：插件自开 `game` 会话，无控制台报错，截图不是空白；
   - 核心循环：有测试桥时，脚本化输入后 `snapshot` 有变化；否则由人勾选；
   - 有失败和重开：同上；
   - 可分享：监听 `build.completed`，`purpose=publish` 且成功（F6 的近似办法）；
   - 可上架：读 P2-02 写在项目里的报告文件。
3. **每日偏离摘要**（替代第 1 代的"每回合模型分类"）：`turn.completed` 只记改动的文件，不调用模型；每天第一次打开项目时用 `capabilities.models` 调用一次，对照 `ship.json` 总结"新增了哪些不在计划内的东西"，给出 toast，并把它们放进"以后再说"清单。
4. **Jam 模式**：
   - `project.toolbar` 显示倒计时；
   - 截止前 24 小时弹 `danger` toast，并提供命令"出一个可提交版本"（把提示词插入 Composer，再用 `build: "web"` 打 zip）；
   - 可以一键 `/publish` 到社区作保底。
5. **本地实验记录**：项目创建到第一次发布用了多少天、到达每一级用了多少天，存进插件数据目录，方便以后用户自愿汇总。

**用到的扩展点；宿主改动**
- 今天（2.37）能做：`home.starters`、`project.toolbar`、面板、静态 instructions、`turn.completed`、`build.completed`、`files.changed`、`capabilities.game`、`capabilities.models`、原生命令（`build: "web"`）。
- 宿主改动：MVP **不需要**。衡量效果需要：
  - **H8（可选）**：给插件一个只读的发布记录接口；
  - **H1**：Cloud 侧按"开没开这个插件"分组的匿名首发时间，用户自愿上报。

**成功指标（可证伪）**
- 主指标：从项目创建到第一次发布到社区的天数中位数。开插件的项目和同期没开的项目对比，至少看 8 周。
- 次指标：14 天内到达"可分享"的项目比例；Jam 模式的提交率（只和同一场 jam 里的非用户比，不和 E16/E17 的上限直接比）。
- **判负条件**：8 周后两组中位数差异小于 10%，或者用户关掉提醒的比例超过 50%，就把插件降级成一个 skill。

**风险与最弱点**
- **最弱点：效果没有证据**，动机和时间问题工具解决不了。
- 和 game-studio 的"首个可玩范围"、CCGS 的规划 skill 有交界；已通过上面的让位规则处理。
- 提醒太多会招人烦。默认只保留每日一次摘要和 Jam 的两次提醒。

---

## P2-02 发布前检查与网页渠道适配（launch-check）· 合并 P1-04、P1-05、P1-11（P1-15 的 Discord 部分放到二期）

**用户与场景**：OhMyGame 的网页游戏（`web-game`，以及有网页预览的 `general` 项目），准备从社区再往外发：CrazyGames、itch、自己的网站，或者拿手机分享。在桌面预览里一切正常，到了门户和手机上才发现首包太大、按钮在屏幕外、iPhone 没声音、外部字体被拦、包里有来路不明的素材。

**证据**
- E53（强，官方加定量）：每多 1 MB 流失几个百分点；Cannon Clash 做到 2.4 MB，进入游戏转化 81%。
- E56（强）：CrazyGames 初始下载 ≤50 MB，上手机首页要 ≤20 MB；≤1,500 个文件；只用相对路径；iOS 要在 touchend 里 resume AudioContext；DPR 1。
- E62（强）：Playables 初始包 <30 MiB，单文件 <30 MiB。
- E54（强）：竖屏、刘海、Safari 清存储、localStorage 要包 try/catch。
- E68（强）：自动播放限制。
- E55、E57、E58（强）：CrazyGames 的驳回原因、广告规则，提交须有封面和视频。
- E39（中）：Steam AI 披露规则。E66（弱，单案例）：AI 写的游戏上 CrazyGames 前补了六处。
- E27（强）：aspect-ratio 是问答站平均浏览最高的标签。
- **N1（中）**：网页开发者 67.3% 发到 itch 类平台，38.2% 发到自己的网站。说明"发到社区以外"是常态。
- 评审指出的空白仍在：没有门户驳回率数据；E65（弱）、E67（弱）只当参考。

**已核对的已有能力与增量**
- 发布对话框：总大小、文件数、最大的文件和顶层文件夹，对照 100 MiB；PNG 无损重压、去 Exif（`docs/runtime.md:1238-1265`，`src/daemon/publish/archive.ts` 的 `publishContents`）。只对社区一家、只看总量。
- 预览设备：fit、tablet、mobile、mobile-landscape（`src/shared/contracts.ts:18`），只改视口，不模拟 WebKit（`docs/plugins.md:1893`）。**本插件不再贡献预览设备。**
- 原生命令可以拿到 `build: "web"` 的构建（`docs/plugins.md:318`）；`build.*` 钩子只能听，拦不住发布（`docs/plugins.md:532`）。
- `.ohmygame/assets.json` 记录每个素材的提示词和来源；Library 来源的 `license` 字段可选（`docs/plugins.md:1254`）。
- web-game-studio 的 skill 要求 iframe 内响应式、不能横向溢出（`web-game-studio/skills/web-game-studio/SKILL.md:63`，`game-ui-frontend/SKILL.md:31`）。只是提示，不做测量。
- TapTap 插件已经做了 TapTap H5 的打包、CLI 预检和上传（`plugins/taptap/README.md`），**本插件不做 TapTap 配置**。
- 在 `ohmygame` 和 `ohmygame-plugins` 里 grep Poki、CrazyGames、Playables、GameDistribution、Yandex：**插件里零结果**；宿主里只有同名但无关的 `playable-*`（互动故事的 Playable Nodes）。
- 游戏 SDK 没有门户适配层（F2）。多人本地后端只监听回环地址（`docs/multiplayer.md:110`），宿主也没有局域网静态服务。
- CCGS 的 `launch-checklist`、`release-checklist` 是通用清单，不做测量（F8）。
- ffmpeg 不对插件开放（F3）。
- **增量**：
  1. 按平台算预算，首包和懒加载分开；
  2. 找出未被引用的素材、外部请求、绝对路径；
  3. 可撤销的一键压缩；
  4. 移动端规则的静态检查加运行时截图检查；
  5. **局域网真机扫码**（唯一能测到真 iOS Safari 的办法）；
  6. **CrazyGames 的完整链路**；
  7. 来源与授权账本。

**MVP**（按顺序交付，每一项都能单独用）
1. **目标平台配置加构建扫描**：先做社区、CrazyGames（手机和桌面）、itch 三个配置。
   - 解析入口 HTML、JS import 图和预加载清单，分出首包和懒加载；
   - 列出超预算项、最大文件、未被引用的素材、外部请求（字体、CDN）、绝对路径；
   - 结果写到 `.ohmygame/launch/report.json`，供 P2-01、P2-05、P2-10 读取（插件之间不能互相调用）。
2. **一键优化**，每项单独可撤销，走插件写入的检查点：
   - 图片转 WebP 或缩放（sharp 按需下载）；
   - GLB 用 gltf-transform 做 Draco/meshopt 压缩和贴图缩放（纯 JS 加 wasm）；
   - 删除未被引用的素材；外部字体改为本地打包并子集化。
   - 音频转码要 ffmpeg，放第二期，或者等 H4。
3. **移动端规则**：
   - 静态扫描：AudioContext 是否在手势里 resume、localStorage 是否包 try/catch、有没有 `visibilitychange` 暂停、DPR 上限、`user-select`/`touch-action`、WebGL context lost 处理；
   - 运行时：插件会话按 mobile、mobile-landscape 视口打开游戏并截图，交给视觉模型判断"关键按钮在不在可视区、文字能不能看清"。结论标为**启发式**，不当门禁。
4. **局域网真机扫码**：
   - 原生代码在局域网上托管构建，面板出二维码；
   - 构建里注入一个诊断浮层，通过 WebSocket 把报错、FPS、加载耗时、内存（能拿到时）回传面板。
   - 联机游戏不在范围内：多人后端只监听回环（H6）。
5. **CrazyGames 适配**：
   - 统一模块 `launch-sdk`：`loading(p)`、`gameplayStart()`/`gameplayStop()`、`ads.rewarded()`/`ads.midgame()`（自动暂停、静音、锁 UI，只在 adFinished 后发奖）、`storage`、`user`；
   - 预览里的模拟广告层：可模拟成功、中途关闭、失败、广告屏蔽；
   - 运行时检查：插件会话触发模拟广告，读 `snapshot` 确认游戏已暂停、音频已挂起，结束后已恢复；
   - 用了 OhMyGame SDK 云能力（存档、排行榜、登录）的游戏会被标出来，因为门户会拦外部请求，可能白屏；
   - 提交包：zip 符合文件数上限，附清单（描述、操作说明、封面图和视频尺寸）。
6. **来源与授权账本**：
   - 以 `assets.json` 为底，用 `asset.added`、`files.changed` 补全，记录进包文件的来源；
   - 标出没有来源记录的文件和 CC-NC 冲突；
   - 导出 CREDITS 和 AI 披露草稿（给 P2-10 用）。
- **二期**：YouTube Playables 配置（单文件 30 MiB 硬限）；Discord Activity 导出（来自 P1-15，前提是先确认 OhMyGame Cloud 能被 Discord 的 URL Mapping 映射）；Poki（邀请制）。

**用到的扩展点；宿主改动**
- 今天能做：原生命令（`build: "web"`、局域网服务器、gltf-transform、sharp 按需下载）、`build.completed`、`files.changed`、`asset.added`、`capabilities.game`（视口、截图、`snapshot`）、`capabilities.models`（图片输入）、面板、`project.publish` 菜单项、skill（接 `launch-sdk`）。
- 宿主改动：MVP 不是必须。
  - **H5**：游戏 SDK 在构建时关闭云能力或换后端的开关。只有用了 SDK 云能力的游戏需要；没有它时，插件对这类游戏只报警，不生成提交包。
  - **H4（可选）**：开放宿主的 ffmpeg 路径给原生插件。
  - **H6**：多人后端的局域网监听开关，让真机测试覆盖联机。

**成功指标**
- 用过插件的项目，首包大小中位数的前后对比；超出所选平台预算的项目比例。
- 真机测试发现、桌面预览没发现的问题数。
- 第一次提交 CrazyGames 就通过 QA 的比例（用户回填）；从社区版到生成 CrazyGames 提交包的时间。

**风险与最弱点**
- **最弱点：这是本代最大的插件**，容易做成大杂烩。对策是按上面的顺序分期交付，每期都能独立使用。
- 门户收入低（E69）。宣传口径只说"拿到流量和真人数据"。
- 门户规则会变；iOS 相关证据弱（E67），所以"内存估算"本代删掉了。
- 局域网扫码会碰到防火墙和公司网络的问题，需要有"手动输入地址"作为兜底。

---

## P2-03 真人试玩回路（含招募）（playtest-loop）· 来自 P1-03，新增"招募"模块

**用户与场景**：游戏已经能玩、想知道陌生人玩起来怎样的个人开发者。现在的做法是发链接给亲友，收到几句"挺好玩"，不知道多少人加载完就走了、卡在哪里；更多人根本找不到外人来玩。

**证据**
- E21（强，n=13 定性）：试玩有五个难点，**招募**、记录、分析、处理反馈等都在内；翻"2–3 days' worth of Discord messages"很耗时。
- E22（强，n=10）：受测试者数量和代表性限制。
- E24（中，定量）：GMTK 2024 作品评分中位数 14；有网页版的 jam 作品平均约 5 个评分，没有的约 1 个。
- E26（强，官方）：Poki 上传后几分钟内给 10–20 段真人录像，但只对进了 Poki 流程的游戏开放。
- **N1（中）**：
  - 60.9% 的网页开发者靠亲友试玩，**17.6% 找不到人试玩**，用招募工具的只有 1.1%；
  - **21.0% 要到游戏完全做完才第一次给外人玩**；
  - 但开放题里主动提"试玩和反馈"的只有 1.4%。痛点存在，但不是开发者最先想到的。
- E5（中，间接）：首 7 天好评率 91% 对 67%。E13（强）：论文作者建议多试玩。

**已核对的已有能力与增量**
- 社区：浏览数、点赞、评论。评论读取接口公开（`GET /community/games/:gameId/comments`，`docs/runtime.md:1332-1337`）；浏览数"do not establish that the game finished loading or a human played it"（`docs/runtime.md:1392`）。
- 游戏 SDK 没有埋点模块（F2）。`docs/game-sign-in.md` 有玩家身份，可以拿来区分试玩者，但不收集行为数据。
- web-game-studio 的 `game-playtest` 和 game-studio 的 `game-qa`（`plugins/*/skills/*/SKILL.md`）：都是 **AI 在玩**。
- CCGS 的 `playtest-report`：把人手写的笔记整理成报告。只适用于模板加 Claude Code，不收数据。
- feishu 插件是聊天机器人，不收集试玩数据。
- **增量**：真人漏斗、退出点、无偏问卷、反馈聚类，再加"把人找来"的招募。

**MVP**
1. **试玩构建**（发布菜单命令，`build: "web"`）：
   - 注入约 3 KB 的采集模块：加载进度、首次输入、`track()` 事件（Agent 按 skill 接好）、退出位置、报错；
   - 首屏有同意提示，不同意就只记匿名漏斗。
2. **今天就能用、不需要后端的回收方式**：游戏结束时，采集模块把本局摘要（到达的漏斗级别、退出点、死亡次数、时长、报错数）压成一个短码，附在问卷答案后面。试玩者**自己决定**把它贴到社区评论里（评论上限 500 字），插件通过公开的评论接口读取并解码。转化率低，但零后端、隐私边界清楚。
3. **结束问卷**：2–3 个按 E21 原则写的无偏问题（"你最后在做什么？""哪一刻想退出？"），不问"好不好玩"。
4. **面板加反馈聚类**：
   - 漏斗、退出和死亡点、报错；
   - 评论、问卷、粘贴进来的 Discord/飞书消息，用 `capabilities.models` 聚成"问题 → 提到人数 → 代表原话"，每条标注样本量；
   - 每条问题可以一键发给 Agent（插入 Composer）。
5. **招募（新）**：
   - 按目标人群生成招募帖（r/playmygame、itch 社区、Discord、TapTap 论坛），写明测什么、玩多久、怎么反馈；
   - 社区标题和描述加统一的"[求试玩]"标记（社区已支持按标题和描述搜索，`docs/runtime.md` Community 一节）；
   - 面板里列出带这个标记的其他作品，鼓励"先玩两款，再求两款"。目前只是约定，靠自觉，不强制。
- 第一代里的视频片段和玩法 A/B 都**不在 MVP**。A/B 改由 P2-06 的变体链接提供，本插件只负责收数据。

**用到的扩展点；宿主改动**
- 今天能做：`build: "web"`、`project.publish` 菜单项、面板（`net.fetch` 读评论接口，需在 `capabilities.network` 里声明 Cloud 主机）、`capabilities.models`、skill。
- 宿主改动：
  - **H1（关键）**：OhMyGame Cloud 给已发布游戏开一个试玩事件收集接口，包括同意文案、30 天保留期、只有作者能读。有了它，第 2 项的"贴码"就变成自动回收。
  - **H2**：社区的"求试玩"列表标记，以及互评队列（玩 N 款别人的作品，自己的作品进入队列前排）。这是招募真正能规模化的地方，插件本身做不了。
- 没有 H1、H2 时，插件仍然能用（贴码回收、招募帖、聚类），只是回收率低。

**成功指标**
- 每个试玩链接收回的有效会话数（贴码数，有 H1 后是事件数）。
- 第一次公开发布前，拿到 ≥10 个外人会话的项目比例。对照 N1：21% 的人到做完才第一次给外人玩。
- 来自试玩报告、被 Agent 修掉的问题数。

**风险与最弱点**
- **最弱点：没有 H1，回收要靠试玩者自己贴码**，很可能大多数人不贴。所以 H1 是这个候选的真正前提，必须明确提给宿主。
- 互评交换可能出现敷衍的试玩，需要宿主的反作弊（H2 的设计问题）。
- 隐私合规（GDPR、个人信息保护法），同意文案和保留期最好由宿主统一定。
- 开发者不常主动提试玩（N1 开放题 1.4%）：需求真实，但可能不愿意花时间。

---

## P2-04 交付质量门（delivery-gate）· 合并 P1-01 和 P1-12 的回合后扫描

**用户与场景**：让 Agent 改游戏的创作者。Agent 说"改好了"，人一打开发现角色飞出地图、按钮没反应。本插件只回答两个问题：**这一轮改完之后到底跑过没有**；**不看代码、只看画面，验收条目过没过**。

**证据**
- E41、E42、E44（都是弱，轶事，但来源互相独立）：Agent 误报"I tested it and it works perfectly!"；两张截图之间角色飞走；只看截图的独立视觉 agent 能抓到 z-fighting、悬浮物体和物理爆炸，而编码 agent "biased toward its own output"。
- E43（弱）：改一处坏一处。
- **评审的判定成立：需求证据只有轶事，有致命风险。** 本代不再引用 E36、E23 充数，改为给出下面的**埋 bug 基准**。基准的结论决定这个候选的去留。

**埋 bug 基准（实施前必须先做，结果写进下一代）**
- **样本**：10 个简单网页游戏，覆盖 Phaser 2D 平台跳跃、Three.js 3D、物理弹射、UI 为主的卡牌、2 人联机各 2 个；各自带 3–5 条验收条目，写在设计文档里。
- **任务**：每个游戏 3 个"让 Agent 修或加功能"的任务，共 30 个。每个任务预先埋一个和任务相关的缺陷：飞出边界、按钮失效、黑屏或空白、文字遮挡、状态不更新（各 6 个）。
- **对照**：两个 Agent（Pi 默认模型、Claude Code），每个任务跑 1 次。记录 Agent 是否声称完成；再由一个人（不看 Agent 的话）按验收条目判定是否真的好了。
- **指标**：
  - **假完成率** = 声称完成但实际未通过的回合 / 声称完成的回合；
  - **无证据率** = 改了游戏文件，但最后一次改动后没有任何运行时证据的回合比例；
  - 盲评对"真坏了"的**检出率**，以及对 30 个干净状态的**误报率**；
  - 每次盲评的耗时和模型调用数。
- **去留规则**：
  - 假完成率 ≥15%，且盲评检出率 ≥50%、误报率 ≤15%：保留完整插件；
  - 假完成率 <10%：淘汰，只建议宿主把"无证据提示"做进 Agent 提示词；
  - 盲评达不到阈值：只保留第 1 项"证据检查"。
- 基准套件以测试夹具的形式放进插件仓库，每换一代模型就能重跑。

**已核对的已有能力与增量**
- `game_use`：DOM、画布、控制台、失败请求、`snapshot`；截图有空白帧启发式，文档明说"heuristic rather than a semantic visual assertion"（`docs/runtime.md` Agent game use 和 Optional game bridge 两节）。
- **Game Tests**（`origin/feat/game-tests:plugins/game-tests/README.md`，未合并）：JSON 写的游戏测试，每一步可查元素、`snapshot()`、画面、控制台报错和失败请求，最多 4 个玩家；instructions 要求 Agent 改了有测试的游戏后自己跑。断言由写代码的一方决定。
- `web-game-studio/skills/game-playtest/SKILL.md`、`game-studio/skills/game-qa/SKILL.md`：做法说明，含 `visual` 模式。
- `src/daemon/agent-prompts.ts:19`：要求回合末尾说明哪些行为没验证（靠 Agent 自报）。
- 钩子：`tool.afterCall` 能看到 OhMyGame 工具，包括原生编码 Agent 调用的（F7，需实测）；`turn.completed` 给出本轮改动的文件（最多 500 个）；除两个以外的钩子只能听，只能弹 toast（`docs/plugins.md:532`）。
- 版本锁定的废弃 API 列表：CCGS 的 `docs/engine-reference/{godot,unity,unreal,web}/deprecated-apis.md`（只在 CCGS 模板项目里有）。
- **增量**：
  1. **客观的证据检查**：不靠 Agent 自报，用钩子判断"最后一次改动之后有没有运行证据"；
  2. **和写代码的 Agent 隔离、只看画面的盲评**；
  3. 对任何项目都生效的回合后废弃 API 扫描（列表从 CCGS 移植，按项目实际版本选用）。
- **明确不做**：逐帧不变式和回归脚本。前者建议作为 Game Tests 的一个 step 类型，后者是 Game Tests 本身的事。

**MVP**
1. **证据检查**：
   - `tool.afterCall` 记录 `game_use`（`act`、`capture`、`snapshot`）和 `game_test` 的时间；
   - `turn.completed` 取本轮改动，按路径区分游戏文件和其他文件；
   - 改了游戏文件、最后一次改动后没有运行证据时，弹 `danger` toast，面板记一笔，并提供"补测"命令（插入提示词）。
2. **盲评**：Agent 工具 `verify_change` 加面板按钮。
   - 从设计文档的 `acceptance` 列表取条目，插件自开会话执行；
   - 有 `step` 时按固定步长截图，没有时按时间截图；
   - 每次请求最多 8 张图（`docs/plugins.md` AI models 一节），评审提示词不含任何代码；
   - 输出通过 / 不通过 / 看不清，附异常类型。
3. **回合后 API 扫描**：从 `package.json` 或 `project.godot` 读引擎版本，用正则加轻量 AST 扫本轮改动的文件，命中就弹 toast 并给出正确写法。
4. **基准套件**：见上。

**用到的扩展点；宿主改动**
- 今天能做：`tool.afterCall`、`turn.completed`、`files.changed`、`capabilities.game`、`capabilities.models`（图片输入，每插件 3 并发、30 次/分钟，所以只评关键帧）、Agent 工具、面板、instructions。
- 宿主改动（最小）：**H3**，钩子返回的 notice 可以带一个"交给 Agent"按钮，点了就把指定提示词插进 Composer。今天的替代办法是 toast 加面板命令，多一步。
- 需要实测：插件会话能否调用测试桥的 `step`（第 1 代缺口 3，仍未确认）；`tool.afterCall` 能否看到 Claude Code 调用的 `game_use`（F7）。

**成功指标**
- 基准的四个指标（见上）。
- 实际使用中：改了游戏的回合里有运行证据的比例；用户标记"说修好了其实没修好"的次数。

**风险与最弱点**
- **最弱点：在基准跑出来之前，需求证据仍然只有轶事。** 这是本代唯一一个用"去留规则"给自己设门槛的候选。
- 和 Game Tests 有交界；分工写明了：Game Tests 负责脚本化断言，本插件负责证据检查和独立盲评。合并后可以把通过盲评的条目导出成 Game Tests 用例。
- 视觉模型自己会误判，所以设了"看不清"这一档，误报阈值写进去留规则。

---

## P2-05 玩法片段工作室（clip-studio）· 合并 P1-06 和 P1-08

**用户与场景**：游戏能玩了，要上 CrazyGames（必须交封面视频）、itch、Steam 商店页，或者发 TikTok/抖音、给达人。他们会做游戏，不会剪视频。本插件只做一件核心的事：**从可复现的自动试玩里出片段**。尺寸包和文案是附带功能。

**证据**
- E9（强，GDC n>2,300）：获客渠道中社交媒体 65%、主播 39%。
- E54（强）：网页玩家"more like TikTok viewers"，要在约 10 秒内展示核心能力。
- E58（强，官方）：CrazyGames 上架须交封面图和视频，可做封面 A/B 测试。
- E8（弱，案例）：Next Fest 突破者靠剪辑和短视频。
- E84（中）：微信素材平均生命周期 5.4 天。E77（强\*/中）：抖音靠达人和短视频分发。
- **N1（中）**：网页开发者宣传用 YouTube 32.7%、TikTok 11.4%，24.9% 完全不宣传。
- **正视空白**：EVIDENCE 文末写明"预告片和商店页制作"没有定量数据，也没有"用工具做素材能提升销量"的证据。E5 不再引用（评审指出引错了）。

**已核对的已有能力与增量**
- 录屏：人手动录最长 5 分钟，Agent 录最长 60 秒（`docs/preview-runtime.md:265-275`）；插件会话 `recordStart/Stop` 最长 60 秒，存进 Library（`docs/plugins.md:486`）。
- 视频裁剪（`docs/video-trimming.md`）、画布的 GIF/视频合成和抽帧（`docs/media-tools.md`）：都是人手动逐个操作。
- ffmpeg 不对插件开放（F3）；插件不能直接调用图像生成（`docs/plugins.md` AI models 一节只有语言模型）。
- 社区封面是内置的（`docs/runtime.md` Project covers 一节）；TapTap 插件能在 TapTap 上编辑商店页的截图字段（`plugins/taptap/README.md`）。
- 画布插件节点和预设（`docs/plugins.md:647` 起）。
- **增量**：
  1. 用 `setSeed` 和脚本输入**可重复录制**；
  2. 从 `snapshot` 事件**自动标出高光点**；
  3. **竖屏不靠裁剪**：直接用竖屏视口再录一遍，视口范围 240–4096 像素，和 `game_use` 一致；
  4. 批量出 6/15/30 秒三档，加多平台尺寸包。

**MVP**
1. **片段脚本** `clips/*.json`：种子、输入序列、视口（1920×1080 和 1080×1920），以及高光判定（例如 `snapshot.score` 跳升、`snapshot.event == "boss"`）。插件会话逐段录制，每段 ≤60 秒。
2. **剪辑**：原生代码按需下载 ffmpeg（附 GPL 许可文件），按高光点剪出 6/15/30 秒、导出 GIF 和 WebM；**前 3 秒放最强的画面**。竖屏版本用竖屏视口录，不做裁剪。
3. **尺寸包**：用片段里的帧加 logo，sharp 做确定性排版，出 Steam 各种 capsule、CrazyGames 封面、社区 16:10 封面，并检查小尺寸下标志是否可读。AI 主视觉由画布预设经画布节点生成，插件只排版。
4. **文案**：用 `capabilities.models` 起草短描述、操作说明、标签，按各平台字数上限检查；中文文案加一条广告法绝对化用语检查（"最""第一"等，注明不构成法律意见）。
5. 成品进 Library；对照 P2-02 报告里的目标平台，列出每个平台还缺什么。

**用到的扩展点；宿主改动**
- 今天能做：`capabilities.game`（`open`、`act`、`setSeed`/`snapshot` 经测试桥、`recordStart/Stop`）、原生命令（按需下载 ffmpeg、sharp）、画布预设、`capabilities.models`、`capabilities.library`、面板。
- 宿主改动：**H4（可选）**，开放宿主的 ffmpeg 路径，免得插件再下一份 GPL 二进制。不是必须。
- 不做：买量投放的数据回收和素材疲劳分析（P1-08 里已淘汰的部分）。

**成功指标**
- 做一套片段（三档 × 两种比例）的耗时；发布到社区以外的项目里素材齐全的比例。
- 用户回填的 CrazyGames 封面 A/B 点击率。

**风险与最弱点**
- **最弱点：效果没有证据**，能证明的只是"需求存在、做这件事费时"。
- 自动选的高光未必好看；需要录屏脚本的游戏有测试桥，没有的只能按时间切。
- 国内买量团队多有专职素材团队（E84：IAA 只占日买量消耗的 16.6%）。竖屏片段的定位是给达人和自然传播，不是给买量。

---

## P2-06 变体擂台（含数值模拟）（variant-arena）· 新候选，吸收 P1-02

**用户与场景**：项目早期，问题是"这个玩法哪种做法更好玩"：跳跃手感 A 和 B、加不加冲刺、两套经济曲线。Agent 出一个变体只要几分钟，但现在只能一次改一版、凭印象比较，改回来也麻烦。数值驱动的游戏（回合规则、放置经济）还可以让机器人批量跑。

**证据**
- E13（强，论文）：根因里 Unclear game design vision 28 次、Lack of fun 27 次；作者建议多做预制作和原型。
- E14（强）：小团队 gameplay "出错"16%，大团队 9%；"做对"27% 对 42%。
- E27（强）：balance 是问答站平均浏览最高、得分最高的标签之一（这是 P1-02 留下的证据）。
- E20（弱，厂商）：67% 的原型期不超过 3 个月；18% 难找独特概念。
- **N4（弱，厂商自述）**：Voodoo 一年测约 2,000 个原型，约 0.4% 进入正式发行；Ducky 称平均测 40 个才有 1 个达标。说明"多变体、快淘汰"是工业做法，但这是超休闲的买量语境。
- E26（强）：Poki 允许一天上传多次，靠真人录像快速迭代。
- E41（弱）：有开发者改用无头模拟跑"millions of simulated games"。
- 现成做法的佐证（不是数据）：CCGS 的 `prototype` skill 写着"Building 2-3 different concept variants and keeping the best beats iterating one concept to death"。
- **正视**：没有证据说明"并排比较"比"顺序迭代"更快找到好玩的方案。

**已核对的已有能力与增量**
- Tune 面板加 `tuning.json`：运行中实时调单个值；文件被任何人改了，新值都会直接送进运行中的游戏（F4，`docs/preview-runtime.md:292-319`）；`web-game-studio/skills/game-tuning/SKILL.md` 规定了文件格式。没有"一组值的预设"和比较。
- 检查点和撤销（`docs/checkpoints.md`）、Git 和 worktree（`docs/workspace-git.md:56`，"Linked Git worktrees are supported"）、复制项目：可以存多个版本，但没有比较的界面。
- CCGS `prototype`：一次做一个 one-shot 原型，结论是 PROCEED/PIVOT/KILL，有 `one-shot-tune.sh`（`template/.claude/skills/prototype/SKILL.md`，`template/.claude/scripts/one-shot-*.sh`）。只适用于 CCGS 加 Claude Code，而且不做变体并排。
- CCGS `balance-check`：静态读公式，不跑游戏。
- SDK 的 `defineGame`、`defineRealtimeGame`（`docs/multiplayer.md:268-390`）和 `simulateRoom`（`docs/multiplayer.md:391`，`packages/game-sdk/src/testing.ts`，有确定性时钟和种子）：是测试底座，没有机器人、批量运行和统计。
- 插件 `game.open({ path })`（2.37）可以带 `?variant=B` 打开。
- **增量**：
  1. 把变体当一等对象：一组 tuning 覆盖值，或者一个 worktree 分支；
  2. 在人玩的窗口里**即时切换**变体，并支持**盲玩**；
  3. 对规则类和放置类游戏，按变体**批量跑机器人**；
  4. 一页结论卡写回设计文档。

**MVP**
1. **变体定义** `variants.json`：
   - `preset`：一组 `tuning.json` 覆盖值（MVP 主路径）；
   - `branch`：一个 worktree 路径（第二路径，构建后用 `?variant=` 区分）。
   - skill 教 Agent 把变体差异做成 tuning 值或 `?variant=` 开关。
2. **即时切换和盲玩**：
   - 面板写入 `tuning.json`，人在 Play 窗口里不重载就能切换（F4）；
   - 盲玩模式把变体随机标为 X/Y，每玩一轮打一个 1–5 分和一句话；
   - 想让别人也来比较，生成带 `?variant=` 随机分配的分享链接，数据由 P2-03 回收。
3. **机器人批量模拟**（P1-02 收窄版，只有两条入口）：
   - 用 `defineGame` 写规则的游戏：随机、贪心、"原型策略"三种机器人，在 `simulateRoom` 上用 worker_threads 跑 1k–10k 局，按变体对比胜率、单局长度、是否有统治策略；
   - 放置和增量游戏：读 `tuning.json` 加一份经济公式模块，算出每个变体"距下一次升级的等待时间"曲线，标出超过 X 分钟的空档。
   - 不承诺能从任意代码里抽出纯逻辑。
4. **Agent 视角的盲评**（可选）：用 P2-04 的方式，对每个变体跑同一段脚本输入并截图，让视觉模型只描述差异，不下"好不好玩"的结论。
5. **结论卡**：每个变体的指标、评分、笔记 → 选定的变体写回设计文档，落选的打 tag 归档。

**用到的扩展点；宿主改动**
- 今天能做：面板（写 `tuning.json`，`ui.projectModules` 导入规则模块做小规模交互模拟）、原生代码（worker_threads、esbuild 打包项目的规则模块）、`capabilities.game`（`open({ path })`）、`capabilities.models`、Agent 工具 `run_variants`、skill。
- 宿主改动：**不需要**。可选：Tune 面板原生支持"预设"，体验会更好，但插件今天就能靠写文件实现。

**成功指标**
- 用过插件的项目在第一周比较过的变体数；从"想比较"到拿到结论的时间。
- 选定的变体在后续真人试玩（P2-03）里的指标，和落选变体对比（如果当时做了链接分流）。
- 机器人模拟发现、后来被真人确认的问题数。

**风险与最弱点**
- **最弱点：好玩不好玩，机器人测不出来，一个人自己盲玩的样本也太小**。插件只能让比较更快、更公平，不能替人下结论。
- 变体的证据主要来自超休闲买量语境（N4，弱）和论文建议（E13），不能直接推到"并排比较更有效"。
- 只适用于数值级变体和分支构建；对整体换玩法的比较，仍要靠各自做原型。
- 用 CCGS 的项目会和 `prototype` 有交界。分工：CCGS 管单个概念从零到一，本插件管同一概念的多个变体。

---

## P2-07 小游戏上架助手（IAA、分享与提审材料）（minigame-launch）· 新候选，吸收 P1-13

**用户与场景**：在 OhMyGame 里用 **Cocos Creator**（`general` 项目，配 cocos-creator、wechat-minigame、douyin-minigame 三个插件）做微信或抖音 IAA 小游戏的国内小团队。他们要接激励视频、插屏、分享、抖音录屏分享，第一次提审常因为发奖时机、录屏异常、残留 SDK 被驳回；还要准备软著材料。

**证据**
- E72（强）：小程序游戏收入 535.35 亿元，广告变现占 31.89%。
- E74（强\*）：微信小游戏开发者超 50 万，80% 以上是 30 人以下的团队；IAA 月活 4 亿，70% 的用户只玩 IAA。
- E75（强\*）：2025 年约 5000 名开发者首次发布游戏；社交渠道注册占比平均 30–50%，部分 IAA 游戏 80% 以上的收入来自社交渠道用户。
- E76（强\*）：IAA 基础分成 50%，激励方案合计最高约 90%。
- E78（中）：抖音在投 IAA 产品 +75.4%。
- E82（强）：主包 4 MB，总计 30 MB。
- E83（强，官方 / 弱）：抖音验收指南的驳回情形包括录屏功能异常、登录失败、支付异常；残留第三方支付 SDK 导致被拒的案例。
- **N2（强，官方）**：激励视频必须检查 `res.isEnded` 后才能发奖，每人每天次数有限，拉取失败要 `load()` 重试，1004 会走兜底分享页。
- **N5**：两个平台都有原生游戏录屏接口，抖音录屏分享要审核过的模板。
- E81（弱，口径冲突）：资质说法混乱，所以本插件只给带来源的清单，**不下结论**。

**已核对的已有能力与增量**
- `wechat-minigame/skills/wechat-minigame/SKILL.md`、`douyin-minigame/skills/douyin-minigame/SKILL.md`：
  - 只管打包、开发者工具、上传；明说"Upload, review, and release are separate steps"；
  - **没有广告、分享、录屏、审核**相关内容；
  - 只适用于 `general` 项目（F1）。
- `cocos-creator/skills/cocos-creator/SKILL.md`：用 Creator 命令行构建 `web-mobile` 或小游戏；"a successful build proves packaging only"。
- 游戏 SDK 不是小游戏 API（F2）；`game_use` 进不了微信运行时，skill 原话"Mini-program automation tools cannot inspect a game canvas"。
- TapTap 插件管的是 TapTap H5，不是小游戏。
- **web-game（Phaser、Three.js）项目今天没有发到小游戏的路线**（F1、N6）。本插件不承诺解决，把它列为生态缺口 H9。
- **增量**：
  1. 微信和抖音的**广告、分享、录屏统一接口**，带浏览器里的模拟层；
  2. 发奖时机等**规则检查**；
  3. 主包预算；
  4. 提审前扫描；
  5. 软著材料草稿。
- 和 P2-02 的区别：P2-02 管网页渠道（社区、门户），本插件管国内小游戏运行时（`wx`、`tt`）。两者的用户、运行时和规则来源都不同。

**MVP**
1. **`mg-ads` 模块**（TypeScript，附 Cocos 组件写法）：
   - `rewarded(placement)`：预拉取；失败后 `load()` 重试；**只在 `isEnded` 为真时返回 granted**；当天次数用完或拉取失败时，返回"隐藏按钮"的状态；
   - `interstitial()`：最小间隔可配置；
   - `share({ title, imageUrl, query })`：分别走 `wx.shareAppMessage` 和 `tt.shareAppMessage`；
   - `recorder`：抖音 `getGameRecorderManager` 的开始、停止、分享，以及微信 GameRecorder；
   - 在浏览器（`web-mobile` 构建的预览）里自动换成**模拟层**：可模拟看完、中途关闭、无填充、出错。
2. **规则检查**：
   - 静态：发奖代码不在 `isEnded` 分支里；没检查拉取状态就显示广告按钮；广告期间没有暂停和静音；分享回调里直接发奖（标为"待核实规则"，因为没找到官方条文）。
   - 运行时：当 `web-mobile` 预览能用时，插件会话触发模拟广告，用 `snapshot` 确认暂停和发奖逻辑。
3. **主包预算**：扫描 `wechatgame/` 或抖音的构建输出，对照主包 4 MB、总计 30 MB，列出最大的资源，建议移进分包（Cocos bundle 配置）。只给建议，不改配置。
4. **提审前扫描和验收清单**：
   - 残留的支付、广告、统计 SDK；隐私接口调用和声明是否一致；有没有适龄提示和健康游戏忠告；
   - 按抖音验收指南（E83）出清单，能静态判断的自动打勾，录屏、登录、支付给出真机步骤。
5. **软著和资质材料**：
   - 按常见格式抽取源程序（去掉注释里的密钥和第三方库）并排版成 docx；
   - 用插件会话给 `web-mobile` 构建截图，生成操作说明书初稿；
   - 资质清单：每条附来源链接和核对日期，醒目标注"不构成法律意见"。具体页数、行数等格式要求标为"待核实（以中国版权保护中心当期要求为准）"。

**用到的扩展点；宿主改动**
- 今天能做：skill、原生命令（扫描、docx 排版）、面板、`capabilities.game`（只能用于 `web-mobile` 网页预览，需实测 Cocos 的 `general` 项目能否开网页预览）、`capabilities.models`、`project.publish` 菜单项；`appliesTo: ["general"]`。
- 宿主改动：MVP **不需要**。
- 生态缺口 **H9**（不属于本插件）：web-game 到小游戏的适配路线（Phaser/Three 加适配层，或者推荐 Cocos/Laya 路线）。这决定了本插件在 OhMyGame 里的受众能有多大，要和维护者确认方向。

**成功指标**
- 用户回填的首次提审通过率；规则检查拦下的发奖和广告流程问题数。
- 主包超限的项目比例；准备软著材料的耗时。

**风险与最弱点**
- **最弱点：在 OhMyGame 里的受众目前很窄**，只有 Cocos/Unity 路线的用户（F1）。国内小游戏盘子很大（E74），但大部分在 OhMyGame 之外。
- 真机和平台运行时测不了，模拟层只能验证逻辑。
- 流量主门槛、"诱导分享"等规则没有找到官方条文。只引用 N2 这类官方文档，其余标"待核实"。
- 平台在自建 AI 工具（E91），可能覆盖其中一部分。
- 软著、资质都有法律风险，只能整理材料，不能给结论。

---

## P2-08 网页玩家回放与分享（含主播模式）（clip-share）· 新候选

**用户与场景**：发在社区、itch、自己网站上的网页游戏。玩家打出一局好成绩、遇到一个搞笑的物理瞬间，想发给朋友或发到短视频平台，但游戏里没有录屏和分享；主播直播时，房间邀请码和昵称会被观众看到。传播是玩家自己剪出来的，不是开发者剪的（评审 §3.2）。

**证据**
- E8（弱，案例）：YAPYAP 一周 50K 条 Medal 剪辑，TikTok 公告约 1.5M 播放。
- E9（强）：获客渠道中社交媒体 65%、主播 39%。
- E54（强）：网页玩家"more like TikTok viewers"。
- E100（弱）：Schedule I 的增长归因于在直播中走红。
- E75（强\*，旁证，平台不同）：微信社交渠道注册占比 30–50%。E77（旁证）：抖音达人供给 +300%。
- **N1（中）**：开发者宣传主要靠 Discord、X、YouTube；24.9% 完全不宣传。说明"让玩家替你传播"对这类开发者有价值。
- **正视空白**：没有证据说明游戏内的分享按钮或片段能提升新增玩家；主播模式的需求只有 E9、E100 间接支持。

**已核对的已有能力与增量**
- 宿主录屏是给开发者用的（`docs/preview-runtime.md:265`），不进游戏。
- 社区页用 `navigator.share` 分享的是游戏链接，不是片段（`src/renderer/games.tsx:395-425`）。
- 游戏 SDK 没有分享、回放、录屏模块（F2）；多人 SDK 有房间消息和表情（`docs/multiplayer.md` Room messages 一节），没有主播模式。
- 小游戏平台自带录屏接口（N5），那部分归 P2-07。
- **增量**：一个**在游戏里**运行的模块，包括环形缓冲录屏、分享卡、挑战链接和主播模式，加上自动检查和平台规则开关。

**MVP**
1. **`clip-share` 模块加 skill**：
   - 用 `canvas.captureStream()` 加 MediaRecorder 维护最后 N 秒（默认 15 秒，帧率和码率有上限）的环形缓冲；
   - 游戏在高光处调用 `clip.mark("boss")`，结算画面上出现"保存片段"；
   - 手机上用 Web Share（带文件）分享，桌面上下载。
2. **分享卡和挑战链接**：结算时把画面加分数排成 1200×630 和 1080×1920 两张卡；生成带 `?seed=` 的挑战链接（需要游戏支持种子），点开就是同一局。
3. **主播模式**：
   - 一个开关；
   - 游戏通过 `streamer.mask()` 显示邀请码和昵称，开关打开时打码；
   - 标了 `licensed: true` 的音轨静音；
   - 关掉房间聊天。
4. **自动检查**：插件会话打开游戏，经测试桥触发 `clip.save()`，从 `snapshot` 读片段的字节数和时长，对比录屏前后的 FPS（游戏在 `snapshot` 里报告）。注意：试玩窗口禁止下载，所以只验证生成，不验证保存。
5. **平台开关**：读 P2-02 报告里的目标平台。Poki 要求外链必须走 SDK（E51），所以门户构建默认关闭外链分享，只留"保存片段"；社区、itch、自建站全开。

**用到的扩展点；宿主改动**
- 今天能做：skill（接入模块）、`capabilities.game`（`open`、`snapshot`、`act`）、原生命令（往构建里注入模块）、面板（设置和检查结果）。
- 宿主改动：**不需要**。可选：社区评论支持附带片段，属于宿主社区功能，不在插件范围。

**成功指标**
- 有了 P2-03 的事件收集（H1）后：保存过片段的会话比例，分享次数，挑战链接带来的进入数。
- 没有 H1 时只能看：接入模块的游戏数，以及检查发现的性能回退。

**风险与最弱点**
- **最弱点：证据最间接**。玩家自发剪辑的证据是 Steam 上的 3D 合作游戏（E8），能不能迁移到网页小游戏不确定。
- 移动端录屏有性能和内存开销，iOS Safari 尤其要注意（E67）。默认只在桌面开启环形缓冲，手机上改为"结算时截图"。
- 隐私：片段里可能有其他玩家的昵称，主播模式和默认打码要一起设计。

---

## P2-09 本地化与文字溢出检查（loc-check）· 新候选

**用户与场景**：
- 中文创作者要上 CrazyGames、Poki、Steam，没有英文就被驳回；
- 想吸引 Steam 中文玩家的创作者要加简体中文；
- 翻译之后按钮文字溢出、德语或英文比中文长一倍、画布上的文字被截断。手动在每种语言、每个屏幕尺寸下都点一遍，没人做得来。

**证据**
- E55（强，官方）：CrazyGames 的驳回原因之一是"没有英文"；受众集中在美、英、澳。
- E104（强/弱）：Poki 覆盖 193 个国家，建议用图示代替文字；PEAK："text is evil"；文末写明本地化缺定量数据。
- **N3（强，官方调查，但月度波动大）**：Steam 2025-06 English 36.31%、Simplified Chinese 26.73%。中英双语覆盖了 Steam 一半以上的用户。
- E36（弱，厂商）：45% 用 AI 做本地化和翻译。
- E54（强）：玩家认不出"space"这个词，改成键盘图。E27（强）：aspect-ratio、UI 缩放是浏览最高的话题，溢出问题和它同源。
- **反面证据 N1**：开放题里提到本地化的只有 0.3%。开发者很少主动把它当痛点，所以本插件的定位是"上架门槛的检查"，不是"开发者天天喊的痛"。
- 证据空白：没有文字溢出发生频率的数据。

**已核对的已有能力与增量**
- CCGS `localize`（`claude-code-game-studios/template/.claude/skills/localize/SKILL.md`）：扫硬编码字符串、抽取字符串表、校验长度和占位符、文化审查、RTL、字符串冻结。**全是静态检查**，只适用于 CCGS 加 Claude Code，不截图。
- `docs/ui-languages.md`：只管 OhMyGame 应用自己的界面语言，不管游戏。
- web-game-studio 和 game-studio 的 skill 里没有游戏本地化内容（grep `locali|i18n|translat` 只命中 iframe 横向溢出的提示）。
- `game-tuning` skill 只要求面板标签用用户的语言。
- `capabilities.game` 可以 `open({ path: "?lang=en" })`，`act` 可以调视口（`docs/plugins.md:477-500`，`docs/runtime.md` Agent game use 一节）。
- **增量**：
  1. **运行时**按"语言 × 视口"截图，并测量 DOM 溢出；
  2. 翻译前先做**伪本地化**，提前暴露布局问题；
  3. 带术语表和长度预算的翻译；
  4. 检测图片素材里的文字。
- 对任何 Agent 的网页游戏都生效。

**MVP**
1. **抽取**：
   - skill 加原生扫描，用 JS/TS 字面量启发式找出界面字符串，生成 `locales/zh-CN.json`、`locales/en.json`；
   - 提供约 1 KB 的 `t()` 运行时，读 `?lang=` 和浏览器语言；
   - 改代码由 Agent 按 skill 完成，插件只出清单和检查。
2. **伪本地化**：生成 `xx-pseudo` 语言，长度增加 40%，加重音和全角字符，翻译之前先找出会溢出的地方。
3. **翻译**：用 `capabilities.models` 加项目术语表；每条附长度上限（来自第 4 步测到的容器宽度）；保留占位符；输出"需要人看"的清单（双关、文化梗）。
4. **溢出检查**：对每种语言（含伪本地化）× 每种视口（mobile、mobile-landscape、桌面），插件会话打开 `?lang=xx&ohmygamePlaytest=1`，按脚本走关键屏幕：
   - DOM 界面：模块在 `snapshot` 里报告 `scrollWidth > clientWidth` 的元素；
   - 画布文字：截图交给视觉模型，判断有没有截断或重叠，标为启发式；
   - 报告带截图和定位。
5. **图片里的文字**：视觉模型扫 UI 素材，标出含文字的图片，建议改成图示或按语言重新生成。

**用到的扩展点；宿主改动**
- 今天能做：skill、原生命令（扫描、生成伪本地化）、`capabilities.game`（`open({ path })`、视口、截图、`snapshot`）、`capabilities.models`（翻译、图片输入）、面板、`files.changed`（字符串表改了就重跑对应检查）。
- 宿主改动：**不需要**。

**成功指标**
- 伪本地化在发布前发现的溢出问题数；
- 用户回填的"没有英文"驳回次数（CrazyGames）；
- 加一种语言所需的时间。

**风险与最弱点**
- **最弱点：开发者很少主动提这个痛点（N1 0.3%）**。需求主要来自平台门槛（E55）和受众结构（N3），所以要把它挂在 P2-02 的 CrazyGames 检查和 P2-10 的 Steam 检查里触发，而不是指望用户主动打开。
- 画布文字溢出只能靠视觉模型判断，不可靠。
- AI 翻译的质量，尤其是游戏术语和梗，需要人看。
- 用 CCGS 的项目会和 `localize` 有交界：静态部分让给 CCGS，本插件只做运行时检查。

---

## P2-10 Steam 上架通道（steam-ship）· 来自 P1-07，因游戏线需求重新评估

**用户与场景**：想把 OhMyGame 做的网页游戏（Phaser、Three.js）或 Godot 游戏卖到 Steam 的小团队。游戏线第 1 代有 8 个候选以 Steam 为主平台（`gen-1-games-review.md` 第 4 节）。他们卡在三处：网页游戏怎么变成桌面包；Steamworks 的 depot、branch、steamcmd；什么时候开商店页、做 demo、报 Next Fest。

**证据**
- E102（强，GDC）：最近项目 PC 占 83%，下一个项目 40% 对 Steam Deck 有兴趣。这是全行业口径。
- **N1（中）**：网页游戏开发者里 **15.9% 发布到 Steam**（itch 67.3%）。这是比 E102 更贴近 OhMyGame 用户的口径：有需求，但属于少数。
- E5、E6、E7（中）：首周销量约为愿望单的 0.10–0.15 倍；表现好的商店页平均上线 214 天；约 7,000 个愿望单才能进 Popular Upcoming。
- E39（中）：Valve 2026-01 的 AI 披露新规。
- E65（弱）：62% 的玩家在网页上发现游戏后下载或购买过（网页 demo 可以当漏斗）。
- **N7（弱）**：Phaser 官方介绍了 Electron 上 Steam 的流程；SteamDB 能识别出的 Electron 产品约 100 款（低估）。路线存在，走的人少。
- E3（中）：Steam 中位收入约 $249，40% 赚不回 $100 上架费。期望要压低。
- 评审指出的问题仍然成立：E97、E100 和工具无关，**本代不再引用**。

**已核对的已有能力与增量**
- 宿主没有桌面导出：网页发布只到社区；"Native engines use their own tools or Connections"（`docs/runtime.md` Agent game use 和 Publishing 两节）。
- godot 插件：会在 Steam 安装目录里找 Godot 编辑器（`godot/native/godot.mjs:12-54`），只做网页导出，其他平台保持原有的导出预设（`godot/skills/godot-game/SKILL.md:22-24`）。没有 Steamworks。
- 在插件和宿主里 grep "steam"：除了上面的找编辑器，只有 CCGS 的 `launch-checklist`、`release-checklist`（`cert_tier: steam`），是清单，不做构建和上传（F8）。
- 预览设备和手柄映射：`previewDevices`、`inputMaps`（`docs/plugins.md:1893-1915`）。
- `game_use` 只覆盖网页运行时，Electron 桌面窗口测不了（`docs/runtime.md` Runtime adapter boundary 一节）。
- P2-02 的来源账本可以给出 AI 披露草稿（通过报告文件）。
- **增量**：
  1. 上线节奏 skill；
  2. 网页构建的桌面套壳；
  3. steamcmd 上传；
  4. Steam Deck 自检；
  5. 网页 demo 里的愿望单入口。

**MVP**（按成本从低到高，第 1 项先单独发）
1. **上线节奏 skill**：输入目标上线月份，生成时间线（开 Coming Soon 页、demo、Next Fest 报名窗口），附 E5–E7 的基准，并标明是第三方估算；商店页清单；AI 披露怎么填（按 Valve 2026-01 规则，读 P2-02 报告）。
2. **桌面套壳**：在项目里用 `npx electron-builder` 打 Windows、macOS、Linux 包（Electron 按需下载，不进插件包）；可选接 steamworks.js 做成就和 Overlay。Godot 项目用 godot 插件已有的导出预设，本插件只负责上传。
3. **steamcmd 上传**：生成 app_build 和 depot 的 VDF，上传到指定的 beta 分支；Steam Guard 验证通过 `progress` 链接引导；账号存在插件密钥里，不进项目。
4. **Steam Deck 自检**：贡献 1280×800 预览设备和手柄映射；插件会话只用手柄映射对应的按键走一遍主流程；用视觉模型粗查最小字号，以及有没有只能用鼠标的界面。
5. **网页 demo 漏斗**：只在社区、itch、自建站的构建里插入"在 Steam 上加入愿望单"按钮。门户构建不插，因为 Poki 不允许 SDK 以外的外链（E51）。

**用到的扩展点；宿主改动**
- 今天能做：skill、原生命令（`timeoutSeconds` 最长 3600，用于下载和上传；`build: "web"`）、插件设置和密钥、`progress` 链接、`previewDevices`、`inputMaps`、`capabilities.game`（只能测网页版）、`project.publish` 菜单项、面板。
- 宿主改动：MVP **不需要**。
  - 已知缺口：桌面原生窗口的试玩（游戏线 G1-03 也需要），即宿主或插件提供的 Electron 运行时适配器（`docs/runtime.md` Plugin game runtimes 一节的机制可以承载）。不在本 MVP 里。

**成功指标**
- 通过插件上传过 Steam 构建的项目数；从"决定上 Steam"到第一个 beta 构建上传成功的时间。
- 上线前 ≥6 个月开了商店页的比例（对照 E5 的 214 天）。

**风险与最弱点**
- **最弱点：需求面不大，而且一部分需求来自我们自己的游戏线**（有循环论证之嫌）。N1 显示网页开发者只有约 16% 发 Steam。所以先发 skill，套壳和上传等真实用户提出需求再做。
- 网页技术套壳的游戏在 Steam 上竞争力有限；$100 上架费和中位收入很低（E3）。
- Electron 运行时体积约百 MB，Steamworks 规则也会变。

---

## 3. 淘汰或拆解的第 1 代候选

| 第 1 代 | 处理 | 理由（含核对路径） |
|---|---|---|
| P1-09 风格锁 | **淘汰（插件），转为宿主需求** | ① 已有能力覆盖了大半：内置 Check pixel art 支持多张图比较尺寸、脚底行和合计颜色数，并按像素密度检查调色板预算（`docs/media-tools.md:118-147`）；像素密度预设会把调色板预算写进提示词（`docs/canvas-agent.md:36` 起）；宿主要求新游戏写 visual direction（`src/daemon/agent-prompts.ts:51`）；还有 sprite-pipeline skill。剩下的增量只有"自动触发"和"项目级调色板"，太薄。② 最有效的手段被宿主挡住：`image.beforeGenerate` "can't add or remove reference images"（`docs/plugins.md:606`）。③ 风格一致性在 EVIDENCE 里明确是证据空白。转为宿主需求 **H7**（钩子能追加项目内的参考图），另外建议宿主加一个"素材入库时自动跑 Check pixel art"的设置。 |
| P1-10 拼装骨骼动画 | **淘汰** | PixelLab 已覆盖像素角色的骨骼动画、帧动画、补帧、8 方向（`plugins/pixellab/README.md:45-51`）；非像素拼装动画有 Spine、DragonBones；改成"手感组件库"的话，手感和 juice 是 EVIDENCE 的证据空白，会碰到"只有轶事"的致命项。建议把挤压拉伸、受击闪白等写进 web-game-studio 的 skill，作为对现有插件的贡献，不单独做插件。 |
| P1-15 联机网络实验室 | **拆解** | 延迟和抖动参数、局域网监听属于宿主改动（**H6**：在 `src/desktop/playtest-network.ts` 已有的每窗口 SOCKS5 代理上加 `setNetworkConditions`，以及多人后端的局域网开关，见 `docs/multiplayer.md:110,127`）；多人回归属于 Game Tests；Discord Activity 导出并入 P2-02 二期（前提是确认 Cloud 能被 URL Mapping 映射）。 |
| P1-08 小游戏买量素材工厂 | 上一代已淘汰，竖屏部分并入 P2-05 | 不做投放数据回收和素材疲劳分析。 |
| P1-12 代码护栏 | 上一代已淘汰，回合后 API 扫描并入 P2-04 | `tool.beforeCall` 对原生 Agent 无效（`docs/plugins.md:589`），所以只保留事后扫描。 |

---

## 4. 宿主改动汇总（按影响排序，尽量小）

| # | 改动 | 谁需要 | 必须还是可选 | 估计改动面 |
|---|---|---|---|---|
| H1 | Cloud 给已发布游戏开试玩事件收集接口（同意文案、30 天保留、只有作者能读） | P2-03（自动回收）；P2-08、P2-01 的效果衡量 | P2-03 的关键前提；没有它可以降级成"贴码" | Cloud 新增一个写入接口和一个读取接口，加上 SDK 里一个很小的上报函数 |
| H2 | 社区"求试玩"标记和互评队列 | P2-03 的招募 | 可选，但招募要规模化必须有 | 社区列表加筛选，再加一个队列 |
| H3 | 钩子的 notice 可以带"交给 Agent"按钮（把指定提示词插进 Composer） | P2-04、P2-01 | 可选（今天用 toast 加面板命令代替） | 扩展 `{ notice, tone }` 的返回结构 |
| H4 | 向原生插件开放宿主 ffmpeg 的路径（`context.media.ffmpegPath`） | P2-05、P2-02（音频） | 可选（今天按需下载） | 很小，二进制已随宿主分发 |
| H5 | 游戏 SDK 在构建时关闭云能力或换后端的开关 | P2-02（用了 SDK 云能力的游戏上门户） | 对这类游戏必须 | SDK 读 manifest 的一个开关 |
| H6 | 游戏会话的网络条件参数，加上多人后端的局域网监听开关 | 从 P1-15 拆出；P2-02 的联机真机测试 | 宿主独立需求 | 改已有的 SOCKS5 代理和后端监听地址 |
| H7 | `image.beforeGenerate` 可以追加项目内的参考图 | 从 P1-09 拆出 | 宿主独立需求 | 钩子返回值多一个字段 |
| H8 | 给插件一个只读的发布记录接口 | P2-01 | 可选（今天用 `build.completed(purpose=publish)` 近似） | 很小 |
| H9 | 生态问题：web-game 到微信/抖音小游戏的适配路线 | P2-07 的受众规模 | 方向性问题，要和维护者确认 | 大，不在任何插件的 MVP 里 |

---

## 5. 谱系表

| 第 2 代 | 来源 | 本代修正要点（对应评审要求） |
|---|---|---|
| P2-01 必发阶梯 | P1-14 | 去掉每回合模型分类，改成每天一次摘要；承认没有效果证据，写出可证伪的对照实验和判负条件；检测到 CCGS 时让位给它的 scope-check、cut；"可分享"一级用 `build.completed(purpose=publish)` 判断（F6） |
| P2-02 发布前检查与网页渠道适配 | P1-04 + P1-05 + P1-11（+ P1-15 的 Discord，二期） | 删掉预览设备（已内置）；说明和发布对话框的区别（按平台、首包和懒加载分开）；保留真机扫码作为硬增量；门户只做 CrazyGames；来源账本降为模块；删掉 iOS 内存估算；不再假设宿主 ffmpeg 可用。国内小游戏的主包和残留 SDK 扫描**没有**放进来，放进 P2-07，理由是运行时和用户都不同（与评审建议有偏离，已说明） |
| P2-03 真人试玩回路（含招募） | P1-03 + 新增"招募"模块 | MVP 去掉视频片段和 A/B（A/B 交给 P2-06）；收集后端正式列为宿主需求 H1；补了今天就能用的"贴码"回收方式；新增招募模块（回应评审 §3.3），引入 N1 |
| P2-04 交付质量门 | P1-01 + P1-12（回合后扫描） | 收窄到证据检查、盲评、API 扫描；不变式交给 Game Tests；给出埋 bug 基准的完整设计和去留阈值；去掉对 E36、E23 的过度引用 |
| P2-05 玩法片段工作室 | P1-06 + P1-08 | 聚焦从可复现试玩出片段；竖屏改为用竖屏视口录，不裁剪；ffmpeg 按需下载，H4 可选；capsule 和文案降为附带功能；去掉买量数据回收；E5 不再引用 |
| P2-06 变体擂台（含数值模拟） | 新 + P1-02 | 回应评审 §3.4（多变体原型对比）；P1-02 只保留 `defineGame` 和放置经济两条入口；用写 `tuning.json` 实现即时切换（F4），不需要宿主改动 |
| P2-07 小游戏上架助手 | 新 + P1-13 | 回应评审 §3.1（国内 IAA 和分享接入）；P1-13 改为"带来源的清单，不下结论"，聚焦软著材料和残留 SDK 扫描；加入 N2 官方规则；正视 F1（web-game 没有小游戏路线） |
| P2-08 网页玩家回放与分享 | 新 | 回应评审 §3.2（玩家侧传播和主播模式）；小游戏的录屏交给 P2-07 |
| P2-09 本地化与文字溢出检查 | 新 | 回应评审 §3.5；和 CCGS `localize` 分工（静态归 CCGS，运行时归本插件）；引入 N3，并写明 N1 的反面证据 |
| P2-10 Steam 上架通道 | P1-07 | 游戏线有 8 个候选需要，重新评估；用 N1 的 15.9% 修正需求面；先发 skill；删掉和工具无关的 E97、E100 引用 |
| — | P1-09 | 淘汰，转为宿主需求 H7 |
| — | P1-10 | 淘汰，建议改成给 web-game-studio skill 的贡献 |
| — | P1-15 | 拆解：H6 给宿主、回归给 Game Tests、Discord 给 P2-02 二期 |
| — | P1-08、P1-12 | 上一代已淘汰，部分功能已吸收（见上） |

---

## 6. 覆盖表

### 6.1 对照 EVIDENCE 的高频痛点索引

| # | 高频痛点 | 覆盖的候选 | 说明 |
|---|---|---|---|
| 1 | 发现性与营销 | P2-05（开发者侧片段）、P2-08（玩家侧传播）、P2-10（Steam 节奏）；间接 P2-02（门户流量） | 供给过剩和平台算法工具解决不了 |
| 2 | 做不完：范围、低估、动机 | P2-01 | 动机和时间不可解；效果用实验检验 |
| 3 | 设计愿景不清、不好玩 | P2-06（变体比较）、P2-03（真人数据）、P2-01（意图卡） | 不让 AI 判断"好不好玩" |
| 4 | 试玩难（招人、记录、分析） | P2-03（含招募）、P2-06（机器人）、P2-04（AI 盲评） | 招募要规模化依赖 H2 |
| 5 | Agent 测不了运行中的游戏、误报完成 | P2-04 | 先跑基准再决定去留 |
| 6 | 包体和加载时间 | P2-02（网页）、P2-07（小游戏主包） | — |
| 7 | 多门户和多平台 SDK 与合规 | P2-02（CrazyGames，二期 Playables、Discord）、P2-07（微信、抖音）、P2-10（Steam）、P2-09（英文门槛） | Telegram、Facebook Instant、Yandex 仍未覆盖：没有 OhMyGame 用户的需求信号 |
| 8 | 移动端浏览器的坑 | P2-02（规则检查加真机扫码）、P2-08（移动端录屏默认关闭） | iOS 证据弱 |
| 9 | 美术和音频技能缺口 | 本代没有专门候选；P2-05 的尺寸包只是边角 | 音频是证据空白；风格锁已淘汰并转为宿主需求 H7 |
| 10 | AI 素材不一致、动画缺口 | 没有插件候选（P1-09、P1-10 已淘汰） | PixelLab 和内置 Check pixel art 已覆盖大半；剩下的靠 H7 |
| 11 | 技术硬骨头（UI 缩放、物理等） | P2-09（多语言 × 视口溢出）、P2-02（横竖屏）、P2-04（物理飞出的画面检出） | 着色器、iOS 原生导出不覆盖 |
| 12 | 多人联机 | P2-02 真机测试（联机部分依赖 H6）、P2-08 主播模式 | 网络模拟交给宿主 |
| 13 | AI 代码库腐化、引擎版本混淆 | P2-04（回合后 API 扫描） | 原生 Agent 拦不住，只能事后扫 |
| 14 | AI 声誉、披露和版权 | P2-02（来源与授权账本）、P2-10（Steam AI 披露）、P2-05（广告法用语） | — |
| 15 | 网页和独立游戏变现低 | P2-07（IAA 正确接入）、P2-02（CrazyGames 广告规则） | 主体不可工具化 |
| 16 | 国内资质门槛加买量素材 | P2-07（资质清单和软著材料）、P2-05（竖屏片段，不做投放） | 版号周期不可解 |
| 17 | 工具和引擎迁移成本 | P2-04 的版本参考（移植 CCGS 的列表） | 弱覆盖 |

### 6.2 对照 `pool/plugins.md` 的 5 个未覆盖痛点

| 未覆盖痛点 | 本代候选 | 证据 |
|---|---|---|
| 国内小游戏激励视频、插屏、分享接入与规则检查 | P2-07 | E72、E74、E75、E76、E83、N2、N5 |
| 玩家侧回放、剪辑、分享与主播模式 | P2-08（网页）；P2-07（小游戏录屏） | E8、E9、E54、E100；N5 |
| 试玩招募 | P2-03 的招募模块，加宿主需求 H2 | E21、E24、N1 |
| 同一玩法多变体的快速原型对比 | P2-06 | E13、E14、E20、N4 |
| 英文化、本地化与文字溢出检查 | P2-09 | E55、E104、E36、N3 |

### 6.3 对照游戏线的能力缺口（`gen-1-games-review.md` 第 4 节）

| 游戏线缺口 | 本代处理 |
|---|---|
| Steam / Steamworks 发布 | P2-10 |
| 西方门户 SDK 适配和合规检查 | P2-02（CrazyGames 先行） |
| 嵌入式渠道（Discord、Playables、Telegram） | P2-02 二期做 Discord 和 Playables；Telegram 不做 |
| 无头批量模拟和平衡看板 | P2-06 |
| 小游戏主包 4 MB 预算和分包 | P2-07 |
| 竖屏短视频素材管线 | P2-05 |
| 多人语音、麦克风输入模拟 | 不做：插件页面没有麦克风（CONTEXT 限制），需要宿主和 SDK 层面支持 |
| 群级或好友级共享状态、微信关系链 | 不做：属于 SDK 和平台能力；P2-07 只做分享卡 |
| 桌面原生窗口的构建和试玩 | P2-10 只做构建；试玩列为已知缺口（plugin game runtime 机制可以承载） |
| 网络物理同步模板 | 不做插件：建议写进 web-game-studio 的 skill |
| 像素帧动画一致性 | 由 PixelLab 和 pixelfx（计划中）覆盖 |
| 原创性和同类检索 | 本代不做：需求真实（E55、E63），但"自动查重"对每个平台都需要搜索 API，没有可行的 MVP 证据；留给下一代评估 |

---

## 7. 生成者自评：哪里最容易被攻击

- **证据最弱的三个**：
  - P2-08（玩家侧分享的效果没有任何数据）；
  - P2-04（在基准跑出来之前只有轶事，本代已经给它设了去留规则）；
  - P2-09（开发者很少主动提，N1 只有 0.3%）。
- **最依赖宿主的**：P2-03。没有 H1，回收要靠试玩者自己贴码。
- **受众最窄的**：P2-07（F1：OhMyGame 的主力项目类型发不到小游戏）和 P2-10（N1：约 16% 的网页开发者发 Steam）。
- **最大的工程风险**：P2-02 范围最大，已按分期交付处理。
- **本代与评审建议的偏离**：
  - 国内小游戏的主包和残留 SDK 扫描放进 P2-07，没有放进 P2-02；
  - 招募并入 P2-03，没有单独成立候选；
  - 第 1 代的数值平衡实验室（P1-02）并入 P2-06。
- **按证据强度粗排（仅供评审参考）**：
  - 较强：P2-02（多条官方规则加 Cannon Clash 定量数据）、P2-01（两篇论文加 jam 数据，但效果没有证据）、P2-07（平台口径加 N2 官方规则，但受众窄）；
  - 中等：P2-03（论文定性研究加 N1 定量）。
