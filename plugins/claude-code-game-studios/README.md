# Claude Code Game Studios

A project template that turns Claude Code into a game studio: 49 agents, 78
skills and a full workflow.

Official OhMyGame plugin `ohmygame/claude-code-game-studios`. It gives one
[project template](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/plugins.md#project-templates):
[Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
by Donchitos, under the MIT license, as released. Starting a project from it on
OhMyGame's Home copies `template/` into the new project, as cloning the
repository would; then run `/start` in Claude Code.

See [NOTICE.md](NOTICE.md) for the release it holds and what's left out.

## Updating

```sh
node scripts/sync-claude-code-game-studios.mjs vX.Y.Z
```

Read the diff, the template's hooks and scripts included, since Claude Code
runs them in projects made from it. Then set `version` in `package.json` and
`.ohmygame-plugin/plugin.json` to the release's version (`X.Y.Z`, or `X.Y.Z-1`
for a change of ours to the same release). Updating changes only projects made
afterwards.
