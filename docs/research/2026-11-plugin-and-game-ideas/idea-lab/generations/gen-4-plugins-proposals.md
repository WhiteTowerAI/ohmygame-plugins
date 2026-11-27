# 第 4 代插件提案（生成者，最后一代）

- 日期：2026-11-25。依据：`GOAL.md`、`RUBRIC.md`、`PROCESS.md`、`CONTEXT.md`、`EVIDENCE.md`（E1–E116，其中 E111–E116 是本代按评审要求入库的 N1、N2、N3、N8、N9 和 F13）、`pool/plugins.md`、`generations/gen-3-plugins-proposals.md`、`generations/gen-3-plugins-review.md`。
- 核对的代码：`ohmygame`（dev，d6eac678，beta.5.11）；`ohmygame-plugins`（main，6189ce6）；`origin/feat/game-tests`（768b9c5）。
- 本代做的实测（新）：
  1. 在临时目录里按 CCGS web starter 的锁文件装依赖，分别用项目自带的 rolldown、Node 自带的去类型、esbuild-wasm 打包一个 TS 模拟模块（结果见 G4-F10）；
  2. 抓取社区一款已发布游戏的网站页，确认网址参数会传进游戏 iframe（G4-F13）；
  3. 读抖音开放平台的激励视频文档，核对 `isEnded`（G4-F14）；
  4. 为第 6 个名额做网页检索（第 4 节）。
- 本代任务：这是最后一代，只做三件事：把 2 个直接终选的小修做完；把 3 个附条件终选的条件在纸面上落实，变成无条件终选；诚实地评估第 6 个名额。**不新编候选凑数。**

---

## 0. 本代结论速览

| ID | 名称 | 形态 | 第 3 代评审分 | 本代处理 | 本代结论 |
|---|---|---|---|---|---|
| P4-01（原 P3-01） | 必发阶梯 ship-ladder | 独立插件 | 84 | Jam 提醒改成宿主今天能做到的样子；"可启动"判定写出四种边界；判负条件改成行为指标 | **终选** |
| P4-02（原 P3-02） | 发布前检查 launch-check | 独立插件 | 83 | 第一个 PR 拆成两个；判负条件写成数字；防火墙、http 链接、Agent 工作时不能构建三处写进设计 | **终选** |
| P4-03（原 P3-03） | 真人试玩回路 playtest-loop | 独立插件 | 77 | 探针只在网址带 `?pt=` 时启用（实测网站页会把参数传进 iframe）；加 `capabilities.secrets`；现场局域网收集移出 MVP；第一个 PR 收窄；提 H1 + H13 | **终选**（条件已落实） |
| P4-04（原 P3-05） | 小游戏激励视频与提审 | **Skill 扩展**（wechat-minigame、douyin-minigame） | 70 | 抖音 `isEnded` 已核对（另有 `count` 字段）；判负条件写成数字；改用夹具 A/B；`size-check` 排除引擎插件、按分包统计 | **终选**（条件已落实） |
| P4-05（原 P3-04） | 种子批量验证台 seed-lab | 独立插件 | 65 | 实测后改为"插件自带 esbuild-wasm"一条打包路径；验证加"Agent 自写统计脚本"基线组；狗粮的替代方案写定；第一个 PR 拆成三个 | **终选**（条件已落实） |
| — | 第 6 个名额 | — | — | 评估了评审给的三条路（第 4 节） | **没有一条达到约 65 分且有真实数据。插件线停在 5 个** |

**数量**：独立插件 4 个，Skill 扩展 1 个，共 5 个。按 GOAL"不为凑数量而产出"，插件线在 5 个处停下（理由见第 4 节）。

**收敛**：第 3 代 → 第 4 代，前 5 名的谱系和内容都没有变（P3-04 在第 3 代已经重定位，本代只改打包和验证）。所以第 3 代评审说的"严格读法"在本代也满足了。另外本代已经是第 4 代，GOAL 的"跑满 4 代"同样成立。

---

## 1. 本代代码核对与实测的新事实（G4-F 编号）

| # | 事实 | 出处 | 影响 |
|---|---|---|---|
| F1 | 命令的标题来自 manifest，是静态的。`project.toolbar` 槽位是"Buttons in the project's top bar, before Play"，manifest schema 里没有动态标题或角标字段 | `docs/plugins.md:1862`；`schemas/plugin-2.json`（grep `badge` 无结果） | 工具栏不能显示倒计时。倒计时只能放在面板里 |
| F2 | 钩子只能返回 `{ notice, tone }`：最多 300 字符，10 秒内最多 5 条，`tone` 只有 `default`、`danger`，**不能带按钮** | `docs/plugins.md:532-536` | "danger toast 附命令"做不到 |
| F3 | 钩子会唤醒已经停掉的宿主：`notify` → `native.hook` → `hosts.invoke`，宿主不在就新起一个 | `src/daemon/plugin-hooks.ts:160-178`；`src/daemon/native-plugins.ts:306-316` | 宿主空闲 5 分钟就停（`extension-hosts.ts:193`），插件没有定时器可用；但下一次 `turn.completed` 一定能跑到插件的处理函数 |
| F4 | 原生代码可以 `context.panels.open(panel, { state })` 打开自己的面板（项目没开时失败；和页面共享 10 秒 5 次的限制）。页面在**显示时**可以用 `ui.confirm` 弹对话框，也可以用 `command.run` 运行自己 manifest 里的命令 | `src/shared/extension-host-protocol.ts:251-258`；`docs/plugins.md:2067-2077, 1989-1996, 1889` | 今天就能做到"到点后一次确认就执行保底版本"：钩子打开面板，面板弹确认，确认后运行 `jam.fallback`。不需要 H3 也能做，只是会主动打开一次面板 |
| F5 | Game Tests 给 Agent 的结果文字第一行固定是 `"<通过数> of <总数> game tests passed."`，取消时前面加 `"Cancelled: "`；没有用例时返回"This project has no game tests yet…"。工具名 `game_test`，`timeoutSeconds: 3600` | `origin/feat/game-tests:plugins/game-tests/src/summary.ts:4-12`；同分支 `plugin.json` | "可启动"一级的解析规则可以写死并用夹具测试；但 Game Tests 还没合并，格式不是契约 |
| F6 | `tool.afterCall` 的 `text` 最多 8,000 字符，被截断时 `truncated: true`；只有 `status`（`succeeded`/`failed`）和文字，没有结构化结果 | `docs/plugins.md:591-596` | 截断时不能判"全部通过" |
| F7 | 插件游戏会话的快照有 `logs`（含 `level: "error"`）、`failedRequests`、`canvases[].visible`；`capture()` 返回 JPEG | `src/shared/playtest.ts:114-148`；`extension-host-protocol.ts` `PluginGameSession` | "可启动"的回退检查（插件自开会话）有现成的数据可判 |
| F8 | `progress(message, { url })` 只把 **https** 链接当成可打开的链接 | `src/shared/extension-host-protocol.ts:329-331` | 局域网地址 `http://192.168…` 只能从消息文字里取 |
| F9 | CCGS web starter（phaser、pixi、three）和 scaffold 的锁文件都是 `vite 8.3.4`，依赖 `rolldown ~1.2.12`，esbuild 只是可选 peer，**锁文件里没有 esbuild**。scaffold 自带 `vitest 5` 和 `tests/unit/**/*.test.ts` | 4 份 `package-lock.json`；`scaffold/vite.config.ts` | 第 3 代的 F8 对新项目不成立（评审正确）。Agent 自己写统计脚本的基线有现成的 vitest 可用 |
| F10 | **本代实测（Node 22.23.5，临时目录装 starter 依赖）**：模拟模块 `sim/index.ts` 用了 `enum` 和不带扩展名的相对 import。<br>① 用项目自带的 `rolldown` 1.2.15 JS API（`build({ input, platform: "node" })`）：打包成功，0.15 秒，1 万个种子跑完；<br>② Node 自带的去类型：`enum` 报 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`，不带扩展名的 import 报 `ERR_MODULE_NOT_FOUND`，**两种常见写法都跑不了**；<br>③ `esbuild-wasm` 0.28.2：打包成功，约 0.36 秒；`esbuild.wasm` 原始 13.98 MB、gzip 后 3.78 MB，npm 包解压 14.5 MB | 本代实测（脚本在生成者的临时目录）；`npm view` | 打包方案见 P4-05。没有在 Electron 43 的 `ELECTRON_RUN_AS_NODE` 下实测，写进第一个 PR 的测试 |
| F11 | 插件包上限是压缩包 50 MiB（`PLUGIN_ARCHIVE_MAX_BYTES`）。插件可以通过 `bundleDependencies` 带 npm 包，每个包要附 `THIRD_PARTY_LICENSES.md`。官方仓库已有先例：`scripts/build-computer-use.mjs` 用 esbuild 打包插件原生代码并生成许可证清单 | `src/shared/plugins.ts:166`；`docs/plugins.md:1502-1512`；`ohmygame-plugins/scripts/build-computer-use.mjs` | P4-05 自带 esbuild-wasm（gzip 后约 4 MB）在限额内，打包流程有先例可抄 |
| F12 | 应用本身带 `esbuild` 0.28.2，并从 asar 解压出来（`asarUnpack`），守护进程用它打包互动故事和画布 playable；**但没有开放给插件** | `package.json:93`；`electron-builder.yml:6-8`；`src/daemon/story-web-bundle.ts:35`、`src/daemon/playable-sources.ts:5` | 新增可选宿主改动 H15（和 H4 开放 ffmpeg 同一类） |
| F13 | **本代实测（2026-11-25）**：打开 `https://www.ohmygame.ai/g/t3g5vg?pt=3`，返回的 HTML 里游戏 iframe 是 `src="https://g-19a3620d-….ohmygame.zone/?pt=3"`，**网址参数原样传进了游戏**；直接访问播放域 `…/?pt=3` 返回 200，响应头里仍然没有 CSP | 公开接口 `cloud.ohmygame.ai/v1/community/games` 给出的 `pageUrl`、`playUrl` | P4-03 的"只在带 `?pt=` 时启用探针"今天能走通；这一点也没有文档保证，并进 H13 |
| F14 | **抖音激励视频（本代核对）**：`tt.createRewardedVideoAd` 返回全局单例；`onClose` 的 `res.isEnded` 为 true 表示看完后关闭，false 表示播放中关闭，开发者据此决定是否发奖；每人每天次数有限，建议拉取成功后再显示按钮；在支持多例（`multiton`，"再得广告"）的版本上还返回 `res.count`（看完了几次），而且是否返回和 `multiton` 是否打开无关。onClose 接口页（只能从搜索摘要读到）建议返回 `count` 时统一用它判断 | 抖音开放平台《激励视频广告》指南（已读原文）；《RewardedVideoAd.onClose》（页面是前端渲染，只读到搜索摘要） | P4-04 的 `tt` 适配要同时处理 `isEnded` 和 `count`；第 3 代的"抖音未核实"关闭 |
| F15 | 插件原生代码是完全信任的 Node 代码，不是沙盒；`capabilities.network` 管的是页面的 `net.fetch` 和 MCP 服务器。设置里的密钥字段需要 `capabilities.secrets` | `docs/plugins.md:336, 439, 748, 766`；`docs/plugin-security.md:13` | P4-03 拉取数据放在原生命令里做，不受页面主机清单限制；`readToken` 必须声明 `secrets` |

第 3 代评审已经核实的事实（F1–F14，第 3 代编号）本代复核无变化，不再重复。

---

## 2. 终选候选

### P4-01 必发阶梯（ship-ladder）· 谱系：P1-14（82）→ P2-01（84）→ P3-01（84）→ P4-01 · 独立插件

**本代修改（对应第 3 代评审第 6 节第 1 条）**

| 评审要求 | 本代做法 |
|---|---|
| 倒计时只放在面板里 | 工具栏按钮标题固定为"发布阶梯"，只负责打开面板（F1）；倒计时由面板页面自己的定时器显示 |
| 截止提醒用 `turn.completed` 的 notice 发 | 采用，并加一条今天就能做的"一次确认执行"路径（F3、F4），见 MVP 第 4 条 |
| "可启动"判定处理截断和零个测试 | 写出四种边界（MVP 第 3 条），并加"Game Tests 没合并时回退检查是一等路径" |
| 判负以"关掉插件的比例 ≥50%"为主，组间差只作描述 | 采用；另把判定准确性写成两道可证伪的门槛 |
| （可选）吸收 P3-06 | **不吸收**。P3-06 没有过证据门槛（第 4 节），把它放进终选候选的 MVP 等于让没有证据的功能搭便车 |

**用户与场景**
- 在 OhMyGame 开新项目的人：Jam 参赛者、第一次做游戏的人、做了几个月还没发出去的人。
- Agent 让"再加一个功能"几乎零成本，范围越加越大，项目停在 80%。

**证据**
- E12（强，论文）：planning、scope、feature creep、cutting features、delays 合计约占复盘问题的 20%。
- E13（强）：Underestimation 34 次、Unclear game design vision 28 次。E14（强）：小团队 50% 列出 obstacles；"Feature creep ruled our roost"。
- E16、E17（中，计算值，当上限看）：大型 jam 只有约 10–30% 的报名者提交；LD 约一半草稿没发布。E89（中）：聚光灯 GameJam 完赛约 50–60%。
- E111（中，原 N1）：开放题里"时间、动力、做完"提得最多（21.1%）。
- **证据空白**：没有证据说明工具能提高完成率；E15、E111 都说主要障碍是时间和动力，工具管不了。所以验证计划以"判定准不准"和"人留不留"为判据，不以提交率为判据。

**已核对的已有能力与增量**
- game-studio `SKILL.md:26`、web-game-studio `SKILL.md:28`：开局定"first playable scope"，之后"revise or continue without adding an approval checkpoint"。本插件不加审批点。
- `src/daemon/agent-prompts.ts:19`：每个回合末尾总结改动和没验证的部分，只管单个回合，不对照范围。
- CCGS 的 `scope-check`、`cut`、`sprint-plan`、`milestone-review`：只对 CCGS 模板加 Claude Code 生效，要手动调用。本插件对 CCGS 项目让位：检测到 CCGS 模板时，面板只显示阶梯和 Jam，不再给范围建议。
- `home.starters` 只显示提示词命令、只填输入框、只出现在新项目默认启用的插件里（`docs/plugins.md:1870`）。
- **增量**：一份所有 Agent 都读的 `design/ship.json`；能自动打勾的阶梯；Jam 倒计时和保底版本。

**MVP**
1. **开局**：`home.starters` 一条提示词命令"带发布日开新游戏"，让 Agent 先写 `design/ship.json`（发布日、目标平台、一句话核心玩法、不做清单），再开始做。进了项目后，面板里可以结构化地改这份文件。
2. **不做清单（不打断）**：静态 instructions 要求 Agent 读 `design/ship.json`。用户要做清单上的东西时照做，只在回合末尾总结里点名"这一项在不做清单上"。
3. **阶梯前三级**，判定规则写死：
   - **可启动**。按顺序取第一个有结论的来源：
     1. `tool.afterCall` 看到 `game_test`：只有同时满足 `status === "succeeded"`、`truncated` 不为真、第一行匹配 `^(\d+) of (\d+) game tests passed\.$`（没有 `Cancelled:` 前缀）、总数 ≥1、通过数 = 总数，才打勾（F5、F6）。
     2. 下面几种情况**不打勾，也不打叉**，标"未知"，转到回退检查：文字被截断；总数为 0 或返回"no game tests yet"（空真）；运行被取消；格式对不上（Game Tests 改了格式）。
     3. 有失败（通过数 < 总数）：标"未通过"，面板显示第一条 `FAILED` 行。
     4. **回退检查是一等路径**（Game Tests 没合并、没装或没有用例时都走它）：用户点"检查"，插件用 `capabilities.game` 开一个会话，等 `readyState === "complete"` 后再等 5 秒，判定条件是：`logs` 里没有 `level: "error"`、`failedRequests` 里没有同源请求失败、至少一个 `canvases[].visible` 为真，或者 `capture()` 的画面不是单色（像素方差超过阈值）（F7）。
   - **核心循环**：`ship.json` 里可写一个 `coreProbe`（几步输入加一个 `snapshot` 路径，要求它变化），有就机检；没有就人工勾选。
   - **有失败和重开**：同上。
   - "可分享""可上架"两级放第二期。
4. **Jam 模式（按宿主的真实限制设计）**：
   - **倒计时只在面板里**：面板页面自己的定时器每分钟刷新一次；工具栏按钮标题固定，只负责打开面板（F1）。
   - **截止前 24 小时的提醒**：宿主空闲 5 分钟就停、插件没有定时器（F3），所以提醒只在**跨过 T−24h 之后的第一次 `turn.completed`** 发出，每个 Jam 只发一次（发过的记录写在插件数据目录）：
     1. 钩子返回 `{ notice: "离 Jam 截止不到 24 小时。打开'发布阶梯'面板，点'出保底版本'。", tone: "danger" }`（F2，不能带按钮，所以文字里写明去哪里点）；
     2. 同时调用 `context.panels.open("ladder", { state: { jamAlert: true } })` 把面板打开（F4）。面板收到 `jamAlert` 后用 `ui.confirm` 问一次"现在出保底版本吗？"，确认就 `command.run("jam.fallback")`，把"冻结功能、修阻断问题、导出"的提示词放进输入框（`insert`，不自动发送）。
   - **边界照实写**：用户在 T−24h 之后一次都没和 Agent 对话，就不会收到提醒；面板开着时，页面自己的定时器到点也会弹同一个确认，所以开着面板的人不依赖 `turn.completed`。这两点是 H3、H14 仍有价值的原因。
   - 设置里可以关掉"自动打开面板"，只留 notice。
5. **本地记录**：每级第一次达成的时间、提醒发出的时间、确认与否，写进插件数据目录，不联网。这是验证计划要用的数据。

**扩展点与宿主改动**
- 今天能做（API 2.37）：`home.starters`、`project.toolbar`、面板（`projectFiles: ["design/ship.json"]`，`ui.confirm`、`command.run`）、`instructions`、`tool.afterCall`、`turn.completed`、`context.panels.open`、`capabilities.game`、`capabilities.composer`、命令 `insert`。
- 宿主改动：MVP 不需要。可选：H3（钩子 notice 带按钮，比自动打开面板更不打扰）、H14（工具栏命令动态标题，用来在工具栏显示倒计时）、H8（只读发布记录，第二期"可分享"一级用）。
- 对 Game Tests 插件的建议（不是宿主改动）：把最近一次运行的摘要写进项目文件，人在面板里点的运行也能被读到。

**第一个 PR 范围**
- 新目录 `plugins/ship-ladder/`：
  - `.ohmygame-plugin/plugin.json`：`id: ohmygame/ship-ladder`，`appliesTo: ["web-game","general"]`，`capabilities: { native, game, composer, "project.files": "write" }`，`projectFiles: ["design/ship.json"]`。
  - `contributes`：`instructions`；`hooks: ["tool.afterCall", "turn.completed"]`；`commands`：`starter`（`home.starters`，提示词）、`open`（`project.toolbar`，`openPanel`）、`check`（原生，`changesFiles: false`）、`jam.fallback`（`insert`）；`panels: [ladder]`（`opens: "onRequest"`）。
  - `src/index.ts`、`src/ladder.ts`（纯函数：事件 → 各级状态）、`src/game-test-result.ts`（第 3 条的解析规则）、`src/jam.ts`（是否该提醒的纯函数）、`schemas/ship.json`、`panel/`、`locales/{en,zh-CN}.json`、`README.md`、`assets/icon.svg`。
- 测试 `test/ship-ladder/`：
  - `game-test-result.test.ts`：全部通过、有失败、`truncated: true`、总数 0、"no game tests yet"、`Cancelled:` 前缀、格式不认识，七种夹具文字（取自 `summary.ts` 的真实输出），断言分别得到"通过 / 未通过 / 未知"；
  - `jam.test.ts`：T−24h 前不提醒；跨过后的第一次 `turn.completed` 提醒一次；同一个 Jam 不提醒第二次；改了截止时间重新计；
  - `ladder.test.ts`：给定结果、探针快照、人工勾选，算出各级状态；
  - `plugin.test.ts`：manifest 只声明用到的钩子和能力；instructions 里不出现"先问用户"之类的审批语句；
  - `panel-page.test.ts`（happy-dom，照 Game Tests 的写法）：编辑 ship.json 后格式正确；收到 `jamAlert` 状态时调用一次 `ui.confirm`。
- 不在第一个 PR：第四、五级、每日摘要、"可分享"。

**验证计划与判负条件（2–4 周）**
1. **判定准确性（第 1–2 周，能证伪）**：在 20 个现有项目（官方示例和内部项目）上跑前三级，共 60 个判定，人工标注真值。
   - 通过：一致 ≥90%（≥54/60），"假通过" ≤5%（≤3/60）。
   - **判负**：修一轮之后仍然不达标 → 取消自动打勾，降为 skill（`ship.json` 模板 + instructions），不做插件。
2. **人留不留（第 2–4 周，行为指标）**：办一场 7 天的小 Jam，报名者随机分成开插件和不开插件两组，每组目标 ≥20 人。
   - **主判负**：开插件组里关掉插件或删掉 `ship.json` 的人 ≥50% → 降为 skill。
   - **功能级判负**：整组里"不做清单点名"之后，用户删掉或推迟该项的次数为 0 → 第二期去掉点名功能；跨过 T−24h 后有过对话的人里，收到提醒的 <80% → 说明宿主限制真的挡住了提醒，作为 H3/H14 的证据交给维护者。
   - **只作描述**：两组截止时的提交率差。每组 20 人时，基线约 30%（E16）、提高 15 个百分点的检验功效约 17%，判不出结论。要用它做判据，每组至少约 160 人（α=0.05、功效 0.8 时的样本量），只能借一场大 jam 做，作为后续。

**风险与最弱点**
- **最弱点仍然是效果没有证据**：时间和动力问题工具解决不了（E15、E111）。
- 机检只覆盖"能启动、有循环"，管不了"好不好玩"。
- Game Tests 的结果格式不是契约（F5），它一改，"可启动"就会落到"未知"转回退检查。不会误判通过，只会多一次点击。
- 自动打开面板可能招人烦，所以只开一次、可以关掉。

---

### P4-02 发布前检查（launch-check）· 谱系：P1-04 + P1-05 + P1-11 → P2-02（+ P2-09）→ P3-02（83）→ P4-02 · 独立插件

**本代修改（对应第 3 代评审第 6 节第 2 条）**

| 评审要求 | 本代做法 |
|---|---|
| 第一个 PR 拆成"扫描"和"局域网真机"两个 | 拆成 PR-A（扫描和平台配置）、PR-B（局域网和浮层） |
| 判负条件写成数字 | 写成四个数字（见验证计划） |
| 面板说明系统防火墙会弹窗 | 写进面板文案，并把"被防火墙拦"算进连接成功率 |
| 局域网地址从 progress 的文字里取 | 采用（F8）；消息里同时带 `lan-url:` 前缀方便解析 |
| `build: "web"` 在 Agent 工作时做不了 | 按钮在 Agent 工作时给出"等 Agent 停下再测"，不排队 |

**用户与场景**
- OhMyGame 的网页游戏（`web-game`，以及有网页预览的 `general` 项目），准备从社区再往外发：itch、自己的网站、手机分享，少数人上门户。
- 桌面预览里一切正常，到手机上才发现：首包太大、按钮在屏幕外、iPhone 没声音、外部字体被拦。

**证据**
- E53（强，官方 + 定量）：每多 1 MB 流失几个百分点；Cannon Clash 2.4 MB、进入游戏转化 81%。
- E56（强）：CrazyGames 初始下载 ≤50 MB、手机首页 ≤20 MB、≤1,500 个文件、只用相对路径、iOS 要在 touchend 里 resume AudioContext。E62（强）：Playables 初始包 <30 MiB、单文件 <30 MiB、≤8,000 个文件。
- E54（强）、E68（强，MDN）：竖屏、刘海、Safari 清存储、自动播放限制。E67（弱）：iOS Safari 内存和 WebGL 崩溃。
- E27（强）：aspect-ratio 是问答站平均浏览最高的标签。E66（弱，单案例）：AI 写的游戏上门户前补了六处，其中三处是绝对路径、外部字体、无用素材。
- E111（中，原 N1）：网页开发者 66.4% 发 itch 类、37.7% 发自己网站。**反证**：Poki 自填只有 0.7%，问卷没有门户选项。门户部分的受众比例未知，所以门户放第三期。

**已核对的已有能力与增量**
- 发布对话框：总大小、文件数、最大文件和顶层文件夹，对照 100 MiB；只对社区一家、不构建、只看总量（`docs/runtime.md:1243-1250`）。
- 预览设备只改视口、不模拟 WebKit。本插件不贡献预览设备。
- Game Tests 能按 `viewports`、`path`、`seed` 跑，自带"不空白、无控制台错误、无失败请求"检查。本插件不自建运行器，移动端运行时检查写成 Game Tests 用例（第二期）。
- 两个仓库 grep `crazygames|poki|gamedistribution|yandex|playables`：插件零结果。
- 宿主没有局域网静态服务；多人后端只监听回环（`docs/multiplayer.md:110`）。
- **增量**（MVP 只做前两项）：按平台的首包预算（首包和懒加载分开）；局域网扫码真机测试（唯一能测真 iOS Safari 的办法）；一键优化；移动端规则；门户链路和英文门槛。

**MVP**
1. **构建扫描**（`project.publish` 菜单和面板按钮）：
   - 原生命令拿 `build: "web"` 的构建，解析入口 HTML、JS import 图（es-module-lexer）和预加载清单，分出首包和懒加载。
   - 列出：最大文件、未被引用的素材、外部请求（字体、CDN）、绝对路径、文件数。
   - 对照内置的平台配置：社区（100 MiB）、itch（只给建议）、CrazyGames（50/20 MB、1,500 个文件）、Playables（30 MiB、单文件 30 MiB、8,000 个文件）、Poki（5 MB 和 8 MB 两种说法都列出，标冲突，E53）。每个数字带来源链接和核对日期。
   - 报告写到 `.ohmygame/launch/report.json`（给 P4-01 第二期读）和面板。
   - Agent 正在工作时，构建做不了（`docs/plugins.md:317-320`）：命令直接返回"等 Agent 停下来再扫描"，不排队。
2. **局域网扫码真机测试**：
   - 长时间运行的原生命令 `lan.start`（`timeoutSeconds: 3600`，靠进行中的调用挡住宿主空闲停机）：把构建复制到插件数据目录（构建目录在调用结束时删除），在 `0.0.0.0` 的随机端口托管。
   - **地址传给面板的方式**：`progress` 只把 https 当成可点链接（F8），所以发的是纯文字消息 `lan-url: http://192.168.x.x:port/`，面板从 `progress` 事件的文字里解析出地址画二维码，同时显示可手动输入的地址。
   - **防火墙**：插件宿主是 Electron 的 Node 子进程，第一次在 `0.0.0.0` 上监听时，macOS 和 Windows 可能弹"允许传入连接"。面板在开始前写明"系统可能会问是否允许连接，请点允许；点了拒绝会表现为手机打不开"，并给出到系统设置里改回来的路径。连接失败时，面板把"被防火墙拦"列为第一个排查项。
   - 只在托管的副本里注入诊断浮层，不改项目文件：报错、FPS、首帧时间、`performance.memory`（拿得到时）、AudioContext 状态、视口和安全区尺寸，经 WebSocket 回传面板。
   - 报告标注"非安全上下文"（http 局域网地址不是安全上下文）；联机游戏不在范围内（H6）；会话超过 1 小时会断（H11）。
- **第二期**：一键优化（图片转 WebP、gltf-transform 压缩 GLB、删除未引用素材、外部字体本地化，每项走插件写入、可撤销；音频转码等 H4）；移动端规则（静态扫描加生成 `tests/game/launch-mobile.json` 这类 Game Tests 用例模板）。
- **第三期**（触发条件：面板里选 CrazyGames/Playables 配置的项目数达到 30 个）：CrazyGames 链路；英文门槛模块（原 P2-09）；来源与授权账本。

**扩展点与宿主改动**
- 今天能做：原生命令（`build: "web"`、`timeoutSeconds`、`changesFiles: false`）、`project.publish` 和 `game.more` 命令位、面板、`capabilities.composer`。
- 宿主改动：MVP 不需要。H11（插件保活，带上限）、H4（第二期音频）、H5（第三期门户）、H6（联机真机测试）。

**第一个 PR 范围（拆成两个）**
- **PR-A：扫描和平台配置**
  - 新目录 `plugins/launch-check/`：manifest `id: ohmygame/launch-check`，`appliesTo: ["web-game","general"]`，`capabilities: { native, composer, "project.files": "read" }`；`commands`：`scan`（原生，`build: "web"`，`changesFiles: false`，槽位 `project.publish`）、`open`（`openPanel`）；`panels: [launch]`（`opens: "onRequest"`）。
  - `src/scan/`（入口解析、import 图、预算比对）、`src/profiles.json`（每个数字带 `source` 和 `checkedAt`）、`panel/`（只有报告视图）、`locales/`、`README.md`。
  - 测试：`scan.test.ts`（Vite 风格、有懒加载块、含绝对路径、含 Google Fonts 链接、含未引用素材五个夹具构建）；`profiles.test.ts`（每个预算数字都有 `source` 和 `checkedAt`）；`plugin.test.ts`。
- **PR-B：局域网真机**
  - 加 `lan.start` 命令（原生，`build: "web"`，`timeoutSeconds: 3600`，槽位 `game.more` 和 `project.publish`）、`src/lan/server.ts`、`overlay/overlay.js`、面板的二维码视图（二维码库随包）。
  - 测试：`lan.test.ts`（能托管；只在副本里注入浮层；取消信号到来时关闭端口；`progress` 文字里带 `lan-url:`）；`panel-lan.test.ts`（happy-dom：从 `progress` 事件文字解析地址并生成二维码）。
- 都不在第一批：一键优化、静态规则、Game Tests 模板、门户。

**验证计划与判负条件（2–4 周）**
- **扫描**：对 30 个 OhMyGame 网页游戏（官方示例、内部项目、愿意参加的用户项目）跑扫描，人工复核每条发现。
  - 记录：误报率；至少有一条真实问题的项目比例；单次扫描耗时（不含构建，目标 <30 秒）。
  - **判负 1**：误报率 >25% → 停下修规则，修完仍 >25% 就不发布 PR-A。
  - **判负 2**：有真实问题的项目 <15%（30 个里少于 5 个）→ 扫描价值低，第二期的一键优化不做，扫描只作为发布对话框旁的一个按钮保留。
- **真机**：10 位用户，每人用自己的 iPhone 和安卓机各测一次（约 20 个会话）。
  - 记录：连接成功率（被防火墙拦、访客 Wi-Fi 隔离都算失败）；发现了桌面预览没发现的问题（音频没响、按钮越界、帧率低于 30、报错）的会话比例。
  - **判负 3**：连接成功率 <60% → 局域网路径不可用，PR-B 改成"生成 Game Tests 移动端用例 + 说明怎么用手机打开社区发布版"。
  - **判负 4**：发现新问题的会话 <10%（20 个里少于 2 个）→ 真机测试没有增量，PR-B 不合并，第二期不做。
- **第三期信号**：记录选了门户配置的项目数，到 30 个再立项门户链路。

**风险与最弱点**
- **最弱点**：门户部分的受众未知（E111 的反证），所以放到第三期，靠使用信号决定。
- 局域网连不上（公司网、访客网络隔离、防火墙）。
- 静态扫描对动态加载（字符串拼路径）会漏，报告标出"无法静态判定"的部分。

---

### P4-03 真人试玩回路（playtest-loop）· 谱系：P1-03（73）→ P2-03（75）→ P3-03（77）→ P4-03 · 独立插件

**本代修改（条件逐条落实，对应第 3 代评审第 6 节第 3 条）**

| 条件 | 落实方式 | 依据 |
|---|---|---|
| 1. 探针按网址参数启用，不追踪普通玩家 | 探针只在网址带 `?pt=<轮次号>` **并且**轮次号和 `public/playtest.json` 里的一致时才启用；没有参数时什么都不做：不弹同意提示、不发任何请求、不写存储。招募帖里给的是带参数的链接 | F13 实测：网站页 `…/g/<name>?pt=3` 会把 `?pt=3` 原样传进游戏 iframe；直接访问播放域也能带参数 |
| 2. manifest 加 `capabilities.secrets` | `readToken` 声明为密钥字段，`capabilities` 里加 `secrets` | F15；`docs/plugins.md:439,748` |
| 3. 现场局域网收集（路径 A）移出 MVP | 移到第二期，而且只在 H11 落地或者 P4-02 的局域网服务器验证可用之后做 | 评审：亲友大多也是拿链接远程玩，当面玩时作者直接看着就行 |
| 4. 提 H13 | H13 和 H1 一起提（见第 5 节），H13 里同时写上"网站页把网址参数传进游戏 iframe" | E116、F13 |
| 第一个 PR 收窄 | 只做探针、Apps Script 模板、拉取和聚合、只有漏斗视图的面板；反馈聚类、Worker 模板放第二个 PR | 评审第 6 点 |
| 补"招来的人真的打开了吗"指标 | 加入验证计划 | 评审第 6 点 |

做完这些后，第 3 代评审列的四个条件都没有剩下的了。

**用户与场景**
- 游戏已经能玩、想知道陌生人玩起来怎样的个人开发者。
- 现在的做法：发链接给亲友，收到几句"挺好玩"；不知道多少人加载完就走、卡在哪里。还有不少人根本找不到外人来玩。

**证据**
- E21（强，论文，n=13 定性）：招募、记录、分析、处理反馈都难；翻"2–3 days' worth of Discord messages"很耗时。E22（强，n=10）：受测试者数量和代表性限制。
- E24（中，定量）：GMTK 2024 作品评分中位数 14；LD58 约 19% 的作品不足 5 个评分。
- E26（强，官方）：Poki 上传后几分钟内给 10–20 段真人录像，只对 Poki 流程内的游戏开放。
- E111（中，原 N1）：亲友 60.4%，"找不到人试玩" 17.4%，招募工具 1.1%，21.0% 做完才第一次给外人玩。**反证**：开放题里主动提试玩的只有 0.3–1.4%。
- E116（中，原 F13，实测）：社区发布版今天能向外部地址发请求。
- E13（强）：论文作者建议多试玩。

**已核对的已有能力与增量**
- 社区：浏览数（"do not establish that the game finished loading or a human played it"，`docs/runtime.md:1391-1392`）、点赞、评论（写评论要账号，网站上只读，`docs/runtime.md:1332-1340`）。
- SDK 访客成绩不公开（`game-data-routes.ts:183-188`），网站 iframe 里 `signIn()` 会以 `cancelled` 失败，"访客 + 排行榜计数"走不通。
- 游戏 SDK 没有埋点模块；web-game-studio `game-playtest`、game-studio `game-qa` 是 AI 在玩；CCGS `playtest-report` 只整理人写的笔记。
- **增量**：真人会话的漏斗、退出点、无偏问卷，接到 Agent 修复。

**数据回收方案**

| 路径 | 今天能做吗 | MVP | 说明 |
|---|---|---|---|
| B. 作者自备收集端点 | 能（E116、F13） | **是** | 插件设置里填一个 HTTPS 地址和一个只读令牌（密钥）。附 Google Apps Script 模板（追加到表格，`doGet` 凭令牌返回 JSON）。探针用 `navigator.sendBeacon` 发 `text/plain`，不触发 CORS 预检；插件原生代码按令牌拉回数据（F15） |
| A. 现场局域网收集 | 能，但要占着一个长命令 | 否（第二期） | 见上表条件 3 |
| C. 宿主 H1 | 需宿主 | 否 | Cloud 的试玩事件收集接口（同意文案、保留期、只有作者能读）+ 网站游戏页能写反馈 + 访客漏斗计数对作者可见。这是长期正路，B 是过渡 |
| ✗ 社区评论贴码、访客排行榜计数 | 不能 | — | 写评论要账号；访客成绩不公开 |

**MVP**
1. **试玩探针**（约 3 KB 的 `probe.js`，Agent 按 skill 接进游戏）：
   - **启用条件**：`new URLSearchParams(location.search).get("pt")` 存在，且等于 `public/playtest.json` 里的 `round`。两者缺一，探针完全不运行。
   - 启用后：首屏同意提示（不同意只记匿名漏斗：加载完成、首次输入、退出，不记 `track()` 事件和报错文字）；同意后记录加载进度、首次输入、`track(name)` 事件、报错、退出位置（`pagehide` 加 `sendBeacon`）、时长。
   - 匿名随机会话号，不收集任何个人信息；单条载荷控制在 `sendBeacon` 的大小限制内。
   - 一轮结束，命令 `round.end` 删掉 `public/playtest.json`；即使没删，没带参数的普通玩家也不会被追踪。
2. **结束问卷**：2–3 个按 E21 原则写的问题（"你最后在做什么？""哪一刻想退出？"），不问"好不好玩"。
3. **拉取与聚合**：原生命令 `round.fetch` 凭令牌从收集端点拉回本轮数据，聚合成漏斗、退出点、报错，写到插件数据目录。
4. **面板（只有漏斗视图）**：漏斗、退出点和死亡点、报错，每项标样本量；每个问题一键用 `composer.fill` 交给 Agent。
5. **招募**：一个按钮"生成招募帖"（`insert` 一段提示词，帖子里给的是带 `?pt=<轮次>` 的网站链接，写清测什么、玩多久、怎么反馈）。
- **第二期**：粘贴进来的 Discord、飞书消息用 `capabilities.models` 聚成"问题 → 提到人数 → 代表原话"；Cloudflare Worker + KV 模板；现场局域网收集。
- **隐私与政策**：README 写明"数据控制者是作者本人，插件只提供最小化的默认值"；写给试玩者的隐私说明由 skill 生成。今天能外发靠的是"没有 CSP"这个现状（E116），不是契约，所以和 H1、H13 一起向维护者确认社区条款。

**扩展点与宿主改动**
- 今天能做：skill（接探针）、原生命令（拉取端点数据）、插件设置和密钥（`collectorUrl`、`readToken`）、面板、`capabilities.composer`、`projectFiles: ["public/playtest.json"]`。
- 宿主改动：**H1**（长期正路）和 **H13**（把发布游戏的外部网络策略和"网址参数传进 iframe"写成文档）一起提。H2（求试玩标记和互评队列）可选。H11 只和第二期的现场收集有关。

**第一个 PR 范围**
- 新目录 `plugins/playtest-loop/`：
  - manifest：`id: ohmygame/playtest-loop`，`appliesTo: ["web-game","general"]`，`capabilities: { native, composer, secrets, "project.files": "write" }`，`projectFiles: ["public/playtest.json"]`，`configuration`：`collectorUrl`（字符串）、`readToken`（密钥）。（`models` 等到第二期的聚类再加。）
  - `contributes`：`skills`（`playtest-probe`：怎么接探针和 `track()`、隐私说明模板）；`commands`：`round.start`（写 `public/playtest.json`，生成轮次号）、`round.fetch`（原生）、`round.end`（删除配置文件）、`recruit`（`insert`）；`panels: [playtest]`。
  - `assets/probe.js`、`templates/apps-script.gs`、`src/aggregate.ts`（事件 → 漏斗）、`src/fetch.ts`、`panel/`、`locales/`、`README.md`。
- 测试 `test/playtest-loop/`：
  - `probe.test.ts`（happy-dom）：**没有 `?pt=` 时不发请求、不弹提示、不写存储**；`?pt=` 和配置轮次不一致时同样不运行；不同意时只发匿名漏斗；载荷不含个人信息字段；单条不超过大小限制；
  - `aggregate.test.ts`：事件序列 → 漏斗和退出点；
  - `fetch.test.ts`：用假的端点返回数据，令牌从密钥设置读取、不写进日志；
  - `plugin.test.ts`：声明了 `secrets`；`readToken` 是密钥字段。
- 不在第一个 PR：反馈聚类、Worker 模板、局域网收集、互评、视频片段、A/B。

**验证计划与判负条件（2–4 周）**
- 招 8–10 位创作者，每人跑一轮远程试玩（招募帖用带参数的链接）。
- 记录：
  1. 每轮收回的有效会话数（中位数）；
  2. **招来的人有多少真的打开了**：每轮 ≥10 个有效会话的轮次占比（这是"找不到人"在本插件上的直接检验，对照 E111 的 17.4%）；
  3. 端点配置的成功率和耗时；
  4. 来自报告、被 Agent 修掉的问题数；
  5. 探针在没有参数的访问里是否完全静默（抽查社区发布版的网络请求）。
- **判负**：
  - 会话中位数 <5 → 暂停插件，把数据作为 H1 优先级的证据交给维护者；
  - 每轮 ≥10 个会话的轮次 <30% → 插件解决不了"找不到人"，第二期的招募功能不做，只保留漏斗；
  - 15 分钟内配好端点的人 <50% → 路径 B 门槛过高，插件冻结在第一个 PR，等 H1；
  - 第 5 项抽查发现没有参数时也有请求 → 视为隐私缺陷，修好之前不发布。

**风险与最弱点**
- **最弱点：远程回收要作者自己配端点**，门槛高。
- 能外发靠的是 Cloud 没有 CSP 的现状（E116），Cloud 以后加了 CSP，路径 B 会坏。H13 就是为了把这一点变成写明的规则。
- 开发者很少主动提试玩（E111 反证），可能"知道该做但不做"。
- 隐私合规：作者是数据控制者，插件只能提供最小化的默认值和说明文字。

---

### P4-04 小游戏激励视频与提审 —— **Skill 扩展**（wechat-minigame、douyin-minigame）· 谱系：P1-13（66）→ P2-07（67）→ P3-05（70）→ P4-04

**本代修改（条件逐条落实，对应第 3 代评审第 6 节第 5 条）**

| 条件 | 落实方式 |
|---|---|
| 1. 写判负条件 | 夹具 A/B：加载 skill 组满足全部规则的比例，比对照组高不到 20 个百分点，就不合并（见验证计划） |
| 2. 核对抖音 `isEnded` | **已核对**（F14）：语义和微信相同（true = 看完后关闭）；另有 `count` 字段（支持多例的版本上返回）。`tt` 适配按 `count` 优先、`isEnded` 兜底来判断发奖 |
| 3. `size-check` 排除引擎插件、按分包统计、说明开发者工具也会报 | 见 MVP 第 3 条 |
| 4. 记录受众信号 | 向维护者要两个小游戏插件的安装和启用数（如果有），写进验证记录 |
| 招不到真实用户 | 改用 Cocos 夹具项目跑 A/B，可重复、不依赖招募 |

**用户与场景**
- 在 OhMyGame 里用 Cocos Creator（或 Unity）的 `general` 项目做微信、抖音 IAA 小游戏的国内小团队。
- 要接激励视频、控制主包大小；第一次提审常因发奖时机、录屏异常、残留 SDK 被驳回。

**证据**
- E72（强）：小程序游戏 535.35 亿元，广告变现占 31.89%。E74（强\*）：开发者超 50 万，八成以上 30 人以下；IAA 月活 4 亿。E76（强\*）：IAA 分成合计最高约 90%。
- E112（强，原 N2）：激励视频必须检查 `res.isEnded` 才能发奖；每人每天次数有限；拉取失败要 `load()` 重试；1004 走兜底分享页。证明的是规则存在，没有驳回率。
- E82（强，官方）：主包 4 MB、总计 30 MB（E82 也写了"Cocos 运行时以插件形式内置，不占 4 MB"，是第三方说法）。E83（强/弱）：抖音验收指南列出录屏异常、登录失败、支付异常；残留支付 SDK 被拒的案例。
- E114（原 N8）：软著鉴别材料格式固定，已有开源工具，所以第三期不做生成。
- **受众限制**：OhMyGame 里能用上的只有 Cocos/Unity 路线的 `general` 项目，人数未知。

**已核对的已有能力与增量**
- wechat-minigame `SKILL.md:12-24`：只管导出、开发者工具、上传，"Check package-size limits … against the current official docs"一句话，不测量；没有广告、分享、录屏、提审。douyin-minigame 同。两个插件的 `contributes` 只有 `skills`。
- cocos-creator skill：构建 `web-mobile` 或小游戏；"a successful build proves packaging only"。
- 微信开发者工具在预览和上传时会检查、报告主包大小，也有"代码依赖分析"。`size-check` 的增量只是"更早知道"和"建议把哪些目录移进分包"，**skill 里照实写明这一点**。
- 游戏 SDK 不是小游戏 API；`game_use` 进不了平台运行时。
- **增量**：激励视频的正确接法和自查清单；主包预算的测量脚本。

**MVP（只做激励视频 + 主包预算）**
1. `wechat-minigame/skills/minigame-rewarded-ad/SKILL.md`（douyin 插件里放同一份的 `tt` 版本）：
   - 什么时候预拉取、失败怎么 `load()` 重试、拉取成功后才显示按钮、只在看完时发奖、当天次数用完时隐藏按钮、广告期间暂停和静音、`onClose` 只注册一次（全局单例）。
   - 自查清单（6 条规则）：① 发奖只在"看完"分支里；② 拉取失败会 `load()` 重试；③ 次数用完返回不可用并隐藏按钮；④ 广告期间暂停游戏；⑤ 广告期间静音；⑥ `onClose`/`onError` 只注册一次。
2. `reference/rewarded.ts`：`wx` 和 `tt` 两套适配，统一成 `rewarded(placement) → granted | closed | unavailable`：
   - `wx`：`res && res.isEnded` 为真才算 `granted`（基础库 <2.1.0 时 `res` 为 undefined，按官方说明视为看完）；
   - `tt`：`typeof res.count === "number"` 时以 `count > 0` 判断（多例时返回看完次数，奖励倍数交给调用方）；否则以 `res.isEnded` 判断（F14）；
   - 浏览器（`web-mobile` 预览）里换成可切换结果的模拟实现。
3. `reference/size-check.mjs`：
   - 读微信 `game.json`（或抖音输出里的同名配置）的 `subpackages` 和 `plugins` 字段；
   - **引擎插件**（`plugins` 里声明的引擎，例如 Cocos 引擎以插件方式加载时）对应的文件不计入主包，单独列为"引擎插件，不占主包"；
   - 按主包、每个分包分别统计，对照主包 4 MB、总计 30 MB，列出主包里最大的资源和建议移进分包的目录（只建议，不改配置）；
   - 输出第一行写明"微信开发者工具在预览和上传时也会报告包体大小，以它为准；本脚本用于构建后马上知道、以及给分包建议"。
   - wechat skill 现有的那句"Check package-size limits"改为指向这个脚本。
- **第二期**：分享（`shareAppMessage`）、抖音录屏分享的封装（`getGameRecorderManager`）、插屏最小间隔。
- **第三期**：提审前扫描（残留支付、广告、统计 SDK）和资质清单（每条附来源和核对日期，标"不构成法律意见"）。软著材料不做生成，只给格式要点（E114）和开源工具链接。

**扩展点与宿主改动**
- 今天能做：skill 文件夹（含参考文件），Agent 用自己的 shell 跑 `size-check.mjs`。
- 宿主改动：不需要。H9 是方向性决定，单独列在第 5 节；H9 落地后可以考虑升级为插件（加模拟广告层的运行时检查）。

**第一个 PR 范围**
- `plugins/wechat-minigame/skills/minigame-rewarded-ad/`：`SKILL.md`、`reference/rewarded.ts`、`reference/size-check.mjs`。
- `plugins/douyin-minigame/skills/minigame-rewarded-ad/`：同上的 `tt` 版本。
- 两个插件现有 `SKILL.md` 各加一行指向新 skill；`locales` 和 `README.md` 更新。
- 测试：
  - `test/minigame-skills/rewarded.test.ts`（假的 `wx` 和 `tt` 对象）：中途关闭不发奖；拉取失败后重试；次数用完返回 `unavailable`；`tt` 返回 `count: 2` 时判为看完、`count: 0` 时不发奖、没有 `count` 时按 `isEnded`；`wx` 的 `res` 为 undefined 时按旧基础库处理；
  - `size-check.test.ts`：夹具目录主包超出 4 MB 时报告正确；`plugins` 里声明的引擎目录不计入主包；分包分别统计；
  - 现有 `test/official.test.ts` 的 skill 格式检查覆盖新 skill。

**验证计划与判负条件（1–2 周）**
- **夹具 A/B**（可重复，不依赖招募）：准备一个 Cocos 小游戏夹具项目（一个关卡、一个"看广告复活"按钮的占位），同一段提示"接入激励视频复活"，让 Agent 在"加载 skill"和"不加载 skill"两种条件下各跑 10 次（两种条件用同一个模型和 Agent）。
  - 判定：每次运行的结果代码放进上面那组假 `wx`/`tt` 测试，6 条规则逐条判定，"全部满足"才算通过。
  - **判负**：加载 skill 组的通过率比对照组高不到 20 个百分点（例如对照组本来就有 8/10，模型已经会了）→ **不合并**，只把 `size-check.mjs` 作为一个小 PR 提交。
  - 通过：高 ≥20 个百分点 → 合并。
- **辅助信号**（不作去留依据）：两个小游戏插件的安装和启用数；如果有用户愿意回填首次提审结果，记录下来，只看方向。

**风险与最弱点**
- **最弱点：OhMyGame 里的受众窄**，国内大盘子（E74）大部分在 OhMyGame 之外。
- 真机和平台运行时测不了，只能靠 Agent 自查和用户真机预览。
- 抖音 `count` 的"统一用它判断"一句只从接口页的搜索摘要读到（页面是前端渲染），指南原文只写了"支持多例的版本返回"。适配按"有 `count` 就用，没有就用 `isEnded`"处理，两种读法下都不会误发奖。

---

### P4-05 种子批量验证台（seed-lab）· 谱系：P1-02（58）→ P2-06（68）→ P3-04（65，重定位）→ P4-05 · 独立插件

**本代修改（条件逐条落实，对应第 3 代评审第 6 节第 4 条）**

| 条件 | 落实方式 | 依据 |
|---|---|---|
| 1. 打包方案改掉，并实测 | **不再按"rolldown → esbuild → esbuild-wasm"的顺序探测**，改为一条路径：**插件自带 esbuild-wasm 0.28.2**。理由见下 | F9–F11 实测 |
| 2. 验证加"Agent 自写统计脚本 + 单元测试"基线组 | 见验证计划第 2 步，基线组用 CCGS scaffold 自带的 vitest | F9 |
| 3. 狗粮 4 周内不到位就换外部样本 | 写定替代方案和挑选标准 | — |
| 第一个 PR 拆成三个 | PR-1 打包、线程池、统计；PR-2 一致性核对和看板；PR-3 导出关卡曲线 | 评审第 6 点 |

**为什么选"自带 esbuild-wasm"一条路径**（实测，F10）
- **项目自带的 rolldown 能用**（0.15 秒），但它是 1.x 版本、API 还在变；每个项目的版本不同；原生绑定 `@rolldown/binding-<平台>` 要在 Electron 43 的 `ELECTRON_RUN_AS_NODE` 下加载，没有实测；Vite ≤7 的老项目又没有它。为一个 0.2 秒的步骤维护三条路径不值得。
- **Node 自带的去类型不能用**：`enum` 和不带扩展名的 import（Vite 项目的常见写法）都会报错。
- **esbuild-wasm**：一份确定的版本，纯 wasm，不依赖平台；能读 `tsconfig.json` 的 `paths`；实测 0.36 秒；`esbuild.wasm` gzip 后约 3.8 MB，在 50 MiB 的包限额内（F11）。照 `scripts/build-computer-use.mjs` 的先例，用 `bundleDependencies` 带上，并生成 `THIRD_PARTY_LICENSES.md`（esbuild 是 MIT）。
- 如果宿主以后开放自带的 esbuild（H15，F12），插件可以去掉这 14 MB，接口不变。
- 打包只在主线程做一次，产物是单个 `.mjs`；`worker_threads` 里只 import 产物，不再碰打包器。

**用户与场景**
- 做程序生成关卡和规则驱动游戏的人：出口类、排序类、画线类、消除类益智，回合规则游戏，放置经济。
- Agent 改完生成器说"关卡都能过"，但没人知道 1 万个种子里有多少是死局、难度怎么分布、哪些种子该当第 1 关。

**证据**
- E79（中）：IAA 收入 Top100 中 80% 以上是休闲益智；消除类在投超 6000 款。这是品类数据，能推出"做程序生成关卡的人不少"，推不出"这些人苦于死局"。
- E27（强，论文）：balance 是问答站平均浏览最高、得分最高的标签之一。
- E36（弱，厂商）：47% 用 AI 做试玩与平衡，38% 用 agent 做动态平衡。
- E41（弱，轶事）：截图式测试测不准实时游戏；有开发者改用无头蒙特卡洛模拟；Agent 常误报"works perfectly"。它同时说明"不用插件也能自己写脚本"，所以验证计划必须有基线组。
- E13（强）：Game design complexity 23 次、Lack of fun 27 次。
- 游戏线需求：第 3 代游戏线的 G3-01、G3-02、G3-07 都把它列为核心缺口。这是本项目内部需求，**不加分**。
- **证据空白**：没有"死局或难度曲线差导致流失"的定量数据。

**已核对的已有能力与增量**
- 测试桥：插件会话能用 `setSeed`、`reset`、`step` 和 `snapshot`；但每个项目最多 4 个游戏窗口、一次最多 20 个动作，跑上万个种子太慢。
- Game Tests：`seed` 字段跑单个种子；单元测试能写"1 万个种子全部可解"这种断言，结果只有通过或失败。
- CCGS scaffold 自带 vitest（F9），Agent 今天就能写统计脚本。game-foundations skill 第 26 行要求"inspect ranges and failure cases, not just averages"。
- SDK `simulateRoom`：多人规则的确定性测试底座，没有批量统计。CCGS `balance-check`：静态读公式，不跑。Tune：单值实时调，无预设、无统计。
- **增量（相对"Agent 自写脚本"真正独有的三样）**：
  1. **一致性核对**：抽样种子经真实游戏窗口跑一遍，确认纯逻辑模块和游戏里的实际逻辑一致；
  2. **看板**（分布、分桶、异常种子，点一个种子看截图）；
  3. **导出关卡曲线**。
  批量运行本身是底座，不算独有。

**"模拟约定"（skill 教给 Agent）**
- 项目里有一个不依赖 DOM 的纯模块 `sim/index.ts`，导出 `generate(seed, params)` → 关卡、`evaluate(level, params)` → `{ solvable, metrics }`；规则和经济类游戏导出 `play(seed, policy, params)` → 指标。
- 游戏本身 import 同一个模块；测试桥 `snapshot()` 返回 `levelHash`，供一致性核对。

**MVP**
1. **skill `seed-lab`**：模拟约定、怎么把生成器和求解器从渲染里拆出来、`levelHash` 的写法；instructions 写"改了生成器之后先跑 `seedlab_run`，不要在没跑的情况下声称关卡都可解"。
2. **批量运行**（Agent 工具 `seedlab_run` + 面板按钮）：用自带的 esbuild-wasm 把 `sim/index.ts` 打成单文件；`worker_threads` 池（核数 −1）跑指定种子范围，每个种子有超时；结果写 `seedlab/runs/<id>.jsonl` 和一份摘要，工具把摘要以文字返回给 Agent。
3. **看板面板**：可解率、各指标直方图、按难度分桶、异常种子列表（超时、不可解、指标极端）；点一个种子，用插件会话 `act([setSeed, reset])` 后 `capture`，截图显示在面板里。
4. **一致性核对**：抽 20 个种子经真实游戏窗口跑，比较 `snapshot().levelHash` 和 Node 结果，不一致就标红。
5. **导出关卡曲线**：按难度分桶挑种子，写 `levels/curve.json`（插件写入，可撤销）。
- **第二期**：变体比较和人盲玩切换（`seedlab/variants.json` + `tuning.json` 里单个 `variant` 数值项，第 3 代已解决 tuning.json 的三个问题）；多人规则机器人；放置经济曲线。

**扩展点与宿主改动**
- 今天能做：原生代码（自带 esbuild-wasm、`worker_threads`）、Agent 工具（`timeoutSeconds` 最长 3600）、`capabilities.game`（`open`、`act` 的 `bridge`、`capture`）、面板、`projectFiles`、skill、instructions。
- 宿主改动：**不需要**。可选 H15（开放宿主自带的 esbuild，省掉 14 MB）、H12（Tune 离散选项，第二期用）。

**第一个 PR 范围（拆成三个）**
- **PR-1：打包、线程池、统计**
  - 新目录 `plugins/seed-lab/`：manifest `id: ohmygame/seed-lab`，`appliesTo: ["web-game","general"]`，`capabilities: { native, "project.files": "write" }`，`projectFiles: ["seedlab/**"]`；`contributes`：`skills`（`seed-lab`）、`instructions`、`tools: [seedlab_run]`（`timeoutSeconds: 1800`）。
  - `src/index.ts`、`src/bundle.ts`（调用自带的 esbuild-wasm）、`src/pool.ts`、`src/worker.mjs`、`src/stats.ts`（直方图、分桶、异常）、`package.json`（`bundleDependencies: ["esbuild-wasm"]`）、`scripts/build-seed-lab.mjs`（照 `build-computer-use.mjs` 生成 `THIRD_PARTY_LICENSES.md`）、`locales/`、`README.md`。
  - 测试 `test/seed-lab/`：
    - 夹具 `fixtures/arrow-exit/`：5×5 出口类生成器和带记忆化的深度优先求解器，用了 `enum` 和不带扩展名的 import（就是 F10 里会让 Node 去类型失败的写法），故意让少数种子不可解；
    - `bundle.test.ts`：夹具能打包、能 import；**在 Electron 43 的 `ELECTRON_RUN_AS_NODE` 下也跑一遍**（仓库已有 Electron 时）；
    - `pool.test.ts`：同样的种子两次运行结果一致；单个种子超时被记为异常，不拖垮整批；
    - `stats.test.ts`：分桶边界、异常判定；
    - `package-size.test.ts`：打包后的插件压缩包 <50 MiB。
- **PR-2：一致性核对和看板**：加 `capabilities.game`、`composer`，`commands`：`run`、`parity`、`open`（槽位 `game.more`）；`panels: [dashboard]`；`src/parity.ts`、`panel/`；测试 `parity.test.ts`（模拟游戏会话返回不同的 `levelHash`，报告标红）。
- **PR-3：导出关卡曲线**：`export` 命令（`changesFiles: true`），`projectFiles` 加 `levels/curve.json`；测试分桶挑种子的结果稳定。

**验证计划与判负条件（2–4 周）**
1. **样本**：
   - 首选游戏线的网页原型（G3-01、G3-02 等）。
   - **替代方案（第 4 周还没有原型就启用）**：PR-1 里的出口类夹具，加一个外部开源益智生成器。挑选标准：MIT/Apache 许可；有现成的生成器和求解器（JS/TS，或能直接改写成 `sim/` 模块）；能在网页里玩。这样的外部样本也顺便检验"不是我们自己写的生成器能不能拆出 `sim/`"。
2. **和基线比（证伪"插件是否必要"）**：
   - **基线组**：同一个项目、同一个模型和 Agent，加载 game-foundations / web-game-studio skill 和 Game Tests；提示"改完生成器后确认关卡都可解，并给出难度分布"。Agent 自己写统计脚本，用 vitest 或单元测试跑。
   - **插件组**：同样的提示，开着 seed-lab。
   - **任务**：6 个"改生成器"的任务（2 个样本项目 × 3 个任务），每个任务里埋三类问题：约 3% 的种子不可解、少数退化种子（一步可解或指标极端）、一处模拟和游戏不一致（游戏里多了一条规则）。每组每个任务跑 2 次，共 24 次。
   - **记录**：三类埋入问题各被发现的比例；从"改完生成器"到"拿到难度曲线"的耗时；是否产出了能被游戏读取的关卡曲线文件。
   - **判负**：插件组同时满足下面两条 → 降为 skill（模拟约定 + vitest 统计脚本模板，交给 Game Tests 的单元测试去跑），不做插件：
     - 埋入问题的总发现率比基线高不到 25 个百分点；
     - 拿到难度曲线的中位耗时没有比基线少一半以上。
   - "模拟和游戏不一致"是插件独有的一致性核对要证明的东西：如果基线组也能以相同比例抓到它，一致性核对就没有增量，PR-2 只保留看板。
3. **采用率**：Agent 按约定拆出 `sim/` 模块、不需要大改结构的比例。**判负**：<50% → 降为 skill。
4. **性能**：7×9 棋盘 1 万个种子，普通笔记本 2 分钟内跑完。做不到就先修，不作去留依据。

**风险与最弱点**
- **最弱点：外部需求证据都是间接的**（E79、E27、E36 是数据但不直接，E41 是轶事），而且 E41 本身说明 Agent 自己写脚本也能做。基线组就是为了在这一点上证伪。
- 只适合逻辑能和渲染分开的游戏，物理和实时动作游戏不适用。
- 自带 esbuild-wasm 让插件包大约多 4 MB（压缩后）；没有在 Electron 下实测，PR-1 的测试要补上。

---

## 3. 不再出现在插件线的

| 想法 | 去处 | 理由 |
|---|---|---|
| E3-1 交付质量门基准 | 交给 Game Tests 维护者作为预先登记的实验；补上评审要求的验收条目登记、真实任务抽样、多重查看校正 | 评审：实验设计通过，插件线不计入。约 120 Agent 小时，本代内跑不了 |
| 玩法片段（P2-05） | web-game-studio skill `promo-clip` | 第 3 代已淘汰插件形态 |
| Steam 上线节奏 | 见第 4 节 (c)，评分不够 | — |
| 同类游戏检索（P3-06） | 见第 4 节 (a)，评分不够；可以作为一个独立的小 skill PR 提交，不计入终选 | — |
| engine-reference 移植、音频接入检查等 | 第 3 代第 5 节已列去处，无变化 | — |

---

## 4. 第 6 个名额：三条路逐一评估

第 3 代评审只认三条正当的路，并要求"不许新编候选凑数"。下面按 RUBRIC 自己打分，标准是"大约达到其他终选的水平（≥65），并且有真实数据"。

### (a) P3-06 同类游戏检索：找外部数据

**本代检索了什么**
1. CrazyGames 因"不原创"驳回的比例：找到的只有官方 FAQ 的驳回理由列表（已是 E55），加上 Trustpilot 上几条"被以 not unique enough 驳回了四次"之类的抱怨。**没有比例数据**，第三方攻略站也只是转述 FAQ。
2. Steam 上"太相似"或克隆游戏的比例：没有找到任何研究。只有发行总量（已是 E1）、2017 年 Valve 下架 173 款资产翻版的单个事件、评论文章里"每 20 款只有 1 款是正经游戏"的观点。
3. 应用商店克隆的测量研究：PlayDrone（Viennot 等，SIGMETRICS 2014）估计 Google Play 约 25% 的应用内容是"类克隆"；对中国安卓市场的 IMC 2018 研究给出代码级克隆约 20%。但这些测的是**所有类型的应用**，而且是代码层面的**故意重打包**，不是"开发者不知道已有同类游戏，无意中做重了"。
4. 印尼开发者对"游戏克隆"看法的小调查（n=36）：测的是"被别人抄"的感受，不是本痛点；原文也取不到。

**结论**：找到的数据证明"克隆在应用商店里很常见"，**证明不了 P3-06 要解决的痛点**（开发者无意撞车，并因此被驳回或白做）是常见的。按 RUBRIC"没有证据支撑的维度最多 2 分"：

| 维度 | 分 | 理由 |
|---|---|---|
| 频率 | 2 | 没有"无意撞车"的外部频率数据；PlayDrone 的 25% 测的是故意重打包；E115 是内部样本 |
| 严重度 | 3 | 门户和黑客松会以不原创为由驳回（E55、E63，官方），后果明确；但只影响少数提交门户的人（E111：Poki 0.7%） |
| 证据 | 2 | 规则文本 + 内部样本 + 不对口的克隆测量 |
| 契合 | 4 | 就在概念阶段，用宿主的网页搜索 |
| 可行 | 5 | 只是 skill 文本 |
| 差异 | 3 | CCGS 已有 Comparable Titles 栏，Agent 本来就能搜 |
| **合计** | **58** | 10 + 12 + 8 + 12 + 10 + 6，和第 3 代评审一致 |

**不入选。**

### (b) E3-1 阶段 1 有结果

- 阶段 1 要 240 次 Agent 运行（每次 20–40 分钟）和约 48 人时的双盲判定。本代内跑不了，没有结果。
- 没有结果时，背后的"交付质量门"想法只有轶事（E41–E44），第 3 代评审给的是 62 分，证据维度 2 分。
- **不入选**，按第 3 节交给 Game Tests。

### (c) Steam 上线节奏 Skill 扩展（放进 web-game-studio 和 godot）

**内容设想**：商店页尽早上线（表现好的游戏商店页平均上线 214 天，差的 411 天，E5）、愿望单的分层和 7,000 个进入 Popular Upcoming 的门槛（E7）、Next Fest 只放大已有势能（E7、E8）、首周转化约 0.1–0.2×（E5、E6）；按 `ship.json` 的发布日倒推出一张时间表。

**已有能力**：CCGS 的 `launch-checklist`、`release-checklist` 已经按 `steam` 分支列出 Steamworks、商店页、Steam Deck 等条目，并有"Pre-purchase/wishlist campaigns active"一行；howtomarketagame 等公开指南免费可读。增量只是"按发布日倒推的时间表"。

| 维度 | 分 | 理由 |
|---|---|---|
| 频率 | 2 | E111：网页开发者只有 15.9% 发 Steam；E102 的 PC 83% 是全行业口径，不是 OhMyGame 用户 |
| 严重度 | 3 | Steam 中位收入几百美元（E3），预热期和首发口碑和表现相关（E5）；但只是相关，时间表能改变多少没有证据 |
| 证据 | 3 | E5–E7（中，第三方）+ E111（中）；有数据，但没有"按时间表做的人表现更好"的数据 |
| 契合 | 2 | 网页游戏上 Steam 要套 Electron，OhMyGame 没有这条路（E111 只有 16%，第 2 代 N7 路线走的人少）；营销主要在 OhMyGame 之外发生 |
| 可行 | 5 | 只是 skill 文本 |
| 差异 | 2 | CCGS launch-checklist 已覆盖 Steam 分支；公开指南免费 |
| **合计** | **54** | 10 + 12 + 12 + 6 + 10 + 4 |

比第 3 代评审预估的 55–62 还低一点，主要是契合度：OhMyGame 用户的主力项目类型到 Steam 中间还隔着一层套壳。**不入选。**

### 结论：插件线停在 5 个

- 三条路的最高分是 58 分，离 65 分差 7 分，而且差的都是"频率"和"证据"这两个靠数据的维度，不是靠改设计能补上的。
- GOAL 的"不做"写明"不为凑数量而产出"，PROCESS 的"防止跑偏"也要求分数必须有证据。硬凑第 6 个，等于把一个只有规则文本和内部样本的想法放进终选，违背 GOAL 的本意。
- **请协调者在 `FINAL.md` 里明确记录：插件线终选 5 个（4 个独立插件 + 1 个 Skill 扩展），低于 GOAL 的 6 个下限，原因是证据门槛，不是没有尝试。**
- P3-06 成本极低，可以作为一个不计入终选的小 skill PR 提交，验证方法用第 3 代评审给的非循环版本（另找一组人工确认的近邻，加"是否改变了决定"的指标），只在 `ship.json` 的目标平台是门户、jam 或小游戏时触发。

---

## 5. 宿主改动最终清单

### 5.1 方向性决定（单独列，不和改动一起排）

| # | 决定 | 影响 | 说明 |
|---|---|---|---|
| H9 | web-game（Phaser、Three.js）要不要有发微信/抖音小游戏的路线（适配层，或者把 Cocos/Laya 作为一等路线） | 插件线：P4-04 能否升级为带运行时检查的插件。游戏线：前几名多以微信/抖音 IAA 为主平台 | 影响面最大，但这是产品方向的取舍，不是一项具体改动。它依赖第三方适配层的成熟度（第 2 代 N6：Phaser 3 没有成熟方案）。H10（微信身份和关系链桥接）依赖它，**移到游戏线的清单** |

### 5.2 改动（按评审的排序，本代只补两项可选改动）

| 排名 | # | 改动 | 解锁什么 | 改动面 | 说明 |
|---|---|---|---|---|---|
| 1 | H1 | Cloud 试玩事件收集（同意文案、保留期、只有作者能读）+ 网站游戏页能写反馈 + 访客漏斗计数对作者可见 | P4-03 的正式回收路径（不再要作者配端点）；P4-01 的效果衡量 | 中 | 唯一同时解决隐私、同意和访客计数的办法 |
| 1 | H13 | 把发布游戏的外部网络策略写成文档：今天播放域没有 CSP、游戏可以向外部 HTTPS 地址发请求、网站页会把网址参数传进游戏 iframe；并说明社区条款是否允许游戏把数据发给作者自己的端点 | P4-03 的路径 B 和"按 `?pt=` 启用"从"现状"变成"规则"；所有用外部字体、CDN 的游戏 | 几乎为零（写文档） | 和 H1 一起提。E116、F13 |
| 3 | H4 | 向原生插件开放宿主的 ffmpeg 路径（宿主已认 `OHMYGAME_FFMPEG_PATH`，`ffmpeg-static` 已随应用分发） | P4-02 第二期音频转码；`promo-clip` skill 的剪辑 | 很小 | — |
| 4 | H3 | 钩子 notice 带"执行命令"按钮 | P4-01 的 Jam 提醒不用再主动打开面板 | 小 | 本代找到了今天能用的替代（F4：钩子打开面板、页面 `ui.confirm` 后运行命令），但它会主动打开一次面板，比带按钮的 notice 更打扰；而且用户不对话就收不到。所以保留在评审给的位置 |
| 5 | H11 | 插件保活接口（把宿主内部的 `hold()` 开放出来），**带上限**（例如最长 4 小时），并在 UI 上显示"某插件正在保持后台运行" | P4-02 超过 1 小时的真机会话；P4-03 第二期的现场收集 | 很小 | 不设上限，插件就能让宿主永远不停 |
| 6 | H6 | 多人后端的局域网监听开关 + 游戏会话的网络条件参数 | P4-02 的联机真机测试；游戏线网页多人候选 | 小 | — |
| 7 | H5 | SDK 构建时关闭云能力或换后端 | P4-02 第三期门户链路 | 小 | 等门户立项 |
| 8 | H8 | 只读的发布记录接口 | P4-01 第二期"可分享"一级 | 很小 | 可选 |
| 9 | H12 | Tune 支持离散选项（下拉） | P4-05 第二期变体选择 | 小 | 可选 |
| 10 | H2 | 社区"求试玩"标记和互评队列 | P4-03 招募规模化 | 中 | 需要反作弊设计 |
| 11 | H7 | `image.beforeGenerate` 可追加参考图 | 风格一致性（没有在活的候选） | 小 | 宿主独立需求 |
| 可选 | H14 | `project.toolbar` 命令支持动态标题或角标 | P4-01 在工具栏显示倒计时 | 很小 | 评审提出；低优先 |
| 可选 | H15 | **新**：向原生插件开放宿主自带的 esbuild（和 H4 同一类：应用已带 esbuild 0.28.2，并从 asar 解压出来，守护进程自己在用） | P4-05 可以不再自带约 14 MB 的 esbuild-wasm | 很小 | F12。今天有替代办法，所以排在最后 |
| — | 文档 | `runtime.md` 里"plugins … do not offer [actTogether]"和代码不一致 | 所有用 `actTogether` 的插件 | 零 | 文档 bug |
| — | 给 Game Tests 的建议（不是宿主改动） | 把最近一次运行的摘要写成项目文件；把 `runSummary` 第一行的格式写进 README，作为插件之间的约定 | P4-01 能读到人在面板里点的运行，并且解析规则有契约可依（F5） | 很小 | — |

**排序依据**：采用第 3 代评审的排序（H1 + H13 > H4 > H3 > H11 > H6 > H5 > H8 > H12 > H2 > H7），H9 单独列为方向决定，H10 移到游戏线。本代找到的代码事实（F4 的替代路径、F12 的自带 esbuild）没有强到要改变这个顺序，只补了 H15，并在 H3 一行写明了替代路径和它的不足。

---

## 6. 谱系表

| 第 4 代 | 来源 | 第 3 代评审分 | 本代修正要点 |
|---|---|---|---|
| P4-01 必发阶梯 | P3-01 ← P2-01 ← P1-14 | 84 | 倒计时只在面板；T−24h 提醒借 `turn.completed` 发 notice 并打开面板一次确认；"可启动"四种边界和回退检查；判负以"判定准确性"和"关掉插件 ≥50%"为准，提交率差只作描述；不吸收 P3-06 |
| P4-02 发布前检查 | P3-02 ← P2-02 + P2-09 ← P1-04、P1-05、P1-11 | 83 | 第一个 PR 拆成 A/B；四个数字判负条件；防火墙、http 链接、Agent 工作时不能构建 |
| P4-03 真人试玩回路 | P3-03 ← P2-03 ← P1-03 | 77 | `?pt=` 门控（实测网站会传参数）；`secrets`；路径 A 移到第二期；第一个 PR 收窄；H1 + H13 |
| P4-04 小游戏激励视频与提审（Skill 扩展） | P3-05 ← P2-07 ← P1-13 | 70 | 抖音 `isEnded`/`count` 已核对；夹具 A/B 和 20 个百分点判负；`size-check` 排除引擎插件、按分包统计 |
| P4-05 种子批量验证台 | P3-04 ← P2-06 ← P1-02 | 65 | 实测后改为自带 esbuild-wasm 一条路径；基线组；狗粮替代；PR 拆三个 |
| — | P3-06 | 58 | 外部数据没找到，不入选；可作为不计入终选的小 skill PR |
| — | E3-1 | （62） | 交给 Game Tests |

---

## 7. 覆盖表（终选 5 个对 EVIDENCE 高频痛点索引）

| # | 痛点 | 覆盖 |
|---|---|---|
| 1 | 发现性与营销 | 不覆盖（主体不能工具化；Steam 上线节奏评分不够，见第 4 节） |
| 2 | 做不完 | P4-01 |
| 3 | 设计愿景不清、不好玩 | P4-03（真人数据）、P4-05（批量模拟，不判断好玩） |
| 4 | 试玩难 | P4-03 |
| 5 | Agent 测不了、误报完成 | P4-05 的一致性核对和"没跑不许声称可解"；E3-1 交给 Game Tests |
| 6 | 包体和加载 | P4-02、P4-04 |
| 7 | 多门户、多平台合规 | P4-02（第三期）、P4-04 |
| 8 | 移动端浏览器的坑 | P4-02（真机） |
| 9–10 | 美术音频、素材一致性 | 不做插件（宿主和服务商已覆盖；H7） |
| 11 | 技术硬骨头（UI 缩放） | P4-02 第二期移动端用例 |
| 12 | 多人联机 | H6；Game Tests |
| 13 | 代码腐化、版本混淆 | 降为 skill（engine-reference 移植） |
| 14 | AI 声誉、披露、版权 | P4-02 第三期来源账本 |
| 15 | 变现低 | P4-04（IAA 接对） |
| 16 | 国内资质 + 买量素材 | P4-04 第三期清单 |
| 17 | 工具迁移 | 不覆盖 |

---

## 8. 生成者自评：哪里最容易被攻击

- **数量**：5 个，低于 GOAL 的 6 个。我认为这是证据撑得住的数量；第 4 节给了三条路的分数和检索记录。
- **P4-01 的提醒会主动打开面板**：这是在没有 H3 的前提下唯一能"一次确认就执行"的办法。如果评审认为这太打扰，退路是只发 notice（设置里已经能关）。
- **P4-03 依赖两个"现状"**：播放域没有 CSP、网站页会传网址参数。两者都是实测（E116、F13），都没有文档保证，所以 H13 和 H1 一起提。
- **P4-04 抖音 `count` 的那一句**只从搜索摘要读到；适配写法在两种读法下都不会误发奖。
- **P4-05 的打包没有在 Electron 下实测**，只在 Node 22 下实测；esbuild-wasm 是纯 wasm，风险比原生绑定小，PR-1 的测试会补上。
- **P4-05 的证据仍然是间接的**，它是 5 个终选里最弱的一个（65 分）；验证计划的基线组就是为了在 2–4 周内把它证伪或证实。
