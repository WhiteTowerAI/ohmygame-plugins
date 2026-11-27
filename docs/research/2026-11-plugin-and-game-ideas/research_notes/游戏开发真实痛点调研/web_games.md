# Web/HTML5 Games: The Developer Side (Platforms, Economics, Pain Points), 2023–2026

Research date: 2026-11-24. Scope: what small developers who ship browser games (Phaser / Three.js / R3F style) run into when they build, publish, monetize and grow them, to guide plugin choices for an AI game-making studio that publishes games as links.

Source quality: platform docs (Poki, CrazyGames, YouTube Playables, Meta, Telegram, Discord, Yandex, MDN) are primary and treated as authoritative. Revenue-per-play figures come almost entirely from secondary or self-reported sources (blogs, guides, vendor posts), and some of those (for example Cinevva, Playfox and a GitHub "opportunity report") look partly AI-generated. They are flagged where used.

---

## 1. Platforms: scale, requirements, SDKs and economics

### Takeaway
The large portals (Poki at about 100M MAU, CrazyGames at about 50M MAU) are gated, ad-revenue-share businesses. They impose hard technical rules: small initial download, relative paths only, no external requests or links, ads only through their SDK, gameplay start/stop events, and portrait or mobile support. They also run a soft-launch test on real players before any money flows. Newer "embedded" channels (YouTube Playables, Discord Activities, Telegram Mini Apps, Reddit Devvit, Facebook Instant Games) each have their own SDK, sandbox and size rules. Revenue splits are rarely published officially, so one web game build has to be adapted per platform. That adaptation is a large, repetitive cost.

### Cited Findings

**Poki (Amsterdam; ad revenue share; curated)**
- Scale: 100 million monthly players, 1B+ gameplays per month, 500+ game developers, 100+ countries, and "more than 5 million monthly players per high-performing game." — [Poki for Developers](https://developers.poki.com/)
- 2025 year in review: 100M players a month, 625M total players, 11.1 billion gameplays, 227 new game releases, 1,018 games past 1M+ plays, developers from 89 countries. Revenue paid to developers is not disclosed. — [Poki blog, 2025 year in review](https://poki.com/blog/2025-at-poki-a-year-in-review)
- Earlier MAU figures show growth: over 65M MAU cited in a Dec 2024 case study, and "over 90 million players per month" in a Jul 2025 case study. — [Poki/Unico case study (Dec 2024), via search summary](https://poki.com/blog/beyond-the-app-stores-unico-studio-reaches-new-heights-on-web); [Poki/Emolingo case study (Jul 2025)](https://poki.com/blog/how-emolingo-games-built-business-html5-web-games-poki)
- Revenue share: Poki does not publish an exact split. Secondary sources report about 50% of ad revenue, and 100% on traffic the developer brings in through direct links (unverified against a primary Poki source). — [Cinevva web game monetization guide (secondary)](https://app.cinevva.com/guides/web-game-monetization); [Playgama comparison (secondary)](https://playgama.com/blog/business-faqs/poki-vs-crazygames-vs-gamedistribution-revenue-share/)
- Poki says some partner studios earn up to about €1M/year from ads (self-reported). — [search summary of Poki/Mobidictum interview](https://mobidictum.com/pokis-web-gaming-interview-michiel-van-amerongen)
- **Requirements** — [Poki requirements & quality guide](https://developers.poki.com/guide/requirements-quality):
  - Keep the initial download small using progressive loading. "Players tend to move to another game if loading takes more than 10 seconds."
  - Support desktop, mobile and tablet, and cover the full screen on mobile. Force mobile controls on tablets.
  - 16:9 aspect ratio, scaling proportionally to 640x360 / 836x470 / 1031x580.
  - Ads: `commercialBreak()` only when going back into gameplay, plus `rewardedBreak()` where appropriate. Poki manages ad frequency (no internal ad timers). Mute audio during ads. No SDK events during ads.
  - Rewarded ads: one ad per reward. A continue button of equal or larger size must be shown alongside. Rewarded buttons cannot be green and must carry a 🎬 icon. No reward if an ad blocker is detected, but the game must stay playable with an ad blocker and must not show custom ad-blocker messaging.
  - External requests are blocked by default, so fonts, assets and libraries must be bundled. External links must go through `PokiSDK.openExternalLink()`, and linking out requires an in-game privacy policy hosted at a real URL (not Google Docs).
  - Save progress, or warn the player that progress won't be saved. Wrap localStorage in try/catch so the game works in incognito.
  - No splash screens or outgoing links (a studio logo on the loading screen is allowed). No other ad systems. No IAP or "remove ads" UI.
  - For keyboard games, ESC or space pauses. `gameplayStart()` fires on the first input and `gameplayStop()` on any interruption.
  - Profanity filtering for usernames in multiplayer games. A QA team checks every game.
- Size target conflict: search snippets of Poki's requirements describe "target an initial download size under 8 MB", while Poki's engine guide says "initial download should not exceed 5MB and 8MB in total". I did not confirm the exact current wording live. — [Poki web game engines guide (search snippet)](https://developers.poki.com/guide/web-game-engines); [Defold size manual citing 5 MB for Poki and others](https://www.defold.com/llms/manuals/optimization-size/)
- "For every extra megabyte a person has to download to play your game, you're going to lose a couple percent of players" (Erik Dubbelboer, Poki). Unity and Godot export one big WASM blob that must download fully before play. PlayCanvas and Construct are web-native, and Phaser and PixiJS sit at framework level. — [Poki blog: Building web browser games in 2026 (Jun 2026)](https://poki.com/blog/building-web-browser-games-2026)
- Same article: Poki says all games submitted must work in portrait, and QA tests for this. That is stricter than the requirements page, which says "portrait, landscape, or both". About 68% of Poki players had WebGPU-capable devices as of June 2026. Poki syncs localStorage to its servers so saves survive Safari storage purges, and players with a Poki account get cross-device saves with no API work. — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026); [Poki requirements](https://developers.poki.com/guide/requirements-quality)
- Tools: Poki Playtesting (real-player feedback), custom game analytics, targeted audience testing, in-house QA, monetization, player acquisition. After a build is uploaded, developers get "10 to 20 video recordings of real players within minutes", including keyboard and mouse inputs, and can upload several builds a day. — [Poki for Developers](https://developers.poki.com/); [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
- Conversion benchmark: in the Poki "Web Fit" test, more than 70% conversion-to-play is "solid" and more than 80% is "exceptional". Cannon Clash reached 81% with a 2.4 MB / 76-request download. — [Poki blog: Cannon Clash load fast (Nov 2024)](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion)

**CrazyGames (ad revenue share; Basic Launch to Full Launch funnel)**
- "CrazyGames reaches over 50 million monthly players," concentrated in the US, UK and Australia. — [CrazyGames FAQ](https://docs.crazygames.com/faq/). A dev blog cites 60M monthly users and 320M play sessions a month (unverified). — [froessell Substack (Oct 2026)](https://froessell.substack.com/p/15000-from-one-browser-game-the-math)
- Funnel: initial QA, then **Basic Launch** (shown to "a small segment of players", ads disabled, no revenue shared, measures retention, playtime, CTR and conversion-to-gameplay), then **Full Launch** (SDK mandatory, ads on). Thresholds are not published. — [CrazyGames FAQ](https://docs.crazygames.com/faq/); [CrazyGames requirements intro](https://docs.crazygames.com/requirements/intro/)
- QA rejection reasons: bugs or broken mechanics; missing English support; unoriginal content (clones, asset flips); inappropriate themes; not PEGI-12; content aimed at kids; not meeting requirements or terms. — [CrazyGames FAQ](https://docs.crazygames.com/faq/). Names can't be a common identifier ("Super Chess" OK, "Chess" not). — [CrazyGames quality requirements (via search)](https://docs.crazygames.com/requirements/quality/)
- **Technical requirements** — [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/):
  - Total size ≤ 250 MB, ≤ 1,500 files.
  - Initial download ≤ 50 MB, or ≤ 20 MB for mobile homepage eligibility. With the SDK, this is measured until the first `gameplayStart`.
  - Time to gameplay ≤ 20 s. Relative paths only.
  - Chrome and Edge are expected. Games that don't work on Safari are disabled there. Games are disabled on Chromebooks if they don't run on a 4 GB RAM device.
  - Use SDK system info for device detection, not touch detection. Set `user-select: none` on the body.
  - Resume a suspended AudioContext inside a touchend/click on iOS. Respect safe-area padding in app fullscreen.
  - Unity games are disabled on iOS by default because of crashes.
- **Ad rules**: midgame ads at most 1 every 3 minutes (the SDK enforces this). Rewarded ads: no chaining, the reward is given only on `adFinished`, a skip option of matching size, no rewarded button on active gameplay screens, offer an alternative such as coins, no out-of-lives ad on every death. Banners: max 2 per screen, only on screens open ≥ 5 s on average. Never block ad-block users. Mute only when the ad actually starts. Pause the game and block UI until `adFinished`/`adError`. The game must work with ads disabled during Basic Launch (no dead rewarded buttons). — [CrazyGames ads requirements](https://docs.crazygames.com/requirements/ads/)
- SDK modules: Game (gameplay start/stop, loading events), Data (progress saving), User (account, username, avatar), plus IAP for selected games via Xsolla. Technical SDK support only after "50k plays (combined)". — [CrazyGames technical](https://docs.crazygames.com/requirements/technical/); [CrazyGames requirements intro](https://docs.crazygames.com/requirements/intro/)
- Payouts monthly once the balance reaches €100, by wire or PayPal. The split is not published in the FAQ. — [CrazyGames FAQ](https://docs.crazygames.com/faq/). 2026 jam terms reportedly give 60% of ad revenue and 70% of IAP to developers (secondary). — [Cinevva monetization guide](https://app.cinevva.com/guides/web-game-monetization). A dev blog mentions a "50% exclusivity bonus" (unverified). — [froessell Substack](https://froessell.substack.com/p/15000-from-one-browser-game-the-math)
- Analytics: the portal dashboard shows plays, revenue, engagement and geography, plus reasons given in negative ratings. Cover A/B experiments: 1 at a time per game, up to 2 a month, up to 14 days each. — [CrazyGames FAQ](https://docs.crazygames.com/faq/)
- Submission requires a description, controls and covers (images and videos). — [CrazyGames requirements intro](https://docs.crazygames.com/requirements/intro/)

**GameDistribution, Y8, Newgrounds, Yandex (secondary tier)**
- GameDistribution: no official split found. An older Medium post and a Playgama FAQ say the developer gets about 33% because revenue is shared three ways (publisher site, developer, GD). The payout threshold is cited as €100 (Playgama) or €50 (Summer Engine guide), which conflict. The SDK requires pausing and muting on `SDK_GAME_PAUSE`/`SDK_GAME_START`. — [GameArter Medium](https://medium.com/gamearter/https-medium-com-gamearter-right-way-of-game-distribution-in-our-opinion-6f0088a3bd11); [Playgama FAQ](https://playgama.com/blog/business-faqs/alternatives-to-gamedistribution-for-html5-distribution/); [Summer Engine guide](https://www.summerengine.com/make-great-games/publish-an-html5-game)
- Y8: accepts HTML5/WebGL. Monetization requires a "studio" and Y8 approval. In the AFP route the developer links their own AdSense account and earns 50% of in-game ad revenue. — [Y8 revshare page](https://ar.y8.com/revshare); [Y8 upload](https://www.y8.com/upload); [Y8 AFP ads SDK](https://github.com/Y8Games/y8-afp-ads-sdk-javascript)
- Newgrounds: no primary 2023–2026 developer data found. One secondary guide says the ad revenue share pays out at $50. — [Cinevva (secondary)](https://app.cinevva.com/guides/web-game-monetization)
- Yandex Games: moderation takes 3–5 business days (1–2 for content-only). Ads and payments only through the Yandex SDK. Moderators test on the listed browsers and OSes and reject on failure. Yandex says games rated above 80 with ARPDAU > 2 ₽ "earn noticeable revenue". — [Yandex moderation docs (via search)](https://yandex.com/dev/games/doc/en/concepts/moderation); [Yandex requirements](https://yandex.com/dev/games/doc/en/concepts/requirements); [Yandex quick start](https://yandex.com/dev/games/doc/ko/concepts/quick-start)

**itch.io**
- No official share of HTML5 uploads found. One filter page lists 55,708 "HTML5 + Windows in jam" results, but the filter does not separate web-only games. — [itch.io HTML5 in-jam filter](https://itch.io/games/html5/in-jam/platform-windows)
- Forum anecdotes: jam entrants with web builds averaged about 5 ratings versus about 1 without. Itch view counts can far exceed real visitors measured by external analytics. — [itch.io forum post](https://itch.io/post/725449); [itch.io forum threads](https://itch.io/post/740237/view-in-topic)
- Developers report new web games getting hundreds to about 1,000 plays a day while still not appearing in itch search or browse, with no visibility into whether they are in a moderation queue. — [itch.io thread: "my game isn't discoverable..."](https://itch.io/t/4980134/my-game-isnt-discoverable-on-itchio-despite-hundreds-of-plays-in-first-hours)
- SuperWEIRD devs (via 80.lv): "not having a web build means losing a lot of potential players". On CrazyGames sessions were "just a few minutes", while itch.io players "would often stay for over an hour". — [80.lv](https://80.lv/articles/how-this-indie-dev-kept-their-game-on-the-front-page-of-itch-for-an-entire-month)

**YouTube Playables (Google; early access only)**
- Size and stability limits — [Playables stability requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements_stability):
  - Initial bundle must be < 30 MiB and should be < 15 MiB, measured until `gameReady`.
  - Total < 250 MiB. Each file must be < 30 MiB and should be < 512 KiB. Max 8,000 files.
  - Save data must be < 3 MiB and should be < 500 KiB.
  - Should become interactive in < 5 s. Peak JS heap must stay ≤ 512 MB.
  - Must work in the YouTube app on Android and iOS and in all browsers YouTube supports. Relative paths only.
- The certification FAQ says the individual file size limit is a hard limit with no exemptions. — [Playables certification FAQ (via search)](https://developers.google.com/youtube/gaming/playables/support/certification_faq)
- Developer access is still "early access" via an interest form. Revenue sharing is reported as a pilot with selected publishers (Mediacube, a publisher, so self-interested). YouTube has not publicly disclosed developer revenue terms. — [YouTube Playables dev page](https://developers.google.com/youtube/gaming/playables); [Mediacube](https://mediacube.io/en/blog/youtube-playables-monetization); [Tech Insider](https://tech-insider.org/youtube-playables-50-markets-eu-nordics-2026/)
- Playables reportedly went live in 50+ markets including the EU on 28 Sep 2026. Playgama reportedly earned about $3,100/month from its Playables titles in March 2026 ad tests (third-party). — [Tech Insider](https://tech-insider.org/youtube-playables-50-markets-eu-nordics-2026/); [PocketGamer.biz](https://www.pocketgamer.biz/youtube-playables-expands-to-more-than-50-markets-including-the-eu-and-nordics/)

**Discord Activities (iframe web apps inside Discord)**
- Opened to all developers in Sept 2024 through the Embedded App SDK, with Premium Apps monetization (durable and consumable SKUs, analytics). — [Discord blog: Build where the world plays](https://discord.com/blog/build-where-the-world-plays); [PocketGamer.biz](https://www.pocketgamer.biz/discord-activities-opens-up-to-all-developers-to-make-games-on-the-platform)
- Fees reported: 30% dropping to 15% on the first $1M gross per developer (GamesBeat; not confirmed in primary terms). Monetization policy: paid offerings must be purchasable through Premium Apps at a price no higher than elsewhere. — [GamesBeat](https://gamesbeat.com/discord-opens-activities-in-app-games-and-features-to-all-developers/); [Discord dev support](https://support-dev.discord.com/hc/en-us/articles/23810643331735)
- Technical constraint: Activities run in a sandboxed iframe behind Discord's proxy and CSP. External domains are blocked unless mapped through URL Mappings in the Developer Portal or routed via your own proxy. Local tunnel development behaves differently from production. — [Discord docs: networking](https://docs.discord.com/developers/activities/development-guides/networking); [Discord docs: local development](https://docs.discord.com/developers/activities/development-guides/local-development)
- Design: users join mid-session, so give late joiners something to do such as spectating. — [Discord design patterns](https://docs.discord.com/developers/activities/design-patterns.md)
- Successes (vendor-reported): Mojiworks' Chef Showdown passed 1M+ players (Heroic Labs). Playroom's Death by AI peaked at 700K DAU (a16z). — [Heroic Labs](https://heroiclabs.com/blog/mojiworks/); [a16z](https://a16z.com/discord-activities-social-gaming/)

**Telegram Mini Apps (games)**
- Telegram passed 1B MAU (March 2025). About 1,700 mini-app developers and creators reportedly withdrew $55M via Stars, from $63M of Stars bought by 1.19M users (about 2024, via Dune/Decrypt; secondary). — [The Block](https://www.theblock.co/post/348630/telegram-surpasses-1-billion-monthly-active-users); [Forklog](https://forklog.com/en/ton-reports-surge-in-wallets-and-developer-earnings-from-mini-apps/)
- Developers nominally keep 70%, but the effective payout after Stars conversion can be much lower: "a $2.40 purchase might yield only $1.30" (secondary). — [DEV Community/TON](https://dev.to/ton-adoption/monetizing-telegram-mini-apps-stars-revenue-and-ton-payments-24fk)
- Game-relevant APIs:
  - Bot API 8.0 (17 Nov 2024) added fullscreen in portrait and landscape, orientation lock, home-screen shortcuts, motion sensors, safe-area insets (system and Telegram UI), and Stars subscriptions.
  - CloudStorage (6.9, Sep 2023) holds 1,024 items per user with values of 0–4,096 chars.
  - DeviceStorage (9.0, Apr 2025) holds 5 MB per user.
  - — [Telegram Mini Apps docs](https://core.telegram.org/bots/webapps)
- 2025: crypto mini apps were required to move to TON, and iGaming mini apps were removed (secondary summary). — [search summary; wnhub/gameworldobserver](https://gameworldobserver.com/tag/adsgram)

**Facebook Instant Games (Meta)**
- 31 Jul 2025: new Instant Games created from 1 Aug 2025 must use "Zero Permissions" (SDK v8.0). Legacy Facebook Web (Canvas) Games stop on 30 Sep 2026 unless migrated. Existing standard-connection Instant Games must switch to Zero Permissions after 30 Sep 2026. Meta says about 2x as many players get past loading, with up to 70% more daily engagement in some integrations. — [Meta dev blog: Web and Instant Games changes](https://developers.facebook.com/blog/post/2025/07/31/web-and-instant-games-changes/)
- Banner ads are being phased out: impressions start decreasing in April 2026, with full deprecation by 31 Mar 2027. The Rewarded Interstitial API was removed (calls fail if not migrated since Nov 2025). Meta recommends rewarded video or IAP instead. — [Meta Instant Games banner ads doc](https://developers.facebook.com/documentation/games/monetize/in-app-ads/banner-ads); [Instant Games changelog](https://developers.facebook.com/documentation/games/whats-new/changelog/)

**Reddit Devvit (games inside Reddit posts)**
- Reddit + Phaser "Games with a Hook" hackathon (17 Jun to 15 Jul 2026) offered $40K in prizes, including a $15K top prize and $5K for Best Use of Phaser. It is built on Devvit Web with an official Devvit Phaser template. Games that do well afterwards can qualify for Reddit Developer Funds ("based on engagement milestones"). Rules: avoid "obvious AI slop", games about Reddit itself, and fishing games; Wordle clones, simple platformers and trivia need a fresh angle; mobile quality is a bonus. — [Phaser news (Jun 2026)](https://phaser.io/news/2026/06/reddit-and-phaser-launch-a-40-000-game-dev-hackathon)
- Developer Funds caps conflict across time: up to $116,500/app (Mar 2025 post) versus a revamp promising up to $500K overall (Aug 2025). These come via Reddit mirror sites and are not verified against primary terms. — [r/Devvit mirror](https://lr.us.psf.lt/r/Devvit); [r/Devvit mirror (Aug 2025)](https://libreddit.winscloud.net/r/Devvit)

**Market-level data (Poki-commissioned "State of Web Gaming 2026")**
- Method: 400 US/UK developers (70% primarily mobile) and 2,000 US/UK web gamers, fieldwork 11–19 May 2026 by Atomik Research. — [Poki: State of Web Gaming Report 2026](https://poki.com/blog/state-of-web-gaming-report-2026)
- Developer views:
  - 53% cite technical challenges as a concern.
  - 36% say there is insufficient revenue in web gaming, and 36% cite insufficient audience size as a barrier.
  - 31% fear revenue cannibalisation.
  - 32% see web as a low-quality channel.
  - 74% say publishing to browsers is quite or very easy.
  - 53% plan to port mobile games to web within 12 months.
  - 46% cite discoverability as a benefit.
  - — [same](https://poki.com/blog/state-of-web-gaming-report-2026)
- Player friction: on mobile, 46% have stopped playing because of load time and 28% because of download size (32% and 26% on PC/console). The typical session is 11–20 min with 2–3 titles per session. 90% multitask while playing. — [same](https://poki.com/blog/state-of-web-gaming-report-2026)

### Inferences
- Shipping one game to several portals is mostly mechanical but error-prone work. Each portal needs SDK wrapper calls (gameplay start/stop, commercial/rewarded/midgame ads, data saving), relative paths, bundled fonts, no external requests or links, size budgets, and mute/pause on ads. A "multi-portal export/adapter" plugin (one abstract ads/save/events API that compiles to Poki, CrazyGames, GameDistribution, Y8, Yandex, Playables, Telegram, Discord or FB) fits these pains directly.
- Strict size budgets differ by platform: Poki about 5–8 MB initial, Playables < 15/30 MiB initial with < 512 KiB per file preferred, CrazyGames 20 MB for the mobile homepage. A build-time "size and request budget linter" with Draco/Basis/audio compression and lazy-load splitting would have high value for Three.js/R3F output.
- Rewarded-ad UX rules are specific and are checked by QA: Poki's 🎬 icon, non-green button and equal-size continue button; CrazyGames' timers, no chaining and reward only on finish. They could be encoded as lint rules or ready-made components.
- The soft-launch funnels (Poki Web Fit, CrazyGames Basic Launch) mean conversion-to-play, early retention and playtime decide whether a game ever earns money. Pre-submission playtesting and analytics are therefore core, not optional.
- Embedded channels (Discord, Telegram, Reddit, Playables) are where a "publish as a link" studio can reach social players, but each has sandbox networking or storage limits that need dedicated adapters.

### Gaps
- No official Poki or CrazyGames revenue-split percentages were found. All splits are secondary sources.
- No official itch.io stats on the HTML5 share of uploads or jam entries.
- No primary 2023–2026 Newgrounds developer economics.
- No official Discord Activities player counts, and the Activities fee schedule is not confirmed from primary terms.
- YouTube Playables developer revenue terms are not public.
- Reddit Developer Funds current caps were not confirmed from Reddit's primary terms page.

---

## 2. Developer pain points: build, performance and technical quirks

### Takeaway
The recurring technical pains are:
- initial download size and load time, which directly cut conversion
- portrait-first mobile layout with notches and overlays
- touch versus keyboard detection
- audio autoplay and iOS AudioContext unlock
- iOS Safari memory ceilings and WebGL context loss
- Safari wiping iframe storage, which breaks saves
- Unity/Godot WASM blob size
- static-build hygiene: relative paths, no CDN fonts, no external requests

### Cited Findings
- **Size to conversion:** each extra MB costs "a couple percent of players". Unity and Godot need the full WASM blob before play, and most Unity games load all assets into memory at launch. — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
- **Real optimization case (Cannon Clash, PlayCanvas):**
  - Draco compression took a GLB from 3.88 MB to 387 KB. Basis took a spritesheet from 406 KB to 46.3 KB. Audio bitrate was tuned for MP3.
  - Models were batched into one GLB and UI into one atlas. Only essential assets load first, with the rest in the background.
  - Shaders were precompiled by rendering all materials in frame 1, and colliders were simplified from 9.5K to 437 polys.
  - The start menu and intro animation were removed after playtests.
  - Result: 2.4 MB / 76 requests and 81% conversion.
  - — [Poki blog (Nov 2024)](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion)
- **Static-build gotchas (Three.js game built with Claude Code, CrazyGames, Oct 2026):** six fixes were needed.
  1. The app was server-rendered with no index.html, so a static Vite build was added.
  2. Absolute paths had to be rewritten to relative, and the build was tested from a sub-folder.
  3. Google Fonts were replaced with system fonts to remove external requests.
  4. Unused assets were pruned, taking the build from 20.5 MB to 12.4 MB.
  5. On landscape phones the lobby button sat below the fold, and portrait showed a "rotate phone" screen. Both were fixed.
  6. Store-page copy, tags, cover and gameplay clip were prepared.
  - The game earned $0 during Basic Launch because ads are off. — [froessell Substack](https://froessell.substack.com/p/15000-from-one-browser-game-the-math)
- **Portrait and mobile:**
  - "Build for portrait first", because asking players to rotate loses them.
  - Account for notches and the platform overlay UI (Poki has an inspector tool for this). — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
  - CrazyGames: don't rely on touch detection to show mobile controls (use SDK system info). Set `user-select: none` to stop the magnifier and selection menus. Respect safe areas in app fullscreen. — [CrazyGames technical](https://docs.crazygames.com/requirements/technical/)
  - Telegram added safe-area and content-safe-area insets plus fullscreen and orientation lock in Bot API 8.0. — [Telegram docs](https://core.telegram.org/bots/webapps)
- **Audio autoplay:**
  - Audible playback before user interaction is generally blocked. `navigator.getAutoplayPolicy()` can detect the policy. Web Audio `start()` outside a user gesture follows the same rules.
  - Iframes need `allow="autoplay"`, which matters for portal iframes. — [MDN Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
  - CrazyGames explicitly requires resuming a suspended AudioContext in a touchend/click on iOS. Both Poki and CrazyGames require muting during ads. — [CrazyGames technical](https://docs.crazygames.com/requirements/technical/); [Poki requirements](https://developers.poki.com/guide/requirements-quality)
- **iOS Safari memory and WebGL:**
  - WebKit bug reports describe WebGL- and texture-heavy pages being killed under memory pressure and reloaded, sometimes in a loop. The reporter notes Safari's limit is a memory budget, not physical RAM, and comparable Android devices handle several times more. — [WebKit bug 300782](https://bugs.webkit.org/show_bug.cgi?id=300782)
  - There are also reports of WebGL context loss on iOS 17 and memory exceedance during WASM compilation on iOS 18.4. — [Unity discussions: context lost iOS 17](https://discussions.unity.com/t/webgl-context-lost-ios-17-safari/930432); [WebKit bug 291677](https://bugs.webkit.org/show_bug.cgi?id=291677)
  - Phaser users report crashes on older iPhones and iPads and during preload texture creation. Switching from WebGL to Canvas reduced the crashes. — [Phaser Discourse](https://phaser.discourse.group/t/webgl-iphone-ipad-and-other-devices-web-page-crash/4971)
  - Three.js users report iPhone Safari crashes on complex scenes. — [three.js forum](https://discourse.threejs.org/t/safari-any-web-browser-crash-on-iphone-when-use-webgl/81629)
  - CrazyGames disables Unity games on iOS by default because of crashes, and uses DPR 1 on iOS and low-memory Android. — [CrazyGames technical](https://docs.crazygames.com/requirements/technical/)
  - YouTube Playables caps the JS heap at 512 MB. — [Playables stability](https://developers.google.com/youtube/gaming/playables/certification/requirements_stability)
- **Save data:**
  - Mobile Safari aggressively clears storage from iframed content. Poki mitigates this by syncing localStorage to its servers. — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
  - Poki requires localStorage in try/catch for incognito. — [Poki requirements](https://developers.poki.com/guide/requirements-quality)
  - Save size limits: Playables < 3 MiB (ideally < 500 KiB). Telegram CloudStorage allows 1,024 keys × 4,096 chars, and DeviceStorage 5 MB. — [Playables](https://developers.google.com/youtube/gaming/playables/certification/requirements_stability); [Telegram](https://core.telegram.org/bots/webapps)
- **Browser support:** CrazyGames expects Chrome and Edge, disables games that fail on Safari, and disables games that fail on 4 GB Chromebooks. Yandex rejects games failing on any listed browser or OS. — [CrazyGames technical](https://docs.crazygames.com/requirements/technical/); [Yandex moderation](https://yandex.com/dev/games/doc/en/concepts/moderation)
- **WebGPU:** about 68% of Poki players are WebGPU-capable (June 2026), so Poki advises treating it as an enhancement. — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
- **Embedded sandboxes:** Discord's CSP and proxy blocks un-mapped external requests, so URL Mappings need configuring and local tunnels behave differently from production. — [Discord networking docs](https://docs.discord.com/developers/activities/development-guides/networking)

### Inferences
- An "iOS Safari / mobile hardening" plugin would cover a cluster of near-universal bugs:
  - AudioContext unlock on first gesture
  - texture memory budgeting and a DPR cap
  - context-loss recovery
  - a Canvas fallback for Phaser
  - safe-area CSS
  - `user-select: none`
  - portrait layout testing
- A "save layer" plugin with try/catch localStorage, a portal cloud-save adapter (Poki/CrazyGames Data/Telegram CloudStorage/Playables) and size checks matches documented pain.
- For R3F/Three.js output, automatic asset pipelines (Draco/meshopt, KTX2/Basis, audio transcoding, atlas packing, shader warm-up, lazy loading) map directly to platform size limits and the measured conversion gains.

### Gaps
- No large-sample data on how often iOS WebGL crashes or audio bugs cause rejections.
- No data on WebGL memory limits per iOS version from Apple.
- No primary data on R3F-specific issues.

---

## 3. Monetization, discoverability, first players and analytics

### Takeaway
For small devs, web ad income per play is low (roughly $1–5 per 1,000 plays in anecdotal reports) and heavily top-skewed. Portals pay only after a game passes a soft launch. Outside portals, discoverability is the main barrier: itch.io indexing is opaque, jam traffic decays in days, and the developer survey cites revenue and audience size. Analytics is fragmented, since every portal has its own dashboard and itch view counts are unreliable.

### Cited Findings
- **Per-play revenue anecdotes:**
  - €556.92 from 451,327 CrazyGames plays across 8 WebGL games, about €1.20 per 1,000 (older games, around 2018).
  - Another reported about $5 per 1,000 plays (50K plays ≈ $250).
  - Guide claims of "$200–$2,000/month" for a well-performing casual portal game are secondary.
  - "the median is close to zero" (secondary). — [froessell Substack](https://froessell.substack.com/p/15000-from-one-browser-game-the-math); [Cinevva (secondary)](https://app.cinevva.com/guides/web-game-monetization); [Playfox (secondary)](https://playfox.org/news/indie-dev-revenue/)
- **Modelled economics (blog author's own model, not actual data):** $1/$5/$15 per 1,000 sessions, 1–3 ads per session, eCPM of $2/$5/$10 and a 50% share. At those rates, 15M/3M/1M sessions are needed for $15K. — [froessell Substack](https://froessell.substack.com/p/15000-from-one-browser-game-the-math)
- **Survey on economics:** 36% of devs say there is insufficient revenue in web gaming, while 47% see web as a new revenue driver. 58% of players play web games because they're free. — [Poki State of Web Gaming 2026](https://poki.com/blog/state-of-web-gaming-report-2026)
- **No revenue during testing:** CrazyGames Basic Launch runs with ads off and no revenue. — [CrazyGames FAQ](https://docs.crazygames.com/faq/)
- **Monetization restrictions:** Poki allows no IAP or "remove ads" UI. — [Poki requirements](https://developers.poki.com/guide/requirements-quality). CrazyGames offers IAP only for selected Full Launch games, via Xsolla. — [CrazyGames intro](https://docs.crazygames.com/requirements/intro/). Facebook is removing banners and rewarded interstitials. — [Meta banner ads doc](https://developers.facebook.com/documentation/games/monetize/in-app-ads/banner-ads)
- **Discoverability on itch.io:**
  - Games getting about 1,000 plays a day stayed invisible in search, and developers can't tell whether the game is queued or broken.
  - Jam traffic mostly arrives in the first 3–5 days.
  - Unknown developers struggle to get plays, and responders advise marketing a direct link rather than relying on tags. — [itch.io thread](https://itch.io/t/4980134/my-game-isnt-discoverable-on-itchio-despite-hundreds-of-plays-in-first-hours); [itch.io: how long to get noticed](https://itch.io/t/5294588/how-long-does-it-usually-take-for-a-first-game-to-get-noticed-on-itch)
  - itch.io has 900,000+ games as of 2026 (opinion article). — [DEV Community](https://dev.to/ziva/the-900000-game-problem-why-most-indie-games-never-get-found-4lda)
- **Web as discovery for players:** 62% of players downloaded or bought a game after discovering it on web. — [Poki report 2026](https://poki.com/blog/state-of-web-gaming-report-2026)
- **Onboarding:** web players behave "more like TikTok viewers than Steam users". Show strong abilities for about 10 s and avoid text tutorials (players didn't recognize a "space" key label, so an image of a keyboard was used instead). — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
- **Analytics reliability:** itch view counts vastly exceed what external analytics records ("200 views ... only 1 actual person"). — [itch.io forum](https://itch.io/post/737677/view-in-topic). Portal dashboards: Poki has custom game analytics, and CrazyGames has plays, revenue, engagement, geography and negative-rating reasons. — [Poki for Developers](https://developers.poki.com/); [CrazyGames FAQ](https://docs.crazygames.com/faq/)
- **Session-length differences:** sessions were a few minutes on CrazyGames versus over an hour on itch.io for the same game (SuperWEIRD). — [80.lv](https://80.lv/articles/how-this-indie-dev-kept-their-game-on-the-front-page-of-itch-for-an-entire-month)

### Inferences
- A self-hosted "link-published" game earns nothing from portal ads unless it is submitted to portals or has its own ad stack. For an AI studio, plugins for (a) portal submission packaging and (b) lightweight self-hosted analytics (load-to-play conversion, D1 retention, session length, funnel drop-off) fill a clear gap between "link shared" and "portal accepted".
- Conversion-to-play and first-10-seconds engagement are the metrics that gate portal promotion. A plugin that measures time-to-interactive and first-input time, then flags slow starts, start menus and text tutorials, matches Poki's advice.

### Gaps
- No reliable published eCPM or RPM for Poki or CrazyGames.
- No official data on the share of developers earning more than $X.
- No Reddit r/WebGames or r/html5games quantitative data surfaced in searches.

---

## 4. Community data, jams, playtesting, store assets and localization

### Takeaway
Playtesting on web is increasingly platform-provided: Poki's video playtests arrive within minutes, and CrazyGames runs a Basic Launch with real players. Store assets (covers, gameplay videos) are mandatory and A/B testable on CrazyGames. Localization data is thin: English is the only documented hard requirement. JS-native jams remain small (js13k had about 200 entries a year).

### Cited Findings
- **js13kGames:** 197 entries in 2025 (14th edition) versus 187 in 2024. Categories: Desktop, Mobile, Online, WebXR, Decentralized. Criteria: Theme, Innovation, Gameplay, Graphics, Audio, Controls. — [js13kGames 2025 winners (DEV)](https://dev.to/js13kgames/js13kgames-2025-winners-announced-20nl); [js13kGames 2024 winners (DEV)](https://dev.to/js13kgames/js13kgames-2024-winners-announced-2hkb)
- **Phaser** claims "more than 150,000 developers" and partners with Reddit on Devvit hackathons with an official template. — [Phaser news](https://phaser.io/news/2026/06/reddit-and-phaser-launch-a-40-000-game-dev-hackathon)
- **Playtesting:**
  - Poki Playtests return 10–20 recorded real-player sessions within minutes, with input overlays, and several builds can go up per day. — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
  - Cannon Clash removed its intro animation after Poki Playtests. — [Poki Cannon Clash](https://poki.com/blog/how-we-made-cannon-clash-load-fast-and-boosted-conversion)
  - Emolingo (5 staff, 8 Poki games all past 10M plays, Rainbow Obby at 100M plays): about 3 months from concept to release, plus about 1 month of polish (bugs, tutorials, UX). Uses Poki Playtest once feature-complete and soft-launches to its 100K+ member Discord. — [Poki/Emolingo](https://poki.com/blog/how-emolingo-games-built-business-html5-web-games-poki)
  - Discord design advice: playtesting showed collaborative design works better than PvP for new players (Mojiworks). — [Discord case study: Mojiworks](https://discord.com/build-case-studies/mojiworks)
- **Store assets:**
  - CrazyGames requires a description, controls and covers (images and videos). — [CrazyGames intro](https://docs.crazygames.com/requirements/intro/)
  - Cover A/B experiments: up to 2 a month, 14 days max each. — [CrazyGames FAQ](https://docs.crazygames.com/faq/)
  - The Bolt Pit dev used Claude Code to draft store copy from the build and prepared a cover and gameplay clip. — [froessell Substack](https://froessell.substack.com/p/15000-from-one-browser-game-the-math)
- **Localization:**
  - CrazyGames rejects games missing English support. — [CrazyGames FAQ](https://docs.crazygames.com/faq/)
  - Poki reaches players in 193 countries. — [Poki 2025 review](https://poki.com/blog/2025-at-poki-a-year-in-review)
  - CrazyGames' audience is concentrated in the US, UK and AU. — [CrazyGames FAQ](https://docs.crazygames.com/faq/)
  - Poki advises replacing text with visual control hints. — [Poki blog 2026](https://poki.com/blog/building-web-browser-games-2026)
- **Content safety:** CrazyGames requires PEGI-12 and no kid-targeted content. Poki requires profanity filters for usernames. The Reddit hackathon bans "obvious AI slop". — [CrazyGames FAQ](https://docs.crazygames.com/faq/); [Poki requirements](https://developers.poki.com/guide/requirements-quality); [Phaser/Reddit](https://phaser.io/news/2026/06/reddit-and-phaser-launch-a-40-000-game-dev-hackathon)

### Inferences
- Plugins for auto-generating store assets have clear demand: covers in several aspect ratios, a short gameplay video or GIF captured from an automated play session, descriptions, controls text and tags. A/B covers measurably matter on CrazyGames.
- An automated playtest-recording plugin (headless or real-user session replay with input overlay) would replicate Poki's highly valued playtest loop for games hosted outside Poki.
- Since originality and "AI slop" are explicit rejection criteria, a studio generating many games should invest in quality and originality checks before submission.

### Gaps
- No quantitative data on how web devs localize or which languages pay off.
- No data on trailer or thumbnail production practices beyond platform requirements.
- No GDC 2023–2026 web-game talk content was retrieved in this pass.
- HTML5GameDevs forum and Phaser Discord pain-point frequency were not quantified.
