# TapTap Maker

Make TapTap Maker games (UrhoX/Lua) with the official Maker CLI: create or connect a Maker project, preview it in Maker Runtime, and submit builds. Needs a Maker account and Python 3.8 or later.

Official OhMyGame plugin `ohmygame/taptap-maker`. It preserves the bundled plugin's
ID, version and configuration during the move to npm.

This package is prepared for the app's preinstalled-plugin migration. See the
[migration checklist](../../docs/preinstalled-plugins.md). App builds before
the npm cutover already bundle this ID; do not add a second copy there.

The package includes its Skills, icons, localizations and any declared native
modules, panels or project templates. OhMyGame checks and loads the manifest;
there are no npm installation scripts.
