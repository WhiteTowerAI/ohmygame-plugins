# Godot

Make Godot games: a project type that plays in the game panel as a web build, tools and an MCP server to build scenes and run the game, and skills for scenes and scripts.

Official OhMyGame plugin `ohmygame/godot`. It preserves the bundled plugin's
ID, version and configuration during the move to npm.

This package is prepared for the app's preinstalled-plugin migration. See the
[migration checklist](../../docs/preinstalled-plugins.md). App builds before
the npm cutover already bundle this ID; do not add a second copy there.

The package includes its Skills, icons, localizations and any declared native
modules, panels or project templates. OhMyGame checks and loads the manifest;
there are no npm installation scripts.

## Web export templates

The game panel plays a Godot project as a web build, which needs Godot's web
export templates for the exact Godot version in use. In OhMyGame 2.34 and
later, the plugin's Settings tab shows the Godot it found and whether the
templates are installed, and **Install web export templates** downloads them.
It reads only `web_nothreads_release.zip` and `web_nothreads_debug.zip` (about
17–19 MB) out of the official release's template archive (about 1 GB) with
HTTP range requests, checks each file's CRC-32, and places them where Godot's
own template manager does. Godot's .NET build and custom builds can't use this;
install their templates in Godot with **Editor > Manage Export Templates**.
