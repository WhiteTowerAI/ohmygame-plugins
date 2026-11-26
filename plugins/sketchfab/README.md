# Sketchfab Beta

A Library source for [Sketchfab](https://sketchfab.com): downloadable 3D models
under licenses that allow commercial use and changes. Requires OhMyGame plugin
API **2.35+** (collections, the one-hour cache, the Settings status and the interactive preview).

## Use

Turn the plugin on under Plugins. It adds a **Sketchfab** tab to the Library
page with ten collections: **All** first, then Sketchfab's categories
Characters, Animals, Vehicles, Weapons, Nature, Buildings, Furniture, Food and
Tech. A browse shows the most liked models first; a search, the best matches
within the chosen collection. Scrolling loads the next page.

A model's details offer **Load interactive preview**: Sketchfab's own 3D
viewer, inside the Library, where you can turn and zoom the model and play its
animations before adding it. Nothing is asked of Sketchfab until you choose it.
The viewer is `https://sketchfab.com/models/<uid>/embed` with `dnt=1`, which
asks Sketchfab not to track it; OhMyGame shows it only because the plugin lists
`sketchfab.com` in `capabilities.network` (shown when you allow the plugin),
sandboxes it and keeps it on sketchfab.com. **Open source page** opens the
model's page in your browser.

**Browsing, searching and thumbnails need no account.** Adding a model
downloads its GLB file, which Sketchfab allows only to a signed-in person: until
you sign in, adding says so and points to this plugin's Settings. An added
model keeps its author, license and Sketchfab page, shown in its details.

## Licenses

Each page asks Sketchfab for downloadable models under **CC0**, **CC BY** and
**CC BY-SA** (Sketchfab searches one license at a time, so a page holds up to
8 of each, in turn). These allow commercial use and changes; NonCommercial
(NC) and NoDerivatives (ND) models, and Sketchfab Store models, are never
listed or added. Adding a model reads its license again from Sketchfab and
refuses one outside these three, so an agent's `library_use` can't add one
either.

- **CC BY**: credit the author shown with the model where you use it.
- **CC BY-SA**: credit the author, and share changed versions of the model
  under CC BY-SA.
- **CC0**: no credit needed.

Sketchfab reports each license from what its author chose; check the model's
page before relying on it. Age-restricted models, and models whose GLB is over
the Library's 200 MB, are left out.

## Signing in

The plugin's Settings tab shows who is signed in and how:

- **Sign in with Sketchfab** (OAuth): opens Sketchfab's sign-in page in your
  browser. After you choose Allow, Sketchfab returns to
  `http://127.0.0.1:52817/sketchfab/callback` on this computer, which the
  plugin listens on only while a sign-in is waiting (ten minutes at most). It
  checks the `state` it started with (another page's visit leaves the sign-in
  waiting), exchanges the code at `/oauth2/token/` with the client ID alone,
  asks Sketchfab's `/v3/me` who it is, and keeps the access and refresh tokens
  in `account.json` in its data folder, readable only by you. Access tokens
  last a month; when one has ended, or Sketchfab refuses it, adding a model
  renews it with the refresh token first. A refresh token Sketchfab refuses
  ends the sign-in. **Sign out** deletes it.

  Sketchfab sets up desktop apps as public clients of the authorization-code
  grant, without a client secret; it doesn't offer the implicit grant, PKCE or
  custom URL schemes. Sign-in uses OhMyGame's application (`CLIENT_ID` in
  `native/index.mjs`, registered with the redirect URI above); as a public
  client's ID it isn't a secret.
- **Sketchfab API token**: paste the token from Sketchfab's
  [Settings › Password & API](https://sketchfab.com/settings/password)
  (**Get API token** opens it). It is saved as a secret on this computer and
  sent only to Sketchfab; turning the plugin on allows it to read it
  (`capabilities.secrets`). **Sign out** clears it too.

When both are there, the OAuth sign-in is used while it lasts or can be
renewed. A token Sketchfab refuses is reported when adding, and an OAuth
sign-in that can't be renewed is forgotten.

## How it works

`native/index.mjs` asks `GET /v3/search?type=models&downloadable=true` once
per license, with the collection's `categories`, and merges the three pages;
its cursor carries Sketchfab's cursor for each license. Searches need no
account. Adding a model asks `GET /v3/models/{uid}` (license, author,
downloadable), then `GET /v3/models/{uid}/download` with your sign-in, and
downloads the signed `glb` address it returns, without your credentials. The
download is refused past 200 MB or when its first bytes aren't `glTF`.

The manifest's `cacheSeconds: 3600` asks OhMyGame to show a browse of a
collection, without search words, again for an hour before asking Sketchfab;
searches with words, and **Refresh**, always ask. `timeoutSeconds: 600` gives
large downloads time.

## Local acceptance

- Add the folder under Plugins › Add plugin › This computer with Develop on,
  turn it on and open the Library: the tab opens on All. Open a model with
  animations and choose **Load interactive preview**: Sketchfab's viewer
  turns, zooms and plays them. Switch collections,
  search `sword`, scroll to load more, and check only CC0, CC BY and CC BY-SA
  show, without signing in.
- Add a model while signed out: it says to sign in in this plugin's Settings.
- Settings: **Get API token** opens Sketchfab's page; paste the token, and the
  status says whose it is. Add a model and check it opens as GLB with its
  author, license and page. A wrong token says Sketchfab didn't accept it.
- **Sign in with Sketchfab**, allow,
  and the browser says you're signed in and the status says who; **Cancel
  sign-in** stops waiting; **Sign out** returns to signed out. Denying on
  Sketchfab's page says you didn't allow OhMyGame.
