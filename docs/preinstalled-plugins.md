# Preinstalled-plugin migration

This is stage 9 of [OhMyGame #809](https://github.com/WhiteTowerAI/ohmygame/issues/809).
The first increment packages all 12 existing bundled plugins in this repository.
The app loader is implemented in [app #823](https://github.com/WhiteTowerAI/ohmygame/pull/823).
These 12 packages are enabled for first publication; the app cutover follows only
after their actual registry versions and checksums have been verified.

## Package contents

Imported from app commit `0112c6d01c0f7e0d2f7f2d4d22c2932da1baace8`:

| Packages | Existing version |
| --- | --- |
| aseprite, blender, cocos-creator, douyin-minigame, game-studio, tiled, unity, web-game-studio, wechat-minigame | 0.1.0 |
| godot, taptap-maker, unreal-engine | 1.0.0 |

Plugin IDs, manifest versions, configuration keys, capabilities, contribution
IDs, Skills, icons, localizations, panels and native modules are preserved.
Each package adds npm metadata, its Apache-2.0 license and this rollout guidance.
Godot's `templates/godot-game/.gitignore` becomes `gitignore`, following the app's
existing published-template contract; npm otherwise omits that file.
Third-party icon notices remain alongside their assets.

`npm test` packs every plugin with npm and checks that the app/index accept its
manifest and icon. For these 12 packages it also checks that every runtime file
survives npm filtering. No external engine, account, model, input or install
script is needed for these packaging checks.

## Cutover sequence

1. The 12 packages are released for the reviewed app cutover. Feishu and Computer
   Use retain their independent publication holds. Do not add these packages
   over bundled copies in an everyday app profile.
2. Add npm support to the app's prepared-plugin lock and loader. Pin exact
   versions and SHA-512 tarball integrity; validate the package and manifest ID
   before installation. Prepare archives at build time so startup works offline
   and runs no npm installation scripts.
3. Preserve settings, project references and existing on/off choices when the
   source changes. Remember removals across restart and later app upgrades.
   Persist npm origin so the ordinary plugin updater can find subsequent versions.
4. Test clean install, migration, restart, removal, update, corrupted archives
   and an independently installed newer version in an isolated app profile.
   Game Studio and Web Game Studio default on; engine-specific plugins stay
   off until enabled for a matching project. Feishu and Computer Use stay optional.
5. Reconcile any changes in the app's bundled sources since the import commit.
   Prepare the app cutover PR, then remove the package publication hold and
   publish the reviewed versions. First publication may require the maintainer's
   npm authentication; configure each package's trusted publisher afterward.
6. Read the actual npm versions and integrity values into the app lock, verify
   the downloaded tarballs, then remove the corresponding bundled folders in
   the same app change that activates preinstallation. Never ship simultaneous
   bundled and npm ownership of one plugin ID. Retest the final locked artifacts.

Only declaration-only updates that ask for no new permissions may update
automatically. Native-code updates require explicit review. The initial
migration must not silently grant any new capabilities.

## Local packaging check

```sh
npm ci
npm run typecheck
npm test
```

The repository setup expects an OhMyGame checkout at `app/` (or set
`OHMYGAME_APP`); CI prepares it automatically. The app #823 isolated probe also checks all 12 real local npm packs through
clean installation, existing settings/switch migration, icon reads, removal
and restart. The cutover must repeat this against the published tarballs.
