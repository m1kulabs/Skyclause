# Sol idea ranking

**Start by validating BenchRelay:** help a remote student team hand its one physical prototype from one teammate to the next without losing the connection between code, device state and evidence. RoomReady is the backup if hardware handoffs are not a real recurring problem. These are researched product hypotheses, not validated demand or measured impact; the five briefs describe alternatives, not a five-product build.

Prepared on 5 November 2026 MYT from the [brief](/docs/BRIEF.md), [context](/docs/CONTEXT.md), fresh social research and independent critique. The user's premise is 1,000+ participants with similar AI tools; that is a planning assumption, not a verified entrant count. This set does not use other idea sets.

Contents:

1. [Decision and limits](#decision-and-limits)
1. [Evidence and confidence](#evidence-and-confidence)
1. [Round one: diverge](#round-one-diverge)
1. [Round two: attack the assumptions](#round-two-attack-the-assumptions)
1. [Round three: redesign against every component](#round-three-redesign-against-every-component)
1. [Round four: score and stress-test](#round-four-score-and-stress-test)
1. [What to validate before choosing](#what-to-validate-before-choosing)
1. [Build and submission plan](#build-and-submission-plan)
1. [Sources](#sources)

## Decision and limits

Choose one track and one product. BenchRelay fits **Intelligent Automation & Digital Transformation**, with a student project lead as the workflow owner. No campus office, lecturer, staff member, institutional API or person physically at APU is required. The Pi stays at a teammate's home; other teammates connect remotely. Phones provide actual sensing for the alternatives. No additional camera module, environmental sensor, smart plug or UPS is assumed.

Hard gates precede scores:

| Gate                        | Evidence required before building                                                                                            | Current disposition                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Authorized remote operation | Only team-controlled devices, accounts, spaces and real records; no campus installation or staff action                      | All five designed for this; actual account/device checks pending |
| Real user job               | Observe a real task that recurs and a person willing to try the alternative                                                  | Public signals exist; no interviews or product trials conducted  |
| Genuine theme               | Removing sensing changes the decision; cloud joins state; network delivery/failure matters                                   | Strongest for BenchRelay and FieldPair; weakest for CaptureLoop  |
| Enterprise path             | Licensed Gemini Enterprise app, supported account, direct live read, required connector actions and non-team reviewer access | Tenant access unverified; applies to every idea                  |
| Honest data                 | Real readings/events, source timestamps, explicit error on failure; no synthetic incidents or cached live substitute         | Designed, not implemented                                        |
| Deadline                    | Small complete loop by 10 November, with time for access, documentation and assessment uptime                                | Estimates only; prototype not built by this task                 |

An unavailable gate cannot be offset by a high score. The ideas require **no APU staff help**, including account provisioning by APU staff. A supported domain must already be team-controlled or supplied through the event's licence process; do not silently substitute a consumer Gmail account. If the available tenant cannot support a core loop, none of these Enterprise architectures is proven ready.

Competition participation is a separate gate. The [brief](/docs/BRIEF.md#eligibility-and-teams) requires 2–5 current APU students; their status is not inferred here. The online build is compatible with the constraint, but the 17 November top-five pitch is planned at the APU Auditorium. Remote pitching remains unconfirmed. No idea removes that finals risk.

## Evidence and confidence

The research distinguishes a complaint, documented existing capability, and an observed product outcome. Only the first two were collected. Several posts in one thread count as one cluster. Social posters were not contacted, and no endorsement, prevalence or willingness to pay is claimed.

| Evidence                                                                                 | What it supports                                                                  | What it does not support                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Student asks how a group can test code on its one Pi from separate computers             | A specific shared-prototype collaboration job; transfer evidence from outside APU | That today's tools fail, or APU students will adopt BenchRelay    |
| APU City of Green complaint about late-night noise and service-specific internet trouble | Locally relevant environment and task-access problems                             | That a quiet agreement works, or a speed test diagnoses the cause |
| Malaysian student asks whether hotspot service will support night classes                | A real connectivity/budget tradeoff                                               | That any proposed test predicts a future class                    |
| Phone-experiment discussion describes setup and interpretation difficulties              | Sensor/protocol integrity is worth investigating                                  | That FieldPair improves scientific validity or has local demand   |
| Official incumbent documentation                                                         | Remote access, measurement capture, validation and meeting checks already exist   | An exhaustive market census or proof a new seam is unique         |

Post URLs, dates, access limits and paraphrases are in the [Reddit report](/docs/research/sol-reddit-signals.md) and [X report](/docs/research/sol-x-signals.md). Current platform and incumbent checks are in [Sol platform research](/docs/research/sol-platform-and-incumbents.md). Source failures remain visible; confidence is not upgraded merely because authenticated retrieval was attempted.

The additional [phyphox forum signal](/docs/research/sol-platform-and-incumbents.md#phone-experiment-signals) reports actual/requested sampling differences and cross-phone file loading, then resolution through existing support. It sharpens FieldPair's compatibility check while challenging whether a new product is needed. The user's student status and any unmet team workflow remain unknown.

## Round one: diverge

The first round generated jobs before selecting tools. The pool combines independent researcher/reviewer sketches with orchestration synthesis; no other idea-set documents were read.

| Candidate                    | Narrow job                                                                  | First-round weakness                                            |
| ---------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| BenchRelay                   | Hand a shared Pi prototype to the next remote teammate with usable evidence | Remote access and CI are mature                                 |
| RoomReady                    | Complete a real online task from a noisy or restricted rented room          | Could collapse into a Wi-Fi dashboard                           |
| FieldPair                    | Catch incompatible distributed phone captures before merging them           | Validation may solve it without AI                              |
| QuietPact                    | Agree and verify a short quiet period among willing housemates              | Consent and cooperation dominate sensing                        |
| CaptureLoop                  | Close missing references/captures in shared handwritten notes               | Camera upload can be decorative IoT                             |
| RecallReceipt                | Recompute shared analyses after a contributor withdraws a capture           | Real withdrawal project absent; public-copy deletion impossible |
| ConditionDelta               | Complete comparable before/after rental inventory evidence                  | No actual move available; weak recurring workflow               |
| BorrowBack                   | Return a student's shared kit with every component                          | Requires an actual loan; asset systems already cover checkout   |
| Campus seat finder           | Find a usable seat with live crowd signals                                  | Needs campus observations and a cold-start network              |
| Elevator accessibility watch | Know whether an accessible route is usable now                              | Needs campus access and trusted observations                    |
| Shuttle queue coordinator    | Adjust a trip to actual queues and boarding                                 | No access to shuttle or queue observations                      |
| Room energy optimizer        | Change room power consumption from sensor evidence                          | No power meter or building control                              |
| Campus helpdesk agent        | Turn a fault into a staff-owned fix                                         | Staff dependence; heavily crowded category                      |
| AI tutor                     | Answer course questions and plan study                                      | No distinctive physical loop; crowded                           |
| Meeting mic tester           | Check audio and network before a call                                       | Existing conferencing tools already do it                       |
| Generic field collector      | Capture forms offline and upload them                                       | KoboToolbox/ODK/QField already cover core functions             |

## Round two: attack the assumptions

Remove the seat, elevator, shuttle and energy directions at the access/hardware gate. Remove the helpdesk and tutor directions for dependency or weak differentiation. Merge mic testing into RoomReady only if it changes a real task decision. Keep RecallReceipt, ConditionDelta and BorrowBack out of the five because no genuine triggering task was established; staging one would add little evidence.

The remaining five were changed, rather than renamed:

| Candidate   | Adversarial finding                                                                                   | Revised mechanism                                                                                                                               | Still capable of killing it                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| BenchRelay  | Pi Connect, Arduino Cloud and labgrid already provide access/sharing; labgrid already locks resources | Bind a real run to revision, declared physical configuration and reproducible observation; invalidate handoff readiness when context changes    | README + CI + remote shell handles the same real failures equally well           |
| RoomReady   | Zoom already tests audio/video/connectivity; a phone cannot certify a laptop                          | Start from the member's exact upcoming task, test its actual device/path, capture a before/after workaround, and track unresolved team blockers | Conferencing tests + a shared checklist save as much time                        |
| FieldPair   | A plot or offline sync is established functionality                                                   | Compare capture manifests with a team-authored protocol and request a specific recollection; separate protocol mismatch from surprising science | Existing constraints prevent the errors, or rules alone produce the same benefit |
| QuietPact   | A microphone cannot enforce fairness; cross-phone dBA is unreliable                                   | Voluntary short sessions, same-phone relative feedback, explicit acceptance and renegotiation                                                   | Shared calendar/chat is easier, or housemates decline sensing                    |
| CaptureLoop | OCR/scanning is mature, and Enterprise image access is unverified                                     | Resolve missing cross-references across a real note packet and follow the recapture to closure                                                  | Scan app + recipient glance is enough, or tenant cannot inspect images           |

## Round three: redesign against every component

The five NTT DATA points in [CONTEXT](/docs/CONTEXT.md#what-ntt-data-said-it-will-rate) are spoken guidance. No official weights or scale were published in the supplied capture. The first five rows below preserve that guidance; the last three are our strategic criteria. The table records how the second-round attacks changed the final comparison across **every** scoring component.

| Component           | Initial temptation                       | Round-two challenge                                     | Round-three decision and evidence needed                                                                                              |
| ------------------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Impact              | Claim benefit for all students           | Actual users and task volumes unknown                   | Each brief names one owner, a non-AI baseline and one timed task outcome; do not claim population savings                             |
| Technical build     | Add connectors and multiple agents       | Complexity and unsupported tenant assumptions           | Direct sensor-row reads plus only useful actions; one Enterprise workflow; test actual auth and approval before feature work          |
| Research            | Treat social complaints as validation    | Anecdotes and transfer evidence are weak                | Grade confidence separately; recruit remote students for two rounds; preserve negative findings and incumbent switching tests         |
| Time to impact      | Promise a campus rollout in three months | Campus sponsors are unavailable                         | First value for one individual/team; dated three/six-month milestones with student owners and exit criteria                           |
| Day-to-day workflow | Produce a single clever response         | No recurrence or closure                                | Explicit trigger → evidence → decision → proposed action → approval → verification; low-frequency reconciliation with run history     |
| Originality         | Novel name or sensor dashboard           | 1,000+ AI-equipped competitors can build the same shell | Defend a difficult relationship, especially revision/state/evidence or protocol/capture/correction; compare against actual incumbents |
| Remote feasibility  | Assume staff data or extra sensors       | Those resources are prohibited/unavailable              | Home devices, self-owned accounts, foreground phone sessions, no campus-specific proof claims; hardware/access kill gates             |
| Demo clarity        | Show a polished dashboard                | It may hide fabricated data or stale readings           | Demonstrate one real mismatch, one visible error, one correction and one verified outcome; label historical material and timings      |

Gemini must improve an interpretive coordination task, such as turning contradictory run evidence and a changed plan into a precise handoff request. Deterministic rules own locks, timestamp checks, thresholds and upload integrity. A rules-only system is a serious baseline, not an inferior straw man.

## Round four: score and stress-test

Internal scale: **1** = weak fit or severe unresolved assumptions; **3** = plausible but unvalidated; **5** = unusually strong fit with a concrete mechanism. These are judgment scores of proposals, not measured performance. Evidence confidence and gate status remain separate.

| Component           | Code | Weight | What earns the score                                                                  |
| ------------------- | ---- | -----: | ------------------------------------------------------------------------------------- |
| Impact              | I    |     20 | Recurring, consequential job and a useful first-user outcome                          |
| Technical build     | T    |     15 | Necessary cloud/sensing/network roles and credible Enterprise connector path          |
| Research            | R    |     15 | Specific, relevant, independently bounded evidence plus a tractable validation method |
| Time to impact      | V    |     10 | First value without institutional adoption and credible milestones                    |
| Day-to-day workflow | W    |     15 | Trigger, owner, approval, closure and unattended useful work                          |
| Originality         | O    |     10 | A workflow gap beyond documented incumbents                                           |
| Remote feasibility  | F    |     10 | Existing devices, low permissions, limited build scope                                |
| Demo clarity        | D    |      5 | A compact, honest live demonstration of a changed decision                            |

Total = `sum(weight × score / 5)`; maximum 100. Scores assume account gates can be met, not that they have been met.

| Rank | Product and one-sentence promise                                                                                |   I |   T |   R |   V |   W |   O |   F |   D | Total | Evidence / disposition                                           |
| ---: | --------------------------------------------------------------------------------------------------------------- | --: | --: | --: | --: | --: | --: | --: | --: | ----: | ---------------------------------------------------------------- |
|    1 | [BenchRelay](01-benchrelay.md): the next teammate can reproduce the last trustworthy device run                 |   4 |   4 |   3 |   4 |   5 |   4 |   4 |   4 |    80 | Medium pain specificity, low solution validation; validate first |
|    2 | [RoomReady](02-roomready.md): resolve the room/device/path blockers to one upcoming online task                 |   4 |   3 |   4 |   5 |   4 |   3 |   4 |   4 |    77 | Stronger local pain, low switching evidence; backup              |
|    3 | [FieldPair](03-fieldpair.md): find incompatible phone captures before the team trusts a merged result           |   3 |   4 |   2 |   4 |   4 |   4 |   3 |   4 |    68 | Transfer evidence; research hold                                 |
|    4 | [QuietPact](04-quietpact.md): turn a willing household's quiet request into a short accepted commitment         |   3 |   3 |   3 |   3 |   4 |   3 |   3 |   4 |    64 | Local noise evidence, no cooperation validation; research hold   |
|    5 | [CaptureLoop](05-captureloop.md): get the missing figure or explanation while the author still has the original |   3 |   3 |   1 |   4 |   3 |   4 |   3 |   4 |    59 | Exploratory; demand and image-access gates unresolved            |

BenchRelay's research score is only 3 because its direct post is old and nonlocal. RoomReady's 4 reflects more relevant local pain, not tested effectiveness. FieldPair and CaptureLoop are penalized for transfer or absent demand evidence. QuietPact is penalized for social coordination and recurring microphone burden. Technical scores are for necessary, plausible architecture; none proves a working integration.

### Sensitivity to different priorities

Weights are ordered `I/T/R/V/W/O/F/D`. Each row still totals 100. All scenarios use the same proposal scores.

| Scenario                  | Weights                | BenchRelay | RoomReady | FieldPair | QuietPact | CaptureLoop | Leader     |
| ------------------------- | ---------------------- | ---------: | --------: | --------: | --------: | ----------: | ---------- |
| Balanced                  | 20/15/15/10/15/10/10/5 |         80 |        77 |        68 |        64 |          59 | BenchRelay |
| Local impact and research | 30/10/25/10/10/5/5/5   |         77 |        79 |        63 |        63 |          54 | RoomReady  |
| Technical differentiation | 15/25/10/5/15/20/5/5   |         81 |        72 |        72 |        64 |          62 | BenchRelay |
| Remote delivery speed     | 15/10/10/20/10/5/25/5  |         80 |        81 |        68 |        63 |          62 | RoomReady  |

There is **no robust numerical winner**. BenchRelay leads when differentiated recurring coordination matters; RoomReady leads when local evidence or delivery speed dominates. The decisive uncertainty is an observed workflow gap, not a three-point margin. If BenchRelay's originality score drops from 4 to 2 after testing existing tools, its balanced total falls to 76 and RoomReady leads. If RoomReady's impact is just a generic test/checklist and falls from 4 to 2, it falls to 69. Do not add decimals or claim probabilities from these judgments.

## What to validate before choosing

Remote research requires no campus helpers. Recruit willing students through the team's existing contacts; no outreach was sent during this task.

1. **Round A, problem discovery:** ask 3–4 remote students to show the last actual task, existing tools, failure, consequence and workaround. For BenchRelay, at least one must share physical hardware with another person. For RoomReady, use the actual online-task device and service. Avoid pitching the solution first.
1. **Round B, switching test:** return to willing participants with a narrow working loop; compare the incumbent-plus-checklist baseline with the candidate on comparable real tasks. Counterbalance order where possible. Report sample sizes, learning effects and failures. Teammates may test mechanics but are not independent demand evidence.
1. **Choose by 6 November:** proceed only if one repeated failure survives the simpler baseline, someone volunteers for a second session, and the Enterprise access gate passes. Otherwise reject the hypothesis before extending the build. The product briefs specify task-specific kill thresholds; those are planned tests, not results.

Useful question: “Show what the next person could not know from the tools you already used.” For BenchRelay, a green test on yesterday's revision is not today's handoff. For RoomReady, a good speed test is not proof that the required service or presenting device works.

## Build and submission plan

This is a proposed plan for **one selected product**, beginning 5 November. Work estimates in the briefs assume 2–3 active builders with working accounts; they are not commitments or completed work.

| MYT date  | Deliverable and owner                                                                                                       | Exit evidence                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 5 Nov     | Integration owner checks licence, supported account, live read, approval and reviewer access; research owner begins Round A | Real row read through Enterprise; actual connector failure shown honestly if blocked             |
| 6 Nov     | Product lead selects one hypothesis; device owner completes the smallest physical loop                                      | Real task gap, baseline timing and one actual corrective event; stop if absent                   |
| 7 Nov     | Workflow owner adds recurrence, deduplication, freshness and closure                                                        | Corrected run/event referenced by ID; source failure never produces a fresh success              |
| 8 Nov     | Research owner runs Round B; submission lead checks individual/team registration before 23:59                               | Denominators, failed cases and baseline comparison; registered eligible team                     |
| 9 Nov     | Freeze features; documentation owner makes README, diagram, deck and video                                                  | Five briefing README topics; actual connector trace; PDF under 10 MB; dated 3–4 minute recording |
| 10 Nov    | Team leader tests links/access and submits early, before 23:59                                                              | Final portal receipt; saving a draft is insufficient and final locks entry                       |
| 11–14 Nov | Operations owner checks actual run history, credential expiry, quotas and device uptime remotely                            | Live reviewer access plus explicit errors; recordings never replace live access                  |
| 15–17 Nov | Submission lead handles top-five outcome and pitch format                                                                   | Remote-finals permission must be confirmed if selected; physical attendance is unavailable       |

Meet both the [portal and briefing submission lists](/docs/BRIEF.md#submission-requirements): title, exactly one track, summary of at least 50 characters, HTTPS repository, PDF deck at most 10 MB, demo link, structured README, high-level diagram and 3–4 minute video, with actual reviewer access to the Enterprise app. Show Antigravity's real implementation role rather than claiming it was used in this ideation task. Do not purchase or assume unconfirmed credits.

Three- and six-month dates in the product briefs are **5 February and 5 May 2027**. They are conditional milestones owned by student maintainers, with continued licence costs and interest rechecked; no university partnership is implied.

## Sources

- [Hackathon brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md): event facts and explicitly marked inferences. The supplied capture is dated 3 November; no claim that a new official rubric was checked today.
- [Reddit and related social signals](/docs/research/sol-reddit-signals.md): original pain reports, evidence limits and incumbent comparisons.
- [X signals and retrieval audit](/docs/research/sol-x-signals.md): authenticated read attempts and separately sourced public posts, with any failures retained.
- [Platform and incumbent checks](/docs/research/sol-platform-and-incumbents.md): current primary technical sources and additional original Reddit/phyphox forum signals; live tenant compatibility remains unverified.
