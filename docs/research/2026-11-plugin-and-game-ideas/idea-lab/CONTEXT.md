# OhMyGame 现状（核对于 2026-11-24，dev / beta.5.11）

OhMyGame 是开源的 AI 做游戏工作室（桌面应用）：在对话里描述游戏，Agent 写设计文档、生成美术和音频、写代码、在实时预览里亲自试玩，再发布成一个链接（社区页）。主要项目类型：网页游戏（Phaser、Three.js、React Three Fiber）、互动故事、General（任意引擎）、Godot、TapTap Maker。可以接 Claude Code、Codex、OpenCode 或 40 多家模型服务商。

## 已经内置的（不要重复做）

- Agent 试玩：`game_use` 用真实输入和截图玩网页游戏，可录屏（最长 60 秒）、多人同时操作、断网重连测试；可选的游戏测试桥 `__OHMYGAME_PLAYTEST__`（snapshot / reset / setSeed / step）。
- 调参面板（Tune）：`tuning.json` 里的数值在运行中实时调。
- 素材画布（Asset Canvas）：图片、视频、3D、音频、文本节点，可重跑生成链、批量运行；专用去背景。
- Library：本地素材库，插件可加"来源"标签页。
- 发布：发布到 OhMyGame 社区（链接即玩，PNG 无损压缩、去 EXIF），封面。
- 游戏 SDK：登录、云存档、排行榜、多人房间（邀请码、快速匹配、重连）。
- 内置浏览器面板、网页搜索、检查点和撤销、Git 工作区、Agent 通知、后台运行。

## 已有的官方插件（36 个，全是 Beta）

- 引擎：godot、unity、unreal-engine、cocos-creator
- 平台：wechat-minigame、douyin-minigame、taptap（H5 上传）、taptap-maker
- 外部工具：blender、aseprite、tiled、level-editor（Tiled JSON 关卡面板）
- 工作流 Skill：game-studio（game-foundations / game-qa）、web-game-studio（playtest、tuning、UI、Phaser、R3F、Three、sprite pipeline、3D asset pipeline）、claude-code-game-studios（项目模板）
- 媒体服务商：fal、seedance、minimax、pixellab、meshy、tripo、elevenlabs、fish-audio、doubao-voice、comfyui、gpt-sovits
- 语言模型服务商：siliconflow-cn、modelscope、command-code
- ACP agent：gemini-cli、codebuddy-code、antigravity-cli、command-code
- Library 来源：sketchfab、pixel-sprites
- 集成：feishu（聊天机器人）、computer-use
- 进行中：Game Tests（脚本化回归测试，多人、断网、单元测试面板，PR 未合并）；pixelfx（像素特效与音效工作台移植，计划中）；game-icons、Openverse 来源（分支未合并）

## 插件能做什么（API 2.37）

- **Skill、instructions**：教 Agent 做事。
- **工具 / 命令 / 原生代码**：Node 代码在扩展宿主里运行，完全信任；可起进程、联网（声明主机）。命令可放在 Composer、项目菜单、工具栏、发布菜单、游戏面板 ⋯、画布右键等位置。
- **面板**：沙盒 iframe 页面，读写项目文件，可 `net.fetch` 声明的主机，可加入 Library，可导入项目里的 JS 模块（`ui.projectModules`），可用面板内 AI 助手（用户的模型 + 插件工具）。
- **模型**：`capabilities.models`，用用户配置的语言模型（支持图片输入），每插件 30 次/分钟、3 并发。**不能直接调用图片/音频/视频生成模型**（宿主未开放，只能经 Agent 或画布节点）。
- **游戏**：`capabilities.game`，原生代码像 Agent 一样打开、操作、截图、录屏游戏，多人同时、刷新、断网。
- **钩子**：素材加入、轮次结束、构建前后、文件变化、工具调用前（可拦截）/后、图片生成前（可改提示词和参数）。
- **画布**：插件节点（输入 → 原生命令 → 输出文件）、画布预设（节点组合模板）。
- **预览**：设备尺寸、颜色滤镜、手柄映射。
- **其他**：项目类型、项目模板、Library 来源、模型和媒体服务商、ACP agent、MCP 服务器、浏览器快捷入口、会话接口（跨项目读对话、发消息，聊天机器人用）。
- **限制**：插件包 ≤ 50MB；页面没有摄像头 / 麦克风；没有通用的"调用游戏内函数"接口。
