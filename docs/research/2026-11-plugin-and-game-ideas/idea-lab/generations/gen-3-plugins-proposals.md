# 第 3 代插件提案（生成者）

- 日期：2026-11-25。依据：`GOAL.md`、`RUBRIC.md`、`PROCESS.md`、`CONTEXT.md`、`EVIDENCE.md`（E1–E110）、`pool/plugins.md`、`generations/gen-2-plugins-proposals.md`、`generations/gen-2-plugins-review.md`、`generations/gen-2-games-review.md`（第 5 节 能力缺口）。
- 核对的代码：`ohmygame`（dev，d6eac678，beta.5.11）`docs/` 与 `src/`、`packages/server/src/game-data-routes.ts`；`ohmygame-plugins`（main，6189ce6）`plugins/` 下 36 个插件；`origin/feat/game-tests`（768b9c5）的 `README.md`、`skills/game-tests/SKILL.md`、`.ohmygame-plugin/plugin.json`。
- 本代任务是**收敛**：把可以终选的定稿，把修不好的转成实验或 Skill，不为凑数加候选。
- 写法约定：凡是"今天能做"的，都对应到一处代码或文档；"需实测"的单独标出。

---

## 0. 本代结论速览

| 新 ID | 名称 | 来源 | 形态 | 本代结论 |
|---|---|---|---|---|
| P3-01 | 必发阶梯（ship-ladder） | P2-01 | 独立插件 | **定稿**：按评审三处小修；MVP 再砍 |
| P3-02 | 发布前检查（launch-check） | P2-02 + P2-09 | 独立插件 | **定稿**：MVP 只有构建扫描 + 局域网扫码真机；运行时检查生成 Game Tests 用例；P2-09 降为第三期"英文门槛"模块 |
| P3-03 | 真人试玩回路（playtest-loop） | P2-03 | 独立插件 | **修正**：评审建议的"访客 + 排行榜计数"在代码里走不通（访客成绩不公开，见 F1）；改为"现场局域网收集 + 作者自备端点"，H1 是长期正路 |
| P3-04 | 种子批量验证台（seed-lab） | P2-06（重定位）+ P1-02 | 独立插件 | **重定位**：改做游戏线最需要的"无头批量模拟 + 可解性/难度看板"；变体比较降为第二期，并解决 tuning.json 的三个问题 |
| P3-05 | 小游戏激励视频与提审（Skill 扩展） | P2-07 | 现有插件 wechat-minigame、douyin-minigame 的 Skill 扩展 | **改形态**：H9 没有答复，不单独做插件 |
| P3-06 | 同类游戏检索（Skill） | 新 | game-studio、web-game-studio 的 Skill | **新**：游戏线两代都依赖人工查重、两代都漏检 |
| E3-1 | 交付质量门基准 | P2-04 | **实验提案**，不是插件 | 基准跑出来之前插件不成立；给出修好的实验设计和停止规则 |
| — | 玩法片段工作室 | P2-05 | 降为 Skill | 录屏事实已更正（竖屏 720×1280）；Agent 今天就能用 `game_use` 录，插件增量太薄 |

**数量的诚实说明**：独立插件 4 个（P3-01 到 P3-04），现有插件的 Skill 扩展 2 个（P3-05、P3-06）。如果终选只数独立插件，本代达不到 GOAL 的 6 个；我不再为了凑数拆分或新增插件（GOAL"不做"第 3 条）。是否把"对现有插件的扩展"算进终选，请协调者决定。

---

## 1. 本代代码核对的新事实（G3-F 编号）

| # | 事实 | 出处 | 影响 |
|---|---|---|---|
| F1 | **访客的排行榜成绩不公开**：`public: identity.kind === "account"`，注释"Only signed-in players appear on a public board; a guest's score is theirs to see"。作者读榜 `GET …/leaderboards/:board` 只返回公开条目。另外，游戏在网站页的 iframe 里调用 `signIn()` 会以 `cancelled` 失败（登录页拒绝被嵌入） | `packages/server/src/game-data-routes.ts:183-188`；`docs/cloud-saves.md:76-82`；`docs/game-sign-in.md:130-134` | 评审给 P2-03 的"访客 + 每阶段一个排行榜计数"方案，对外部试玩者计不到数（他们几乎都是访客）。P3-03 不用这条路 |
| F2 | **Tune 草稿优先于文件**：`gameTuningValue` 先取 `draft`，再取文件值；文件重读时，只有文件值等于草稿值时草稿才被丢掉。数值项只有数字和布尔两种；文件里其他字段保存时保留 | `src/shared/game-tuning.ts:9-11,29-31`；`src/daemon/game-tuning.ts` `#apply`；`docs/preview-runtime.md:292-319`；`web-game-studio/skills/game-tuning/SKILL.md` | 回答了评审对 P2-06 的第 2 个问题：人拖过的值，插件写文件改不动。P3-04 第二期的变体切换据此重新设计 |
| F3 | **项目的插件宿主空闲 5 分钟就停**（`idleMs: 5 * 60_000`），能挡住停机的只有进行中的调用和宿主内部的 `hold()`（例如开着的游戏会话）；`hold()` 没有开放给插件 | `src/daemon/extension-hosts.ts:193,249,910-920` | 插件起的局域网服务器（P3-02、P3-03）必须放在一个长时间运行的原生命令里（`timeoutSeconds` 最长 3600），否则 5 分钟后被停。提为宿主改动 H11 |
| F4 | `build: "web"` 给的 `build.folder`"removed once the call ends" | `docs/plugins.md:317-322` | 局域网托管要先把构建复制到插件数据目录 |
| F5 | **Game Tests 不把运行结果写成文件**："A run lives in the project's plugin host … the latest run goes when the host stops"。但 `game_test` 是暴露给 Agent 的插件工具，`tool.afterCall` 能看到它的文字结果（最多 8,000 字符） | Game Tests `README.md` Limits 一节；`docs/plugins.md` Hooks 一节 | 评审要求 P2-01"读 Game Tests 结果"，只能通过 `tool.afterCall` 读 Agent 发起的那次运行；人在面板里点的运行读不到 |
| F6 | Game Tests 还跑项目自己的 `package.json` `test` 脚本，其 skill 写明"Rules that need no screen … belong in the project's own unit tests" | Game Tests `README.md`；`skills/game-tests/SKILL.md` | P3-04 和单元测试有交界：通过/失败已有，分布、分桶、看板没有 |
| F7 | 网页游戏窗口每个项目最多 4 个；一次 `act` 最多 20 个动作；桥只有 `reset`、`setSeed(n)`、`step(ms)` 三种方法，没有"调用游戏内任意函数" | Game Tests `README.md`；`src/daemon/playtest-tools.ts:117`；`src/shared/playtest.ts:92-93` | 经真实游戏窗口跑上万个种子太慢。P3-04 的主路径在 Node 里跑纯逻辑模块，真实窗口只做抽样一致性核对 |
| F8 | web-game-studio 默认 Phaser/Three + TypeScript + **Vite**；插件宿主是 Electron 43 的 Node（`ELECTRON_RUN_AS_NODE`），有 `worker_threads` | `web-game-studio/skills/web-game-studio/SKILL.md:54`；`src/daemon/extension-hosts.ts:292-295`；`package.json` electron 43.8.8 | 大多数项目的 `node_modules` 里已有 esbuild（Vite 的依赖），P3-04 可以直接用它打包纯逻辑模块 |
| F9 | 录像长边最多 1280、30 fps、4 Mbps；插件录屏最长 60 秒，进 Library | `docs/preview-runtime.md:275-283`；`docs/plugins.md:486` | 竖屏片段是 720×1280，横屏 1280×720（评审指出的事实，本代采纳） |
| F10 | wechat-minigame、douyin-minigame 的 `contributes` 只有 `skills`，`appliesTo: ["general"]`；skill 里没有广告、分享、录屏、提审；cocos-creator 多一个 `commands` | 三个插件的 `.ohmygame-plugin/plugin.json`；`wechat-minigame/skills/wechat-minigame/SKILL.md:12-24` | 广告接入做成这两个插件的新 skill 文件夹即可，不需要新插件 |
| F11 | game-studio、web-game-studio、CCGS 78 个 skill 里**没有**任何原创性或同类游戏检索的步骤（grep `competitor|comparable|similar games|market research|originality` 无相关命中）；宿主有网页搜索（Exa/Parallel/自定义 MCP） | 三处 `skills/`；`docs/runtime.md` Web search 一节 | P3-06 不和已有能力重复，且有现成搜索工具可用 |
| F12 | 局域网用 `http://192.168.x.x` 打开不是安全上下文（localhost 例外不适用）：依赖 secure context 的 Web API 在真机上会不可用 | Web 平台规则（非 OhMyGame 代码） | P3-02 的真机测试要在报告里标"本次是非安全上下文"，否则会误报 |
| F13 | 社区页的游戏 iframe `sandbox` 含 `allow-scripts allow-same-origin allow-forms`；Cloud 播放服务器对游戏发外部请求的 CSP 在本仓库里查不到 | `src/renderer/games.tsx:331`；Cloud 在 `ohmygame-cloud`，不在本次核对范围 | P3-03 的"作者自备端点"在社区发布版里能否 POST 出去，**需实测** |
| F14 | 智能体可在项目里自己写 `project/<name>` 插件（`.ohmygame/plugins/`） | `src/daemon/agent-prompts.ts:18` | 一些"小改动"用户可以让 Agent 自己做，进一步说明 P2-05 这类薄插件没有必要 |

评审在第 2 代已经确认的事实（插件会话能调 `setSeed/step/reset`、插件 `actTogether` 已实现、Game Tests 支持 `viewports/path/seed`、社区网站评论只读）本代复核无变化，不再重复。

---

## 2. 本代新证据（N 编号接第 2 代，未写入 EVIDENCE.md）

| ID | 结论 | 关键数字 | 强度 | 来源 |
|---|---|---|---|---|
| N8 | 软著鉴别材料有固定格式，已有开源生成工具 | 《计算机软件著作权登记办法》：程序和文档各交前、后连续 30 页，不足 60 页全交；程序每页不少于 50 行，文档每页不少于 30 行；另有三种例外交存方式。经验文章称受理后一般 60 日内审查完成、实际 2–3 个月下证（未核实）。Gitee 上已有开源的软著材料生成项目 | 强（法规文本，经转载，以版权保护中心现行要求为准）/弱（时长） | https://icdc.chinacdc.cn/yxzh/zcfg/tl/zscqbh/202404/P020240424556965348484.pdf ; https://gitee.com/pp9code/Software-Copyright-application ; https://post.smzdm.com/p/ax655m0w/ |
| N9 | 本项目的游戏线：人工原创性检索两代都漏检 | 第 1 代 14 个游戏候选中 6 个和已有游戏高度相似，生成者没查（`pool/games.md:24`）；第 2 代生成者按要求做了人工检索，评审仍在 10 个候选里找到 6 款漏掉的近邻（Kaiten、Lawnpocalypse、Tower Together、Hidden Through Time、古董局中局，另有疯狂停车模拟器，`gen-2-games-review.md` 0.2 节、第 5 节第 10 行） | 弱（本项目内部样本，n=24，但是直接观察） | `pool/games.md`；`generations/gen-2-games-review.md` |

N8 只用于 P3-05 第三期；N9 只用于 P3-06。

---

## 3. 候选

### P3-01 必发阶梯（ship-ladder）· 谱系：P1-14 → P2-01 → P3-01

**用户与场景**
- 在 OhMyGame 开新项目的人：Jam 参赛者、第一次做游戏的人、做了几个月还没发出去的人。
- Agent 让"再加一个功能"几乎零成本，范围越加越大，项目停在 80%。

**证据**
- E12（强，论文）：planning、scope、feature creep、cutting features、delays 合计约占复盘问题的 20%。
- E13（强）：Underestimation 34 次，Unclear game design vision 28 次。E14（强）：小团队 50% 列出 obstacles；"Feature creep ruled our roost"。
- E16、E17（中，计算值，视为上限）：大型 jam 只有约 10–30% 的报名者提交；LD 约一半草稿没发布。E89（中）：聚光灯 GameJam 完赛约 50–60%。
- N1（中，和 E69 同一份问卷）：开放题里"时间、动力、做完"被提到最多（约 21%）。
- **证据空白**：没有任何证据说明工具能提高完成率；E15、N1 说主要障碍是时间和动力，工具管不了。所以验证计划写成可证伪的实验。

**已核对的已有能力与增量**
- game-studio `SKILL.md:26`、web-game-studio `SKILL.md:28`：开局定"first playable scope"，之后"revise or continue **without adding an approval checkpoint**"。本插件不能和它对着干。
- `src/daemon/agent-prompts.ts:19`：每个回合末尾总结改动、检查和没验证的部分。只总结单个回合，不对照范围。
- CCGS 的 `scope-check`、`cut`、`sprint-plan`、`milestone-review`：只对 CCGS 模板加 Claude Code 生效，要手动调用。
- `home.starters` 只显示提示词命令，作用是填输入框（`docs/plugins.md` In the app 表格），不能开面板；且只出现在新项目默认启用的插件里。
- Game Tests 不落盘结果（F5）；`build.completed(purpose=publish)` 成功只代表打包成功（第 2 代评审 F6 备注）。
- **增量**：
  1. 一份所有 Agent 都读的 `design/ship.json`（发布日、平台、核心玩法、不做清单）；
  2. 能自动打勾的阶梯；
  3. Jam 倒计时和保底版本。

**MVP**（评审要求再砍后的版本）
1. **开局**：
   - `home.starters` 一个提示词命令"带发布日开新游戏"，填入一段让 Agent 先写 `design/ship.json` 的提示（发布日、目标平台、一句话核心玩法、不做清单），再开始做。
   - 进了项目之后，面板里能结构化地改这份文件。
2. **不做清单（不打断）**：静态 instructions 要求 Agent 读 `design/ship.json`。用户要做清单上的东西时**照做**，只在回合末尾总结里点名"这一项在不做清单上"。和 game-studio"不加审批点"的设计一致。
3. **阶梯前三级**，每级都写清判定来源：
   - 可启动：`tool.afterCall` 看到 `game_test` 全部通过 → 打勾；否则用户点"检查"，插件自开一个 `game` 会话：无控制台错误、截图不是空白。
   - 核心循环：`ship.json` 里可写一个 `coreProbe`（几步输入 + 一个 `snapshot` 路径应变化），有就机检；没有就人工勾选。
   - 有失败和重开：同上。
   - "可分享""可上架"两级放第二期（前者有误判，后者依赖 P3-02 报告）。
4. **Jam 模式**：
   - `project.toolbar` 倒计时；
   - 截止前 24 小时一个 `danger` toast，附命令"出保底版本"（`insert` 一段提示词：冻结功能、修阻断问题、导出）。
5. **本地记录**：每级第一次达成的时间写进插件数据目录，不联网。这是验证计划要用的数据。
- **移出 MVP**：每日偏离摘要、"以后再说"清单（评审：最容易招人烦，会污染判负条件）。

**扩展点与宿主改动**
- 今天能做（2.37）：`home.starters`、`project.toolbar`、面板（`projectFiles: ["design/ship.json"]`）、`instructions`、`tool.afterCall`、`build.completed`、`capabilities.game`、`capabilities.composer`、命令 `insert`。
- 宿主改动：MVP 不需要。
  - H8（可选）：只读的发布记录接口，用来做"可分享"一级。
  - `project.opened` 钩子（可选）：只在第二期做每日摘要时需要。
- 对 Game Tests 插件的建议（不是宿主改动）：把最近一次运行的摘要写到项目文件里，其他插件就能读到人在面板里点的运行。

**第一个 PR 范围**
- 新目录 `plugins/ship-ladder/`：
  - `.ohmygame-plugin/plugin.json`：`id: ohmygame/ship-ladder`，`appliesTo: ["web-game","general"]`，`capabilities: { native, game, composer, "project.files": "write" }`，`projectFiles: ["design/ship.json"]`。
  - `contributes`：
    - `instructions`（读 ship.json、不做清单只点名不拦）；
    - `hooks: ["tool.afterCall"]`；
    - `commands`：`starter`（`home.starters`，提示词）、`open`（`project.toolbar`，`openPanel`）、`check`（原生，`changesFiles: false`）、`jam.fallback`（`insert`）；
    - `panels: [ladder]`（`opens: "onRequest"`）。
  - `src/index.ts`（注册钩子和命令）、`src/ladder.ts`（纯函数：事件 → 各级状态）、`schemas/ship.json`、`panel/`、`locales/{en,zh-CN}.json`、`README.md`、`assets/icon.svg`。
- 测试 `test/ship-ladder/`：
  - `ladder.test.ts`：给定 `game_test` 结果文本、探针快照、人工勾选，算出各级状态；
  - `plugin.test.ts`：manifest 只声明用到的钩子和能力；instructions 里不出现"先问用户"之类的审批语句；
  - `panel-page.test.ts`（happy-dom，照 Game Tests 的写法）：编辑 ship.json 后文件格式正确。
- 不在第一个 PR：Jam 倒计时以外的提醒、第四和第五级、每日摘要。

**验证计划与成功指标（2–4 周）**
- 第 1–2 周，**判定准确性**：在 20 个现有项目（官方示例和内部项目）上跑前三级，人工标注真值。
  - 指标：自动判定和人工一致 ≥90%，"假通过" ≤5%。达不到就先修判定，不进入第二步。
- 第 2–4 周，**行为效果（方向性）**：办一场 7 天的小 Jam（社区或内部），报名者随机分成开插件和不开插件两组，每组目标 ≥20 人。
  - 主指标：截止时发布成功的比例。
  - 次指标：用户关掉插件或删掉 ship.json 的比例；回合末尾"不做清单点名"之后，用户把这项删掉或推迟的次数。
  - 成功：开插件组提交率高 ≥15 个百分点，且关掉插件的人 <30%。
  - **判负**：差异 <5 个百分点，或关掉的人 ≥50% → 降为一个 skill（ship.json 模板 + instructions），不做插件。
  - 局限：样本小，只能看方向；8 周的"首发天数中位数"对比保留为后续指标。

**风险与最弱点**
- **最弱点仍是效果没有证据**，时间和动力问题工具解决不了。
- 机检只覆盖"能启动、有循环"，管不了"好不好玩"。
- Jam 随机分组可能招不满人；招不满就只报告判定准确性那一半。

---

### P3-02 发布前检查（launch-check）· 谱系：P1-04 + P1-05 + P1-11 → P2-02（+ P2-09）→ P3-02

**用户与场景**
- OhMyGame 的网页游戏（`web-game`，以及有网页预览的 `general` 项目），准备从社区再往外发：itch、自己的网站、手机分享，少数人上门户。
- 桌面预览里一切正常，到手机上才发现：首包太大、按钮在屏幕外、iPhone 没声音、外部字体被拦。

**证据**
- E53（强，官方 + 定量）：每多 1 MB 流失几个百分点；Cannon Clash 2.4 MB、进入游戏转化 81%。
- E56（强）：CrazyGames 初始下载 ≤50 MB、手机首页 ≤20 MB、≤1,500 个文件、只用相对路径、iOS 要在 touchend 里 resume AudioContext。E62（强）：Playables 初始包 <30 MiB、单文件 <30 MiB、≤8,000 个文件。
- E54（强）、E68（强，MDN）：竖屏、刘海、Safari 清存储、自动播放限制。E67（弱）：iOS Safari 内存和 WebGL 崩溃。
- E27（强）：aspect-ratio 是问答站平均浏览最高的标签。E66（弱，单案例）：AI 写的游戏上门户前补了六处，其中三处是绝对路径、外部字体、无用素材。
- N1（中）：网页开发者 66–67% 发 itch 类、约 38% 发自己网站。**反证**：Poki 自填只有 0.7%，CrazyGames 不在选项里。门户部分的受众比例未知，所以门户放第三期。

**已核对的已有能力与增量**
- 发布对话框：总大小、文件数、最大文件和顶层文件夹，对照 100 MiB；只对社区一家、不构建、只看总量（`docs/runtime.md:1243-1250`）。
- 预览设备只改视口、不模拟 WebKit（`docs/plugins.md` Preview devices）。本插件不贡献预览设备。
- Game Tests 能按 `viewports`、`path`、`seed` 跑，自带"不空白、无控制台错误、无失败请求"检查。本插件**不自建运行器**，移动端运行时检查写成 Game Tests 用例。
- 两个仓库 grep `crazygames|poki|gamedistribution|yandex|playables`：插件零结果（第 2 代已核实，本代复核无变化）。
- 宿主没有局域网静态服务；多人后端只监听回环（`docs/multiplayer.md:110`）。
- **增量**（MVP 只做前两项）：
  1. 按平台的首包预算，首包和懒加载分开；
  2. 局域网扫码真机测试（唯一能测真 iOS Safari 的办法）；
  3. 一键优化；
  4. 移动端规则（静态扫描 + Game Tests 用例模板）；
  5. 门户链路和英文门槛。

**MVP**
1. **构建扫描**（`project.publish` 菜单和面板按钮）：
   - 原生命令拿 `build: "web"` 的构建，解析入口 HTML、JS import 图（es-module-lexer）和预加载清单，分出首包和懒加载。
   - 列出：最大文件、未被引用的素材、外部请求（字体、CDN）、绝对路径、文件数。
   - 对照内置的平台配置：社区（100 MiB）、itch（只给建议）、CrazyGames（50/20 MB、1,500 个文件）、Playables（30 MiB、单文件 30 MiB、8,000 个文件）、Poki（5 MB 和 8 MB 两种说法都列出，标冲突，E53）。每个数字带来源链接和核对日期。
   - 报告写到 `.ohmygame/launch/report.json`（给 P3-01 第二期读）和面板。
2. **局域网扫码真机测试**：
   - 长时间运行的原生命令 `lan.start`（`timeoutSeconds: 3600`，用来挡住宿主空闲停机，F3）：把构建复制到插件数据目录（F4），在 `0.0.0.0` 的随机端口托管；`progress` 发出地址；面板画二维码；"停止"即取消这次调用。
   - 只在托管的副本里注入诊断浮层，不改项目文件：报错、FPS、首帧时间、`performance.memory`（拿得到时）、AudioContext 状态、视口和安全区尺寸，经 WebSocket 回传面板。
   - 报告标注"非安全上下文"（F12）；有手动输入地址的兜底；联机游戏不在范围内（H6）。
- **第二期**：
  - 一键优化（图片转 WebP、gltf-transform 压缩 GLB、删除未引用素材、外部字体本地化），每项走插件写入，可撤销；音频转码等 H4。
  - 移动端规则：静态扫描（AudioContext resume、localStorage try/catch、`visibilitychange` 暂停、DPR 上限、`user-select`、WebGL context lost），加上生成 `tests/game/launch-mobile.json` 这类 Game Tests 用例模板（`viewports: ["390x844","844x390"]`，`notBlank`；游戏在 snapshot 里报告 `ui.offscreen` 时加 `state` 检查）。
- **第三期**（触发条件：面板里选 CrazyGames/Playables 配置的项目数达到阈值，例如 30 个）：
  - CrazyGames 链路：`launch-sdk` 模块、模拟广告层、广告规则的 Game Tests 用例、提交包。
  - **英文门槛模块（原 P2-09）**：只在选了 CrazyGames 或 Steam 配置时出现。字符串抽取 + `t()` 运行时 + 伪本地化 + 生成"语言 × 视口"的 Game Tests 用例（`path: "?lang=xx-pseudo"`）。翻译交给 Agent。静态部分在 CCGS 项目里让给 `localize`。
  - 来源与授权账本（给 Steam AI 披露或门户提交用）。

**扩展点与宿主改动**
- 今天能做：原生命令（`build: "web"`、`timeoutSeconds`、`changesFiles: false`）、`project.publish` 和 `game.more` 命令位、面板、`capabilities.composer`（"把这个问题交给 Agent"用 `composer.fill`）。
- 宿主改动：MVP 不需要。
  - **H11**：给插件一个保活接口（宿主已有内部 `hold()`），局域网服务器就不必占着一个 3600 秒的命令。
  - H4（第二期音频）、H5（第三期，用了 SDK 云能力的游戏上门户）、H6（联机真机测试）。

**第一个 PR 范围**
- 新目录 `plugins/launch-check/`：
  - manifest：`id: ohmygame/launch-check`，`appliesTo: ["web-game","general"]`，`capabilities: { native, composer, "project.files": "read" }`。
  - `contributes`：
    - `commands`：`scan`（原生，`build: "web"`，`changesFiles: false`，槽位 `project.publish`）、`lan.start`（原生，`build: "web"`，`timeoutSeconds: 3600`，`changesFiles: false`，槽位 `game.more` 和 `project.publish`）、`open`（`openPanel`）；
    - `panels: [launch]`（`opens: "onRequest"`）。
  - `src/scan/`（入口解析、import 图、预算比对）、`src/profiles.json`（每个数字带 `source` 和 `checkedAt`）、`src/lan/server.ts`、`overlay/overlay.js`、`panel/`（二维码库随包）、`locales/`、`README.md`。
- 测试 `test/launch-check/`：
  - `scan.test.ts`：几个夹具构建（Vite 风格、有懒加载块、含绝对路径、含 Google Fonts 链接、含未引用素材），断言首包和懒加载的划分和各项发现；
  - `profiles.test.ts`：每个预算数字都有 `source` 和 `checkedAt`；
  - `lan.test.ts`：服务器能托管、只在副本里注入浮层、取消信号到来时关闭端口。
- 不在第一个 PR：一键优化、静态规则、Game Tests 模板、门户。

**验证计划与成功指标（2–4 周）**
- **扫描**：对 30 个 OhMyGame 网页游戏（官方示例、内部项目、愿意参加的用户项目）跑扫描，人工复核每条发现。
  - 指标：至少有一条真实问题的项目比例（预期 >30%）；误报率 ≤10%；单次扫描耗时 <30 秒（不含构建）。
- **真机**：10 位用户，每人用自己的 iPhone 和安卓机各测一次。
  - 指标：连接成功率 ≥80%（防火墙、访客 Wi-Fi 会失败）；至少 30% 的会话发现桌面预览没发现的问题（音频没响、按钮越界、帧率低于 30）。
- **第三期的信号**：记录选了门户配置的项目数，决定是否立项门户链路。
- 判负：误报 >25%，或真机会话几乎都没有新发现 → 第二期不做，只保留扫描。

**风险与最弱点**
- **最弱点**：门户部分的受众未知（N1 弱反证），所以放到第三期，靠使用信号决定。
- 局域网连不上（公司网、访客网络隔离）。
- 静态扫描对动态加载（字符串拼路径）会漏，报告里标出"无法静态判定"的部分。

---

### P3-03 真人试玩回路（playtest-loop）· 谱系：P1-03 → P2-03 → P3-03

**用户与场景**
- 游戏已经能玩、想知道陌生人玩起来怎样的个人开发者。
- 现在的做法：发链接给亲友，收到几句"挺好玩"；不知道多少人加载完就走、卡在哪里。还有不少人根本找不到外人来玩。

**证据**
- E21（强，论文，n=13 定性）：招募、记录、分析、处理反馈都难；翻"2–3 days' worth of Discord messages"很耗时。E22（强，n=10）：受测试者数量和代表性限制。
- E24（中，定量）：GMTK 2024 作品评分中位数 14；LD58 约 19% 的作品不足 5 个评分。
- E26（强，官方）：Poki 上传后几分钟内给 10–20 段真人录像，只对 Poki 流程内的游戏开放。
- N1（中）：60% 靠亲友试玩，约 17% 找不到人试玩，招募工具 1.1%，21% 做完才第一次给外人玩。**反证**：开放题里主动提试玩的只有 0.3–1.4%。
- E13（强）：论文作者建议多试玩。

**已核对的已有能力与增量**
- 社区：浏览数（"do not establish that the game finished loading or a human played it"，`docs/runtime.md:1391-1392`）、点赞、评论（写评论要账号，网站上只读，`docs/runtime.md:1332-1340`）。
- **SDK 访客 + 排行榜计数不可用**（F1）：访客成绩不公开，作者只能读到登录用户的成绩；网站 iframe 里登录会失败。外部试玩者几乎都是访客，所以计数接近 0。评审提的临时方案本代**放弃**，理由写在这里供评审复核。
- 游戏 SDK 没有埋点模块；web-game-studio `game-playtest`、game-studio `game-qa` 是 AI 在玩；CCGS `playtest-report` 只整理人写的笔记。
- **增量**：真人会话的漏斗、退出点、无偏问卷、反馈聚类，接到 Agent 修复。

**数据回收方案（本代的核心修正）**

| 路径 | 适用 | 今天能做吗 | 说明 |
|---|---|---|---|
| A. 现场局域网收集 | 亲友、同事当面试玩（N1：60% 的试玩来源） | 能 | 复用 P3-02 的局域网托管做法：长时间命令里起服务器，探针把事件发回本机，零后端、数据不出本机 |
| B. 作者自备收集端点 | 远程试玩者（Discord、社交平台） | 能，但有配置成本 | 插件设置里填一个 HTTPS 地址和一个只读令牌（密钥）。附两份模板：Google Apps Script（追加到表格，`doGet` 返回 JSON）、Cloudflare Worker + KV。探针用 `navigator.sendBeacon` 发 `text/plain`，避开 CORS 预检；插件原生代码按令牌拉回数据。**需实测**社区发布页能否向外部地址发请求（F13） |
| C. 宿主 H1 | 所有人 | 需宿主 | Cloud 的试玩事件收集接口（同意文案、保留期、只有作者能读），加上网站游戏页能写反馈。这是长期正路，B 只是过渡 |
| ✗ 社区评论贴码 | — | 不能 | 写评论要账号，网站只读 |
| ✗ 访客 + 排行榜计数 | — | 不能 | 访客成绩不公开（F1） |

**MVP**
1. **试玩探针**：
   - 插件带一个约 3 KB 的 `probe.js`，Agent 按 skill 把它接进游戏：首屏同意提示（不同意只记匿名漏斗）；记录加载进度、首次输入、`track(name)` 事件、报错、退出位置（`pagehide` 加 `sendBeacon`）、时长。
   - 探针只在 `public/playtest.json` 存在时启用，文件里写收集地址和轮次号。一轮结束就删掉这个文件再发布，正式版不带探针的配置。
   - 匿名随机会话号，不收集任何个人信息；skill 给出写给试玩者的隐私说明。
2. **结束问卷**：2–3 个按 E21 原则写的问题（"你最后在做什么？""哪一刻想退出？"），不问"好不好玩"。
3. **两种回收**：路径 A（命令"开始现场试玩"）和路径 B（命令"拉取本轮数据"）。
4. **面板**：
   - 漏斗、退出点和死亡点、报错，每项标样本量；
   - 粘贴进来的 Discord、飞书消息，用 `capabilities.models` 聚成"问题 → 提到人数 → 代表原话"；
   - 每个问题一键用 `composer.fill` 交给 Agent。
5. **招募**：只留一个按钮"生成招募帖"（按目标人群写清测什么、玩多久、怎么反馈）。标记约定和互评交换放第二期（依赖 H2）。

**扩展点与宿主改动**
- 今天能做：skill（接探针）、原生命令（局域网收集、拉取端点数据）、插件设置和密钥（`collectorUrl`、`readToken`）、面板、`capabilities.models`、`capabilities.composer`、`projectFiles: ["public/playtest.json"]`。
- 宿主改动：
  - **H1（关键）**：试玩事件收集接口，同时让网站游戏页能写反馈，必要时允许访客的漏斗计数对作者可见（F1 的根因）。
  - H11：插件保活（局域网收集）。
  - H2（可选）：社区"求试玩"标记和互评队列。

**第一个 PR 范围**
- 新目录 `plugins/playtest-loop/`：
  - manifest：`id: ohmygame/playtest-loop`，`appliesTo: ["web-game","general"]`，`capabilities: { native, models, composer, "project.files": "write" }`，`projectFiles: ["public/playtest.json"]`，`configuration`：`collectorUrl`（字符串）、`readToken`（密钥）。
  - `contributes`：
    - `skills`（`playtest-probe`：怎么接探针和 `track()`）；
    - `commands`：`round.start`（写 `public/playtest.json`）、`round.lan`（原生，`timeoutSeconds: 3600`）、`round.fetch`（原生）、`round.end`（删除配置文件）、`recruit`（`insert` 招募帖提示词）；
    - `panels: [playtest]`。
  - `assets/probe.js`、`templates/apps-script.gs`、`templates/worker.js`、`src/aggregate.ts`（事件 → 漏斗）、`src/lan.ts`、`panel/`、`locales/`、`README.md`（数据控制者是作者本人的说明）。
- 测试 `test/playtest-loop/`：
  - `probe.test.ts`（happy-dom）：不同意时只发匿名漏斗；载荷不含个人信息字段；单条不超过 `sendBeacon` 的大小限制；
  - `aggregate.test.ts`：事件序列 → 漏斗和退出点；
  - `lan.test.ts`：收集服务器接收事件，取消时关闭。
- 不在第一个 PR：反馈聚类之外的模型功能、互评、视频片段、A/B。

**验证计划与成功指标（2–4 周）**
- 招 8–10 位创作者，每人跑一轮试玩（现场或远程任选）。
- 指标：
  1. 每轮收回的有效会话数，目标中位数 ≥10（对照 N1：21% 的人做完才第一次给外人玩）；
  2. 路径 B 的配置成功率和耗时，目标 15 分钟内配好的人 ≥50%；
  3. 来自报告、被 Agent 修掉的问题数；
  4. 社区发布版能否成功外发（F13 的实测结果）。
- 判定：
  - 现场路径会话够、远程路径配置失败率 >50% → 插件保留现场路径，并把这组数据作为 H1 优先级的证据交给维护者；
  - 两条路径会话中位数都 <5 → 暂停，等 H1。

**风险与最弱点**
- **最弱点：远程回收要作者自己配端点**，门槛高；而且社区发布页能否外发还没实测（F13）。
- 开发者很少主动提试玩（N1 反证），可能"知道该做但不做"。
- 隐私合规：作者是数据控制者，插件只能提供最小化的默认值和说明文字。

---

### P3-04 种子批量验证台（seed-lab）· 谱系：P1-02 → P2-06（变体擂台）→ P3-04（重定位）

**为什么重定位**
- 第 2 代的 P2-06 主打"人在 Play 窗口里盲玩比较变体"，评审指出：自己做的变体自己玩很难真盲；写 `tuning.json` 有三个问题；宿主给 Tune 加预设就会吃掉大半增量。
- 游戏线评审把"**无头批量模拟和难度/可解性看板**"列为本代需求最集中的缺口（G2-01、G2-09 是核心，G2-02、G2-08 也需要）。
- 两者共用一套底座：按种子（和参数）批量跑、统计分布、按变体对比。所以把主轴换成"批量验证"，"变体比较"变成看板的一个维度，人盲玩放第二期。

**用户与场景**
- 做程序生成关卡和规则驱动游戏的人：出口类、排序类、画线类、消除类益智，回合规则游戏，放置经济。
- Agent 改完生成器说"关卡都能过"，但没人知道 1 万个种子里有多少是死局、难度怎么分布、哪些种子该当第 1 关、哪些该扔掉。

**证据**
- E79（中）：IAA 收入 Top100 中 80% 以上是休闲益智；消除类在投超 6000 款。游戏线 N11（评审核实）：畅玩榜头部是出口类和三消槽类，"消除、打螺丝、水排序依然是 IAA 主流玩法"。这些品类都靠程序生成大量关卡，可解性和难度曲线是生产的基本环节。
- E27（强，论文）：balance 是问答站平均浏览最高、得分最高的标签之一。
- E36（弱，厂商）：47% 用 AI 做试玩与平衡，38% 用 agent 做动态平衡。
- E41（弱，轶事）：截图式测试测不准实时游戏；有开发者改用无头蒙特卡洛模拟（"millions of simulated games headless"）；Agent 常误报"works perfectly"。
- E13（强）：Game design complexity 23 次、Lack of fun 27 次。
- **证据空白**：没有"死局或难度曲线差导致流失"的定量数据；游戏线 4 个候选的需求是本项目内部需求，不是外部证据。

**已核对的已有能力与增量**
- 测试桥：插件会话能用 `setSeed`、`reset`、`step` 和 `snapshot`（`src/daemon/plugin-game-bridge.ts`，`checkedActions`；`src/shared/playtest.ts:92-93`）。但每个项目最多 4 个游戏窗口、一次最多 20 个动作（F7），跑上万个种子太慢。
- Game Tests：`seed` 字段跑单个种子；单元测试（`package.json` `test`）能写"1 万个种子全部可解"这种断言，结果只有通过或失败（F6）。
- SDK `simulateRoom`（`docs/multiplayer.md:391-410`，`@ohmygame/game-sdk/testing`）：多人规则的确定性测试底座，没有批量统计。
- CCGS `balance-check`：静态读公式，不跑。Tune：单值实时调，无预设、无统计。
- **增量**：
  1. 在 Node 里批量跑上万个种子，出分布（可解率、难度直方图、死路分支数、最少步数、异常种子）；
  2. 看板和按难度分桶的关卡曲线文件；
  3. **一致性核对**：抽样种子经真实游戏窗口跑一遍，确认纯逻辑模块和游戏里的实际逻辑一致；
  4. 按参数组（变体）对比分布。

**"模拟约定"（skill 教给 Agent）**
- 项目里有一个不依赖 DOM 的纯模块 `sim/index.ts`，导出：
  - `generate(seed, params)` → 关卡；
  - `evaluate(level, params)` → `{ solvable, metrics: { minMoves, deadEnds, … } }`；
  - 或者对规则和经济类游戏，`play(seed, policy, params)` → 指标。
- 游戏本身 import 同一个模块，所以两边逻辑一致；测试桥 `snapshot()` 返回 `levelHash`，供一致性核对。

**MVP**
1. **skill `seed-lab`**：模拟约定、怎么把生成器和求解器从渲染里拆出来、`levelHash` 的写法；instructions 写"改了生成器之后先跑 `seedlab_run`，不要在没跑的情况下声称关卡都可解"。
2. **批量运行**（Agent 工具 `seedlab_run` + 面板按钮）：
   - 用项目自己的 esbuild（F8）把 `sim/index.ts` 打成单文件；找不到时按需下载 esbuild-wasm；
   - `worker_threads` 池（核数 −1）跑指定种子范围，每个种子有超时；
   - 结果写 `seedlab/runs/<id>.jsonl` 和一份摘要；工具把摘要以文字返回给 Agent。
3. **看板面板**：可解率、各指标直方图、按难度分桶、异常种子列表（超时、不可解、指标极端）。
   - 点一个种子："看一眼"用插件会话 `act([setSeed, reset])` 后 `capture`，截图显示在面板里（插件不能操作人的 Play 窗口）。
4. **一致性核对**：抽 20 个种子经真实游戏窗口跑，比较 `snapshot().levelHash` 和 Node 结果，不一致就标红。这一步专门防"模拟说可解，游戏里不是一回事"（E41）。
5. **导出关卡曲线**：按难度分桶挑种子，写 `levels/curve.json`（插件写入，可撤销），游戏读它排关卡。
- **第二期**：
  - **变体比较**：参数组放在 `seedlab/variants.json`，同一批种子按变体跑，并排看分布；
  - **人盲玩切换（解决 tuning.json 的三个问题）**：
    1. 变体预设不进 `tuning.json`，放在 `seedlab/variants.json`；`tuning.json` 里只加一个数值项 `variant`（0 到 N−1，步长 1），游戏的 `set("variant", i)` 切换整组参数。发布时带出去的只是选定那一组的编号，比较结束由插件把它写成选定值（问题 1：变体被发出去）。
    2. 人用 Tune 面板拖 `variant` 切换，产生的是草稿；F2 证实草稿优先于文件，这正是想要的行为，而且插件不再写 `tuning.json` 来切换，所以不存在"草稿和文件谁优先"的冲突（问题 2）。
    3. 切换不写文件，不用等 Agent（问题 3）。AI 测试页只读已保存的值（`docs/preview-runtime.md:313`），所以批量运行通过 `params` 传变体，不走 Tune。
    - 盲玩：面板随机把变体映射为 X/Y，并显示"把 Variant 拖到 2"这样的指令，人打分记在面板里。局限照写：自己做的变体很难真盲。
  - 多人规则游戏的机器人（基于 `simulateRoom`）；放置经济的等待时间曲线。

**扩展点与宿主改动**
- 今天能做：原生代码（esbuild、`worker_threads`）、Agent 工具（`timeoutSeconds` 最长 3600）、`capabilities.game`（`open`、`act` 的 `bridge`、`capture`）、面板、`projectFiles`、skill、instructions。
- 宿主改动：**不需要**。
  - 可选 H12：Tune 支持离散选项（下拉）。第二期的 `variant` 选择器会更好用，但数值滑块已经能用。

**第一个 PR 范围**
- 新目录 `plugins/seed-lab/`：
  - manifest：`id: ohmygame/seed-lab`，`appliesTo: ["web-game","general"]`，`capabilities: { native, game, composer, "project.files": "write" }`，`projectFiles: ["seedlab/**", "levels/curve.json"]`。
  - `contributes`：
    - `skills`（`seed-lab`）、`instructions`；
    - `tools: [seedlab_run]`（`timeoutSeconds: 1800`）；
    - `commands`：`run`、`parity`、`export`（后者 `changesFiles: true`）、`open`（槽位 `game.more`，`openPanel`）；
    - `panels: [dashboard]`（`opens: "onRequest"`）。
  - `src/index.ts`、`src/bundle.ts`（找项目 esbuild）、`src/pool.ts`、`src/worker.mjs`、`src/stats.ts`（直方图、分桶、异常）、`src/parity.ts`、`panel/`、`locales/`、`README.md`。
- 测试 `test/seed-lab/`：
  - 夹具 `fixtures/arrow-exit/`：一个 5×5 出口类生成器和带记忆化的深度优先求解器（故意让少数种子不可解）；
  - `pool.test.ts`：同样的种子两次运行结果一致；单个种子超时被记为异常，不拖垮整批；
  - `stats.test.ts`：分桶边界、异常判定；
  - `parity.test.ts`：模拟游戏会话返回不同的 `levelHash`，报告标红；
  - `plugin.test.ts`：manifest 和工具输入模式。
- 不在第一个 PR：变体、盲玩、多人机器人、放置经济。

**验证计划与成功指标（2–4 周）**
- **吃自己的狗粮**：游戏线评审要求给 G2-09（落箭）、G2-01（一笔守城）做网页原型，这两个原型就是第一批用户。
  - 性能：7×9 棋盘 1 万个种子，普通笔记本 2 分钟内跑完。
  - 有用性：找出"Agent 声称没问题"的不可解或退化种子的数量（直接检验 E41）；一致性核对抓到的模拟和游戏不一致的次数。
  - 效率：从"改完生成器"到"拿到难度曲线"的耗时，和人工抽查对比。
- **外部**：3–5 位做益智或规则游戏的创作者试用。
  - 采用率：Agent 按约定拆出 `sim/` 模块、不需要大改结构的比例，目标 ≥70%。
- 判负：采用率 <50%，或者用户都只要通过/失败 → 降为 skill（模拟约定 + 单元测试写法，交给 Game Tests 的单元测试面板去跑），不做看板。

**风险与最弱点**
- **最弱点：只适合逻辑能和渲染分开的游戏**。物理和实时动作游戏（如 G2-03）不适用，只能走真实窗口的少量种子。
- 和单元测试有交界（F6）：不要统计的人用单元测试就够了。
- 外部需求证据只有间接的品类数据（E79、N11）和弱证据（E36、E41），"死局导致流失"没有数据。
- 第二期盲玩的意义有限（自己做的变体），评审的意见仍然成立。

---

### P3-05 小游戏激励视频与提审（Skill 扩展）· 谱系：P1-13 → P2-07 → P3-05（改形态）

**形态决定**
- 第 2 代评审给了两条路：H9 有答复就做插件，没答复就做现有插件的 Skill 扩展。本代没有拿到维护者对 H9 的答复，F1（web-game 不能发小游戏）仍成立。
- 加上 F10：wechat-minigame、douyin-minigame 都是只有 skill 的插件，激励视频模块是一段可复制的 TypeScript，规则检查是给 Agent 的自查清单。**单独做插件没有工程上的理由。**
- 结论：做成这两个插件的新 skill 文件夹。H9 如果以后支持 web-game 走小游戏，再考虑升级为插件（加模拟广告层的运行时检查）。

**用户与场景**
- 在 OhMyGame 里用 Cocos Creator（或 Unity）的 `general` 项目做微信、抖音 IAA 小游戏的国内小团队。
- 要接激励视频、控制主包大小；第一次提审常因发奖时机、录屏异常、残留 SDK 被驳回。

**证据**
- E72（强）：小程序游戏 535.35 亿元，广告变现占 31.89%。E74（强\*）：开发者超 50 万，八成以上 30 人以下；IAA 月活 4 亿。E76（强\*）：IAA 分成合计最高约 90%。
- N2（强，官方）：激励视频必须检查 `res.isEnded` 才能发奖；每人每天次数有限；拉取失败要 `load()` 重试；1004 走兜底分享页。
- E82（强，官方）：主包 4 MB、总计 30 MB。E83（强/弱）：抖音验收指南列出录屏异常、登录失败、支付异常；残留支付 SDK 被拒的案例。
- E81（弱，口径冲突）：资质说法混乱，只给带来源的清单，不下结论。N8（强/弱）：软著鉴别材料格式固定，已有开源生成工具。
- **受众限制**：OhMyGame 里能用上的只有 Cocos/Unity 路线的 `general` 项目，人数未知。

**已核对的已有能力与增量**
- wechat-minigame `SKILL.md:12-24`：只管导出、开发者工具、上传，"Check package-size limits … against the current official docs"一句话，不测量；没有广告、分享、录屏、提审内容。douyin-minigame 同。
- cocos-creator skill：构建 `web-mobile` 或小游戏；"a successful build proves packaging only"。
- 游戏 SDK 不是小游戏 API（`src/daemon/agent-prompts.ts:24`）；`game_use` 进不了平台运行时（wechat skill："Mini-program automation tools cannot inspect a game canvas"）。
- **增量**：激励视频的正确接法和自查清单；主包预算的测量脚本；第二期录屏分享和分享；第三期资质材料清单。

**MVP（只做激励视频 + 主包预算）**
1. `wechat-minigame/skills/minigame-rewarded-ad/SKILL.md`（douyin 插件放同一份的 `tt` 版本）：
   - 什么时候预拉取、失败怎么 `load()` 重试、只在 `isEnded` 为真时发奖、当天次数用完时隐藏按钮、广告期间暂停和静音；
   - 自查清单：发奖代码是否在 `isEnded` 分支里、是否在拉取成功前就显示按钮、`onClose` 是否重复注册（全局单例）。
2. `reference/rewarded.ts`：`wx` 和 `tt` 两套适配，统一成 `rewarded(placement) → granted | closed | unavailable`；浏览器（`web-mobile` 预览）里换成可切换结果的模拟实现。抖音接口的 `isEnded` 语义**需对照抖音官方文档核对**（本代没核实）。
3. `reference/size-check.mjs`：扫描 `build/wechatgame` 或抖音输出目录，对照主包 4 MB、总计 30 MB，列出最大资源和建议移进分包的目录（只建议，不改配置）。wechat skill 现有的那句"Check package-size limits"改为指向这个脚本。
- **第二期**：分享（`shareAppMessage`）、抖音录屏分享的封装（游戏线缺口第 6 项：`getGameRecorderManager`、按事件标记、录完分享）、插屏最小间隔。
- **第三期**：提审前扫描（残留支付、广告、统计 SDK；隐私接口和声明是否一致）和资质清单（每条附来源和核对日期，标"不构成法律意见"）。软著材料生成**不做**：格式固定且已有开源工具（N8），差异化不足，skill 里只给链接和格式要点。

**扩展点与宿主改动**
- 今天能做：skill 文件夹（含参考文件），Agent 用自己的 shell 跑 `size-check.mjs`。
- 宿主改动：不需要。方向性问题 H9 见第 6 节；游戏线需要的微信身份和关系链桥接是 H10，不在这里做。

**第一个 PR 范围**
- `plugins/wechat-minigame/skills/minigame-rewarded-ad/`：`SKILL.md`、`reference/rewarded.ts`、`reference/size-check.mjs`。
- `plugins/douyin-minigame/skills/minigame-rewarded-ad/`：同上的 `tt` 版本。
- 两个插件现有 `SKILL.md` 各加一行指向新 skill；`locales` 和 `README.md` 更新。
- 测试：`test/minigame-skills/rewarded.test.ts`（用假的 `wx` 和 `tt` 对象：中途关闭不发奖、拉取失败后重试、次数用完返回 `unavailable`）；`size-check.test.ts`（夹具目录超出 4 MB 时报告正确）。

**验证计划与成功指标（2–4 周）**
- 找 3–5 位用 Cocos 做 IAA 的创作者，让 Agent 按 skill 接激励视频。
  - 指标：接入后用开发者工具真机预览，6 条规则（发奖时机、重试、次数、暂停、静音、单例）全部满足的比例，目标 ≥80%；对照组是同样提示但不加载这个 skill。
  - 用户回填的首次提审结果（样本小，只看方向）。
- 同时向维护者要 H9 的答复，决定是否升级为插件。

**风险与最弱点**
- **最弱点：OhMyGame 里的受众窄**（F1），国内大盘子（E74）大部分在 OhMyGame 之外。
- 真机和平台运行时测不了，只能靠 Agent 自查和用户真机预览。
- 抖音接口细节未核实。

---

### P3-06 同类游戏检索（Skill）· 谱系：新（游戏线第 1、2 代评审的能力缺口第 10 项）

**用户与场景**
- 在 OhMyGame 里从一句话开始做游戏的人，尤其是要上门户、黑客松或小游戏平台的人。
- AI 给出的点子容易是"已有游戏的平均值"；撞了车，轻则白做，重则被门户以"不原创"驳回。

**证据**
- E55（强，官方）：CrazyGames 的驳回原因包括"不原创（克隆、素材换皮）"。E63（强，文档）：Reddit + Phaser 黑客松禁止"obvious AI slop"，Wordle 克隆等须有新角度。
- E47（弱）：一句话生成游戏的产品被评价"copyright infringement"。E87（强\*，平台自述）：外界把 AI 游戏看作劣质 demo。
- **N9（弱，内部样本，但直接）**：本项目游戏线第 1 代 6/14 撞车；第 2 代按要求人工检索后，评审仍找到 6 款漏掉的近邻。说明"有心检索也会漏"，需要固定的检索步骤。
- **证据空白**：没有"因不原创被门户驳回"的比例数据。

**已核对的已有能力与增量**
- game-studio、web-game-studio、CCGS 都没有这一步（F11）。CCGS `brainstorm` 只讲玩家动机分类。
- 宿主有网页搜索（Exa、Parallel 或自定义 MCP，`docs/runtime.md` Web search），原生编码 Agent 也有自己的搜索。**工具在，缺的是固定流程和输出格式。**
- **增量**：一个按"机制关键词"检索、覆盖固定渠道、输出近邻表的 skill，由 game-studio 和 web-game-studio 的"Create A Game"第 1 步引用。

**MVP**
1. 新 skill `similar-games`（同时放进 game-studio 和 web-game-studio）：
   - 从设计里抽出 2–3 个核心动词和 1 个组合（例如"拔箭 + 重力下落"）；
   - 中英文各 3 组查询，覆盖：Steam（含近 3 个月新品和即将推出）、itch.io、CrazyGames/Poki、App Store/Google Play、国内小游戏（用搜索引擎）、桌游（BGG 和国内桌游）——这两步正是游戏线评审要求新增、也是漏检最多的地方；
   - 输出写进设计文档：最接近的 3–5 款、每款的链接和发布日期、"本质差异一句话"、结论（撞车 / 有邻居但不同 / 未找到），并写明"检索不保证完整"。
2. 两个工作流 skill 的第 1 步加一句：定概念后先跑 `similar-games`；撞车时提出改法，不中断用户（和"不加审批点"一致）。

**扩展点与宿主改动**
- 今天能做：skill 文本，加宿主网页搜索。
- 宿主改动：不需要。可选第二期：一个原生工具直接查 Steam 商店搜索接口和 itch 搜索页，减少对通用搜索的依赖（插件形态，等 skill 验证后再说）。

**第一个 PR 范围**
- `plugins/game-studio/skills/similar-games/SKILL.md`，`plugins/web-game-studio/skills/similar-games/SKILL.md`（同一份内容）。
- 两个插件的 `game-studio/SKILL.md`、`web-game-studio/SKILL.md` 第 1 步各加一行引用。
- 测试：`test/official.test.ts` 已有的 skill 格式检查覆盖；再加一份 `test/skills/similar-games.test.ts`，检查 skill 列出的渠道和输出字段不缺项。

**验证计划与成功指标（1–2 周即可）**
- **有标准答案的回放测试**：用游戏线两代的 24 个候选概念作输入，各跑一次 skill，看能不能找回评审发现的 12 个近邻（第 1 代的撞车作品 + 第 2 代漏检的 6 款）。
  - 成功：召回 ≥8/12，每个概念耗时 ≤10 分钟。
  - 用两种 Agent 各跑一次（OhMyGame 默认 Agent、Claude Code），看搜索提供方的差异。
- 判负：召回 <5/12 → 说明通用网页搜索不够，第二期的专用检索工具变成前提，或者放弃。

**风险与最弱点**
- **最弱点：频率证据是内部样本**（N9）和"驳回理由存在"（E55、E63），没有驳回比例。
- 国内小游戏没有公开的搜索接口，召回会偏低。
- Agent 可能为了"差异化"把点子改坏；skill 只要求写出差异，不要求一定改。

---

## 4. 转为实验：E3-1 交付质量门基准（原 P2-04）

**插件在基准之前是否成立：不成立。**
- 需求证据仍然全是轶事（E41–E44）；
- 宿主已有三道防线（`agent-prompts.ts:19` 回合末尾说明没验证的部分；web-game-studio `SKILL.md:66` "Never claim visual or gameplay checks that were not actually performed"；Game Tests 的 instructions 要求改完自己跑）；
- 剩下的增量（证据检查、隔离的盲评）如果被证明有用，更合适的落点是 Game Tests 插件的新功能，而不是一个新插件。
- 所以本代**撤销 P2-04 的插件候选**，改为一个预先登记的实验。实验结果决定是否给 Game Tests 加"证据检查"和"只看画面的盲评"。

**实验设计**（逐条回应第 2 代评审的四个问题）

| 项目 | 设计 |
|---|---|
| 对照条件（问题 1：稻草人） | A 组 = **当前产品原样**：OhMyGame 的 Agent 提示、web-game-studio skill、Game Tests 插件开启；15 个游戏里一半自带 `tests/game/` 用例 |
| 样本 | 15 个简单网页游戏（Phaser 2D、Three.js、物理弹射、UI 卡牌、2 人联机各 3 个），每个 4 个普通任务，共 60 个任务；两种 Agent（OhMyGame 默认 Agent、Claude Code），每个任务跑 2 次 → **每种 Agent 120 次、合计 240 次** |
| 自然组（问题 3） | 60 个任务都**不埋缺陷**，测自然发生的假完成率。**去留只看自然组** |
| 埋缺陷组 | 另做 30 个埋了缺陷的状态（5 类各 6 个），只用来测盲评的检出率，不参与去留 |
| 无缺陷对照 | 60 个两名判定人都确认通过验收的状态，测盲评的误报率 |
| 双盲（问题 4） | 判定人只拿到匿名构建和验收条目，自己玩；看不到 Agent 的说法、组别、盲评结论。两人独立判定，报告 κ，分歧由第三人裁定。"Agent 是否声称完成"由另一人按固定标准从对话记录里编码 |
| 精度（问题 2） | 每种 Agent 120 次。假完成率 15% 时，95% 置信区间约 ±6.4 个百分点；按游戏聚类后约 ±8 个百分点。合并两种 Agent 240 次时约 ±4.5–5.5 个百分点 |

**分阶段与停止规则**（先写进仓库再跑）
1. **阶段 1**：只跑 A 组 240 次。
   - 合并的自然组假完成率，95% 置信区间上界 <10% → **停止**：不做任何功能，只把结果写进 EVIDENCE（这本身就是 E41 的反证）。
   - 点估计 ≥15% 且下界 ≥10% → 进入阶段 2。
   - 介于两者之间 → 再加 120 次，重新判断一次，不再加。
2. **阶段 2（不需要新的 Agent 运行）**：把盲评离线跑在阶段 1 的最终状态、30 个埋缺陷状态和 60 个无缺陷状态上。
   - 通过条件：检出率 ≥50%（下界 ≥35%），误报率 ≤15%（上界 ≤25%）。
3. **阶段 3（可选）**：B 组 = A 组 + 证据检查和盲评。要测出假完成率从 15% 降到 7%（α=0.05，功效 0.8），每组约需 240 次。只有阶段 1、2 都通过才做。

**成本估计**：阶段 1 约 240 次 Agent 运行（每次 20–40 分钟）；判定 240 个状态 × 2 人 × 约 6 分钟 ≈ 48 人时。模型费用随所选模型而定，跑之前按 10 次试跑估算。

**为什么还值得做**：不管结果如何，都会给 EVIDENCE 补上一条"痛点 5"现在缺的定量数据。

---

## 5. 降为 Skill 的想法

| 想法 | 来源 | 落到哪里 | 理由 |
|---|---|---|---|
| 玩法片段（一条 15 秒竖屏 + 一条横屏 + 一张 GIF） | P2-05 | web-game-studio 新 skill `promo-clip` | Agent 今天就能用 `game_use` 按 `setSeed` + 脚本输入、竖屏视口录 ≤60 秒（成片 720×1280，F9），裁剪用内置裁剪器。插件只多了自动找高光和 ffmpeg 剪辑，H4 开放之前还得自带 GPL 二进制。"做片段很痛"本身没有数据（EVIDENCE 文末空白）。**插件形态淘汰** |
| Steam 上线节奏和网页 demo 愿望单按钮 | P2-10 | web-game-studio 和 godot 的 skill | 第 2 代已淘汰插件形态 |
| 带种子的挑战链接、分享卡 | P2-08 | web-game-studio skill | 第 2 代已淘汰 |
| 主播模式（打码邀请码、昵称） | P2-08 | SDK 多人模块的宿主建议 | 属于 SDK |
| 引擎版本参考（废弃 API 列表） | P1-12、P2-04 的 API 扫描 | 把 CCGS `engine-reference` 移植进 web-game-studio、godot 的 skill（先确认许可证） | 证据只有轶事，事后扫描放不进插件 |
| 音频接入检查（自动播放解锁、音量、循环点） | 第 2 代评审第 5 节 | web-game-studio skill；P3-02 第二期的静态规则 | E68 官方规则；音频失败模式是证据空白 |
| 激励视频、主包预算 | P2-07 | P3-05 | 见上 |
| 同类游戏检索 | 游戏线缺口 | P3-06 | 见上 |
| 软著材料生成 | P1-13、游戏线缺口第 11 项 | 只在 P3-05 第三期给格式要点和开源工具链接 | 格式固定、已有开源工具（N8） |

---

## 6. 宿主改动建议（按影响排序）

| 排名 | # | 改动 | 解锁什么 | 改动面 | 说明 |
|---|---|---|---|---|---|
| 1 | H9 | web-game 发微信/抖音小游戏的路线（方向性决定：适配层，或把 Cocos/Laya 作为一等路线） | P3-05 升级为插件；**游戏线前两名 G2-01、G2-09 都以微信/抖音 IAA 为主平台** | 大 | 影响面最大。不做的话，OhMyGame 主力项目类型进不了国内最大的小游戏市场（E72–E78） |
| 2 | H1 | Cloud 试玩事件收集（同意文案、保留期、只有作者能读）+ 网站游戏页可写反馈 + 访客漏斗计数对作者可见 | P3-03 的远程回收（F1 的根因）；P3-01 的效果衡量 | 中 | 改动比 H9 小得多，按"成本 / 收益"其实排第一 |
| 3 | H10 | 微信身份和关系链桥接（微信登录、`openGId` 和 `getRelationFriendList` 的解密需要服务端 `session_key`）+ 开放数据域渲染助手 | 游戏线 G2-05（核心）、G2-01（群排行） | 中到大 | 解密必须在服务端，插件做不了；依赖 H9 |
| 4 | H4 | 向原生插件开放宿主的 ffmpeg 路径（宿主已认 `OHMYGAME_FFMPEG_PATH`，二进制已随应用分发） | `promo-clip` 自动剪辑；P3-02 第二期音频转码 | 很小 | 成本最低 |
| 5 | H11 | **新**：插件保活接口（把宿主已有的内部 `hold()` 开放出来） | P3-02、P3-03 的局域网服务器不用占着 3600 秒的命令（F3） | 很小 | 今天有替代办法，但超过 1 小时会断 |
| 6 | H6 | 多人后端的局域网监听开关 + 游戏会话的网络条件参数 | P3-02 的联机真机测试；游戏线网页多人候选 | 小 | — |
| 7 | H5 | SDK 构建时关闭云能力或换后端 | P3-02 第三期门户链路 | 小 | 等门户立项再做 |
| 8 | H12 | **新**：Tune 支持离散选项（下拉） | P3-04 第二期变体选择 | 小 | 可选 |
| 9 | H8 | 只读的发布记录接口 | P3-01 第二期"可分享"一级 | 很小 | 可选 |
| 10 | H2 | 社区"求试玩"标记和互评队列 | P3-03 招募规模化 | 中 | 需要反作弊设计 |
| 11 | H3 | 钩子 notice 带"交给 Agent"按钮 | — | 小 | **降级**：命令 `insert` 和页面 `composer.fill` 已能代替 |
| 12 | H7 | `image.beforeGenerate` 可追加参考图 | 风格一致性（无在活候选） | 小 | 宿主独立需求 |
| — | 文档 | `runtime.md` 里"plugins … do not offer [actTogether]"和代码不一致 | 所有用 `actTogether` 的插件 | 零 | 文档 bug |

**对插件（不是宿主）的建议**：Game Tests 把最近一次运行的摘要写进项目文件（F5），其他插件就能读到人在面板里点的运行结果。

---

## 7. 谱系表

| 第 3 代 | 来源 | 本代修正要点（对应第 2 代评审要求） |
|---|---|---|
| P3-01 必发阶梯 | P2-01 | "先问用户"改为"回合末尾点名"；开局改为 `home.starters` 提示词 + 项目内面板；MVP 去掉每日摘要和第四、五级；用 `tool.afterCall` 读 `game_test` 结果（Game Tests 不落盘，F5） |
| P3-02 发布前检查 | P2-02 + P2-09 | MVP 只留构建扫描和局域网真机；运行时检查生成 Game Tests 用例；门户放第三期并承认 N1 反证；P2-09 变成第三期"英文门槛"模块；局域网服务器的保活问题（F3）和非安全上下文（F12）写进设计 |
| P3-03 真人试玩回路 | P2-03 | 放弃评审建议的"访客 + 排行榜计数"（F1：访客成绩不公开）；改为现场局域网收集 + 作者自备端点；H1 补上"访客漏斗计数可见"；招募只留一个按钮 |
| P3-04 种子批量验证台 | P2-06 + P1-02 | 主轴改为无头批量模拟和可解性/难度看板（游戏线缺口第 1 项）；数值模拟变成主路径的一部分但限定"模拟约定"；变体比较和盲玩放第二期，用单个 `variant` 选择器解决 tuning.json 的三个问题（F2） |
| P3-05 小游戏激励视频与提审 | P2-07 | H9 无答复 → 改为 wechat-minigame、douyin-minigame 的 Skill 扩展；MVP 只做激励视频 + 主包预算；软著材料不做生成（N8） |
| P3-06 同类游戏检索 | 新 | 回应游戏线能力缺口第 10 项；Skill 形态，有标准答案的回放验证 |
| E3-1 实验 | P2-04 | 撤销插件候选；基准按四个问题修好，分阶段停止规则；API 扫描删除 |
| — | P2-05 | 降为 skill `promo-clip`（事实更正：竖屏 720×1280） |
| — | P2-08、P2-10 | 上一代已淘汰，回收部分见第 5 节 |

---

## 8. 覆盖表

### 8.1 游戏线的能力缺口（`gen-2-games-review.md` 第 5 节）

| # | 缺口 | 本代处理 |
|---|---|---|
| 1 | 无头批量模拟和难度/可解性看板 | **P3-04**（主轴） |
| 2 | Steam / Steamworks 发布 | 第 2 代已淘汰插件形态，降为 skill；需求面 8 → 3 |
| 3 | 游客进房 + 门户多人 SDK 适配 | 不做插件：属于 SDK（游客身份、平台用户名），并入 H5 的讨论；P3-02 第三期只做 CrazyGames 广告和 SDK 基本事件 |
| 4 | 服务器权威的实时同步模板 | 不做插件：建议写进 web-game-studio skill，配合 Game Tests 多人用例和 H6 |
| 5 | 微信身份和关系链桥接 | 宿主改动 **H10** |
| 6 | 玩家侧录屏和精彩片段（抖音录屏封装） | **P3-05 第二期** |
| 7 | 小游戏包体预算（主包 4 MB） | **P3-05 MVP**（`size-check.mjs`） |
| 8 | 门户和渠道合规检查 | **P3-02**（MVP 预算部分；第三期广告规则） |
| 9 | 部件化素材生产和一致性检查 | 不做插件：画布预设可以做，但一致性检查是证据空白；PixelLab 和内置 Check pixel art 覆盖大半 |
| 10 | 原创性和同类检索 | **P3-06** |
| 11 | 国内上线资质材料包 | P3-05 第三期只给清单和格式要点（N8） |

### 8.2 EVIDENCE 高频痛点索引

| # | 痛点 | 覆盖 |
|---|---|---|
| 1 | 发现性与营销 | `promo-clip` skill；P3-06（避免撞车）；主体不可工具化 |
| 2 | 做不完 | P3-01 |
| 3 | 设计愿景不清、不好玩 | P3-03（真人数据）、P3-04（批量模拟，不判断好玩）、P3-06（概念阶段） |
| 4 | 试玩难 | P3-03 |
| 5 | Agent 测不了、误报完成 | E3-1 实验；P3-04 的一致性核对和"没跑不许声称可解" |
| 6 | 包体和加载 | P3-02、P3-05 |
| 7 | 多门户、多平台合规 | P3-02（第三期）、P3-05 |
| 8 | 移动端浏览器的坑 | P3-02（真机） |
| 9–10 | 美术音频、素材一致性 | 不做插件（宿主和服务商已覆盖；H7） |
| 11 | 技术硬骨头（UI 缩放） | P3-02 移动端用例模板、英文门槛模块 |
| 12 | 多人联机 | H6；Game Tests |
| 13 | 代码腐化、版本混淆 | 降为 skill（engine-reference 移植） |
| 14 | AI 声誉、披露、版权 | P3-06（不原创）、P3-02 第三期来源账本 |
| 15 | 变现低 | P3-05（IAA 接对） |
| 16 | 国内资质 + 买量素材 | P3-05 第三期清单；买量素材不做 |
| 17 | 工具迁移 | 不覆盖 |

---

## 9. 生成者自评：哪里最容易被攻击

- **数量**：独立插件只有 4 个。我认为这是证据支撑得住的数量；硬凑会违反 GOAL"不做"第 3 条。
- **P3-03 的远程路径**：作者自备端点门槛高，社区发布页能否外发没实测（F13）。如果评审认为这让可行性仍只有 2 分，P3-03 就该写成"现场试玩插件 + H1 的需求文档"。
- **P3-04 的证据**：外部证据是间接的品类数据（E79）和弱证据（E36、E41），强需求主要来自本项目游戏线（有循环论证之嫌，和第 2 代 P2-10 的问题同类）。区别在于：游戏线前两名都直接依赖它，而且有现成的狗粮项目可以在 2 周内验证。
- **P3-05、P3-06 是不是"插件想法"**：两者都是现有插件的 skill 扩展。如果终选只数独立插件，它们不计数。
- **E3-1 的成本**：阶段 1 就要 240 次 Agent 运行和约 48 人时判定；但有明确的提前停止规则。
- **和评审建议的偏离**：
  1. 没有采用评审给 P2-03 的"访客 + 排行榜计数"，理由是 F1（代码证据）；
  2. P2-06 没有按评审的"轻修"走，而是按任务说明重定位为批量验证台；
  3. H9 排在 H1 前面（按影响面），但注明按成本收益 H1 优先。
