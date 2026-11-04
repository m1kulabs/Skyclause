# QuietPact

Help willing student housemates agree to a short quiet period, see same-device relative feedback and renegotiate when the commitment cannot be kept. **Rank 4, 64/100** in the [internal ranking](00-ranking.md); research hold because the evidence establishes noise, not willingness to negotiate or use sensors.

Contents:

1. [User, evidence and adoption](#user-evidence-and-adoption)
1. [The narrow workflow](#the-narrow-workflow)
1. [Cloud, sensing and network](#cloud-sensing-and-network)
1. [Remote MVP and demonstration](#remote-mvp-and-demonstration)
1. [Validation and kill criteria](#validation-and-kill-criteria)
1. [Build, impact and risks](#build-impact-and-risks)

## User, evidence and adoption

**User/owner:** a student sharing a home with willing peers who needs a bounded period for a real presentation or focused task. Job: “Get an explicit answer to this request and a workable alternative if the household cannot agree.” Choose **Smart Campus & Student Experience**.

The [APU residence complaint](https://www.reddit.com/r/malaysiauni/comments/1l4ub3h/dont_ever_come_to_apus_offcampus_city_of_green/) describes late-night shouting; [Malaysian residence and library reports](/docs/research/sol-reddit-signals.md) add noise examples. These do not establish an agreement problem among willing co-tenants. X's public-space discussion is [counter-evidence](/docs/research/sol-x-signals.md): students sometimes accept noise because opening hours, availability and group work matter more.

Unlike RoomReady's individual decision, this requires at least one willing counterpart. A solo user can record personal task readiness, but that is not evidence QuietPact works. No landlord, warden, lecturer, staff member, campus location or unwilling neighbour participates in the MVP. A housemate can decline without being scored or penalized.

## The narrow workflow

1. The student requests an actual bounded slot, purpose and one acceptable alternative. Housemates explicitly accept, decline or propose another time; silence is not consent.
1. During an accepted slot, a willing participant starts a short foreground phone session. The phone computes relative acoustic summaries locally. It transmits no raw speech, speaker identity or occupancy inference. The user can stop and delete the session.
1. Immediate relative feedback stays on that phone. A missing reading means unavailable feedback, not a broken promise. No comparison ranks one person's phone against another.
1. Enterprise later reads the agreement, actual session summaries and the student's own task outcome. It proposes a neutral adjustment or new slot if the agreed plan did not work. A level change alone does not assign blame or prove who caused it.
1. Participants approve any Calendar/Sheets change. Closure requires their stated outcome—completed task, changed plan or unresolved request—not a noise threshold or an automatic fairness score.

Gemini's possible contribution is reconciling multiple human constraints into a precise, consented next agreement. It cannot create cooperation. The baseline is **group chat + shared calendar + ordinary phone timer**. A threshold detector is deterministic and needs no AI.

## Cloud, sensing and network

| Layer/connector           | Job                                                  | Limit                                                                              |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Phone microphone          | Same-phone relative level during a voluntary session | No calibrated dBA, cross-phone ranking, speech capture or legal finding            |
| HTTPS ingest and Sheet    | Actual agreement versions and acknowledged summaries | Stop/delete controls; no address or bystander audio; historical rows clearly dated |
| Drive/Sheets, first party | Read current agreement and session evidence          | Supported Workspace access required; direct cell read                              |
| Calendar, first party     | Prepare an accepted alternative or reminder          | Write requires review; event polling is not a real-time warning                    |
| Enterprise workflow       | Prepare renegotiation and inspect actual closure     | Never automatically sanction or message a housemate                                |

The cloud joins commitments across people; the network delivers acknowledgements and explicitly exposes unavailable sessions; the microphone provides optional evidence about whether the environment helped the task. If a shared calendar alone gives the same outcome, sensing is unnecessary and this is a weak theme fit. No Pi or third-party connector is added merely for decoration. [Platform and microphone limits](/docs/research/sol-platform-and-incumbents.md).

Private audio stays on the phone and is discarded; publish only genuinely safe, consented summary data with provenance. Do not use hidden microphone operation, infer personalities, or label a resident disruptive. These are concrete product limits arising from this workflow, not a claim of regulatory certification.

## Remote MVP and demonstration

MVP: two willing housemates, one actual upcoming task, one accepted slot, short opt-in feedback and a real outcome/renegotiation. Exclude public quiet maps, continuous listening, enforcement, complaint packets and tenant scoring.

Run from the participants' own home, away from APU. If the team has no willing shared household, reject the current build choice; two remote people pretending to be co-tenants would not test it. Show accept/decline, a foreground session, an actual upload interruption, explicit unavailable feedback and an approved agreement update if one is genuinely needed. Do not manufacture a noisy offender.

## Validation and kill criteria

Interview both sides separately about a real recent quiet request. Compare at least three genuine requests against chat/calendar, with explicit permission to refuse. Measure time to agreement, task completion, renegotiation burden and voluntary repeat use. Do not measure success by whether one party always gets their way.

**Planned go thresholds:** two willing participants accept sensing without pressure; at least two requests reveal a recurring gap chat alone leaves; the same pair returns for a second real session; no false claim that unavailable data proves a breach. The microphone must change a useful decision, rather than just make a graph.

**Kill:** lack of willing co-tenants; coercion/power imbalance; battery or permission burden; people use it only when prompted by the builders; chat/calendar performs equally well; or sensing worsens disagreements. These risks justify ranking it below an individually useful product despite local noise evidence.

## Build, impact and risks

Estimate **18–26 combined builder-hours** with willing participants and supported accounts: 6–8 for consent/session controls and local summary, 4–6 for agreement/workflow, 4–6 for real sessions, 4–6 for evidence/access. Participant coordination can exceed the code effort.

| Date        | Student owner                     | Conditional impact and measure                                                           |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| 6 Nov 2026  | Student requester and counterpart | Real voluntary agreement and baseline; otherwise stop                                    |
| 10 Nov 2026 | Workflow owner                    | Actual repeat sessions and honest rejection/absence states                               |
| 5 Feb 2027  | Student maintainer                | Three willing households, each retaining independent decline/exit rights                 |
| 5 May 2027  | Student maintainer                | Continue only if repeat use and improved task outcomes outweigh social and device burden |

No university deployment, housing-management partnership, enforceable noise standard or guaranteed conflict reduction is claimed. The [submission and finals gates](00-ranking.md#build-and-submission-plan) apply in full.
