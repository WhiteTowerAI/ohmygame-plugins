# Douyin Mini Games

Adapt, preview, and check Douyin mini-game builds.

Official OhMyGame plugin `ohmygame/douyin-minigame`. It preserves the bundled plugin's
ID, version and configuration during the move to npm.

This package is prepared for the app's preinstalled-plugin migration. See the
[migration checklist](../../docs/preinstalled-plugins.md). App builds before
the npm cutover already bundle this ID; do not add a second copy there.

The package includes its Skills, icons, localizations and any declared native
modules, panels or project templates. OhMyGame checks and loads the manifest;
there are no npm installation scripts.

## Skills

- The platform skill: packaging through the engine's own route, developer-tool
  and device previews, and uploads only on request.
- `minigame-rewarded-ad`: rewarded video ads through
  [`reference/rewarded.ts`](skills/minigame-rewarded-ad/reference/rewarded.ts),
  one controller per game for `wx`, `tt` and a local preview, which grants
  only for a finished ad, loads again after failures, tells each scene when
  an ad is available, and never leaves the game paused; and
  [`reference/size-check.mjs`](skills/minigame-rewarded-ad/reference/size-check.mjs),
  which measures the packages against the platform's limits right after a
  build (WeChat: main 4 MB, independent subpackages 4 MB, all 30 MB; Douyin:
  main 4 MB, each subpackage and all 20 MB, 30 MB with virtual payment),
  counts engine plugins in the main package, and suggests asset folders to
  move into subpackages. The developer tool's own size report is the one
  that counts. Tests are in `test/minigame-skills/`.
