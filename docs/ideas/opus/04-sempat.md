# Sempat

Sempat (Malay for "make it in time") uses students' phones to measure how long APU's class changes really take, in lifts and on stairs, then checks every week of timetable APU publishes against those times before anyone has to live it. When a transfer won't fit, the students affected get a calendar warning with the faster route, and APU's Schedulers office gets a cheap room swap to fix it. Airlines never sell a connection shorter than the airport's minimum connecting time, yet in the week of 2–8 November APU's timetable gave intake groups 1,441 room-to-room transfers, almost all of exactly 15 minutes, and nobody has measured whether 15 minutes is enough.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Day-to-day workflow](#day-to-day-workflow)
    1.  [Connectors and actions](#connectors-and-actions)
    1.  [Cloud, IoT, and network](#cloud-iot-and-network)
    1.  [How few measurements are enough](#how-few-measurements-are-enough)
    1.  [Real data](#real-data)
1.  [Why people will use it](#why-people-will-use-it)
1.  [Why the crowd won't build it](#why-the-crowd-wont-build-it)
1.  [Scores](#scores)
    1.  [Component scores](#component-scores)
    1.  [Gate results](#gate-results)
    1.  [Strongest objections](#strongest-objections)
1.  [Research plan](#research-plan)
1.  [Time to impact](#time-to-impact)
1.  [Demo and review](#demo-and-review)
1.  [Build plan](#build-plan)
1.  [Risks](#risks)
1.  [See also](#see-also)

## At a glance

- **Track:** Intelligent Automation & Digital Transformation.
- **Who it's for:** students in the 677 of 931 intake groups (those with two or more sessions on a day that week) that had at least one 15-minute transfer between physical rooms in the week of 2–8 November, especially students who can't take the stairs; and APU's Schedulers office.
- **Owner:** the Schedulers office in Academic Administration (Block A, Level 7), which generates and publishes programme schedules in APCentral.
- **Trigger:** a new release of APU's public timetable feed, polled every 15 minutes (about one release a week), plus a nightly look-ahead at 9 PM.
- **Decision:** whether each transfer fits within its gap at the measured minimum connecting time, by lift and by stairs, and what the cheapest fix is.
- **Action and human gate:** one approval per run releases two things: calendar warnings for the affected intakes and Jira room-swap proposals for the Schedulers office.
- **Metric:** the share of published tight transfers that need more time than their gap, before and after; the number of swaps proposed and accepted; minutes late at the five worst changeovers.
- **Weighted score:** 70 out of 100 in the [ranking](00-ranking.md); the per-component reasoning in [Scores](#scores) totals 75.

## Problem and evidence

- **The pain:** students on APU's upper floors describe lifts that can't carry a class change. Under APU's own orientation reel on 27 October 2026 (18 likes): "most of the student is climbing stairs to 8,9 floor. A block have 9 floor 15classes a floor only two lift. Lift always full" ([other platforms](/docs/research/social-other-platforms.md#lifts-stairs-and-crowding)). The feed backs up the "15 classes a floor": it lists 15 timetabled rooms on each of Block D's Levels 7 and 8.
- **Reddit says the same:** an APU student who otherwise defended the university wrote "APU if you're reading this fix your damn elevators lah" (54 points), and a first-week diploma student listed "lifts are always full" as a reason to leave. No thread timed the waits or tied them to class changes ([Reddit](/docs/research/social-reddit.md#lifts-laundry-and-deposits)).
- **Who is hit hardest:** people who can't take the stairs. A disabled student at another university wrote that "the lifts are tiny and often broken and full of undergrads… I am sometimes late to class" (38 likes) ([other platforms](/docs/research/social-other-platforms.md#lifts-stairs-and-crowding)), and in October 2026 a wheelchair user at Miami University wrote that unreliable elevators kept making them miss class ([Miami Student]).
- **What counts as a transfer:** two consecutive sessions for the same intake group on the same day, both in rooms coded Block-Level-Room, with a gap of 15 minutes or less. Other definitions, such as counting online rooms or merging groups, give roughly 1,200 to 2,000 a week, with the same pattern.
- **The timetable assumes one fixed gap:** in the 4 November feed, 1,430 of the 1,441 transfers between physical rooms in the week of 2–8 November have a gap of exactly 15 minutes and 11 have 10 minutes. 958 of them change block, and 1,044 cross blocks touching floor 4 or above, or climb or descend three or more floors in the same block.
- **How often:** two big changeover peaks a day. In that week, 255 cross-block transfers started at 10:45 and 223 at 15:45. On 5 November, 24 rooms in Block B and 24 in Block D start a class at 10:45. Every teaching day from 4 to 13 November has between 82 and 334 tight transfers.
- **How bad:** high where it happens: students climb nine floors or arrive late. Severity is unmeasured, though: no public source times an APU lift. Measuring it is the first thing Sempat does.
- **Timetabling has the tool but no data:** timetabling solvers treat this as a solved problem. UniTime counts a "distance conflict" when the travel time between two rooms exceeds the break, and the International Timetabling Competition 2019 format stores a travel time for each pair of rooms ([UniTime], [ITC 2019]). The only scheduling process APU publishes, the APCentral Scheduler guideline (version 8, edited on 3 November 2026), covers intake and semester dates, approvals and publishing. Its "clashes" are date conflicts, and it says nothing about rooms or travel time. **Inference:** rooms are assigned somewhere the public can't see, on a uniform 15-minute assumption.
- **The timetable rarely changes once it's out:** the public history of the feed shows weeks are published 3–19 days ahead, and edits to already-published sessions are rare (see [Real data](#real-data)). The "time table changes every week" that students report reaches them through lecturers' and administrators' announcements ([other platforms](/docs/research/social-other-platforms.md#timetable-churn-and-a-compressed-calendar)), not through the feed. **Inference:** a published week is a stable plan that can be checked before it's lived, which is exactly what Sempat needs.
- **Today's workaround:** taking the stairs, arriving late, or nothing. At least 26 public repositories read the same feed, APSpace's own source mirror and many student tools among them, to copy timetables into calendars, chat or comparisons ([crowd baseline](/docs/research/crowd-baseline.md#apu-student-built-tools), plus a GitHub code search on 4 November). None of them measures a transfer or reports anything to timetabling.

[Miami Student]: https://www.miamistudent.net/article/2026/10/miami-university-elevators-ada-wheelchair-mobility-accessibility

## How it works

### Day-to-day workflow

Three parts. A feeder in Apps Script measures and computes. Gemini Enterprise workflows decide and act. One person approves each run's batch of writes.

1.  **Poll (feeder, unattended):** every 15 minutes, an Apps Script time trigger sends the feed a conditional GET using its ETag. When nothing has changed, S3 answers `304` with no body, and the poll log records the time, status and latency.
1.  **Release (feeder, unattended):** when the ETag changes, the feeder decompresses the new feed and drops `NAME`, `SAMACCOUNTNAME` and `LECTID` before anything is stored. It diffs the release against the previous one (weeks newly published, sessions added, moved or removed) and computes every intake group's same-day transfers with their facts: gap, origin and destination block and floor, slot, and how many rooms release in each block in that window. It lists the plain classrooms with no timetabled class for each destination session's whole duration, then writes `release-<date>-<etag>.csv` to a watched Drive folder.
1.  **Measure (phones and feeder, unattended):** team members and volunteers log trips on a phone page at any time. Each row reaches a Rides sheet through the Apps Script `doPost`. At 8:30 PM the feeder rebuilds the minimum-connecting-time (MCT) table: for each block and slot class, the count, median, 75th percentile and its upper bound; stair pace per floor; and walking time along the spine for each pair of blocks.
1.  **Audit (Gemini Enterprise, Drive event, unattended until the gate):** the new release file starts "Sempat release audit". It reads the release, the MCT, Rules and FreeRooms tabs, and the open Jira issues. It sorts each transfer into one of five verdicts: fits; take the stairs; impossible by lift only; impossible either way; not enough evidence. It groups transfers by session across every intake attending, picks up to three swap rooms that clear the conflict for all of them without creating a new one, and drafts the Jira issues and calendar warnings.
1.  **Approve (the one gate):** the duty approver reads the batch summary in chat history (how many swap proposals, new warnings and withdrawn warnings, with each one listed) and approves, edits or rejects it. During the pilot the team's operations lead approves; after handover, a duty scheduler.
1.  **Write:** Jira creates and links the issues; Calendar creates, updates or deletes events on the per-intake warning calendars; Sheets appends to the decision log.
1.  **Look ahead (schedule, 9 PM, Sunday to Thursday):** "Sempat nightly look-ahead" re-checks tomorrow's transfers against the refreshed MCT table, so a new ride can turn a verdict around overnight. It updates or withdraws warnings whose verdict changed, and comments on a Jira issue when its cell reaches 15 trips or its verdict flips. It passes through the same single approval.
1.  **Close the loop (Jira event):** when the Schedulers office marks a proposal Done, "Sempat fix watch" records the promised room. The next release audit checks the feed actually shows it, and reopens the issue, citing the release's ETag, if it doesn't. "Won't do" leaves the student warning in place.
1.  **Answer (Gmail event):** an email to the Sempat inbox naming an intake code starts "Sempat ask". It drafts that intake's transfers, verdicts and evidence and replies after approval.

What the Schedulers office is asked for, from cheapest to dearest. It is never asked to move a slot for a lift:

1.  **Nothing:** student warnings go out whatever the office does.
1.  **A room swap in the same slot:** one field in one session, proposed at least 3 days before the session (14–19 days for the last two releases). The proposal goes out only when the destination cell has 15 or more trips and the swap breaks no other intake's transfer. Room capacity is the one thing left for the office to check.
1.  **A travel-time matrix:** a table of travel time for each pair of block and floor, in the form timetabling solvers take, for the next schedule generation.

Rules sit in an editable Rules tab the owner can change: the margin, minimum trips for a warning (5) and for a proposal (15), the peak windows, room types never proposed (labs, suites, auditoriums), and blocks out of scope.

### Connectors and actions

| Connector                         | 1P/3P/MCP | Mode                 | Job                                                                                                                                                                       |
| --------------------------------- | --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Drive, with Sheets actions | 1P        | Trigger, read, write | A new release file starts the audit; Get cell values on Transfers, MCT, Rules and FreeRooms; Update cell values on the decision log                                       |
| Google Calendar                   | 1P        | Write                | Create, update and delete warning events on the per-intake public calendars                                                                                               |
| Gmail                             | 1P        | Trigger, write       | Receives "check this intake" emails; replies with the intake's audit                                                                                                      |
| Jira Cloud (Free)                 | 3P        | Read, write, trigger | Searches open issues; creates issues, comments, links and status changes; an issue-update trigger starts the fix watch. Mirrors APU's Jira Service Management help centre |
| Custom MCP server                 | MCP       | Not used             | Nothing needs it, and the organisation policy blocks it by default                                                                                                        |

How students get the events, given that consumer `@gmail.com` accounts can't use Workspace connectors:

- **Decision:** the workflow writes only into team-owned calendars, one public calendar per pilot intake, in the licensed Workspace domain. Students never connect anything. Google Calendar users add a calendar from its link and see updates as they land. Students on their APU Microsoft 365 account in Outlook, and Apple Calendar users, subscribe to the same calendar's public ICS address. **Inference:** Outlook refreshes subscribed ICS feeds every few hours, so warnings go out the evening before.
- **Only problems get events:** the calendar copies no classes. That is what the existing sync tools already do, and students keep using them. A student sees a Sempat event only on a day with a flagged transfer, timed at the release of the earlier class.
- **Open data for partner tools:** the feeder publishes the MCT table and the warnings as JSON to the team's public GitHub repository each week, so meow-d's per-intake ICS service, APSync or scheduleDB can merge them. GitHub isn't a workflow connector, so this step runs outside Gemini Enterprise.
- **Fallback:** if Calendar can't target a secondary calendar, the workflow writes its verdicts to the Sheet, the feeder renders them into per-intake ICS files on GitHub Pages, and Calendar drops out of the connector list.

Platform support, checked against the November 2026 research:

- Schedule triggers (cron, with a time zone) and event triggers on Drive, Gmail and Jira Cloud, polled with a 5–10 minute delay, are supported; there is no webhook trigger, so the feeder writes a file to Drive instead ([Gemini Enterprise](/docs/research/gemini-enterprise.md#triggers-and-schedules)).
- Drive, Calendar, Gmail and Jira are all workflow connectors, and GitHub is not ([Gemini Enterprise](/docs/research/gemini-enterprise.md#workflows)). Sheets Get and Update cell values (since 12 October 2026), Calendar Create, Update and Delete event, Gmail Reply, and Jira Create issue, Create comment, Link issues and Change issue status are listed actions ([Gemini Enterprise data](/docs/research/gemini-enterprise-data.md#actions-and-write-back)).
- Writes through connectors "require human review", and scheduled runs that affect other people pause for approval, which is why each run has exactly one Approval step. Approval steps must be added in the UI, not by prompt ([Gemini Enterprise](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in), [limits](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build)).
- Drive, Gmail and Calendar need a Workspace account, and federated Drive search only reads files owned by the searcher's domain ([Gemini Enterprise data](/docs/research/gemini-enterprise-data.md#edition-and-account-limits)). This is why reviewers trigger Sempat from outside the app (see [Demo and review](#demo-and-review)).
- **Not verified:** whether Calendar Create event can target a secondary calendar; whether one Approval covers every write in the node that follows; which Jira events the trigger exposes. All three are tested on 4 November.

### Cloud, IoT, and network

- **IoT, the phones:** a page on GitHub Pages reads DeviceMotion, which works in Chrome on Android and in Safari on iOS after a permission prompt ([IoT and network](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser)). The student taps "at the lift lobby", and the phone detects the ride from the vertical acceleration: a sustained push of about 0.3–1 m/s² that differs from walking's step rhythm of about 2 Hz. It also detects the stop and tells a lift from the stairs, and the student taps "arrived". Taps for "car came full" count cars that passed. **Inference:** the phone works out the boundaries itself, and only event times, the mode and the floors leave it. Raw motion traces never do, because a gait trace could count as biometric data under the 2024 PDPA amendment ([judging and pitching](/docs/research/judging-and-pitching.md#malaysias-pdpa-and-the-2024-amendment)).
- **Why the IoT is load-bearing:** every verdict's lift and stairs times come from these trips. The rules give no warning for a cell with fewer than 5 trips and file no Jira proposal below 15, so without the phones Sempat files nothing at all. What a reviewer sees: a phone moving from "waiting" to "riding" to "arrived", and the new row with its detected ride start.
- **Network:** a lift car often cuts the signal, so the page queues each event in local storage and sends it when the connection returns. Every row carries the device time, send time and server time, and the gap between them is the dead zone, shown row by row. The feed poll logs its `304`s and their latency, and the Runs tab shows the Drive event delay. What a reviewer sees: a ride logged inside the lift whose row appears only after the doors open, with the delay printed beside it ([IoT and network](/docs/research/iot-and-network.md#what-a-judge-can-see-of-the-network)).
- **Cloud:** the Apps Script feeder and the Sheets in the licensed Workspace domain, Gemini Enterprise's workflows, Google Calendar and Jira Cloud. No card is needed ([Gemini Enterprise data](/docs/research/gemini-enterprise-data.md#phone-or-board-to-google-sheets)).

### How few measurements are enough

**Inference:** a model of every pair of block and floor at every slot would need thousands of cells. Splitting a transfer into parts makes it small: exit the room, go up or down at the origin, walk the spine, go up or down at the destination, enter the room. The lift wait is the only large, variable part, and the timetable predicts the load on it: how many rooms in that block release in the 15 minutes before.

| Component                | Cells                                                  | Minimum for warnings | Minimum for proposals | Why that many                                                                                                                                      |
| ------------------------ | ------------------------------------------------------ | -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lift wait and ride, peak | Blocks B, D, E at changeovers with 15+ rooms releasing | 5 each (15)          | 15 each (45)          | The longest of 5 trips exceeds the true 75th percentile 76% of the time; the second-longest of 15 does 92% of the time (binomial order statistics) |
| Lift, low load           | Blocks B, D, E                                         | 3 each (9)           | 5 each (15)           | Sets the model's baseline                                                                                                                          |
| Stairs                   | Pace per floor, up and down                            | 5 each way (10)      | 5 each way (10)       | Pace varies little between trips                                                                                                                   |
| Spine walks              | Six busiest pairs of blocks                            | 1 each (6)           | 2 each (12)           | Walking times barely vary; the six pairs carry most cross-block tight transfers                                                                    |

- **Totals:** about 40 trips give a usable model for warnings, and about 80 make it good enough to send swap proposals. Blocks B, D and E hold 83% of the timetable rows in rooms with a block code. Transfers among the three of them are 66% of the cross-block tight transfers in the week of 2–8 November.
- **Pooling across slots:** **Inference:** fitting each block's wait against the number of rooms releasing lets about 40 trips at four to six load levels cover slots nobody measured. Each cell shows its trip count, and a cell short of trips says "not enough evidence" rather than guessing.
- **Collected by a team of four in a pilot window and one full day:** one person in each of the lobbies of Blocks B, D and E, and a fourth taking the stairs on the same trips at the same moment, so each lift trip has a stairs trip to compare with. Each person rides once down and once up per peak window.
  - Wednesday 4 November, 15:30–15:45 (71 tight transfers start at 15:45): pilot, about 8 trips.
  - Thursday 5 November, 10:30–10:45 and 15:30–15:45 (84 and 92 tight transfers), plus the 12:45 release (24 rooms each in Blocks B and D): about 24 trips.
  - Low-load trips, stair climbs and spine walks in two quiet hours on Thursday: about 25.
  - That's about 57 trips, roughly two and a half hours per person: enough for warnings, about 10 peak trips per block. If waits run long, fewer trips fit in each window, and the "car came full" taps record that.
  - The evaluation walks on Friday 6 and Tuesday 10 November (see [Research plan](#research-plan)) each include a lift leg. Once scored, they join the model, taking it to about 16 peak trips per block, enough for proposals, before submission.

### Real data

Smoke tests ran from 00:16 to 00:31 MYT on 4 November 2026; the raw responses are kept with the team's notes.

| Source                                                           | Live or replayed                        | Cadence                                                                             | Licence or terms                                                        | Smoke test on 4 Nov 2026                                                                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APU week timetable feed (`open-ws/weektimetable` on S3)          | Live                                    | Polled every 15 min; changes about weekly (median 7.0 days between changes in 2026) | APU's content; its Terms of Use reserve copyright; permission requested | `200` at 00:16:51, 1,138,362 B gzip, 31,606 rows, 26 Oct–22 Nov, `Last-Modified` 28 Oct 01:39 GMT; identical to the 3 Nov 23:49–23:53 copies; conditional GET `304` at 00:30:43 |
| APU intake listing (`open-ws/intake_listing`)                    | Live                                    | Same                                                                                | Same                                                                    | `200`, 8,697 B gzip, 2,002 entries                                                                                                                                              |
| Public feed history, [scheduleDB]                                | Replayed for backtests, labelled replay | A commit whenever the feed changed, checked twice a week                            | Code MIT; the data is APU's                                             | 85 commits from 22 Aug 2024 to 29 Oct 2026; 9 snapshots from 30 Aug to 29 Oct fetched with `200`                                                                                |
| Team phones' lift, stairs and spine trips                        | Live                                    | Per trip                                                                            | The team's own readings, published with provenance on GitHub            | Not yet collected; the page is built on 4 Nov                                                                                                                                   |
| APU KB "Campus Facilities and Navigation Guide" (LNO 3855974442) | Live reference                          | Edited ad hoc (version 15, 28 Oct 2026)                                             | APU's Terms of Use                                                      | `200` from the public Confluence REST API; names the spine, the glass, Block C and Block E elevators, and the Schedulers office in Block A, Level 7                             |
| APU KB "Scheduler User Guideline" (ITSM 3971612673)              | Reference                               | Version 8, 3 Nov 2026 13:23 MYT                                                     | APU's Terms of Use                                                      | `200` at 00:22:54                                                                                                                                                               |
| [apspace-calendar] hosted per-intake ICS                         | Live partner channel                    | On request                                                                          | No licence file; ask the author                                         | `200` `text/calendar`, 14 events for UCDF2603DSM G1, 4.0 s, at 00:28:00                                                                                                         |

What the change count shows:

- **Fresh fetch against the earlier copy:** zero changes. The 00:16 fetch is byte-identical to the copies taken at 23:49–23:53 on 3 November: the same ETag `c9d8d238…` and the same MD5 once decompressed. The feed was last modified on Wednesday 28 October.
- **The published history:** across the last eight releases, from 30 August to 29 October, the 3 September release restructured the semester. Within the dates the old and new versions shared, it removed 345 module-day slots and published 655 for new intake weeks. The seven releases since then added 6 module-day slots (12 intake-group rows) to weeks already published, and changed no session's time or room and cancelled none. The 29 October release also blanked one module's name in 72 rows. Each release adds new weeks 3–19 days before their first class: 16–22 November, with 102 new November intakes, arrived on 28 October.
- **Inference:** the change stream is real but weekly. The event worth catching is a release, and a nightly run on new trips keeps Sempat working every day between releases. If APU keeps regenerating the feed midweek (28 October was a Wednesday, and most 2026 changes were first seen in Thursday checks), a live release may land during the build or the assessment. If none does, the 28 October release is replayed from the public history and labelled as a replay.

## Why people will use it

- **Habit loop:** the evening before a day with a flagged transfer, an event appears in the calendar the student already checks, timed at the end of the earlier class. On Wednesday 11 November, for example, four intake groups go from D-08-06 to B-07-02 in the 10:30–10:45 changeover. The event reads "Tight: D-08-06 → B-07-02 by 10:45", then gives the measured lift time (75th percentile and trip count) and the measured stairs-and-spine route time. The student takes the faster route and makes it in time. A "log this trip" link in the event adds a trip to the model. Days without a problem show nothing, so the calendar stays quiet.
- **Channel:** zero install: a calendar link that class reps post in their intake's Teams group, in Google Calendar, Outlook on the APU Microsoft 365 account, or Apple Calendar. Students who already use meow-d's ICS service, APSync or APLife keep using it, and Sempat adds one calendar on top.
- **For the Schedulers office:** a Jira queue with a few ready-to-accept swaps per release, each with its evidence and three candidate rooms, instead of complaints. Students who can't take the stairs see that their transfer is on the office's list, with the issue number in the event.
- **After the team graduates:** the Schedulers office owns the Gemini Enterprise seat, the Jira project and the Rules tab. The phone page and feeder move to an APU-owned account. Lifts don't change between semesters, so the model needs a two-day measurement sprint each new intake week rather than daily volunteers. **Inference:** GDGoC APU or a School of Technology IoT class can run it as a lab exercise.

## Why the crowd won't build it

- **Against the crowd baseline:** lifts are not a cluster among 780 simulated ideas. Queue and crowd prediction holds 2.5%, "often simulated", and student-facing timetable tools are absent ([crowd baseline](/docs/research/crowd-baseline.md#saturation-tiers)). Only 1% of simulated ideas combine an unattended run, a named owner and a measured baseline ([crowd baseline](/docs/research/crowd-baseline.md#what-the-crowd-structurally-misses)).
- **Against APU's own student tools:** a GitHub code search for the feed URL on 4 November found 32 files in 26 repositories, from 2018 to October 2026. Among them are APSpace's source mirror, APSync ("checks for changes every 12 hours"), APLife, meow-d's per-intake ICS, a Discord bot and timetable comparers, and tools that keep the URL in a secret, such as cron-apu-timetable (40 forks), come on top. All of them copy sessions. None measures a transfer, and none tells the timetablers anything. **Inference:** their change alerts have little to alert on, because the published history shows no session moved in two months; the changes students complain about arrive by announcement.
- **Why Sempat beats them, and how it builds on them:** it syncs nothing. It adds the one thing they lack, whether a transfer works, measured, plus a route to fix it at the source. It credits and uses their work: scheduleDB's public history for the backtests and the change count, and meow-d's ICS and APSync as delivery partners for the weekly warnings JSON. The second interview round asks their maintainers whether they'd merge it.
- **Crowd check on 4 November:** a Devpost search turned up no project on lift waits making students late. Of 73 GitHub repositories for "elevator wait time", the recent ones simulate dispatch algorithms. One project ([Lift-vs-Stair-Detector], 9 stars) tells lift from stairs on an ESP32 board, with no timetable. Research exists: phone accelerometers that detect lift rides and conveyor states ([arXiv 2405.03218]), and a digital-twin timetabling paper with a "travel floor feasibility" constraint on modelled mobility ([arXiv 2503.06109]). Commercial timetabling tools advertise travel time between buildings. Nothing found measures a real campus's lifts with phones and checks a live published timetable against the result.
- **The remaining risk:** an APU team that knows the feed may build a timetable bot, but that is the sync tool again, not a feasibility check.

[Lift-vs-Stair-Detector]: https://github.com/Aroosa-Batool/Lift-vs-Stair-Detector
[arXiv 2405.03218]: https://arxiv.org/html/2405.03218v3
[arXiv 2503.06109]: https://arxiv.org/pdf/2503.06109

## Scores

Weights are the team's reading of NTT DATA's five spoken points plus the theme, originality, usage and demo, summing to 100. NTT DATA published no weights. Each component is scored from 1 to 5 and contributes weight × score ÷ 5.

### Component scores

| Component           | Weight | Score | Reason                                                                                                                                                   |
| ------------------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact              | 15     | 3     | 1,441 tight transfers a week and a clear accessibility angle, but how many actually fail is unknown until the trips are in, and the owner is unconfirmed |
| Connectors          | 15     | 4     | Drive with Sheets, Calendar, Gmail and Jira all do real work in the loop; Calendar's secondary-calendar writes are unverified, and there's no MCP        |
| Research depth      | 10     | 4     | The measurement is the research: a timed baseline, held-out precision and recall, and an owner a short walk away; none of it has been gathered yet       |
| Time to impact      | 10     | 3     | Student warnings start the day after the sprint; swaps depend on an office that hasn't been asked yet                                                    |
| Day-to-day workflow | 15     | 4     | A 15-minute poll, release-triggered audit, nightly look-ahead and Jira fix watch with one approval; the big event is weekly, not daily                   |
| Theme convergence   | 10     | 4     | Phones are the only source of every verdict, and the buffered upload makes the network visible; ride detection is unproven                               |
| Originality         | 10     | 5     | No lift or transfer cluster in the crowd baseline, no Devpost match, and 26 APU timetable tools that don't measure                                       |
| Real usage          | 10     | 3     | Zero install and quiet by design, but it is only as useful as the share of transfers that turn out tight, and the model needs a sprint each semester     |
| Demo and pitch      | 5      | 4     | A lift ride turning into a calendar warning and a Jira swap is easy to follow; footage inside lifts needs care                                           |

Weighted total: 9 + 12 + 8 + 6 + 12 + 8 + 10 + 6 + 4 = 75.

### Gate results

- **Real public data only:** pass. A live public feed; the team's own phone readings, published with provenance; a public history replayed and labelled; no private records, and motion stays on the phone.
- **Buildable by 10 November inside Gemini Enterprise's limits:** pass. Four workflows (Standard allows one creation per licensed user per day), about four runs a day against 160 queries per user, a 15-minute poller, and one approval per run.
- **Core lives in Gemini Enterprise:** pass. The feeder computes facts. Gemini Enterprise decides whether the evidence is enough, picks swaps that work for every intake in a session, checks against open issues, words the warnings, and makes every write.
- **IoT real and visible:** pass. Phone accelerometers and taps are the only source of transfer times.
- **Owner and users reachable, 30–50 items:** pass. The Schedulers office is on campus in Block A, Level 7, and the evaluation items are real transfers the team walks itself, so they don't depend on the office.
- **Reviewer can trigger it:** pass, by logging a trip, subscribing, or emailing the inbox (see [Demo and review](#demo-and-review)).
- **No-card path, no dependence on consumer accounts:** pass. Apps Script, Sheets, GitHub Pages and Jira Cloud Free. Workspace accounts are needed; the degraded path for consumer accounts is under [Risks](#risks).

### Strongest objections

- **Impact:** "Students already take the stairs; it's a couple of minutes." Partly conceded: the size is unknown until 5 November. The answer is that the measurement settles it either way, that impossible-by-lift transfers are an accessibility failure even when the stairs work, and that a clean result is still evidence the 15-minute gap holds.
- **Connectors:** "Calendar writes to a secondary calendar are unverified, and Gmail and Calendar need Workspace." Tested on 4 November, with a fallback to ICS files on GitHub Pages; Jira and Sheets carry the core either way.
- **Research:** "The team that built the model scores it." Model trips come from the 4–5 November lobbies; evaluation transfers are walked door to door on 6 and 10 November, and the model is frozen before they're walked.
- **Time to impact:** "Timetablers won't act within six months." The cheapest action needs no one at APU, the next costs one field per session, and nothing asks for a slot to move.
- **Workflow:** "The feed changes weekly, so this is a weekly job." Conceded for releases. The nightly look-ahead runs every teaching day on new trips, and the poller runs every 15 minutes.
- **Theme:** "Tapping a phone is a stopwatch." The accelerometer sets the ride boundaries and the mode, and the network leg is shown row by row.
- **Originality:** "It's the thirteenth timetable sync tool." It copies no class and adds what the sync tools can't.
- **Usage:** "Nobody keeps logging trips." Conceded for daily logging; that's why the model is built from a two-day sprint each semester, and the trip link in each event is a bonus.
- **Demo:** "Filming in lifts is a privacy problem." Film only the floor indicator and the phone screen; no faces.
- **Real-data gate:** "Replaying history is a mock." The replay is of APU's real published releases, labelled as a replay, and the live poller runs beside it.
- **Core gate:** "The threshold is arithmetic in Apps Script." The arithmetic is a fact; the judgement calls and every write are in Gemini Enterprise.

## Research plan

- **First interview round (5–6 November, problem and baseline):**
  1.  A scheduler in the Schedulers office: how rooms are assigned to sessions, whether travel time is considered, and a timed attempt at finding a same-slot room for one real session from the Class List export.
  1.  A Programme Leader who approves schedules.
  1.  Two class reps from intakes with 10:45 transfers between Blocks D and B.
  1.  A student who relies on lifts, recruited through the reps; no health details are recorded.
  1.  Logistics & Operations building staff: lift cars per block and maintenance windows.
- **Second interview round (8–10 November, first outputs):**
  1.  The same scheduler, with three real Jira proposals: would they accept each, and if not, why not.
  1.  A maintainer of meow-d's ICS service or APSync: would they merge the warnings JSON.
  1.  The class reps again, after a week of warnings.
- **Timed baselines:** door-to-door transfer times by lift and by stairs at the peaks, which the measurement sprint yields; the scheduler's minutes to find one swap by hand, against seconds for Sempat; and minutes late on arrival for the evaluation transfers.
- **Precision and recall on 30–50 real items:** freeze the model on the evening of 5 November. Then team members walk real tight transfers door to door at their real times: Friday 6 November at 09:45, 10:45 and 16:45 (81 tight transfers that day at those starts), and Tuesday 10 November at 10:45 (16). With four people walking two each per slot, that's about 32 items. Each item is predicted beforehand (fits or doesn't by lift, by stairs) and labelled from the observed time against the gap. Report precision and recall of the "won't fit by lift" flag, the mean absolute error in minutes, and n. Scored items then join the model.
- **Detector accuracy:** on 40 lift and stair trips, compare the detected ride start and stop with taps and with video of the floor indicator. Report mode-classification precision and recall and the timing error in seconds.

## Time to impact

- **By 3 months (early February 2027):**
  - At least 20 intakes subscribed, with nightly warnings running. Owners: the team, then GDGoC APU.
  - The Schedulers office triages swap proposals after each release. Owner: a duty scheduler.
  - Version 1 of the MCT table published on GitHub and merged into at least one student calendar tool. Owners: the team, with the tool's maintainer.
  - A second measurement sprint in the first week of a new intake. Owner: GDGoC APU or an IoT class.
- **Measured by 6 months (May 2027):**
  - The share of published tight transfers that need more than their gap, release by release.
  - Swaps proposed and accepted, and how many days before the session.
  - Minutes late at the five worst changeovers, before and after.
  - Trips per cell.
  - Whether the travel-time matrix was used in generating the next programme schedules.
- **What has to be true:** APU gives written permission and keeps the feed public; the Schedulers office accepts proposals through Jira or an email digest; the lifts and blocks stay as they are; and the Workspace domain allows public calendars.

## Demo and review

A video of about 3:40, labelled as a recording with its capture date, made from the live system:

- **0:00–0:20:** the 15-minute gap, the 1,441 transfers, and the orientation-reel quote over APU's Block D Level 8 corridor.
- **0:20–1:05:** at 10:30, a teammate taps "at the lift lobby" in Block B. The phone shows "riding", the signal drops, and after the doors open the row lands in the Rides sheet with its delay printed. A second teammate's stairs trip on the same transfer lands alongside.
- **1:05–1:55:** the poll log's `304`s, then a release (live, or the 28 October release replayed from the public history and labelled). The Drive event starts the audit; the Runs tab shows the reads, verdicts, the Approval, the Jira issue with three candidate rooms and its evidence (15 trips), and the warnings created.
- **1:55–2:35:** a phone calendar showing the warning with both routes; the same calendar subscribed in Outlook on an APU account.
- **2:35–3:00:** impact: precision and recall with n, the baseline swap time against Sempat's, and the owner.
- **3:00–3:40:** how it runs day to day: several days of the owner's Runs tab, the 14-day credential refresh, and how to review it yourself.

How a reviewer triggers it:

- **Log a trip:** scan the QR code in the README, allow motion, tap "test trip", and ride any lift anywhere. The phone shows the row ID and its delay from the server. The row is tagged as a test, kept out of APU's model, and appears in the next nightly run's log.
- **Subscribe:** open a pilot intake's warning calendar from the README and see the next teaching day's warnings.
- **Ask:** email the Sempat inbox with an intake code, such as "UCDF2603DSM G1 next week". The Gmail-triggered workflow drafts that intake's audit, and the reply arrives after the team approves it, checked at least twice a day from 11 to 14 November. Reviewers get their own runs, not the owner's, and can't read the team's Drive domain, so these triggers sit outside the app on purpose ([Gemini Enterprise](/docs/research/gemini-enterprise.md#reviewer-access)).

## Build plan

The riskiest pieces come first: ride detection in a browser, and Calendar writes. The no-card path throughout uses Apps Script, Sheets, GitHub Pages, Jira Cloud Free and the sponsored Gemini Enterprise licence; there's no Cloud Run, no Pub/Sub, and no billing account.

- **Wednesday 4 November:**
  - Build the DeviceMotion page with its local queue and the Apps Script `doPost` to the Rides sheet.
  - Test on two Android phones and an iPhone in three APU lifts during the 10:45 changeover (or at 15:45 if the page isn't ready); pilot trips at 15:30–15:45.
  - Test GE Calendar Create event on a secondary public calendar and Sheets Get cell values, and test one Approval covering two writes.
  - Start the 15-minute feed poller with ETag logging.
  - Ask the organisers in `#help-desk` for written permission to use the feed and the KB pages, and email the Schedulers office for an interview.
- **Thursday 5 November:**
  - Measurement day (10:30, 12:45 and 15:30 windows, plus low-load trips, stairs and spine walks).
  - First-round interviews.
  - Set up the Jira Cloud Free project.
  - Build the MCT table script, then freeze the model in the evening.
- **Friday 6 November:**
  - Evaluation walks at 09:45, 10:45 and 16:45.
  - Build "Sempat release audit" with its Approval, and backtest it on the 18 and 28 October releases from the public history, labelled as replays.
- **Saturday 7 November:**
  - Build "Sempat nightly look-ahead", "Sempat fix watch" and "Sempat ask".
  - Create the per-intake calendars for the pilot intakes and the weekly JSON publisher.
  - Turn on the schedules; the credentials expire on 21 November.
- **Sunday 8 November (Deepavali):** README, deck and diagram drafts; confirm every member has registered before registration closes.
- **Monday 9 November (replacement holiday, no classes in the feed):**
  - Second-round interviews online.
  - Score the evaluation items.
  - Test reviewer access with an account outside the team.
- **Tuesday 10 November:**
  - Evaluation walks at 10:45.
  - Feature freeze, then record the video from the live system.
  - Refresh the schedule credentials.
  - The leader submits by mid-afternoon.

## Risks

- **No problem to find:** the lifts may cope within 15 minutes. Mitigation: the MCT table and the impossible-by-lift check are still deliverables, and a clean result is evidence the gap holds; say so in the pitch rather than inflate it.
- **Privacy (PDPA):**
  - The feed carries lecturers' names and account names (`NAME`, `SAMACCOUNTNAME`) and initials (`LECTID`). The feeder drops all three before storage, so they never reach a Sheet, a prompt or a Jira issue. The public history repository holds them too, so it's processed locally and discarded after diffing.
  - Trips carry a random device ID that rotates each week. The phone computes an "on campus" yes or no and sends no coordinates, and no raw motion leaves the phone.
  - A consent screen comes first; raw trips are kept for 90 days, and only aggregates are published.
  - No interview records health details.
  - These follow [judging and pitching](/docs/research/judging-and-pitching.md#malaysias-pdpa-and-the-2024-amendment).
- **Permission (APU Terms of Use):**
  - The terms reserve copyright and ask for permission before "use of this Website or any of the Contents" ([APU public documents](/docs/research/apu-public-documents.md#terms-of-use-and-robotstxt)). APU's KB tells students how to read their timetable without logging in, and APSpace and 26 public repositories read the feed, but none of that is a licence.
  - Ask the School of Technology organisers and the Schedulers office in writing this week. If permission is refused or the feed closes, Sempat stops and shows the error, with no cached copy.
- **Platform limits:**
  - The Calendar secondary-calendar write is unverified; the fallback is ICS files on GitHub Pages.
  - Every write waits for approval, so warnings depend on the approver; schedule the nightly run so approval fits the evening.
  - Credentials expire every 14 days.
  - Standard allows one agent creation per user per day, so build four workflows over 5–7 November.
  - Quota failures on event runs aren't retried; check runs daily.
  - Natural language can't add approval steps or event triggers ([Gemini Enterprise](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build)).
- **Consumer licences:** if the licences arrive on `@gmail.com` accounts, Drive, Gmail and Calendar fail ([Gemini Enterprise data](/docs/research/gemini-enterprise-data.md#edition-and-account-limits)). The degraded path:
  - The feeder files each release as a Jira issue with its facts attached.
  - A Jira event starts the audit.
  - Verdicts go to Jira, and the feeder publishes them as ICS files.
- **Room facts the feed lacks:** capacity and bookings that aren't classes are invisible. For 5 November, in the timetable published on 28 October, 179 of 185 cross-block tight transfers had a plain room free in the origin block for the whole next session, but every proposal says "capacity to confirm" and never offers labs, suites or auditoriums.
- **Ride detection:** iOS needs a permission tap, the page must stay in the foreground, and the sampling rate varies by device. A tap for "boarded" covers missed detections, and the detector's error is reported.
- **On-site conduct:** riding at peak adds a few people to full cars, so trips record "car came full" instead of squeezing in. Never film other passengers. Keep stair timings at walking pace.
- **Owner doesn't engage:** student warnings and the published table still land, and the Student Council or GDGoC APU can run the gate instead.
- **Name:** "Sempat" is an everyday Malay word, and a web search on 4 November found no product by that name. "Changeover" was rejected because changeover.app, a cleaning scheduler for short lets, already uses it.

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md#recommended-shape): rules, judging points and the recommended shape.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise-data.md): triggers, approvals, limits, connectors and live-data paths.
- [IoT and network](/docs/research/iot-and-network.md): phone sensors, offline links and the real-versus-simulated ruling.
- [Other platforms](/docs/research/social-other-platforms.md), [Reddit](/docs/research/social-reddit.md) and [X](/docs/research/social-x.md#lifts-wi-fi-and-room-temperature): the lift and timetable evidence.
- [Crowd baseline](/docs/research/crowd-baseline.md): the simulated crowd and APU's student-built tools.
- [APU public documents](/docs/research/apu-public-documents.md): APU's systems, KB and Terms of Use.
- [Research and impact](/docs/research/research-and-impact.md) and [judging and pitching](/docs/research/judging-and-pitching.md): interviews, accuracy, time to impact, the video and privacy.
- Key sources: [scheduleDB], [apspace-calendar], [APSync], the [UniTime] and [ITC 2019] travel-time models, and APU's KB [Scheduler User Guideline] and [Campus Facilities and Navigation Guide].

[UniTime]: https://www.unitime.org/papers/patat2016.pdf
[ITC 2019]: https://www.itc2019.org/papers/itc2019-patat2018.pdf
[scheduleDB]: https://github.com/lrxrn/scheduleDB
[apspace-calendar]: https://github.com/meow-d/apspace-calendar
[APSync]: https://github.com/AaronKhoolb/APSync
[Scheduler User Guideline]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/3971612673/Scheduler+User+Guideline
[Campus Facilities and Navigation Guide]: https://apiit.atlassian.net/wiki/spaces/LNO/pages/3855974442
