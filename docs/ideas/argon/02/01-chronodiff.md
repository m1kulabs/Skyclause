# ChronoDiff: timetable change and room-conflict reconciler

ChronoDiff watches APU's public class timetable feed from an off-campus Raspberry Pi 5 (8 GB). It flags short-notice changes, room double-bookings, holiday collisions, and missed last shuttles, and sends each proposed fix through a Gemini Enterprise workflow that a scheduler approves before anything is written to Jira Cloud, SharePoint, Outlook, Google Calendar, or Gmail. The owner is APU's Academic Administration (`AA`) office, with intake representatives as the audience; the track is Intelligent Automation & Digital Transformation, and the product also serves Smart Campus & Student Experience.

Contents:

1.  [Problem and evidence](#problem-and-evidence)
1.  [Why existing tools miss it](#why-existing-tools-miss-it)
1.  [How it works](#how-it-works)
    1.  [Edge and network](#edge-and-network)
    1.  [Connectors](#connectors)
1.  [Day-to-day workflow](#day-to-day-workflow)
1.  [Baseline, metrics, and 3- and 6-month plan](#baseline-metrics-and-3--and-6-month-plan)
1.  [Boundaries](#boundaries)
1.  [Verification notes](#verification-notes)
1.  [See also](#see-also)

## Problem and evidence

- **Timetables change often:** across platforms other than Reddit and X (Lowyat.NET, Google Maps, job-review sites, and others), "Timetable churn and a compressed calendar" ranks third among APU themes. It is one of three themes tied at the top score of 9, with frequency 3 and intensity 3 ([theme ranking]). A diploma student wrote "The time table changes every week", with changes "announced by the lecturers or administrators" (4 March 2026). Another student "got marked absent" after being given another major's timetable (2 March 2026) ([Google Maps reviews]).
- **Students distrust APSpace's timetable:** the official app `my.edu.apiit.apspace` is rated 3.27 from 381 ratings on [Google Play] and 3.62 from 143 on the [App Store] (read 3 November 2026). Of the 119 newest Play reviews, 15 mention the timetable, schedule, or classes and 18 mention attendance. The most-liked review (52 likes, December 2023) is stuck on an update screen and "can't see my new schedule" ([APSpace reviews]).
- **The empty-room data is doubted too:** a 3 June 2026 App Store review (3 stars) says the app shows classes "that I don't have in current semester", a problem faced for "almost more than 1 year". It adds that there is "no realtime updated class schedule timing" and "some of the empty class shows is fake" ([App Store]). A former foundation student on r/malaysiauni (3 June 2025) describes a classroom finder that shows rooms as empty when they are occupied ([former student's comment]).
- **Students keep building their own fixes:** on 3 November 2026 a [GitHub code search] for `"open-ws/weektimetable"` returned 32 files in 26 repositories, 17 of them pushed in 2026. They include [cron-apu-timetable] (40 forks), `osscv/APLife` (6 stars), [APSync], [apspace-to-calendar], [ApSpace-Discord-Bot], `CEOofYap/timetable`, and `chengkangzai/laravel-apu-schedule`; APU timetable tools go back to 2013 ([student tools]). The Discord bot's author built it because a parent kept asking "Is the timetable still the same as last week?" ([ApSpace-Discord-Bot]).
- **Missed classes cost students:** APU's 80% attendance rule can bar a student from exams and puts international students' visa renewal at risk. The r/malaysiauni sample holds 24 attendance titles from 2024 to 2026, at least 18 of them about the 80% threshold ([attendance evidence], [exam bar thread]).
- **Manual rescheduling is slow elsewhere too:** a June 2026 study at Kwame Nkrumah University, Zambia, recorded a grouped-course reschedule confirmed through student representatives that took at least 2 hours 43 minutes. Venue confirmation took 21 to 44 minutes in documented cases, and one confirmation arrived after the 07:00 class start ([RSIS study]).

[theme ranking]: /docs/research/social.md#other-platforms-theme-ranking
[Google Maps reviews]: https://www.google.com/maps/place/?q=place_id:ChIJ2SVQebtKzDERaKlLcSoYNxw
[Google Play]: https://play.google.com/store/apps/details?id=my.edu.apiit.apspace
[App Store]: https://apps.apple.com/my/app/apspace/id1413678891
[APSpace reviews]: /docs/research/competition.md#the-official-apspace-app
[former student's comment]: https://www.reddit.com/r/malaysiauni/comments/1l19a16/comment/mvov59z/
[GitHub code search]: https://github.com/search?q=%22open-ws%2Fweektimetable%22&type=code
[ApSpace-Discord-Bot]: https://github.com/notedwin-dev/ApSpace-Discord-Bot
[student tools]: /docs/research/competition.md#repositories-and-adoption
[attendance evidence]: /docs/research/social.md#attendance-moodle-locks-and-the-80-visa-rule
[exam bar thread]: https://www.reddit.com/r/malaysiauni/comments/1w5zjkp/apu_attendance_exam_bar/

## Why existing tools miss it

- **The crowd:** none of 780 simulated hackathon ideas offers student-facing timetable sync or change alerts; 6 mention rescheduling or room changes, mostly from the administrator's side ([crowd gaps]). Room booking and timetable optimisation is a thin cluster at 2.7% ([crowd clusters]). NTT DATA's APU GenAI Assistant demo has a current-student persona that covers the timetable, built on sample data ([NTT DATA demos]).
- **Student scripts:** they serve one user or a few intakes and poll slowly: [cron-apu-timetable] on Fridays at 02:00 UTC, [APSync] every 12 hours, [apspace-to-calendar] every 3 days. They write a calendar without checking rooms, holidays, or shuttles ([feed users]).
- **No CDN on the feed:** the [timetable feed] is served by Amazon S3 with no `Cache-Control` header and no CDN in front, so every full fetch moves the 1,138,362-byte gzip body (17,153,209 bytes decoded) at APU's cost ([feed endpoints]).
- **Commercial suites:** Coursedog and Ad Astra/Infosilem run scheduling and notifications inside an institution's own registrar systems ([Coursedog notifications], [RSIS study]). Neither reads APU's public feed against its holiday and shuttle feeds.

[crowd gaps]: /docs/research/competition.md#what-the-crowd-structurally-misses
[crowd clusters]: /docs/research/competition.md#clusters-and-shares
[NTT DATA demos]: /docs/research/competition.md#demos-already-built-under-the-ntt-data-name
[Coursedog notifications]: https://coursedog.my.site.com/support/s/article/WORKFLOWSWorkflowNotifications67fd8f70134e1

## How it works

### Edge and network

- **Conditional poll:** every 15 minutes the Pi requests the [timetable feed] with `If-None-Match: <last ETag>`. An unchanged object returns `304` with an empty body. The ETag is the MD5 of the gzip bytes; on 5 November 2026 it was `c9d8d2384658e5771dcb0ce8a24842dd`, with `x-amz-version-id` `JqK4wu.uyPqZPWAZycrtjIGla_sv5tHe` and `Last-Modified` 28 October 2026 09:39:49 MYT ([feed endpoints], [change behaviour]).
- **Side feeds:** the Pi also polls [intake listing] (2,021 codes on 4 November, 2,020 on 5 November), [holiday feed] (29 entries for 2025 and 32 for 2026, each tagged `all`, `students`, or `staff`), and [shuttle feed] (set "WEF 22 Oct 2026", 253 trips). `api.apiit.edu.my` sends no ETag, so the Pi hashes each body to spot changes.
- **Diff:** on a new ETag the Pi decompresses the 17 MB JSON in memory, drops `NAME`, `SAMACCOUNTNAME`, and `LECTID`, and diffs on the other 15 of the 18 fields, such as `INTAKE`, `GROUPING`, `MODID`, `DATESTAMP_ISO`, `TIME_FROM_ISO`, `TIME_TO_ISO`, `ROOM`, and `LOCATION` ([feed schema]). The current copy has 31,606 rows for 1,045 intakes from 26 October to 22 November 2026; co-taught rows differ only in lecturer, so it de-duplicates to 31,569 after the drop ([row counts], [change behaviour]).
- **Four rule checks before any model call:**
  1.  `SHORT_NOTICE_SHIFT`: `TIME_FROM_ISO`, `TIME_TO_ISO`, `ROOM`, or `LOCATION` changes within 48 hours of the class start.
  1.  `ROOM_DOUBLE_BOOKING`: two different `MODID`s in the same physical `ROOM` with overlapping `[TIME_FROM_ISO, TIME_TO_ISO]` on the same date. Online rooms start with `ONL` and are skipped.
  1.  `HOLIDAY_COLLISION`: a session on a date tagged `all` or `students` in the holiday feed.
  1.  `TRANSIT_GAP_VIOLATION`: a session's end moves past the last weekday departure from APU on a shuttle route. In the current set these run from 18:15 (Bayu Jalil) to 21:45 (LRT Bukit Jalil and City of Green), and no trips run at weekends ([shuttle feed]).
- **Free rooms:** for each `ROOM_DOUBLE_BOOKING`, the Pi lists rooms in the same block (the letter before the first `-` in `ROOM`, as in `B-08-01`) with no session in that window, ranks the top three, and writes them into the anomaly row of the ledger Sheet ([room codes]).
- **Transport:** the Pi stamps each diff summary with a `deviceTimestamp` and posts it over HTTPS to Cloud Run in `asia-southeast1` (Singapore). Cloud Run publishes to Pub/Sub, and a BigQuery subscription writes the rows; Pub/Sub `publishTime` minus `deviceTimestamp` gives the per-hop latency ([shared edge design], [Cloud Run locations], [PubsubMessage]). The same Pi writes each anomaly row, with its free rooms, to the ledger Sheet. MQTT is an option only through a broker the team runs or a partner broker, not straight to Cloud Run or Pub/Sub.
- **Phones:** an HTTPS web app on team phones uses Geolocation and DeviceMotion to check whether a commuting team member could still reach campus before a shifted `TIME_FROM_ISO` ([phone sensors]).

[intake listing]: https://api.apiit.edu.my/student/intake_listing
[holiday feed]: https://api.apiit.edu.my/transix-v2/holiday/active
[feed schema]: /docs/research/apu.md#timetable-feed-schema
[room codes]: /docs/research/apu.md#timetable-room-codes
[shared edge design]: 00-ranking.md#shared-edge-and-network-design
[PubsubMessage]: https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/PubsubMessage
[phone sensors]: /docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser

### Connectors

1P means a first-party Google connector and 3P a third-party one. BigQuery isn't among the connectors workflows support, so no workflow step queries it; the workflow reads the Sheet the Pi writes ([workflows]).

| Connector                 | Type | Access                                | Actions                                                                                    | Role in ChronoDiff                                                                                                                                                                            |
| ------------------------- | ---- | ------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BigQuery]                | 1P   | Data store, federated query (preview) | SQL through the BigQuery MCP server, from the assistant                                    | History and analysis: seen version IDs, past diffs, and room use, asked from the Gemini Enterprise assistant, not the workflow                                                                |
| [Google Drive] and Sheets | 1P   | Actions                               | `Get cell values`, `Update cell values`, `Insert dimension`                                | Keeps the `Active_Schedule_Anomalies` ledger Sheet; new anomaly files fire the event trigger                                                                                                  |
| [Google Calendar]         | 1P   | Actions                               | `Search events`, `Create event`, `Update event`, `Delete event`                            | Patches shared intake calendars after approval                                                                                                                                                |
| [Gmail]                   | 1P   | Actions                               | `Create draft`, `Send message`, `Label thread`                                             | Sends diff digests to intake representatives                                                                                                                                                  |
| [Jira Cloud]              | 3P   | Federated search and actions          | JQL search filter; `Create issue`, `Update issue`, `Create comment`, `Change issue status` | Tracks each double-booking and holiday collision in a team-owned project standing in for `AA`'s                                                                                               |
| [SharePoint]              | 3P   | Federated search and actions          | `Get list item`, `Create list item`, `Update list item`, `Upload document`                 | Holds the approved change log and room-reallocation records on a team-controlled site                                                                                                         |
| [Outlook]                 | 3P   | Federated search and actions          | `Read Excel data`, `Edit Excel data`, `Create message`, `Send mail`, `Update event`        | Updates the master schedule workbook in OneDrive or SharePoint and drafts Microsoft 365 notices                                                                                               |
| [Confluence Cloud]        | 3P   | Federated search and actions          | CQL search filter; `Update page`                                                           | Grounds notices in the Academic Administration [AA space]'s public pages (103 on 3 November, 92 in a 5 November recount), copied by REST into a team-owned site with source URL and edit date |

- JQL and CQL are search filters in the agent node's Search For Data settings, not named actions ([workflows]).
- APU's own Confluence can't be attached, because the connector needs admin rights on the site; APU's real stack is Microsoft 365, Jira Service Management, and Confluence ([KB routes]).

[Google Drive]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive
[Google Calendar]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gcal
[Gmail]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gmail
[Jira Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[SharePoint]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint
[Outlook]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-outlook
[Confluence Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud
[AA space]: https://apiit.atlassian.net/wiki/spaces/AA/overview
[KB routes]: /docs/research/apu.md#how-each-source-reaches-an-agent

## Day-to-day workflow

1.  **Trigger:** a Schedule trigger runs hourly from 07:00 to 21:00 as a cron expression in the `Asia/Kuala_Lumpur` time zone. An Event trigger on the Google Drive connector also fires when the Pi writes a new anomaly file; events arrive after 5–10 minutes, in no guaranteed order ([workflows], [event triggers]).
1.  **Search:** a Gemini Agent node reads the open anomalies for the latest ETag, with the Pi's top three free rooms for each double-booking, using `Get cell values` on the ledger Sheet.
1.  **Human review:** an Approval step pauses the run for the `AA` scheduler's sign-off. The card shows the old and new ETag, `INTAKE`, `GROUPING`, `MODID`, `MODULE_NAME`, `DATESTAMP`, the top three free rooms in the same block, and one decision: "Approve Jira ticket, SharePoint log, and Calendar and Outlook patch?" Connector writes from agent nodes also "require human review", and scheduled runs that email or schedule other people pause for approval ([HITL steps], [workflows], [Workflow Builder limits]).
1.  **Approved writes:** `Create issue` in Jira Cloud, `Create list item` in SharePoint, `Update event` in Google Calendar and Outlook, then `Send mail` or `Send message` to the affected intake group.
1.  **Failure:** if S3 or `api.apiit.edu.my` returns an HTTP error or times out, the Pi publishes the status code, URL, and time, and the ledger row shows that error. Nothing falls back to an earlier timetable copy. Connector failures show as **Error** in the workflow's Runs tab, and event-triggered runs that fail with `RESOURCE_EXHAUSTED` aren't retried ([workflow runs], [Workflow Builder known issues]).

[workflow runs]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflow-runs
[Workflow Builder known issues]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/known-issues

## Baseline, metrics, and 3- and 6-month plan

- **Baseline:** student sync tools lag a change by up to 12 hours (APSync), 3 days (apspace-to-calendar), or 7 days (cron-apu-timetable) ([feed users]). The only timed manual reschedule found is the single 2 hours 43 minutes case in the Zambian study ([RSIS study]).
- **Detection time:** the Pi sees a new version within 15 minutes. With the Drive event trigger, the review card is ready about 25 minutes after a change at worst (15 minutes plus up to 10); on the hourly schedule alone, up to about 80 minutes (60 plus 15 plus up to 5 minutes of schedule delay) ([Workflow Builder limits], [event triggers]).
- **First run on the live feed (5 November 2026):** `HOLIDAY_COLLISION` finds none; 8 and 9 November, Deepavali and its day in lieu, tagged `all`, hold no classes ([row counts]). `ROOM_DOUBLE_BOOKING` flags one case: intake `APUMP2610` has `BM076-3-M-PC` and `CT070-3-M-NDP` in room `D-07-17` at the same times on six dates, with different lecturers. Only the scheduler can say whether that is a clash or a shared session.
- **Accuracy:** precision and recall on 30–50 real change and conflict cases, with the sample size stated ([judging points]). Cases come from live fetches. The two archived copies (10 April and 16 June 2025) cover different date windows, so they check schema stability but give no before-and-after pairs ([Internet Archive CDX]). The feed hasn't changed since 28 October, so the set grows only as new versions appear.
- **3 months:** `AA` runs the poller over every intake in the feed and publishes reviewed calendars for the November 2026 intakes: foundation, diploma, and certificate programmes on 19 November and Degree Level 1 on 24 November ([intake calendar]).
- **6 months:** CTI, which built APSpace, and `AA` put CloudFront with `Cache-Control` in front of the feed and run ChronoDiff's conflict check before each publish ([feed users]).

[judging points]: /docs/CONTEXT.md#what-ntt-data-said-it-will-rate
[Internet Archive CDX]: https://web.archive.org/cdx/search/cdx?url=s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[intake calendar]: https://www.apu.edu.my/intake-calendar

## Boundaries

- **Personal data:** `NAME`, `SAMACCOUNTNAME`, and `LECTID` cover 492 lecturers and place each one in a room for four weeks. The Pi drops all three before anything is stored, logged, or sent to a model, in line with the Personal Data Protection Act 2010 ([personal data]). ChronoDiff never reads student attendance or grades.
- **Terms:** the feed is undocumented and has no licence, and APU's Terms of Use ask for permission before "use of this Website or any of the Contents". Ask the organisers in `#help-desk` for written permission, naming the URL and the fields kept, before the demo depends on it. Request only paths named in public source code, and don't probe for others ([terms]).
- **Team-owned stand-ins:** no APU staff help during the hackathon, so Jira, SharePoint, Microsoft 365, and Confluence are team-owned, and a team member plays the `AA` scheduler. `AA` connects its own systems only in the pilot.
- **Accounts and billing:** the Drive, Gmail, and Calendar connectors need a Google Workspace organisation account ([Google sources]). BigQuery federated query is in preview and bills BigQuery compute ([BigQuery]), and the BigQuery sandbox doesn't support streaming, so the Pub/Sub path needs a billing account ([BigQuery sandbox]). Schedules need a multi-region app location, and their credentials expire every 14 days ([Workflow Builder limits]).
- **Unstable source:** the 18-field schema has held for at least 19 months, but the feed is undocumented and can change or close at any time ([row counts]).

[personal data]: /docs/research/apu.md#personal-data-in-the-timetable-feed
[terms]: /docs/research/apu.md#terms-of-use-and-robotstxt
[Google sources]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/create-data-store
[BigQuery sandbox]: https://docs.cloud.google.com/bigquery/docs/sandbox

## Verification notes

"Run" means the Gemini Deep Research report this set is based on ([ranking](00-ranking.md)). Checked on 5 November 2026 (MYT): `curl` against the timetable, intake, holiday, and shuttle feeds (headers, `304`, MD5, decoded size, fields, counts, and the rule checks above), the Internet Archive CDX index, the App Store lookup and review feed, the GitHub API for the named repositories and code search, the RSIS PDF, APU's intake calendar, the Gemini Enterprise connector, workflow, event-trigger, and limits pages, and the Cloud Run locations, pricing, and container-contract pages.

- Theme rank: run said timetable churn "tied for Rank 1"; the ranking lists it third, tied on the top score of 9.
- Store ratings: run said "as of 24 September 2026"; that is the app's last update date, and the ratings were read on 3 November (App Store 3.62 from 143 rechecked on 5 November).
- Attendance: run said students often post about falling below 80% "after missing classes due to schedule confusion"; the threads give Moodle locks and other causes, and the timetable link rests on one Google Maps review.
- RSIS study: run said manual group rescheduling "in higher education takes upwards of 2 hours 43 minutes"; the study reports one documented case at one Zambian university.
- Intakes: run said "across 2,021 intakes"; the listing held 2,021 codes on 4 November and 2,020 on 5 November, and the timetable covers 1,045 intakes.
- Jira and Confluence actions: run listed `Search issues (JQL)` and `Search Confluence (CQL)` as actions; the connector pages don't name them, and the workflow page gives JQL and CQL as search filters.
- Targets: run wrote to `AA`'s Jira Service Management project and SharePoint site and connected to `apiit.atlassian.net/wiki/spaces/AA`; the team can only attach sites it owns, and the Confluence connector needs admin rights on APU's site, so all three are team-owned stand-ins. The AA space covers exam dockets, EC claims, deferment, transcripts, and the handbook, not room allocation.
- Region: run said Cloud Run `asia-southeast4` (Kuala Lumpur); the Cloud Run pricing page lists that price region, but the Cloud Run and BigQuery locations pages don't list it, so the doc uses `asia-southeast1` (Singapore), the S3 bucket's region.
- Transport: run said the Pi publishes "MQTT 5.0 over TLS (QoS 1)" to Cloud Run; Cloud Run's public ingress terminates TLS for HTTPS and gRPC ([Cloud Run contract]), and the set's shared path is an HTTPS post to Cloud Run, so MQTT stays an option through a broker the team runs or a partner broker.
- BigQuery in the workflow: run's search step ran "Federated BigQuery SQL" and queried BigQuery for unoccupied rooms; the workflows page's supported connectors don't include BigQuery, so the Pi computes free rooms into the Sheet and BigQuery serves the assistant only.
- KB count: run said the AA space has "103 public pages"; that was the 3 November count, and a CQL recount on 5 November returned 92.
- Crowd gap: run's ranking said the problem "appeared in 0 of 780" simulated brainstorms; the 0 covers only student-facing sync or change alerts, while room booking and timetable optimisation is a 2.7% cluster ([crowd clusters]).
- NTT DATA overlap: run's ranking claimed "Zero overlap with NTT DATA's persona/department Q&A demos"; the APU GenAI Assistant has a current-student persona covering fees, timetable, results, and attendance, on sample data ([NTT DATA demos]).
- Substitutes: run framed student scripts as calendar overwrites; APSync already "checks for changes every 12 hours and notifies you if anything shifted" ([student tools]), so students have change alerts, though no tool checks rooms, holidays, or shuttles.
- Double-booking evidence: run's ranking called "timetable churn and classroom double-booking" an "empirically documented" pain point; no APU source in the research documents one (the evidence is timetable churn and distrusted empty-room data), and the one live overlap, `D-07-17`, is unconfirmed.
- Event trigger: run fired it "when the Pi 5 writes a new anomaly row to the connected data store"; event triggers poll a fixed connector list that excludes BigQuery, so the trigger watches new Drive files.
- Latency: run said one 15-minute poll plus up to 5 minutes; with an hourly schedule the worst case is about 80 minutes, and the event trigger adds 5–10 minutes.
- Archive: run drew mutation cases from "the two historical snapshots" in the CDX index; both exist, but they cover 7–26 April and 9–29 June 2025 and can't be diffed against each other.
- Intake dates: run said Level 1 cohorts on 19 and 26 November 2026; the intake calendar gives 24 November for Degree Level 1 and 19 November for foundation, diploma, and certificate programmes.
- Pre-publish gate: run said "every Friday"; no source gives a Friday publish (the last write was Wednesday 28 October), and Friday is cron-apu-timetable's schedule.
- Staff identifiers: run said logs "hash or omit" them; the APU research says to drop all three lecturer fields at ingest.
- Transit rule: run matched each cohort to "its corresponding route"; the feeds don't map intakes to routes, so the rule compares a session's end with each route's last departure.
- Review step: run used a `Request info` step for the approval; the HITL page defines Request info as asking the user questions and Approval as presenting outputs for sign-off, so the doc uses Approval.
- Unverified: the Google Play rating and the 52-like review (not rechecked live), the Coursedog page body (JavaScript-rendered), which office publishes the timetable (no public page names `AA`), what the `D-07-17` overlap means, and how an Approval step combines with connector-write review in a scheduled run.

## See also

- [Cross-product ranking](00-ranking.md)
- [APSpace timetable feed](/docs/research/apu.md#apspace-timetable-feed)
- [APU student-built tools](/docs/research/competition.md#apu-student-built-tools)
- [Timetable churn evidence](/docs/research/social.md#timetable-churn-and-a-compressed-calendar)
- [Gemini Enterprise actions and write-back](/docs/research/gemini-enterprise.md#actions-and-write-back)
- [IoT and network protocols](/docs/research/iot-and-network.md#protocols)
- [Cloud Run](/docs/research/google-cloud.md#cloud-run)

[RSIS study]: https://rsisinternational.org/journals/ijrias/uploads/vol11-iss6-pg1465-1474-202606_pdf.pdf
[cron-apu-timetable]: https://github.com/Hackthletes-APU/cron-apu-timetable
[APSync]: https://github.com/AaronKhoolb/APSync
[apspace-to-calendar]: https://github.com/ian-hon/apspace-to-calendar
[timetable feed]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[feed endpoints]: /docs/research/apu.md#timetable-feed-endpoints
[change behaviour]: /docs/research/apu.md#timetable-feed-change-behaviour
[shuttle feed]: https://api.apiit.edu.my/transix-v2/schedule/active
[Cloud Run locations]: https://docs.cloud.google.com/run/docs/locations
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[Cloud Run contract]: https://docs.cloud.google.com/run/docs/container-contract
[Workflow Builder limits]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/quotas-and-limits
[row counts]: /docs/research/apu.md#timetable-row-counts
[BigQuery]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[feed users]: /docs/research/apu.md#who-already-uses-the-timetable-feed
[event triggers]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/configure-event-trigger
[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
