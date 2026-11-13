# WeChat Mini Games

Adapt, preview, and check WeChat mini-game builds.

Official OhMyGame plugin `ohmygame/wechat-minigame`. It preserves the bundled plugin's
ID, version and configuration during the move to npm.

This package is held from publication until the app's preinstalled-plugin
migration is ready. See the [migration checklist](../../docs/preinstalled-plugins.md).
Do not add it alongside the bundled copy with the same ID.

The package includes its Skills, icons, localizations and any declared native
modules, panels or project templates. OhMyGame checks and loads the manifest;
there are no npm installation scripts.
