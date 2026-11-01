# ohmygame-plugins

Builds the index of [OhMyGame](https://github.com/WhiteTowerAI/ohmygame)
plugins published on npm. The app reads the index to list plugins and checks
every download against it.

## Publishing a plugin

A plugin is a [format 2](https://github.com/WhiteTowerAI/ohmygame/blob/dev/docs/plugins-v2.md)
package published to npmjs.org:

- named `@<publisher>/ohmygame-plugin-<name>` for plugin `<publisher>/<name>`;
- with the keyword `ohmygame-plugin`;
- with the same version in `package.json` and `.ohmygame-plugin/plugin.json`;
- with no `preinstall`, `install` or `postinstall` script (the app never runs
  them);
- under the app's archive size limit.

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
6. writes `index.<sha256>.json`, then `index.json` pointing at it.

The workflow cache keeps each version's verdict on its contents, keyed by its
integrity and the app commit that judged it, so only new versions, or all of
them after the app's checks change, are downloaded. A tarball that can't be
downloaded is left out until a later run gets it.

Each version in the index keeps its `integrity` and the registry's
`signatures`, so the app can verify them with npm's keys and download the
tarball from npmjs.org or a mirror without trusting the mirror's metadata.
A version that fails a check stays in the index with `rejected` reasons.

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

`index.<sha256>.json` is uploaded with an immutable cache header and
`index.json` with `no-cache`, so a client never sees a pointer before its file.

## Development

```sh
npm ci
ln -s ../ohmygame app   # an OhMyGame checkout with its dependencies installed
npm test
npm run build -- --out out --cache cache.json
npm run build -- --tarball my-plugin-1.0.0.tgz   # check a local package
```
