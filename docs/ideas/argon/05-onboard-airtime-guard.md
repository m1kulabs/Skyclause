# OnBoard Airtime Guard

OnBoard Airtime Guard is a crowd-sensed study-spot finder for APU students and the Digital Solutions Team (CTI). Students' browsers measure Wi-Fi throughput and noise where they sit; the readings are joined with public timetables to point study groups to vacant rooms that are quiet and have fast Wi-Fi, and an hourly Gemini Enterprise workflow files a Jira Cloud issue for CTI when a zone stays congested. It ranks fifth at 86.0 / 100 in the Smart Campus & Student Experience track ([ranking](00-ranking.md)).

Contents:

1.  [Problem for students studying on campus](#problem-for-students-studying-on-campus)
2.  [How OnBoard Airtime Guard works](#how-onboard-airtime-guard-works)
    1.  [Browser sensing and vacant-room matching](#browser-sensing-and-vacant-room-matching)
    2.  [OnBoard Airtime Guard connectors](#onboard-airtime-guard-connectors)
3.  [OnBoard Airtime Guard validation and rollout](#onboard-airtime-guard-validation-and-rollout)
4.  [OnBoard Airtime Guard evidence limits](#onboard-airtime-guard-evidence-limits)
5.  [See also](#see-also)

## Problem for students studying on campus

- **Long gaps:** "class A starts at 8am, class B starts at 4pm and they dont do online classes" ([cashgrab thread]).
- **Wi-Fi dead zones:** "I lose signal usually around the cafeteria when there's a lot of people and near any of the stairs", and "The traffic is so congested they need more APs" ([wifi thread]).
- **Noise and sockets:** "Classrooms aren't filled with electrical plug point in a uni where every course basically needs a plug point", "Cafeteria is packed and noisy", and partition walls are "not as soundproof as you can imagine" ([is APU that bad thread]).
- **Static tools:** APSpace's Classroom Finder lists free rooms ([KB APSpace]), and AIDA answers campus navigation questions ([KB AIDA]), but neither says whether a free room has fast Wi-Fi, low noise, or sockets right now.

[cashgrab thread]: https://www.reddit.com/r/malaysiauni/comments/1sufodw/
[wifi thread]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/
[is APU that bad thread]: https://www.reddit.com/r/malaysiauni/comments/189vruy/
[KB AIDA]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/3791422495

## How OnBoard Airtime Guard works

### Browser sensing and vacant-room matching

1.  **Network reading:** a zero-install web page runs a 3-second HTTP burst test and reads `navigator.connection` downlink and RTT where the browser supports it.
2.  **Noise reading:** an optional 2-second Web Audio level check reports a decibel level and keeps no audio.
3.  **Vacancy:** the public intake timetables ([KB timetable without login]) and Classroom Finder give each room's remaining free time before the next class.

[KB timetable without login]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2299166721

### OnBoard Airtime Guard connectors

- **Google Drive and Sheets (GA):** read live zone readings from `Campus_Zone_QoS`.
- **Google Calendar (GA):** book a study-group hold on the students' calendars for the vacant window.
- **Jira Cloud, Gmail, and Slack (GA):** when a zone stays degraded across at least five student checks, the hourly workflow queues a network issue for CTI or IT helpdesk approval and notifies the group.
- **Custom MCP on Cloud Run (preview):** `apu-vacant-room-mcp` computes vacancy windows from public timetable data and joins them with live readings.

## OnBoard Airtime Guard validation and rollout

- **Research:** interview 6–8 students with multi-hour gaps between classes on 5–6 November.
- **Evaluation set:** 35 real rooms and common areas, across Block B, Block D, the Spine, the library, and the cafeteria, measured from 4 to 7 November, with recommendations checked against the measurements.
- **Owner:** CTI invites students to "suggest new features" and "contribute to APSpace" at `cti@apu.edu.my` ([KB APSpace]).
- **Months 1–3, from the 24 November 2026 intake:** a live Wi-Fi and noise companion to Classroom Finder.
- **Months 4–6, from the 25 March 2027 intake:** daytime congestion heatmaps for the campus network team.

## OnBoard Airtime Guard evidence limits

- **Crowded category:** it sits next to campus navigation (`campus map` 2,506 on Devpost) and AIDA's navigation answers ([past winners]), hence C7 at 3.5 / 5.
- **Timetables miss ad hoc use:** a room free on the timetable may be taken by a club or study group.
- **Microphone permission:** even with no recording, the noise check asks for the mic, which may put students off; keep it optional.
- **Safari has no `navigator.connection`:** iPhones report burst-test results only.

[past winners]: /docs/research/past-winners.md

## See also

- [Argon idea ranking](00-ranking.md)
- [SpineDesk Pulse](01-spinedesk-pulse.md), which uses the same browser probe for classrooms
- [Past winners](/docs/research/past-winners.md) on Devpost crowding

[KB APSpace]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/218792045
