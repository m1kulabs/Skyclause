# Idea ranking

**Build [ChronoDiff] by default, and ask for written permission to use APU's timetable feed today.** Three products tie at the top: [Outage Witness] at 71.3, [Skyclause] at 71.1 and ChronoDiff at 71.0 / 100. They hold ranks 1–3 under every weighting tried, but 0.3 points is far inside the scorers' noise, so tie-breakers decide the pick. ChronoDiff is the only one of the three that all three scorers passed on all four gates. It also leads on NTT DATA's five stated points: 76.0 when they carry all the weight, against 74.7 for the other two. It audits each release of APU's public timetable from a Raspberry Pi 5 at a teammate's home and files approved fixes for the Schedulers office. Its weak spots are a theme score of 2, because it has no sensor, and its reliance on APU's feed, which needs APU's written permission. If permission is refused, build Skyclause, which needs a teammate's high window, or Outage Witness, which only works in its off-campus form. If nobody at APU will act at all, not even to grant permission, ChronoDiff drops out and those two lead; see [Alternative ranking under strict limits](#alternative-ranking-under-strict-limits).

This page re-ranks the 32 ideas from the seven idea sets ([argon-01](/docs/ideas/argon/01/00-ranking.md), [argon-02](/docs/ideas/argon/02/00-ranking.md), [astra](/docs/ideas/astra/01/00-ranking.md), [opus-01](/docs/ideas/opus/01/00-ranking.md), [opus-02](/docs/ideas/opus/02/00-ranking.md), [opus-03](/docs/ideas/opus/03/00-ranking.md), [sol](/docs/ideas/sol/01/00-ranking.md)) against one scoring matrix. It then merges the overlapping ideas into 25 products, writes a doc for each of the 18 strongest, and ranks those. The matrix combines the seven sets' matrices, NTT DATA's five judging points, and the criteria the sets share. The sets themselves are unchanged; this synthesis is the one place that compares them ([project conventions](/docs/references/project-conventions.md)).

The page is dated 5 November 2026 and replaces the 4 November ranking of 10 products. That ranking scored 8 of its products before the team's limits were known. This time every idea and product was scored on the same day, under the same [team limits](#team-limits). Names are working names. Every score is a prospective estimate: there are no interviews, licence tests, or run history yet.

Contents:

1.  [Ranking](#ranking)
1.  [Scores by component](#scores-by-component)
1.  [Scoring matrix](#scoring-matrix)
    1.  [Team limits](#team-limits)
    1.  [Components and weights](#components-and-weights)
    1.  [Scale and aggregation](#scale-and-aggregation)
    1.  [Gates](#gates)
1.  [Sensitivity](#sensitivity)
1.  [Alternative ranking under strict limits](#alternative-ranking-under-strict-limits)
1.  [The 32 source ideas reranked](#the-32-source-ideas-reranked)
1.  [How the products were merged](#how-the-products-were-merged)
1.  [How to choose](#how-to-choose)
1.  [What the rerank changed](#what-the-rerank-changed)
1.  [Method](#method)
1.  [Evidence limits](#evidence-limits)
1.  [See also](#see-also)

## Ranking

| Rank | Product                | Owner (unconfirmed unless stated)                                        | In one line                                                                                                                    | Track                  | Gates                    | Score |
| ---: | ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------ | ----: |
|    1 | [Outage Witness]       | Office of Extenuating Circumstances Claims (unconfirmed)                 | Keeps an independent, timestamped register of Moodle and APSpace failures, witnessed from outside APU                          | Intelligent Automation | Conditional G4           |  71.3 |
|    2 | [Skyclause]            | A teammate; target the facilities, safety and welfare desk (unconfirmed) | Makes one logged, approved haze-and-storm call for each class or event window its subscribers declare                          | Intelligent Automation | Conditional G4           |  71.1 |
|    3 | [ChronoDiff]           | Schedulers office (unconfirmed)                                          | Audits each release of APU's public timetable for double-bookings, holiday clashes and tight transfers before students live it | Intelligent Automation | All pass                 |  71.0 |
|    4 | [Fanfall]              | Events lead of an APU club (proposed)                                    | Forecasts each stadium night's hit on APU evening events and grades itself on next-day gate taps                               | Data-Driven Research   | All pass                 |  68.3 |
|    5 | [Bangun]               | Students; class reps forward announcements                               | Sets each student's phone alarm for tomorrow's real first class, with a receipt from every hop                                 | Intelligent Automation | Conditional G2, G3       |  68.1 |
|    6 | [Tukar]                | The team's exchange operator                                             | A survey-swap exchange for FYP students whose Pi gateway records where each response session started                           | Data-Driven Research   | Conditional G2, G3       |  67.9 |
|    7 | [Khabar]               | The team, then a student society's welfare lead                          | Tells a chosen friend when a student living alone has gone quiet, from the phone's own events                                  | Smart Campus           | Conditional G2, G3       |  65.9 |
|    8 | [Janji]                | Each project group's lead                                                | Checks a group's spoken promises against what changed in its Drive folder and GitHub repo                                      | Intelligent Automation | Conditional G2           |  64.5 |
|    9 | [KuyohGuard]           | Logistics & Operations duty coordinator (unconfirmed)                    | Joins river, rain, MET and T580 feeds with APU's dismissal waves and drafts corridor advisories                                | Intelligent Automation | Conditional G4           |  64.2 |
|   10 | [BoardCast]            | Students; no office                                                      | Tells a shuttle rider which run reaches each class next week, and when a timetable change breaks the routine                   | Smart Campus           | Conditional G1, G3, G4   |  63.1 |
|   11 | [GateWatch]            | IT Helpdesk (proposed)                                                   | Checks APU's sign-in and portal hosts from three off-campus vantages, and re-runs before a fix is accepted                     | Intelligent Automation | Conditional G3           |  61.3 |
|   12 | [Cap Masa]             | The individual student                                                   | When a student's home line or power drops, starts the ISP and EC clocks and assembles the dated proof                          | Intelligent Automation | All pass                 |  59.1 |
|   13 | [Research & FYP Nexus] | The team, then APU's FYP Project Manager (proposed)                      | Checks a draft FYP title against APU's own and recent outside work before it enters FYPPGBank                                  | Data-Driven Research   | Conditional G2           |  57.1 |
|   14 | [BiblioForge]          | APU Library (not asked)                                                  | Flags large modules with few print copies in Koha and finds open-access APU papers for module guides                           | Data-Driven Research   | Conditional G2, G3, G4   |  54.2 |
|   15 | [RoomReady]            | The individual student                                                   | Helps a student pick a tested room, device and connection for one upcoming online session                                      | Smart Campus           | Conditional G3           |  51.7 |
|   16 | [BenchRelay]           | A student team's integration lead                                        | Tells the next teammate what is really running on the shared Pi, and what to fix before handoff                                | Intelligent Automation | Conditional G3           |  50.8 |
|   17 | [FieldPair]            | A student running a multi-phone experiment                               | Checks each phone-sensor run against the team's protocol and drafts one recollection task                                      | Data-Driven Research   | Conditional G3           |  46.7 |
|   18 | [Kept]                 | Logistics & Operations shuttle desk (unconfirmed)                        | Grades the Campus Connect shuttle against its published schedule nightly; needs a phone at APU's bay                           | Intelligent Automation | Conditional G3; fails G4 |  54.5 |

- **The top three are a tie.** Outage Witness, Skyclause and ChronoDiff hold ranks 1–3 under all seven views in [Sensitivity](#sensitivity), in an order that varies across views. ChronoDiff leads when only NTT DATA's five points count, and when originality counts double.
- **Two of the three pass the off-campus gate only conditionally.** Outage Witness passes on its reduced build, which witnesses Moodle and APSpace failures from outside APU; its full product needs phones on campus chargers. Skyclause passes if a teammate has a high window with a skyline.
- **Kept fails the off-campus gate with all three scorers,** because it needs a phone at APU's boarding bay. Kept led the 4 November ranking at 81.6. Here it scores 54.5, which would rank 14th even with the gate lifted.
- **Ranks 4–6 are a second tier:** [Fanfall] 68.3, [Bangun] 68.1 and [Tukar] 67.9.
- **Don't read a gap under 5 points as decisive.** The same persona scored one anchor doc up to 10 points apart in two batches ([Evidence limits](#evidence-limits)).

[Outage Witness]: /docs/ideas/01-outage-witness.md
[Skyclause]: /docs/ideas/02-skyclause.md
[ChronoDiff]: /docs/ideas/03-chronodiff.md
[Fanfall]: /docs/ideas/04-fanfall.md
[Bangun]: /docs/ideas/05-bangun.md
[Tukar]: /docs/ideas/06-tukar.md
[Khabar]: /docs/ideas/07-khabar.md
[Janji]: /docs/ideas/08-janji.md
[KuyohGuard]: /docs/ideas/09-kuyohguard.md
[BoardCast]: /docs/ideas/10-boardcast.md
[GateWatch]: /docs/ideas/11-gatewatch.md
[Cap Masa]: /docs/ideas/12-cap-masa.md
[Research & FYP Nexus]: /docs/ideas/13-research-fyp-nexus.md
[BiblioForge]: /docs/ideas/14-biblioforge.md
[RoomReady]: /docs/ideas/15-roomready.md
[BenchRelay]: /docs/ideas/16-benchrelay.md
[FieldPair]: /docs/ideas/17-fieldpair.md
[Kept]: /docs/ideas/18-kept.md

## Scores by component

Means of three independent scorers on a 1–5 scale. Day-to-day workflow and theme take the lowest of the three, as the totals do. Each product doc's "Scores" section gives every scorer's score and the lowest scorer's reason.

| Product              |   IM |   CO |  WF |   RE |   TI |  TH |   OR |   UR |   BU |   DE | Total |
| -------------------- | ---: | ---: | --: | ---: | ---: | --: | ---: | ---: | ---: | ---: | ----: |
| Outage Witness       |    3 | 4.33 |   4 |    4 | 3.33 |   4 |    3 |    2 |    3 |    4 |  71.3 |
| Skyclause            |    3 | 4.33 |   4 |    4 | 3.33 |   3 | 3.67 | 3.33 |    2 |    4 |  71.1 |
| ChronoDiff           |    3 |    4 |   4 |    4 |    4 |   2 |    4 | 3.67 | 2.67 | 3.33 |  71.0 |
| Fanfall              | 2.67 |    4 |   4 |    4 | 3.67 |   2 | 3.67 | 3.33 | 2.33 | 3.67 |  68.3 |
| Bangun               |    3 | 3.33 |   4 | 3.67 | 3.67 |   3 | 3.67 |    3 | 2.67 | 3.33 |  68.1 |
| Tukar                |    3 | 3.67 |   4 |    4 | 3.67 |   2 |    3 |    4 |    2 |    4 |  67.9 |
| Khabar               | 2.33 |    4 |   4 | 2.33 | 3.33 |   4 |    3 |    3 | 3.67 | 3.67 |  65.9 |
| Janji                | 2.67 |    3 |   4 | 3.33 | 3.33 |   3 |    4 | 2.33 | 2.67 | 3.33 |  64.5 |
| KuyohGuard           | 2.67 |    4 |   4 | 3.67 | 3.33 |   2 |    3 | 2.67 | 2.67 |    3 |  64.2 |
| BoardCast            | 2.67 | 3.33 |   4 |    3 |    3 |   2 |    4 |    3 | 2.67 |    4 |  63.1 |
| GateWatch            |    2 | 4.33 |   4 |    3 | 3.33 |   3 |    2 |    2 | 2.67 | 3.33 |  61.3 |
| Cap Masa             |    2 | 3.67 |   3 | 2.67 | 2.67 |   4 | 2.67 |    3 | 3.33 |    3 |  59.1 |
| Research & FYP Nexus | 2.67 |    4 |   3 |    3 |    3 |   1 |    2 |    2 | 4.33 |    4 |  57.1 |
| BiblioForge          |    2 | 3.33 |   4 |    2 | 2.67 |   1 |    4 | 1.33 |    3 |    4 |  54.2 |
| RoomReady            |    2 | 2.67 |   3 |    2 | 2.67 |   3 | 2.33 |    2 |    3 |    4 |  51.7 |
| BenchRelay           | 1.33 |  3.5 |   3 | 1.83 | 2.17 |   3 | 2.83 | 1.17 |  3.5 |    4 |  50.8 |
| FieldPair            |    1 | 3.33 |   2 | 1.33 |    2 |   4 |    3 |    1 |    3 |    4 |  46.7 |
| Kept                 |    2 | 3.67 |   3 | 2.67 |    2 |   2 | 3.67 |    3 | 2.67 |    3 |  54.5 |

IM impact, CO connectors, WF day-to-day workflow, RE research, TI time to impact, TH theme, OR originality, UR real use, BU buildability, DE demo.

## Scoring matrix

The organisers haven't posted official criteria. At the briefing NTT DATA said its team will rate five points, with no weights or scale ([brief](/docs/BRIEF.md#judging-and-prizes), [context](/docs/CONTEXT.md#what-ntt-data-said-it-will-rate)). **Inference:** the weights below are ours. Replace them if official criteria appear.

### Team limits

Every score assumes the team as it is on 5 November 2026, not as it might be:

- Nobody on the team can be at APU before 10 November, so no phone can be placed, carried, or ridden on campus.
- No APU staff, lecturer, or office will help or act during the build, and no users are recruited yet. The main ranking applies this to the build's critical path; [Alternative ranking under strict limits](#alternative-ranking-under-strict-limits) also rules out APU's written permission and APU offices as the only users.
- The only devices are the team's own Android phones and iPhones and one Raspberry Pi 5 (8 GB) at a team member's home, with no add-on sensors and no payment card ([IoT and network](/docs/research/iot-and-network.md#the-teams-devices)).
- No Gemini Enterprise licence has arrived; scorers assumed one arrives through the event on a supported domain.

### Components and weights

NTT DATA's five points share 65 equally, since it gave no weights; equal weights are a choice, not evidence. The other 35 go to the related criteria that recur across the seven sets' matrices. Each component maps to the matching components of the sets, so nothing is counted twice.

| ID  | Component           | Weight | Scores 5 when                                                                                                                                                                               | Scores 1–2 when                                                                                                 | From the sets                                                                            |
| --- | ------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| IM  | Impact              |     13 | A named APU office or student group as owner, a repeated task with countable real volume, a consequence that matters, and a timed baseline with a before and after by 10 November           | "All students"; a rare or trivial task; a benefit nobody can measure this week                                  | argon-01 C1, argon-02 M7, astra I, opus-01, opus-02 and opus-03 Impact, sol I            |
| CO  | Connectors          |     13 | Distinct GA 1P and 3P connectors, each doing a real job: live read, decision input, approved write; MCP only as an add-on; no indexed copies for live values                                | Chat only; one connector; preview features or custom MCP on the critical path                                   | argon-01 C2, argon-02 M1, astra T, opus-01 and opus-02 Connectors, opus-03 T, sol T      |
| WF  | Day-to-day workflow |     13 | Starts on a schedule or connector event, runs unattended for days, reads an editable rule set, recovers from failures, keeps one human approval                                             | Needs a typed prompt; nothing recurs; writes without review                                                     | argon-01 C3, argon-02 M2, astra W, opus-01, opus-02 and opus-03 W, sol W                 |
| RE  | Research            |     13 | Documented, cited evidence of the pain at APU or in Malaysian higher education, plus 6–8 interviewees, a timed observation, and 30–50 real items the team can reach by 10 November          | Speculative or non-local pain; interviewees or items out of reach this week                                     | argon-01 C5, argon-02 M5, astra R, opus-01, opus-02 and opus-03 Research, sol R          |
| TI  | Time to impact      |     13 | First value within weeks; a dated 3- and 6-month plan with a named owner and its assumptions; no change to APU's private systems                                                            | A semester of approvals or APU system changes before anyone benefits                                            | argon-01 C6, argon-02 M8, astra H, opus-01 and opus-02 Time to impact, opus-03 TT, sol V |
| TH  | Theme               |     10 | Cloud, IoT, and network each visible and load-bearing: a real sensor the team runs off campus, the network visible per reading                                                              | IoT decorative or absent, or only third-party feeds polled; network invisible                                   | argon-01 C4, argon-02 M3, opus-01 and opus-02 Theme, opus-03 C                           |
| OR  | Originality         |      9 | Far from the [crowd's saturated and crowded tiers](/docs/research/competition.md#saturation-tiers), the briefing's four examples, APU's AIDA assistant, and documented incumbents           | IT-helpdesk network watch, chatbot, tutor, navigation, attendance, briefing examples, or an incumbent's feature | argon-01 C7, argon-02 M6, opus-01, opus-02 and opus-03 Originality, sol O                |
| UR  | Real use            |      6 | Cited evidence that people already spend effort on this (self-built tools, repeated requests, a kept workaround), reached through a channel they already use; evidence only, not a forecast | No cited workaround behaviour; needs a new app habit                                                            | opus-01 and opus-02 Usage, opus-03 U, argon-02 M5                                        |
| BU  | Buildability        |      5 | Build effort only: three people finish a working loop by 10 November with small scope and few moving parts                                                                                  | Many components or devices, or scope beyond a week                                                              | opus-03 F, sol F, opus-01 and opus-02 Buildable gate                                     |
| DE  | Demo                |      5 | Lands in a 3–4 minute video from the live system, and a reviewer can trigger it themselves                                                                                                  | Needs a rare real event; a reviewer can't trigger it                                                            | opus-01 and opus-02 Demo, opus-03 D, sol D                                               |

What changed from the matrix this page used on 4 November: the NTT five drop from 14 to 13 each, originality from 10 to 9, and **real use** becomes its own row, because four of the seven sets weight it separately and the old matrix had folded it into time to impact. Buildability now measures build effort only, since the new gate carries the team's limits.

### Scale and aggregation

- **Scale:** 1 has major unsupported dependencies; 2 a plausible mechanism with substantial gaps; 3 a credible partial path; 4 a strong proposed fit supported by evidence; 5 an especially direct structural fit. A 5 is a hypothesis, not a result. Integers only.
- **Total:** Σ (weight × score) / 5, out of 100.
- **Three scorers, conservative on the loop:** the mean of three independent scorers per component, except day-to-day workflow and theme, which take the lowest score. Those two are where a demo most easily overstates a real system.
- **Ties** at one decimal go to the higher subtotal on NTT DATA's five points.

### Gates

Failing a gate ranks an idea below every idea that passes, whatever its score. A gate fails when most of the scorers' verdicts fail it; "conditional" means it passes only if a named assumption holds.

- **G1 Real data:** only live team-device readings, live public feeds, real events the system creates, or labelled replays of published real datasets; no mock, sample, or synthetic data, and no cached fallback ([project conventions](/docs/references/project-conventions.md), [decisions](/docs/CONTEXT.md#decisions-so-far)).
- **G2 Privacy:** no private records the team can't lawfully get, no biometrics, and no personal data in free-tier prompts.
- **G3 Gemini Enterprise core:** the deciding step runs in a Gemini Enterprise workflow or agent; everything else feeds it.
- **G4 Off-campus build (new):** the critical path needs no team member at APU, no APU staff action, and only the team's phones, the one Pi 5, public feeds, and free accounts. An idea that needs a phone on a shuttle, in a lift lobby, on a campus charger, or at a campus window fails. It's a hard gate on purpose: the team's limits are facts, so an idea that needs campus presence can't be built by this team this week, however good it is. The [G4-lifted view](#sensitivity) shows the order if campus access appears.

Real data and loud failure are gates, not scored rows, on purpose: every idea must meet them, so a scored row would reward compliance twice. Republishing APU content without APU's written permission, or a preview feature or custom MCP on the critical path, is recorded as a fatal-risk flag rather than a gate ([APU's terms of use](/docs/research/apu.md#terms-of-use-and-robotstxt)).

## Sensitivity

The same component scores under five other weightings, and with the off-campus gate lifted. Rank in brackets.

| Product              |      Base | NTT five only | Impact-first | Delivery-first | Originality-heavy | Old weights | G4 lifted |
| -------------------- | --------: | ------------: | -----------: | -------------: | ----------------: | ----------: | --------: |
| Outage Witness       |  71.3 (1) |      74.7 (2) |     69.5 (1) |       71.3 (1) |          70.1 (3) |    73.3 (1) |  71.3 (1) |
| Skyclause            |  71.1 (2) |      74.7 (3) |     69.5 (2) |       69.4 (3) |          71.1 (2) |    71.6 (2) |  71.1 (2) |
| ChronoDiff           |  71.0 (3) |      76.0 (1) |     69.4 (3) |       69.9 (2) |          71.5 (1) |    71.2 (3) |  71.0 (3) |
| Fanfall              |  68.3 (4) |      73.3 (4) |     66.1 (6) |       67.4 (6) |          68.3 (5) |    68.7 (5) |  68.3 (4) |
| Bangun               |  68.1 (5) |      70.7 (6) |     66.9 (4) |       67.5 (5) |          68.5 (4) |    68.8 (4) |  68.1 (5) |
| Tukar                |  67.9 (6) |      73.3 (5) |     66.7 (5) |       67.1 (7) |          66.3 (6) |    67.3 (6) |  67.9 (6) |
| Khabar               |  65.9 (7) |     64.0 (10) |     63.2 (7) |       68.6 (4) |          65.5 (8) |    66.1 (7) |  65.9 (7) |
| Janji                |  64.5 (8) |      65.3 (9) |     62.8 (8) |       64.1 (9) |          66.3 (7) |    65.7 (8) |  64.5 (8) |
| KuyohGuard           |  64.2 (9) |      70.7 (7) |     62.5 (9) |       64.1 (8) |         63.2 (10) |    65.1 (9) |  64.2 (9) |
| BoardCast            | 63.1 (10) |     64.0 (11) |    61.6 (10) |      63.4 (10) |          64.9 (9) |   63.5 (10) | 63.1 (10) |
| GateWatch            | 61.3 (11) |      66.7 (8) |    58.1 (11) |      63.1 (11) |         58.7 (12) |   62.7 (11) | 61.3 (11) |
| Cap Masa             | 59.1 (12) |     56.0 (13) |    56.5 (12) |      60.5 (13) |         58.8 (11) |   58.9 (12) | 59.1 (12) |
| Research & FYP Nexus | 57.1 (13) |     62.7 (12) |    56.0 (13) |      60.8 (12) |         54.8 (14) |   58.2 (13) | 57.1 (13) |
| BiblioForge          | 54.2 (14) |     56.0 (14) |    51.8 (14) |      56.5 (14) |         57.1 (13) |   56.2 (14) | 54.2 (15) |
| RoomReady            | 51.7 (15) |     49.3 (15) |    49.9 (15) |      54.4 (15) |         51.5 (16) |   52.2 (16) | 51.7 (16) |
| BenchRelay           | 50.8 (16) |     47.3 (16) |    47.1 (16) |      54.2 (16) |         52.0 (15) |   52.3 (15) | 50.8 (17) |
| FieldPair            | 46.7 (17) |     38.7 (17) |    42.9 (17) |      49.2 (17) |         49.3 (17) |   48.1 (17) | 46.7 (18) |
| Kept                 | 54.5 (18) |     53.3 (18) |    52.5 (18) |      54.5 (18) |         56.7 (18) |   54.3 (18) | 54.5 (14) |

Full weights:

- **Base:** IM, CO, WF, RE, TI 13 each; TH 10; OR 9; UR 6; BU 5; DE 5.
- **NTT five only:** the five NTT points at 20 each.
- **Impact-first:** IM 25; CO, WF, RE, TI 11 each; TH 9; OR 8; UR 6; BU 4; DE 4.
- **Delivery-first:** IM 9; CO 12; WF 16; RE 9; TI 14; TH 9; OR 5; UR 6; BU 12; DE 8.
- **Originality-heavy:** OR 20; the NTT five 11 each; TH 10; UR 5; BU 5; DE 5.
- **Old weights:** the 4 November matrix, with the NTT five at 14 each, TH 10, OR 10, BU 5, DE 5, and no real-use row.
- **G4 lifted:** base weights, with the off-campus gate ignored.

What moves:

- **The top three never leave ranks 1–3.**
- **[Khabar] rises to 4th** under delivery-first, on its buildability (3.67).
- **[KuyohGuard] rises to 7th** under NTT five only, because its connectors, research and time to impact are stronger than its theme.
- **Lifting G4 moves Kept from 18th to 14th,** and the four products below it each drop one place.

The spread between scorers is wider than the spread between weightings. Khabar ranges from 62.0 with the FDE to 74.4 with the lecturer.

## Alternative ranking under strict limits

The main ranking reads "no APU staff will help" as "no APU staff on the build's critical path". It still credits two things the team can't get if nobody at APU acts at all:

- **APU's written permission:** APU's Terms of Use ask for it before any use of its content ([terms](/docs/research/apu.md#terms-of-use-and-robotstxt)), and granting it is an APU staff action. Seven products read APU's timetable feed, including the recommended ChronoDiff.
- **APU offices as users:** several products name an APU office as owner, and some reach no user until that office acts.

This view applies the limits strictly: no one from the team at APU, no lecturer, office or staff member acting, approving, adopting or granting permission, and only the team's phones and one Pi 5. On top of G1–G4 it adds two gates. Scores are unchanged, because the scorers already assumed the team limits; only the gates differ.

- **S1 No APU permission:** the core loop works without APU's written permission. A product fails if its core input is APU content that its doc says needs permission, and it stops or loses its core without it. A permission-gated add-on doesn't fail it.
- **S2 Value without APU:** someone other than APU staff, such as a student, a student group or the team, gets the output before or soon after 10 November with no APU office acting.

| Strict rank | Product                | Main rank | Score | NTT five | S1 permission | S2 value without APU | Why                                                                                                                             |
| ----------: | ---------------------- | --------: | ----: | -------: | ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
|           1 | [Outage Witness]       |         1 |  71.3 |     48.5 | Pass          | Pass                 | Students check whether Moodle or APSpace failed for everyone before filing; HEAD probes copy nothing                            |
|           2 | [Skyclause]            |         2 |  71.1 |     48.5 | Pass          | Pass                 | Reads no APU content; club organisers and commuting students opt in through student channels                                    |
|           3 | [Fanfall]              |         4 |  68.3 |     47.7 | Pass          | Pass                 | Public rail, bus and venue feeds; students subscribe to the surge-night calendar by URL                                         |
|           4 | [Tukar]                |         6 |  67.9 |     47.7 | Pass          | Pass                 | No APU content or office; FYP students recruited on Reddit and X                                                                |
|           5 | [Khabar]               |         7 |  65.9 |     41.6 | Pass          | Pass                 | Phone events only; students living alone and their buddies                                                                      |
|           6 | [Janji]                |         8 |  64.5 |     42.5 | Pass          | Pass                 | Drive, GitHub and wrap-up audio; the team and outside student groups                                                            |
|           7 | [KuyohGuard]           |         9 |  64.2 |     45.9 | Pass          | Borderline           | Runs on government feeds without the APU dismissal join; riders get advisories only through the opt-in list in its 3-month plan |
|           8 | [Cap Masa]             |        12 |  59.1 |     36.4 | Pass          | Pass                 | Times APU's public sign-in pages without copying them; the student owns the evidence pack                                       |
|           9 | [Research & FYP Nexus] |        13 |  57.1 |     40.7 | Pass          | Pass                 | OpenAlex and arXiv; the APU page fetch is an add-on; students email their drafts                                                |
|          10 | [RoomReady]            |        15 |  51.7 |     32.1 | Pass          | Pass                 | Reads no APU feed; the team's own sessions, then remote students                                                                |
|          11 | [BenchRelay]           |        16 |  50.8 |     30.8 | Pass          | Borderline           | No APU content; passes only because the team counts as its first user                                                           |
|          12 | [FieldPair]            |        17 |  46.7 |     25.1 | Pass          | Borderline           | No APU content; passes only because the team counts as its first user                                                           |
|           — | [ChronoDiff]           |         3 |  71.0 |     49.4 | Fail          | Pass                 | Its core is APU's timetable feed: "if APU refuses or the feed closes, ChronoDiff stops"                                         |
|           — | [Bangun]               |         5 |  68.1 |     45.9 | Fail          | Pass                 | Without the feed it loses its core alarm and becomes "an announcement relay"                                                    |
|           — | [BoardCast]            |        10 |  63.1 |     41.6 | Fail          | Pass                 | Builds the board from APU's timetable and shuttle feeds; "kill on a refusal"                                                    |
|           — | [GateWatch]            |        11 |  61.3 |     43.3 | Fail          | Pass                 | Its own kill line: "if the organisers refuse probing, stop"                                                                     |
|           — | [BiblioForge]          |        14 |  54.2 |     36.4 | Fail          | Borderline           | Needs the timetable feed and the Koha API; its first users are Library staff, not yet engaged                                   |
|           — | [Kept]                 |        18 |  54.5 |     34.7 | Fail          | Fail                 | Also fails G4; reads the shuttle API and timetable, and its packets go to the LNO desk                                          |

- **ChronoDiff drops out,** so the strict pick is between [Outage Witness] (71.3) and [Skyclause] (71.1). They also tie on NTT DATA's five points, at 48.5 each.
  - **Pick Skyclause if a teammate has a high window with a skyline.** It reads nothing of APU's.
  - **Otherwise pick Outage Witness.** It times Moodle and APSpace with HEAD requests that copy nothing.
- **Probing APU's hosts is the soft spot.** Outage Witness and Cap Masa assume that timing APU's public sign-in pages needs no permission. GateWatch's doc treats the same kind of check as permission-gated and stops on a refusal. If APU's terms cover probing, Outage Witness and Cap Masa fall too, and Skyclause and Fanfall lead.
- **[Tukar] (67.9) is the cleanest fit:** no APU content, no APU office, and users the team can reach on Reddit and X. It sits 3.4 points behind the leader, inside the scorers' noise.
- **Six products drop out:**
  - On S1, five products whose core needs APU's permission: ChronoDiff, Bangun, BoardCast, GateWatch and BiblioForge.
  - Kept, which fails G4, S1 and S2.
- **Borderline calls:**
  - KuyohGuard passes S2 only through the opt-in rider list in its 3-month plan.
  - BenchRelay and FieldPair pass S2 only because the team counts as their first user.
- **How the classification was made:** an independent classifier on a different model read the 18 docs blind, and disagreed on three products.
  - GateWatch now fails S1, on its own kill line, which overrode the probing exemption.
  - Bangun fails S1: without the feed, its doc says what remains is "an announcement relay with no feed-based alarm: a much smaller product". The classifier had passed it.
  - KuyohGuard passes S2, as the classifier argued.

## The 32 source ideas reranked

Before any merging, three independent scorers rated all 32 source ideas on the same matrix. They scored fresh, ignoring each set's own scores. They were told that length earns nothing: the opus docs run 265–430 lines, while the argon-01, astra and sol docs run 67–160.

| Rank | Idea                                                                                | Set      | Set's own rank |   IM |   CO |   WF |   RE |   TI |   TH |   OR |   UR |   BU |   DE | Total | Gates    | Fed product          |
| ---: | ----------------------------------------------------------------------------------- | -------- | -------------: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ----: | -------- | -------------------- |
|    1 | [Tukar](/docs/ideas/opus/03/01-tukar.md)                                            | opus-03  |              1 | 3.33 |    4 |    4 | 4.33 |    4 |    2 | 3.67 |    4 | 2.67 |    4 |  73.2 | pass     | Tukar                |
|    2 | [Fanfall](/docs/ideas/opus/01/03-fanfall.md)                                        | opus-01  |              3 |    3 | 4.67 |    4 |    4 | 3.67 |    2 |    4 | 3.67 | 2.67 | 4.33 |  72.9 | pass     | Fanfall              |
|    3 | [Skyclause](/docs/ideas/opus/01/02-skyclause.md)                                    | opus-01  |              2 | 3.67 |    4 |    5 | 3.33 |    3 |    3 |    4 |    3 |    2 |    4 |  72.2 | pass     | Skyclause            |
|    4 | [Bangun](/docs/ideas/opus/03/02-bangun.md)                                          | opus-03  |              2 | 3.33 | 3.67 |    4 |    4 |    4 |    3 |    3 | 3.67 | 2.33 |    4 |  71.5 | pass     | Bangun               |
|    5 | [Janji](/docs/ideas/opus/03/03-janji.md)                                            | opus-03  |              3 | 2.92 |  3.5 |    4 | 3.75 | 3.25 | 2.75 | 3.17 | 2.83 | 2.92 |    4 |  66.8 | pass     | Janji                |
|    6 | [Cap Masa](/docs/ideas/opus/03/04-cap-masa.md)                                      | opus-03  |              4 |    2 | 3.67 |    4 | 3.33 |    3 |    4 | 2.67 |    3 | 3.33 |    4 |  65.3 | pass     | Cap Masa             |
|    7 | [Khabar](/docs/ideas/opus/03/05-khabar.md)                                          | opus-03  |              5 |    2 |    4 |    4 | 2.33 |    3 |    4 | 3.33 | 2.67 |    4 |    4 |  65.1 | pass     | Khabar               |
|    8 | [ChronoDiff](/docs/ideas/argon/02/01-chronodiff.md)                                 | argon-02 |              1 | 2.67 | 3.67 |    4 |    3 | 2.67 |    2 | 3.33 |    4 |    3 | 2.33 |  61.7 | pass     | ChronoDiff           |
|    9 | [Kuyoh Shuttle Sentinel](/docs/ideas/argon/01/02-kuyoh-shuttle-sentinel.md)         | argon-01 |              2 | 2.67 | 3.33 |    4 | 2.67 | 2.33 |    2 | 3.67 |    2 |    3 | 2.33 |  57.3 | pass     | KuyohGuard           |
|   10 | [KuyohGuard](/docs/ideas/argon/02/02-kuyohguard.md)                                 | argon-02 |              2 | 2.67 | 3.33 |    4 | 2.67 | 2.67 |    2 | 3.33 |    2 |    2 | 2.67 |  56.9 | pass     | KuyohGuard           |
|   11 | [GateWatch](/docs/ideas/argon/02/04-gatewatch.md)                                   | argon-02 |              4 | 2.33 |    3 |    4 | 2.67 | 2.33 |    3 |    2 | 2.33 | 2.67 | 2.33 |  54.7 | pass     | GateWatch            |
|   12 | [BoardCast](/docs/ideas/opus/02/02-boardcast.md)                                    | opus-02  |              1 |    2 |    3 |    3 |    2 | 2.33 |    3 | 3.67 |    2 |    2 | 3.33 |  52.4 | pass     | BoardCast            |
|   13 | [Research & FYP Nexus](/docs/ideas/argon/01/04-research-fyp-nexus.md)               | argon-01 |              4 | 2.67 |    3 |    3 |    3 | 2.33 |    1 |    2 |    2 | 3.33 | 3.67 |  51.4 | pass     | Research & FYP Nexus |
|   14 | [BenchRelay](/docs/ideas/sol/01/01-benchrelay.md)                                   | sol      |              1 | 1.67 |    3 |    3 | 1.67 |    3 |    2 |    3 | 1.67 | 4.33 | 2.67 |  50.5 | pass     | BenchRelay           |
|   15 | [CanonKeeper](/docs/ideas/argon/02/03-canonkeeper.md)                               | argon-02 |              3 | 2.67 | 3.33 |    3 | 2.33 | 2.33 |    1 |    3 | 1.67 | 2.33 | 2.67 |  49.9 | pass     | Not carried forward  |
|   16 | [BiblioForge](/docs/ideas/argon/02/05-biblioforge.md)                               | argon-02 |              5 | 2.67 | 3.33 |    3 | 1.67 |    2 |    1 | 3.67 | 1.67 |    3 | 2.67 |  49.2 | pass     | BiblioForge          |
|   17 | [RoomReady](/docs/ideas/sol/01/02-roomready.md)                                     | sol      |              2 |    2 |    2 |    2 | 2.33 |    3 |    2 |    2 |    2 |    4 | 3.33 |  46.8 | pass     | RoomReady            |
|   18 | [FieldPair](/docs/ideas/sol/01/03-fieldpair.md)                                     | sol      |              3 | 1.33 |    3 |    2 | 1.33 |    2 |    3 | 3.67 | 1.33 | 3.67 |    3 |  46.0 | pass     | FieldPair            |
|   19 | [Timetable & HVAC Reconciler](/docs/ideas/argon/01/03-timetable-hvac-reconciler.md) | argon-01 |              3 | 2.67 |    2 |    3 | 2.67 | 2.33 |    1 | 2.33 |    2 |    2 | 2.33 |  45.9 | pass     | ChronoDiff           |
|   20 | [QuietPact](/docs/ideas/sol/01/04-quietpact.md)                                     | sol      |              4 | 1.33 |    2 |    1 |    2 | 2.33 |    2 | 3.67 | 1.33 | 3.33 |    2 |  40.1 | pass     | RoomReady            |
|   21 | [CaptureLoop](/docs/ideas/sol/01/05-captureloop.md)                                 | sol      |              5 |    1 |    1 |    1 |    1 |    2 |    1 |    2 |    1 | 3.33 | 2.33 |  28.1 | pass     | Not carried forward  |
|   22 | [Kept](/docs/ideas/opus/01/01-kept.md)                                              | opus-01  |              1 | 3.33 | 4.67 |    4 | 2.67 |    3 |    3 |    4 | 3.33 | 2.33 | 3.33 |  68.8 | fails G4 | Kept                 |
|   23 | [Outage Witness](/docs/ideas/opus/01/05-outage-witness.md)                          | opus-01  |              5 |    3 | 3.67 |    4 |    3 | 2.33 |    4 | 3.33 |    3 |    2 | 3.33 |  64.5 | fails G4 | Outage Witness       |
|   24 | [Sempat](/docs/ideas/opus/01/04-sempat.md)                                          | opus-01  |              4 |    3 |    4 |    3 |    2 | 2.67 |    3 | 4.33 | 2.33 | 2.33 |    3 |  60.1 | fails G4 | ChronoDiff           |
|   25 | [LiftBoard](/docs/ideas/opus/02/01-liftboard.md)                                    | opus-02  |              2 |    2 |    3 |    3 |    2 |    2 |    3 | 3.67 |    2 | 2.33 | 3.33 |  51.9 | fails G4 | Not carried forward  |
|   26 | [WashWitness](/docs/ideas/astra/01/04-washwitness.md)                               | astra    |              4 |    2 |    3 |    3 | 1.67 |    2 |    3 |    3 |    2 | 3.67 |    2 |  49.8 | fails G4 | Not carried forward  |
|   27 | [Recheck](/docs/ideas/astra/01/01-recheck.md)                                       | astra    |              1 | 2.17 |    3 | 2.75 | 2.25 | 2.08 | 2.75 | 1.58 | 1.92 | 3.83 | 2.75 |  49.1 | fails G4 | GateWatch            |
|   28 | [AccessRelay](/docs/ideas/astra/01/03-accessrelay.md)                               | astra    |              3 |    2 |    3 |    2 |    2 |    2 |    2 | 2.67 |    2 | 3.67 |    2 |  45.5 | fails G4 | Not carried forward  |
|   29 | [LastLink](/docs/ideas/astra/01/02-lastlink.md)                                     | astra    |              2 |    2 | 2.67 |    2 |    2 |    2 |    1 | 3.33 |    2 | 3.67 |    2 |  43.8 | fails G4 | Kept                 |
|   30 | [OnBoard Airtime Guard](/docs/ideas/argon/01/05-onboard-airtime-guard.md)           | argon-01 |              5 | 2.33 |    2 |    2 | 2.33 | 2.33 |    2 | 1.67 |    2 |    3 | 2.67 |  43.7 | fails G4 | Not carried forward  |
|   31 | [SpineDesk Pulse](/docs/ideas/argon/01/01-spinedesk-pulse.md)                       | argon-01 |              1 | 2.67 |    2 |    3 |    2 |    2 |    2 |    1 |    2 |    2 | 2.67 |  43.2 | fails G4 | GateWatch            |
|   32 | [LabRelay](/docs/ideas/astra/01/05-labrelay.md)                                     | astra    |              5 |    2 | 2.67 |    3 | 1.67 | 1.67 |    1 | 2.67 | 1.33 | 1.67 |    2 |  40.7 | fails G4 | Not carried forward  |

- **The sets' first choices split.**
  - opus-03's Tukar ranks 1st, argon-02's ChronoDiff 8th, opus-02's BoardCast 12th and sol's BenchRelay 14th.
  - opus-01's Kept, astra's Recheck and argon-01's SpineDesk Pulse fail the off-campus gate.
- **11 of the 32 fail the off-campus gate.** Ten of them come from argon-01, astra and opus-01, the three sets written on 3–4 November, before the team's limits were known. Every argon-02, opus-03 and sol idea passes.
- **Scores track doc length.** Despite the instruction, Pass A totals correlate with source length (r = 0.79). The longer opus docs also carry more measured evidence, so the two can't be separated.
  - The length bias could have cut short docs unfairly. So a product was carried forward if its lead cleared 50 either raw or after a length correction. RoomReady, FieldPair and BiblioForge came in that way.
  - Pass B then scored product docs that all run 200–259 lines.

## How the products were merged

Three merge proposers, one per persona, read every idea's digest and the head of each source doc. Each grouped the ideas one team would build as one product, because they serve the same owner and make the same decision. A pair merged when at least two of the three agreed, and a product is a set of connected pairs. That turned the 32 ideas into 25 products.

| Product      | Merged from                                     | Agreement                                                                 | What the merge kept                                                                                                                                                                                             |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ChronoDiff] | ChronoDiff, Timetable & HVAC Reconciler, Sempat | 3 of 3 for the Reconciler; 2 of 3 for Sempat                              | ChronoDiff's home-Pi release diff leads; the Reconciler's physical/online and group-prefix rules; Sempat's tight-transfer rule and fix watch. The HVAC half is dropped, and lift timing waits for campus access |
| [KuyohGuard] | KuyohGuard, Kuyoh Shuttle Sentinel              | 3 of 3                                                                    | KuyohGuard's Pi join of public feeds and dismissal waves; Sentinel's Green/Amber/Red rulebook and Jira incidents. The phone probe at the LRT queue is dropped                                                   |
| [GateWatch]  | GateWatch, Recheck, SpineDesk Pulse             | 2 of 3 for each pairing with Recheck; 1 of 3 for GateWatch with SpineDesk | GateWatch's three off-campus vantages; Recheck's rule that a fix counts only after a comparable re-run; SpineDesk's SLA clause on in-session faults. The lectern probe waits for campus access                  |
| [RoomReady]  | RoomReady, QuietPact                            | 2 of 3                                                                    | RoomReady's tested room-device-connection choice; QuietPact's explicit accept-or-counter step, now a household-noise branch                                                                                     |
| [Kept]       | Kept, LastLink                                  | 3 of 3                                                                    | Kept's on-device counter, nightly grade and Done watch; LastLink's evidence states and design-gap packet. The Kuyoh feeds moved to KuyohGuard                                                                   |

- **Pairings proposed by only one scorer stayed apart:** Kept with BoardCast, Sempat with LiftBoard, and Outage Witness with Cap Masa. Each pair has different owners or decisions.
- **Carried forward to a product doc:** every product that passes all gates and whose lead scored at least 50 in Pass A, either raw or after the length correction. That gives 16 products. Two more came in as the strongest products that failed only the off-campus gate: Kept and Outage Witness, to show what campus access would buy. Outage Witness's writer then rebuilt it around an off-campus build, which Pass B passed.
- **Not carried forward (7):**
  - [CanonKeeper](/docs/ideas/argon/02/03-canonkeeper.md) (49.9) and [CaptureLoop](/docs/ideas/sol/01/05-captureloop.md) (28.1), on score.
  - [LiftBoard](/docs/ideas/opus/02/01-liftboard.md), [WashWitness](/docs/ideas/astra/01/04-washwitness.md), [AccessRelay](/docs/ideas/astra/01/03-accessrelay.md), [OnBoard Airtime Guard](/docs/ideas/argon/01/05-onboard-airtime-guard.md) and [LabRelay](/docs/ideas/astra/01/05-labrelay.md), on the off-campus gate.
  - The 4 November product docs for LiftBoard, LabRelay and WashWitness are removed. Sempat's doc is folded into ChronoDiff.

Each product's "Origins" section records what it kept, changed, and dropped from every source.

## How to choose

- **Pick [ChronoDiff] by default.**
  - **Why:** all three scorers passed it on all four gates, so it is the one top-three product whose off-campus build carries no condition, and it holds the highest NTT-five subtotal. Like every product, it still needs the feed permission below and a licence on a Workspace domain.
  - **Risk:** it bulk-reads APU's timetable feed, and APU's Terms of Use ask for permission first ([terms](/docs/research/apu.md#terms-of-use-and-robotstxt)). Ask through the organisers now. If APU refuses, ChronoDiff stops and shows the error, with no cached copy.
  - **Kill line:** on Sunday 8 November, stop if fewer than 10 of its 40 labelled items are problems a scheduler or student would act on.
  - **Theme:** its theme score is 2, so the pitch must show the Pi as an edge diff engine and network probe, not claim a sensor.
- **Pick [Skyclause] for the strongest institutional hook,** the ministry's 7 October haze instruction.
  - It scores 4 on research and needs no APU feed.
  - It does need a teammate's window with a skyline, and its target owner office has one unconfirmed public mention and no knowledge-base page.
  - Its buildability is the lowest in the top three (2).
- **Pick [Outage Witness] for the highest score, knowing what that score buys.**
  - It ranks on its off-campus service-scope build, which witnesses Moodle and APSpace failures. The full residence and campus product needs phones on APU chargers and staff consent.
  - Its real-use score (2) is the lowest in the top tier.
- **Pick [Tukar] for the strongest research and real use** (4 and 4).
  - Its users are the interviewees: FYP students who post survey requests daily.
  - It needs no APU feed or office. Its theme is 2.
- **Don't build two.**
  - Outage Witness and GateWatch both probe Moodle and APSpace from outside APU.
  - ChronoDiff, Bangun, BoardCast, KuyohGuard, GateWatch, BiblioForge and Kept all read APU's timetable feed, so one permission request covers all seven; Kept and BoardCast also read APU's shuttle API.
  - KuyohGuard, BoardCast and Kept share the shuttle corridor.
- **Pick [Kept] only if campus access appears.** Even then it ranks 14th, below 13 products built for the team's limits.

## What the rerank changed

- **The order turned over.**
  - Kept fell from 1st to last, on the off-campus gate.
  - Sempat (2nd on 4 November) is now a rule inside ChronoDiff.
  - Outage Witness rose from 3rd to 1st by dropping its campus probes.
  - Twelve of the 18 products are new: five from opus-03, four from argon-02, and three from sol.
- **The matrix gained a real-use row and an off-campus gate,** and buildability now measures build effort only ([Components and weights](#components-and-weights)).
- **Writing and fact-checking the products corrected several source claims.** Each correction is recorded in the product's "Origins" section.
  - **GitHub isn't on Workflow Builder's connector list** ([workflows](/docs/research/gemini-enterprise.md#workflows)). Bangun now writes Jira issues instead, and Janji reads commits through an Apps Script feeder.
  - **BigQuery, Cloud Run and Pub/Sub need billing,** and the team has no card. KuyohGuard and BiblioForge now write to a Sheet through Apps Script.
  - **The Globalping connector is preview.** Outage Witness now calls Globalping's public API from the feeder.
  - **Dropped or corrected numbers:**
    - Skyclause's haze backtest is 9 Hybrid, 5 Outdoor-limited and 7 Normal, not 8, 5 and 8.
    - Fanfall's station is 880 m away, not 900 m.
    - Bangun's "no intake-group starts at the same time every day" is 1 of 953.
    - BiblioForge's Library KB space has 58 pages, not 65, and its Koha catalogue needs a sign-in.
    - Tukar's "absent from 780 simulated ideas" had no source, so it now says no crowd cluster covers survey recruitment.
    - Janji's build plan was a weekday off.
- **The final scorers reported 5 more errors,** and all 5 were fixed before publishing:
  - ChronoDiff's transfer count now states its room scope.
  - ChronoDiff's App Store quote is no longer labelled as a Play review.
  - Cap Masa's Unifi clock now notes that its start is ambiguous.
  - Kept's departure count now says it covers 36 of 39 departures.
  - Fanfall's event count now names the API filter. That report was itself a scorer error: the API returns 36 completed events with `status=Completed` and 26 unfiltered.
  - The scores predate these fixes.

## Method

1.  **Matrix:** built from the seven sets' matrices and NTT DATA's five points. A separate review on a different model then tightened the real-use definition, raised theme to 10, rotated models across personas, added a second anchor, and moved the team's limits out of the score rows into the off-campus gate.
1.  **Pass A, rerank the 32:** three personas, an NTT DATA forward deployed engineer (FDE), an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student, scored four length-balanced batches of 7–8 ideas.
    - **Models:** each persona ran on Claude Opus 5.5, Claude Sonnet 5.5 or Claude Fable 5.1, rotated across batches so no persona kept one model.
    - **Anchors:** every batch also held two anchor ideas, Recheck and Janji, to measure drift, and the doc order was rotated per scorer.
    - **Checks:** scorers spot-checked every 5 and at least two load-bearing claims per idea against the research or live sources.
1.  **Merge:** three proposers grouped the ideas; majority pairs gave 25 products, and 18 were carried forward.
1.  **Write:** one writer per product. Each writer had the scorers' reasons, fatal risks and contradicted claims, but no numbers, and re-checked figures against live sources on 5 November.
1.  **Pass B, rank the products:** three fresh scorers per doc, with the same personas, read each doc and fact-checked it.
    - **Batches:** two batches of 8, with BenchRelay in both. The three products carried forward late made a third batch, with Tukar and ChronoDiff as anchors.
    - **Models:** rotated to a new pattern, so each persona used all three models across the three batches.
    - Their scores are the ranking.

## Evidence limits

- **Nothing is validated.** No owner has agreed, no interview has happened, no Gemini Enterprise licence has been tested, and no workflow has run. Each product's research plan says what to measure first.
- **The scorers are AI personas from one model family, not the judges.** The 4 November ranking used three families. Self-preference toward docs written by the same family is possible, and the official criteria may reweight everything.
- **Batch drift is real.**
  - The same persona scored BenchRelay 51.8 and 61.8 in two Pass B batches. The lecturer scored it 47.4 and 57.0.
  - Between the main and late batches, Tukar moved by 2.1 points and ChronoDiff by 0.3.
  - In Pass A, the Janji anchor ranged from 59.8 to 80.4 across batches.
- **Length still tracks score in Pass B** (r = 0.70 across docs of 200–259 lines). Writers with more measured evidence wrote more, so this may be substance rather than bias.
- **Several products rank on a reduced build:** Outage Witness, KuyohGuard, BoardCast and GateWatch each defer a campus or permission-dependent part. Their docs' "Off-campus fit" sections say what's left out.
- **Permissions are pending:** seven products read APU's timetable feed, and APU's Terms of Use reserve copyright ([APU](/docs/research/apu.md#terms-of-use-and-robotstxt)).

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md): the event's rules and how to compete.
- [Competition](/docs/research/competition.md): what other teams will likely build and existing substitutes.
- [Judging](/docs/research/judging.md): comparable rubrics, evidencing each judging point, and packaging.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): workflows, triggers, connectors, actions, and reviewer access.
- [IoT and network](/docs/research/iot-and-network.md): what the team's phones and Pi 5 can sense and serve.
- The source idea sets: [argon-01](/docs/ideas/argon/01/00-ranking.md), [argon-02](/docs/ideas/argon/02/00-ranking.md), [astra](/docs/ideas/astra/01/00-ranking.md), [opus-01](/docs/ideas/opus/01/00-ranking.md), [opus-02](/docs/ideas/opus/02/00-ranking.md), [opus-03](/docs/ideas/opus/03/00-ranking.md), [sol](/docs/ideas/sol/01/00-ranking.md).
