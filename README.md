# ohmygame-plugins

Builds the index of [OhMyGame](https://github.com/WhiteTowerAI/ohmygame)
plugins published on npm, and holds OhMyGame's official plugins. The app reads
the index to list plugins and checks every download against it.

## Official plugins

Each folder in [`plugins/`](plugins) is published as `@ohmygame/<folder>`, the
publisher only OhMyGame can use, and is plugin `ohmygame/<folder>`:

- [Preinstalled-plugin migration](docs/preinstalled-plugins.md): the 12 existing
  game workflows and creative-tool plugins, packaged here with their original
  IDs and runtime contents. App #823 supplies the migration loader; the app
  cutover will pin the published versions before replacing bundled copies.
- Model providers, one plugin each, so a person adds only those they use:
  [`siliconflow-cn`](plugins/siliconflow-cn), [`modelscope`](plugins/modelscope),
  [`command-code`](plugins/command-code) and [`fal`](plugins/fal) (images, video,
  audio and 3D only).
- Video generation: [`minimax`](plugins/minimax), an optional beta provider for
  China and Global accounts (requires OhMyGame API 2.8).
- Messaging connections: [`feishu`](plugins/feishu), an optional private-chat
  bot with an explicit allowed user, durable delivery tracking and approvals
  kept in OhMyGame. Build it with `npm run build:feishu` before local use.
- Desktop interaction: [`computer-use`](plugins/computer-use), an optional
  local MCP connection with revocable per-app consent on macOS and per-call
  approval on Windows/Linux. Requires app API 2.7. Build it
  with `npm run build:computer-use` before local use.
- Coding agents that speak the Agent Client Protocol, one plugin each:
  [`antigravity-cli`](plugins/antigravity-cli), [`codebuddy-code`](plugins/codebuddy-code)
  and [`gemini-cli`](plugins/gemini-cli). Command Code's agent is in
  [`command-code`](plugins/command-code), with its models: a vendor's agent and
  models are one plugin.

- H5 publishing: [`taptap`](plugins/taptap) manages existing web builds, store
  drafts and package bindings with the official CLI. TapTap Maker remains a
  separate plugin for Maker projects.

`npm test` packs each one and judges it as the index will, so CI refuses one the
market wouldn't list. To release one, raise `version` in both its `package.json`
and `.ohmygame-plugin/plugin.json`; on `main`, the
[Publish plugins](.github/workflows/publish.yml) workflow publishes every
version npm doesn't have yet, with provenance. Packages marked `private: true`
are tested and packed but skipped by publishing until their rollout dependencies
are available.

A package's first version needs the `NPM_TOKEN` secret, a token of an
`@ohmygame` owner. After that, add this repository and `publish.yml` as each
package's trusted publisher on npmjs.com (each package has its own) and
remove the secret.

To try one in OhMyGame before releasing it, add its folder under Plugins › Add
plugin › This computer with Develop on.

All current official plugins carry `beta: true` in their plugin manifest. This
shows the app's Beta badge; it is independent of npm prerelease versions or
dist-tags. Existing published packages get a patch version when this metadata
changes. Feishu and Computer Use remain private until their separate releases.

## Publishing a plugin

A plugin is a [plugin package](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/plugins.md)
published to npmjs.org:

- scoped: `@<publisher>/<name>` or `@<publisher>/ohmygame-plugin-<name>` for plugin
  `<publisher>/<name>`. If both are published, the one published first keeps the
  plugin and the other's versions are rejected;
- with the keyword `ohmygame-plugin`;
- with the same version in `package.json` and `.ohmygame-plugin/plugin.json`;
- with no `preinstall`, `install` or `postinstall` script (the app never runs
  them);
- under the app's archive size limit.

To have the plugin marked as source verified, set `repository` in `package.json` to
its GitHub repository (with `directory` if it's in a repository of several) and
either publish with [provenance](https://docs.npmjs.com/generating-provenance-statements)
or keep that same package name in the repository's `package.json`.

`npm pack` leaves out `.gitignore` files, so a project template keeps its
`.gitignore` as `gitignore`.

## What the index job checks

Every 30 minutes, `.github/workflows/index.yml`:

1. finds packages with the keyword on registry.npmjs.org (mirrors can't
   search); a package it can't read fails the run, so a partial index is
   never published;
2. checks the registry's signature over `name@version:integrity` with npm's
   current keys, valid when the version was published;
3. downloads the tarball and checks its `sha512` integrity;
4. reads the tarball in memory within the app's unpacked size and file
   limits, refusing links, unsafe or duplicate paths and anything outside
   `package/`;
5. writes its files to a private temporary folder and checks them with the
   app's own package check, from a checkout of WhiteTowerAI/ohmygame
   (`OHMYGAME_REF`, `dev` by default). Nothing from a package is run;
6. copies the plugin's icon and screenshots out of the package, checked as the
   app checks them (an icon a PNG, WebP or static SVG of the type its name
   says; a screenshot a PNG, JPEG or WebP), named by their contents' hash. One
   the app wouldn't show is left out, not the plugin;
7. keeps each plugin with its first published package, then applies
   `blocked.json` and `categories.json`, so a block can't move a plugin to
   another package;
8. reads each package's source, stars, avatar and weekly downloads;
9. writes `assets/` and `index.<sha256>.json`, then `index.json` pointing at it.

The workflow cache keeps each version's verdict on its contents, keyed by its
integrity and the app commit that judged it, and the images the verdicts list,
so only new versions, or all of them after the app's checks change, are
downloaded. A verdict whose images aren't in the cache is judged again. A tarball that can't be
downloaded is left out until a later run gets it.

Each version in the index keeps its `integrity` and the registry's
`signatures`, so the app can verify them with npm's keys and download the
tarball from npmjs.org or a mirror without trusting the mirror's metadata.
A version that fails a check stays in the index with `rejected` reasons.

## What's in the index

Each installable version's `plugin` has its id, localized `displayName`,
`description` and `longDescription`, `categories`, `appliesTo`, `beta`, what it
asks for (`grants`) and adds, and its `icon` and `screenshots` (each with a
localized `caption`) as paths beside the index: `assets/<sha256>.<ext>`. A
version also has npm's `unpackedSize`. Images are named by their contents, so
they never change and are cached for good.

Beside `versions`:

- `packages`, by package name, read at most once a day for each package's newest
  installable version. What can't be read keeps its last value or is left out, and
  never fails a run:
  - `repository`: the GitHub repository it claims;
  - `sourceVerified`: `true` when npm's SLSA provenance for that version names this
    repository, or the repository's `package.json` names this package. This is read
    from npm and GitHub over HTTPS; the job doesn't verify the Sigstore bundle
    itself, and relies on npm having checked it at publish;
  - `stars` and `avatar` (the repository owner's GitHub `avatar_url`): only when the
    source is verified, so a package can't borrow another project's stars or face;
  - `createdAt`: when the package was first published;
  - `weeklyDownloads`.
- `featured`: the plugins in `featured.json` that can be installed, in its order.

## Curating

All three files are read every run, and one that doesn't parse fails it, so a typo can't
quietly unblock a package. The tests check them too, so a pull request that breaks one
fails CI before it's merged, and the last good index stays up meanwhile.

- `blocked.json` is a list of `{ "package": "@a/b", "version": "1.0.0", "reason": "…" }`.
  Leave out `version` to block every version. A blocked version stays in the index,
  rejected with `blocked: <reason>`, so the app can say why it's gone.
- `featured.json` is a list of plugin ids, like `"acme/tiles"`.
- `categories.json` maps plugin ids to one to three categories the app knows, like
  `{ "acme/tiles": ["art", "design"] }`, listed in place of what the plugin's
  manifest says, for a plugin that has none or the wrong ones.

## Configuration

Repository variables:

| Variable                 | Example                    | Purpose                                     |
| ------------------------ | -------------------------- | ------------------------------------------- |
| `R2_ACCOUNT_ID`          | Cloudflare account ID      | Builds the R2 S3 endpoint                   |
| `R2_BUCKET`              | `ohmygame-releases`        | Destination bucket                          |
| `R2_PLUGIN_INDEX_PREFIX` | `plugins`                  | Key prefix, without surrounding slashes     |
| `OHMYGAME_REF`           | `dev`                      | The app branch or tag whose checks are used |

Repository secrets: `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, an R2 API
token with object write access to the bucket. Until they are set, the index
stays a workflow artifact.

`assets/` and `index.<sha256>.json` are uploaded first, with an immutable cache
header, then `index.json`, so a client never sees a pointer before its file.
Images already uploaded are left alone and none is deleted, since an app may
still hold an older index. `index.json` is cached for a minute
(`public, max-age=60`): every running app reads it every 30 minutes, so a CDN
in front of the bucket (a Cloudflare Cache Rule on its domain) can answer most
of those reads.

## Development

```sh
npm ci
ln -s ../ohmygame app   # an OhMyGame checkout with its dependencies installed
npm test
npm run build -- --out out --cache cache.json --images images
npm run build -- --tarball my-plugin-1.0.0.tgz   # check a local package
```
