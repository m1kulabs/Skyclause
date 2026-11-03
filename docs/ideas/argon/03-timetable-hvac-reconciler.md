# Timetable & HVAC Reconciler

Timetable & HVAC Reconciler is a weekly Gemini Enterprise workflow for APU Academic Administration (AA) and Facilities. It audits each newly published intake timetable against an editable rule table, catching long same-day gaps, physical and online mix-ups, and tutorial-group prefix changes, and files approval-gated Jira Cloud work items. Its second half, flagging rooms that are booked but empty, is unproven. It ranks third at 88.0 / 100 in the Intelligent Automation & Digital Transformation track ([ranking](00-ranking.md)).

Contents:

1.  [Problem in weekly timetabling](#problem-in-weekly-timetabling)
2.  [How Timetable & HVAC Reconciler works](#how-timetable--hvac-reconciler-works)
    1.  [Timetable, ambient, and presence data](#timetable-ambient-and-presence-data)
    2.  [Timetable & HVAC Reconciler connectors](#timetable--hvac-reconciler-connectors)
3.  [Timetable & HVAC Reconciler validation and rollout](#timetable--hvac-reconciler-validation-and-rollout)
4.  [Timetable & HVAC Reconciler evidence limits](#timetable--hvac-reconciler-evidence-limits)
5.  [See also](#see-also)

## Problem in weekly timetabling

- **Unsupervised scheduling:** "APU's timetable system are automated by an internal AI-algorithm with no proper supervision. The catch is, the AI-algorithm doesn't work well all the time" ([timetable algorithm thread]). Timetables are published "every week before the commencement of the week" ([KB check timetable]).
- **Long gaps:** "class A starts at 8am, class B starts at 4pm and they dont do online classes" ([cashgrab thread]).
- **Physical and online confusion:** a first-week student skipped a class "due to physical and online confusion" ([attendance worry thread]).
- **Prefix breaks:** when APU changed tutorial groups from T1 to G1, the old selection cached on each device broke the timetable view until students switched intakes or cleared the app cache ([KB timetable prefix]).
- **Room comfort is mixed:** a visitor found room B-06-07 "sooo cold" ([one sem thread]), another post claims the air conditioning is switched off except on open day ([campus life thread]), and the canteen air "feels humid" ([cashgrab thread]). Partition walls are "not as soundproof as you can imagine", with "only few sockets" ([is APU that bad thread]).

[timetable algorithm thread]: https://www.reddit.com/r/malaysiauni/comments/16ml7by/
[KB check timetable]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/321257473
[cashgrab thread]: https://www.reddit.com/r/malaysiauni/comments/1sufodw/
[attendance worry thread]: https://www.reddit.com/r/malaysiauni/comments/1vctvfq/
[one sem thread]: https://www.reddit.com/r/malaysiauni/comments/1nsp664/
[campus life thread]: https://www.reddit.com/r/malaysiauni/comments/1afogdy/
[is APU that bad thread]: https://www.reddit.com/r/malaysiauni/comments/189vruy/

## How Timetable & HVAC Reconciler works

### Timetable, ambient, and presence data

1.  **Public intake timetables:** APSpace shows intake timetables without login ([KB timetable without login]), and Classroom Finder lists free rooms ([KB APSpace]).
2.  **Ambient conditions:** the hourly DOE APIMS reading from station `CA16W` Cheras, about 5.9 km away, fetched server-side because APIMS blocks browser requests, plus an Open-Meteo forecast for Bukit Jalil, whose free tier is non-commercial ([public data sources], [context public feeds]).
3.  **Room presence:** a QR check-in 15 minutes after a class starts records whether the room is in use, keyed by APU's class code format ([KB class code]).

[KB APSpace]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/218792045
[public data sources]: /docs/research/data-sources.md
[KB class code]: https://apiit.atlassian.net/wiki/spaces/AA/pages/1626997180

### Timetable & HVAC Reconciler connectors

- **Google Drive and Sheets (GA):** hold `Weekly_Timetable_Audit`, the weekly diff, and the 12-rule `AA_Timetable_Rulebook`, which flags gaps over 4 hours, back-to-back physical and online classes, T and G prefix mismatches, and rooms booked but empty for more than 2 hours.
- **Jira Cloud and ServiceNow (GA):** create schedule exception items for a human scheduler and air-conditioning turn-down tasks for Facilities.
- **SharePoint and Gmail (GA):** upload the weekly room-use report, and draft the cache-clearing steps from the KB when group codes change.
- **Custom MCP on Cloud Run (preview):** `apu-timetable-mcp` fetches public intake timetables, diffs them against last week, and reads ambient conditions.

The workflow runs on a weekly schedule after publication, plus a daily check for re-published timetables; Workflow Builder has no webhook trigger ([context workflows]).

[context workflows]: /docs/CONTEXT.md#workflows-and-unattended-runs

## Timetable & HVAC Reconciler validation and rollout

- **Research:** interview 6 students and 2 AA staff or lecturers. APU's campus guide lists a Schedulers office in Block A, level 7 ([KB campus guide]), which makes a natural owner to interview.

- **Evaluation set:** 40 real published intake timetables fetched from the public view, scored on precision and recall for gaps over 4 hours and room conflicts. Score empty-room detection only on rooms with real check-in data.
- **Months 1–3, from the 24 November 2026 intake:** audit School of Technology intakes after each weekly publication. Auditing before publication needs AA access to draft timetables, which are private.
- **Months 4–6, from the 25 March 2027 intake:** if room checks confirm the problem, work with LNO Facilities, an owner to confirm in interviews, to turn down air conditioning in empty rooms, toward SDG target 7.3 on energy efficiency.

[KB campus guide]: https://apiit.atlassian.net/wiki/spaces/LNO/pages/3855974442

## Timetable & HVAC Reconciler evidence limits

- **The HVAC premise is unproven:** no post says empty rooms run air conditioning, and one says it's usually off. Drop the HVAC half unless room checks from 4 to 7 November show waste.
- **Private systems sit behind it:** lecturers' class assignments live in GIMS, APU's internal system ([KB OBE guide]); the reconciler sees only what's published.
- **APIMS can change:** its endpoint is undocumented, so failures must show as errors ([context public feeds]).

[KB OBE guide]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/781877270

## See also

- [Argon idea ranking](00-ranking.md)
- [APU public documents](/docs/research/apu.md) and [public data sources](/docs/research/data-sources.md)
- [Public timetable guide][KB timetable without login] and [timetable prefix fix][KB timetable prefix] in APU's KB

[KB timetable prefix]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/801013944
[KB timetable without login]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2299166721
[context public feeds]: /docs/CONTEXT.md#public-feeds
