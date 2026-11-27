# ohmygame-plugins

Builds the index of [OhMyGame](https://github.com/WhiteTowerAI/ohmygame)
plugins released on GitHub, mirrors and signs each release, and holds
OhMyGame's official plugins. The app reads the index to list plugins and checks
every download against its signed record.

## Official plugins

Each folder in [`plugins/`](plugins) is plugin `ohmygame/<folder>`, a
publisher only this organization can use:

- [Preinstalled-plugin migration](docs/preinstalled-plugins.md): the 12 existing
  game workflows and creative-tool plugins, packaged here with their original
  IDs and runtime contents. App #823 supplies the migration loader; the app
  cutover will pin the published versions before replacing bundled copies.
- Model providers, one plugin each, so a person adds only those they use:
  [`siliconflow-cn`](plugins/siliconflow-cn), [`modelscope`](plugins/modelscope),
  [`command-code`](plugins/command-code) and [`fal`](plugins/fal) (images, video,
  audio and 3D only).
- Video and speech: [`minimax`](plugins/minimax), an optional Beta with H3 video
  and Speech 2.8 for separate China/Global accounts (requires OhMyGame API 2.26).
- Image and video generation: [`seedance`](plugins/seedance) combines Ark
  Seedream images and Seedance videos under one key, with a separate BytePlus
  account (optional Beta, requires OhMyGame API 2.8).
- Pixel art: [`pixellab`](plugins/pixellab), an optional Beta with PixelLab
  pictures, characters, objects, animations, rotations, tilesets, tiles,
  effects, UI and pixel-art edits (requires OhMyGame API 2.34).
- 3D generation and processing: [`meshy`](plugins/meshy) and
  [`tripo`](plugins/tripo) include text/image generation, remeshing, texturing
  and animation (optional Beta, requires OhMyGame API 2.16).
- Doubao speech: [`doubao-voice`](plugins/doubao-voice), an optional Beta
  for speech synthesis and Seed Audio, requiring host API 2.25.
- Audio generation and transcription: [`elevenlabs`](plugins/elevenlabs), an
  optional Beta with account voices, speech, sound effects, music and Scribe
  transcription (requires OhMyGame API 2.21).
- Character speech: [`fish-audio`](plugins/fish-audio), an optional Beta with
  S2.1 Pro / Pro Free, workspace/public voice search and MP3/WAV output
  (requires host API 2.25).
- Level editing: [`level-editor`](plugins/level-editor), an optional Beta
  Levels panel that edits Tiled JSON maps in the project: tiles, layers,
  collisions and spawn points. It is on only in projects that turn it on
  (requires OhMyGame API 2.34).
- Local image workflows: [`comfyui`](plugins/comfyui), an optional Beta for
  an existing local server, API-format workflow import and durable image recovery
  (requires host API 2.31).
- Local reference speech: [`gpt-sovits`](plugins/gpt-sovits), an optional Beta
  for an existing GPT-SoVITS server and a configured reference voice, with WAV
  output and saved-result recovery (requires host API 2.32).
- Library sources, tabs on the Library page: [`sketchfab`](plugins/sketchfab)
  searches Sketchfab's downloadable 3D models under CC0, CC BY and CC BY-SA
  without an account, shows Sketchfab's own viewer on request, and adds a
  model as GLB once the person signs in with Sketchfab or pastes an API token
  (optional Beta, requires OhMyGame API 2.35).
  [`pixel-sprites`](plugins/pixel-sprites) searches 1.4 million AI-generated
  16×16 pixel art sprites (optional Beta, requires OhMyGame API 2.5;
  collections, previews and cache durations need 2.35).
- Publishing checks: [`launch-check`](plugins/launch-check), an optional Beta
  that scans a web game's build before it is published elsewhere: first-load
  size, file counts, absolute paths, requests to other sites and unused files,
  against OhMyGame Community, itch.io, CrazyGames, YouTube Playables and Poki
  limits, each with its source (requires OhMyGame API 2.37). Build it with
  `npm run build:launch-check` for source development.
- Messaging connections: [`feishu`](plugins/feishu), an optional private-chat
  bot with an explicit allowed user, durable delivery tracking and approvals
  kept in OhMyGame (Beta; use desktop Beta 5.8 or newer). Build it with
  `npm run build:feishu` only for local development.
- Desktop interaction: [`computer-use`](plugins/computer-use), an optional
  local MCP connection with revocable per-app consent on macOS and per-call
  approval on Windows/Linux. Requires app API 2.7. Build it
  with `npm run build:computer-use` for source development. Desktop Beta 5.8 or
  newer is required; macOS is locally verified, Windows/Linux are unverified Beta targets.
- Coding agents that speak the Agent Client Protocol, one plugin each:
  [`antigravity-cli`](plugins/antigravity-cli), [`codebuddy-code`](plugins/codebuddy-code)
  and [`gemini-cli`](plugins/gemini-cli). Command Code's agent is in
  [`command-code`](plugins/command-code), with its models: a vendor's agent and
  models are one plugin.

- H5 publishing: [`taptap`](plugins/taptap) manages existing web builds, store
  drafts and package bindings with the official CLI. TapTap Maker remains a
  separate plugin for Maker projects.

`npm test` packs each one as its release attaches it and judges it as the
index will, so CI refuses one the market wouldn't list. To release one, raise
`version` in both its `package.json` and `.ohmygame-plugin/plugin.json`; on
`main`, the [Publish plugins](.github/workflows/publish.yml) workflow makes a
GitHub release for every version that has none yet: tag `<folder>-v<version>`
on that commit, with the package as its `.zip` asset
([`src/pack-release.ts`](src/pack-release.ts): the files `npm pack` would
publish). Packages marked `private: true` are tested and packed but not
released until their rollout dependencies are available. Versions published
before stay on npm.

To try one in OhMyGame before releasing it, add its folder under Plugins › Add
plugin › This computer with Develop on.

All current official plugins carry `beta: true` in their plugin manifest. This
shows the app's Beta badge; it is independent of prerelease versions. Existing
released plugins get a patch version when this metadata changes. Feishu and
Computer Use are released for desktop Beta 5.8 or newer. Computer
Use has macOS acceptance; Windows/Linux remain unverified Beta targets.

## Publishing a plugin

A plugin is a [plugin package](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/plugins.md)
released on GitHub:

- in a public repository with the topic `ohmygame-plugin` (forks aren't read);
- owned by its publisher: plugin `<publisher>/<name>` comes from the GitHub
  user or organization whose name, lowercased, is `<publisher>`. Only
  WhiteTowerAI publishes `ohmygame/*`. If two repositories of one owner hold the
  same plugin, the one released first keeps it and the other's versions are
  rejected;
- as a GitHub release (not a draft) whose tag is `v<version>`, the version in
  `.ohmygame-plugin/plugin.json`. A repository of several plugins tags each
  `<name>-v<version>` and must attach its package;
- with the package as the release's one `.zip` asset, or, for a `v<version>`
  tag, without one: the tag's source is the package then;
- with no `preinstall`, `install` or `postinstall` script (the app never runs
  them);
- under the app's archive size limit.

A project template keeps its `.gitignore` as `gitignore`: npm's rules, which
packing an official plugin follows, leave out `.gitignore` files.

## What the index job checks

Every 30 minutes, at :17 and :47 (GitHub may run a schedule late or skip it),
`.github/workflows/index.yml`:

1. finds public repositories with the topic (GitHub's search gives at most
   1,000), and their releases; GitHub not answering, or a search that timed
   out, fails the run, so a partial index is never published;
2. downloads each new release's `.zip` asset, or its tag's source from
   `codeload.github.com`;
3. unpacks it with the app's own code, within the app's unpacked size and file
   limits, as installing it would: at the top of the archive, or in the one
   folder it was zipped with, refusing links, unsafe or duplicate paths and a
   manifest folder anywhere else;
4. checks the package with the app's own package check, from a checkout of
   WhiteTowerAI/ohmygame (`OHMYGAME_REF`, `dev` by default), and that its id
   and version agree with the repository's owner and the tag. Nothing from a
   package is run;
5. copies the plugin's icon and screenshots out of the package, checked as the
   app checks them (an icon a PNG, WebP or static SVG of the type its name
   says; a screenshot a PNG, JPEG or WebP), named by their contents' hash. One
   the app wouldn't show is left out, not the plugin;
6. keeps the archive for the mirror at `packages/<publisher>/<name>/<version>-<sha256>.zip`,
   and signs its record with the market's key;
7. keeps each plugin with the repository released first, then applies
   `blocked.json` and `categories.json`, so a block can't move a plugin to
   another repository;
8. writes `assets/` and `index.<sha256>.json`, then `index.json` pointing at it.

The workflow cache keeps each release's verdict, keyed by the release, its
archive and the checks that judged it (the app commit and this indexer's
source), with the images and archive beside it, so only new releases, or all
of them after the checks change, are downloaded. A release that can't be
downloaded is left out until a later run gets it. One taken down on GitHub
leaves the index and the cache.

## What's in the index

Index v2 (`schemaVersion: 2`) lists every release it read in `versions`:

- `repository` (`owner/repo`), `tag`, `commit`, `version` and `publishedAt`;
- for an installable one, `plugin`: its id, localized `displayName`,
  `description` and `longDescription`, `categories`, `keywords`, `appliesTo`,
  `beta`, what it asks for (`grants`) and adds, and its `icon` and
  `screenshots` (each with a localized `caption`) as paths beside the index:
  `assets/<sha256>.<ext>`. Images are named by their contents, so they never
  change and are cached for good;
- `release`, the market's signed record that the app installs from:
  `{ id, version, url, size, sha256, key, signature }`, signed with Ed25519
  over `ohmygame-plugin-release:1\n<id>\n<version>\n<sha256>` (the app's
  `releaseMessage`). `url` is the mirror's copy. Any copy with that digest,
  from the mirror, GitHub or a proxy, is checked the same way;
- `github`, the same archive on GitHub, for a release that attaches it (a
  tag's source isn't byte-for-byte stable there, so it comes from the mirror);
- for one that can't be installed, `rejected` reasons instead of `plugin` and
  `release`.

Beside `versions`:

- `repositories`, by `owner/repo`: `stars`, the owner's GitHub `avatar`, and
  `createdAt`, from the topic search;
- `featured`: the plugins in `featured.json` that can be installed, in its order.

The npm index (v1, `index.json` beside `v2/`) is no longer built. It stays at
its last version, so older apps keep reading it.

## Curating

All three files are read every run, and one that doesn't parse fails it, so a typo can't
quietly unblock a repository. The tests check them too, so a pull request that breaks one
fails CI before it's merged, and the last good index stays up meanwhile.

- `blocked.json` is a list of `{ "repository": "owner/repo", "plugin": "owner/name", "version": "1.0.0", "reason": "…" }`.
  Leave out `version` to block every version, and `plugin` to block every plugin
  of the repository. A blocked version stays in the index with its plugin,
  rejected with `blocked: <reason>` and without a release, so the app can say why it's gone.
- `featured.json` is a list of plugin ids, like `"acme/tiles"`.
- `categories.json` maps plugin ids to one to three categories the app knows, like
  `{ "acme/tiles": ["art", "design"] }`, listed in place of what the plugin's
  manifest says, for a plugin that has none or the wrong ones.

## Configuration

Repository variables:

| Variable                 | Example                               | Purpose                                     |
| ------------------------ | ------------------------------------- | ------------------------------------------- |
| `R2_ACCOUNT_ID`          | Cloudflare account ID                 | Builds the R2 S3 endpoint                   |
| `R2_BUCKET`              | `ohmygame-plugins`                    | Destination bucket                          |
| `R2_PLUGIN_INDEX_PREFIX` | `plugins`                             | Key prefix, without surrounding slashes     |
| `PLUGIN_MIRROR_URL`      | `https://plugins.ohmygame.ai/plugins` | Where that prefix is served, for `release.url` |
| `PLUGIN_RELEASE_KEY_ID`  | `ohmygame-market-1`                   | The signing key's id, which the app knows   |
| `OHMYGAME_REF`           | `dev`                                 | The app branch or tag whose checks are used |

Repository secrets:

- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, an R2 API token with object
  write access to the bucket. Until they are set, the index stays a workflow
  artifact;
- `PLUGIN_RELEASE_KEY`, the market's Ed25519 private key (PKCS#8 PEM). The app
  carries its public key and trusts it for every publisher. Without it the
  run fails.

Below the prefix, the run uploads `packages/` (the mirror's archives, kept
for good), then `v2/assets/` and `v2/index.<sha256>.json`, all with an
immutable cache header, then `v2/index.json`, so a client never sees a pointer
before its file or a release before its archive. Nothing uploaded is deleted,
since an app may still hold an older index. `v2/index.json` is cached for a
minute (`public, max-age=60`): every running app reads it every 30 minutes, so
a CDN in front of the bucket (a Cloudflare Cache Rule on its domain) can
answer most of those reads.

## Development

```sh
npm ci
ln -s ../ohmygame app   # an OhMyGame checkout with its dependencies installed
npm test
# A local index, signed with a key of your own:
openssl genpkey -algorithm ed25519 -out dev-key.pem
PLUGIN_RELEASE_KEY="$(cat dev-key.pem)" PLUGIN_RELEASE_KEY_ID=dev \
  npm run build -- --out out --cache cache.json --images images --archives archives \
  --repository owner/repo
npx tsx src/pack-release.ts plugins/tiled tiled.zip   # an official plugin's release asset
```
