# KuyohGuard: last-mile flood, feeder-bus, and dismissal-wave dispatch orchestrator

KuyohGuard is a scheduled Gemini Enterprise workflow for APU's Logistics & Operations (`LNO`) office. The team's edge device compares the next 45 minutes of class dismissals and Campus Connect departures with live rainfall and river level at the Sungai Kuyoh gauge by LRT Bukit Jalil and with Rapid KL feeder route T580 bus positions; the workflow reads that comparison and drafts a commute advisory that a coordinator approves before anything is sent. It fits Track 1 (Smart Campus & Student Experience) and Track 2 (Intelligent Automation & Digital Transformation), and puts no hardware on APU buses or campus: the edge is the team's off-campus Raspberry Pi 5 (8 GB) and phones.

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

Students commute between LRT Bukit Jalil, nearby residences (Parkhill, City of Green, Fortune Park and One South, M Vertica, Bloomsvale, Harmony), and the campus in Technology Park Malaysia (TPM). APU's Campus Connect schedule, version `V1_20261022`, effective 22 October 2026, says students board "on a first come first serve basis", "When the bus is full, it will depart", APU "does not guarantee a seat at all times on every trip", and "during peak times and unusual traffic patterns, the buses may not be able to arrive or depart following the published schedules" ([shuttle schedule PDF][shuttle_pdf]).

The LRT shuttle is free for all APU students, and residents of APU-managed housing ride their route free. Other students buy a monthly travel pass: RM70 (Parkhill route), RM75 (Fortune Park route), RM100 (City of Green, Maple, Bayu Jalil), or RM140 (M Vertica, Bloomsvale, Harmony, Kuchai Sentral, D'IVO) ([shuttle services page][shuttle_page]).

Rain raises the price of the alternative. On `r/malaysiauni`, a Parkhill resident wrote on 28 October 2026 that Grab to campus "will usually be RM6 to RM9 per ride", rising "to RM12 to RM20+" at peak hour "and RM30+ if it's raining heavily" ([Looking for off campus accommodation near APU][grab]).

The Department of Irrigation and Drainage (JPS) station `SG. KUYOH DI LRT BUKIT JALIL` reports rainfall as `0232901RF` and water level as `0232901WL`. At its 04:30 MYT update on 5 November 2026, daily rainfall read 81.50 mm (30 Oct), 0.00 (31 Oct), 16.50 (1 Nov), 65.00 (2 Nov), 39.00 (3 Nov), and 18.50 (4 Nov) ([rainfall page][pib_rf]). The page notes that more than 60 mm in 2 to 4 hours can usually cause flash floods. The water level was 26.37 m, under the Normal threshold of 28.00 m ([water-level page][pib_wl]).

Rider accounts of waits are mixed in the Reddit close reads S2, S4, S5, and S6 of the [social research](/docs/research/social.md#getting-to-campus-shuttle-lrt-bukit-jalil-and-traffic). A former student described peak shuttle crowding and waits of 30 minutes to an hour ([S2]); a rider reported morning waits of "20mins max" ([S4]); a Parkhill resident reported occasional 10–15-minute waits ([S6]). In the S4 thread, the poster relayed a friend's report: "he said he can barely catch a bus cause its full" ([comment of 14 January 2026][friend]). New students also ask how boarding works: one didn't know whether they could board before getting a student card, and a reply asked which bus goes to the LRT rather than to accommodation ([S5]); another asked whether the free shuttle covers private renters and was told "free bus is for lrt bukit jalil only" ([APU off campus accomadation][pass_thread]).

Neither the shuttle page nor the `LNO` Knowledge Base space describes a rain- or dismissal-based advisory. The space had 29 public pages on 3 November ([KB counts](/docs/research/apu.md#apu-knowledge-base-on-confluence)); a 5 November recount found 26 current pages, plus 3 archived, on parking, prepaid smart meters, campus food and navigation, and a "RapidKL Bus & LRT" page that only links to Rapid KL's route pages ([LNO space][kb_lno], [RapidKL Bus & LRT][kb_rapidkl]).

[S4]: https://www.reddit.com/r/malaysiauni/comments/1pw159i/comment/o0h2q01/
[S5]: https://www.reddit.com/r/malaysiauni/comments/1souu9p/anyone_from_apu/
[S6]: https://www.reddit.com/r/malaysiauni/comments/1vllg0e/is_parkhill_residence_good/
[friend]: https://www.reddit.com/r/malaysiauni/comments/1pw159i/comment/nzhv4cq/
[pass_thread]: https://www.reddit.com/r/malaysiauni/comments/1nk10pn/apu_off_campus_accomadation/
[kb_rapidkl]: https://apiit.atlassian.net/wiki/spaces/LNO/pages/1199669249/RapidKL+Bus+LRT

## Why existing tools miss it

- In a simulation of 780 AI-brainstormed hackathon ideas, shuttle, bus, or parking ideas were 0.5%, in the "Absent" saturation tier. Flood prediction and warning was 3.2%, built on rainfall and water-level sensors, LoRaWAN, or cellular ([clusters and shares](/docs/research/competition.md#clusters-and-shares), [saturation tiers](/docs/research/competition.md#saturation-tiers)).
- The nearest rival, [`nacyng-netizen/apu-smart-shuttle`][rival] (created 1 November 2026), is a README for a Flutter, Firebase, and Google Maps shuttle tracker with "real-time GPS tracking", ETAs, and rain and weather alerts. It names no Gemini Enterprise part.
- A live tracker for APU's own fleet needs a device on each bus. APU's public shuttle feeds give the timetable and stop list, not positions ([timetable feed endpoints](/docs/research/apu.md#timetable-feed-endpoints)), and this team can't place hardware on the buses.
- KuyohGuard uses only public feeds. The keyless, CC BY 4.0 Rapid Bus KL GTFS Realtime feed ([GTFS Realtime docs][gtfsr]) carries route `T5800` (short name `T580`, "Stesen LRT Awan Besar ~ TPM via Stesen LRT Bukit Jalil"), which stops at `KL2009 TPM CARPARK` (about 360 m from campus) and `KL1540 ASTRO TPM` (about 400 m) and serves LRT Bukit Jalil, stop `SP17` (about 880 m) ([routes and stops near APU](/docs/research/data-sources.md#routes-and-stops-near-apu-gtfs-static)). It adds the Kuyoh gauges and APU's public timetable and shuttle feeds.

[rival]: https://github.com/nacyng-netizen/apu-smart-shuttle

## How it works

The Pi polls the public feeds, joins them, and writes the result to a corridor-status Sheet that the Gemini Enterprise workflow reads. It also posts each reading over HTTPS to a Cloud Run service in `asia-southeast1` (Singapore), the nearest region on the [Cloud Run locations page][run_loc], which passes it through Pub/Sub to BigQuery for history ([shared edge and network design](00-ranking.md#shared-edge-and-network-design)). Browsers can't call these sources directly: data.gov.my allows 4 requests per minute per API ([rate limit][dgm_rate]), and Infobanjir has no documented API ([river level at LRT Bukit Jalil](/docs/research/data-sources.md#river-level-at-lrt-bukit-jalil-public-infobanjir)).

[run_loc]: https://docs.cloud.google.com/run/docs/locations

### Edge and network

- **Feeder-bus positions, every 30 seconds:** `GET https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl`. The feed updates every 30 seconds, so two requests a minute stay under the limit of four ([GTFS Realtime docs][gtfsr], [rate limit][dgm_rate]). The Pi decodes the protobuf with `gtfs_realtime_pb2.FeedMessage()`, as in the docs' Python sample, keeps route `T5800` inside the TPM box (3.045–3.065 N, 101.690–101.712 E), and computes each bus's distance to `SP17`, `KL2009`, and `KL1540`. Positions outside the box are dropped, because the docs warn that bus GPS sometimes falls outside the service area (validator error `E028`).
- **River level, every 15 minutes:** the water-level page is a server-rendered HTML table. The Pi reads row `0232901WL` and compares it with the station's thresholds: Normal 28.00 m, Waspada (alert) 31.15 m, Amaran (warning) 32.05 m, and Bahaya (danger) 33.05 m ([water-level page][pib_wl]).
- **Rainfall, every 15 minutes:** the rainfall page's HTML has no rows ("Tiada data Terkini"); the page's own script loads them as JSON. The Pi reads `0232901RF`: six daily totals, the total since midnight, and the latest 1-hour total ([rainfall page][pib_rf]).
- **Weather warnings:** MET Malaysia warnings from `https://api.data.gov.my/weather/warning/` ([MET Malaysia warnings](/docs/research/data-sources.md#met-malaysia-warnings)).
- **Dismissals:** `open-ws/weektimetable`, polled with `If-None-Match` so the 1.1 MB file downloads only when its ETag changes. The Pi keeps physical sessions (`LOCATION` `APU CAMPUS`, room not prefixed `ONL`), counts sessions ending in each 15-minute slot, and drops `NAME`, `SAMACCOUNTNAME`, and `LECTID` at ingest ([change behaviour](/docs/research/apu.md#timetable-feed-change-behaviour), [personal data](/docs/research/apu.md#personal-data-in-the-timetable-feed)).
- **Shuttle departures:** `transix-v2/schedule/active` (253 trips in the set "WEF 22 Oct 2026") and `transix-v2/locations` (15 stops) ([schedule feed][api_bus], [timetable feed endpoints](/docs/research/apu.md#timetable-feed-endpoints)).
- **Phones:** teammates' phones, off campus, send browser Geolocation and DeviceMotion readings over HTTPS, which both APIs require, to test ETA and transfer-window maths against the corridor state ([phone sensors](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser)).
- **Join on the Pi:** every 15 minutes the Pi counts physical sessions ending in the next 45 minutes, matches them with scheduled APU → LRT and residence departures, active T580 buses, and the latest gauge readings, and writes one row per 15-minute slot to the `Bukit_Jalil_Corridor_Status` Sheet through the Sheets API.
- **Cloud:** Cloud Run publishes each reading to Pub/Sub, and a BigQuery subscription stores it with the source timestamp and the Pi's `deviceTimestamp`; `publishTime` minus `deviceTimestamp` gives the latency. Streaming rows into BigQuery needs billing, because the sandbox doesn't support streaming ([BigQuery](/docs/research/google-cloud.md#bigquery)).

### Connectors

In the Type column, 1P means a first-party Google connector and 3P a third-party one.

| Connector                                      | Type | Access                                                                                                    | Actions                                                   | Role                                                                                                                                                       |
| ---------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [BigQuery][ge_bq]                              | 1P   | Data store in federated query mode (preview), used from the Gemini Enterprise assistant, not the workflow | SQL queries through the BigQuery MCP server               | Holds the reading history for analysis and the 6-month ridership join                                                                                      |
| [Google Drive and Sheets][ge_drive]            | 1P   | Live actions                                                                                              | Get cell values, Update cell values                       | The workflow reads the `Bukit_Jalil_Corridor_Status` sheet the Pi writes; its Drive folder is the event-trigger source                                     |
| [Gmail][ge_gmail] and [Google Chat][ge_google] | 1P   | Live actions; Chat is preview                                                                             | Gmail: Create draft, Send message; Chat: Send message     | Sends approved advisories to commuting cohorts                                                                                                             |
| [Jira Cloud][ge_jira]                          | 3P   | Federated search and actions                                                                              | Create issue, Update issue, Create comment                | Logs an `LNO` transit-disruption issue when rain and dismissal demand exceed scheduled departures                                                          |
| [SharePoint Online][ge_sp]                     | 3P   | Federated search and actions                                                                              | Create list item, Update list item                        | Records each alert and decision in an `LNO` operations list                                                                                                |
| [Microsoft Outlook][ge_outlook]                | 3P   | Federated search and actions                                                                              | Create message, Send mail, Edit Excel data                | Sends Microsoft 365 commute advisories                                                                                                                     |
| [Confluence Cloud][ge_conf]                    | 3P   | Federated search and actions                                                                              | Search through federated search; Create page, Update page | Grounds advice in shuttle rules copied, with source URLs, from the shuttle page, the PDF, and the [Accommodation (AC) space's shuttle page][kb_ac_shuttle] |

Drive, Gmail, and Chat need a Google Workspace organisation account ([edition and account limits](/docs/research/gemini-enterprise.md#edition-and-account-limits)). Jira, SharePoint, Outlook, and Confluence point at team-owned stand-ins for APU's real sites, because a Confluence connector on APU's site needs its admin rights and OAuth setup ([how each source reaches an agent](/docs/research/apu.md#how-each-source-reaches-an-agent)).

[ge_bq]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[ge_drive]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive
[ge_gmail]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gmail
[ge_google]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/create-data-store
[ge_jira]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[ge_sp]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint
[ge_outlook]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-outlook
[kb_ac_shuttle]: https://apiit.atlassian.net/wiki/spaces/AC/pages/3777986570

## Day-to-day workflow

1.  **Trigger:** a Schedule trigger runs hourly in the pilot window. Schedules run only in multi-region locations, may start up to 5 minutes late, and use the author's credentials, which expire every 14 days ([Workflow Builder limits][ge_limits]). An Event trigger adds off-cycle runs. There is no webhook trigger, so when the `0232901RF` 1-hour total passes a set rain threshold or `0232901WL` reaches 28.00 m, the Pi creates a file in a watched Drive folder, and the Drive event trigger starts the workflow 5–10 minutes later ([event triggers][ge_event], [triggers and schedules](/docs/research/gemini-enterprise.md#triggers-and-schedules)).
1.  **Analysis:** a Gemini Agent node reads the corridor Sheet with `Get cell values`. Each row, joined by the Pi, sets physical sessions ending in the next 45 minutes against scheduled APU → LRT and residence departures, such as the weekday APU → LRT slots at 16:15, 16:30, 16:45, 16:50, 17:00, 17:10, 17:20, 17:30, 17:40, and 18:00 ([schedule feed][api_bus]), active T580 buses, and the gauge readings. The agent drafts the advisory from that row.
1.  **Human approval:** an Approval step pauses the run for the `LNO` duty coordinator's sign-off before any write ([HITL steps][ge_hitl]). It shows the `0232901WL` level (m), `0232901RF` rainfall (mm), T580 positions with the feed timestamp, the dismissal count, and a drafted advisory that recommends holding on campus, boarding the free LRT shuttle, or taking T580. The 20-minute hold is a team-set default, to be tuned during the pilot. Connector writes also pause for human review ([workflows][ge_workflows]), and the 5–10-minute trigger delay rules out emergency dispatch ([platform constraints](/docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences)).
1.  **Approved writes:** the workflow creates the Jira issue, adds the SharePoint list item, sends the Outlook and Gmail or Chat advisory, and updates the Sheet.
1.  **Failure behaviour:** when a source fails (HTTP error, parse error, empty rainfall rows, the `-9,999.00` missing-value marker, or a stale timestamp), its Sheet cell and the review prompt show that source's error and fetch time, with no cached value or default. A GTFS Realtime response with no T580 vehicle is logged as `TELEMETRY_UNAVAILABLE`, not as a cancelled bus.

[ge_limits]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/quotas-and-limits
[ge_event]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/configure-event-trigger
[ge_workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[ge_hitl]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps

## Baseline, metrics, and 3- and 6-month plan

- **Baseline:** students learn about heavy rain at LRT Bukit Jalil, a Grab fare past RM30, or a long queue only after they leave class ([Grab fares][grab], [S2]). No timed baseline exists yet; the first task is to time real afternoon windows.
- **Lead time:** the target is an approved advisory 30 to 45 minutes before each dismissal slot, measured from the workflow's Runs tab against the gauge and feed timestamps.
- **Accuracy:** precision and recall of the advise or don't-advise decision on 30–50 real 15-minute windows captured in early November 2026, with the sample size stated ([what NTT DATA said it will rate](/docs/CONTEXT.md#what-ntt-data-said-it-will-rate)).
- **3 months:** `LNO` runs KuyohGuard from 15:00 to 19:15 MYT on weekdays, which holds 22 of the schedule's 39 weekday APU → LRT departures, for the LRT Bukit Jalil, City of Green, Parkhill, and Fortune Park routes ([shuttle schedule PDF][shuttle_pdf]).
- **6 months:** `LNO` joins the logs with Rapid Rail daily origin-destination ridership for `SP17` in BigQuery to inform Campus Connect timetable revisions ([Rapid Rail ridership](/docs/research/data-sources.md#rapid-rail-origin-destination-ridership)).

## Boundaries

- GTFS Realtime covers Prasarana's public T580, not APU's private Campus Connect shuttles. Positions don't show load or boarding ([GTFS Realtime docs][gtfsr]).
- T580 is a secondary option: the static feed schedules it every 50 minutes from 07:30 to 23:20 on weekdays, and every 40 minutes from 06:00 to 06:40.
- KuyohGuard coordinates commutes before dismissal; it isn't a flood siren or a life-safety alert.
- The timetable feed covers a rolling four weeks (26 October to 22 November 2026 when read on 4 November) and only 1,045 intakes, against 2,021 codes in the intake listing on 4 November and 2,020 on 5 November, so some cohorts' dismissals are missing ([timetable row counts](/docs/research/apu.md#timetable-row-counts)).
- Dismissal counts are sessions, not people: the timetable has one row per intake per session and names no students. Advisory recipients come from a list `LNO` supplies; during the hackathon, they're the team's own addresses.
- Infobanjir publishes no terms page, and the timetable feed carries no licence, so ask the organisers before a demo depends on it ([terms of use](/docs/research/apu.md#terms-of-use-and-robotstxt)).
- No public source names the office that runs Campus Connect; confirm `LNO`'s role before the pilot.

## Verification notes

"Run" means the Gemini Deep Research report this set is based on ([ranking](00-ranking.md)).

Checked 5 November 2026, 04:42–05:20 MYT, against the Infobanjir pages, the data.gov.my docs and feeds (GTFS Realtime, GTFS Static for bus and rail), APU's shuttle page, PDF, and `transix-v2` feeds, the Confluence REST API, GitHub, the Reddit threads (read through a third-party API, because Reddit returns 403 here), the Gemini Enterprise doc pages, and the Cloud Run pricing and locations pages.

- Confirmed: station IDs, thresholds, and the six rainfall values; the GTFS Realtime endpoint, 30-second updates, CC BY 4.0, 4 requests per minute, and the E028 note; `T5800`/`T580` and its name; `KL2009` at 357 m, `KL1540` at 400 m, `SP17` at 879 m; 253 trips, 15 stops, and the ten APU → LRT times; pass prices; the Grab fares; the rival repo's 1 November creation date; every connector action in the table; the Approval step and the human-review rule; 29 `LNO` pages on 3 November, which a 5 November recount split into 26 current and 3 archived.
- Run said "Parkhill residents report" the Grab fares; the source is one Parkhill resident's comment of 28 October 2026.
- Run said close reads S2, S4, S5, and S6 document waits of 30 minutes to an hour; only S2 does, while S4 reports "20mins max" and S6 occasional 10–15-minute waits.
- Run presented "he can barely catch a bus cause its full" as a report of full buses; it's the thread's poster relaying a friend's account on 14 January 2026, so it's hearsay.
- Run said new students are confused about which routes need a paid pass, citing S5; S5 is about boarding without a student card and which bus goes to the LRT, and the pass question comes from a September 2025 thread.
- Run said RM75 covers "Fortune Park/UniStay"; the shuttle page says "Fortune Park Route" only, and passes are for students not staying in APU residences.
- Run said Infobanjir serves HTML tables; the water-level page does, but the rainfall page's HTML shows "Tiada data Terkini" and its script loads the rows as JSON, which I read through the same request.
- Run said the level was 26.37 m at 03:45 MYT; I read 26.37 m at the 04:30 update and couldn't recheck 03:45.
- Run said the gauges are 880 m from campus; 880 m is the `SP17` rail stop, and the gauge page gives a name, not coordinates.
- Run said 3.2% of simulated ideas were generic municipal flood dashboards; the source's 3.2% cluster is flood prediction and warning on rainfall and water-level sensors.
- Run's shared architecture put Cloud Run in `asia-southeast4` (Kuala Lumpur); that region appears on the Cloud Run pricing page but not on the Cloud Run locations page, which lists `asia-southeast1` to `asia-southeast3`, so the file uses `asia-southeast1`.
- Run said the workflow pauses at a Request info step; the HITL page says Request info asks questions, while Approval presents outputs for sign-off before downstream steps, so the file uses Approval.
- Run said the workflow queries BigQuery Federated to join the streams; BigQuery isn't among the connectors the workflows page lists, so the Pi does the join and writes the Sheet, and BigQuery serves only the assistant for history.
- Run set the rival repo apart as a tracker with no Gemini Enterprise part; that holds, but its README already lists "Rain forecast and weather alerts" ([`nacyng-netizen/apu-smart-shuttle`][rival]), so rain alerts alone don't set KuyohGuard apart.
- Run's advisory said hold on campus "for 20 minutes"; no source gives that figure, so the file presents it as a team-set default to tune during the pilot.
- Run said an Event trigger fires on rainfall or level thresholds; event triggers only poll connectors, with a 5–10-minute delay and no webhook, so the pipeline writes a Drive file.
- Run listed a Confluence action "Search Confluence (CQL)"; the connector page lists Create page, Update page, Create blog post, Create space, and attachment actions, with search through federated search.
- Run said Confluence grounds advice in `LNO` shuttle rules; a CQL search for "shuttle" in the `LNO` space returned nothing, the KB's shuttle pages are in the AC space, and connecting APU's site needs admin rights.
- Run called 15:00–19:15 the afternoon dismissal peak; the PDF names only a morning peak (7.30–8.45 a.m.), so this is a chosen window.
- Run said KuyohGuard provides a 30-to-45-minute warning; that's a target to measure, not a result.
- Run said Outlook mails students whose classes end; the timetable feed names no students, so `LNO` must supply recipients.
- Unverified: the S2 and S6 wording (taken from `/docs/research/social.md`); live T580 positions, because the feed held no vehicles at 04:43 MYT, before T580's first 06:00 window; whether a Drive event trigger can watch one folder; Google Chat actions inside a workflow; which office runs Campus Connect.

## See also

- [Cross-product ranking](00-ranking.md)
- [Public data sources](/docs/research/data-sources.md)
- [APU's public documents, data, and systems](/docs/research/apu.md)
- [Social research: getting to campus](/docs/research/social.md#getting-to-campus-shuttle-lrt-bukit-jalil-and-traffic)
- [Competition](/docs/research/competition.md)
- [Gemini Enterprise](/docs/research/gemini-enterprise.md)
- [Google Cloud](/docs/research/google-cloud.md)
- [Hackathon context](/docs/CONTEXT.md)

[shuttle_pdf]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf
[shuttle_page]: https://www.apu.edu.my/shuttle-services-campus-connect
[grab]: https://www.reddit.com/r/malaysiauni/comments/1xhjjl2/looking_for_off_campus_accommodation_near_apu/
[S2]: https://www.reddit.com/r/malaysiauni/comments/1l19a16/comment/mvov59z/
[pib_rf]: https://publicinfobanjir.water.gov.my/rainfalldata/Wilayah%20Persekutuan%20Kuala%20Lumpur
[pib_wl]: https://publicinfobanjir.water.gov.my/waterleveldata/Wilayah%20Persekutuan%20Kuala%20Lumpur
[kb_lno]: https://apiit.atlassian.net/wiki/spaces/LNO/overview
[gtfsr]: https://developer.data.gov.my/realtime-api/gtfs-realtime
[dgm_rate]: https://developer.data.gov.my/rate-limit
[api_bus]: https://api.apiit.edu.my/transix-v2/schedule/active
[ge_conf]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud
