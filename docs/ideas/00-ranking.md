# Idea ranking

**Build [Kept] first.** It grades APU's Campus Connect shuttle against its own published schedule every weeknight and hands the Logistics & Operations shuttle desk dated evidence for each recurring gap. It ranks first at 81.6 / 100, in every weighting tried and as an unmerged source idea, and needs no card or board: two phones, Google Workspace, Jira Cloud Free, and free GitHub Pages hosting. [Sempat] is the clear second at 77.5. Ranks 3–5 sit within 4.2 points, so treat them as a tier.

This page re-ranks the 15 ideas from the three idea sets ([argon](/docs/ideas/argon/00-ranking.md), [astra](/docs/ideas/astra/00-ranking.md), [opus](/docs/ideas/opus/00-ranking.md)) against one scoring matrix, merges the overlapping ones into 8 products, and ranks those. The matrix combines the three sets' matrices, NTT DATA's five judging points, and related criteria. The sets themselves are unchanged; this synthesis is the one place that compares them ([project conventions](/docs/references/project-conventions.md)). Dated 4 November 2026. Names are working names. Every score is a prospective estimate: there are no interviews, licence tests, or run history yet.

Contents:

1.  [Ranking](#ranking)
1.  [Scores by component](#scores-by-component)
1.  [Scoring matrix](#scoring-matrix)
    1.  [Components and weights](#components-and-weights)
    1.  [Scale and aggregation](#scale-and-aggregation)
    1.  [Gates](#gates)
1.  [Sensitivity](#sensitivity)
1.  [The 15 source ideas reranked](#the-15-source-ideas-reranked)
1.  [How the products were merged](#how-the-products-were-merged)
1.  [How to choose](#how-to-choose)
1.  [What the rerank changed](#what-the-rerank-changed)
1.  [Method](#method)
1.  [Evidence limits](#evidence-limits)
1.  [See also](#see-also)

## Ranking

| Rank | Product                | Owner (APU office, unconfirmed)                              | In one line                                                                                                        | Track                  | Score |
| ---: | ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----: |
|    1 | [Kept]                 | Logistics & Operations shuttle desk                          | Grades every shuttle departure against the published schedule nightly, raises recurring gaps, and watches each fix | Intelligent Automation |  81.6 |
|    2 | [Sempat]               | Schedulers office, Academic Administration                   | Checks each published timetable week's tight room changes against measured lift and stair times                    | Intelligent Automation |  77.5 |
|    3 | [Outage Witness]       | IT helpdesk at TechCentre                                    | Spare phones on chargers and public probes form an independent, timestamped register of connectivity failures      | Intelligent Automation |  72.7 |
|    4 | [Fanfall]              | GDGoC APU events lead, then Student Service                  | Forecasts each stadium night next door against APU's evening events and grades itself on next-day gate taps        | Data-Driven Research   |  72.7 |
|    5 | [Skyclause]            | Facilities, safety and welfare desk (not in APU's public KB) | Turns haze and storm readings into one logged, approved conditions call per wave of physical classes               | Intelligent Automation |  68.5 |
|    6 | [Research & FYP Nexus] | School of Technology FYP coordinator                         | Checks a draft final-year project against APU's own and recent outside work before supervisor matching             | Data-Driven Research   |  60.8 |
|    7 | [LabRelay]             | A lab equipment custodian (none secured)                     | Audits who acknowledged an equipment alarm and whether an independent reading confirms recovery                    | Intelligent Automation |  50.8 |
|    8 | [WashWitness]          | Residence office coordinator                                 | Accepts a laundry machine repair only after an observed working cycle                                              | Intelligent Automation |  46.2 |

- **Kept leads every view:** first under all five weightings, first among the 15 unmerged ideas (81.5), and first with each of the three final scorers (78.2, 86.6, 85.8).
- **Outage Witness and Fanfall tie at 72.7.** Fanfall leads by 0.07 before rounding. Ties at one decimal go to the higher score on NTT DATA's five points, the only criteria the judges stated, so Outage Witness (73.3) ranks above Fanfall (72.0). Outage Witness also ranks above Fanfall under three of the four other weightings.
- **Every product passed every gate** with all three scorers.

[Kept]: /docs/ideas/01-kept.md
[Sempat]: /docs/ideas/02-sempat.md
[Outage Witness]: /docs/ideas/03-outage-witness.md
[Fanfall]: /docs/ideas/04-fanfall.md
[Skyclause]: /docs/ideas/05-skyclause.md
[Research & FYP Nexus]: /docs/ideas/06-research-fyp-nexus.md
[LabRelay]: /docs/ideas/07-labrelay.md
[WashWitness]: /docs/ideas/08-washwitness.md

## Scores by component

Means of three independent scorers on a 1–5 scale. Day-to-day workflow and theme take the lowest of the three, as the totals do. Each product doc's "Scores" section gives every scorer's score and the lowest scorer's reason.

| Product              |   IM |   CO |  WF |   RE |   TI |  TH |   OR |   BU |   DE | Total |
| -------------------- | ---: | ---: | --: | ---: | ---: | --: | ---: | ---: | ---: | ----: |
| Kept                 |    4 | 4.33 |   4 | 4.33 | 3.33 |   5 |    4 | 3.33 | 4.33 |  81.6 |
| Sempat               |    4 | 4.33 |   4 | 3.33 | 3.33 |   4 | 4.33 | 3.67 |    4 |  77.5 |
| Outage Witness       | 3.33 | 4.33 |   4 | 3.67 |    3 |   4 | 2.67 | 3.67 | 4.33 |  72.7 |
| Fanfall              |    3 |    4 |   4 | 3.67 | 3.33 |   3 | 4.33 | 3.33 | 4.33 |  72.7 |
| Skyclause            |    3 |    4 |   4 | 3.33 |    3 |   3 | 3.33 | 3.33 |    4 |  68.5 |
| Research & FYP Nexus |    3 |    4 |   3 |    3 |    3 |   1 |    2 |    5 |    5 |  60.8 |
| LabRelay             | 1.67 | 3.33 |   3 | 1.67 | 1.67 |   4 |    3 |    2 |    3 |  50.8 |
| WashWitness          | 1.67 | 3.33 |   2 |    2 | 1.67 |   3 | 2.67 |    3 |    2 |  46.2 |

IM impact, CO connectors, WF day-to-day workflow, RE research, TI time to impact, TH theme, OR originality, BU buildability, DE demo.

## Scoring matrix

The organisers haven't posted official criteria. At the briefing NTT DATA said its team will rate five points, with no weights or scale ([brief](/docs/BRIEF.md#judging-and-prizes), [context](/docs/CONTEXT.md#what-ntt-data-said-it-will-rate)). **Inference:** the weights below are ours. Replace them if official criteria appear.

### Components and weights

NTT DATA's five points share 70 equally, since it gave no weights. Related criteria take the other 30: the theme, distance from the crowd, a one-week build, and a reviewable demo. Each component maps to the matching components of the three sets' matrices, so nothing is counted twice.

| ID  | Component           | Weight | Scores 5 when                                                                                                                                                | Scores 1–2 when                                                                      | From the sets                                     |
| --- | ------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| IM  | Impact              |     14 | One named APU office or group, a repeated task with countable volume, a consequence that matters, and a measurable before and after                          | "All students"; a rare or trivial task; a benefit that can't be measured             | astra I, argon C1, opus Impact                    |
| CO  | Connectors          |     14 | Distinct GA 1P and 3P connectors, each doing a real job: live read, decision input, approved write; MCP only as an add-on; no indexed copies for live values | Chat only; one connector; preview features or custom MCP on the critical path        | astra T, argon C2, opus Connectors                |
| WF  | Day-to-day workflow |     14 | Starts on a schedule or connector event, runs unattended for days, reads an editable rule set, recovers from failures, keeps one human approval              | Needs a typed prompt; nothing recurs; writes without review                          | astra W, argon C3, opus Day-to-day workflow       |
| RE  | Research            |     14 | Strong existing evidence of the pain, and 6–8 interviewees, a timed observation, and 30–50 real items reachable by 10 November                               | Speculative or non-APU pain; users or items out of reach this week                   | astra R, argon C5, opus Research                  |
| TI  | Time to impact      |     14 | A dated 3- and 6-month plan with a named owner, no change to APU's private systems, a channel people already use, still used after 6 months                  | Needs a semester of approvals or system changes; novelty use only                    | astra H, argon C6, opus Time to impact and Usage  |
| TH  | Theme               |     10 | Cloud, IoT, and network each visible and load-bearing: a real sensor the team runs, the network visible per reading                                          | IoT decorative or absent; network invisible                                          | argon C4, opus Theme, astra theme check           |
| OR  | Originality         |     10 | Far from the [crowd's saturated and crowded tiers](/docs/research/competition.md#saturation-tiers), the briefing's four examples, and APU's AIDA assistant   | IT-helpdesk network watch, chatbot, tutor, navigation, attendance, briefing examples | argon C7, opus Originality, astra differentiation |
| BU  | Buildability        |      5 | A 3-person team builds it by 10 November with no card and no hardware on the critical path                                                                   | Needs boards, many devices, a card, or access the team lacks                         | opus Buildable gate, astra feasibility            |
| DE  | Demo                |      5 | Lands in a 3–4 minute video from the live system, and a reviewer can trigger it themselves                                                                   | Needs a rare real event; a reviewer can't trigger it                                 | opus Demo, astra demo clarity                     |

### Scale and aggregation

- **Scale:** 1 has major unsupported dependencies; 2 a plausible mechanism with substantial gaps; 3 a credible partial path; 4 a strong proposed fit supported by evidence; 5 an especially direct structural fit. A 5 is a hypothesis, not a result.
- **Total:** Σ (weight × score) / 5, out of 100.
- **Three scorers, conservative on the loop:** the mean of three independent scorers per component, except day-to-day workflow and theme, which take the lowest score, following the opus set's rule. Those two are where a demo most easily overstates a real system.

### Gates

Failing a gate ranks an idea below every idea that passes, whatever its score. Responsible AI is a gate rather than points, so it isn't counted twice.

- **G1 Real data:** only live team-device readings, live public feeds, real events the system creates, or labelled replays of published real datasets; no mock, sample, or synthetic data, and no cached fallback when a source fails ([project conventions](/docs/references/project-conventions.md), [decisions](/docs/CONTEXT.md#decisions-so-far)).
- **G2 Privacy:** no private records the team can't lawfully get, such as grades, fees, applications, or visa records, and no biometrics.
- **G3 Gemini Enterprise core:** the deciding step runs in a Gemini Enterprise workflow or agent; everything else feeds it.

The draft matrix had a fourth gate, "users and 30–50 items reachable by 10 November". Review cut it because it duplicated Research and Buildability, and no idea has that evidence yet.

## Sensitivity

The same component scores under four other weightings. Rank in brackets.

| Product              | Base (14 ×5, 10, 10, 5, 5) | NTT five only (20 ×5) | Impact-first (IM 25) | Delivery-first (WF 18, TI 15, BU 12) | Originality-heavy (OR 20) |
| -------------------- | -------------------------: | --------------------: | -------------------: | -----------------------------------: | ------------------------: |
| Kept                 |                   81.6 (1) |              80.0 (1) |             81.2 (1) |                             80.4 (1) |                  81.6 (1) |
| Sempat               |                   77.5 (2) |              76.0 (2) |             77.8 (2) |                             77.0 (2) |                  78.6 (2) |
| Outage Witness       |                   72.7 (3) |              73.3 (3) |             71.9 (3) |                             74.2 (3) |                  70.7 (4) |
| Fanfall              |                   72.7 (4) |              72.0 (4) |             71.3 (4) |                             72.6 (4) |                  74.2 (3) |
| Skyclause            |                   68.5 (5) |              69.3 (5) |             67.5 (5) |                             69.4 (5) |                  68.2 (5) |
| Research & FYP Nexus |                   60.8 (6) |              64.0 (6) |             61.4 (6) |                             65.4 (6) |                  58.4 (6) |
| LabRelay             |                   50.8 (7) |              45.4 (7) |             48.4 (7) |                             51.1 (7) |                  52.2 (7) |
| WashWitness          |                   46.2 (8) |              42.7 (8) |             44.6 (8) |                             46.6 (8) |                  47.3 (8) |

Full weights: impact-first IM 25, CO/WF/RE/TI 12, TH 8, OR 9, BU 5, DE 5; delivery-first IM 10, CO 12, WF 18, RE 10, TI 15, TH 10, OR 5, BU 12, DE 8; originality-heavy OR 20, the NTT five 12 each, TH 10, BU 5, DE 5. The base column orders Outage Witness above Fanfall by the tie rule in [Ranking](#ranking); Fanfall leads there by 0.067 before rounding. Only these two ever swap. Between scorers the spread is wider than between weightings: the FDE scored Outage Witness 66.6 and the lecturer 82.8. Don't read a gap under 5 points as decisive.

## The 15 source ideas reranked

Before any merging, three independent scorers rated all 15 source ideas on the same matrix. They scored fresh, ignoring each set's own scores, and were told that length earns nothing: the opus docs run 300–430 lines, argon 70–160, astra 75–95.

| Rank | Idea                                                                             | Set   | Set's own rank |   IM |   CO |  WF |   RE |   TI |  TH |   OR |   BU |   DE | Total | Fed product          |
| ---: | -------------------------------------------------------------------------------- | ----- | -------------: | ---: | ---: | --: | ---: | ---: | --: | ---: | ---: | ---: | ----: | -------------------- |
|    1 | [Kept](/docs/ideas/opus/01-kept.md)                                              | opus  |              1 |    4 |    4 |   5 | 4.33 | 3.33 |   4 |    4 | 3.67 |    4 |  81.5 | Kept                 |
|    2 | [Sempat](/docs/ideas/opus/04-sempat.md)                                          | opus  |              4 | 3.67 |    4 |   4 | 3.67 |    3 |   4 |    5 | 3.67 |    4 |  77.0 | Sempat               |
|    3 | [Skyclause](/docs/ideas/opus/02-skyclause.md)                                    | opus  |              2 |    3 |    4 |   5 |    4 |    3 |   3 | 3.67 | 3.33 |    4 |  73.9 | Skyclause            |
|    4 | [Outage Witness](/docs/ideas/opus/05-outage-witness.md)                          | opus  |              5 | 3.33 |    4 |   4 | 3.33 |    3 |   5 | 3.33 | 2.67 | 3.67 |  72.4 | Outage Witness       |
|    5 | [Fanfall](/docs/ideas/opus/03-fanfall.md)                                        | opus  |              3 |    3 |    4 |   4 | 3.67 | 3.33 |   3 |    4 | 3.67 | 3.67 |  71.7 | Fanfall              |
|    6 | [SpineDesk Pulse](/docs/ideas/argon/01-spinedesk-pulse.md)                       | argon |              1 |    4 |    3 |   3 | 3.67 |    3 |   4 |    1 |    3 | 3.67 |  63.3 | Outage Witness       |
|    7 | [Kuyoh Shuttle Sentinel](/docs/ideas/argon/02-kuyoh-shuttle-sentinel.md)         | argon |              2 |    3 | 3.33 |   4 |    3 | 2.33 |   2 |    3 | 3.67 | 2.67 |  60.2 | Kept                 |
|    8 | [Recheck](/docs/ideas/astra/01-recheck.md)                                       | astra |              1 | 2.67 |    3 |   3 |    3 |    3 |   3 |    2 | 4.33 |    3 |  58.4 | Outage Witness       |
|    9 | [Research & FYP Nexus](/docs/ideas/argon/04-research-fyp-nexus.md)               | argon |              4 |    3 | 3.33 |   3 |    3 | 2.67 |   1 | 2.33 | 3.67 |    4 |  56.3 | Research & FYP Nexus |
|   10 | [LastLink](/docs/ideas/astra/02-lastlink.md)                                     | astra |              2 | 2.33 | 2.67 |   2 |    3 | 2.33 |   2 |    3 |    4 | 2.33 |  50.9 | Kept                 |
|   11 | [OnBoard Airtime Guard](/docs/ideas/argon/05-onboard-airtime-guard.md)           | argon |              5 |    2 | 2.67 |   2 |    3 | 2.33 |   3 | 1.33 | 3.67 | 3.33 |  49.3 | Outage Witness       |
|   12 | [AccessRelay](/docs/ideas/astra/03-accessrelay.md)                               | astra |              3 | 2.67 | 2.67 |   2 |    2 |    2 |   2 | 3.33 | 3.67 |    2 |  48.1 | Sempat               |
|   13 | [Timetable & HVAC Reconciler](/docs/ideas/argon/03-timetable-hvac-reconciler.md) | argon |              3 | 2.33 | 2.67 |   2 | 2.33 | 2.67 |   1 |    3 | 3.67 | 2.67 |  47.9 | Sempat               |
|   14 | [WashWitness](/docs/ideas/astra/04-washwitness.md)                               | astra |              4 |    2 | 2.67 |   2 |    2 |    2 |   3 | 3.33 |    3 | 2.33 |  47.9 | WashWitness          |
|   15 | [LabRelay](/docs/ideas/astra/05-labrelay.md)                                     | astra |              5 | 1.67 | 2.67 |   2 | 1.33 | 1.33 |   3 | 3.33 |    2 | 2.67 |  42.5 | LabRelay             |

- **The sets' first choices split:** opus's Kept stays first, argon's SpineDesk Pulse falls to 6th, and astra's Recheck to 8th. Both fallen ideas sit in the most crowded space. Simulated AI brainstorms put 16.3% of ideas on telemetry turned into tickets ([competition](/docs/research/competition.md#crowd-map)), and SpineDesk scored 1 on originality. SpineDesk also carries a custom MCP on its critical path; Recheck leaves its deciding step to deterministic code.
- **All five opus ideas lead.** Their scorers credited named offices, unattended sensing, and several GA connectors, not length; the FDE scorer said so explicitly. Under weights that ignore originality and theme (NTT five only), the same five ideas lead.
- **Ties at 47.9** (Reconciler and WashWitness) are listed in base-rank order of the unrounded totals.

## How the products were merged

Each Pass A scorer proposed which ideas a team would never build together. All three agreed on three merges, and a majority kept four of the other five ideas separate. WashWitness had no majority: each scorer gave it a different partner, and it stays alone because every proposed partner has a different owner.

| Product                | Merged from                                                     | Agreement | What the merge kept                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Kept]                 | Kept, LastLink, Kuyoh Shuttle Sentinel                          | 3 of 3    | Kept's nightly grading and Jira Done watch; LastLink's service-change packet for schedule-design gaps; Kuyoh's T580, rain gauge and MET feeds as attribution rules                                          |
| [Sempat]               | Sempat, Timetable & HVAC Reconciler, AccessRelay                | 3 of 3    | Sempat's measured transfers against the public timetable feed; the Reconciler's physical/online and group-code checks; AccessRelay's rule that a fix counts only once confirmed. HVAC and long gaps dropped |
| [Outage Witness]       | Outage Witness, SpineDesk Pulse, Recheck, OnBoard Airtime Guard | 3 of 3    | One owner (the IT helpdesk, using SpineDesk's published SLA), one decision (was a failure independently witnessed), Recheck's recovery check; 4 phones instead of 8–12, no MCP                              |
| [Skyclause]            | Skyclause                                                       | 2 of 3    | One scorer proposed merging it with Fanfall; owners and decisions differ                                                                                                                                    |
| [Fanfall]              | Fanfall                                                         | 2 of 3    | As above                                                                                                                                                                                                    |
| [Research & FYP Nexus] | Research & FYP Nexus                                            | 3 of 3    | Singleton                                                                                                                                                                                                   |
| [LabRelay]             | LabRelay                                                        | 2 of 3    | One scorer proposed an "asset acknowledgement loop" with WashWitness; owners differ                                                                                                                         |
| [WashWitness]          | WashWitness                                                     | 1 of 3    | One scorer paired it with LabRelay, another with Outage Witness; owners differ, so it stays alone                                                                                                           |

Each product's "Origins" section records what it kept, changed, and dropped from every source.

## How to choose

- **Pick [Kept] by default.** It has the top score on research and theme, a pain every LRT commuter feels twice a day, and needs no card or board, though its own scorers called the build heavy for three people. Its main risk is that LNO never engages or forbids a fixed phone mount. Ask in person on 4 November; the evidence builds in the team's own Jira either way. Its own kill line: stop if both baseline counts on 4–5 November show every departure kept and nobody left behind.
- **Pick [Sempat] for originality with a fixed kill line.** It ties Fanfall for the top originality score (4.33). Nobody has measured whether APU's 15-minute changeovers are enough. It stops at 20:00 on 5 November if fewer than 28 of the week's 1,377 room changes fail by lift. It needs APU's written permission to use the timetable feed.
- **Pick [Outage Witness] for the strongest theme story.** The network is both the sensor and the problem, and TechCentre's SLA already treats in-session Wi-Fi as urgent. Its originality is the weakest of the top five (2.67), because the helpdesk network watch is where the crowd will be. Win on the independent witness record, not the ticket.
- **Pick [Fanfall] for the best pitch.** The 17 November final shares the night with a concert next door, and the forecast grades itself every morning. Its theme score (3) ties Skyclause's for the lowest in the top five, and its doc concedes it's a club-scale tool until an office adopts it.
- **Pick [Skyclause] for the strongest institutional hook,** the ministry's 7 October 2026 haze instruction. Its owner office has no public trace in APU's knowledge base, and the window camera is on probation.
- **Don't build two.** Kept, Fanfall and Skyclause all touch the evening exit wave. Fanfall's graded surge-night calendar can become a read-only input to Kept's "external cause" rule later ([Fanfall's origins](/docs/ideas/04-fanfall.md#origins)).
- **The bottom three carry stop conditions:** Research & FYP Nexus has no IoT layer (theme 1); LabRelay has no lab, custodian or probe secured; WashWitness exists only if a timed observation shows broken machines rather than queues, since APU's own evidence points to queues.

## What the rerank changed

Writing and fact-checking the products corrected several source claims. Each correction is recorded in the product's "Origins" or evidence section:

- **Jira comment and status-change actions are GA,** not unproven as the astra set assumed ([Gemini Enterprise](/docs/research/gemini-enterprise.md)). Kept, Outage Witness, WashWitness and LabRelay now write comments and transitions after approval instead of opening duplicates.
- **Globalping and GitHub aren't on Workflow Builder's connector list** ([workflows](/docs/research/gemini-enterprise.md#workflows)); Globalping now enters through the Apps Script feeder, and GitHub only runs feeders.
- **Dropped or corrected numbers:** Skyclause's "20 of 24 weekdays" storm count came from the author's OCR, so it was dropped and is now measured. Sempat's 1,441 transfers are 1,377 room changes across 662 of 933 intake groups. Kuyoh's flood tier now uses the rain gauge, because the water level sat below Normal. Fanfall's 1 February 2026 isn't a surge day, and its 20 November exposure is 379 intake groups. Kept's PDF quote no longer includes words the PDF doesn't contain.
- **New local evidence:** APU's laundry FAQs show machines already report "Online and Vacant" through APSpace, so WashWitness can't sell availability. Technology Services' Wi-Fi policy says it already monitors the network, so Outage Witness sells an independent, citable record instead.

The final scorers recorded 13 more small errors in the product docs while scoring: counts, a quote's date, an unsourced price, an untraced office, stale cross-references, and one unverified trigger type. Twelve were fixed before publishing. The thirteenth, TechCentre's location, stays because it cites APU's knowledge-base page directly. The scores predate the fixes.

## Method

1.  **Matrix:** built from the three sets' matrices and NTT DATA's five points, then checked by a separate review that rebalanced the weights, removed a double-counting gate, and asked for length-blind scoring.
1.  **Pass A, rerank the 15:** three independent scorers in three personas, each on a different model: an NTT DATA forward deployed engineer, an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student. Each scored every idea, spot-checked the claims behind each 4 or 5 against the research, and proposed merges.
1.  **Merge:** the three unanimous merges and the majority singletons gave 8 products. Five writers built one doc each, using Pass A's reasons and fatal risks to choose which variant leads, and re-checked numbers against live sources on 4 November.
1.  **Pass B, rank the products:** three fresh scorers with the same personas on rotated models scored the 8 docs and fact-checked them. Their scores are the ranking.

## Evidence limits

- **Nothing is validated:** no owner has agreed, no interview has happened, no Gemini Enterprise licence has been tested, and no workflow has run. Each product's research plan says what to measure first.
- **The scorers are AI personas, not the judges.** They disagree by up to 16 points on one product. The official criteria may reweight everything.
- **Merged products had an edge in polish.** Pass B scored docs written for this ranking, while Pass A scored the original set docs. Components where a product beat its best source by more than half a point: Kept theme (4 → 5); Outage Witness and Fanfall demo; Research & FYP Nexus connectors, buildability and demo; LabRelay connectors, workflow and theme; WashWitness connectors. Most reflect real design changes recorded in each "Origins" section, such as dropping the custom MCP, adding approved Jira writes, and moving the decision into the workflow. Skyclause (−5.4) and WashWitness (−1.7) scored below their sources: Skyclause's doc dropped the unverifiable storm count and now says its owner office has no public trace, and WashWitness now leads with the gate that may cancel it.
- **Permissions are pending:** APU's Terms of Use reserve copyright, so the timetable feed and knowledge base need written permission ([APU](/docs/research/apu.md)).

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md): the event's rules and how to compete.
- [Competition](/docs/research/competition.md): what other teams will likely build and existing substitutes.
- [Judging](/docs/research/judging.md): comparable rubrics, evidencing each judging point, and packaging.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): workflows, triggers, connectors, actions, and reviewer access.
- The source idea sets: [argon](/docs/ideas/argon/00-ranking.md), [astra](/docs/ideas/astra/00-ranking.md), [opus](/docs/ideas/opus/00-ranking.md).
