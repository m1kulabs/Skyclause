# LastLink: turn observed transport gaps into service requests

**Rank 2 · 77/100 · Intelligent Automation & Digital Transformation.** LastLink helps a transport liaison assemble evidence for a service-change request from observed waits and unsuccessful boardings. It inherits the [shared delivery contract](00-ranking.md#shared-delivery-contract), including account gates, quotas, approvals, privacy, reviewer access, and real-data rules. No operator or APU office has agreed to participate.

Contents:

1. [User and recurring job](#user-and-recurring-job)
1. [Evidence and uncertainty](#evidence-and-uncertainty)
1. [Mechanism and substitutes](#mechanism-and-substitutes)
1. [Architecture and states](#architecture-and-states)
1. [Seven-day MVP](#seven-day-mvp)
1. [Demo script](#demo-script)
1. [Measures and scoring](#measures-and-scoring)
1. [Rollout and budget](#rollout-and-budget)
1. [Kill gates and strongest objection](#kill-gates-and-strongest-objection)

## User and recurring job

The proposed user is an APU transport liaison deciding which stop/time problem merits a service-change request. Reconstructing messages, timetables and recollections is the hypothesised workaround; observe the actual process.

Packets group route, stop, window, wait, boarding outcome, corroboration and uncertainty. Daily patterns and post-change checks motivate repeat use. Request submission does not prove transport improved.

## Evidence and uncertainty

[Social S2](/docs/research/astra-social-demand.md#s2-a-former-student-names-classrooms-and-several-service-failures) reports crowded, late APU shuttles and 30–60-minute waits in June 2025. [S4](/docs/research/astra-social-demand.md#s4-a-rider-reports-bearable-morning-waits) contradicts universal severe delays: a January 2026 rider describes bearable waits, usually at most 20 minutes. [S6](/docs/research/astra-social-demand.md#s6-a-parkhill-resident-describes-an-alternative-commute) describes shorter waits again. [S5](/docs/research/astra-social-demand.md#s5-new-students-cannot-confidently-identify-the-correct-shuttle-procedure) shows route and boarding-rule confusion.

These are unverified accounts, not service statistics. **Inference:** an office might value recurrence evidence. Missed APU–Rapid connections and willingness to act are unproven; transfer rescue was dropped.

## Mechanism and substitutes

At one agreed stop/route, volunteers record arrival, vehicle arrival, boarding outcome and departure, with corroboration where possible. Public GPS enriches matching observations; it cannot infer load or prove boarding.

[F5](/docs/research/astra-feasibility-and-substitutes.md#platform-constraints) identifies public T580 near APU. **T580 is not the campus shuttle.** Shuttle observations remain explicitly manual. Missing GPS is unavailable telemetry, never cancellation. Agree and publish the repeated-gap review rule with the liaison.

[Substitute C3](/docs/research/astra-feasibility-and-substitutes.md#existing-substitutes) covers Transit crowdsourcing and campus transport apps. Compare against a spreadsheet log too. The bounded contribution is a sourced service-request packet, without urgent dispatch, connection or time-saving guarantees.

## Architecture and states

Phone GPS anchors stop observations; public vehicle GPS supplies relevant physical telemetry. HTTPS, timestamps, heartbeat and failures expose the network. GPS cannot establish passenger counts.

The feeder writes current observations to a supported Workspace Sheet. Gemini Enterprise uses **1P live Sheets actions** for evidence and versioned rules, interprets messy descriptions, and drafts an explained request. Deterministic code matches routes/stops, freshness and duplicates. **3P Jira reviewed create** records a genuine qualifying service-gap case in the team's project. Production integration is unconfirmed. Jira reads/updates/comments/transitions require capability proof; reviewers manually link/transition existing issues without duplicate creation ([F1–F4](/docs/research/astra-feasibility-and-substitutes.md#platform-constraints)).

States: `observing → evidence incomplete → gap candidate → review pending → request created → outcome check due → outcome recorded`. Healthy windows remain observations. A reviewer can reject a candidate. These states live in the application, not assumed Jira automation.

Each source independently becomes `fresh`, `stale`, `failed` or `unknown`. Feed failure blocks current GPS conclusions; historical witnessed events retain their original provenance. No cached position is shown as current. A named operator reviews the shared 30-minute batches during published pilot hours.

## Seven-day MVP

| Date   | Deliverable and proof                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 4 Nov  | Secure an actionable liaison; prove connectors, relevant route coverage and one real stop observation.  |
| 5 Nov  | Implement one route/stop capture and source-specific freshness; agree the review rule.                  |
| 6 Nov  | Complete two interview rounds totalling 6–8 people; time current complaint reconstruction.              |
| 7 Nov  | Gather 30–50 real observation windows if feasible, including normal service and unsuccessful boardings. |
| 8 Nov  | Independently label evidence, hold out the final day, inspect false gaps and duplication.               |
| 9 Nov  | Package run traces, real evidence, deck, README and recording.                                          |
| 10 Nov | Verify live reviewer access/trigger, submit and maintain the system through assessment.                 |

Predefine windows; repeated queue samples are not independent incidents. Without disruption, handling remains untested. A controlled feeder disconnect proves telemetry failure only; leave vehicles/infrastructure untouched.

## Demo script

- **0:00–0:35:** a specific shuttle complaint alongside the shorter-wait counterexample.
- **0:35–1:15:** live stop observation and correctly identified public/shuttle source boundary.
- **1:15–2:00:** fresh Sheet evidence, rule explanation and approval of a genuine qualifying Jira request if available.
- **2:00–2:40:** controlled feed failure becomes unknown while witnessed historical events retain timestamps.
- **2:40–3:15:** show deduplication and the next outcome-check assignment, with unimplemented Jira updates labelled.
- **3:15–3:45:** measured denominators, unresolved operator action, rollout and live reviewer trigger.

Label any separate real-log replay; healthy live service is valid.

## Measures and scoring

Measure packet preparation/review minutes, correction rate, verified versus unsupported gap classifications, duplicate requests, stale-source handling and reviewer acceptance. Evaluate **30–50 real windows** where available, report smaller actual samples honestly, and separate events from repeated samples. Proposed targets: 25% less preparation time and zero missing-GPS-as-cancellation errors. Actual savings and achievable accuracy are unknown. Measure boarding outcomes separately from administrative completion.

| Criterion       | Score | Rationale and remaining proof                                                           |
| --------------- | ----- | --------------------------------------------------------------------------------------- |
| Impact          | 4     | Repeated commuter friction; actual service improvement depends on operators.            |
| Technical build | 4     | Physical observations, public GPS and reviewed connectors; route overlap remains gated. |
| Research        | 4     | Specific local complaints and contradictions; actionable demand unvalidated.            |
| Time to impact  | 3     | Evidence collection is feasible; owner and service changes take longer.                 |
| Daily workflow  | 4     | Repeat windows, grouped requests and follow-up; run history absent.                     |

The [weighted model](00-ranking.md#scoring-matrix) yields **77**, not an official judging score.

## Rollout and budget

At three months, **3 February 2027**, a **proposed, unconfirmed transport liaison** owns a single-stop pilot and reviews recurring patterns with the appropriate operator. At six months, **3 May 2027**, that owner compares actual boarding/service outcomes after any authorised change before expanding routes. There is no assumed dispatch API.

Planning assumption: 72 person-hours across four students, including roughly 12 hours of field observation; existing phones, sponsored licence and free team Jira/feeder capacity. Incremental software budget is RM0 if these conditions hold; cap travel/mobile-data allowance at RM60. Measure actual costs and quotas.

## Kill gates and strongest objection

By **4 November**, reject this candidate without an owner who can act, a safely observable relevant route, distinct value over a spreadsheet, or a working supported connector chain. If T580 is irrelevant to the liaison's decision, it cannot be decorative IoT evidence.

The strongest objection is that the problem is insufficient capacity or funding, already understood by staff. If structured evidence changes no decision or merely adds review work, LastLink has no adoption case.
