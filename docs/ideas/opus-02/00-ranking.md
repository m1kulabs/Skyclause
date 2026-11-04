# Opus-02 idea ranking

Two product ideas for the APU Cloud Innovation Hackathon 2026, each hill-climbed from a seed on 5 November 2026 and then independently reviewed. This page gives the ranking, the matrix both were scored on, and how they were found. **Inference** marks conclusions no source states.

Contents:

1.  [Ranking](#ranking)
1.  [Scoring matrix](#scoring-matrix)
    1.  [Components and weights](#components-and-weights)
    1.  [Gates](#gates)
1.  [Scores by component](#scores-by-component)
1.  [How to choose](#how-to-choose)
1.  [Team limits](#team-limits)
1.  [How the ideas were found](#how-the-ideas-were-found)
    1.  [Hill climbs](#hill-climbs)
    1.  [Independent reviews](#independent-reviews)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## Ranking

Scores are out of 100 on the [scoring matrix](#scoring-matrix). Both docs say that where the author and the review disagree, the review is the current position, so the rank follows the review score.

| Rank | Idea        | In one line                                                                                          | Track                             | Author | Review | Review verdict         |
| ---: | ----------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- | -----: | -----: | ---------------------- |
|    1 | [BoardCast] | Tells shuttle riders the night before what missing each run costs and how early to be at the stop    | Smart Campus & Student Experience |   70.5 |   50.5 | Build with changes     |
|    2 | [LiftBoard] | Finds the classes a lift queue can make late, and splits the two crowds that meet at each changeover | Smart Campus & Student Experience |   68.5 |   49.0 | Don't build as pitched |

- **Both orderings agree:** BoardCast leads on the author's score and on the review's.
- **Read the verdicts, not the gap:** the review gap is 1.5 points, but one review says build with changes and the other says don't build as pitched.
- **Nothing has run:** nothing is built, and no Gemini Enterprise licence has arrived, so every score rates a plan.
- **BoardCast's gates:** the author passes real data, buildable, and self-trigger, passes Gemini Enterprise core only if a licence arrives, and calls IoT real and reachable soft. The review says Gemini Enterprise core is unpassed until exercised, and reachable users and real validation items are unproved.
- **LiftBoard's gates:** the author passes real data and self-trigger, makes Gemini Enterprise core and buildable conditional on a licence in a Workspace domain, and makes IoT real and reachable conditional, with no owner. The review says Enterprise, load-bearing IoT, and a reachable owner remain unresolved gates.

## Scoring matrix

NTT DATA said at the briefing that it will rate impact, the 1P and 3P connectors used (MCP as an add-on), research, time to impact, and how automated workflows run day to day ([brief](/docs/BRIEF.md#judging-and-prizes)). It gave no weights or scale. **Inference:** the weights below are ours; the extra components come from the theme and from comparable rubrics ([judging and pitching](/docs/research/judging.md#comparable-rubrics)).

### Components and weights

Each component is scored 1–5 and weighted; 5 on everything is 100.

| Component           | Weight | What scores high                                                                                                        |
| ------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------- |
| Impact              |     15 | A named APU office or group, the real volume it handles, and a measured before-and-after                                |
| Connectors          |     15 | Distinct 1P and 3P connectors doing real work in the loop; MCP only breaks ties                                         |
| Research            |     10 | Users reachable for 6–8 interviews, a timed baseline, and 30–50 real items for precision and recall                     |
| Time to impact      |     10 | A credible, dated 3- and 6-month plan with an owner                                                                     |
| Day-to-day workflow |     15 | Starts on a schedule or connector event, runs unattended, and keeps one human approval                                  |
| Theme               |     10 | Cloud, IoT and network each visible and load-bearing                                                                    |
| Originality         |     10 | Distance from the [crowd baseline](/docs/research/competition.md#saturation-tiers) and from the briefing's own examples |
| Usage               |     10 | People would still use it in March 2027, through a channel they already have                                            |
| Demo                |      5 | Lands in a 3–4 minute video, and a reviewer can trigger it themselves                                                   |

Both docs keep the final's heavier presentation weight outside the score, so Demo's 5 points understate it.

### Gates

Failing any gate cuts an idea, whatever its score:

- **Real data:** live readings from the team's own devices, live public feeds, or real events the system creates; no mock or sample data, no private records, no biometrics ([project conventions](/docs/references/project-conventions.md)).
- **Gemini Enterprise core:** the decision runs in a Gemini Enterprise workflow; everything else feeds it.
- **Buildable:** a 2–5 person student team can build it by 10 November with a no-card path.
- **IoT real:** a sensor the team runs is load-bearing, not decorative.
- **Reachable:** the users and owner can be reached for interviews, and 30–50 real items exist by 10 November.
- **Self-trigger:** a reviewer can fire it themselves.

**One change, for BoardCast:** "Reachable" drops the office owner, because the team can't deploy into an office and the users are students ([BoardCast scores](02-boardcast.md#scores)). Its reviewer holds that the gates still apply, and that calling them soft changes the comparison. LiftBoard keeps every gate unchanged, and its doc says no owner exists ([LiftBoard gates](01-liftboard.md#scores-by-component)).

## Scores by component

Seeds and author finals come from each doc's scores table; reviews come from each doc's rescore ([BoardCast](02-boardcast.md#rescore), [LiftBoard](01-liftboard.md#rescore)). Every weighted total is Σ weight × score / 5 and matches its doc.

| Component           | Weight | BoardCast seed | BoardCast author | BoardCast review | LiftBoard seed | LiftBoard author | LiftBoard review |
| ------------------- | -----: | -------------: | ---------------: | ---------------: | -------------: | ---------------: | ---------------: |
| Impact              |     15 |            2.5 |              3.0 |              2.5 |            2.0 |              3.0 |              2.0 |
| Connectors          |     15 |            2.5 |              3.5 |              2.5 |            2.5 |              3.5 |              2.5 |
| Research            |     10 |            2.0 |              3.5 |              2.5 |            2.0 |              3.5 |              3.0 |
| Time to impact      |     10 |            3.0 |              3.5 |              2.5 |            2.0 |              3.0 |              2.0 |
| Day-to-day workflow |     15 |            3.0 |              3.5 |              2.5 |            2.5 |              3.5 |              2.5 |
| Theme               |     10 |            2.5 |              3.5 |              2.5 |            2.0 |              3.5 |              2.5 |
| Originality         |     10 |            3.0 |              4.0 |              3.0 |            3.5 |              4.0 |              3.0 |
| Usage               |     10 |            2.5 |              3.5 |              2.0 |            2.0 |              3.0 |              2.0 |
| Demo                |      5 |            3.0 |              4.5 |              3.0 |            3.5 |              4.5 |              3.0 |
| **Weighted**        |    100 |           53.0 |             70.5 |             50.5 |           47.5 |             68.5 |             49.0 |

- **In the reviews:** BoardCast leads on impact (2.5 to 2.0) and time to impact (2.5 to 2.0), worth 2.5 points. LiftBoard leads on research (3.0 to 2.5), worth 1.0, for reproducible timetable work. The other six tie.
- **In the author finals:** BoardCast leads on time to impact and usage (3.5 to 3.0 each), worth 2.0 points. Research ties at 3.5, as do the other six.
- **Every component falls in review:** by 0.5 to 1.5 for both ideas, 20.0 points in total for BoardCast and 19.5 for LiftBoard.
- **The rescores differ in scope:** BoardCast's assumes a licence arrives. LiftBoard's scores the proposal under its stated constraints.

## How to choose

- **Build [BoardCast] by default, with the review's changes,** since its review is the only one of the two that says to build ([Read this first](02-boardcast.md#read-this-first)): lead with a class-connection check; show individual reports with their age, not a learned cut-off; keep timetable load as an unvalidated predictor; offer private summaries, not public slips; and make the tap page the main path.
- **Build [LiftBoard] only if its Fri 6 Nov 22:00 checks pass.** Its reviewer says not to select it without a working Enterprise path and a willing academic owner ([cheapest test](01-liftboard.md#cheapest-test-by-fri-6-nov-2200)). Its reviewer's best salvage, a room-continuity audit, needs timetable office approval, which conflicts with the team's no-office limit ([Read this first](01-liftboard.md#read-this-first)).
- **Don't build both.** **Inference:** each build plan assumes all 3 builders for Thu 5 to Tue 10 Nov, so there is no spare capacity for a second.
- **BoardCast's checks:** by Fri 6 Nov 22:00, one real Gemini Enterprise read, review, and write, phone tests of the tap page and Telegram, and the friend's three questions. Kill passive sensing the same night if a backgrounded phone sends no updates. By Sun 8 Nov 12:00, with 15+ run-level answers, ship the board only or change idea if fewer than 1 in 5 riders were left behind. With no licence by Mon 9 Nov 12:00, the Gemini Enterprise gate fails ([risks and kill criteria](02-boardcast.md#risks-and-kill-criteria)).
- **LiftBoard's checks:** at Fri 6 Nov 22:00, with 20+ answers, drop it if under a third name a lift for a late start. By Sat 7 Nov, drop the ask as the hero if no lecturer tries it, and take the Supabase path or submit without Gemini Enterprise if the licence or Workspace is late. If APU refuses the feed, there is no product ([risks and kill criteria](01-liftboard.md#risks-and-kill-criteria)).

## Team limits

Both docs state these:

- **Nobody on campus:** the team can't time or observe anything at APU before the deadline, so neither idea has a timed baseline ([LiftBoard fit](01-liftboard.md#fit-with-the-teams-circumstances), [BoardCast fit](02-boardcast.md#fit-with-the-teams-circumstances)).
- **No office:** the team can't deploy into an office, so neither idea depends on one acting.
- **No licence yet:** no Gemini Enterprise licence has arrived, so no step has run on the platform.
- **Feed permission:** APU's [Terms of Use](/docs/research/apu.md#terms-of-use-and-robotstxt) mean both need written permission to use its feeds. On a refusal, neither board can run.
- **Mock GPS:** allowed only in tests and the recorded demo, excluded from every metric, and no script says where a mocked ride happened ([data ruling](/docs/CONTEXT.md#decisions-so-far)).

BoardCast only ([Read this first](02-boardcast.md#read-this-first)): on 5 November the team said it can't get a route captain, returning riders, or six rider interviews, and it has one friend's second-hand account. So the review's launch gate and Friday go or no-go aren't used as gates, and before submission the co-op runs only on the team's own phones, with no APU queue result.

LiftBoard: **Inference:** the same limit probably applies to lifts too, but the team hasn't said so. Its reviewer's cheapest test needs calls with six students and two lecturers, which may not be possible ([Read this first](01-liftboard.md#read-this-first)).

## How the ideas were found

### Hill climbs

- **BoardCast's seed scored 53.0.** Its headline was a weekday forecast with Parkhill as the flagship. The climb replaced the forecast with a miss-cost board and a learned cut-off, because timetable load didn't track daily gate exits at LRT Bukit Jalil, and dropped Parkhill, a 684 m walk from APU. The co-op and the name stay.
- **LiftBoard's seed scored 47.5** and failed three gates: IoT real (the Pi was a display), reachable (no real items to score), and self-trigger. Its headline cut sat at 12:45, a wave that leads to lunch or home. The climb replaced its rush countdown and level 8+ ask; the board survives as the canvas.
- **BoardCast's rules:** each mutation is scored alone against the round's starting point, then survivors merge. It went 53.0, 58.5, 63.0, 69.0, 70.5, and stopped after round 4 because the gain of 1.5 was under 2 ([hill-climb log](02-boardcast.md#hill-climb-log)).
- **LiftBoard's rules:** each mutation is scored alone, on top of the previous round's result. It went 47.5, 54.5, 62.5, 66.0, 68.5, 68.5, and stopped at its five-round limit, with round 5 a gain of 0 ([hill-climb log](01-liftboard.md#hill-climb-log)).
- **Critics:** three personas critiqued each round's result: a forward deployed engineer (FDE), an IoT lecturer, and a student. BoardCast's log names them an NTT DATA FDE, an APU IoT lecturer, and a student stuck in the queue; LiftBoard's feeds each critique into the next round. Both say the last objections still stand: nothing has been measured at APU.

### Independent reviews

- **Reviewer:** `gpt-6-astra` at xhigh through Codex, 5 November 2026, on the same 1–5 scale and weights. BoardCast got a transit and crowdsourcing review, LiftBoard a lift traffic review ([BoardCast review](02-boardcast.md#independent-review), [LiftBoard review](01-liftboard.md#independent-review)).
- **One doc each:** BoardCast's reviewer says it assessed no other proposal, so the reviews don't rank the two. The ranking above orders their scores and verdicts.
- **BoardCast recheck:** the reviewer read a snapshot the author later trimmed; its objections on one-rider coverage, the three-report cut-off, and Telegram's eight-hour limit still apply. The 380, 394, and 402 eligibility counts recompute exactly.
- **LiftBoard recheck:** the 13:30 count and the far-move breakdown (201, 174, 33, 27) recompute exactly. The Inside Higher Ed article's 43% and 6% match on recheck. The Sage paper returned HTTP 403, so the review's description of it isn't independently confirmed.

## Not verified

Both docs leave these open; each lists the rest ([BoardCast](02-boardcast.md#not-verified), [LiftBoard](01-liftboard.md#not-verified)):

- **Every Gemini Enterprise step:** no licence has arrived, so each step rests on documentation.
- **Phone sensing:** Telegram Live Location from a backgrounded phone, and ride and stop detection in a browser, are untested on real devices.
- **The physical site:** which floors each lift serves and where the spine links blocks; whether Parkhill's walk is usable, where riders are picked up, and vehicle capacities.
- **The feed's future:** whether later weeks hold as published when the timetable feed next updates.

## See also

- [BoardCast] and [LiftBoard]: the full docs, each with its independent review.
- [Brief](/docs/BRIEF.md) and [CONTEXT](/docs/CONTEXT.md): the event's rules and how to compete.
- [APU public documents](/docs/research/apu.md): the timetable feed and its Terms of Use.
- [Gemini Enterprise research](/docs/research/gemini-enterprise.md): the connector and limit checks both docs rely on.
- [Social research](/docs/research/social.md): public posts on lifts and shuttles.
- [Project conventions](/docs/references/project-conventions.md): the real-data rule.

[BoardCast]: 02-boardcast.md
[LiftBoard]: 01-liftboard.md
