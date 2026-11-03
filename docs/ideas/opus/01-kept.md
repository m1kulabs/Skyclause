# Kept

Kept grades APU's Campus Connect shuttle against its own published schedule every weekday night, and hands the Logistics & Operations shuttle desk dated evidence for each recurring gap. A phone at the stop counts departures on-device: only counts and timestamps leave it, never images or rider locations. A Gemini Enterprise workflow decides which gaps are the operator's to fix and which are the schedule's, files them in Jira, and watches every "fixed" issue until the fix holds. The timing matters: the current schedule (V1_20261022) took effect on 22 October 2026, and the timetable for the week of 2 November releases 77–89 classrooms at 17:45, five minutes after the 17:40 bus leaves.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Day-to-day workflow](#day-to-day-workflow)
    1.  [Connectors and actions](#connectors-and-actions)
    1.  [Cloud, IoT, and network](#cloud-iot-and-network)
    1.  [Real data](#real-data)
1.  [Why people will use it](#why-people-will-use-it)
1.  [Why the crowd won't build it](#why-the-crowd-wont-build-it)
1.  [Scores](#scores)
    1.  [Component scores](#component-scores)
    1.  [Gates](#gates)
    1.  [Strongest objections and answers](#strongest-objections-and-answers)
1.  [Research plan](#research-plan)
1.  [Time to impact](#time-to-impact)
1.  [Demo and review](#demo-and-review)
1.  [Build plan](#build-plan)
1.  [Risks](#risks)
1.  [See also](#see-also)

## At a glance

- **Track:** Intelligent Automation & Digital Transformation ("connecting devices with useful actions").
- **Who it's for:** the Logistics & Operations (LnO) shuttle desk, which handles Campus Connect, and the students who commute on the LRT Bukit Jalil route, especially in the 08:00 and 17:45 waves.
- **Owner (APU office):** Logistics & Operations. **Inference:** no public page names the office that manages the shuttle contract, so the first interview has to confirm the owner; the Accommodation office co-owns the residence routes.
- **Trigger:** weekday schedules (peak checks at 08:00–09:00 and 17:15–18:45, then a nightly run at 22:30); a Jira Cloud event when the desk marks an issue Done; and a Gmail event when someone forwards a complaint or asks for evidence. Stop-counter events land in a Sheet and feed all three.
- **Decision:** for each peak departure that fails, Kept decides whether it is an operator miss, a gap in the schedule's design, or external (road or rain), and then whether to raise it, add evidence to an open issue, or leave it. For each issue the desk closes, it decides whether the fix held.
- **Action and human gate:** Jira issues, comments, and reopens; a Gmail digest and evidence replies; Google Calendar notices for sessions the shuttle can't serve. Each run has one Approval step, and nothing reaches people before a human clicks it.
- **Metric:** the share of observed peak departures kept; riders left behind per evening peak; the desk's minutes per complaint verified; and the share of Done issues still holding after the watch.
- **Weighted score:** 83.5 out of 100 in the [ranking](00-ranking.md); the per-component reasoning in [Scores](#scores) totals 83.

## Problem and evidence

- **The pain, in reviews:** 13 of 58 low-star texts about APU mention the bus, shuttle, taxi, or LRT ([shuttle research]). Examples:
  - "the bus either doesn't come, comes too early, comes too late or when on time it's always full" (Google Maps, 1 star, 13 Nov 2024).
  - "Bus doesn't really adopt to peak hour stacking so expect long queue times at 8am and 5pm" (2 stars, 12 Nov 2024).
  - "the bus shuttle always didn't reach in time" (1 star, 25 Jun 2026) and "Bus Service absolutely tak boleh pakai" (Malay: unusable; 1 star, 25 Sep 2026).
- **On Reddit and TikTok:** a first-week student wrote "bus queues are insane in peak hour" (19 Jul 2025), and another student advised "if you have to be on campus at 9, make sure you're at the station by 820 or 830" (18 Apr 2026) ([Reddit commute research]). A TikTok commenter wrote "the buses are very crowded at peak time" (28 Jul 2026) ([shuttle research]).
- **Late classes and weekends:** the bus runs on weekdays only, and taxi fares to LRT Bukit Jalil rise "up to 50%" in rain (1 star, 25 Apr 2025). APRide, a student ride-share board, exists because late classes and weekends break "the weekday shuttle rhythm" (27 Aug 2026) ([shuttle research]).
- **APU's own schedule disclaims the peaks.** The [shuttle PDF], V1_20261022, says:
  - Buses run on a "first come first serve basis. When the bus is full, it will depart."
  - "APU does not guarantee a seat at all times on every trip", and "during peak times and unusual traffic patterns, the buses may not be able to arrive or depart following the published schedules."
  - From 07:30 to 08:45 the LRT → APU buses "go on a continuous pattern ... and will not follow a schedule".
  - The 20:45 and 21:45 buses from APU to the LRT carry "Limited space only".
- **The timetable shows where the promise and the demand collide.** These counts come from APU's public [timetable feed], fetched at 00:18 MYT on 4 Nov 2026 with lecturer fields dropped. They exclude online sessions, whose room codes start with `ONL` even though most still say "APU CAMPUS" in the location field:
  - **17:45:** in the week of 2 November, 79, 77, 89, and 86 rooms release at 17:45 from Monday to Thursday, 193 to 260 intake groups a day. That is 5 minutes after the 17:40 bus and 15 minutes before the 18:00.
  - **08:30:** 75 to 89 rooms start at 08:30 on the same days, inside the 07:30–08:45 window that has no published times.
  - **Late classes:** between 26 October and 22 November, 134 on-campus sessions end at 20:30 or later (counting each room and start time once): 130 at 21:30, which leaves only the 21:45 "limited space" bus, and 4 at 20:30 or 21:00. No on-campus session ends after the last bus; the 12 sessions that end at 21:45 are all online. The weekday late gap is capacity on one limited bus, not a missing bus.
  - **Weekends:** 122 on-campus sessions fall on weekends, when there is no shuttle, including 60 on 21–22 November.
- **Frequency and intensity:** the problem comes back twice every weekday for every LRT commuter. Students describe being late "even during exam season" and paying more for e-hailing in rain ([shuttle research]).
- **Today's workaround:** arrive early, queue, take Grab, walk, or use APRide. Rapid Bus T580, the only public route that serves both LRT Bukit Jalil and Technology Park Malaysia, runs every 40–50 minutes from 06:00 to midnight, weekends included ([GTFS static research]). The APSpace app's shuttle page was reviewed as one that "keeps on loading with no end" (2023, 7 likes) ([APSpace research]).
- **What the desk has today:** **Inference:** complaints and star reviews, but no dated record of which departure failed, on which days, and why. That leaves the desk without evidence to put to the operator or to use in the next schedule revision.

## How it works

### Day-to-day workflow

The rule throughout: the feeder measures, and Gemini decides. No rider runs a tracking page.

1.  **Stop counter (unattended once mounted):** an old Android phone sits on a clamp at APU's LRT-route boarding point from 16:45 to 18:45 on weekdays. It runs a browser page with MediaPipe's EfficientDet-Lite0 object detector, set to `categoryAllowlist: ["bus"]` at about 2 frames a second ([MediaPipe object detector]).
    - A bus box that stays inside the bay zone for 30 seconds or more counts as a stop, and the moment it leaves counts as a departure; buses passing through are ignored.
    - The page posts `{stop, arrived_at, departed_at, dwell_s, confidence, device_time}` and a 60-second heartbeat to an Apps Script web app. Frames stay in memory and are dropped after inference.
    - From 07:30 to 09:00, a second counter at the LRT Bukit Jalil pick-up grades the unscheduled continuous window by the gaps between departures. During the build week a commuting team member holds it.
2.  **Optional confirm and rider taps:** when someone is at the stop, a one-tap button confirms each detected bus as "LRT shuttle" or "other bus" and can flag "left full".
    - Riders open the same page from a QR card at the queue or a link shared in class chats, pick their stop, and tap "joined queue" and then "boarded".
    - No location permission is asked; the stop comes from the QR code or the button.
    - The ledger counts how many departures the counter saw between a rider's two taps. That number is "buses that left without me".
3.  **Feeder (Apps Script time triggers, no Gemini):**
    - Every minute during the two windows: Rapid Bus KL GTFS-R positions, decoded by a hand-written protobuf reader, giving T580's speed on the Bukit Jalil–TPM segment when a T580 is on it.
    - Every 15 minutes: the Infobanjir rain gauge at LRT Bukit Jalil and MET warnings.
    - Daily at 06:00: the shuttle PDF's ETag and the timetable feed, reduced to release and start waves per 5 minutes plus the sessions that end after 19:15 or fall on weekends. Rooms coded `ONL` are online and dropped, because the location field still says "APU CAMPUS" for most of them.
    - A failed fetch writes an error row with its HTTP status, never the last value.
    - A Sheet formula matches observed departures to scheduled ones, using tolerances from an editable rule tab, and labels each departure kept, late, early (full), missed, or not observed. "Not observed" covers counter heartbeat gaps and anything outside the windows, and it never counts as kept.
4.  **Peak checks (Gemini Enterprise workflow, weekday schedule at 08:00, 08:30, 09:00, 17:15, 17:45, 18:15, 18:45):** each check reads the last 30 minutes of the ledger.
    - If no LRT shuttle has left for more than 15 minutes in the continuous window, or two scheduled departures in a row are unmatched, it drafts a one-paragraph alert for the desk.
    - If a counter goes silent for more than 5 minutes, it alerts the team instead of the desk.
    - When no rule fires, the run ends with no writes and no approval.
5.  **Nightly decision (workflow, weekdays at 22:30):** the run reads the day's verdicts, the last ten observed weekdays, the timetable waves, T580 speeds, rain, the rule tab, and the open Jira issues.
    - **Classify:** each departure or slot that failed on 3 or more of the last 5 observed days becomes one of three kinds. An _operator miss_ is a bus absent or late on a normal road with no rain. A _design gap_ is a bus that ran on time or left early and full while a release wave was still arriving. _External_ means the road was slow or it rained.
    - **File or add evidence:** a new issue, or a comment with fresh evidence on the open one.
    - **Apply the late-and-weekend rule:** every Friday, list next week's sessions that end after 19:15 or fall on a weekend. For example, "30 sessions on Sat 21 Nov, no shuttle; T580 from TPM Carpark about every 50 min". Then draft one service-gap issue for the desk and Calendar notices for students.
    - **Apply the watch:** for every issue under watch, check tonight's departure. One failure reopens the issue; five observed passes close it as held.
    - **One Approval step,** then the writes: Jira create, comment, and status; one Gmail digest; Calendar events.
6.  **Done event (workflow, Jira Cloud event trigger, polled every 5–10 minutes):** when the desk moves a Kept issue to Done, the workflow reads that departure's last five observed days and drafts a "Watch opened" comment with the baseline. After one approval, the nightly run takes over.
7.  **Evidence request (workflow, Gmail "When an email is received"):** the desk forwards a complaint, or anyone emails "evidence 5 Nov 17:00–18:45" or "status 17:40". The workflow reads the ledger and drafts a reply with the verdict table, counter coverage, and attribution, and one approval sends it.

What runs unattended: counting, buffering, polling, matching, every peak check that finds nothing, and every reading, deciding, and drafting step. The human gate is one Approval per run that writes, which comes to about 1–3 clicks a day for the desk.

Platform check against the research, as of November 2026:

- **Schedules:** workflows run on cron with a time zone, only in multi-region locations such as global. Credentials expire every 14 days, so refresh them on 10 Nov, which covers 11–24 Nov ([GE triggers], [GE unattended]).
- **Event triggers:** Jira Cloud and Gmail are documented event-trigger connectors that poll with a 5–10 minute delay ([GE triggers]). The live trigger page, fetched on 4 Nov, says events are chosen "by category" with filters but doesn't list Jira's event names.
  - Day-one check: open **Preview results** on the Jira trigger.
  - Fallback: the nightly run searches Jira for issues resolved since the last run, so the watch never depends on the event.
- **Reads:** the Drive connector, with Sheets **Get cell values** (GA since 12 October 2026), reads the ledger, schedule, and rules live; nothing is ingested ([GE actions], [GE freshness]).
- **Writes:** Jira Create issue, Create comment, and Change issue status; Gmail Send and Reply; Calendar Create event. All are GA actions ([GE actions]).
- **Approval:** connector writes "require human review", and scheduled runs that affect others pause for approval ([GE unattended]). Add the Approval step in the visual editor, because natural language can't add one ([GE limits]). Whether each write after the Approval step asks again is unverified ([GE data unverified]).
- **No webhook:** the counter can't start a workflow directly, so schedules read the Sheet it writes ([GE triggers]).
- **Quotas:** about 10 runs on a weekday against 160 assistant queries per user per day on Standard. Event runs that fail with `RESOURCE_EXHAUSTED` aren't retried, and the nightly sweep catches what they missed ([GE limits], [GE unattended]).

### Connectors and actions

| Connector                        | 1P/3P/MCP               | Mode                                                                                                 | Job                                                                                        |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Google Drive (Sheets actions)    | 1P                      | Read: federated search, Get cell values                                                              | Ledger of counter events, taps, and feed rows; the schedule; the rule tab; timetable waves |
| Gmail                            | 1P                      | Trigger: when an email is received; write: Send, Reply                                               | Complaints and evidence requests in; the nightly digest, peak alerts, and replies out      |
| Google Calendar                  | 1P                      | Write: Create event                                                                                  | Late-class and weekend no-shuttle notices on a subscribable calendar                       |
| Jira Cloud (Free, 10 users)      | 3P                      | Trigger: issue moved to Done; read: search; write: Create issue, Create comment, Change issue status | Gap issues with evidence, the watch, and reopen or close                                   |
| Apps Script web app and triggers | Feeder, not a connector | Writes the Sheet                                                                                     | Counter events, taps, GTFS-R, rain, MET, and the PDF and timetable snapshots               |

- **No MCP on the critical path:** the Custom MCP Server data store is a preview feature and blocked by a default organisation policy ([GE MCP]). Every job above has a GA connector.
- **Why Jira:** APU runs its Virtual Help Centre on Jira Service Management ([APU systems]), so Jira Cloud Free mirrors the system the desk would actually use.
- **What changes on APU's Microsoft 365 stack:** the workflow, its rule tab, and its decisions carry over unchanged; the connectors and the feeder's sink change.
  - Gmail becomes Outlook, with Outlook's event trigger and Send mail.
  - Google Calendar becomes Outlook calendar events.
  - The Sheet ledger becomes a SharePoint list (Create and Update list item), fed by an Entra-registered Microsoft Graph client in place of Apps Script.
  - The nightly digest goes to an LnO Teams channel.
  - The Jira Free site becomes an LnO request type in APU's own Jira Service Management, through the same Jira Cloud connector and the same Done trigger.
  - Sign-in moves to Entra ID through Workforce Identity Federation ([GE reviewer access]).
  - **Inference:** this is configuration plus one ingest function, not a rewrite. The Microsoft 365 developer sandbox is closed to most students and ships sample data, so the team can't demonstrate this stack this week ([GE sandboxes]).

### Cloud, IoT, and network

The sensor design answers three objections to crowd-sourced rider GPS: too few riders per departure, riders who stop after a week, and PDPA consent for continuous tracking.

- **The unit of observation is the stop, not the rider.** While a counter is up, it sees every departure in its window, so coverage no longer depends on how many riders opt in.
  - **Evening:** 12 scheduled APU → LRT departures, 16:45–18:45.
  - **Morning:** six 15-minute slots, 07:30–09:00, in the window with no published times.
  - **Totals:** 18 verdicts per weekday and 54 across 5, 6, and 10 November.
  - Departures outside the windows read "not observed (outside window)" and never enter the kept rate. The report always prints coverage as observed out of published.
- **No rider is the sensor.** The counters are fixed phones. Rider taps add wait times and "left behind" counts, and their sample size is printed next to each figure.
- **No rider location is collected.** The QR code or the button supplies the stop. Taps carry a random device token that rotates daily, with no name, student ID, phone number, or location.
- **Cloud:** four Gemini Enterprise workflows (peak check, nightly, Done event, evidence request) with their Runs tabs, plus the Apps Script feeder and the Sheet ledger. A reviewer sees the owner's Runs tab over 5–10 November, with traces that show the ledger rows read, the rule fired, and the draft held for approval ([GE runs]).
- **IoT:** the stop counter is the measuring instrument. It runs edge inference with a bus-only allowlist, so only counts and timestamps leave the phone: the privacy-conscious split of detecting on the device and deciding in the cloud ([IoT edge]).
  - Two public sensors back it up: the GPS transponders on Rapid Bus T580 (road speed on the same corridor) and DID's telemetry rain gauge at LRT Bukit Jalil, at the morning stop itself.
  - A reviewer sees the counter page with a live box around the bus, a "frames are never saved" notice, and the event row landing.
  - Sound counting was considered and rejected: road noise at Bukit Jalil swamps it, and on-device audio near a queue raises more privacy questions than vision aimed at a bus bay.
- **Network:** the counters send over mobile data, because campus Wi-Fi enrolment for headless devices is unknown ([IoT Wi-Fi]). Each event carries device time and server receipt time, so its latency shows in the ledger ([IoT network]).
  - Events queue in IndexedDB while offline and arrive flagged "late upload" with their original time.
  - A missing heartbeat turns a window into "counter down 17:52–18:04" instead of "missed".
  - Feed failures stay visible as error rows with HTTP status.
  - A reviewer sees the latency column, an airplane-mode test, and the "counter down" rows in the nightly verdict table.

### Real data

Smoke tests ran on 4 Nov 2026 between 00:17 and 00:28 MYT; raw responses are kept with the build notes.

| Source                              | Live or replayed | Cadence                        | Licence or terms                                          | Smoke test result on 4 Nov 2026                                                                                                                                 |
| ----------------------------------- | ---------------- | ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Campus Connect PDF][shuttle PDF]   | Live             | ETag checked daily             | APU Terms of Use; written permission needed               | 200, 1,090,815 B, Last-Modified 23 Oct 2026; V1_20261022; LRT → APU continuous 07:30–08:45, then 39 fixed; APU → LRT 39, last two "Limited space only"          |
| [Shuttle page]                      | Live             | Daily                          | APU Terms of Use                                          | 200; links only the V1_20261022 PDF and a banner "Updated on 21 October 2026"                                                                                   |
| [Shuttle schedule API][transix]     | Live             | Daily                          | APU Terms of Use; written permission needed               | 200 at 00:54 MYT: schedule set "WEF 22 Oct 2026" with 253 trips as JSON, matching the PDF; the older v1 `transix` paths return 403                              |
| [Timetable feed][timetable feed]    | Live             | Daily                          | APU Terms of Use; drop `NAME`, `SAMACCOUNTNAME`, `LECTID` | 200, 1,138,362 B gzip, Last-Modified 28 Oct 2026; 31,606 rows, 9,621 on-campus sessions plus 205 with `ONL` online room codes, 26 Oct–22 Nov; none on Mon 9 Nov |
| Stop counters and taps              | Live             | Per event, 60 s heartbeat      | Team-owned phones; notice at the stop                     | Not built yet; detector model returned 200, 4,602,795 B, with `bus` in its label map; `@mediapipe/tasks-vision` 1.2.0 (Apache-2.0)                              |
| [GTFS-R Rapid Bus KL][gtfsr]        | Live             | Each minute in the two windows | CC BY 4.0, 4 requests a minute                            | 200, 124 B at 00:21; one vehicle (T3018); T580 not in service at that hour; decoded by a 60-line hand-written reader                                            |
| [GTFS static Rapid Bus KL][gtfss]   | Live             | Daily                          | CC BY 4.0                                                 | 200, 1,697,052 B; T580 runs 06:00–06:40 every 40 min and 07:30–23:20 every 50 min, weekdays and weekends                                                        |
| [MET warnings]                      | Live             | 15 min                         | CC BY 4.0                                                 | 200, 3 items, including a Thunderstorms Warning issued 23:50, valid 23:00–04:00                                                                                 |
| [Infobanjir rain gauge][infobanjir] | Live             | 15 min                         | No terms found                                            | 200; station 0232901RF "SG. KUYOH DI LRT BUKIT JALIL" updated 04/11/2026 00:15                                                                                  |
| [Jira Cloud Free][jira pricing]     | Live sandbox     | Per issue                      | Atlassian terms; holds only issues Kept creates           | Pricing page 200: "Free forever for 10 users"                                                                                                                   |

[transix]: https://api.apiit.edu.my/transix-v2/schedule/active

- **The schedule is current:** the shuttle page links only the V1_20261022 PDF, its banner says "Updated on 21 October 2026", and the PDF hasn't changed since 23 October. When the ETag changes, the nightly run pauses verdicts for the affected routes and drafts the new schedule rows from the PDF for approval.
- **Holidays:** the rule tab lists no-service days. The timetable's empty 9 November confirms the Deepavali replacement holiday, so the run doesn't grade a holiday as 39 misses.
- **No replays:** the system makes no replay claims; every row comes from a live source or a live phone, as the [data ruling] allows.

[gtfsr]: https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana/?category=rapid-bus-kl
[gtfss]: https://api.data.gov.my/gtfs-static/prasarana/?category=rapid-bus-kl
[MET warnings]: https://api.data.gov.my/weather/warning/
[infobanjir]: https://publicinfobanjir.water.gov.my/rainfalldata/Wilayah%20Persekutuan%20Kuala%20Lumpur
[jira pricing]: https://www.atlassian.com/software/jira/pricing

## Why people will use it

- **The desk's habit loop:** a complaint arrives, the desk forwards it to Kept, and a dated evidence reply comes back within about 10 minutes for one approval click.
  - On Monday the digest lists the week's recurring gaps.
  - The desk works the Jira queue it already understands, and the watch tells it whether a fix held without anyone checking by hand.
  - The channel is email plus Jira, the shape of APU's Outlook and Jira Service Management stack ([APU systems]).
- **The riders' loop:** nothing to install and nothing to keep running.
  - At the queue, a QR scan shows "last LRT shuttle left 6 min ago; 2 of the last 5 left full", read live from the ledger.
  - Evening and weekend students subscribe once to a calendar that only carries "no shuttle for this session" notices, each with the T580 fallback. It works in Google Calendar or Outlook.
- **Why the desk would want it:** **Inference:** dated, attributed evidence is what a desk needs to raise a departure with the operator, or to defend a schedule change, and today it has only reviews.
- **After the team graduates:**
  - LnO owns the workflow and the rule tab.
  - The evening counter becomes a fixed mount at the APU bay, with mains power and its own SIM, on APU property.
  - The morning counter is replaced by a phone in each operator cab (geofence events only) if the operator agrees, or by APSpace's own tracking feed if LnO can share it. APU's knowledge base says APSpace lets users "keep track of bus shuttle location ... in real-time" ([APSpace KB]).
  - GDGoC APU maintains the open-source counter page.

[APSpace KB]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/218792045

## Why the crowd won't build it

- **Shuttles are absent from the crowd's ideas:** "Shuttle, bus or parking" is 0.5% of 780 simulated ideas, and those are GPS trackers on a Pub/Sub and BigQuery stack ([crowd clusters], [crowd tiers]). Devpost holds 79 `campus shuttle` and 15 `shuttle tracker` matches ([crowd counts]).
- **The crowd's structural misses:** only 1% of simulated ideas combine an unattended run, a named owner, and a measured baseline, and only 3% use public feeds ([crowd misses]). Kept is built on all four.
- **APU rivals, rechecked on 4 Nov 2026:**
  - `nacyng-netizen/apu-smart-shuttle` is a README for a GPS tracker with ETAs, last pushed 1 November at 4 KB, with no Gemini Enterprise part ([crowd repos]).
  - `Kibbs-dibs/BUSSYSTEM`, last pushed 22 July 2026, is a shuttle management system with YOLOv8 occupancy, LSTM demand forecasting, and complaint NLP ([crowd APU tools]).
  - APSpace already offers tracking.
  - All three answer "where is the bus". None grades the published schedule or closes a loop with the office that holds the contract.
- **Crowd check, 4 Nov 2026:** GitHub searches found campus shuttle trackers (Flutter, MQTT, PassioGO wrappers), a manual-observation reliability study at NIT Calicut, and the UChicago shuttle performance tracker. None counts departures at the stop on-device, and none runs an unattended grade against the published schedule with an issue-and-watch loop. A Devpost web search found no shuttle schedule-adherence project.
- **Name:** six consumer apps are called "Kept" (home inventory, notes, medication reminders, collectibles, productivity, home maintenance), none in transit or campus operations, and the simulated crowd's repeated names ("CampusPulse" and other "Pulse" names) don't include it ([crowd names]). Pitch it as "Kept: Campus Connect, departure by departure".

## Scores

### Component scores

| Component                                  | Weight | Score | Reason                                                                                                                                                                                    |
| ------------------------------------------ | -----: | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact on students, university, operations |     15 |     4 | Every LRT commuter, twice a weekday; a named desk gets dated evidence; whether LnO acts is unproven                                                                                       |
| Technical build: 1P and 3P connectors      |     15 |     4 | Drive (Sheets), Gmail, Calendar, and Jira Cloud each do real reads, writes, or triggers; no MCP                                                                                           |
| Research depth                             |     10 |     5 | Riders at the stop every day; a stopwatch baseline tonight; the verified schedule yields 36 labelled items by 6 Nov and 54 by 10 Nov                                                      |
| Time to impact                             |     10 |     3 | Evidence exists after three evenings, but a 3-month change needs LnO's yes and a fixed mount, both unconfirmed                                                                            |
| Day-to-day automated workflow              |     15 |     5 | 8 scheduled runs a weekday, two event entry points, a Done → watch → reopen loop, one approval per run; every trigger and action documented, with a fallback for the one unverified event |
| Theme: Cloud + IoT + Network               |     10 |     4 | Edge-inference counter, bus GPS, and a rain gauge; buffered events and heartbeats; covers two windows a day, not the whole day                                                            |
| Originality                                |     10 |     4 | Nobody grades the published promise; two APU shuttle repos and APSpace track buses, so the topic isn't empty                                                                              |
| Real usage after the hackathon             |     10 |     4 | No rider habit needed; email, Jira, and calendar channels the users already have; a fixed counter still needs LnO                                                                         |
| Demo and pitch clarity                     |      5 |     4 | A bus leaves, a verdict lands, an issue is filed, Done reopens it; a reviewer can fire it                                                                                                 |

Weighted total: 12 + 12 + 10 + 6 + 15 + 8 + 8 + 8 + 4 = **83 / 100**.

### Gates

- **Real public data only: pass.**
  - Every row comes from a live public feed or a team-owned live phone, both allowed by the [data ruling].
  - Failed sources write error rows, and no images or biometrics leave the counter.
  - Still to do: ask the organisers for written permission to use the shuttle PDF and the timetable feed under APU's Terms of Use.
- **Buildable by 10 Nov inside Gemini Enterprise limits: pass.** No webhook is needed, approvals are designed in, and the plan stays within quotas and the 14-day credential refresh. The counter is a phone page and a public model, with no hardware order.
- **Core lives in Gemini Enterprise: pass.** Every decision is made in workflows: classification, raise or comment or ignore, the late-and-weekend gaps, and whether a closed issue held. The departure match is a Sheet formula on purpose, so the desk can audit the measurement.
- **IoT real and visible: pass.** On-device detection at the stop with live events, plus bus GPS and the rain gauge.
- **Users and owner reachable, with 30–50 real items, by 10 Nov: pass on users and items; owner conditional.**
  - Riders are at the stop every weekday, and the windows yield 36 items by 6 Nov.
  - The LnO desk is on campus but hasn't been contacted yet.
- **Reviewer self-trigger: pass.** A Jira Done on an invited seat, or an evidence email (see [Demo and review](#demo-and-review)).
- **No-card path: pass.** Apps Script, Sheets, Jira Free, GitHub Pages, and phones. This assumes the licence sits in a Workspace domain.

### Strongest objections and answers

- **"With too few riders per departure, most verdicts read 'unobserved'."** Answered.
  - The counter at the stop observes every departure in its window regardless of riders.
  - Coverage is scoped to the two peaks, where the complaints are, and printed as observed out of published.
  - Outside the windows, departures are "not observed" and excluded from the kept rate rather than diluting it.
- **"Riders stop running a GPS page after a week."** Answered: no rider runs anything. Taps are optional enrichment, and their sample size is printed.
- **"Continuous rider GPS needs explicit PDPA opt-in."** Answered: no location is collected.
  - Camera frames never leave the counter, and the detector's allowlist keeps only buses.
  - Taps are anonymous, and raw taps are deleted after 30 days.
  - **Inference:** that leaves little or no personal data to process, but the design still shows a notice and a retention rule ([PDPA research]).
- **Impact: "A student audit won't change a contracted bus schedule."** Partly answered.
  - APU does revise the schedule: the current one is dated 22 October, and a 2024 review notes "more shuttle times were added".
  - Kept ties each gap to a timetable wave the desk can act on, such as moving the 17:40 to 17:50.
  - Conceded: impact depends on LnO acting.
- **Connectors: "Gmail and Google Calendar aren't APU's stack, and Jira Free is a stand-in."** Answered: the Microsoft 365 mapping is a connector swap, and Jira matches APU's Virtual Help Centre. Conceded: there is no MCP server.
- **Gemini core: "The verdict is a spreadsheet formula and Gemini just writes it up."** Partly conceded.
  - Matching is deliberately deterministic, so the desk can audit it.
  - Classifying a gap, deduplicating against open issues, the late-and-weekend rule, and the watch verdict are Gemini's decisions, and they are scored by precision and recall.
- **Workflow: "It waits for approval, so it isn't 24/7."** Answered.
  - Watching, matching, and drafting run unattended for days, and peak checks that find nothing write nothing.
  - The click is one per writing run, which the platform requires anyway ([GE unattended]).
- **Theme: "One phone at one bay isn't IoT, and bus GPS is someone else's sensor."** Partly conceded: it covers two windows, not the day. Answered: the phone does edge inference, the hop is buffered and timed, and a fixed mount or cab phones extend coverage.
- **Usage: "Who keeps the counter running in March?"** Conceded until LnO mounts it at the bay. Until then, a commuting student holds the morning counter, which costs one person a day instead of ten riders a peak.
- **Time to impact: "No office has said yes."** Conceded; scored 3. The plan names the yes it needs and when.
- **Demo: "Async reviewers can't stand at a bus stop."** Answered: the video is recorded from the live counter and Runs tab, and reviewers fire the Jira or email trigger themselves.

## Research plan

- **Who to interview: 6–8 people in two rounds**, Mom Test style, about the last real time it happened ([interview method]).
  - **Round 1 (5–6 Nov):** three riders in the 17:45 queue at APU and one rider from the 08:00 window at LRT Bukit Jalil. One LnO shuttle-desk staff member, asked at the LnO counter: "The last complaint about a departure: how did you check it, how long did it take, what did you tell the operator?" The author of the BUSSYSTEM project, an APU student who has studied the shuttle.
  - **Round 2 (7–9 Nov):** one student whose class ends at 21:30, one with weekend classes, and a second LnO session with the first evidence pack, to agree tolerances in the rule tab.
- **Timed baselines:**
  - **Riders, 4 Nov 16:45–18:45 at APU's LRT boarding point, before anything is built:** two observers log every departure (time, full or not, a rough count left behind), and three teammates time their own wait from joining the queue to boarding.
  - **Morning, 5 Nov 07:30–09:00 at LRT Bukit Jalil:** the same, by gaps.
  - **Desk:** minutes to verify one complaint today, observed if possible and otherwise reported, labelled as such ([baseline method]).
- **Precision and recall on 30–50 real items** ([accuracy method]):
  - **Items:** the 12 scheduled evening departures and 6 morning slots on 5 and 6 Nov, 36 in all, scored on 7 Nov. Add 10 Nov for 54.
  - **Positive class:** "failed" means not seen within +15 minutes, left full with riders behind, or a gap of more than 15 minutes in the continuous window. Recall leads, because a missed failure costs more than a false alarm.
  - **Ground truth:** two observers log each window independently, and disagreements are recorded.
  - **Detector level:** every bus event, detected against observed, gets its own precision and recall to separate counter errors from rule errors.
  - **Report:** the confusion matrix, precision, recall, n, and Wilson 95% intervals, with the date tested.

[interview method]: /docs/research/judging.md#interviews
[baseline method]: /docs/research/judging.md#baseline-and-before-and-after-metric
[accuracy method]: /docs/research/judging.md#measuring-an-agents-accuracy-honestly

## Time to impact

The plan follows GOV.UK's discovery, alpha, and beta phases ([delivery phases]).

- **By 3 months (early February 2027):**
  - The LnO desk owns the workflow and the rule tab, and receives the weekly digest.
  - A fixed counter covers the APU bay from 07:30 to 19:15, grading all 39 APU → LRT departures.
  - Complaints are verified by forwarding.
  - The next schedule revision after V1_20261022 has dated evidence for at least the 17:40/17:45 collision.
  - The calendar carries every late-class and weekend gap.
- **Measured by 6 months (May 2027), against the 4–6 Nov baseline:**
  - The kept rate of peak departures and riders left behind per evening peak.
  - The median wait in the 17:45 wave.
  - The desk's minutes per complaint verified.
  - The share of Done issues that held after the watch.
  - Precision and recall, re-measured monthly on 30 departures.
  - Cab phones or APSpace's tracking feed replace the morning counter.
  - The stack moves to Outlook, SharePoint, and APU's Jira Service Management.
- **Owners:** the LnO shuttle desk (business owner), APU ICT (connectors, seats, Microsoft 365), APU's data protection officer (notice and retention), and the team, then GDGoC APU (counter page).
- **Assumptions:**
  - LnO says yes in round 1 or 2, and facilities allow a mount at the bay.
  - The operator agrees to cab phones, or LnO can share a tracking feed.
  - A Gemini Enterprise seat continues after the sponsored trial.
  - APU grants written permission for the PDF and the timetable feed.

[delivery phases]: /docs/research/judging.md#mapping-3-and-6-months-to-delivery-phases

## Demo and review

Video beat sheet, about 3:45, with the demo and the impact inside the first three minutes ([minute plan]):

1.  **0:00–0:15:** slate, "Recorded 5–10 Nov 2026 from the live system", and the one-liner.
1.  **0:15–0:40:** the 17:45 release (89 rooms on 4 Nov) against the 17:40 bus, a rider quote, and the 4 Nov stopwatch baseline.
1.  **0:40–1:20:** the counter at the bay draws a box on a bus, which leaves; the row lands with device and server time. In airplane mode the next event queues, then arrives flagged "late upload".
1.  **1:20–2:00:** the nightly Runs tab trace: it reads the ledger, classifies 17:40 as a _design gap_ (on time, left full, 89 rooms released 5 minutes later), and drafts an issue. The approval click, then the Jira issue and the digest email.
1.  **2:00–2:30:** the desk marks the issue Done; 10 minutes later "Watch opened"; the next night the 17:40 leaves full again and the issue reopens.
1.  **2:30–3:00:** precision and recall with n, before and after, and the 3- and 6-month plan with owners.
1.  **3:00–3:30:** the research methods and what changed because of them, and how the team worked.
1.  **3:30–3:45:** the app URL, how to request access, the repo, and the capture date again.

How a reviewer triggers it, during 11–14 Nov with approvals answered 08:00–24:00 MYT:

- **Jira (primary):** reviewers are invited to the team's Jira Free site, using 2 of its 10 seats, and to the Gemini Enterprise app. They open any open Kept issue and move it to Done.
  - Within 10 minutes the Done-event workflow drafts "Watch opened" with the last five observed days, and a teammate approves it.
  - That night's run checks the departure and comments, or reopens the issue on its first failure.
- **Email (no Jira seat needed):** reviewers send "evidence 11 Nov 17:00–18:45" to the Kept inbox and get the verdict table back after one approval.
- **As a shared user:** reviewers run the shared evidence workflow from chat with a date and window, and see their own run's trace ([GE sharing]). This needs read access to the Sheet; test it with a non-team account on 9 Nov, because federated Drive search only covers the searcher's own domain ([GE account limits]).
- **Network check:** reviewers open the stop page with `?stop=REVIEW` and tap. The row lands with its latency, is tagged test, and is excluded from every metric.

[minute plan]: /docs/research/judging.md#minute-plan

## Build plan

The riskiest pieces come first: the licence and the Jira event, then counter accuracy, then reaching LnO.

| Day        | Work                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wed 4 Nov  | Ask the organisers about the licence account type and permission for the PDF and timetable; ask LnO for an interview and a spot at the bay. Create the Jira Free site; once the licence lands, test the Jira Done trigger's **Preview results** first. Build the Apps Script ledger and counter page v0 on GitHub Pages. Run the stopwatch baseline at 16:45 |
| Thu 5 Nov  | Counters live at 07:30 (LRT) and 16:45 (APU bay) with two observers logging ground truth. Feeder for GTFS-R (hand decoder), rain, and MET. Nightly workflow v1, reading and drafting only. Interview round 1                                                                                                                                                 |
| Fri 6 Nov  | Second counted day. Add the Approval step, Jira create and comment, the Gmail digest, and the peak-check schedules; the late-and-weekend rule with Calendar. Interviews continue                                                                                                                                                                             |
| Sat 7 Nov  | Score precision and recall on the 36 items, then tune the dwell, zone, and tolerance values. Run the Done → watch → reopen loop end to end on a real issue. Interview round 2; README draft                                                                                                                                                                  |
| Sun 8 Nov  | Deepavali. README, deck, and diagram. Confirm every member has registered before registration closes                                                                                                                                                                                                                                                         |
| Mon 9 Nov  | Holiday, with no classes in the timetable; the run must grade it as a no-service day. Record the video, test reviewer access with a non-team account, refresh schedule credentials                                                                                                                                                                           |
| Tue 10 Nov | Count both windows; submit early in the day; keep everything running through 14 Nov with an approval rota                                                                                                                                                                                                                                                    |

- **No-card path:** phones, the public MediaPipe model, and a counter page on GitHub Pages. GitHub Pages gives a top-level HTTPS page for camera access; camera access inside Apps Script's sandboxed iframe is unverified.
  - Readings go to Apps Script and a Sheet in the licensed Workspace domain, then to Jira Cloud Free.
  - **Inference:** the counter posts `text/plain` to `doPost` to avoid a CORS preflight. A 10,000 mAh power bank covers a two-hour window.
- **Fallback for the timetable reduction:** if Apps Script can't parse the 17 MB feed in one run, a free GitHub Actions job reduces it to a small waves file once a day.

## Risks

- **The owner doesn't engage:** the desk is unconfirmed as owner and may not answer by 6 Nov. Mitigation: ask on 4 Nov in person at the LnO counter. The evidence still builds in the team's Jira, and rider interviews and items don't depend on LnO; state the gap honestly in the README.
- **Privacy (PDPA):**
  - Frames are processed in memory and never stored or sent, the allowlist keeps only `bus`, and there is no face or person detection, so no biometric data is involved.
  - A printed notice sits at each counter, and the camera is framed on the bay rather than the queue.
  - Taps carry anonymous, daily-rotating tokens; raw taps are deleted after 30 days, and only aggregates are kept.
  - Prompts never contain personal data, and timetable lecturer fields are dropped at ingest.
  - Cab phones would log stop geofence events only, under the operator's notice to its drivers.
  - **Inference:** PDPA covers commercial transactions, so a student prototype likely sits outside it, but an APU deployment wouldn't, so the DPO signs off before the 3-month step ([PDPA research]).
- **Permissions (APU Terms of Use):** APU reserves copyright over its site contents and asks for permission before use ([APU terms]). Mitigation: written permission from the organisers for the PDF and timetable feed; store each file's URL and fetch time. For the camera at the bay, ask LnO. Until permission comes, the counter is handheld by a rider in the queue, and the LRT counter stands on the public footpath.
- **Detector errors:** glare, rain, night, and other operators' buses at the LRT pick-up. Mitigation: bay zone, dwell threshold, the one-tap confirm, and published detector-level precision and recall. Unconfirmed detections are counted separately.
- **The operator's disclaimers:** the PDF calls times "estimated" and allows full buses to leave early. Mitigation: early-and-full departures count as a capacity signal, not an operator fault; tolerances are agreed with the desk; T580 speed and rain attribution keep verdicts fair to the operator.
- **Platform limits:**
  - Jira event names are unlisted, so check them on day one; the nightly JQL sweep is the fallback.
  - Approvals pause every write, so run a published rota during assessment.
  - The 14-day credential expiry is handled by refreshing on 10 Nov.
  - Quota-failed event runs aren't retried, and the nightly sweep covers them.
  - Reviewers outside the domain may not read the Sheet through Drive; test on 9 Nov and fall back to the Jira and email triggers.
  - A licence on consumer accounts would break Drive and Gmail; ask the organisers on 4 Nov.
- **Feeds fail during assessment:** error rows show the HTTP status, and the verdict says "not observed", never a cached value. Infobanjir publishes no terms, and the T580 reading is sparse at a 50-minute headway; both are attribution context, not the verdict.
- **A rival APU shuttle entry:** a public APU shuttle-tracker repository already exists ([crowd baseline](/docs/research/competition.md#public-repositories-so-far)), so expect at least one tracker entry. Pitch the difference in the first 15 seconds: Kept grades the promise and closes the loop with the desk.

[APU terms]: /docs/research/apu.md#terms-of-use-and-robotstxt

## See also

- [Shuttle buses and the LRT last mile][shuttle research], [Reddit commute research], and [X: getting to class](/docs/research/social.md#getting-to-class-campus-buses-shuttles-and-the-lrt): the social evidence.
- [Crowd baseline](/docs/research/competition.md): clusters, rivals, and the APSpace app.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise.md#data-in-and-out): triggers, approvals, connectors, sandboxes, and reviewer access.
- [Public data sources](/docs/research/data-sources.md): GTFS, MET, and Infobanjir.
- [IoT and network](/docs/research/iot-and-network.md): browser sensors, edge processing, and what reviewers can see of the network.
- [APU public documents](/docs/research/apu.md): the shuttle PDF, APU's systems, and terms.
- [Research and impact](/docs/research/judging.md) and [judging and pitching](/docs/research/judging.md): methods, the README, the video, and PDPA.
- [Campus Connect schedule V1_20261022][shuttle PDF], the [shuttle page][Shuttle page], and the [MediaPipe object detector guide][MediaPipe object detector].

[shuttle research]: /docs/research/social.md#shuttle-buses-and-the-lrt-last-mile
[Reddit commute research]: /docs/research/social.md#getting-to-campus-shuttle-lrt-bukit-jalil-and-traffic
[GTFS static research]: /docs/research/data-sources.md#routes-and-stops-near-apu-gtfs-static
[APSpace research]: /docs/research/competition.md#the-official-apspace-app
[APU systems]: /docs/research/apu.md
[GE triggers]: /docs/research/gemini-enterprise.md#triggers-and-schedules
[GE unattended]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in
[GE limits]: /docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build
[GE runs]: /docs/research/gemini-enterprise.md#run-history-as-evidence
[GE sharing]: /docs/research/gemini-enterprise.md#agent-gallery-and-sharing
[GE reviewer access]: /docs/research/gemini-enterprise.md#what-each-reviewer-needs
[GE actions]: /docs/research/gemini-enterprise.md#actions-and-write-back
[GE freshness]: /docs/research/gemini-enterprise.md#federated-search-versus-ingestion
[GE account limits]: /docs/research/gemini-enterprise.md#edition-and-account-limits
[GE MCP]: /docs/research/gemini-enterprise.md#requirements-and-registration
[GE sandboxes]: /docs/research/gemini-enterprise.md#free-sandboxes
[GE data unverified]: /docs/research/gemini-enterprise.md#not-verified
[IoT edge]: /docs/research/iot-and-network.md#edge-versus-cloud-processing
[IoT network]: /docs/research/iot-and-network.md#what-a-judge-can-see-of-the-network
[IoT Wi-Fi]: /docs/research/iot-and-network.md#apu-campus-wi-fi
[crowd clusters]: /docs/research/competition.md#clusters-and-shares
[crowd tiers]: /docs/research/competition.md#saturation-tiers
[crowd counts]: /docs/research/competition.md#crowding-counts
[crowd misses]: /docs/research/competition.md#what-the-crowd-structurally-misses
[crowd repos]: /docs/research/competition.md#public-repositories-so-far
[crowd APU tools]: /docs/research/competition.md#repositories-and-adoption
[crowd names]: /docs/research/competition.md#name-collisions
[shuttle PDF]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf
[timetable feed]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[MediaPipe object detector]: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js
[Shuttle page]: https://www.apu.edu.my/shuttle-services-campus-connect
[data ruling]: /docs/CONTEXT.md#decisions-so-far
[PDPA research]: /docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment
