# RoomReady

Help a student choose and verify a workable room/device/connection combination for one upcoming online class or presentation, then close the blockers before it begins. **Rank 2, 77/100** in the [internal ranking](00-ranking.md); backup to BenchRelay, with stronger local pain evidence but a greater risk of duplicating existing tools.

Contents:

1. [User and evidence](#user-and-evidence)
1. [Difference from a mic or speed test](#difference-from-a-mic-or-speed-test)
1. [Daily workflow and architecture](#daily-workflow-and-architecture)
1. [Remote MVP and demonstration](#remote-mvp-and-demonstration)
1. [Validation and kill criteria](#validation-and-kill-criteria)
1. [Build, impact and risks](#build-impact-and-risks)

## User and evidence

**User/owner:** a student presenting from an off-campus rental with limited control of noise, internet restrictions or household activity. Job: “Help me resolve what will stop this specific presentation, using places and connections I already have.” Choose **Smart Campus & Student Experience**, framed around student participation rather than a facilities service.

An [APU City of Green resident](https://www.reddit.com/r/malaysiauni/comments/1l4ub3h/dont_ever_come_to_apus_offcampus_city_of_green/) describes late-night noise and inaccessible services despite decent internet speed. A [Malaysian student considering hotspot classes](https://www.reddit.com/r/malaysiauni/comments/1dpefdx/) needs a usable evening connection without a long fixed-line commitment. These are anecdotes, not measured APU-wide conditions. The [research report](/docs/research/sol-reddit-signals.md) records dates, access limits and additional counterexamples.

The [X research](/docs/research/sol-x-signals.md) adds a useful constraint: students may work in public dining spaces because a university lacks a 24-hour option, while accepting ambient noise. Therefore “quietest” is not automatically “best.” Whether speaking is permitted, the place is open and reachable, or privacy is adequate remains user-declared, not inferred by a microphone or map.

One student can gain value from two personal trials. There is no campus crowdsourcing cold start, venue database or need for anyone at APU. RoomReady does not require a landlord/router change or recommend bypassing access restrictions.

## Difference from a mic or speed test

Zoom already checks audio/video/internet and offers connection statistics. A self-recording and ordinary checklist may be enough. [Official incumbent checks](/docs/research/sol-reddit-signals.md#incumbents-checked-against-official-documentation).

The proposed difference is **task-specific resolution across constraints**: the actual presenting device can open the required service and artefacts; the student is allowed to speak; a short sample is acceptable to its owner; and there is a personally verified alternative if a blocker persists. A timestamped trial compares combinations the student actually tried. It never assigns a universal room score or predicts future network stability from one test.

Gemini joins the changing task plan, observed tests and available alternatives into an explainable next step. Rules own freshness, success/failure and timing. Compare against **Zoom test + required-link checklist + chat/calendar reminder**, not against total inaction.

## Daily workflow and architecture

1. The student declares one real task, time, required services/artefacts, presenting device and personally accessible alternatives. Calendar is optional input; manual entry works without third-party adoption.
1. In a short foreground session, the actual task device performs the supported browser checks. A phone can capture its own local noise summary and a privately reviewed speech sample. Its measurements are labelled as phone observations; they do not certify a different laptop microphone or connection.
1. Upload acknowledgements identify which observations reached the cloud. A browser navigation/user confirmation records required-site access where cross-origin policy prevents automated inspection; opaque fetch results are not called success. No passwords, meeting tokens, arbitrary private URLs or raw speech enter a public evidence store.
1. Enterprise reads the current test rows and task plan. It proposes one actionable change: try the personally available hotspot, move to an already permitted space, or check a missing artefact on the actual device. “Unknown” is a valid result. It does not infer a firewall cause from a timeout.
1. The student approves any Calendar or Sheets write. After actually trying the change, a new observation closes the blocker. If the student declines or time runs out, the task remains unresolved rather than turning green automatically.

| Layer/connector                       | Job                                                                  | Limits                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Phone microphone                      | Observe local relative audio and support a voluntary listening check | No calibrated dBA, speech recognition, background surveillance or cross-phone comparison |
| Actual task device and HTTPS receiver | Measure a real transfer and service-specific checks                  | A receiver test is not a Zoom quality prediction; a phone test is not a laptop test      |
| Team-owned ingest → Sheet             | Store timestamps, declared conditions and current status             | Exact direct read; historical trials never substitute for failed current readings        |
| Drive/Sheets, first party             | Read plan and current evidence; approved blocker/status updates      | Supported Workspace account required                                                     |
| Calendar, first party, optional       | Read the actual task time and prepare a follow-up reminder           | Approved write; scheduled polling is not an immediate alarm                              |
| Enterprise workflow                   | Reconcile task constraints, prepare a next step, check closure       | Recurs around planned work, not an always-listening daemon                               |

No third-party connector is added just for a score. If a real student team already tracks presentation blockers in its own Jira, a Jira integration can read and update those tasks; it is outside the solo MVP. No APU system is connected. No custom MCP or Pi is necessary. The Pi should remain unused unless it has a real receiver role; a cloud receiver is simpler for a wide-area test. [Platform limits](/docs/research/sol-platform-and-incumbents.md).

## Remote MVP and demonstration

MVP: one actual upcoming presentation, two tested combinations at home, one contextual recommendation, one retest and one confirmed resolution. Exclude maps, provider rankings, noise enforcement, call interception and landlord reports.

Show actual conditions and the exact declared task. Compare the available home Wi-Fi and hotspot only if both really exist. A denied microphone permission, service-access limitation or disconnected upload is a legitimate demonstration of uncertainty. If neither combination fails, do not invent a bad connection; show the measured comparison and let the trial determine whether it was useful.

Show a real retest and the approved status/reminder write. Use historical same-hour trials only as explicitly dated context, never as current conditions. Immediate user feedback runs in the client; Enterprise's polled/background decision can take minutes. Keep the live reviewer path available, with a dated recording as support.

## Validation and kill criteria

Observe 3–4 willing students remotely using their own environments. First measure the baseline: time until they can justify a workable choice, unresolved checks, wasted transfers and whether they actually change a decision. No campus helper is required. Avoid collecting room addresses, raw speech or bystander audio; publish only safe, consented test summaries.

**Planned go thresholds:** at least two participants have a recurring blocker the incumbent checklist did not resolve; three comparable task trials; at least one real changed choice confirmed by a retest; 25% lower median preparation time without more false-ready decisions; at least two voluntary repeat sessions. These are proposed decision rules, not results.

**Kill:** a standard Zoom test plus a checklist is equally useful; no change follows the recommendation; the actual presenting device cannot be tested; microphone/privacy burden deters repeats; or every useful decision is deterministic and the Enterprise layer adds delay. Separate “usable in this trial” from a guarantee about tonight's class.

## Build, impact and risks

Estimate **18–24 combined builder-hours** with accounts ready: 6–8 for foreground capture/receiver, 4–6 for plan/reconciliation, 4–5 for real comparison trials, 4–5 for evidence and reviewer access. Budget/time estimates exclude a paid network plan or unconfirmed credits. Bound transfer sizes before each test, show the actual bytes, and let the user cancel.

| Date        | Student owner      | Conditional impact and measure                                                        |
| ----------- | ------------------ | ------------------------------------------------------------------------------------- |
| 6 Nov 2026  | Product lead       | First real two-option task comparison and baseline                                    |
| 10 Nov 2026 | Workflow owner     | Repeated loop with a real changed decision or a documented rejection                  |
| 5 Feb 2027  | Student maintainer | Ten willing off-campus students; count repeat use and verified choices, not app opens |
| 5 May 2027  | Student maintainer | Continue only if repeat benefit exceeds preparation, data, battery and licence costs  |

Main risks are a crowded diagnosis category, measurement overreach, one-off novelty, user-declared permissions, blocked services, account access and uncertain future conditions. The strongest differentiator is the constrained task decision; remove it and this becomes an ordinary preflight dashboard. All [submission and finals gates](00-ranking.md#build-and-submission-plan) still apply.
