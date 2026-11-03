# Skyclause

Skyclause turns the higher-education ministry's 7 October 2026 instruction to watch local air-quality readings, and November's afternoon storms, into one logged and approved operating-mode call for APU's next block of physical sessions. An editable clause sheet runs against DOE, MET and JPS telemetry plus the team's own skyline camera; the call goes to the people who decide (Facilities, Safety and Student's Welfare, lecturers for their own sessions, event organisers), and every evaluation lands in a record APU can show the ministry or a lecturer asking "what happened at 15:30 on 2 November?". It matters now because APU's handbook and knowledge base have no haze, storm or flood rule, while KL thunderstorm warnings covered the 5 PM exit wave on 20 of 24 weekdays in October.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Problem and evidence](#problem-and-evidence)
    1.  [Haze: a ministry directive with no university rule](#haze-a-ministry-directive-with-no-university-rule)
    1.  [The official index lags the air](#the-official-index-lags-the-air)
    1.  [Storms: the exit wave meets the afternoon cell](#storms-the-exit-wave-meets-the-afternoon-cell)
    1.  [Attendance decisions without a shared record](#attendance-decisions-without-a-shared-record)
    1.  [How APU handles it today](#how-apu-handles-it-today)
1.  [How it works](#how-it-works)
    1.  [Day-to-day workflow](#day-to-day-workflow)
    1.  [The clause sheet](#the-clause-sheet)
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

- **Track:** Intelligent Automation & Digital Transformation.
- **Who it's for:** lecturers deciding their own sessions, club and event organisers (GDGoC APU for this hackathon's own events among them), and the students in the 508–563 physical sessions APU runs each weekday.
- **Owner (APU office):** Facilities, Safety and Student's Welfare (FSSW), the office APU's knowledge base names as students' safety and welfare contact, runs the desk and approves each call. The Registrar is an approver only for a hybrid switch, by replying to an email, and never needs to be a user.
- **Trigger:** clause evaluation, fired by schedules at 20:00 (tomorrow's call), 06:45 (morning confirmation) and 15:30 (exit wave), by a Drive event when a clause changes state, and by a request: an email or `@Skyclause` run asking "what's tomorrow's call?" or "evidence for <window>".
- **Decision:** the operating mode for the next block of physical sessions: Normal, Outdoor-limited, Commute disruption (a late-start window in the morning, hold-and-release in the evening), or Hybrid recommended. The output is a recommendation with evidence; a person decides.
- **Action and human gate:** every evaluation is logged unattended; a non-normal call pauses for one approval, then sends notices to the affected lecturers and organisers by Gmail, adds a Calendar entry, and files a Jira decision record.
- **Metric:** minutes from a clause crossing to an approved notice; hit rate and false-alarm ratio on timetable release waves; minutes to assemble the evidence for a window, before and after.
- **Weighted score:** 73.5 out of 100 in the [ranking](00-ranking.md); the per-component reasoning in [Scores](#scores) totals 79.

## Problem and evidence

### Haze: a ministry directive with no university rule

- On 7 October 2026 KPT told every university to monitor API readings in its own locality, and on 9 October vice-chancellors were told they could decide class closures themselves; Universiti Malaya went hybrid from 12 October ([X research][x haze]).
- Schools got numbers; universities didn't. The Education Ministry told schools to suspend all outdoor activities above API 100 and close above 200 ([Malay Mail, 7 Oct][mm moe]), then to close above 180 or after three days above 150 ([The Star, 8 Oct][star moe]). DOSH's band "101-200: minimise strenuous outdoor work" circulated alongside ([X research][x haze]).
- Haze is the highest-engagement topic in the Reddit study: posts of 3,418, 2,226, 1,598 and 1,555 points. A lecturer: "I too wanna WFH but alas college management don't think like that"; a student: "my class got changed to online because of jerebu"; at APU, most martial-arts clubs "are closed down … due to the Haze" ([Reddit research][reddit haze]).
- A student tagging the ministry: "Mahasiswa pun kena beratur tunggu bas dalam jerebu" (students still have to queue for buses in the haze) ([X research][x haze]).
- **Frequency:** in DOE's hourly history for Cheras (`CA16W`, 5.9 km from APU), the API passed 100 on 20 of the 31 days with readings from 3 October to 3 November 2026, passed 150 on 17, and never reached 200 ([Malaysia Haze Monitor] log, counted on 4 November).
- **Backtest:** a clause sheet that mirrors the school rules would have called Hybrid recommended on 8 weekday mornings, Outdoor-limited on 5 and Normal on 8, out of 22 weekdays from 5 October to 3 November (one missing day). APU had no rule to compare against.
- Haze returns: "Jerebu is back ni" on 1 November ([X research][x haze]).

### The official index lags the air

- DOE's calculation uses 24-hour averages for PM2.5 and PM10 ([DOE API calculation]); on 22 October 2026 the minister told Parliament the same, answering a question on whether readings are accurate and trusted ([The Edge, 22 Oct][edge api]).
- Students notice: "the readings could stay at like 80 even though the air quality is clearly in the unhealthy/very unhealthy range. And it seems like they are delayed"; a reply explained the running average ([Reddit research][reddit haze]).
- **A real case, Sunday 25 October:** the nearest public low-cost PM2.5 sensor (Sensor.Community 101147, a PMS5003 3.7 km from DOE's Batu Muda station) fell from 46 µg/m³ at 02:00 to 5 µg/m³ by 06:00. Batu Muda's official API was still 124 (Unhealthy) at 06:00, dropped below 101 only at 08:00, and read 80–96 for the rest of the day while the sensor read 0–8 µg/m³ ([Sensor.Community archive], [Malaysia Haze Monitor]).
- **The other direction, Tuesday 13 October:** Cheras read 83 at 06:00, reached 100 at 16:00 and 151 by 18:00. A morning call on the API alone said Normal for a day that ended Unhealthy.
- **Inference:** an hourly or ten-minute local reading leads the official index on both the arrival and the clearing of haze, which is why the team's own camera station is in the clause sheet rather than decoration.

### Storms: the exit wave meets the afternoon cell

- **Warnings are near-daily:** in 282 MET thunderstorm-warning graphics posted from 1 October to 3 November 2026 and read by OCR, a warning naming W.P. Kuala Lumpur was in force during 16:30–19:15 on 20 of 24 weekdays, and during 07:00–09:00 on 2 ([MET Malaysia on X]). The median KL warning lasted 3 hours.
- **The week ahead:** MET's KL forecast fetched on 4 November says "Ribut petir di beberapa tempat" (thunderstorms in places) every afternoon from 4 to 9 November, and rain all day on 5 November.
- **What actually fell at Bukit Jalil:** the JPS rain gauge at Sg. Kuyoh di LRT Bukit Jalil, 0.9 km from campus, logged 81.5 mm on 30 October (76 mm between 18:00 and 20:00) and 65 mm on 2 November (62.5 mm between 14:00 and 16:00). On 2 November 155 physical sessions (484 intake groups) ended between 14:00 and 16:30, 89 of them at 15:30, and a traffic account reported a flash flood "Bukit Jalil arah Puchong" ([X research][x floods]).
- **Warnings alone over-fire:** in the one week with gauge data (28 October to 3 November), a KL warning covered the exit wave on 5 weekdays, but heavy rain (at least 31 mm in 60 minutes) hit a timetable release wave on only one, Monday 2 November, between 14:30 and 15:45. A warnings-only rule would have flagged waves on all five days for one real event.
- The neighbourhood floods: LRT Bukit Jalil's fare gates went under at the evening peak on 6 May 2026 (34,157 likes), and a review says "the university is flooded during heavy rain" ([other platforms research][other rain]).
- **Volume:** in the week of 2–6 November, 139–174 physical sessions ended between 16:30 and 19:15 each weekday and 75–89 started at or before 08:30 (APU timetable feed, 4 November).

### Attendance decisions without a shared record

- The Student Handbook v8.0, section 2.2, requires 80% attendance per module, and four consecutive absences "without written approval" can count as withdrawal. International students warn others that missing it means "deportation or expel" (127 points) ([Reddit research][reddit attendance]).
- In AttendiX, APU's lecturer attendance tool, each record is Present, Absent, Absent With Reason or Late, and lecturers edit records up to 98 days back ([KB: How to Edit Attendance Record?][kb attendix]).
- **Inference:** whether a student caught in a storm is Late or Absent With Reason is already the lecturer's call. Skyclause gives that lecturer the measured facts for the window and a recommendation, and never excuses anyone automatically, so there is nothing for a student to game.

[kb attendix]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/221218032

### How APU handles it today

- The handbook has no weather, haze, flood or emergency provision, and a search of APU's public knowledge base on 4 November found no page for "jerebu", "thunderstorm", "lightning" or "outdoor"; "haze", "flood" and "heavy rain" each matched one unrelated page.
- Workarounds seen in the research: AirVisual or aqicn.org instead of official readings, ad hoc switches to online classes, the library for air-conditioning ([Reddit research][reddit haze]), and checking forum threads for floods before travelling ([other platforms research][other rain]).
- **Inference:** each lecturer, organiser and office decides alone, from different sources, with no record. If KPT asks how APU monitored its local readings in October, nothing written answers it.

## How it works

### Day-to-day workflow

1.  **Feeder (Apps Script, unattended):** time triggers poll DOE APIMS hourly, MET warnings every 10 minutes, the JPS Bukit Jalil gauge every 5 minutes and the timetable feed hourly, and an Apps Script web app receives the camera station every 10 minutes and the optional board every minute. Each row keeps the source timestamp, HTTP status and fetch latency; a failed poll writes an error row, never the last value ([public feed path][ged feed]).
1.  **Clause evaluation (Apps Script, unattended):** after each poll the feeder evaluates every row of the clause sheet against the newest readings and appends the result to the decision ledger, so every evaluation is on record whether or not anyone acts. When a clause changes state, it writes a small file into the watched Drive folder `crossings/`.
1.  **Scheduled calls (Gemini Enterprise workflow):** at 20:00 for tomorrow, 06:45 to confirm the morning (civil twilight begins at 06:35, so the camera has light) and 15:30 for the exit wave, a Gemini agent node reads the clause sheet, ledger and session counts through Sheets **Get cell values**, finds the release waves at risk (at least 10 physical sessions ending at the same time), picks the mode by the sheet's precedence, and drafts one notice per affected recipient with the evidence. If the mode is Normal and unchanged, the run ends; its trace in the **Runs** tab is the record.
1.  **The one approval:** a non-normal call stops at an **Approval** step and shows as **Needs Review**. The FSSW duty officer reads the bundle (mode, fired clauses, readings with their age, waves and session counts, recipients) and approves, edits or rejects it.
1.  **Writes after approval:** Gmail sends the notices to the opted-in lecturers and organisers whose sessions fall in the window, Calendar adds the period to a public "APU operating mode" calendar, and Jira Cloud files the decision record. A Hybrid recommended call also emails a memo to the Registrar; the Registrar's reply arrives through the Gmail trigger and is added to the Jira record, behind the same kind of approval.
1.  **Clause-crossing events:** a new file in `crossings/` fires the same workflow through the Drive event trigger, 5–10 minutes later, scoped to the waves the crossing affects, for example "heavy rain at the gauge at 15:05; 89 sessions end at 15:30".
1.  **Requests:** an email to the team inbox fires a Gmail-triggered run that answers "what's tomorrow's call?" or "evidence for 30 Oct 17:30–20:00" from the ledger, the Jira records and the camera frames; the reply is sent after approval. In the Gemini Enterprise app, `@Skyclause` with the same question returns a read-only answer in the requester's own run, with no write and so no approval.
1.  **Closing the loop:** every night the feeder grades each call against what the ledger observed at each release wave (hit, miss, false alarm, correct Normal); the 06:45 call quotes yesterday's grades, and the Monday call adds the week's grades to the Jira register.
1.  **Auditor (Apps Script, outside Gemini Enterprise):** it emails the team when a feed or the camera goes silent, when an expected run produces no artefact, and on day 12 of the 14-day schedule credentials ([unattended runs][ge unattended]).

**Inference:** on a Normal day nobody clicks anything; in a storm week the duty officer clicks once per non-normal call, which the platform requires anyway for runs that email other people.

### The clause sheet

The owner edits thresholds in a Sheet; defaults below come from published rules and JPS's own rain classes. The highest mode wins, and every fired clause is listed on the call.

| Clause           | Reads                                                  | Fires when (default)                                                                                                                                              | Proposes                          |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Haze watch       | API at Cheras, Petaling Jaya, Putrajaya; camera; board | Official API 101 or more at any of the three, or the camera loses the city skyline while the board's 1-hour PM2.5 is above 75.5 µg/m³ (the API-100 breakpoint)    | Outdoor-limited                   |
| Haze severe      | API, last three 06:00 readings                         | API above 180, or above 150 at 06:00 on three consecutive days (the 8 October school rule)                                                                        | Hybrid recommended, to Registrar  |
| Storm watch      | MET warnings                                           | A warning naming W.P. Kuala Lumpur covers a release wave                                                                                                          | Nothing alone; printed as context |
| Storm confirmed  | JPS gauge `0232901RF`; camera                          | Storm watch, plus at least 31 mm in 60 minutes (JPS "Lebat") or the camera losing its nearest landmark, from 30 minutes before to 60 minutes after a release wave | Commute disruption                |
| Flash-flood risk | JPS gauge rain and level                               | More than 60 mm in 2–4 hours (JPS's flash-flood note), or the level at Waspada, 31.15 m                                                                           | Commute disruption, flood note    |
| Silent input     | Every feed                                             | No reading for two intervals, or an error row                                                                                                                     | Nothing; printed on every call    |

- **Release waves, not fixed windows:** the commute window is wherever the timetable releases students. In the week of 28 October to 3 November there were 72 weekday waves of 10 or more physical sessions; heavy rain hit 4 of them, all on 2 November between 14:30 and 15:45 (124 sessions).
- **Dropped clauses:** the Sg. Kuyoh level stayed between 26.361 and 26.386 m all week, 1.6 m under Normal, even on the 81.5 mm day, so a level clause rarely says anything; bus slowdowns need a protobuf decoder for GTFS Realtime and duplicate the rain signal, so they wait for later.

### Connectors and actions

| Connector                        | 1P/3P/MCP | Mode                                                         | Job                                                                                        |
| -------------------------------- | --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Google Drive                     | 1P        | Trigger (new file in `crossings/`); read (file metadata)     | Starts clause-crossing runs; holds the camera frames each evidence record links to         |
| Google Sheets, via Drive actions | 1P        | Read (**Get cell values**)                                   | Clause sheet, readings and decision ledger, session counts per release wave                |
| Gmail                            | 1P        | Trigger (**When an email is received**); write (send, reply) | Requests in; notices, the Registrar memo and evidence replies out, after approval          |
| Google Calendar                  | 1P        | Write (create event)                                         | The public operating-mode calendar that lecturers subscribe to in Outlook or Google        |
| Jira Cloud (Free, team site)     | 3P        | Write (create issue, create comment); read (search)          | Decision register: one issue per non-normal call, with outcome grades; the KPT audit trail |
| Custom MCP server                | MCP       | Not used                                                     | Add-on only if the organisers lift the organisation policy                                 |

Platform check against the research, as of November 2026:

- **Schedules** with cron and a time zone, the **Drive** and **Gmail** event triggers polled every 5–10 minutes, and the manual `@` run with input fields are all documented ([triggers][ge triggers]).
- **Sheets reads and writes** (**Get cell values**, **Update cell values**) have been GA on the Drive connector since 12 October 2026; Gmail send and reply, Calendar create event, and Jira Cloud create issue and comment are documented actions ([actions][ged actions]).
- **Approval:** scheduled runs that email other people pause for review, and connector writes from a workflow require human review ([unattended runs][ge unattended]); the approval page documents the **Needs Review** status but not who may approve ([HITL steps]), so, **Inference:** the workflow owner's seat is the approver.
- **Reading an image from Drive is not verified:** the Drive connector lists **Read file content** and **Download file content** ([Drive connector]), but no page or release note says an agent node passes image bytes to the model. Redesign: the phone scores visibility itself and posts numbers; a Drive image check inside the workflow is tested on day one and stays off the critical path. A second-opinion score through the Gemini API is limited to decision points, because a free-tier key hit a limit of 20 requests a day for Gemini 3.8 Flash on 4 November.
- **Live, not indexed:** the Sheets are read through actions at query time, never through an ingested data store that would answer from an old copy ([federated versus ingestion][ged federated]).
- **Accounts:** Drive, Gmail and Calendar connectors need a Workspace account, not `@gmail.com` ([account limits][ged accounts]).

[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
[Drive connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive

### Cloud, IoT, and network

- **Cloud:** Gemini Enterprise workflows carry the decision: three schedules, two event triggers and a manual run, with step traces in the **Runs** tab ([run history][ge runs]). Apps Script is the feeder and web-app ingest; Sheets and Drive hold the ledger and frames; Jira Cloud holds the register. A reviewer sees several days of runs, each listing the clauses it read and the mode it chose.
- **IoT, the team's own camera station:** an old Android phone on a charger at a high window (the campus building, which OpenStreetMap lists at 10 levels, or a teammate's high-rise in Bukit Jalil) keeps a Chrome page open with `getUserMedia` and the [Screen Wake Lock API]. Every 10 minutes it masks the lower third of the frame so no people appear, measures the contrast of fixed landmarks against the sky, and converts it to a visibility estimate with Koschmieder's law against a clear-day reference ([visibility]); landmarks in one view at known distances, for example a building about 1 km away and the city skyline about 10 km away, separate heavy rain from haze (**Inference:** measure the distances from the actual window on day one). It posts the numbers and the JPEG to the Apps Script web app ([phone path][ged sheets], [browser sensors][iot phones]).
- **IoT, optional board:** a Raspberry Pi Pico 2 W with the [Grove HM3301] laser PM2.5 sensor (I2C, 3.3 V) at the camera window posts 1-minute PM2.5. Cytron listed the HM3301 at RM159 under "Stock Clearance" on 4 November; the PMS5003 returned no product there. Ordered on 4 November it may arrive 6–9 November ([lead time][iot lead time]), so nothing depends on it.
- **IoT, public telemetry:** DOE stations, MET warnings and the JPS gauge sit beside the camera, each with its own reading age.
- **Why the camera changes the decision:** the official index is a 24-hour average, and on 25 October a local sensor showed clean air two hours before the official API left Unhealthy, and the API stayed at 80–96 all day; in storms, the camera confirms what the gauge 0.9 km away measures and shows it on campus. **Inference:** in the monsoon the gauge carries the rain rate and the camera corroborates and documents it; in haze the camera and board lead the official index.
- **Network:** each row stores the device timestamp and the receipt time, so every reading carries its own latency; the phone page buffers frames in IndexedDB when offline and uploads them with their original timestamps; every call prints each input's age, such as "camera silent 25 min". The phone uses a 4G hotspot, because nothing public says headless devices can join OnBoard@APU ([campus Wi-Fi][iot wifi]).

[Screen Wake Lock API]: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
[visibility]: https://en.wikipedia.org/wiki/Visibility
[Grove HM3301]: https://my.cytron.io/p-grove-laser-pm2p5-dust-sensor-hm3301

### Real data

Every source was fetched between 00:16 and 00:45 MYT on 4 November 2026; raw responses are kept outside the repo. Live sources feed the product; replayed ones only back the backtests and the evaluation, labelled as replays ([data rulings][context decisions]).

| Source                                               | Live or replayed     | Cadence         | Licence or terms                              | Smoke test, 4 Nov 2026                                                                                               |
| ---------------------------------------------------- | -------------------- | --------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [DOE APIMS] `mapcaqm`                                | Live                 | Hourly          | No terms published; undocumented endpoint     | 200 at 00:16 (first call 19.6 s); 68 stations; Cheras `CA16W` API 60 Moderate at 00:00                               |
| DOE APIMS `apitablehourly`, KL                       | Live, last 24 h only | Hourly          | As above                                      | 200 at 00:17; 48 rows; Batu Muda 75 at 00:00; no history beyond a day, so the feeder must log it                     |
| [MET warnings] (data.gov.my)                         | Live                 | When issued     | CC BY 4.0                                     | 200 at 00:16; Thunderstorms Warning issued 23:50 naming W.P. Kuala Lumpur, to 04:00; holds current warnings only (3) |
| [MET forecast] for KL (data.gov.my)                  | Live                 | Daily           | CC BY 4.0                                     | 200 at 00:16; thunderstorms every afternoon 4–9 Nov; rain all day 5 Nov                                              |
| [JPS KL gauge] `0232901RF` and `0232901WL`, 5-minute | Live, 7-day window   | 5 min           | No terms found; undocumented JSON             | 200 at 00:18; 2,020 rows from 28 Oct; 7 mm in the 5 min to 00:05; level 26.366 m against Normal 28.00                |
| [Public Infobanjir] KL rain and level tables         | Live                 | 15 min          | No terms found                                | 200 at 00:16; same station, daily totals 7.5, 81.5, 0, 16.5, 65 and 39 mm for 29 Oct–3 Nov                           |
| [APU timetable feed]                                 | Live                 | As APU edits it | APU Terms of Use: written permission needed   | 200 at 00:17; 31,606 rows to 22 Nov; 554 physical sessions on Wed 4 Nov, 150 ending 16:30–19:15                      |
| Team camera station                                  | Live from 5 Nov      | 10 min          | Team's own; published with provenance         | Not running yet                                                                                                      |
| Team PM2.5 board                                     | Live if it arrives   | 1 min           | Team's own                                    | Cytron HM3301 page 200 at 00:25, RM159; PMS5003 search returned no product                                           |
| [Sensor.Community archive], sensor 101147            | Replayed (backtest)  | About 2.5 min   | DbCL, per the site footer                     | Live API 200 at 00:17; daily archive files 200 for 16 Oct–2 Nov, 404 before                                          |
| [MET Malaysia on X] warning graphics                 | Replayed (backtest)  | When issued     | X terms                                       | 282 graphics 1 Oct–3 Nov through a signed-in web session; X's API returned 402 (credits depleted)                    |
| [Malaysia Haze Monitor] hourly API log               | Replayed (backtest)  | Hourly          | No licence stated; counted, not redistributed | 200; 47,532 rows, 3 Oct–3 Nov, gap 10–12 Oct                                                                         |

- The MET warning endpoint keeps no history and APIMS keeps a day, so the feeder's own ledger becomes the only record from 4 November; the Internet Archive returned 503 when checked for older warning snapshots.
- Rows from the timetable carry lecturers' names and account names; the feeder drops both at ingest and keeps only counts per block and time.

[DOE APIMS]: https://eqms.doe.gov.my/APIMS/main
[MET warnings]: https://api.data.gov.my/weather/warning/
[MET forecast]: https://developer.data.gov.my/realtime-api/weather
[Public Infobanjir]: https://publicinfobanjir.water.gov.my/rainfalldata/Wilayah%20Persekutuan%20Kuala%20Lumpur
[APU timetable feed]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable

## Why people will use it

- **Habit loop:** the cue is a 20:00 email or calendar entry with tomorrow's call and a 15:30 note before the exit wave, in the inbox and calendar lecturers already open; the action is a ten-second read and the lecturer's own choice; the reward is no surprise at 17:45, and a dated record to point at when marking Late or Absent With Reason.
- **Channel:** Gmail notices and an ICS calendar that Outlook and Google Calendar both subscribe to, so recipients install nothing and need no Gemini Enterprise seat; only the duty desk holds one.
- **Asking is the second habit:** "what's tomorrow's call?" and "evidence for <window>" by email cost nothing to try, and the answer cites readings rather than opinions.
- **Frequency:** storms covered the exit wave on 20 of 24 October weekdays and MET forecasts them every afternoon into November; haze returns in the dry season, as it did from August to October 2026. The call has work in both seasons and is mostly Normal between them.
- **After the team graduates:** FSSW keeps the seat and edits the clause sheet; the GDGoC APU committee inherits the feeder and camera station as a yearly handover; the hardware costs under RM200 and the software runs on free tiers.

## Why the crowd won't build it

- **The simulated crowd builds dashboards:** air quality is 2.2% of 780 simulated ideas, built on new sensors and LoRa; flood warning is 3.2% and sits in the crowded off-campus tier ([crowd clusters]). Only 3% use public feeds, most model answers tell teams to simulate data, and 1% combine an unattended run, a named owner and a measured baseline ([crowd gaps]).
- **GitHub, searched 4 November:** "haze malaysia" returns 33 repositories, all trackers or dashboards, such as an API map, a Power BI haze monitor, a crowdsourced haze-report app and a "haze in cigarettes" page. The closest is HazeLens ASEAN, a regional "environmental decision-intelligence" app on Cloud Run that follows hotspots towards communities, not an institution's call. "air quality school closure", "teaching mode haze", "weather disruption attendance", "school closure air quality agent" and "storm warning class" return none.
- **Analogues:** 57 "snow day predictor" repositories guess closures for parents; none makes or records the institution's call.
- **Devpost:** web searches found no haze, closure-decision or snow-day decision agent.
- **This hackathon:** `apu-smart-shuttle`, created 1 November, promises "traffic and rain alerts" in a shuttle tracker; Skyclause has no tracker, and its output is a logged decision with an owner and an approval.
- **Name:** no GitHub repository and no product found under "Skyclause" or "Sky Clause" on 4 November.
- **Inference:** the scarce combination is a ministry hook, the timetable's release waves, a local sensor that beats a lagging index, and an approved record; each alone is easy, and the crowd stops at the alert.

## Scores

### Component scores

Weights are this team's inference from NTT DATA's spoken points; NTT DATA gave no weights or scale.

| Component      | Weight | Score | Reason                                                                                                                                                               |
| -------------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact         | 15     | 4     | 508–563 physical sessions a weekday, 139–174 in the exit wave, plus a KPT record management lacks; humans still decide, and FSSW is unproven                         |
| Connectors     | 15     | 4     | Drive trigger, Sheets reads, Gmail trigger and send, Calendar, Jira create and comment all do work; no Microsoft 365 tenant, no MCP                                  |
| Research       | 10     | 4     | Lecturers, organisers and club presidents are reachable; 72 release waves a week give real items; FSSW not yet reached                                               |
| Time to impact | 10     | 3     | Lecturer and organiser pilots start this week; office adoption is an assumption; haze clauses get a live season only after six months                                |
| Workflow       | 15     | 5     | Three schedules, two documented event triggers, unattended logging, one approval per non-normal call; KL warnings covered the exit wave on 20 of 24 October weekdays |
| Theme          | 10     | 4     | Own camera station leads the lagging index and documents storms; network shown per reading; in the monsoon the public gauge carries the rain rate                    |
| Originality    | 10     | 4     | Crowd builds haze trackers and flood alerts; nobody models the institution's call on release waves with an audit trail                                               |
| Real usage     | 10     | 3     | Zero install, daily cue in storm weeks and the haze season; depends on one desk holder, and students only receive notices                                            |
| Demo and pitch | 5      | 4     | Storms forecast every afternoon of the build week; real 30 Oct and 2 Nov evidence windows; reviewer email replies wait for approval                                  |

Weighted total: 395 of 500, or 79 out of 100.

### Gates

| Gate                                | Result | Why                                                                                                                        |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Real public data only               | Pass   | DOE, MET, JPS and the timetable live; the team's own sensors; replays labelled; no personal data, no faces in frame        |
| Buildable by 10 Nov in GE limits    | Pass   | Drive event instead of a webhook; 5–10 min polling fits; approvals designed in; image reading not relied on                |
| Core lives in Gemini Enterprise     | Pass   | The feeder only computes clause states; the workflow picks the mode, scopes waves, drafts and writes behind approval       |
| IoT real and visible                | Pass   | The camera station posts frames and visibility every 10 minutes; latency and silence are on every call                     |
| Owners reachable for 6–8 interviews | Pass   | Lecturers, GDGoC APU organisers, club presidents and commuters this week; FSSW attempted, not required                     |
| Reviewer can trigger it             | Pass   | Email the inbox, or `@Skyclause` in the app; both answer from the live ledger                                              |
| No-card path                        | Pass   | Apps Script, Sheets, Drive, Gmail and Calendar on the licensed domain, Jira Cloud Free, GitHub Pages, Gemini API free tier |

### Strongest objections and answers

- **"It just forwards MET warnings."** Answered: warnings covered the exit wave on 20 of 24 weekdays; with local confirmation, one week's five warned weekdays became one call, on the day heavy rain actually met a release wave.
- **"Its IoT is other agencies' sensors."** Answered in part: the camera station is the team's own and leads the official index in haze (25 October); in storms the public gauge still measures the rain rate and the camera corroborates it.
- **"Auto-excused lateness lets students game attendance."** Answered: nothing is excused; the record states measured facts and the lecturer chooses Late or Absent With Reason, as AttendiX already lets them.
- **"The Registrar or VC can't be interviewed."** Answered: they are approvers of one rare mode by email reply, not users; the users are lecturers, organisers and FSSW.
- **"No haze during assessment, so the log says nothing."** Answered: MET forecasts thunderstorms every afternoon of 4–9 November; the haze clauses are shown on October's real readings, labelled as a replay.
- **"Approvals break the 24/7 agent."** Conceded in part: the platform pauses any run that emails people; Skyclause logs every evaluation unattended and asks for one click only on non-normal calls.
- **"Gmail and Calendar aren't APU's Microsoft 365."** Conceded: no tenant is available to students; Outlook subscribes to the calendar, and Jira mirrors APU's Jira Service Management help centre.
- **"An office won't adopt a student tool in three months."** Conceded for FSSW; lecturers and organisers use it for their own sessions with no approval from APU.
- **"Seasonal."** Conceded in part: the call is busiest in wet weeks and the haze season, and mostly Normal between them; a Normal call still logs the monitoring KPT asked for.
- **"Undocumented endpoints can vanish mid-assessment."** Answered by design: each failure becomes an error row printed on the call, with no fallback value; MET comes through documented data.gov.my.
- **"Workflows can't read your photos."** Answered: the phone scores visibility itself; a Drive image check is a day-one test, not a dependency.

## Research plan

- **Round one, 5–6 November (four interviews):** two lecturers who teach 08:30 or 17:45 sessions (how they handled the October haze and the 2 November rain, how they mark Late), one GDGoC APU organiser (how the 17 November final and its transport are planned for rain), one president of an outdoor or martial-arts club (who decided the haze closures, on what reading).
- **Round two, 7–8 November (three or four interviews):** two commuting students who use the LRT and shuttle, one more lecturer shown a real call and evidence record, and the FSSW manager through the contact APU publishes (if unreachable, a Student Services counter officer); ask each "would you act on this, and who else must agree?".
- **Timed baseline:** three people (a lecturer, a student, a teammate) each assemble by hand the evidence for 2 November 14:00–16:30 from APIMS, MET, Infobanjir and X, timed with a stopwatch; then the same task by emailing Skyclause, timed including the approval.
- **Second baseline:** during 4–8 November storms, record the minutes from each MET warning or gauge crossing to any APU communication on its public channels, and count the warnings with none.
- **Calls, 30–50 real items:** one item is a weekday release wave of at least 10 physical sessions; the positive class is "heavy rain (31 mm in 60 minutes) within 30 minutes before to 60 minutes after the release, or official API 101 or more at release". Take every positive and a random sample of negatives from 28 October to 13 November (about 72 waves a week), plus the 22 weekday mornings of October replayed from the API log. Two teammates label each from the raw ledger before the call is revealed, settle disagreements, and report precision, recall and the false-alarm ratio with n and a Wilson interval ([accuracy method][ri accuracy]).
- **Evidence replies, 30 real windows:** two teammates check every fact in each reply (warning times, rain totals, API values, session counts) against the raw source and report the share correct.
- **What would change the design:** if lecturers say they never act on a 15:30 note, move the exit-wave call to the clause-crossing event only; if FSSW wants queue arrangements rather than teaching modes, add a queue column to the clause sheet.

## Time to impact

- **By 3 months (early February 2027):** FSSW holds the seat and signs off the clause sheet; the desk sends calls through the monsoon; pilot lecturers and organisers receive them; evidence replies answer attendance and EC questions; the Jira register is the KPT record. Owner: FSSW manager, with a School of Technology lecturer as academic sponsor.
- **By 6 months (early May 2027), measured:** minutes from crossing to approved notice; hit rate and false-alarm ratio on at least 300 graded release waves; minutes to assemble evidence before and after; the share of notified lecturers who acted, from a one-question survey. The haze clauses get their first live test only in the 2027 dry season, after this mark.
- **Owners:** FSSW (business owner), APU ITSM (accounts and connectors), APU's data protection officer (PDPA), and the GDGoC APU committee (feeder and camera maintenance).
- **Assumptions:** Gemini Enterprise licences continue after the sponsored trial; APU gives written permission for the timetable feed and the camera position; FSSW agrees to a pilot; the owner sets a false-alarm ceiling before go-live; the undocumented APIMS and JPS endpoints stay up or get documented replacements.

## Demo and review

A 3:45 video recorded from the live system on 9 November, labelled with its capture date ([minute plan][ri minute]):

1.  **0:00–0:15:** slate with the capture date; "Skyclause makes APU's haze-and-storm call, with the record."
1.  **0:15–0:40:** the problem in numbers: API above 100 on 20 of 31 days from 3 October; KL warnings over the exit wave on 20 of 24 weekdays; no APU rule; the lecturer's "college management don't think like that".
1.  **0:40–1:10:** the camera station at the window, a frame and its visibility row next to the official API, latency per row, and an error row if a feed failed that day.
1.  **1:10–1:55:** a real 15:30 run from the build week in the **Runs** tab: clauses fired, waves and sessions, **Needs Review**, approval, then the lecturer's email, the calendar entry and the Jira record.
1.  **1:55–2:25:** an email asking "evidence for 2 Nov 14:00–16:30" and the reply with 62.5 mm, the warning times and 155 sessions; then `@Skyclause what's tomorrow's call?` in the app.
1.  **2:25–2:55:** impact: the timed baseline before and after, precision and recall with n, the haze backtest, and the 3- and 6-month plan.
1.  **2:55–3:25:** research: who was interviewed and what changed (no excusal; owners decide; release waves instead of fixed windows).
1.  **3:25–3:45:** how the team worked; app, repo and video links; capture date again.

How a reviewer triggers it themselves:

- **Email** the team inbox with the subject "what's tomorrow's call?" or "evidence for 12 Nov 17:00–19:00"; the reply follows the duty desk's approval, staffed 08:00–22:00 MYT from 11 to 14 November.
- **In the Gemini Enterprise app,** run `@Skyclause` with the same question for an instant read-only answer, once the reviewer has a seat, the role and the shared workflow ([reviewer access][ge reviewer]).
- **Without a seat,** subscribe to the public operating-mode calendar, or ask to be invited to the Jira register.

## Build plan

| Day        | Build                                                                                                                                                                                                                           | Research and checks                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Wed 4 Nov  | Riskiest first: licence working; a scheduled workflow reading a Sheet, pausing at Approval and sending one Gmail; test Drive image reading; feeder for APIMS, MET, JPS and timetable with error rows; order Pico 2 W and HM3301 | Ask organisers for timetable permission, reviewer emails and the MCP policy; recruit 6–8 interviewees |
| Thu 5 Nov  | Camera page (camera, wake lock, mask, contrast, IndexedDB buffer) posting to Apps Script; clear-day reference; clause sheet v1; 15:30 workflow with Jira and Calendar writes                                                    | Round one interviews; first real storm runs                                                           |
| Fri 6 Nov  | Drive-event clause-crossing workflow; Gmail request workflow; `@` manual run; nightly grading                                                                                                                                   | Round one done; timed evidence baseline                                                               |
| Sat 7 Nov  | 20:00 and 06:45 calls; auditor (silence, missing artefacts, credential day 12); Registrar escalation path                                                                                                                       | Round two; start labelling release waves                                                              |
| Sun 8 Nov  | Board on the window if it arrived; README, deck and diagram drafts                                                                                                                                                              | Score calls and evidence replies; confirm every member registered before midnight                     |
| Mon 9 Nov  | Feature freeze; refresh schedule credentials; record the video from the live system                                                                                                                                             | Test reviewer access and `@Skyclause` from a non-team account                                         |
| Tue 10 Nov | Submit early in the day; keep everything running                                                                                                                                                                                | Watch quotas and the auditor's emails                                                                 |

- **No-card path:** every part above runs free: Apps Script, Sheets, Drive, Gmail and Calendar on the licensed Workspace domain, Jira Cloud Free, the phone page on GitHub Pages, and the Gemini API free tier only for decision-point photo checks, which carry no personal data ([sandboxes][ged sandboxes]).
- **If the licence is late:** build the feeder, camera station, clause sheet and grading first; they log real data from day one and the workflow attaches to the same Sheets.

## Risks

- **Haze stays away:** storms carry the live demo; the haze clauses are shown on October's real readings, labelled as a replay.
- **The storm clause over-fires or under-fires:** warnings alone covered 20 of 24 weekdays; require local confirmation, publish the weekly false-alarm ratio, and let the owner move the 31 mm threshold.
- **Approval latency at the exit wave:** a crossing at 17:20 waits 5–10 minutes for the trigger and then for a click; roster the duty desk from 15:30 to 19:15 and measure the delay rather than hide it.
- **Undocumented endpoints:** APIMS and the JPS KL JSON could change without notice ([APIMS notes][pds apims]); every failure shows as an error on the call, and the 15-minute Infobanjir table appears as its own input with its own status, never as a silent substitute.
- **Permissions (APU Terms of Use):** the timetable feed and knowledge-base content need written permission ([APU public documents]); ask the organisers in `#help-desk` on 4 November. A camera on campus needs FSSW's permission; otherwise use a teammate's window off campus.
- **Privacy (PDPA):** the feeder drops lecturer names and account names at ingest; the camera masks the lower third and points at the skyline, so no faces or other biometric data are captured ([PDPA notes][jp pdpa]); recipients are an opt-in list; evidence requests keep only the window asked for; frames are deleted after one semester. Nothing personal goes to the Gemini API free tier.
- **Platform limits:** credentials expire every 14 days (refresh on 9 November, before assessment); event-triggered runs that hit quota aren't retried, so the auditor reports gaps ([limits][ge limits]); reading images from Drive is undocumented; reviewers outside the organisation may need an IAM exception; a reviewer's own `@` run may not read a Sheet owned by another domain, so the email path is the dependable self-trigger.
- **Hardware:** the board may not arrive before the deadline ([boards][iot boards]); the camera phone may sleep or overheat at a window, so the auditor alarms on silence and every call prints its age.
- **Owner declines:** lecturers and organisers keep using it for their own sessions; the KPT record still accumulates.

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md): rules, judging points, Gemini Enterprise limits, and the recommended shape.
- [X research][x haze], [Reddit research][reddit haze] and [other platforms research][other rain]: the haze, flood and attendance evidence.
- [Crowd baseline](/docs/research/crowd-baseline.md): the simulated crowd and APU student tools.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise-data.md): triggers, approvals, actions, and live-data paths.
- [Public data sources](/docs/research/public-data-sources.md), [IoT and network](/docs/research/iot-and-network.md), and [APU public documents]: feeds, sensors, boards, and APU's rules.
- [Research and impact](/docs/research/research-and-impact.md) and [judging and pitching](/docs/research/judging-and-pitching.md): baselines, accuracy, the video, and privacy.
- Key outside sources: [DOE API calculation], [The Edge, 22 Oct][edge api], [Malay Mail, 7 Oct][mm moe], [The Star, 8 Oct][star moe], [MET Malaysia on X], [JPS KL gauge], [Sensor.Community archive].

[x haze]: /docs/research/social-x.md#haze-and-air-quality-decisions
[x floods]: /docs/research/social-x.md#event-crowds-and-flash-floods-around-bukit-jalil
[reddit haze]: /docs/research/social-reddit.md#haze-heat-and-flash-floods
[reddit attendance]: /docs/research/social-reddit.md#attendance-moodle-locks-and-the-80-visa-rule
[other rain]: /docs/research/social-other-platforms.md#heat-rain-and-flash-floods
[crowd clusters]: /docs/research/crowd-baseline.md#clusters-and-shares
[crowd gaps]: /docs/research/crowd-baseline.md#what-the-crowd-structurally-misses
[ge triggers]: /docs/research/gemini-enterprise.md#triggers-and-schedules
[ge unattended]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in
[ge runs]: /docs/research/gemini-enterprise.md#run-history-as-evidence
[ge limits]: /docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build
[ge reviewer]: /docs/research/gemini-enterprise.md#reviewer-access
[ged actions]: /docs/research/gemini-enterprise-data.md#actions-and-write-back
[ged sheets]: /docs/research/gemini-enterprise-data.md#phone-or-board-to-google-sheets
[ged feed]: /docs/research/gemini-enterprise-data.md#public-feed-polled-into-sheets
[ged federated]: /docs/research/gemini-enterprise-data.md#federated-search-versus-ingestion
[ged accounts]: /docs/research/gemini-enterprise-data.md#edition-and-account-limits
[ged sandboxes]: /docs/research/gemini-enterprise-data.md#free-sandboxes
[iot phones]: /docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser
[iot boards]: /docs/research/iot-and-network.md#cheap-boards-from-malaysian-retailers
[iot lead time]: /docs/research/iot-and-network.md#hardware-lead-time
[iot wifi]: /docs/research/iot-and-network.md#apu-campus-wi-fi
[pds apims]: /docs/research/public-data-sources.md#doe-apims-air-pollutant-index
[ri accuracy]: /docs/research/research-and-impact.md#measuring-an-agents-accuracy-honestly
[ri minute]: /docs/research/research-and-impact.md#minute-plan
[jp pdpa]: /docs/research/judging-and-pitching.md#malaysias-pdpa-and-the-2024-amendment
[context decisions]: /docs/CONTEXT.md#decisions-so-far
[APU public documents]: /docs/research/apu-public-documents.md
[mm moe]: https://www.malaymail.com/news/malaysia/2026/10/07/haze-education-ministry-orders-state-and-district-education-offices-schools-to-monitor-haze-act-based-on-api-readings/238138
[star moe]: https://www.thestar.com.my/news/nation/2026/10/08/haze-schools-must-close-if-api-exceeds-150-for-three-days-says-education-ministry
[Malaysia Haze Monitor]: https://github.com/herr-hollis/Malaysia-Haze-Monitor
[DOE API calculation]: https://eqms.doe.gov.my/Documents/APIMS/API_Calculation.pdf
[edge api]: https://theedgemalaysia.com/node/822832
[Sensor.Community archive]: https://archive.sensor.community/
[MET Malaysia on X]: https://x.com/metmalaysia
[JPS KL gauge]: https://infobanjirjpskl.water.gov.my/Rainfall/Station/75?districtId=0
