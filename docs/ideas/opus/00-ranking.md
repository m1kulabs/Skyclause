# Opus idea ranking

Five product ideas for the APU Cloud Innovation Hackathon 2026, ranked against NTT DATA's five spoken judging points and the related criteria in [CONTEXT], after four rounds of ideation and scoring on 3–4 November 2026. Each idea has its own file; this page gives the ranking, the scoring matrix, how the ideas were found, and what was cut.

Contents:

1.  [Ranking](#ranking)
1.  [Scoring matrix](#scoring-matrix)
    1.  [Components and weights](#components-and-weights)
    1.  [Gates](#gates)
1.  [Scores by component](#scores-by-component)
1.  [How to choose](#how-to-choose)
1.  [What the research changed](#what-the-research-changed)
1.  [How the ideas were found](#how-the-ideas-were-found)
    1.  [Research inputs](#research-inputs)
    1.  [Four rounds](#four-rounds)
1.  [What every idea shares](#what-every-idea-shares)
1.  [Ideas considered and cut](#ideas-considered-and-cut)
1.  [See also](#see-also)

[CONTEXT]: /docs/CONTEXT.md

## Ranking

Scores are out of 100: the mean of two independent final scorers, taking the lower score on day-to-day workflow and theme (see [Four rounds](#four-rounds)). An idea that any final scorer failed on a gate ranks below every idea that passed all gates.

| Rank | Idea             | In one line                                                                                                         | Track                  | Owner (APU office)                         | Score |
| ---: | ---------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | ----: |
|    1 | [Kept]           | Grades every peak Campus Connect shuttle departure against the published schedule, nightly, and watches every "fix" | Intelligent Automation | Logistics & Operations shuttle desk        |  83.5 |
|    2 | [Skyclause]      | Turns the ministry's haze directive and November's storms into one logged, approved operating-mode call             | Intelligent Automation | Facilities, Safety and Student's Welfare   |  73.5 |
|    3 | [Fanfall]        | Forecasts each stadium night next door against APU's evening events, and grades itself on next-day gate taps        | Data-Driven Research   | GDGoC APU pilot, then Student Service      |  71.5 |
|    4 | [Sempat]         | Measures real lift and stair times, then checks every published week of timetable for transfers that can't fit      | Intelligent Automation | Schedulers office, Academic Administration |  70.0 |
|    5 | [Outage Witness] | Spare phones on chargers and public probes form an independent outage register for EC claims and residence wardens  | Intelligent Automation | Office of Extenuating Circumstances Claims |  72.0 |

- **Kept leads clearly:** both final scorers put it first (84 and 83), and it was the only idea all three earlier scorers ranked first. It needs one phone at a stop, Jira Cloud Free and Google Workspace, so a three-person team with no hardware and no card can build it.
- **Ranks 2–5 are close:** 70.0 to 73.5, inside the scorers' disagreement. Read them as a tier and pick by the team's strengths (see [How to choose](#how-to-choose)).
- **Outage Witness is fifth despite 72.0:** one final scorer failed its reachable gate, because real outages may be too rare to give 30–50 labelled windows by 10 November.

[Kept]: 01-kept.md
[Skyclause]: 02-skyclause.md
[Fanfall]: 03-fanfall.md
[Sempat]: 04-sempat.md
[Outage Witness]: 05-outage-witness.md

## Scoring matrix

NTT DATA said at the briefing that it will rate impact, the 1P and 3P connectors used (MCP as an add-on), research, time to impact, and how automated workflows run day to day ([brief](/docs/BRIEF.md#judging-and-prizes)). It gave no weights or scale. **Inference:** the weights below are ours; the extra components come from the theme and from comparable rubrics ([judging and pitching](/docs/research/judging-and-pitching.md#comparable-rubrics)).

### Components and weights

Each component is scored 1–5 and weighted; 5 on everything is 100.

| Component           | Weight | What scores high                                                                                                           |
| ------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------- |
| Impact              |     15 | A named APU office or group, the real volume it handles, and a measured before-and-after                                   |
| Connectors          |     15 | Distinct 1P and 3P connectors doing real work in the loop; MCP only breaks ties                                            |
| Research            |     10 | Users reachable for 6–8 interviews, a timed baseline, and 30–50 real items for precision and recall                        |
| Time to impact      |     10 | A credible, dated 3- and 6-month plan with an owner                                                                        |
| Day-to-day workflow |     15 | Starts on a schedule or connector event, runs unattended, and keeps one human approval                                     |
| Theme               |     10 | Cloud, IoT and network each visible and load-bearing                                                                       |
| Originality         |     10 | Distance from the [crowd baseline](/docs/research/crowd-baseline.md#saturation-tiers) and from the briefing's own examples |
| Usage               |     10 | People would still use it in March 2027, through a channel they already have                                               |
| Demo                |      5 | Lands in a 3–4 minute video, and a reviewer can trigger it themselves                                                      |

### Gates

Failing any gate cuts an idea, whatever its score:

- **Real data:** live readings from the team's own devices, live public feeds, or real events the system creates; no mock or sample data, no private records, no biometrics ([project conventions](/docs/references/project-conventions.md)).
- **Gemini Enterprise core:** the decision runs in a Gemini Enterprise workflow; everything else feeds it.
- **Buildable:** a 2–5 person student team can build it by 10 November with a no-card path.
- **IoT real:** a sensor the team runs is load-bearing, not decorative.
- **Reachable:** the users and owner can be reached for interviews, and 30–50 real items exist by 10 November.
- **Self-trigger:** a reviewer can fire it themselves.

## Scores by component

Means of the two final scorers, 1–5, except day-to-day workflow and theme, which take the lower of the two scores, as the weighted totals do.

| Component           | Kept | Skyclause | Fanfall | Sempat | Outage Witness |
| ------------------- | ---: | --------: | ------: | -----: | -------------: |
| Impact              |  4.0 |       3.5 |     2.5 |    3.0 |            3.0 |
| Connectors          |  4.0 |       4.0 |     4.0 |    4.0 |            4.5 |
| Research            |  5.0 |       4.0 |     4.5 |    4.0 |            3.0 |
| Time to impact      |  3.0 |       3.0 |     4.0 |    3.0 |            2.5 |
| Day-to-day workflow |  5.0 |       4.0 |     4.0 |    3.0 |            4.0 |
| Theme               |  4.0 |       4.0 |     2.0 |    3.0 |            5.0 |
| Originality         |  4.0 |       3.5 |     4.0 |    4.5 |            4.0 |
| Usage               |  4.0 |       3.0 |     3.0 |    3.5 |            2.5 |
| Demo                |  4.5 |       4.0 |     5.0 |    4.0 |            3.5 |
| **Weighted**        | 83.5 |      73.5 |    71.5 |   70.0 |           72.0 |

Each idea file also carries its own scores with a reason per component, written while the idea was refined; they sit within a point of the independent ones above, except Skyclause (79) and Sempat (75), which rated themselves about 5 points higher.

## How to choose

- **Pick [Kept] by default.** It has the strongest unattended loop (peak checks, a nightly verdict, and a Jira Done event that starts a watch and reopens the issue if the gap returns), the lightest build, and a pain every LRT commuter has twice a day. Its main risk is that nobody has asked Logistics & Operations yet; ask in the first interview.
- **Pick [Skyclause] for the strongest institutional hook.** The ministry told universities on 7 October 2026 to watch local air quality, and APU has no haze, storm or flood rule. A KL thunderstorm warning covered the evening exit window on 20 of 24 October weekdays, so it will fire for real during assessment. Its own sensor, a phone scoring skyline visibility on-device, is unproven.
- **Pick [Fanfall] for the best pitch.** This hackathon's final on 17 November shares the night with 5 Seconds of Summer next door, and the forecast grades itself against real gate taps each morning. Its IoT layer is thin and its users are a few organisers.
- **Pick [Sempat] for the most original idea.** Nobody has measured whether APU's 15-minute changeovers are enough. If the measurements show lifts clear in time, there is little to report, so measure first.
- **Pick [Outage Witness] for the strongest theme story.** It needs 8–12 spare phones at 3–4 sites, two offices' permission, and real outages by 8 November.
- **Don't build two:** Kept and Fanfall share the shuttle desk and the 17:45 exit wave. Fanfall's surge nights can become a Kept rule later.

## What the research changed

- **The crowd sits where we expected to stand.** In a simulation of 780 ideas from the AI assistants most teams will use, 41.7% are campus operations run off sensor or telemetry feeds, and 16.3% turn telemetry into tickets, so the IT helpdesk network watch suggested in [CONTEXT] is crowded ([crowd baseline](/docs/research/crowd-baseline.md#crowd-map)). The same assistants tell teams to simulate data in 30–98% of answers.
- **What the crowd misses:** real public feeds (3% of simulated ideas), named connectors such as Jira or ServiceNow (2 of 780), and a measured baseline with an unattended run and a named owner (1%) ([crowd baseline](/docs/research/crowd-baseline.md#what-the-crowd-structurally-misses)).
- **APU's timetable is public.** APSpace loads every class session, with block-and-floor room codes, from an open JSON feed, and later weeks are published about weekly ([APU timetable feed](/docs/research/apu-timetable-feed.md)). It names lecturers, so those fields are dropped, and APU's permission is needed.
- **Haze is the loudest signal; boring automation is what sticks.** Haze posts reached 1,555–3,418 points on Reddit ([Reddit](/docs/research/social-reddit.md)), and the ministry left each university to pick its teaching mode ([X](/docs/research/social-x.md)). Practitioners keep "when X, notify Y" automations and distrust runs that report success but did nothing.
- **APU's top complaints share one shape:** a request goes in and nobody can see what happens next, across admin, residences and timetables ([other platforms](/docs/research/social-other-platforms.md#signals)). Shuttle queues at 8 AM and 5 PM come fourth.

## How the ideas were found

### Research inputs

- New for this ranking: real posts from [X](/docs/research/social-x.md) (227 relevant of 2,222), [Reddit](/docs/research/social-reddit.md) (220 threads, 3,774 comments), and [other platforms](/docs/research/social-other-platforms.md) (Lowyat, Google Maps reviews, TikTok, Instagram, YouTube, Bluesky, Hacker News); a [crowd baseline](/docs/research/crowd-baseline.md) of what other teams will likely build; and the [APU timetable feed](/docs/research/apu-timetable-feed.md).
- Existing: [brief](/docs/BRIEF.md), [CONTEXT], and the research on [Gemini Enterprise](/docs/research/gemini-enterprise.md), [its data paths](/docs/research/gemini-enterprise-data.md), [public data sources](/docs/research/public-data-sources.md), [APU public documents](/docs/research/apu-public-documents.md), [IoT and network](/docs/research/iot-and-network.md), and [research and impact](/docs/research/research-and-impact.md).

### Four rounds

1.  **Diverge:** six independent passes, each starting from a different place: the loudest pains, a named APU office's daily events, an unused live signal, a trigger Gemini Enterprise can fire unattended, habits people already have, and proven patterns from other industries (airline rebooking, air-traffic flow control, parametric insurance). Everything in the crowd baseline's saturated and crowded tiers was banned. This gave 42 candidates.
1.  **Converge:** the 42 were merged into 16, and three scorers rated all 16 independently, each in a different persona and on a different model: an NTT DATA forward deployed engineer, an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student. Each wrote a dissent per idea; the lower score counted on workflow and theme. Merges the scorers proposed formed five finalists.
1.  **Deepen:** each finalist was tested against every gate and component: every data source fetched live on 4 November, every trigger and action checked against the Gemini Enterprise research, the strongest objection answered or conceded, the weakest components redesigned, and close rivals searched for on GitHub and Devpost.
1.  **Re-score:** two fresh scorers rated the refined documents and fact-checked them against live sources. They found three errors, all fixed before publishing: Rapid Rail exit counts doubled by a total row in the source file, online classes counted as on campus, and a transfer count that needed its definition stated.

## What every idea shares

- **One build pattern, no card:** an Apps Script feeder polls feeds and receives phone readings into a Sheet in the licensed Workspace domain, writing an error row when a source fails. Gemini Enterprise workflows start on a schedule or a Drive, Gmail, Calendar or Jira event, read the Sheet live, decide against an editable rule sheet, and write through Gmail, Calendar and Jira Cloud behind one approval ([CONTEXT](/docs/CONTEXT.md#connectors-and-live-data)).
- **Google Workspace stands in for Microsoft 365:** APU runs Outlook, Teams and SharePoint, but the team likely has no Microsoft 365 tenant, so each idea names the Microsoft connector it would switch to at APU.
- **Ask the organisers this week:** written permission to use APU's timetable feed and knowledge base under APU's Terms of Use; whether licences sit on a Workspace domain, since Workspace connectors don't support consumer `@gmail.com` accounts; and how reviewers get seats.
- **Untested on the platform:** no licence had arrived by 4 November, so every Gemini Enterprise step rests on documentation, not a run.
- **No owner confirmed yet:** each office named above is the first interview, not a commitment.

## Ideas considered and cut

Scores here are from the second round, out of 100, before the merges.

| Idea               | Pitch                                                                                           | Score | Outcome                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------ |
| Kept               | Every published shuttle departure gets a verdict every night                                    |  83.7 | Finalist (Kept)                                                                            |
| Reaccom            | Re-plan each affected student's day when the timetable changes, like airline rebooking          |  77.0 | Merged into Sempat; mid-week edits turned out rare, so the change premise fell away        |
| Haze Call          | The ministry's haze directive as a logged, approved teaching-mode decision                      |  71.7 | Merged into Skyclause                                                                      |
| Outage Witness     | Phones as power and network probes for an EC evidence register                                  |  70.0 | Finalist (Outage Witness)                                                                  |
| Changeover         | Tight class transfers checked against measured lift and walk times                              |  69.7 | Merged into Sempat as its sensor layer                                                     |
| Matchday Desk      | Stadium nights against evening classes, graded by next-day gate taps                            |  67.3 | Finalist (Fanfall)                                                                         |
| Index Clause       | Public flood, storm and transport telemetry as clauses behind excused-lateness notices          |  63.7 | Merged into Skyclause, without automatic excusal                                           |
| LastBus            | Warn late-class students the shuttle won't get them home                                        |  58.0 | Folded into Kept as a Friday rule                                                          |
| Closed Means Fixed | Phones on chargers detect residence power cuts; reopen "resolved" faults that recur in 72 hours |  57.7 | Folded into Outage Witness                                                                 |
| Zone B Clock       | Forecast when the open car park fills and advise park-and-ride                                  |  56.7 | Cut: few drivers give sparse traces, and the owner may not want to send revenue to the LRT |
| Touchdown Desk     | Track new students' real flights and warn the visa office before a late landing costs classes   |  56.0 | Cut: the first real arrivals fall after the deadline, and the sensors are other people's   |
| Groundtruth TPM    | A nightly, self-auditing open dataset of local sensor streams for final-year projects           |  55.3 | Cut: indirect impact, and the core work sits outside Gemini Enterprise                     |
| Move-out Ledger    | A tamper-evident room-condition timeline for deposit disputes                                   |  51.0 | Cut: weak IoT, and disputes cluster at semester end                                        |
| Clash Check        | Every club booking checked for audience, venue, stadium and weather clashes                     |  49.3 | Cut: weakest IoT, and it overlaps Fanfall                                                  |
| Socket Census      | Phones test classroom sockets so laptop-heavy classes avoid dead rooms                          |  48.0 | Cut: thin evidence and Android only                                                        |
| Lockout Clock      | When a bursary delay locks Moodle, count sessions at stake against the 80% visa rule            |  46.7 | Cut on the real-data gate: it needs students' private financial and visa records           |

## See also

- [Brief](/docs/BRIEF.md) and [CONTEXT]: the event's rules and how to compete.
- [Crowd baseline](/docs/research/crowd-baseline.md): what the other teams will likely build.
- [Social research on X](/docs/research/social-x.md), [Reddit](/docs/research/social-reddit.md), and [other platforms](/docs/research/social-other-platforms.md): the pains behind every idea.
- [APU timetable feed](/docs/research/apu-timetable-feed.md): the public feed four of the five ideas read.
