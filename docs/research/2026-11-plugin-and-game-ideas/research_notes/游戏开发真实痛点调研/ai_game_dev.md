# AI-Assisted Game Creation 2024–2026: Adoption, Failure Modes, and AI-Native Tools

(Research run 2026-11-24. About 17 search/fetch calls. Many items below come from secondary coverage or vendor blogs, and each is flagged where that applies.)

## (a) Adoption and use cases of AI in game development

### Takeaway
Developer surveys show steady but not explosive generative-AI use. GDC found 36% of game professionals using it in the Jan 2026 report and 40% in the Nov 2026 update. Use leans heavily toward LLM research, brainstorming and code assistance, not shipped art. Google/Harris's "87% use AI agents" is a much broader, vendor-sponsored framing. Steam disclosures, meanwhile, grew about 7–8x from 2024 to 2025, so roughly 1 in 5 new 2025 releases disclose GenAI, mostly visual assets. Developer sentiment is worsening even as use rises.

### Cited Findings
**GDC State of the Game Industry (Jan 2026 report, more than 2,300 respondents)**
- 36% of game industry professionals use generative AI tools as part of their job. The rate is 30% at game studios and 58% at publishers, support, marketing and PR firms. Business professionals use it most, at 58% — [GDC](https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/)
- Tools used: ChatGPT 74%, Google Gemini 37%, Microsoft Copilot 22%. LLMs are the dominant category — [GDC](https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/)
- Use cases among AI users: research and brainstorming 81%, daily tasks such as email 47%, code assistance 47%, prototyping 35%. The GDC article gives no asset-creation figure — [GDC](https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/)
- Sentiment: 52% think GenAI is having a negative impact on the industry, up from 30% the year before and 18% the year before that. Only 7% see it as positive, down from 13%. Negative views are highest among visual and technical artists (64%), design and narrative staff (63%) and programmers (59%) — [GDC](https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/); also [80.lv](https://80.lv/articles/gdc-survey-over-50-of-game-devs-say-generative-ai-harms-industry)
- Company-level figures from the same survey, as reported by VGC: 52% say their companies use GenAI tools, 9% say their companies are interested (down from 15%), and 27% say their companies have no interest (up 9 points) — [VGC](https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use)
- 80.lv headline for a GDC 2026 survey: "55% of developers consider AI's impact on games negative." This differs from GDC's 52%, possibly because it is a different release or wording. Verify before citing — [80.lv](https://80.lv/articles/gdc-2026-survey-55-of-developers-consider-ai-s-impact-on-games-negative/)

**GDC November 2026 follow-up survey (more than 2,600 respondents, 69 countries; secondary coverage)**
- 40% use GenAI in their work, up from 36%. The rate is 38% in the US (within the margin of error) and 44% outside the US. By discipline: business operations 63%, marketing and PR 51%, programming 48% — [GamingOnLinux](https://www.gamingonlinux.com/2026/11/gdc-november-2026-survey-shows-40-percent-of-developers-using-generative-ai/)
- 27% of AAA workers say they are "encouraged or pressured" to use GenAI. 62% of educators permit, push or mandate AI in coursework — [GamingOnLinux](https://www.gamingonlinux.com/2026/11/gdc-november-2026-survey-shows-40-percent-of-developers-using-generative-ai/)
- Developer quotes: "It helps with code generation; productivity is higher" (senior programmer). "It does not and cannot build the game for us" (disabled indie founder, who credits AI with removing accessibility barriers). "It is already stopping us from hiring juniors." "Great for tightening a screw, not great for painting a wall." — [GamingOnLinux](https://www.gamingonlinux.com/2026/11/gdc-november-2026-survey-shows-40-percent-of-developers-using-generative-ai/)

**Google Cloud / Harris Poll (fielded late June to early July 2025, n=615 developers in the US, South Korea, Norway, Finland and Sweden)**
- 87% of developers use AI agents in their work. Agent uses: content optimization 44%, dynamic gameplay balancing 38%, in-game coaching and tutorials 38%. 47% use AI to speed up playtesting and balancing, 45% for localization. More than a third use AI for creative elements such as level design and dialogue. 94% expect lower development costs over 3 or more years — [Google Cloud report PDF](https://services.google.com/fh/files/misc/global_ai_meets_the_games_industry.pdf); [PC Gamer](https://www.pcgamer.com/software/ai/87-percent-of-game-developers-are-already-using-ai-agents-and-over-a-third-use-ai-for-creative-elements-like-level-design-and-dialogue-according-to-a-new-google-survey)
- Caveat: Decrypt framed the 87% as agents that "adapt to players in real time," which is narrower than the report's wording. Google sells AI agents, so its definition of "agent" is broad — [Decrypt](https://decrypt.co/335721/ai-agents-taking-over-game-development)

**Steam AI disclosures**
- Valve has required AI disclosure since January 2024. A July 2025 Totally Human Media analysis by Ichiro Lambe (Steam API data) counted about 7,818 titles disclosing GenAI, about 7% of roughly 114,126 games. Just under 20% (about 1 in 5) of 2025 releases disclosed GenAI. There were about 1,000 disclosing titles in 2024, so growth was reported as 681% (Tom's Hardware) or "about 800%" (VGC and others) — [Tom's Hardware](https://www.tomshardware.com/video-games/pc-gaming/1-in-5-steam-games-released-in-2025-use-generative-ai-up-nearly-700-percent-year-on-year-7-818-titles-disclose-genai-asset-usage-7-percent-of-entire-steam-library); [VGC](https://www.videogameschronicle.com/news/steam-games-disclosing-generative-ai-use-are-up-800-this-year/); [PC Gamer](https://www.pcgamer.com/software/ai/the-boffin-behind-valves-steam-labs-says-the-number-of-steam-releases-featuring-genai-in-2025-is-1-in-5-with-7-percent-of-all-games-on-there-now-incorporating-it-weve-octupled-last-years-figure)
- Visual asset generation made up about 60% of disclosures, with audio next — per search-result summaries of [80.lv](https://80.lv/articles/the-number-of-steam-games-featuring-gen-ai-has-increased-eightfold-in-a-year) and [Tom's Hardware](https://www.tomshardware.com/video-games/pc-gaming/1-in-5-steam-games-released-in-2025-use-generative-ai-up-nearly-700-percent-year-on-year-7-818-titles-disclose-genai-asset-usage-7-percent-of-entire-steam-library). I did not verify the 60% against the primary source.
- Conflict: VGC's January 2026 article says "nearly 8,000 titles in the first six months of 2025." Other outlets describe the 7,818 as cumulative across the whole library. Treat 7,818 as the cumulative figure — [VGC](https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use)
- In January 2026 (reported January 17, spotted by GameDiscoverCo's Simon Carless), Valve rewrote the disclosure rules. Developers must disclose (1) AI-generated content in the game, store page or marketing, and (2) AI content generated live during gameplay. "AI-powered tools" such as code assistants explicitly do **not** require disclosure — [VGC](https://www.videogameschronicle.com/news/valve-has-significantly-rewritten-steams-rules-for-how-developers-much-disclose-ai-use)

**Player sentiment**
- GameDiscoverCo survey of about 3,800 Steam users (mid-2026, self-selected): 31% react negatively to AI in games and 43% are fine with it. Only 8% would never buy a game because of AI — [GamesRadar](https://www.gamesradar.com/games/survey-finds-only-31-percent-of-steam-users-have-a-problem-with-ai-in-games-with-43-percent-totally-fine-with-it/); [Gamereactor](https://www.gamereactor.eu/only-8-of-steam-users-say-they-wouldnt-buy-a-game-if-it-contained-ai-1745073/)
- Circana PlayerPulse (US, December 2025): just over 25% said knowing a game used GenAI for art, dialogue, text or music would make them less likely to buy it, or would stop them buying it — per search-result summary; source listed among [Respawn/Outlook](https://respawn.outlookindia.com/gaming/gaming-news/do-gamers-care-about-genai-new-data-reveals-a-silent-majority) and [MIDiA](https://www.midiaresearch.com/blog/new-research-what-do-gamers-really-think-about-generative-ai-in-games). Attribution not verified.
- A survey run October to December 2025 found 85% negative and 62% "very negative," with only 7.6% approving. The underlying survey's identity was unclear — [Boing Boing](https://boingboing.net/2025/12/20/survey-finds-very-negative-attitude-toward-gen-ai-in-games.html)
- G2A 2026: 34% of frequent gamers say only game quality matters, and 27% would prefer to avoid AI but would buy if reviews were excellent — [G2A](https://www.g2a.com/news/features/gaming-entries/what-players-think-about-ai-in-games/)
- Players suspect hidden use: a poll found many believe developers hide AI use despite Steam's disclaimers — [PC Guide](https://www.pcguide.com/news/pc-gamers-remain-skeptical-of-steams-ai-disclaimers-poll-shows-many-believe-game-devs-are-hiding-it/)

### Inferences
- The main legitimate use today is code, prototyping and research help. AI-generated art and audio are what trigger disclosure and backlash. A studio product should treat visible AI assets as a reputational risk, so it needs disclosure metadata, provenance tracking, and easy swap-in of human or licensed assets.
- Since Steam now exempts code assistants, a web-game studio could auto-generate an accurate "AI content disclosure" manifest from its asset log, covering which assets were generated, by which model, and whether content is generated at runtime.
- Hostile minorities exist (8–25% refuse or are less likely to buy), but quality matters more for most players. Polish tooling is therefore worth more than hiding AI.

### Gaps
- I did not retrieve the a16z games survey or Unity's 2025/2026 Gaming Report AI figures. These were not searched within the call budget.
- I have no per-year Steam disclosure series for 2026. The latest hard count found is from July 2025.
- I did not verify the "60% visual assets" breakdown in the primary Totally Human data.

## (b) Failure modes when using AI coding agents and generative asset tools to make games

### Takeaway
The evidenced pain points repeat across sources:
1. The agent cannot reliably see or playtest the running game, especially in real time or with physics. It often falsely reports "works perfectly."
2. Codebases decay as features accumulate, and fixes break other features.
3. Generated art is inconsistent across assets and especially across animation frames. AI pixel art has off-grid and anti-aliasing artifacts.
4. 3D output needs retopology and rigging cleanup, and animation is the biggest gap.
5. Game feel and "fun" are not achieved by one-shot generation, and demos feel "lifeless."
6. The model confuses engine versions (Godot 3 vs 4).

### Cited Findings
**Agent cannot see or test the game**
- On "Letting AI play my game" (HN, 2026), the author built a playtest server and skill for a text-based, turn-based game. AI was good at validating known features against a spec ("the part that saved the most time") but poor at finding unexpected bugs or exploits, such as walking through a wall into a locked room. The longest session took about 300K tokens. Running it after each feature as a regression check was "pretty cheap" — [HN 47947525](https://news.ycombinator.com/item?id=47947525)
- In the same thread, a physics-game developer said testing via browser MCP was "nearly impossible" because "the player shot off the map and into deep space" between screenshots. Even with a physics step API: "I keep occasionally getting 'I tested it and it works perfectly!'" while the player was visibly stuck in a planet — [HN 47947525](https://news.ycombinator.com/item?id=47947525)
- Raw DOM "ate tens of thousands of tokens per call," and accessibility-tree references cut usage by about 10x. Code-only testing produced hallucinated selectors, and browser-only testing missed project conventions. Another developer said text harnesses fit "only a small subset of games" and switched to pixel and OS-input testing. Others preferred deterministic bots or headless Monte Carlo simulation ("I can run millions of simulated games headless") over per-turn LLM play — [HN 47947525](https://news.ycombinator.com/item?id=47947525)
- Godogen (Show HN, 337 points, 205 comments) is a set of Claude Code skills that generate Godot 4 games. It uses a separate Gemini Flash vision agent that sees only screenshots, not code, because a coding agent is "biased toward its own output." That agent catches z-fighting, floating objects and physics explosions — [HN 47400868](https://news.ycombinator.com/item?id=47400868)
- "A jump that feels floaty compiles fine and reads fine." One HN commenter still relies on "logs & actually playing the game." Others say AI is weak on visual detail and "consistency is a foreign word to it" — per search-result summary of HN threads [48899787](https://news.ycombinator.com/item?id=48899787) and [50078115](https://news.ycombinator.com/item?id=50078115). Not fetched in full.
- A top comment on an Epic Games story said AI "doesn't do physics, materials, SFX or 'fun' very well" — per search summary of [HN 50062237](https://news.ycombinator.com/item?id=50062237)
- Decrypt's Claude test: the first game never launched, and the author had to report that back to the model before a second attempt worked — [Decrypt](https://decrypt.co/311183/we-built-game-vibe-coding-ai-claude)

**Codebase decay and regressions**
- A developer building a JS game with Claude Code said the spaghetti "quickly became … unacceptable" and output got sloppier as game modes were added — [codercowboy.com](https://www.codercowboy.com/2026/05/15/vibe-coding-with-claude/)
- Adding one component often broke another, and an unfixable slow feature had to be reverted — [Ten Mile Square](https://tenmilesquare.com/resources/artificial-intelligence-ai/my-takeaways-from-vibe-coding-with-claude/)
- In the chat interface (not Claude Code), the game often broke after adding a new screen, apparently because code was rewritten rather than amended — [EvilTester](https://www.eviltester.com/vibe-coding-game-with-claude-ai-chat/)
- Mitigation reported: a CLAUDE.md with hard rules on patterns, folder structure and dependencies noticeably improved consistency — [DEV](https://dev.to/ninghonggang/three-weeks-of-vibe-coding-with-claude-code-and-what-it-taught-me-9o0). Vendor-adjacent advice recommends Git, tests and a closed loop — [ai-game.dev](https://ai-game.dev/blog/vibe-coding-games)
- Godot-specific: commenters reported Claude confusing Godot 3 and 4 APIs. Godogen's author built a custom GDScript reference (language spec, API docs converted from Godot XML, a "quirks database") that the agent lazy-loads — [HN 47400868](https://news.ycombinator.com/item?id=47400868)

**Polish, taste and fun**
- XDA's vibe-coded game needed explicit prompts for sprites, UI polish and a title screen before it felt finished — [XDA](https://www.xda-developers.com/i-vibe-coded-a-fully-functional-game-with-claude-code-and-it-doesnt-look-vibe-coded-at-all/)
- Godogen critiques: demos "felt really lifeless," the "racing game" was "a car following a set path," and it is "a powerful way to generate mediocre games." The author's cost estimate was about $5–8 all-in for the snowboarding demo — [HN 47400868](https://news.ycombinator.com/item?id=47400868)

**Art and animation consistency**
- In Godogen, animation is the self-described main gap. Commenters called the 2D sprites "a bit of a mess" and pointed to walk-cycle techniques as a possible fix — [HN 47400868](https://news.ycombinator.com/item?id=47400868)
- Typical AI pixel-art failures are off-grid pixels, mixed pixel sizes, hundreds of near-identical colors and anti-aliased edges. In animation, frames "blur, warp, or slide across the grid" and motion is "smoothed instead of keyed." This is vendor content — [Retro Diffusion blog](https://retrodiffusion.ai/blog/ai-pixel-art-isnt-pixel-art)
- Tools are decent at static sprites but struggle with coherent animation frames (commercial source) — [freegamesprites.com](https://freegamesprites.com/en/news/ai-pixel-art-generation-2026-tools-and-workflows)
- Academic: keeping style, proportions and detail consistent across sprite frames takes a lot of manual effort. Pose estimators struggle with sprites' exaggerated proportions, occluding costumes and non-standard poses — [Sprite Sheet Diffusion, arXiv 2412.03685](https://arxiv.org/html/2412.03685v2)

**3D game-readiness**
- A G2 user says Meshy's "topology and mesh optimization still need improvement for game-ready assets" — [G2](https://g2.com/products/meshy/reviews)
- An aggregated review summary (195 reviews) says Tripo's meshes "often require manual cleanup and retopology for production-ready pipelines" — [Tooliverse](https://tooliverse.ai/tools/tripo)
- Tripo's Smart Mesh test produced about 10K faces with no retopology step, judged usable in-engine — [Level Up / gitconnected](https://levelup.gitconnected.com/tripo-ais-new-smart-mesh-feature-60-faster-33-cheaper-c9278f0579f3?gi=5c0931158ecd)
- Comparisons say Meshy 6 offers quad meshes and A/T-pose control for rigging, and Tripo offers strong auto-rigging. Many of these comparisons are Tripo-published, so treat them as vendor claims — [3D AI Studio](https://www.3daistudio.com/blog/hitem3d-vs-meshy-vs-tripo-comparison); [Tripo comparison](https://www.tripo3d.ai/compare/tripo-vs-meshy); [ai-game.dev](https://ai-game.dev/blog/best-ai-3d-model-generators-for-games)

**Vibe Jam as a benchmark**
- Vibe Jam 2025 (Pieter Levels): over 1,000 entries (other sources say 1,170) from more than 50 countries. Rules required browser-playable games with mostly AI-written code. Judges were Andrej Karpathy, Levels and a panel. Prizes were $10K, $5K and $2.5K. 2nd place was Vibeware by @mattgordonxyz — [Vibe Jam 2026 press](https://vibejam.com/2026/press); [Indie Hackers](https://www.indiehackers.com/post/Uz0wHG4pI3KBOiFhP5YR); [playonray](https://playonray.com/blog/levelsio-vibe-jam-winners-ray-vibe-awards)
- Vibe Jam 2026 ran April 1 to May 1, 2026 and required at least 90% AI-written code. It also required no login, free play in the browser, no loading screens or heavy downloads, and preferred multiplayer. Prizes were $25K, $10K and $5K. Sponsors were Cursor (Diamond), Bolt.new, Glif and Tripo AI. Three.js was recommended. There were 945 submissions per the press page — [Vibe Jam 2026 press](https://vibejam.com/2026/press)
- Colyseus counted 48 of 945 entries (about 5%) using its multiplayer framework. It claimed "the bar is much higher than 2025," with more progression, persistence and full game loops. This is vendor content — [Colyseus](https://colyseus.io/blog/vibe-jam-2026/)
- The 2025 jam's sponsors conflict between sources (Bolt.new, CodeRabbit and Lambda per Indie Hackers, versus "no sponsor" elsewhere) — [Indie Hackers](https://www.indiehackers.com/post/Uz0wHG4pI3KBOiFhP5YR); [vibecoding.app](https://vibecoding.app/events/recap/pieter-levels-vibe-code-game-jam-2025)

### Inferences
- The strongest-evidenced need is a **closed-loop playtest plugin**, with several parts:
  - a deterministic game-state and step API (pause, step N frames, query entity state) exposed as tools;
  - a screenshot or video-frame capture tied to the step API, so frames are not missed between screenshots;
  - a separate vision "critic" agent that sees only pixels and compares them against a reference or art bible;
  - accessibility-tree or compact state serialization rather than raw DOM, for token cost;
  - headless bot or Monte Carlo simulation for balance;
  - a regression run after every feature.
- The agent's "it works perfectly" claims need hard verification gates, such as asserting on state values or diffing screenshots.
- A **project-memory and architecture-guard plugin** would counter codebase decay: CLAUDE.md-style rules, engine-version-pinned API reference packs (like Godogen's GDScript quirks DB), module boundaries, and tests. Three.js and Phaser API reference packs fit a web-game focus.
- An **asset-consistency plugin** would anchor every generation to a style guide or palette and reference character sheet. For pixel art it would post-process with grid snapping, palette quantization and anti-alias removal, then validate frame-to-frame consistency.
- Animation is the most-cited asset gap. Possible routes include skeletal or 2D bone animation, procedural tweening, or specialized sprite-animation models.
- A **3D game-readiness step** would cover polycount and LOD checks, retopology, auto-rig, and glTF validation and compression for web budgets.
- A **game-feel tuning plugin** would expose parameter knobs for jump curves, coyote time and screen shake, and send the human short playable builds. Fun is unverifiable by AI per multiple sources.

### Gaps
- I found no systematic dataset of vibe-coding game failures. Everything above is anecdotal (HN, blogs).
- I did not retrieve r/gamedev, r/aigamedev or r/ClaudeAI threads directly. Search returned only vendor and blog content for sprite-consistency complaints.
- I found no specific sources on fly.pieter.com lessons (e.g., the hacking and cheating and multiplayer-sync issues) within budget.
- I found no evidenced data on audio, SFX, music or voice failure modes. That area was not covered.
- Asset licensing worries for vibe-coded games came up only indirectly (Unity copyright liability; Astrocade "copyright infringement" review).

## (c) AI-native game creation products and user complaints

### Takeaway
Browser-first "prompt to game" products (Rosebud, Astrocade) are seen as good for quick prototypes and jams but not production. The top complaints are that the AI misunderstands intent, complex logic needs many retries, there is no deep engine or 3D support, and there is copyright or "slop" concern. Engine-vendor assistants (Unity Muse, now Unity AI) had poor initial reception and dataset-transparency backlash. 3D generators (Meshy, Tripo) are valued for speed, but topology and rigging still need cleanup.

### Cited Findings
- **Rosebud AI**: the most common complaint is that the AI misreads what users want. Rephrasing beats restarting, complex logic needs several attempts, and very specific requests confuse it — [soonlab.ai](https://www.soonlab.ai/blog/rosebud-ai-review/). It suits quick browser prototypes and jams but lacks deep engine features, full 3D and exports beyond browser links. This is a blog quoting Reddit, possibly SEO content, and some "Rosebud AI" reviews conflate it with a journaling app — [nilo.io](https://nilo.io/articles/rosebud-ai-reviews-reddit)
- **Astrocade**: a Trustpilot reviewer cites "copyright infringement, predatory scrolling, and heavy use of AI." Another said guardrails were too restrictive for a meme game. These are individual reviews — [Trustpilot](https://www.trustpilot.com/review/astrocade.com). A blog quoting r/vibecoding says "none of these tools yet produce production-ready commercial games" and that quality varies — [soonlab.ai](https://www.soonlab.ai/blog/astrocade-ai-review/)
- **Unity Muse to Unity AI**: Unity 6.2 introduced Unity AI, replacing Muse and Sentis. It uses third-party models, where Muse used Unity first-party models. Unity places copyright liability on the user — [Digital Production](https://digitalproduction.com/2025/08/22/unity-6-2-welcomes-ai-but-pace-caution-user-liability-on-copyright/); [unity.com/ai](https://unity.com/AI). A Japanese report says Unity AI entered open beta on May 2 (2026) and is included in Pro, Enterprise and Industry plans. I did not verify this, and the timeline may conflict with the 6.2 beta in 2025 — [Impress Forest Watch](https://forest.watch.impress.co.jp/docs/news/2113370.html)
- Muse complaints: it refused to edit a basic script, saying it is better for the user to learn — [Unity Discussions](https://discussions.unity.com/t/today-muse-refused-to-edit-a-basic-script-for-me-stating-it-is-better-for-me-to-learn/289247). Responses got truncated — [Unity Discussions](https://discussions.unity.com/t/muse-chat-responses-get-cut-off-or-truncated-partway-through/337372). Threads titled "Not impressed" — [Unity Discussions](https://discussions.unity.com/t/not-impressed/1586327). Developer Mike Bithell asked Unity to disclose training datasets, citing legal risk — [PC Gamer](https://www.pcgamer.com/artists-and-developers-worried-about-unitys-ai-programs-have-been-given-a-big-shrug)
- **Meshy / Tripo**: see the topology and rigging findings in (b). Tripo AI sponsored Vibe Jam 2026, a sign that it targets web and vibe-coded games — [Vibe Jam 2026 press](https://vibejam.com/2026/press)
- **Retro Diffusion**: trained pixel-art models and an Aseprite extension. It markets its fixes for off-grid and anti-aliasing problems in generic AI pixel art — [itch.io](https://astropulse.itch.io/retrodiffusionai); [Retro Diffusion blog](https://retrodiffusion.ai/blog/ai-pixel-art-isnt-pixel-art)
- **Agent-built pipelines** (community): Godogen combines Gemini for 2D images, Tripo3D for 3D, background removal, sprite sheets and a vision QA agent. This is the closest open-source analogue to the planned studio. Its stated gaps are animation, physics feel and polish — [HN 47400868](https://news.ycombinator.com/item?id=47400868)
- **Microsoft Muse** (gameplay-ideation model, different from Unity Muse) drew developer backlash in February 2025 — [Slashdot/Wired](https://games.slashdot.org/story/25/02/22/0244244/)

### Inferences
- Consumer prompt-to-game tools fail at **intent capture and iteration on complex logic**. An open-source studio should invest in a structured game design doc and spec step, plus incremental edits rather than regenerating everything.
- Export, ownership and licensing transparency is a differentiator. Complaints center on browser-only exports, copyright exposure and opaque training data. Plugins could record per-asset model and license provenance, and support self-hosted or open-weight models.
- A one-click web publish step (itch.io, static hosting, Vibe Jam-style constraints of no login and fast load) matches where AI-made games actually ship.

### Gaps
- I found no review data for Bezi, Ludo.ai, Scenario.gg, Layer.ai, PixelLab, Jabali, Roblox Assistant/Cube 3D, Google Genie 3 or Godot AI plugins. The searches returned nothing usable within budget.
- I found no Product Hunt ratings and no usage or retention numbers for any AI-native game maker.
- I found no evidenced findings on audio, SFX, music or voice tools (ElevenLabs, Suno, etc.) for games.
