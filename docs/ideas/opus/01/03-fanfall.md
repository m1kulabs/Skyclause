# Fanfall

Fanfall forecasts how hard each concert, match, or expo night at the Bukit Jalil National Sports Complex will hit APU's evening, tells the organiser of every APU evening event what to do about it, and grades itself the next day against real gate taps at LRT Bukit Jalil. It starts with GDGoC APU, whose NexConnect '26 final on Tuesday 17 November shares the night with 5 Seconds of Summer at Unifi Arena next door. It matters now because November 2026 has ten concert nights at the complex, five of them on weekdays, and on 2 November the government [told Parliament][paultan] it is studying exactly this congestion.

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
1.  [Research plan](#research-plan)
1.  [Time to impact](#time-to-impact)
1.  [Demo and review](#demo-and-review)
1.  [Build plan](#build-plan)
1.  [Risks](#risks)
1.  [See also](#see-also)

[paultan]: https://paultan.org/2026/11/03/government-to-address-traffic-congestion-in-bukit-jalil-during-major-events/

## At a glance

- **Track:** Data-Driven Research & Intelligent Decision Making.
- **Who it's for:** organisers of APU evening events, starting with GDGoC APU and two or three clubs. Through a public calendar it also reaches students whose physical classes end as the crowd arrives: 384–468 intake groups on each weekday stadium night in November.
- **Owner:** the GDGoC APU events lead runs the pilot and approves every bundle. APU's Student Service department (listed in APU's own department feed) is the institutional home we will ask for in interviews; it is not confirmed.
- **Trigger:** one family, "the Bukit Jalil picture changed". It covers a new or changed venue listing or APU event (Google Calendar event trigger), Rapid Rail's daily ridership file landing (Drive event trigger), a 07:00 outlook (schedule), and a listing forwarded by email (Gmail trigger).
- **Decision:** for each APU evening event on a forecast surge night, the organiser either keeps it and sends attendees a timed travel advisory, moves the start or end out of the crowd's arrival or exit window, or asks for a shuttle run from LRT Bukit Jalil.
- **Action and human gate:** Gemini Enterprise drafts one bundle per surge night: an entry on the public surge-night calendar and an advisory email to each affected organiser. The events lead approves it once. Grading and miss detection run unattended every day; a miss opens a Jira issue, which waits for the same approval.
- **Metric:** forecast error at Bukit Jalil station (a median absolute error of 20% on 48 past events); surge-night precision and recall against gate taps (0.88 and 0.33 from Wikipedia listings alone, the gap the intake is built to close); organiser minutes per clash check; and phone-timed APU-to-platform minutes on surge nights versus normal nights.
- **Weighted score:** 71.5 out of 100 in the [ranking](00-ranking.md); the per-component reasoning in [Scores](#scores) totals 71.

## Problem and evidence

APU sits about 900 m from LRT Bukit Jalil, the station that serves the 87,000-seat TM Stadium Nasional, Unifi Arena, and the National Hockey Stadium. On a stadium night tens of thousands of fans pour through that station and the roads around Technology Park Malaysia (TPM), at the hour APU's afternoon classes let out. Students, organisers, and the government all describe the same jam; nobody at APU checks for it systematically.

- **The government named it this week:** Federal Territories minister Hannah Yeoh told the Dewan Rakyat on 2 November 2026: "We know there is congestion. Every weekend, whenever there is a concert, Bukit Jalil becomes extremely congested. Traffic builds up hours before the concert even begins." Kuala Lumpur City Hall (DBKL) has appointed consultants for a Bukit Jalil micro traffic study due in the first quarter of 2027, with a traffic plan due in February 2027 ([Malay Mail, 3 Nov 2026][malaymail]).
- **Gate taps show the size:** on 2026 weekdays, Bukit Jalil station (`SP17`) averaged 3,804 exits a day. On stadium nights it logged 38,447 exits (10 January, Siti Nurhaliza), 32,929 (31 January, Mayday), and 31,971 (17 October, Siti Nurhaliza, when RapidKL kept the station open until 1 AM). Weekday nights are not spared: 19,640 exits on Tuesday 17 September 2024 (Bruno Mars), 28,216 on Wednesday 28 May 2025 (ASEAN All-Stars v Manchester United), and 21,110 on Tuesday 10 June 2025 (Malaysia v Vietnam). Source: Rapid Rail's daily origin-destination file ([public data sources](/docs/research/data-sources.md#rapid-rail-origin-destination-ridership)).
- **How often:** from March 2024 to October 2026, Bukit Jalil had 1.9 nights a month with at least 2,500 extra exits over its normal level for that weekday, 0.7 of them on weekdays. November 2026 is far denser: concerts on 4, 5, 7, 8, 14, 17, 19, 20, 28, and 29 November, plus an expo in Stadium Car Park B on 13–15 November. Five of the concert nights are weekdays (The Weeknd on 4–5 November, 5 Seconds of Summer on 17 November, My Chemical Romance on 19–20 November).
- **APU's exposure on those nights:** APU's public timetable feed shows physical classes (online rooms, codes starting `ONL`, excluded) ending between 16:45 and 19:30, when the arrival crowd builds. That covers 444 intake groups (134 sessions) on Wednesday 4 November, 468 on Thursday 5 November, 406 on Tuesday 17 November, 384 on Thursday 19 November, and 387 on Friday 20 November. The weekday shuttle leaves APU for the LRT 12 times between 17:00 and 19:15, then only at 20:45 and 21:45, both marked "limited space only".
- **APU organisers already work around it by hand:** a cybersecurity meetup at APU warned "Expect major congestion in the Bukit Jalil area" because of a match with "45k+ fans" and told people to take the LRT ([OWASP APU post], 20 May 2025). A hackathon posted its own bus times, "8:30 AM — LRT Bukit Jalil → APU" and "6:30 PM — APU → LRT Bukit Jalil" ([hackathon bus post], 1 Sep 2026). A landlord near the stadium: "when's there concert or football matches The whole bukit jalil will be damn jam" ([Lowyat][ly-oversupply], 26 Apr 2025). A concert-goer asked RapidKL for longer hours because "Ini semua bertanya2 nak parking mana" (everyone keeps asking where to park) ([LRT hours post], 26 Jun 2026). These posts are collected in [social research](/docs/research/social.md#event-crowds-and-flash-floods-around-bukit-jalil) and [parking](/docs/research/social.md#parking-supply-and-safety).
- **GDGoC APU's own record:** its chapter page lists 35 completed events since October 2024, 16 of them running into the evening. Four fell on surge days: 31 January and 14 February 2026 (stadium nights with 32,929 and 24,037 exits), 1 February 2026, and Friday 17 April 2026, a 16:00–19:00 workshop on a Sammi Cheng night at Unifi Arena with 7,233 exits. Its biggest event of the year, the NexConnect '26 final, is on the 5 Seconds of Summer night.
- **Today's workaround:** an organiser who thinks to check searches ticket sites and Instagram, guesses the impact, and writes a notice or books a bus. Nobody records whether the guess was right, so the next organiser starts from zero. **Inference:** most organisers don't check at all, because no APU calendar shows stadium nights; the interviews in the [Research plan](#research-plan) will measure this.

[malaymail]: https://www.malaymail.com/news/malaysia/2026/11/03/hannah-yeoh-smart-city-solutions-bus-hub-among-plans-to-ease-bukit-jalil-concert-traffic/241750
[OWASP APU post]: https://x.com/i/status/1924813982818500828
[hackathon bus post]: https://x.com/i/status/2094708113177989385
[LRT hours post]: https://x.com/i/status/2070474394389147650
[ly-oversupply]: https://forum.lowyat.net/topic/5520371/all

## How it works

### Day-to-day workflow

Every step below runs unattended except the approval in step 5 and the organiser's own choice in step 6.

1.  **Feeder (Apps Script, no card):** time triggers poll each source into a Sheet in the licensed Workspace domain. Every row stores the source timestamp, HTTP status, and fetch latency, and a failed poll writes an error row instead of the last value. The cadences: GoLive Asia's and Live Nation's event APIs hourly; Wikipedia's stadium and arena pages and Wikidata daily, by revision ID; GDGoC APU's chapter events daily; APU's timetable every 15 minutes with `If-None-Match`, so it downloads only on change; on surge nights, Rapid Bus positions every minute from 16:00 to 24:00.
1.  **Listings become calendar events:** the feeder writes each new or changed listing at the three venues onto a "Bukit Jalil venues" Google Calendar. Each entry carries its source URL, show time, and revision as provenance. Shows the feeds miss, such as the 7–8 and 28–29 November arena shows, arrive through the intake: anyone forwards the listing URL to the Fanfall inbox, Gemini extracts venue, date, door and show times, and event class, checks for duplicates, and drafts the calendar event for approval. APU events arrive the same way on an "APU evening events" calendar; GDGoC APU's own events come in automatically from its chapter feed.
1.  **Outlook run (Gemini Enterprise, Calendar event trigger plus 07:00 daily schedule):** for the next 14 days, it reads the venue and APU calendars, the forecast Sheet, the timetable exposure Sheet, and the editable rules Sheet. For each surge night it decides which APU events overlap the arrival window (doors to show time) or the exit window (show end plus 90 minutes), and picks a recommendation from the rules. It then drafts the bundle: one public surge-night calendar entry with the forecast and the number of intake groups leaving class in the window, plus one advisory per affected organiser.
1.  **Forecast (Sheet formulas the owner can read):** exits = the sum of all origin-to-Bukit Jalil pairs, leaving out the file's "A0: All Stations" total row. Baseline = the median exits at Bukit Jalil station on the same weekday over the last eight normal weeks. Uplift = the median extra exits for the event's class (stadium concert, stadium football, arena show) over the past two years, with the 10th–90th percentile as the band. Forecast = baseline + uplift, summed when two events share a night. For The Weeknd on Wednesday 4 November, this gives 27,044 exits (band 19,315–32,100) against a normal Wednesday's 3,928. We wrote that number down at 01:07 MYT on 4 November, before the night began.
1.  **The one gate:** the events lead approves each run's writes in one click: the calendar entries, the organiser emails, and any Jira issue. Gemini Enterprise pauses connector writes for review anyway ([Gemini Enterprise](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in)), so the design puts all of a run's writes behind a single approval.
1.  **The organiser decides:** keep and send the advisory, shift the event, or ask the shuttle desk for a run. A reply to the advisory ("keep", "shift to 19:30", "shuttle") is logged by the feeder against the event, so every decision has a record.
1.  **Night watch:** on surge nights the feeder computes the Rapid Bus leg from LRT Bukit Jalil to TPM, and volunteers' phones log APU-to-platform legs. If two consecutive measurements exceed the advisory's assumed minutes by half, the feeder drops a file into a watched Drive folder. That fires a short update that affected organisers can forward, behind the same approval.
1.  **Grading run (Drive event trigger, every day):** Rapid Rail publishes each day's gate taps the next day; data to 2 November was published at 16:04 MYT on 3 November, and the next update is due at 22:00 on 4 November. A GitHub Actions job polls the dataset's metadata, reduces the 5.3 MB yearly file to that day's Bukit Jalil exits with DuckDB, excluding the "A0: All Stations" rows, and posts the result to the feeder, which writes the actual count, the error, and the in-band flag, and drops a dated file into a watched folder. The Gemini Enterprise grading run then reads forecast against actual, plus the night's phone and bus legs. It ends with no writes when the night was in band. It opens a Jira issue when the miss is out of band, or when a surge arrived that no listing explained ("Unlisted surge on 23 May: 15,447 exits against 2,067 normal; find the event"). A Jira issue marked Done fires a re-forecast with the corrected history.

Most days the visible output is the grade and the 14-day outlook. Bundles come only on surge nights: about two a month in a typical month, ten in November 2026.

### Connectors and actions

| Connector                    | 1P/3P/MCP                     | Mode                                          | Job                                                                                          |
| ---------------------------- | ----------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Google Calendar              | 1P                            | Trigger; write (create, update event)         | Starts the outlook run on new listings and APU events; writes the public surge-night entries |
| Gmail                        | 1P                            | Trigger (email received); write (draft, send) | Takes forwarded listings into the intake; sends organiser advisories after approval          |
| Google Drive and Sheets      | 1P                            | Trigger (new file); read (Get cell values)    | Starts grading and night alerts; reads forecasts, exposure, legs, and the rules Sheet        |
| Jira Cloud (Free)            | 3P                            | Write (create issue); trigger (Done)          | Opens a miss or unlisted-surge issue; a Done event re-runs the forecast                      |
| GitHub Actions (feeder side) | 3P, outside Gemini Enterprise | Scheduled job                                 | Reduces Rapid Rail's parquet file to daily Bukit Jalil counts; not counted as a connector    |
| Custom MCP server            | MCP, optional                 | Read                                          | Add-on only: an on-demand ridership query on Cloud Run if a card and the MCP policy allow    |

Platform check against [Gemini Enterprise](/docs/research/gemini-enterprise.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise.md#data-in-and-out) as of November 2026:

- **Triggers:** Google Calendar, Gmail ("When an email is received"), Google Drive, and Jira Cloud are documented event-trigger connectors, polled every 5–10 minutes, and schedules take cron with a time zone ([triggers and schedules](/docs/research/gemini-enterprise.md#triggers-and-schedules)). Manual runs take input fields, which serves the reviewer check. There is no webhook trigger, so the feeder hands off through Drive files.
- **Reads:** Sheets "Get cell values" through the Drive connector has been available since 12 October 2026, in federated mode, so a failed read fails the run instead of serving a cached copy ([actions and write-back](/docs/research/gemini-enterprise.md#actions-and-write-back)).
- **Writes:** Calendar create and update event, Gmail draft and send, and Jira Cloud create issue are all GA actions (same section).
- **Approval:** scheduled runs that affect other people pause for approval, and connector writes from a workflow need human review ([unattended runs](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in)). This is the reason for one bundle per run.
- **Account:** the Drive, Gmail, and Calendar connectors need a Workspace account, not `@gmail.com` ([account limits](/docs/research/gemini-enterprise.md#edition-and-account-limits)). The no-card path holds only if the sponsored licence sits on a Workspace domain.
- **Not used:** ingested connectors, because their copies lag by three hours or more; and the 15-minute logging, which stays in Apps Script so routine rows never wait for review.

### Cloud, IoT, and network

- **Cloud:** Gemini Enterprise workflows do the reasoning: classifying listings, matching APU events and classes to windows, applying the rules, drafting, and diagnosing misses. Apps Script handles polling and arithmetic, and a GitHub Actions job with DuckDB handles the one file Apps Script can't parse. A judge sees each run's trace in the Runs tab and the rules Sheet that drove it.
- **IoT, layer 1, phones (load-bearing):** a leg-timer page, served by the Apps Script web app and working on iPhone and Android, records two taps per trip: "left APU" and "at the faregate". Each tap takes a geolocation fix that is checked against the APU or station geofence and then dropped, so only the leg time and a yes/no location check are kept. Daily ridership counts can't say how many minutes a student loses at 18:00; these legs can. The advisory's "budget +N minutes" comes from phone legs measured on past nights of the same event class, and The Weeknd on 4–5 November gives the first two.
- **IoT, layer 2, bus GPS as a road probe:** Rapid Bus vehicle positions every 30 seconds. Only route T580 (one bus on a 50-minute loop, 07:30–23:20) and route 652 (60-minute headway) stop within 600 m of the station, and T580 also stops at TPM. Each T580 pass gives a measured LRT Bukit Jalil → TPM leg against a 5-minute schedule. That is three or four probes an evening, thin but independent of the team, and it drives the night-watch alert alongside the phones. The protobuf feed needs a small hand-written decoder in Apps Script.
- **IoT, layer 3, Rapid's faregates:** the daily gate-tap counts are the city's own sensor network, a day late. They grade every forecast.
- **Network:** every phone leg carries the device time and the receipt time, so each row shows its own latency. Legs recorded underground, or with no signal, buffer in the page and upload on reconnect, which shows up as a latency spike in the log. Every grade shows the feed's own lag (night D graded on D+1), and every bus row shows the age of the feed header. A judge sees a latency column, a buffered upload, and a feed-age column, not a claim.

### Real data

All results below are from fetches on 4 November 2026 between 00:16 and 00:36 MYT; raw responses are kept with the working notes.

| Source                                                          | Live or replayed                  | Cadence                | Licence or terms                                                 | Smoke test, 4 Nov 2026                                                                                            |
| --------------------------------------------------------------- | --------------------------------- | ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Rapid Rail daily origin-destination file][od]                  | Live; 2024–2025 files for history | Daily, next day        | CC BY 4.0                                                        | 200, 5,299,106 B, last modified 3 Nov 16:04 MYT; data to 2 Nov; `SP17` exits 4,473 on 2 Nov                       |
| [Dataset metadata][od_meta]                                     | Live                              | Daily                  | CC BY 4.0                                                        | 200; `data_as_of` 2 Nov 23:59, `next_update` 4 Nov 22:00                                                          |
| [Rapid Bus KL GTFS Realtime][gtfsr]                             | Live                              | 30 s                   | CC BY 4.0                                                        | 200, 124 B at 00:19; header 00:19:01; 1 vehicle (route T3018); T580 not in service at night                       |
| Rapid Bus KL and Rapid Rail GTFS Static                         | Reference                         | As required            | CC BY 4.0                                                        | 200, 1,697,052 B and 80,479 B; T580 every 50 min; `SP17` at 3.058196, 101.692125                                  |
| [APU timetable feed][tt]                                        | Live                              | Written weekly or less | No licence; APU's Terms of Use require permission                | 200, 1,138,362 B; last modified 28 Oct; 31,606 rows to 22 Nov                                                     |
| [APU shuttle schedule JSON][shuttle_json]                       | Live                              | On change              | As above                                                         | 200; set "WEF 22 Oct 2026", 253 trips                                                                             |
| [GoLive Asia event API][golive]                                 | Live                              | Hourly poll            | Undocumented; no data licence; terms ban only ticket-buying bots | 200, 15 events; all six known complex listings, with show times (The Weeknd 20:30, 5SOS 20:00, BABYMONSTER 17:00) |
| [Live Nation Malaysia event API][livenation]                    | Live                              | Hourly poll            | Clause 1.3: "personal and non-commercial use"                    | 200; The Weeknd, BABYMONSTER, BTS                                                                                 |
| Wikipedia [stadium][wiki_stadium] and [arena][wiki_arena] pages | Live; history tables replayed     | Daily, by revision     | CC BY-SA 4.0                                                     | 200; lists The Weeknd 4–5 Nov, BABYMONSTER 14 Nov, 5SOS 17 Nov, MCR 19–20 Nov, BTS and Dior 12–13 Dec             |
| [Wikidata SPARQL][wikidata]                                     | Live                              | Daily                  | CC0                                                              | 200; BABYMONSTER, MCR, BTS, and 2026 badminton events at the arena                                                |
| [Malaysia national team results][wiki_football]                 | Replayed (history labels)         | On edit                | CC BY-SA 4.0                                                     | 200; 11 home matches at Bukit Jalil since 2024                                                                    |
| [FAM men's team calendar][fam]                                  | Live (HTML)                       | Weekly check           | No terms found                                                   | 200; both November matches in Zhaoqing, China, so no football at the complex this month                           |
| [GDGoC APU chapter events][gdg]                                 | Live                              | Daily                  | Undocumented platform API                                        | 200; 1 upcoming event (4 Nov, 11:00), 35 completed                                                                |
| Team and volunteer phones                                       | Live                              | Per trip               | Team's own opt-in data                                           | Not yet recorded; first nights 4–5 Nov                                                                            |
| Malaysia Stadium Corporation [events page and RSS][psm]         | Not used                          | –                      | –                                                                | 200, but "No upcoming events!" and an empty feed                                                                  |
| Songkick, Ticketmaster Discovery, Bandsintown                   | Not used                          | –                      | Songkick bans scrapers; the others need keys                     | 406 to the Apps Script user agent; 401 with no Malaysian market; 401 or 403                                       |

Counting warning: the ridership file has an "A0: All Stations" row on each side (origin "A0" totals every origin into a station, destination "A0" every destination out of it), so exclude A0 rows when summing, or every count doubles.

What the event sources cover: no venue publishes a machine-readable calendar. The keyless feeds together (GoLive, Live Nation, Wikipedia, Wikidata) cover 5 of the 9 large November events, including both stadium acts (four nights). They miss YoungCaptain (7 Nov) and EXISTS (8 Nov) at Unifi Arena, Alan Tam (28–29 Nov), and the expo (13–15 Nov), which the reviewable intake handles. A 3DIVA show on 22 November was cancelled on 23 October, yet two listing sites still show it, which is one more reason every listing passes a human before it drives a bundle.

[od]: https://storage.data.gov.my/transportation/rail/rapidrail_2026_daily.parquet
[od_meta]: https://github.com/data-gov-my/datagovmy-meta/blob/main/data-catalogue/ridership_od_rapidrail_daily.json
[gtfsr]: https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana/?category=rapid-bus-kl
[tt]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[shuttle_json]: https://api.apiit.edu.my/transix-v2/schedule/active
[golive]: https://www.golive-asia.com/api/event/list
[livenation]: https://www.livenation.my/__api/search/events?culture=en-MY
[wiki_stadium]: https://en.wikipedia.org/wiki/Bukit_Jalil_National_Stadium
[wiki_arena]: https://en.wikipedia.org/wiki/Unifi_Arena
[wikidata]: https://query.wikidata.org/
[wiki_football]: https://en.wikipedia.org/wiki/Malaysia_national_football_team_results_(2020%E2%80%93present)
[fam]: https://fam.org.my/men-team/calendar
[gdg]: https://gdg.community.dev/gdg-on-campus-asia-pacific-university-of-technology-innovation-kuala-lumpur-malaysia/
[psm]: https://www.stadium.gov.my/events.html

## Why people will use it

- **Habit loop:** an organiser adds an event to the APU evening calendar, or GDGoC's chapter feed adds it for them. Within ten minutes, they hear whether it collides with anything. If it does, they get one advisory before the night and one grade after, saying whether the forecast held and how long the trip to the platform took. The alerts are rare and checked against real taps, which is what earns trust.
- **Channel:** Google Calendar and email, which organisers already use, with nothing to install. Students and lecturers can subscribe to the public surge-night calendar by URL; each entry carries the forecast, the arrival and exit windows, and the last measured APU-to-platform minutes.
- **After the team graduates:** the desk is a GDGoC APU committee role that hands over every year with the chapter, as its event calendar already does. The upkeep is a credential refresh every 14 days (a recurring calendar task), the occasional forwarded listing, and closing Jira issues. If Student Service takes it on, it moves to an office.
- **What could stop use:** the Gemini Enterprise licence ending after the trial (see [Risks](#risks)), and organisers ignoring advice that turns out wrong. The published grade is the defence against the second.

## Why the crowd won't build it

- **The crowd map:** in the simulated crowd, city traffic and smart-city dashboards are 3.8% of ideas and queue and crowd prediction 2.5%, "often simulated". Only 3% of ideas use public feeds, and none treats APU's timetable as a service ([crowd baseline](/docs/research/competition.md#clusters-and-shares), [what the crowd misses](/docs/research/competition.md#what-the-crowd-structurally-misses)). The off-campus traffic cluster is crowded, but this product joins three things the crowd never combines: venue listings, APU's own timetable and events, and gate taps that grade the result.
- **GitHub, 4 November 2026:** zero repositories for "bukit jalil stadium", "stadium event ridership forecast", or "concert crowd transit forecast". Five repositories analyse RapidKL ridership as plain time series, such as [rapidkl-ridership-forecast] (Holt-Winters on data.gov.my, October 2026), and none links it to events. A cluster of "Event-Driven-Congestion" repositories from June 2026, such as [Event-Driven-Congestion-Intelligence-System], predicts traffic impact for city events with no campus and no grading. The nearest entry in this hackathon is [apu-smart-shuttle], a Flutter shuttle tracker with traffic and rain alerts.
- **Devpost (web search):** "Pedestrian Congestion", "City Congestion Meter", and "Surge Protector" are city or crowd dashboards; none forecasts a known venue's nights against an institution's schedule or scores itself against ticket-gate data.
- **Commercial prior art:** PredictHQ sells event-demand forecasting and has a [Bukit Jalil venue page][predicthq], but its API is paid and the page's event list came back empty. The government's own fix, a DBKL study, reports in 2027.
- **Inference:** a crowd team might build a stadium-traffic dashboard, but not one that hands an APU organiser a decision and publishes its own error the next day.

[rapidkl-ridership-forecast]: https://github.com/Sara-2208/rapidkl-ridership-forecast
[Event-Driven-Congestion-Intelligence-System]: https://github.com/RamK2006/Event-Driven-Congestion-Intelligence-System
[apu-smart-shuttle]: https://github.com/nacyng-netizen/apu-smart-shuttle
[predicthq]: https://www.predicthq.com/major-events/venues/bukit-jalil-national-stadium-my

## Scores

The weights are our own; NTT DATA named five points but gave no weights or scale.

| Component                    | Weight | Score | Reason                                                                                                                                      |
| ---------------------------- | -----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact                       |     15 |     3 | Serves one community's evening events, plus 384–468 intake groups per weekday stadium night via a calendar; no office workload measured yet |
| Technical build (connectors) |     15 |     4 | Calendar, Gmail, Drive and Sheets, and Jira Cloud each trigger and write in the loop; no MCP on the critical path                           |
| Research depth               |     10 |     4 | 48 past events and 671 days already scored against real gate taps; organisers and commuters are reachable this week                         |
| Time to impact               |     10 |     3 | The pilot owner can act on 17 November; the institutional owner is unconfirmed                                                              |
| Day-to-day workflow          |     15 |     4 | Grading runs every day and five triggers feed one approval per run; bundles come only on surge nights                                       |
| Theme convergence            |     10 |     3 | Phones carry the minutes and the network proof; the bus probe is one vehicle every 50 minutes; the gate taps are a day late                 |
| Originality                  |     10 |     4 | No crowd idea, repository, or Devpost entry joins venue listings, APU's timetable, and gate taps; PredictHQ is paid and generic             |
| Real usage                   |     10 |     3 | Zero install and existing channels, but each organiser meets a surge night only a few times a term                                          |
| Demo and pitch               |      5 |     4 | The 17 November clash is a built-in hook, and a forecast written in advance is graded on camera                                             |

Weighted total: 71 out of 100.

Gates:

- **Real public data only:** pass. Every input is a live public feed, a published dataset, Wikipedia, or the team's own opt-in phone legs. Lecturer fields are dropped from the timetable at ingest, and no personal records are used.
- **Buildable by a 2–5 student team by 10 November within platform limits:** pass. The riskiest parts (the GitHub Actions reduction, the protobuf decoder, and approvals during 11–14 November) are scheduled first.
- **Core in Gemini Enterprise:** pass. Gemini Enterprise does the intake extraction, window matching, rule choice, drafting, and miss diagnosis; Apps Script only moves data and does arithmetic in visible Sheet formulas.
- **IoT real and visible:** pass, narrowly. Phones are the team's own sensors and the bus probe is real but sparse.
- **Reachable owner and 30–50 real items by 10 November:** pass. GDGoC APU and club committees are reachable through the hackathon's own channels, and 48 scored past events already exist.
- **Reviewer can trigger it:** pass, by a manual `@Fanfall` run or by adding an event to the shared test calendar (see [Demo and review](#demo-and-review)).
- **No-card path:** pass, provided the licence is on a Workspace domain.

Strongest objections, answered or conceded:

- **"The venue calendar is typed in by hand":** answered. Four keyless feeds bring in 5 of 9 November events, including both stadium acts, with provenance. The rest come through a Gmail intake that records the listing URL and needs approval, and the nightly grading measures what the intake missed.
- **"Events are weekly, so nothing runs day to day":** partly answered. The grading and outlook runs fire every day, and November has ten concert nights. Conceded: on a quiet day in a quiet month, the only output is a grade line.
- **"Logistics won't add runs for a student forecast":** answered by the choice of owner. Organisers decide about their own events; a shuttle request is one option they can take, not something the product depends on.
- **"The forecast is just a median":** conceded and defended. It is a median on purpose, readable by the owner, with a median absolute error of 20% on 48 past events. Its band held only 26 of 48 nights (54%), so the published band is honest about being too narrow, and Gemini never does the arithmetic.
- **"The listings miss most surges":** conceded with numbers. With Wikipedia and national-team listings alone, nights with at least 5,000 extra exits from January 2025 to 2 November 2026 were flagged with precision 0.88 (7 of 8) and recall 0.33 (7 of 21). The misses included the 23 May 2026 Malaysia Cup final and the 28 May 2025 Manchester United match. Closing that gap is the intake's job, and the grade measures it every night.
- **"The IoT is other people's sensors":** partly answered. The phone legs are the team's own, and the advisory's minutes depend on them. Conceded: the bus probe is thin.
- **"GoLive's API is undocumented and Live Nation's terms are personal-use only":** conceded as a risk. Wikidata (CC0) and Wikipedia (CC BY-SA) are the licensed base, the team will ask GoLive for permission, and a failed feed shows its error.
- **"GDGoC APU runs this hackathon":** it organises the event, but NTT DATA rates the entries. Two other clubs join the pilot so the owner isn't only the organiser.

## Research plan

- **Interviews, round 1 (Thu 5 Nov, 3–4 people):**
  - The GDGoC APU events lead.
  - The GDGoC member who ran the 21 October 19:30 talk.
  - The president of one club with an evening event in November.
  - A student whose physical class ends at 17:45 on a stadium night and who commutes by LRT.
  - Learning goals: how they check for clashes today, what they last did on a stadium night, and what would change their plan.
- **Interviews, round 2 (Fri 6 Nov, 3–4 people):**
  - A second club president.
  - A Student Service staff member, reached through `info@apu.edu.my`.
  - A lecturer with a class ending at 17:45 on 19 November.
  - If reachable, the Logistics & Operations shuttle desk, as a recipient rather than an owner.
  - The goal: test the drafted advisory and the rules Sheet with them.
- **Timed baseline, organisers:** three organisers each answer "What's on at Bukit Jalil on 17 November, and what should my attendees do?" with their usual tools while we time them and count the sources they open. After: the same question answered from a Fanfall advisory, including the time to read and approve it.
- **Timed baseline, commuters:** phone legs from "left APU" to "at the faregate" on normal nights (Tue 3 Nov, Fri 6 Nov) and on The Weeknd nights (Wed 4 and Thu 5 Nov), at least ten legs per night across 17:30–19:30. Repeat on 17 and 19 November.
- **Scoring 30–50 real items:**
  - **Backtest:** 48 listed event days from 1 January 2025 to 2 November 2026. Each is forecast using only the history before it, then scored against real exits (median absolute error 20%, mean 28%, 26 of 48 inside the band).
  - **Surge-night flag:** every day in the same period (671 days), positive at 5,000 or more extra exits. Report precision and recall with Wilson 95% intervals, as [research and impact](/docs/research/judging.md#measuring-an-agents-accuracy-honestly) recommends.
  - **Labels:** two team members independently label each surge day's cause from listings and news, and the disagreements are counted.
  - **Live items:** every day from 3 November is graded as its file lands, which is six days by submission (including both Weeknd nights) and about 27 by 30 November.

## Time to impact

- **By 3 months (early February 2027):** the desk has run every surge night from NexConnect '26 (17 November) onwards: My Chemical Romance (19–20 November), BTS and Dior (12–13 December), BigBang (9 January), Westlife (13–14 January), and Jay Chou (23 January). It covers GDGoC APU and at least three clubs, and publishes a monthly graded ledger. GDGoC APU's events lead owns it. Student Service has been asked to add the surge-night calendar to its club-event guidance.
- **By 6 months (May 2027), measured:** organiser minutes per clash check against the baseline; the share of APU evening events on surge nights that got an advisory; the decisions taken, from the reply log; forecast error on at least 20 new events; intake recall against gate taps; and phone-timed minutes from APU to the platform by event class.
- **Outside hook:** **Inference:** DBKL's study and traffic plan, due in early 2027, may welcome a graded, public record of event nights against station taps. The team can offer the ledger through the Federal Territories department; nothing in the plan depends on it.
- **Assumptions:**
  - GDGoC APU agrees to own the pilot.
  - APU gives written permission for the timetable and shuttle feeds.
  - The Gemini Enterprise licence continues past the trial.
  - Rapid Rail keeps publishing daily.
  - At least one event feed stays open.

## Demo and review

A 3:45 video, labelled as a recording with its capture date, with the demo and impact inside the first three minutes:

1.  **0:00–0:20:** "Tuesday 17 November: the NexConnect '26 final at APU, 5 Seconds of Summer next door, and 406 intake groups leaving class as the crowd arrives." The surge-night calendar on screen.
1.  **0:20–1:05:** a teammate adds a club event on 19 November to the APU evening calendar. Within ten minutes the Runs tab shows the Calendar trigger, the reads, the rule chosen, and the drafted bundle. The events lead approves, and the advisory email and calendar entry appear.
1.  **1:05–1:50:** the grade. The Weeknd's 4 November forecast, written down before the night (27,044 exits), against the real count from the file that landed on 5 November, with the Drive-trigger run and its result.
1.  **1:50–2:30:** the sensors. Phone legs from APU to the platform on a normal night against a Weeknd night, with latency and a buffered upload visible in the Sheet, and a T580 leg against its 5-minute schedule.
1.  **2:30–3:00:** impact. The backtest error, the surge-night precision and recall with their n, and the organisers' minutes before and after.
1.  **3:00–3:45:** day to day (seven days of Runs history), the one approval, privacy, and how to review.

How a reviewer triggers it:

- **In the Gemini Enterprise app:** type `@Fanfall` with a date and an end time. The run reads the live sources and answers in chat with the forecast, the windows, and a recommendation. It makes no writes, so it needs no approval.
- **By calendar:** add an event to the shared "APU evening events (review)" calendar on any surge night. A bundle drafts within ten minutes, and the team approves from 08:00 to 23:00 during 11–14 November, so the reviewer gets the advisory email.
- **Live grading during assessment:** BABYMONSTER on Saturday 14 November is graded when its file lands on 15 November.

## Build plan

1.  **Wed 4 Nov (riskiest first):**
    - The GitHub Actions job that reduces the daily file and posts to the Apps Script web app, plus the Drive drop.
    - The GTFS-R decoder and minute poller, and the leg-timer page, both live before The Weeknd's first night, with two teammates timing legs that evening.
    - Ask the organisers in `#help-desk` for written permission to use the timetable feed, and ask GDGoC APU to own the pilot.
1.  **Thu 5 Nov:**
    - Second Weeknd night measured.
    - Round-one interviews.
    - Listing pollers (GoLive, Live Nation, Wikipedia, Wikidata, GDG chapter) writing to the venue calendar.
    - The first grade lands that evening (4 November's file).
1.  **Fri 6 Nov:**
    - Gemini Enterprise workflows: the outlook (Calendar trigger and 07:00 schedule), grading (Drive trigger), and intake (Gmail trigger).
    - The rules Sheet and a normal-night commuter baseline.
    - Round-two interviews; freeze the problem statement and the baseline.
1.  **Sat 7 Nov:**
    - The Jira Free project with miss issues and the Done trigger; approval wiring.
    - Score the backtest and surge-night sets, with two labellers.
1.  **Sun 8 Nov (Deepavali):** README, deck, and diagram drafts; confirm every member is registered before registration closes.
1.  **Mon 9 Nov:** feature freeze; refresh schedule credentials; record the video from the live system; test reviewer access with a non-team account.
1.  **Tue 10 Nov:** final submission early in the day.

No-card path: Apps Script, Sheets, Calendar, Gmail, GitHub Actions on a public repository, and Jira Cloud Free, all on the sponsored Gemini Enterprise licence in a Workspace domain. A card adds only the optional MCP server.

## Risks

- **Event feeds change or close:** GoLive's API is undocumented and Live Nation's terms allow personal, non-commercial use. Mitigation: Wikidata and Wikipedia as the licensed base, written requests to GoLive and Live Nation, and the Gmail intake. A failed feed writes an error row, and the outlook says which feed is down.
- **Listings are wrong or late:** cancelled shows stay listed, and Wikipedia can be vandalised. Mitigation: provenance on every calendar entry (URL and revision), a human approval before any bundle, and the nightly unlisted-surge check.
- **The ridership file is late or changes shape:** the grade shows "pending" with the metadata's `next_update`, never an old number. A schema change fails the GitHub job visibly.
- **Privacy (PDPA):** phone legs are opt-in, from volunteers who are told what is kept. Location is checked against a geofence at the two taps and then dropped, there is no continuous tracking, no names, and no attendee data. Organiser emails are the organisers' own. The timetable's `NAME`, `SAMACCOUNTNAME`, and `LECTID` fields are dropped before storage or any prompt ([timetable feed](/docs/research/apu.md#personal-data-in-the-timetable-feed)). Only aggregate counts per window reach Gemini.
- **Permissions (APU Terms of Use):** the timetable and shuttle feeds are undocumented and unlicensed, and APU's terms ask for permission before using its content. Mitigation: written permission before the demo depends on them, polling only on change, and no bulk downloads beyond the named files.
- **Platform limits** ([limits](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build), [account limits](/docs/research/gemini-enterprise.md#edition-and-account-limits)):
  - Credentials expire every 14 days: set them up on 6 November and refresh on 9 November so they last through 17 November.
  - Writes wait in Needs Review, so a teammate watches approvals from 08:00 to 23:00 during 11–14 November.
  - Standard pools 160 assistant queries a day, and runs that fail on quota aren't retried; the design uses 4–6 runs a day, more on surge nights.
  - Event triggers poll every 5–10 minutes, which is fine at day scale.
  - The Workspace connectors don't work on consumer `@gmail.com` accounts.
- **Owner says no:** if GDGoC APU declines, a club committee owns the pilot; the product doesn't need an office to say yes before it is useful.
- **Thin night signal:** a single T580 bus may skip a pass or report bad GPS. The night watch needs two consecutive readings, and phones carry the minutes.
- **A quiet assessment week:** 11–14 November has only BABYMONSTER (14 November) and the expo. The daily grading still runs, and the recorded Weeknd nights show the full loop.

## See also

- [Social research on X](/docs/research/social.md#event-crowds-and-flash-floods-around-bukit-jalil) and [other platforms](/docs/research/social.md#shuttle-buses-and-the-lrt-last-mile): the Bukit Jalil event, parking, and shuttle evidence.
- [Public data sources](/docs/research/data-sources.md#rapid-rail-origin-destination-ridership): the ridership file, GTFS feeds, and data.gov.my limits.
- [APU timetable feed](/docs/research/apu.md#apspace-timetable-feed): the feed, the shuttle and department endpoints, personal data, and terms.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise.md#data-in-and-out): triggers, approvals, actions, and limits.
- [IoT and network](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser): phone sensors and making the network visible.
- [Crowd baseline](/docs/research/competition.md): what other teams are likely to build.
- [Research and impact](/docs/research/judging.md): interviews, baselines, and honest accuracy figures.
- [Malay Mail on the Bukit Jalil traffic study][malaymail] and [paultan.org's report][paultan]: the government's study and plan.
- [Data.gov.my dataset metadata][od_meta] and [GoLive Asia event API][golive]: the two feeds the loop depends on most.
