# Opus-03 idea ranking

Five product ideas for the APU Cloud Innovation Hackathon 2026, chosen from 48 candidates over four rounds of ideation and scored by a three-judge panel against a ten-component matrix. The set assumes no team member can be at APU, no APU staff will help, and the only devices are the team's phones and one Raspberry Pi 5 (8 GB). It was built on 5 November 2026, five days before the prototype deadline; **Inference** marks conclusions no source states outright.

Contents:

1.  [Recommendation](#recommendation)
1.  [Final ranking](#final-ranking)
    1.  [Component scores of the finalists](#component-scores-of-the-finalists)
    1.  [Ranking on the stated criteria only](#ranking-on-the-stated-criteria-only)
1.  [Constraints and gates](#constraints-and-gates)
1.  [Scoring matrix](#scoring-matrix)
1.  [How the ideation ran](#how-the-ideation-ran)
1.  [What the rounds taught](#what-the-rounds-taught)
1.  [Red team and kill tests for the finalists](#red-team-and-kill-tests-for-the-finalists)
1.  [Taken to round 4 but not finalists](#taken-to-round-4-but-not-finalists)
1.  [Cut in round 2](#cut-in-round-2)
1.  [Risks shared by every finalist](#risks-shared-by-every-finalist)
1.  [See also](#see-also)

## Recommendation

- **Build [Tukar](01-tukar.md) if its two 7 November tests pass:** a phone on mobile data reaches the Pi through Tailscale Funnel with its network visible, and at least three outside final-year survey owners enrol. It is the only finalist that can show a real before-and-after inside the week, from survey owners' own response timestamps; it sits outside every crowded tier; and the people who need it are the interviewees, posting about five survey requests a day on r/malaysiauni ([Reddit research](/docs/research/everyday-reddit.md#what-recruiting-looks-like-there)).
- **Otherwise build [Bangun](02-bangun.md):** the strongest demand evidence in the set (students rebuilt timetable sync at least 12 times since 2013, and only 1 of 41 copies of the most-forked one still runs) and the only finalist whose device acts as well as senses. Its risks are an unverified iPhone alarm path and an agent whose job depends on how many lecturer announcements reach it ([rules and guarantees](/docs/research/rules-and-guarantees.md#setting-alarms-from-a-phone-without-a-person)).
- **Keep [Janji](03-janji.md) as the reserve:** the clearest edge-AI privacy story, but it can only check groups whose work lives in Google Drive or GitHub, not APU's Microsoft 365.
- **Treat the top two as tied:** they are 1.4 points apart and the judges split on their order. Two findings made while writing the product docs, after the panel scored, narrow the gap further. A paid gateway from SurveySwap's team already puts duplicate and hosting checks in front of Google Forms, and the study Tukar leans on ranks panels that route to third-party survey platforms below integrated ones, so Tukar's originality is nearer 4 than 4.3 (about 81 overall, **Inference**). For Bangun, 97.1% of weekday first-class times held from one ordinary week to the next, so a plain weekly alarm works inside a teaching block and Bangun's value concentrates at block boundaries and announced changes ([feed measurements](/docs/research/rules-and-guarantees.md#apspace-timetable-feed-measurements)). **Inference:** let the 7 November kill tests decide, not the scores.

## Final ranking

Round 4 scores of three judges; totals out of 100 using the [scoring matrix](#scoring-matrix). "Mean" is the mean of the judges' three totals; recomputing it from the rounded component means below can differ by 0.1. "Stated" is the subtotal on NTT DATA's five stated points only (I, T, R, TT, W), out of 55.

| Rank | Product                    | Track                  | One line                                                                                                                                                              | Mean | Stated | Judges       |
| ---- | -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ------------ |
| 1    | [Tukar](01-tukar.md)       | Data-Driven Research   | A survey-swap panel for final-year students whose Pi gateway records where each response session started, for a provenance statement examiners can check              | 82.0 | 45.6   | 80 / 85 / 81 |
| 2    | [Bangun](02-bangun.md)     | Intelligent Automation | Each student's phone sets its own alarm for tomorrow's real first class, and every hop sends a receipt so a silent watcher is itself the alert                        | 80.6 | 44.0   | 79 / 81 / 81 |
| 3    | [Janji](03-janji.md)       | Intelligent Automation | A group's spoken "who does what by when" is transcribed on a home Pi, then checked every evening against what changed in its Drive and GitHub                         | 71.1 | 41.4   | 68 / 73 / 73 |
| 4    | [Cap Masa](04-cap-masa.md) | Intelligent Automation | When a student's home line or power drops, it starts the ISP and APU claim clocks and assembles the dated proof each one needs                                        | 69.9 | 38.4   | 68 / 72 / 70 |
| 5    | [Khabar](05-khabar.md)     | Smart Campus           | A passive daily check for students living alone: the phone's own charger, unlock and step events are the check-in, and a chosen buddy hears only after a long silence | 69.3 | 37.8   | 71 / 69 / 67 |

### Component scores of the finalists

Means of the three judges, 1–5 per component.

| Product  | I   | T   | R   | TT  | W   | C   | O   | U   | D   | F   |
| -------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tukar    | 4.0 | 4.0 | 5.0 | 4.0 | 4.0 | 3.3 | 4.3 | 4.7 | 4.0 | 3.3 |
| Bangun   | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | 4.0 | 4.7 | 4.0 | 3.0 |
| Janji    | 3.7 | 4.0 | 4.0 | 3.0 | 4.0 | 3.3 | 3.0 | 3.3 | 4.0 | 3.0 |
| Cap Masa | 2.7 | 4.0 | 4.0 | 3.0 | 4.0 | 4.7 | 3.0 | 3.0 | 3.7 | 3.3 |
| Khabar   | 3.0 | 4.0 | 3.0 | 3.0 | 4.0 | 3.3 | 3.7 | 3.0 | 4.0 | 4.0 |

### Ranking on the stated criteria only

The matrix weights are partly **Inference** (see [Scoring matrix](#scoring-matrix)), so the set was also ranked on NTT DATA's five stated points alone. The top three hold: Tukar 45.6, Bangun 44.0, Janji 41.4. Below them, [Semak Dulu](#taken-to-round-4-but-not-finalists) (39.9) would rise to fourth and replace Khabar (37.8), and Cap Masa (38.4) would drop to fifth. Semak Dulu was kept out on a privacy finding, not on score.

## Constraints and gates

An idea that broke any gate was dropped before scoring.

- **G1 Remote team:** nobody can be physically at APU, its campus or APU-run premises, at any point. Devices run in teammates' homes or with users who install something themselves.
- **G2 No APU staff:** no interviews, data, approvals, system access or pilots from lecturers or offices. APU's public pages and feeds are fine, under the copyright caveat in [context](/docs/CONTEXT.md#apus-own-documents-and-systems). Students, including the hackathon's participants and societies, are reachable online.
- **G3 Hardware:** phones and one Raspberry Pi 5 (8 GB); nothing bought. What these can and can't do unattended is in [phones and Pi](/docs/research/phones-and-pi.md#capability-matrix).
- **G4 Real data:** live public sources or the team's own real readings only, as ruled in [context](/docs/CONTEXT.md#decisions-so-far); a failed source shows its error.
- **G5 Gemini Enterprise core:** the agent and workflow live in Gemini Enterprise, as NTT DATA asked ([brief](/docs/BRIEF.md#tools)).
- **G6 Time:** prototype due 10 November 2026, 11:59 PM; assessment 11–14 November with the live system running ([brief](/docs/BRIEF.md#key-dates)).

## Scoring matrix

Each component scored 1–5; weighted total = sum(score / 5 × weight). The first five rows are NTT DATA's spoken judging outline ([brief](/docs/BRIEF.md#judging-and-prizes)); their weights are **Inference**, since no weights were given. The last five come from comparable rubrics ([judging](/docs/research/judging.md#common-core)) and from this set's brief: Originality and Real use are weighted up because the goal was an idea that is unique among 1k+ AI-assisted teams and that people will actually use.

| ID  | Component           | Weight | What a 5 looks like                                                                                                   |
| --- | ------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| I   | Impact              | 15     | A named student group with a frequent, costly problem, a measurable before and after, and reach in the thousands      |
| T   | Technical build     | 12     | Gemini Enterprise with 1P and 3P connectors doing real reads and writes; every hop named; MCP as an add-on            |
| R   | Research            | 8      | 6–8 interviews, an observation and public posts, all reachable remotely without staff in two days                     |
| TT  | Time to impact      | 8      | Useful to real students within weeks; a dated 3- and 6-month plan that needs no APU approval                          |
| W   | Day-to-day workflow | 12     | A scheduled or event-triggered workflow running unattended for days, with one approval where the platform requires it |
| C   | Convergence         | 10     | Cloud, IoT (real phone or Pi readings) and network each visible and load-bearing                                      |
| O   | Originality         | 12     | Outside the saturated and crowded tiers of the [crowd map](/docs/research/competition.md#saturation-tiers)            |
| U   | Real use            | 12     | Existing workaround behaviour, repeated self-built tools, or posts asking for it                                      |
| D   | Demo                | 6      | A 3–4 minute video and a live system where the outcome is obvious, with a trigger reviewers can fire                  |
| F   | Feasibility         | 5      | Buildable by 10 November with phones and a Pi, inside Gemini Enterprise's limits                                      |

## How the ideation ran

All rounds ran on 5 November 2026. Ideation and judging used AI agents across three model families, so the panel could not anchor on one model's taste.

1.  **Research:** new social and device research for this set: 97 X searches returning 2,138 posts ([X research](/docs/research/everyday-x.md)); 188 Reddit threads plus Lowyat, Hacker News, Bluesky and TikTok ([Reddit research](/docs/research/everyday-reddit.md)); what phones and a Pi 5 can sense and run unattended ([phones and Pi](/docs/research/phones-and-pi.md)); and the public rules the ideas lean on, each re-checked at the source ([rules and guarantees](/docs/research/rules-and-guarantees.md)).
1.  **Round 1, divergent:** four lenses produced 10 ideas each: APU students' lives away from campus, operators who aren't APU staff, sensing-first (what only a phone or Pi can measure), and proven demand (what students already rebuild or install).
1.  **Round 1b, gaps:** 8 more ideas from the new research, steering away from the families round 1 had converged on.
1.  **Round 2, panel:** near-duplicates merged into 26 entries, plus the 8 gap ideas. Three judges scored all 34 independently: an NTT DATA forward deployed engineer (connectors, day-to-day running, measurable impact), an APU IoT and edge-AI lecturer with a Google Cloud engineer (real sensing, privacy, feasibility), and an off-campus APU student with a crowd critic (would anyone keep it installed; has a reviewer seen it 50 times).
1.  **Round 3, mutation:** the top eight, after merges, were redesigned against their weakest components, with substitutes and key claims checked at primary sources.
1.  **Round 4, rescoring and red team:** the same three judges rescored the eight redesigns, named the most likely way each fails, and checked each against the saturation tiers.

## What the rounds taught

- **Convergence is a warning:** every round 1 lens independently produced home-outage evidence for claims, and three produced phone-charger power-cut detection, room-entry logging, haze go/no-go for clubs, and tenancy evidence. **Inference:** when four differently prompted agents land on the same idea, many of the 1k+ AI-assisted teams will too; the outage family survives only as [Cap Masa](04-cap-masa.md), re-aimed at claim filing.
- **Behaviour bots can fake isn't evidence:** Tukar dropped phone-motion and tab-tracking checks after a 2025 study showed an AI respondent passing 99.8% of attention checks; it keeps only what the Pi sees of the network.
- **The best signals are moments, not streams:** people keep tools that run unattended and fire on a physical moment such as plugging in or arriving, and abandon ones that need the family to open an app ([Reddit research](/docs/research/everyday-reddit.md#what-gets-abandoned-and-why)). Bangun and Khabar are built on that.
- **APU's Microsoft 365 is out of reach:** without staff help, no idea can read APU mail, Teams or OneDrive, which ruled out Outlook and Teams connectors for Bangun and limits Janji.
- **A decorative device sinks an idea:** Peratus had the strongest real-use evidence of any international-student idea, but no phone or Pi reading changed its decision, and the panel excluded it.

## Red team and kill tests for the finalists

The judges' single most likely failure for each finalist, and the test by 7 November that should kill it. Details are in each product doc.

- **Tukar:** outside survey owners won't share a response Sheet with a stranger's account within 48 hours, so the only enrolled survey is the team's own. Kill if a phone on mobile data can't reach the Pi with its network visible, or fewer than three outside owners enrol.
- **Bangun:** few live announcements arrive between 6 and 14 November (the feed lists no sessions on 8 and 9 November, and 466 intakes have none 9–15 November), so the visible product is the alarm job rather than the agent. Kill unless one Android and one iPhone set and receipt an alarm unattended on two nights running, and at least 15 real past announcements are collected.
- **Janji:** recruited groups keep their work in Microsoft 365 or WhatsApp, so it can only audit the team's own project. Kill if artefact coverage is below 60%, or fewer than two outside groups with readable Drive or GitHub sign up.
- **Cap Masa:** no natural outage hits a teammate's home in the window, and a reviewer who gets Unifi's own outage alerts reads it as duplicating the ISP. Kill unless two recruited non-team homes are running and interviews confirm a gap Unifi's alerts leave open.
- **Khabar:** Android vendors' app killers drop the overnight heartbeat, producing more than one false alarm per person-week, the objection that sank earlier check-in apps. Kill if a 72-hour test on real phones exceeds that rate.

## Taken to round 4 but not finalists

- **Semak Dulu (69.1):** a desk that checks any message asking a student to pay against APU's published payment channels, with the Pi fetching links from a Malaysian home line. One judge excluded it: its phone macro would forward bank one-time codes and balance texts to a shared sheet, and its allowlist named the wrong host for APU's real payment portal ([rules and guarantees](/docs/research/rules-and-guarantees.md#bursary-payment-channels-and-payee-names)). It also watches SMS, where links have been blocked since 2024, and can't see students' APU mail.
- **Bars by Block (67.0):** per-building cards of what actually works in student housing near APU (blocked sites, which SIM holds a call indoors), from residents' 20-second phone tests. Ookla's open data already covers the area densely, MCMC's own app surveys buildings per provider, and students mostly fix internet with an unlimited SIM; real viewings by the November intake start after assessment.
- **Peratus (66.7):** a wait baseline per stage of the student-pass process from incoming students' own logs. Excluded regardless of score: every phone or Pi signal tried failed to change the decision, so it scores 1 on convergence.

## Cut in round 2

Round 2 means of three judges. Merged ideas live on inside a finalist.

| Idea           | Mean | What it was                                                       | Why it stopped                                                     |
| -------------- | ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Bukan Saya     | 65.3 | Class board saying whether Moodle or APSpace is down for everyone | Merged into Cap Masa                                               |
| Makan Kaki     | 63.5 | Weekly newcomer dinners seated by evenings spent at home          | Paid stranger dinners already run in KL; two installs for a dinner |
| Insang         | 63.4 | Club haze go/no-go from the air station nearest members           | Device layer was only coarse GPS; haze is seasonal                 |
| Eighty         | 61.5 | Position against the 80% attendance rule                          | Its signal exists only on campus (G1); next to code-sharing tools  |
| Tingkat        | 61.5 | Lift waits in condos from the phone barometer                     | Needs a foreground recording for every ride; Android only          |
| Tengok         | 61.3 | Five-minute phone check at room viewings                          | Merged into Bars by Block                                          |
| Poskad         | 61.2 | Nightly postcard home drafted from the student's phone            | Merged into Khabar as an opt-in weekly note                        |
| Jendela        | 60.2 | Window-phone haze visibility index for clubs                      | Weak proxy on clear days; seasonal                                 |
| Padam          | 59.5 | Power cuts confirmed from phones leaving their chargers           | Few real cuts in the week; its charger signal joined Cap Masa      |
| Wall Paint     | 58.3 | Hashed move-in and move-out photos for deposit disputes           | Payoff months away; rare runs                                      |
| Lamplight      | 58.1 | Organisers' uptime watch over hackathon entries                   | Serves the organisers, not students; ends 17 November              |
| Latch          | 57.1 | A spare phone logs room entries while you're away                 | Free camera apps do the job; crowded safety tier                   |
| NightsIn       | 56.9 | Bills split by nights each housemate's phone was home             | Tracking housemates; weak link to APU                              |
| Kilo Kitty     | 56.6 | Prepaid meter top-up forecast for shared units                    | Fails G4 without a resident volunteer behind a prepaid meter       |
| Duduk Sama     | 56.4 | Body-doubling sessions booked from real study hours               | Crowded study tools                                                |
| Spin           | 53.9 | Light sensor flags finished but unclaimed laundry                 | Narrow user; availability trackers are crowded                     |
| Facedown       | 52.3 | Face-down phone focus league for study circles                    | Study-timer apps with millions of installs already exist           |
| Rig Roll Call  | 51.1 | Health watch for a team's home Pi                                 | Telemetry-to-ticket shape; not a student need                      |
| Rakam          | 50.6 | Final-year interviews transcribed and de-named on the Pi          | Merged into Janji                                                  |
| Pass Clock     | 49.1 | Student-pass renewal countdown from APU's rules                   | Decorative device layer; close to the briefing's passport example  |
| Stadium Nights | 48.9 | Event-night and flood notices for tenants near the stadium        | Needs a stadium event in the window; user isn't clearly a student  |
| Logbook Lane   | 48.8 | Intern logbook drafted from a workplace geofence                  | Fails G4: no teammate is interning                                 |
| Clothesline    | 44.5 | Balcony phone hears rain start for line-dryers                    | Low impact                                                         |
| Tumpang Desk   | 43.5 | Carpool matching for classes                                      | Fails G1 and G4; a student carpool app exists                      |
| Sponsor Ledger | 40.4 | Club sponsorship follow-ups with booth scans                      | Fails G1 and G4                                                    |
| Found Desk     | 39.1 | Lost-and-found matching run by volunteers                         | Fails G1 and G4                                                    |

## Risks shared by every finalist

- **Licence and account type:** Drive, Gmail and Calendar connectors don't support consumer accounts, the sponsored seats may be a free trial without Antigravity, and the custom MCP store is blocked by default ([context](/docs/CONTEXT.md#connectors-and-live-data)). Ask the organisers before building on any of them.
- **Unattended runs stall:** schedule credentials expire after 14 days, runs that affect other people pause for approval, and event-triggered runs that fail on quota aren't retried ([context](/docs/CONTEXT.md#workflows-and-unattended-runs)).
- **Devices in teammates' homes:** each Pi and phone has an owner who keeps it powered and online 11–14 November; a Pi sees a power cut only after it reboots, and unplugged Android phones fall into Doze ([phones and Pi](/docs/research/phones-and-pi.md#keeping-it-alive-unattended)).
- **Real events may not happen in the week:** outages, announcements and survey enrolments are real or absent; the rule forbids filling the gap with synthetic data ([project conventions](/docs/references/project-conventions.md)).
- **Reviewer access:** reviewers need seats and roles on the team's project, and see their own runs, not the owner's ([context](/docs/CONTEXT.md#reviewer-access)).

## See also

- Product docs: [Tukar](01-tukar.md), [Bangun](02-bangun.md), [Janji](03-janji.md), [Cap Masa](04-cap-masa.md), [Khabar](05-khabar.md).
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md): the event's rules and what judges reward.
- Research made for this set: [X research](/docs/research/everyday-x.md), [Reddit research](/docs/research/everyday-reddit.md), [phones and Pi](/docs/research/phones-and-pi.md), [rules and guarantees](/docs/research/rules-and-guarantees.md).
- Earlier research it relies on: [competition](/docs/research/competition.md), [social research](/docs/research/social.md), [judging](/docs/research/judging.md), [Gemini Enterprise](/docs/research/gemini-enterprise.md).
