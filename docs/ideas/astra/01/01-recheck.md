# Recheck: verify recovery where the problem happened

**Rank 1 · 84/100 · Intelligent Automation & Digital Transformation.** Recheck prepares a comparable retest packet so an IT reviewer can judge whether reported connectivity has recovered. This is an unvalidated proposal, inheriting the [shared delivery contract](00-ranking.md#shared-delivery-contract), including account gates, quotas, approvals, privacy, reviewer access, and real-data rules.

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

The proposed user is an APU IT reviewer deciding whether a fix restored the student's task. No partnership exists. Screenshots, location revisits and user replies are hypothesised workarounds; interviews must establish the actual process.

Recurring reports create evidence requests and retests. Adoption requires less reconstruction work, with uncertainty visible.

## Evidence and uncertainty

[Social S1](/docs/research/social.md#s1-apu-wi-fi-loss-has-specific-locations) identifies cafeteria/stair signal loss in May 2026. [S2](/docs/research/social.md#s2-a-former-student-names-classrooms-and-several-service-failures) names S0801/E0903 in a former student's June 2025 complaint. [S3](/docs/research/social.md#s3-a-separate-apu-student-reports-intermittent-service) independently describes intermittent service. These are unverified reports. S1 also reports working accommodation Wi-Fi; [S7](/docs/research/social.md#s7-city-of-green-laundry-is-blocked-by-uncollected-clothes) distinguishes restrictions from decent speed.

**Inference:** comparable retesting may help. No source proves premature APU ticket closure. [S10](/docs/research/social.md#s10-a-repair-vendor-cannot-reproduce-a-recurring-fault) supplies a non-campus recurring-repair analogue, not local validation.

## Mechanism and substitutes

A student submits location/task context and runs HTTPS checks to an authorised endpoint. Retesting requires the same endpoint, location, device and comparable time/load conditions. Mismatches block acceptance.

Acceptance combines repeated fresh successful windows, reporter task confirmation and reviewer judgment. Sparse evidence remains “retest needed.” HTTPS results measure application reachability and elapsed request time: they do not measure RF strength, packet loss, or prove a Wi-Fi root cause.

[Substitutes C1–C2](/docs/research/competition.md#existing-substitutes) include NetBeez, Jira automation, and a technician's checklist. Test comparable physical recovery evidence against a form/template; discard AI if it adds correction work.

## Architecture and states

Team phones are physical network clients at recorded locations. HTTPS carries observations to a current Sheet; Gemini Enterprise uses the **1P live Sheets action** to read readings, freshness, case IDs, and versioned acceptance rules. It interprets report text and assembles an explanation; deterministic code handles matching and thresholds. **3P Jira reviewed create** opens one real case after approval. Jira updates, comments, reads, or transitions are unproven capabilities: the reviewer manually links/transitions existing issues when needed. Deduplication prevents another create masquerading as an update ([F1–F4](/docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences)).

States: `reported → evidence needed → review pending → case created → retest needed → recovery evidence ready → human accepted`. A failed retest returns to `retest needed`. These are application states, not promised Jira transitions.

Missing collector heartbeat, failed source reads, or stale observations produce `unknown` and block recovery. Historical comparisons retain timestamps and never substitute for current readings. Start the shared 30-minute batch cadence, with a named operator covering published pilot hours.

## Seven-day MVP

| Date   | Deliverable and proof                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| 4 Nov  | Prove live Sheets read/reviewed Jira create; interview two users and one desk contact; record one real observation. |
| 5 Nov  | Build capture, matching, freshness and one endpoint at two accessible locations.                                    |
| 6 Nov  | Complete 6–8 interviews across two rounds; time the existing review; start scheduled runs.                          |
| 7 Nov  | Collect 30–50 real observation windows where feasible; independently label outcomes and comparability.              |
| 8 Nov  | Hold out the final day's windows; inspect false recovery, duplicates and missing-source handling.                   |
| 9 Nov  | Package consented evidence, Runs history, deck, README and recording.                                               |
| 10 Nov | Test reviewer trigger/access; submit; maintain operation through assessment.                                        |

A labelled controlled disconnect uses only a team-owned device. It proves failure handling, not an APU outage. Without a real repair, demonstrate measurement and review only; report repair acceptance as untested.

## Demo script

- **0:00–0:35:** one sourced complaint and the reviewer’s decision.
- **0:35–1:15:** live phone check, location/endpoint match and separate timestamps.
- **1:15–2:00:** Gemini Enterprise reads evidence and explains the bounded action; approve a real Jira case if an actual qualifying event exists.
- **2:00–2:40:** show a controlled source failure becoming unknown, never recovered.
- **2:40–3:15:** fresh retest evidence plus user/reviewer confirmation, or explicitly untested recovery.
- **3:15–3:45:** measured denominators, limitations, rollout and live reviewer trigger.

Use a separately labelled real-log replay only where necessary; it never replaces failed live access.

## Measures and scoring

Measure review minutes including corrections/approval, evidence completeness, false recovery, duplicate creation, unknown-state accuracy, and retest completion. Target 30–50 **real windows**, not invented incidents; repeated windows from one event are not independent cases. Report actual sample size. A proposed target is 25% less review time with no false acceptance observed; savings and achievable accuracy are unknown.

| Criterion       | Score | Rationale and remaining proof                                                             |
| --------------- | ----- | ----------------------------------------------------------------------------------------- |
| Impact          | 4     | Repeated usability problem; desk workload and benefit unmeasured.                         |
| Technical build | 4     | Physical clients, fresh evidence and reviewed cross-system action; account path untested. |
| Research        | 4     | Specific APU reports and counterevidence; closure demand needs interviews.                |
| Time to impact  | 4     | Phones avoid procurement; willing reviewer remains essential.                             |
| Daily workflow  | 5     | Report/retest/acceptance naturally repeats; actual run history absent.                    |

The [weighted model](00-ranking.md#scoring-matrix) yields **84**, not an official judging score.

## Rollout and budget

At three months, **3 February 2027**, a **proposed, unconfirmed IT reviewer** owns a two-location pilot and acceptance checklist. At six months, **3 May 2027**, an agreed service owner decides expansion from recurrence and review-time results, with IT approving any production integration.

Budget assumption: 60 person-hours/four students, existing phones, sponsored licence and free team Jira/feeder capacity; RM0 incremental software conditionally, optional data capped at RM30. Costs are unverified. Log labour and quota consumption.

## Kill gates and strongest objection

By **4 November**, stop this candidate if there is no meaningful closure-evidence gap, no willing reviewer, no comparable authorised observations, or no supported connector chain. Existing checklist/Jira configuration winning the timed comparison also kills the custom workflow.

The strongest objection is that fluctuating conditions and endpoint failures can make a convincing packet misleading. Matching conditions and multiple evidence types reduce that risk without proving causality; an inconclusive result must stay inconclusive.
