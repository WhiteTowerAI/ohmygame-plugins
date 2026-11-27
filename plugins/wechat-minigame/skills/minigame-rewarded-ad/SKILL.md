---
name: minigame-rewarded-ad
description: Add rewarded video ads to a WeChat or Douyin mini game so the reward is granted only for a finished ad and the game is never left paused, and check the build's packages against the platform's size limits before previewing or uploading.
---

# Rewarded video ads and package size for mini games

Use this when a WeChat (`wx`) or Douyin (`tt`) mini game needs a rewarded video ad, such as "watch an ad to revive" or "double the reward", and to check package size after a mini-game build. It works with the engine's own mini-game output (Cocos Creator's `wechatgame` or `bytedance-mini-game` build, or the platform's Unity conversion). The ad unit id comes from the person's ad platform account; never invent one.

## Rewarded video

Copy `reference/rewarded.ts` into the game's source (for Cocos, under `assets/scripts/`). It wraps `wx.createRewardedVideoAd` and `tt.createRewardedVideoAd`, and stands in for the ad in a local preview (such as OhMyGame's), so the game keeps running there:

```ts
import { rewarded } from "./rewarded";

const ad = rewarded("adunit-xxxxxxxx");

// In the scene that has the button: show it only while an ad is ready.
const stop = ad.watch((available) => (reviveButton.active = available));
// When the scene goes away: stop();

reviveButton.on("click", async () => {
  const { result } = await ad.show({
    pause: () => { game.pause(); audio.mute(); },
    resume: () => { audio.unmute(); game.resume(); },
  });
  if (result === "granted") player.revive();
});
```

What the platforms' rewarded-video docs require, and how the file does it. Check each in the code before saying the ad is done:

1. **One ad object per game.** On both platforms `createRewardedVideoAd` returns a global singleton. Use one ad unit id for the game's rewarded ad; `rewarded()` returns the same controller for it everywhere, with one set of listeners, and refuses a second id (on WeChat, base library 2.8.0+, pass `platformOptions: { multiton: true }` to have one per id). Never call `createRewardedVideoAd` or `onClose` yourself as well: a second listener would grant twice.
2. **Grant only for a finished ad.** WeChat: from base library 2.1.0, `res.isEnded`; `false` means the person closed it early. Douyin: `res.count` (ads watched) when given, else `res.isEnded`. The file does this in `watched()`; grant only when `show()` returns `"granted"`.
3. **Load again when loading fails.** A show after a failed load is rejected. The file loads at once, again after every close, retries failed loads with a growing wait, and loads again when `show()` needs it. Call `ad.refresh()` when the game returns to the foreground if you like.
4. **Hide the button when no ad is available.** Each person can watch a limited number of ads a day. `watch()` tells the scene now and on every change; it is per scene, so a reloaded scene keeps working.

Good practice the file follows, not platform rules: it calls `pause` once before the ad and `resume` exactly once when the show ends, however it ends; an error while the ad is up ends the show without a reward; and a show that neither closes nor fails ends after five minutes, so the game is never left paused.

Also:

- The ad closes only when the person closes it; don't close it from code.
- WeChat from base library 3.7.7 shows a fallback share page when no ad is available (error 1004); pass `platformOptions: { disableFallbackSharePage: true }` if the game shouldn't share.
- Douyin may also offer a share when no ad fills, and then reports `count: 1` on close, so the file grants. That is the platform's own rule; check Douyin's current rewarded-video docs if the game must not grant after a share.
- For rewards worth cheating for, verify the ad server-side as the platform's guide describes; this file doesn't.
- In a local preview, set `window.__REWARDED_SIMULATE__` to `"granted"`, `"closed"` or `"unavailable"` to try each path. On any other address (a web build on a portal) the stand-in never grants. A preview can't show real ads; check on a device with the developer tool's real-device preview before uploading.

Sources: WeChat, [Rewarded Video Ad](https://developers.weixin.qq.com/minigame/en/dev/guide/open-ability/ad/rewarded-video-ad.html) and the `RewardedVideoAd` API pages; Douyin Open Platform, rewarded video ad guide and `RewardedVideoAd.onClose`.

## Package size

After building, run:

```sh
node <this skill>/reference/size-check.mjs <mini-game build folder>
```

It reads `game.json`, and the platform from `project.config.json`'s appid (`--platform wechat|douyin` to say it). It reports:

- **WeChat**: the main package against 4 MB, each independent subpackage against 4 MB, all packages against 30 MB.
- **Douyin**: the main package against 4 MB, each subpackage and all packages against 20 MB (30 MB with `--virtual-payment`, once virtual payment is on), and a game without subpackages against 20 MB.
- Engine plugins `game.json` declares (such as Cocos' engine plugin) count toward the main package; only their `plugin.json` and `signature.json` don't.
- When the main package is over, the largest asset folders to move into subpackages (never the entry, the engine or the open-data context; inside `assets/`, a bundle).

It exits with 1 when a limit is exceeded. Move assets by marking them as subpackages in the engine's build settings (Cocos: asset bundles), not by editing the generated `game.json`, and load a subpackage before using what it holds. The developer tool's own size report, on preview and upload, is the one that counts.
