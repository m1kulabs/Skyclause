# Kuyoh Shuttle Sentinel

Kuyoh Shuttle Sentinel is a scheduled Gemini Enterprise workflow for APU Logistics & Operations (LNO) and Academic Administration (AA). It watches Rapid Bus KL T580 GPS, the Sungai Kuyoh river gauge at LRT Bukit Jalil, and MET Malaysia warnings. When the LRT-to-campus corridor is disrupted, it drafts shuttle advisories and a proposed 15-minute attendance grace window for approval. It ranks second at 93.5 / 100 in the Intelligent Automation & Digital Transformation track ([ranking](00-ranking.md)).

Contents:

1.  [Problem on the LRT Bukit Jalil corridor](#problem-on-the-lrt-bukit-jalil-corridor)
    1.  [Shuttle, event, and rain evidence](#shuttle-event-and-rain-evidence)
    2.  [The 80% attendance rule](#the-80-attendance-rule)
2.  [How Kuyoh Shuttle Sentinel works](#how-kuyoh-shuttle-sentinel-works)
    1.  [Live feeds and poller](#live-feeds-and-poller)
    2.  [Kuyoh Shuttle Sentinel connectors](#kuyoh-shuttle-sentinel-connectors)
    3.  [Corridor dispatch rulebook](#corridor-dispatch-rulebook)
3.  [Kuyoh Shuttle Sentinel validation](#kuyoh-shuttle-sentinel-validation)
4.  [Kuyoh Shuttle Sentinel rollout](#kuyoh-shuttle-sentinel-rollout)
5.  [Kuyoh Shuttle Sentinel data and privacy](#kuyoh-shuttle-sentinel-data-and-privacy)
6.  [Kuyoh Shuttle Sentinel evidence limits](#kuyoh-shuttle-sentinel-evidence-limits)
7.  [See also](#see-also)

## Problem on the LRT Bukit Jalil corridor

### Shuttle, event, and rain evidence

- **The official schedule makes no promises:** APU's shuttle schedule (version `V1_20261022`, effective 22 October 2026) covers LRT Bukit Jalil, Fortune Park, City of Green, Bloomsvale and Harmony, D'IVO, Kuchai Sentral, M Vertica, Maple, and Parkhill. It says "When the bus is full, it will depart", that "during peak times and unusual traffic patterns, the buses may not be able to arrive or depart following the published schedules", and that "All schedules are subject to change without prior notice". The LRT route's peak runs between 7:30 AM and 8:45 AM ([shuttle schedule]).
- **Mornings are busy:** a commenter warns new students that "morning might have a lot of people", so leave early when due on campus at 9 ([orientation thread]), and another says the buses "can get really crowded sometimes" ([shuttle thread]).
- **Events jam the area:** "Bukit jalil can get severely crowded if there's football match or concert at bukit jalil stadium or axiata arena", and one commenter recalls "The sea of red on google Maps" during a Blackpink concert ([crowded stations thread]).
- **November is wet:** "November is usually rainy season" ([concert thread]). Public Infobanjir station `0232901WL` "SG. KUYOH DI LRT BUKIT JALIL", about 0.9 km from campus, has thresholds of 28.00 m Normal, 31.15 m Waspada (alert), 32.05 m Amaran (warning), and 33.05 m Bahaya (danger) ([public data sources]).
- **One public bus:** T580, "Stesen LRT Awan Besar ~ TPM via Stesen LRT Bukit Jalil", is the only Rapid Bus KL route with stops within 500 m of campus, at `KL2009 TPM CARPARK` (about 360 m) and `KL1540 ASTRO TPM` (about 400 m) ([public data sources]).

[orientation thread]: https://www.reddit.com/r/malaysiauni/comments/1souu9p/
[shuttle thread]: https://www.reddit.com/r/malaysiauni/comments/1w1uzwx/
[crowded stations thread]: https://www.reddit.com/r/malaysia/comments/12agyxn/
[concert thread]: https://www.reddit.com/r/KualaLumpur/comments/1dn5in8/

### The 80% attendance rule

A student writes that "APU requires 80% plus attendance for each course" ([attendance worry thread]). A student on 79% is told the rule exists "so that you are not to be barred from the final exam of the course", and another says the shortfall affected their visa status ([79% thread]). Lecturers mark attendance in AttendiX 2.0 ([KB AttendiX], [KB AttendiX method 2]), and no public source shows that they get corridor delay alerts. The inference to test in interviews: a late student explains each delay case by case.

[attendance worry thread]: https://www.reddit.com/r/malaysiauni/comments/1vctvfq/
[79% thread]: https://www.reddit.com/r/malaysiauni/comments/1rlbahv/
[KB AttendiX]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/221088395
[KB AttendiX method 2]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/221088420

## How Kuyoh Shuttle Sentinel works

### Live feeds and poller

The three public feeds returned live data on 3 November 2026 ([public data sources]); the fourth source is the team's own phones:

1.  **Bus GPS:** `https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana/?category=rapid-bus-kl`, keyless Protobuf updated every 30 seconds under CC BY 4.0. The poller keeps T580 vehicles and computes headway and corridor speed between LRT Bukit Jalil and Technology Park Malaysia (TPM).
2.  **River level:** the Public Infobanjir table for Kuala Lumpur, every 15 minutes. It's HTML only, with no documented API or terms, so it's parsed server-side.
3.  **Weather warnings:** `https://api.data.gov.my/weather/warning/` and the MET forecast for Kuala Lumpur, keyless.
4.  **Phone probe:** an opt-in web page using `navigator.geolocation` at the LRT queue and on the shuttle, measuring queue wait and ride time.

`api.data.gov.my` allows 4 requests a minute per API, so one scheduled job, an Apps Script time trigger or a Cloud Run job, polls each feed once a minute and appends a timestamped row to the `Kuyoh_Corridor_Telemetry` Sheet ([context public feeds]).

### Kuyoh Shuttle Sentinel connectors

- **Google Drive and Sheets (GA):** read `Kuyoh_Corridor_Telemetry`, the shuttle schedule digitised from the PDF, and the editable `Corridor_Dispatch_Rulebook`.
- **Gmail (GA):** draft an advisory to Academic Administration listing classes that start in the affected window, taken from the public intake timetables, with the proposed grace window; send shuttle delay notices.
- **Google Calendar (GA):** create relief shuttle blocks on the LNO transport coordinator's calendar.
- **Jira Cloud and ServiceNow (GA):** open a corridor disruption incident recording gauge level, T580 corridor speed, warning status, and affected classes.
- **SharePoint and Slack (GA):** upload the daily punctuality and grace-window log, and post updates, so a student near 80% has a dated record of the disruption.
- **Custom MCP on Cloud Run (preview):** `kuyoh-transit-mcp` exposes `get_t580_vehicles()`, `get_kuyoh_water_level()`, and `get_met_warnings()`, and passes any source error straight through.

### Corridor dispatch rulebook

The rulebook is evaluated every 15 minutes while shuttles run, from the first 7:30 AM LRT departure to the last evening trips around 9:45 PM ([shuttle schedule]).

1.  **Green, normal:** gauge below Waspada, no thunderstorm warning, normal corridor travel time. Log a heartbeat row.
2.  **Amber, congestion or storm:** a MET thunderstorm warning for Kuala Lumpur, or corridor travel time over its threshold in the 7:30–8:45 AM pre-class peak. After the LNO duty officer approves: file a Jira advisory, post the update, and draft the grace-window advisory for classes starting in the next 30 minutes.
3.  **Red, river alert or gridlock:** the gauge at or above Waspada (31.15 m), or a corridor stoppage lasting more than 15 minutes. After approval: open a high-priority incident, block relief vans on the calendar, and log an excused transit delay window in SharePoint.

## Kuyoh Shuttle Sentinel validation

- **Interviews, 5–6 November:** 6–8 people, including daily LRT and residence shuttle riders, lecturers who take morning attendance in AttendiX 2.0, and LNO or Student Services staff.
- **Timed observation:** one peak (7:30–8:45 AM) at the LRT Bukit Jalil boarding point, recording queue length, boarding time per bus, and departures against the schedule.
- **Evaluation set:** 40 real 15-minute corridor windows captured live by the poller from 4 to 7 November, each stored with source URLs and timestamps. Two teammates label each window Green, Amber, or Red; report the confusion matrix, precision, and recall.

## Kuyoh Shuttle Sentinel rollout

- **Months 1–3, from the 24 November 2026 intake:** the LRT Bukit Jalil and M Vertica routes, owned by LNO, making late-arrival checks for morning classes consistent.
- **Months 4–6, from the 25 March 2027 intake:** every route, with the SharePoint excused-delay log feeding Academic Administration's attendance review.

## Kuyoh Shuttle Sentinel data and privacy

Transit, river, and weather feeds are public government data; attribute `data.gov.my` under CC BY 4.0, and note that Infobanjir publishes no terms ([context public feeds]). Phone location is opt-in, anonymous, and rounded to corridor zones, with no student IDs. If a feed errors or its Protobuf fails to parse, the poller writes the error to the Sheet and halts dispatch, with no cached positions ([project conventions]).

[project conventions]: /docs/references/project-conventions.md

## Kuyoh Shuttle Sentinel evidence limits

- **Crowding claims are soft:** the threads show busy mornings and crowded buses, not standing-room-only queues or exact arrival times.
- **No evidence of corridor floods:** the gauge exists, but it read 26.37 m on 3 November, below Normal, and no post reports flooding on the route. The Red tier may never fire during the 4–7 November capture.
- **Infobanjir can change:** it's an undocumented HTML table, so a layout change breaks the parser; the error must show.

## See also

- [Argon idea ranking](00-ranking.md)
- [Public data sources](/docs/research/data-sources.md) and [IoT and network](/docs/research/iot-and-network.md)
- [APU shuttle schedule, 22 October 2026][shuttle schedule]

[shuttle schedule]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf
[public data sources]: /docs/research/data-sources.md
[context public feeds]: /docs/CONTEXT.md#public-feeds
