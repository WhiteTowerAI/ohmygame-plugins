# Unreal Engine

Inspect scenes and edit actors through Unreal MCP.

Official OhMyGame plugin `ohmygame/unreal-engine`. It preserves the bundled plugin's
ID, version and configuration during the move to npm.

This package is prepared for the app's preinstalled-plugin migration. See the
[migration checklist](../../docs/preinstalled-plugins.md). App builds before
the npm cutover already bundle this ID; do not add a second copy there.

The package includes its Skills, icons, localizations and any declared native
modules, panels or project templates. OhMyGame checks and loads the manifest;
there are no npm installation scripts.
