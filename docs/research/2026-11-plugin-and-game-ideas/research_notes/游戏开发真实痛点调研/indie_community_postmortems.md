# Production pain points of indie and hobby game developers: community data, postmortems, and game jam data

Research date: 2026-11-24. These notes come from 25 tool calls. Wherever possible I pulled primary data directly: the paper PDFs, itch.io's jam listing, and the public Ludum Dare API at api.ldjam.com. Any ratio I computed myself is marked "(computed)".

---

## Q1. What do community and Q&A forums (r/gamedev, r/IndieDev, r/godot, r/Unity3D, gamedev.stackexchange) show as the most common problems?

### Takeaway
I found no published, vote-ranked dataset of r/gamedev or r/IndieDev "biggest struggle" threads. Reddit blocked scraping, and searches found no analysis of scraped posts. The best quantitative forum data is a peer-reviewed mining study of Game Development Stack Exchange (GDSE). In it, the most-asked production topics are 2D, collision detection, physics, shaders, 3D, textures, animation, and game design. About half of all questions never get an accepted answer. Multiplayer, animation/rigging, modding, video, and platform/export questions (iOS, Xcode) get the worst support. Small surveys of hobbyists say the top non-technical blockers are discipline, motivation, and time, then planning and scope.

### Cited Findings
**Game Development Stack Exchange mining study (Kpodjedo et al., Applied Sciences 2022, 12(21):10750)**
- Dataset: 25,534 GDSE questions from 1 Jan 2014 to 31 Dec 2018. 22,016 got at least one answer; only 12,912 got an accepted answer. The questions used 982 distinct tags, and the study analysed the 344 tags with at least 30 uses (96 technology, 248 concept). — [Kpodjedo et al. 2022 PDF](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf) / [MDPI](https://www.mdpi.com/2076-3417/12/21/10750)
- Concept tags with the most questions: **2d 1,593; collision-detection 1,173; physics 1,021; shaders 980; 3d 779; textures 745; animation 685; game-design 664**. — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)
- Tags with the highest average views (hard, recurring "how do I" problems) were **aspect-ratio** (4,483 average views, i.e. resolution and UI scaling), then terminology (3,039), balance, file, and cross-platform. — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)
- Top tags by score and favourites included balance, **monetization**, terminology, **file-format**, and **npc**. Publishing, marketing, and monetization tags also rank high on averages. — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)
- Only about 1 in 8 questions (3,203 questions, ~12.5%) is tagged with a concept specific to games. Most questions are general engineering, math, or rendering. — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)
- Community support: about **50% of GDSE questions have an accepted answer**, with a median wait of 189 minutes. Comparable figures are 55% for mobile questions on Stack Overflow and 70% / 21 minutes for Stack Overflow overall. — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)
- Failure rate is the share of questions with no accepted answer; the second figure is the median wait for an accepted answer. Notable values:
  - Production concepts: **video 75% / 1,682 min; rigging 76%; blending 70%; modding 66% / 731 min; collider 63% / 698 min; animation 60% / 383 min; multiplayer 56% / 179 min; collision-resolution 56%; 3D 55% vs 2D 48%; physics 52%**. Easier topics: **savegame 43% / 79 min**, npc 35%, side-scroller 35%.
  - Technologies: **Blueprints ~85%; Unreal-4 ~68%; iOS 63% / 726 min; Xcode 60% / 2,811 min; Swift 70%; iPhone 75%**. Unity, the most popular tag, sits at 53% / 152 min.

  — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)
- An earlier thesis on game Q&A sites found **bug reports** were the most discussed topic on Unity Answers and the UE4 AnswerHub. — summarized in search results pointing to [U. Alberta ERA thesis](https://era.library.ualberta.ca/items/93fe3197-929b-49a9-8cc4-e1a8a16f63c1/download/ecbce3f2-146e-44cb-963c-0f614d99bc5d) (not read in full)

**Hobbyist and indie surveys and threads**
- Heartbeast (Ben Anderson) surveyed his game-dev students in Feb 2022 (n=122, mostly programmers, multi-select obstacles chosen from a preset list):
  - 53% felt they had the skills to finish an indie game, 22% did not, and 24% were unsure.
  - 19.7% said they lacked the skills for the games they want to make.
  - **46.7% expected to need to outsource some production** (mainly art and audio, given the sample).
  - Obstacles ranked from the chart: lack of discipline and lack of time were highest; lack of planning was "higher than expected"; scope creep was mid-pack; lack of creativity and money were lowest. Exact percentages exist only in a chart image.

  — [Heartbeast Substack, "122 Indie Devs Told Me Why They Don't Finish Their Games"](https://heartgamedev.substack.com/p/122-indie-devs-told-me-why-they-dont)
- An r/gamedev thread titled "What's the hardest part about game dev for you?" (Aug 1, 2024) drew so many "motivation" answers that the OP posted a follow-up about staying motivated. Vote counts were not retrievable. — [r/gamedev mirror](https://red.127.pp.ua/r/gamedev/comments/1ehvjq6/whats_the_hardest_part_about_game_dev_for_you)
- An RPG Maker community "biggest development challenges" survey (preliminary, n unknown) said lack of time and motivation recur, especially in early prototyping. — [RPG Maker Guild survey](https://guild.rpgmakerofficial.com/t/topic/1535?tl=en)
- Gamedev.js Survey 2025 (web game devs, n=445): only 2.3% earn $100k+, and earning money got harder. This is a business pain, not production. — [dev.to summary](https://dev.to/end3r/report-on-the-current-state-of-web-game-development-in-2025-is-out-mo9)
- Godot Community Poll 2025 had 9,661 respondents. 5,521 (57.1%) had used Unity before Godot, a sign of a large wave of engine migration and relearning. This figure is from a secondary blog and should be checked against godotengine.org. — [ziva.sh](https://ziva.sh/blogs/godot-community-poll-2025); poll announcement: [godotengine.org](https://godotengine.org/article/godot-community-poll-2025/)

### Inferences
- GDSE shows where the technical time goes for hobbyists: 2D movement, collision and physics, shaders and visual effects, animation, and resolution/UI scaling (aspect-ratio). These are game-feel and presentation tasks, which supports tools for collision/physics debugging, shader authoring, animation setup, and UI scaling.
- The poorly answered topics are where help is scarce and AI assistance could add the most: multiplayer, animation rigging and blending, video, modding, iOS/Xcode export, and Unreal Blueprints. Save systems ("savegame") get relatively well answered, so they are lower priority for help content, though they may still be tedious to build.
- Hobbyist self-reports put motivation, discipline, time, and planning above any technical skill. Tools that keep a project moving (task breakdown, scope control, momentum) may matter as much as content generation.

### Gaps
- No scraped or vote-ranked dataset was found for r/gamedev, r/IndieDev, r/godot, or r/Unity3D. Reddit returned "Blocked" to direct JSON fetches, and searches surfaced no published topic analysis or annual r/gamedev survey with results. Reddit or Pushshift data would have to be scraped and topic-modelled to fill this.
- The GDSE study covers 2014–2018, so it predates the Godot surge and AI tools. Newer tag counts could be pulled from the Stack Exchange Data Explorer.
- Godot's official 2025 and 2026 poll results pages were not read, so any pain-point questions they contain are not captured.

---

## Q2. What do postmortems say went wrong? (quantitative categories)

### Takeaway
Two large coding studies of Gamasutra / Game Developer postmortems agree: the most frequent problems are game design (unclear vision, lack of fun, over-complex designs), technical issues, team/workforce shortfalls, tools, and planning/scheduling (underestimation, scope). Testing, bugs, crunch, and feature creep each account for only 3–5% of coded problems. Small and self-published teams report "obstacles" far more often than large teams.

### Cited Findings
**Politowski, Petrillo, Ullmann, Guéhéneuc, "Game Industry Problems: an Extensive Analysis of the Gray Literature" (Information and Software Technology, 2021; arXiv 2009.02440)**
- Corpus: 200 postmortems from 1997–2019, coded into **927 problems across 20 types and 105 sub-types**. — [arXiv 2009.02440](https://arxiv.org/abs/2009.02440)
- Group split: **production 46%, management 45%, business 9%**. — [arXiv PDF](https://www.arxiv.org/pdf/2009.02440)
- Problem types (count, share of 927), extracted from Fig. 3b:
  - technical 116 (11%), game design 112 (11%), team 84 (8%), **tools 74 (7%)**, planning 73 (7%), marketing 61 (6%), communication 53 (5%)
  - **testing 48 (5%)**, cutting features 45 (4%), **scope 34 (3%)**, **bugs 34 (3%)**, **crunch time 31 (3%)**, delays 29 (3%), **feature creep 27 (3%)**, monetization 26 (3%)
  - documentation 22 (2%), budget 21 (2%), **prototyping 19 (2%)**, multiple projects 16 (2%), security 2 (0%)

  "Game design, technical, and team problems are the most frequent, with 30% overall." — [arXiv PDF](https://www.arxiv.org/pdf/2009.02440)
- Top 10 root-cause sub-types (N):
  - Insufficient workforce 49
  - Environment problems 48
  - Wrong marketing strategy 35
  - Underestimation (planning) 34
  - **Unclear game design vision 28**
  - **Lack of fun 27**
  - Platform & technology constraints 24
  - Game design complexity 23
  - **Inadequate or missing tools 22**
  - Misaligned teams 22

  — [arXiv PDF](https://www.arxiv.org/pdf/2009.02440)
- One coded testing sub-type was "Scope too big to test properly". — [arXiv PDF](https://www.arxiv.org/pdf/2009.02440)
- Tool problems take three forms: (1) inadequate or buggy game engines, (2) tools that don't meet game-specific requirements, and (3) tools too expensive to buy. Developers advise evaluating tools early and building their own or buying third-party ones. Tool problems persist across the years "regardless of" the rise of third-party engines. — [arXiv PDF](https://www.arxiv.org/pdf/2009.02440)
- Trends: technical, documentation, testing, and cutting-features problems declined over time. Marketing showed the largest increase over the 23 years, and team problems rose in the last decade. Most root causes are about people, not technology. — [arXiv 2009.02440](https://arxiv.org/abs/2009.02440)
- Recommended fixes include more pre-production and prototyping, more playtesting to find weak points, and settling the toolset before production. — [arXiv PDF](https://www.arxiv.org/pdf/2009.02440)
- A follow-up 2022 paper on the same dataset (Ullmann, Politowski et al., project-management anti-patterns) reports that 45% of postmortem problems relate to management practices. — [arXiv 2202.06183](https://arxiv.org/pdf/2202.06183)
- The companion MSR 2020 dataset paper ("Dataset of Video Game Development Problems") is at [arXiv 2009.02448](https://www.arxiv.org/pdf/2009.02448) (not read in detail).

**Washburn, Sathiyanarayanan, Nagappan, Zimmermann, Bird, "What Went Right and What Went Wrong: An Analysis of 155 Postmortems from Game Development" (ICSE-SEIP 2016)**
- Corpus: 155 Gamasutra postmortems over 16 years, coded into 22 categories. 74% of teams had 20 or fewer members, and 25.6% self-published. — [Washburn et al. 2016 PDF](https://thomas-zimmermann.com/publications/files/washburn-icse-2016.pdf)
- The four most frequent "went wrong" categories:
  - **obstacles 37%**: mostly newly formed teams and poor team dynamics
  - **schedule 25%**: bad estimation, optimistic scheduling, late design changes
  - **development process 24%**: too little up-front planning, mismanagement, no dedicated PM
  - **game design 22%**: over-ambitious designs that couldn't be built or blew the schedule, plus concepts that confused players

  — [Washburn et al. 2016 PDF](https://thomas-zimmermann.com/publications/files/washburn-icse-2016.pdf)
- Small vs. large teams:
  - **50% of small teams (≤20) listed obstacles as going wrong vs 26% of large teams.**
  - 16% of small teams listed gameplay as going wrong vs 9% of large teams.
  - 27% of small teams listed gameplay as going right vs 42% of large teams.

  — [Washburn et al. 2016 PDF](https://thomas-zimmermann.com/publications/files/washburn-icse-2016.pdf)
- Self-published vs. publisher-backed:
  - 43% of self-publishers listed obstacles as going wrong vs 35% with publishers.
  - **Tools went right for only 17% of self-publishers vs 40% with publishers.** Tools went wrong for 17% of both.
  - Testing went wrong for 11% (self-published) vs 13% (publisher).
  - About 70% of developers who listed marketing as a problem self-published.

  — [Washburn et al. 2016 PDF](https://thomas-zimmermann.com/publications/files/washburn-icse-2016.pdf)
- Example quote: "Feature creep ruled our roost" (John Cutler, *Last Call*). — [Washburn et al. 2016 PDF](https://thomas-zimmermann.com/publications/files/washburn-icse-2016.pdf)

**Game jam postmortems (anecdotal)**
- Individual Ludum Dare postmortems repeatedly cite three things: a custom or underprepared engine missing basic text and UI systems ("with all the good things that are solved from the previous JAM, we always follow up with a pile of new problems"), choosing an unfamiliar medium or tool, and level-design flaws found too late. — [Ludum Dare 35 postmortem (Medium)](https://medium.com/@tehPHEN/ludum-dare-35-post-mortem-9675a82d5ea); [LD50 postmortem (itch.io)](https://digital-bacon.itch.io/the-legions-of-general-critter/devlog/373552/ludum-dare-50-post-mortem)

### Inferences
- Postmortems weight **design clarity and fun** (unclear vision + lack of fun + design complexity = 78 of the top-10 sub-type instances) about as heavily as technical problems. Tools that rapidly prototype and test whether a core loop is fun, before production, map directly onto this.
- For small and self-published teams, the worse tooling (17% vs 40% "tools went right") and more frequent "obstacles" suggest the gap is in tooling and pipeline (asset integration, build, test), where big studios have dedicated staff.
- Testing, bugs, and crunch are each under 5% of coded problems in postmortems. Postmortems are written mostly by teams that shipped and skew toward pro and commercial studios, so they probably under-represent QA pain for hobbyists who never finish.

### Gaps
- Both academic corpora are mostly professional or semi-pro studios. Gamasutra postmortems are 1997–2019 and Washburn's are pre-2016. I found **no 2020–2026 study that codes indie itch.io or Steam devlogs at scale**; a search for one returned only interview studies.
- Washburn's full Figure 3 (all 22 "went wrong" percentages, e.g. art, audio, tools, testing) exists only as a chart. The text gives only the top 4 plus the subgroup comparisons above.
- Neither study isolates the task-level pains named in the brief (placeholder art never replaced, art-style consistency, juice/game feel, save systems, UI, audio sourcing, localization, trailer/store page) as separate codes. Those sit inside the broader "art", "game design", "technical", and "marketing" categories.

---

## Q3. Game jam data: entries vs. registrations, reasons for not finishing, tools used

### Takeaway
Across large itch.io jams, only **about 1 in 4 joined accounts submits (GMTK, 23–29% since 2020)**, and as few as **about 1 in 7–10 in Brackeys and Pirate Software jams (11–20%)**. On Ludum Dare, about **half of all created game entries are never published** (LD48–LD58, 2021–2025; computed from the official API). Ludum Dare participation has fallen by about 64% since 2021. The non-submission reasons I found are all anecdotal: running out of time, too-big scope or ideas taking longer than planned, theme or idea block, and late export or format problems. Godot has overtaken Unity as the main jam engine (47% vs 34% at GMTK 2026).

### Cited Findings
**itch.io jam joined vs. submissions.** Counts are from itch.io's "Ranked Game Jams With Participants" listing, sorted by submissions and read on 2026-11-24. Ratios are computed. — [itch.io jam ranking](https://itch.io/jams/sort-submissions/ranked/with-participants)

| Jam | Joined | Submissions | Submit rate (computed) |
|---|---|---|---|
| GMTK Game Jam 2019 | 7,591 | 2,540 | 33.5% |
| GMTK 2020 | 18.3k | 5,242 | ~28.6% |
| GMTK 2021 | 21.9k | 5,631 | ~25.7% |
| GMTK 2022 | 22k | 6,010 | ~27.3% |
| GMTK 2023 | 23.1k | 6,677 | ~28.9% |
| GMTK 2024 | 32.5k | 7,510 | ~23.1% |
| GMTK 2025 | 37k | 9,513 | ~25.7% |
| GMTK 2026 | 37.4k | 10.5k | ~28.1% |
| Brackeys 2020.2 | 8,878 | 1,768 | 19.9% |
| Brackeys 2021.1 | 9,999 | 1,811 | 18.1% |
| Brackeys 2021.2 | 10.7k | 1,694 | ~15.8% |
| Brackeys 2022.1 | 10.4k | 1,564 | ~15.0% |
| Brackeys 2024.2 | 10.4k | 1,471 | ~14.1% |
| Brackeys 2025.1 | 12.9k | 2,151 | ~16.7% |
| Brackeys 2025.2 | 17k | 2,264 | ~13.3% |
| Brackeys 2026.1 | 8,948 | 1,421 | 15.9% |
| Brackeys 2026.2 | 17.5k | 2,237 | ~12.8% |
| Pirate Software Game Jam 15 (2024) | 15k | 2,345 | ~15.6% |
| Pirate Software Game Jam 16 (2025) | 16.3k | 1,729 | ~10.6% |
| Very Serious Juniper Dev Game Jam (2026) | 14.4k | 3,493 | ~24.3% |
| Jamsepticeye (2025) | 5,915 | 1,151 | 19.5% |
| 2026 Epic AI MegaJam (still in voting) | 10.5k | 2,779 | ~26.5% |

- Caveats: "joined" counts itch.io accounts, which may include team members who did not submit separately, people browsing, or bookmark-joins. Submissions are per team. The joined-to-submit ratio therefore **overstates individual abandonment**, but the large gap across jams is consistent.
- GMTK 2024 results: 7,540 entries; 158,210 ratings given to 7,430 entries; mean 21.1 ratings and median 14 per game. — [itch.io GMTK 2024 results](https://itch.io/jam/gmtk-2024/results/creativity)
- Smaller itch jam organizers report similar or worse rates: "384 entered of which only 84 submitted" (~22%); "~10% submission rate is normal I think"; and a rule of thumb of "for every 4 to 6 people who joined, around 1 submits." — anecdotal, from itch.io forum posts surfaced in search ([itch.io RPGenesis thread](https://itch.io/jam/rpgenesis2022/topic/2316923/participants-vs-submissions-why-the-discrepancy); [itch.io post](https://itch.io/post/4184816))

**Ludum Dare.** Data comes from the official API (`api.ldjam.com/vx/stats/<event>`) on 2026-11-24. "signups" equals game drafts created and equals published "game" plus "unpublished". Ratios are computed. — e.g. [LD58 stats](https://api.ldjam.com/vx/stats/415614), [LD55 stats](https://api.ldjam.com/vx/stats/383062)

| Event | Game drafts (signups) | Published | Unpublished drafts | Published % | Jam / Compo / Extra | Marked "unfinished" |
|---|---|---|---|---|---|---|
| LD48 (Apr 2021) | 7,881 | 3,957 | 3,924 | 50.2% | 2,721 / 1,145 / 0 | 90 |
| LD50 (Apr 2022) | 5,994 | 3,003 | 2,991 | 50.1% | 1,922 / 805 / 174 | 102 |
| LD52 (Jan 2023) | 4,342 | 1,759 | 2,583 | 40.5% | 1,144 / 424 / 124 | 67 |
| LD54 (Sep 2023) | 4,004 | 2,222 | 1,782 | 55.5% | 1,596 / 489 / 80 | 57 |
| LD55 (Apr 2024) | 4,522 | 2,265 | 2,257 | 50.1% | 1,679 / 462 / 53 | 71 |
| LD56 (Oct 2024) | 4,182 | 1,980 | 2,202 | 47.3% | 1,478 / 404 / 46 | 52 |
| LD57 (Apr 2025) | 3,262 | 1,641 | 1,611 | 50.3% | 1,181 / 363 / 55 | 42 |
| LD58 (Oct 2025) | 2,929 | 1,417 | 1,512 | 48.4% | 1,078 / 271 / 37 | 31 |

- "authors" ranges from 4,690 (LD58) to 10,851 (LD48). Published games fell from 3,957 to 1,417 (about -64%) between LD48 and LD58. Only 2–3% of published entries self-flag as "unfinished". A further 272 LD58 games (about 19%) received fewer than 5 ratings ("grade-0-5"). — [LD58 stats](https://api.ldjam.com/vx/stats/415614)
- Caveat: unpublished drafts may include accidental or duplicate drafts, so read this as an upper bound on abandonment among people who actually started. Still, about half of started entries do not ship within 48–72 hours.
- Historical context: LD26 had 2,347 games, and LD29 (2014) set a then-record of 2,497. — [PC Gamer](https://pcgamer.com/ludum-dare-29-breaks-a-record-2497-games-developed-in-one-weekend); [Wikipedia](https://en.wikipedia.org/wiki/Ludum_Dare)

**Global Game Jam**
- GGJ 2025: **35,371 registered jammers, 12,098 games, 795 sites, 97 countries**. Another count gives 35,427 jammers / 12,100 games / 805 sites / 98 countries. That is about 2.9 jammers per game (computed). GGJ passed 100k total games in 2025. GGJ does not publish a submission rate per registered team. — [Wikipedia: Global Game Jam](https://en.wikipedia.org/wiki/Global_Game_Jam); [Games Market](https://gamesmarket.global/business/ggj2025-more-than-35000-jammers-joined-the-2025-global-game-jam-8234d329cc449b3bc5ac341298dfdd0e)

**Tools used by jammers (engine shares)**
- GMTK 2023: Unity 59%, Godot 19%. GMTK 2024: **Unity 43% (3,324 games), Godot 37% (2,838)**. — [wnhub.io](https://wnhub.io/news/engines/item-45183)
- GMTK 2025: Godot 39%, Unity ~41% (Unity figure single-sourced, Automaton). — [Game World Observer](https://gameworldobserver.com/2026/07/29/unity-is-no-longer-the-leader-godot-has-become-the-most-popular-engine-at-gmtk-game-jam-2026); [Automaton](https://automaton-media.com/articles/newsjp/20260729-457225/)
- GMTK 2026: **Godot 47% (~4.9k games), Unity 34% (~3.6k), GameMaker 5% (498), Unreal 3% (319)**. The organizers asked participants which engine they used. Godot's share by year: 16% (2022), 19% (2023), 37% (2024), 39% (2025), 47% (2026). — [Game World Observer](https://gameworldobserver.com/2026/07/29/unity-is-no-longer-the-leader-godot-has-become-the-most-popular-engine-at-gmtk-game-jam-2026)

**Reasons for not finishing a jam (anecdotal only)**
- From itch.io forum threads on "participants vs submissions":
  - running out of time, or ideas taking far longer than anticipated
  - being too busy
  - disliking the theme or failing to come up with an idea
  - being unable to complete a cohesive story
  - finding after export that "I had to reformat the whole thing after exporting it", then submitting too late

  — [itch.io RPGenesis 2022 thread](https://itch.io/jam/rpgenesis2022/topic/2316923/participants-vs-submissions-why-the-discrepancy)
- Jam postmortems cite underprepared custom engines missing text and UI, and adopting unfamiliar tools mid-jam. — [LD35 postmortem](https://medium.com/@tehPHEN/ludum-dare-35-post-mortem-9675a82d5ea)

### Inferences
- Jam funnels show a large **"start but don't ship"** gap: about 50% of started LD drafts are never published, and 70–90% of itch.io joiners never submit. A tool that guarantees a playable build early (a vertical slice in hours, with automatic web export) attacks the biggest dropout point.
- Export problems at the deadline are a recurring anecdote. Web/HTML5 export is the standard jam target, so one-click export with testing is a concrete, measurable need. This is inferred from the anecdotes plus the itch.io web-play norm; I have no export failure-rate data.
- The rapid Unity → Godot shift (19% → 47% Godot at GMTK in three years) means many jammers are working in an engine they are still learning. That points to engine-specific help (GDScript, scene/node patterns) as a fast-growing need. Godot poll: 57.1% of respondents came from Unity (secondary source).
- About 19% of LD58 games got fewer than 5 ratings, so feedback and playtest scarcity extends into jams as well.

### Gaps
- No organizer-run survey of why joiners didn't submit was found for GMTK, Brackeys, LD, or GGJ.
- A third-party "game jam statistics 2026" page (voxbooster.com) gives precise numbers such as "52.1% scope failure", but cites unverifiable sources. **I excluded it as unreliable.**
- GGJ jammer survey results (e.g. the 2025 SurveyMonkey survey) were not found publicly.

---

## Q4. Unfinished games: data on project abandonment and how many devs ever finish or release

### Takeaway
There is no rigorous dataset on the abandonment rate of hobby projects. The best hard proxies are the jam funnels above (roughly 50–90% non-completion). Older Early Access data shows about 25% of Early Access games reaching 1.0. Hobbyist surveys show many devs doubt they have the skills to finish, and nearly half expect to outsource part of production.

### Cited Findings
- Heartbeast student survey (2022, n=122): **only 53% felt they had the skills to finish an indie game**; 46.7% expected to outsource some production; discipline and time were the top-ranked obstacles. — [Heartbeast Substack](https://heartgamedev.substack.com/p/122-indie-devs-told-me-why-they-dont)
- EEDAR analysis (mid-2010s): only **25% of Early Access games had reached full release**, and less than 42% of 2013 Early Access titles had. This is old data. — [PC Gamer](https://pcgamer.com/only-25-percent-of-early-access-games-have-made-it-to-full-release-eedar-says)
- SuperScale (interviews with 500 UK/US developers) headline: almost half of mobile games are axed in development and 83% don't last three years. Methodology not verified. — [PocketGamer.biz](https://www.pocketgamer.biz/almost-half-of-all-mobile-games-are-axed-in-development-and-83-dont-last-three-years)
- Ludum Dare: about 50% of started drafts are never published (see Q3 table). — [api.ldjam.com](https://api.ldjam.com/vx/stats/415614)

### Inferences
- Read together, the jam data (time-boxed) and the hobbyist survey (open-ended) suggest that most started indie and hobby projects never ship. The likely causes are motivation/time/planning, skill gaps in non-code disciplines (art, audio), and scope. Tools that reduce the work needed to reach a playable, shippable build, and that fill skill gaps, address the main failure mode.

### Gaps
- No itch.io-wide statistic on games marked "in development" or "prototype" vs. "released" was found. The itch.io browse filters could be counted to fill this, but I did not do it here.
- No survey of r/gamedev users on how many projects they have finished was found.

---

## Q5. Playtesting/QA, game feel, art consistency, audio, UI, multiplayer: specific production pains

### Takeaway
The strongest 2024 evidence on QA is qualitative. Indie devs struggle to (1) recruit enough representative, honest playtesters (they default to friends and family), (2) pick valid methods, (3) capture and analyse playtest data (even recording screen, face, and input together is hard), and (4) triage feedback. Sifting Discord feedback is a time sink. Q&A data shows multiplayer, animation, and video/rigging questions often go unanswered. Postmortems name "lack of fun" and "unclear design vision" among the top-10 root causes.

### Cited Findings
**Playtesting: Denisova, Bromley, Mirza-Babaei, Mekler, "Towards Democratisation of Games User Research: Exploring Playtesting Challenges of Indie Video Game Developers" (CHI PLAY 2024, DOI 10.1145/3677108)**
- Method: 13 indie professionals (PC, console, mobile) interviewed and analysed with thematic analysis. — [White Rose eprint PDF](https://eprints.whiterose.ac.uk/id/document/3271828)
- Themes:
  - (1) regular and early playtesting used as reassurance, but "Playtests just aren't long enough and we weren't able to invest the amount of money"
  - (2) **recruiting enough representative and trusted players**, balancing expert and novice players
  - (3) choosing appropriate research methods
  - (4) **interpreting and analysing collected data**: "even something as simple as recording the screen and the player and the input all at the same time is not something that everyone can do"
  - (5) dealing with feedback and prioritising actions, including over-reacting to single comments

  — [Denisova et al. 2024](https://eprints.whiterose.ac.uk/id/document/3271828)
- Early-stage testers are a convenience sample of friends, family, and colleagues. Discord is the main community feedback channel, but going through "2–3 days' worth of Discord messages... is very time-consuming". Interviewees struggled to write unbiased questions, and analysing gameplay footage or Discord comments without specialised tools takes a long time. — [Denisova et al. 2024](https://eprints.whiterose.ac.uk/id/document/3271828)

**Pre-release experimentation: Linåker, Bjarnason, Fagerholm, "Pre-Release Experimentation in Indie Game Development: An Interview Survey" (arXiv 2411.17183, Nov 2024)**
- Interviews with 10 indie developers found that pre-release experimentation relies on qualitative data. Time and resource limits restrict playtesting because of "limited access to participants, biases and representativeness of the target audience." — [arXiv 2411.17183](https://www.arxiv.org/pdf/2411.17183)

**Postmortem evidence on design, fun, and testing**
- "Lack of fun" (27) and "unclear game design vision" (28) are top-10 root causes. Testing is 5% and bugs 3% of 927 coded problems. Authors recommend more playtesting and prototyping. — [Politowski et al. 2021](https://www.arxiv.org/pdf/2009.02440)
- In Washburn et al., small teams more often listed gameplay as going wrong (16% vs 9%) and less often as going right (27% vs 42%). — [Washburn et al. 2016](https://thomas-zimmermann.com/publications/files/washburn-icse-2016.pdf)

**Technical domains (GDSE failure rates, 2014–2018)**
- Multiplayer 56%, animation 60%, rigging 76%, blending 70%, collider 63%, video 75%, modding 66%, iOS 63%, aspect-ratio among the most viewed tags, savegame 43% (well supported). — [Kpodjedo et al. 2022](https://espace2.etsmtl.ca/25968/1/Kpodjedo-SJL-2022-25968.pdf)

**Staffing and skill gaps (art and audio)**
- Insufficient workforce is the #1 root cause in postmortems (49 instances). It arises when "a developer has too many tasks" and from "difficulty to find developers with certain skill sets". The most common advice is to hire or outsource. — [Politowski et al. 2021](https://www.arxiv.org/pdf/2009.02440)
- 46.7% of surveyed learners expected to outsource some production. — [Heartbeast](https://heartgamedev.substack.com/p/122-indie-devs-told-me-why-they-dont)
- Non-profit indie developers (CHI 2023, 28 interviews) report challenges in finding qualified and reliable team labor and in securing resources to produce quality products. — [Freeman et al. CHI 2023 PDF](https://par.nsf.gov/servlets/purl/10462223)

### Inferences
- Playtesting is a well-evidenced, under-tooled pain. The concrete tool opportunities are: an automated session recorder that captures screen, input, and telemetry together; a summarizer that clusters Discord and playtest feedback; an unbiased playtest-survey generator; and AI or bot playtesters to make up for the shortage of testers.
- Skill gaps in art and audio are the main reason solo devs need outsourcing. This supports asset-generation tools that hold a consistent style. It is inferred: no source quantified "art style consistency" or "placeholder art never replaced" directly.
- Multiplayer and networking have poor Q&A support (56% unanswered) and are known scope traps, so a strong case for guided templates.

### Gaps
- **No quantitative source was found** for these brief examples: game feel/juice, art-style consistency, placeholder art never replaced, UI work hours, audio sourcing, save systems as a pain, localization, trailer and store-page production. They appear only inside broad postmortem categories (game design, technical, marketing) or as anecdotes. Better data would need a targeted Reddit scrape (e.g. keyword counts across r/gamedev and r/IndieDev "hardest part" threads) or a dedicated survey.
- Vote counts from "what's your biggest struggle" threads on r/gamedev, r/godot, and r/Unity3D could not be retrieved because Reddit blocks unauthenticated JSON access.

---

### Cross-cutting ranked synthesis (inference, combining all the evidence above)
The ranking draws on postmortem frequency, jam funnels, Q&A volume and difficulty, and surveys.
1. **Scope, planning, and underestimation, which lead to not finishing.** Jam non-submission is 50–90%. In postmortems: planning 7% + scope 3% + feature creep 3% + cutting features 4% + delays 3% ≈ 20% of problems combined (computed). In Washburn: schedule went wrong 25%, process 24%. Hobbyists rank discipline and time first.
2. **Game design clarity and "is it fun?"** Game design is 11% of problems; unclear vision and lack of fun are top-10 root causes; Washburn has design going wrong in 22%.
3. **Technical implementation: physics/collision, 2D movement, shaders, animation.** Technical is 11% of postmortem problems; these are the highest-volume GDSE concepts.
4. **Skill and workforce gaps in art and audio.** Insufficient workforce is the #1 root cause; 46.7% expect to outsource.
5. **Tools and engine limits, plus the engine-migration learning curve.** Tools are 7% of problems; self-publishers report good tools far less often (17% vs 40%); Godot rose from 19% to 47% at GMTK.
6. **Playtesting and QA: recruiting testers, capturing and analysing data.** Strong qualitative evidence from 2024; testing 5% and bugs 3% in postmortems.
7. **Platform, export, and UI scaling.** iOS and Xcode questions are poorly answered; aspect-ratio is the most-viewed GDSE concept tag; export problems at the deadline appear in jam anecdotes.
8. **Multiplayer networking.** 56% of GDSE questions unanswered; a common scope trap.
9. **Marketing.** 6% of problems and the fastest-growing category; out of production scope but rising.
