# GateWatch: pre-class portal, timetable feed, and sign-in reachability probe

GateWatch is an external reachability probe for APU's student-facing portals: from off campus, it times APU's public timetable feed, API, sign-in, Moodle, and library hosts before each class-start wave, checks any failure from three vantages, and re-runs the same checks before a repair ticket closes. It is built for APU's [Centre of Technology and Innovation](https://cti.my/) (CTI), which built APSpace, and the IT Helpdesk (ITSM), in the [Intelligent Automation & Digital Transformation](/docs/BRIEF.md#challenge-tracks) track.

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

APSpace's store reviews put access and stability first. Of the 119 newest [Google Play reviews][play] (2018 to 2 November 2026), 17 mention login, crashes, loading, or errors, 18 mention attendance, and 15 the timetable, schedule, or classes; Apple's feed holds 22 [App Store reviews][app store] ([APSpace review themes]). A 2 November 2026 Play review (3 stars) says frequent re-login is annoying "when i have to take attendance, check timetable last minute, and top up apcard"; a 2023 review (7 likes) says the shuttle timings page "keeps on loading with no end"; and two 2026 reviews (July on the App Store, 1 star; September on Play, 3 stars) say logging in now opens the APU website instead of the app. A Google Maps reviewer wrote "Moodle and APspace constantly crashing. Need for better/New servers." (2 stars, 18 June 2026) ([Wi-Fi, power and core platforms]).

The IT Helpdesk had 725 public Confluence pages on 3 November ([KB spaces]); a Confluence search (CQL) recount on 5 November gave 621. The first FAQ on its [ITSM overview] is headed "Is is down right now?" and sends readers to [Availability of Services]. That page says it "is work in progress", lists only software licences and VirtualLab@APU, and was last edited on 6 February 2025.

S-numbers are Reddit close reads in [social research]. S1–S3 are Wi-Fi complaints, which GateWatch doesn't measure: a May 2026 commenter loses signal near stairs and in the crowded cafeteria ([S1]), a former student names unstable Wi-Fi in S0801 and E0903 ([S2]), and a first-year student reports Wi-Fi disappearing or very slow ([S3]). S1's close read infers the need to "capture repeatable endpoint tests" before and after a fix, and says the source "does not establish that IT closes tickets prematurely". S10 is a non-APU analogue: a property manager's washer and lift fail again after a vendor finds no fault ([S10]). Together they support a repair-acceptance check as a hypothesis, not a claim about APU IT.

Class starts cluster. Every session in the timetable feed has a start time, and from 09:00 to 17:00 on weekdays in the week of 2 November a mean of 107 of 222 physical rooms held a class in each 15-minute slot ([timetable row counts]). The feed is a 1.1 MB file on Amazon S3 with no CDN in front; `api.apiit.edu.my` is Amazon API Gateway behind CloudFront, and its replies pass through as cache misses ([feed endpoints], [feed users]). Sign-in runs on CAS at `cas.apiit.edu.my` (Tomcat) and Microsoft single sign-on, Moodle on `lms2.apiit.edu.my`, and the Koha catalogue on `opac.apu.edu.my` ([Systems APU runs]). APSpace's public source signs AttendiX attendance requests with a CAS ticket for the service `https://api.apiit.edu.my/attendix` ([AttendiX client]), so attendance depends on CAS.

[play]: https://play.google.com/store/apps/details?id=my.edu.apiit.apspace
[app store]: https://apps.apple.com/my/app/apspace/id1413678891
[APSpace review themes]: /docs/research/competition.md#the-official-apspace-app
[Wi-Fi, power and core platforms]: /docs/research/social.md#wi-fi-power-and-core-platforms
[KB spaces]: /docs/research/apu.md#apu-knowledge-base-on-confluence
[ITSM overview]: https://apiit.atlassian.net/wiki/spaces/ITSM/overview
[Availability of Services]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2810216477
[social research]: /docs/research/social.md#reddit-close-reads-of-operations-threads
[S1]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/comment/omoci19/
[S2]: https://www.reddit.com/r/malaysiauni/comments/1l19a16/comment/mvov59z/
[S3]: https://www.reddit.com/r/malaysiauni/comments/1l3zujy/i_think_ive_hit_rock_bottom_at_this_point_i_keep/
[S10]: https://www.reddit.com/r/PropertyManagement/comments/1i7m3iv/repeat_issues_not_fixed_when_reported/
[timetable row counts]: /docs/research/apu.md#timetable-row-counts
[feed endpoints]: /docs/research/apu.md#timetable-feed-endpoints
[feed users]: /docs/research/apu.md#who-already-uses-the-timetable-feed
[Systems APU runs]: /docs/research/apu.md#systems-apu-runs
[AttendiX client]: https://github.com/ctiteam/apspace/blob/master/src/app/graphql.module.ts

## Why existing tools miss it

In a simulation of 780 ideas from three model families, the "Wi-Fi and network diagnosis or capacity" cluster averages 8.7% of each family's ideas and is 16.0% of Claude's; its typical stack is access-point, gateway, and router telemetry with an auto-filed IT ticket ([clusters and shares]). None of APU's public sources is Wi-Fi or access-point data ([APU's public sources]), and the team can't enter campus, so such an entry would need simulated readings. GateWatch stays outside the building: it times public endpoints from a home broadband line, a mobile network, and Globalping's public probes, at times read from the timetable feed.

Uptime monitors already cover reachability. [Uptime Kuma](https://github.com/louislam/uptime-kuma) is a self-hosted monitor for HTTP(S), TCP, ping, and DNS at 20-second intervals, with 90+ notification services and status pages, run from wherever it is installed. [Pingdom] checks from "over 100+ servers worldwide", runs a second check before alerting "to filter out false positives", offers root cause analysis, and alerts by SMS, email, or webhook. Neither reads APU's timetable to time checks before class starts, and neither re-runs the original failing check before an ITSM ticket closes. GateWatch adds that repair-acceptance step: before a Jira Cloud ticket moves to Resolved, it repeats the same HTTP, DNS, and traceroute checks from all three vantages and attaches the before-and-after table.

[clusters and shares]: /docs/research/competition.md#clusters-and-shares
[APU's public sources]: /docs/research/apu.md
[Pingdom]: https://www.pingdom.com/product/uptime-monitoring/

## How it works

The team's Raspberry Pi 5 (8 GB) sits on a home broadband line off campus, a team phone runs on mobile data, and Globalping supplies public probes in Malaysia. On 5 November 2026, 45 Globalping probes were online in Malaysia, 19 of them tagged as eyeball (consumer) networks, on networks including TM Technology Services, Binariang, U Mobile, and DiGi Telecommunications ([Globalping probe list](https://api.globalping.io/v1/probes)).

### Edge and network

- **Globalping probe:** the Pi runs Globalping's probe container, which works on x86 and ARM: `docker run -d --log-driver local --network host --restart=always --name globalping-probe globalping/globalping-probe` ([globalping-probe](https://github.com/jsdelivr/globalping-probe)). Adding `-e GP_ADOPTION_TOKEN=…` adopts the probe into the team's account, which earns extra daily credits. The rules allow one probe per public IPv4 address and forbid changing its code.
- **Timer:** every 10 minutes, and again 15 minutes before each class-start wave in the timetable feed, the Pi sends one unauthenticated request to each of seven endpoints from [feed endpoints] and [Systems APU runs]: `open-ws/weektimetable`, `transix-v2/holiday/active`, `transix-v2/locations`, `sso.apu.edu.my`, `cas.apiit.edu.my`, `lms2.apiit.edu.my`, and `opac.apu.edu.my`. It logs DNS lookup, TCP connect, TLS handshake, time to first byte, total time, HTTP status, and the `x-cache` header where the host sends one (`api.apiit.edu.my` and `sso.apu.edu.my`).
- **Feed etiquette:** the S3 check is a `HEAD` request, so APU doesn't pay for a 1.1 MB download every 10 minutes ([feed users]). The Pi fetches the feed once a day with `If-None-Match` to read class start times.
- **Phone:** a probe page on the phone times the same seven endpoints over mobile data. A browser can read the status only where the host sends CORS headers: the S3 feed and `api.apiit.edu.my` send `Access-Control-Allow-Origin: *`; `sso`, `cas`, `lms2`, and `opac` send none, so for those the phone records timing and whether the request completed.
- **Ingest:** each reading carries a `deviceTimestamp` and goes over HTTPS to Cloud Run in `asia-southeast1` (Singapore), then Pub/Sub and a BigQuery subscription, a path that needs a billing card ([Cloud path], [Cloud Run regions]); `publishTime` minus `deviceTimestamp` gives each reading's latency ([shared design]). Google has no managed MQTT broker, so MQTT would need a broker the team runs, reached over secure WebSockets, or a partner broker ([MQTT brokers]). The Pi also writes the latest reading per endpoint and vantage, and the next class-start wave's session count from the feed, to a Google Sheet that the workflow reads with `Get cell values`.
- **On-demand tests:** the workflow calls the Globalping MCP server's `http`, `dns`, and `mtr` tools from Malaysian probes ([Globalping MCP]). Free use is 250 tests an hour without an account and 500 with one ([Globalping credits](https://globalping.io/credits)).

[Cloud path]: /docs/CONTEXT.md#cloud
[Cloud Run regions]: https://docs.cloud.google.com/run/docs/locations
[MQTT brokers]: /docs/research/iot-and-network.md#managed-mqtt-brokers
[shared design]: 00-ranking.md#shared-edge-and-network-design
[Globalping MCP]: https://github.com/jsdelivr/globalping-mcp-server

### Connectors

| Connector               | Type                              | Access                                                                                 | Actions                                                                              | Role in GateWatch                                                                          |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Globalping MCP server   | Third-party, custom MCP (preview) | MCP step or agent tool, Streamable HTTP ([custom MCP])                                 | `ping`, `traceroute`, `dns`, `mtr`, `http`, `locations`, `limits` ([Globalping MCP]) | Runs on-demand tests from Malaysian probes to separate a local path fault from a wider one |
| Globalping data store   | Third-party, federated (preview)  | Search of the team's Measurements, read-only actions ([Globalping connector])          | Search                                                                               | Lets staff look up past measurements in chat                                               |
| Jira Cloud              | Third-party                       | Federated search and actions ([Jira Cloud])                                            | Create issue, Update issue, Create comment, Upload attachment, Change issue status   | Opens the incident with the three-vantage table; gates closure on a re-run                 |
| Confluence Cloud        | Third-party                       | Federated search and actions ([Confluence Cloud])                                      | Update page, Create page                                                             | Keeps a status page modelled on ITSM's Availability of Services                            |
| Microsoft SharePoint    | Third-party                       | Federated search and actions ([SharePoint])                                            | Create list item                                                                     | Logs each incident and recovery in a reachability list                                     |
| Microsoft Outlook       | Third-party                       | Federated search and actions ([Outlook])                                               | Create message (draft), Send mail, Edit Excel data                                   | Drafts ITSM duty notices; updates an Excel log in OneDrive or SharePoint                   |
| BigQuery                | Google, federated query (preview) | BigQuery data store, queried from the assistant; not a workflow connector ([BigQuery]) | SQL query                                                                            | Stores the timing history; staff join it with class-start counts for the baseline          |
| Google Drive and Sheets | Google                            | Workflow connector ([Drive and Sheets])                                                | Get cell values, Update cell values, Create file                                     | Holds the latest readings the workflow reads; a new file can fire the event trigger        |

[custom MCP]: /docs/research/gemini-enterprise.md#requirements-and-registration
[Globalping connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/globalping/set-up-data-store
[Jira Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[Confluence Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud
[SharePoint]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint
[Outlook]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-outlook
[BigQuery]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[Drive and Sheets]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive

## Day-to-day workflow

1.  **Trigger:** a Schedule trigger, hourly or a cron expression in Malaysia time, timed before class-start waves; scheduled runs can start up to 5 minutes late and need a multi-region location ([Workflow Builder limits]). Workflows have no webhook trigger, so when a Pi check fails the Pi creates a file in a watched Drive folder, and an Event trigger picks it up within 5–10 minutes ([event triggers]).
1.  **Triage:** a Gemini Agent step reads the latest Pi and phone rows from the Sheet and calls the Globalping MCP tools `http`, `dns`, and `mtr` from Malaysian probes ([MCP steps]). Custom MCP is in preview and blocked by default; if it stays blocked, the Pi calls the Globalping API itself and writes the results to the Sheet. If the Pi fails while the phone and Globalping succeed, it labels a local path issue on the team's line and proposes no ticket. If all three vantages fail or slow down ahead of a class-start wave, it labels the problem as seen from all three vantages, which means it isn't local to one network; it doesn't name a server cause.
1.  **Human approval:** an Approval step pauses the run at **Needs Review** for the ITSM or CTI on-call engineer, showing the three-vantage table, the next wave's session count, and the proposed Jira issue and status-page change ([HITL steps]).
1.  **Approved writes:** Jira Create issue and Upload attachment for the table, Confluence Update page for the status page, SharePoint Create list item, and an Outlook Create message draft of the duty notice. Connector writes from a workflow agent step require human review ([workflows]).
1.  **Repair acceptance:** when the engineer marks the issue fixed, a Jira Event trigger starts a re-run of the original checks from the same three vantages. The workflow adds the before-and-after table with Create comment, and the engineer approves Change issue status to Resolved.
1.  **Failure behaviour:** when a source fails (the Globalping API, the Sheet, the timetable feed, or a silent Pi or phone), the run and the approval message show the error. There is no cached reading, fallback, or default value; a cycle missing a vantage is labelled incomplete and proposes no ticket. Event-triggered runs that fail with `RESOURCE_EXHAUSTED` aren't retried, and schedules pause unless someone refreshes the author's credentials every 14 days ([unattended runs]).

[Workflow Builder limits]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/quotas-and-limits
[event triggers]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/configure-event-trigger
[MCP steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/connect-mcp-servers
[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[unattended runs]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in

## Baseline, metrics, and 3- and 6-month plan

- **Baseline:** ITSM's public answer to "is it down" is a status page last edited on 6 February 2025 that lists no portal ([Availability of Services]). No public record of APU portal reachability exists.
- **Metric:** score each triage label against the on-call engineer's check across 30–50 real probe cycles, and report precision, recall, and the sample size ([judging criteria]). Also report the share of repair tickets closed with a before-and-after table.
- **3 months:** CTI and ITSM run GateWatch on the APSpace feeds, Moodle, and CAS ahead of daily class waves.
- **6 months:** ITSM requires a GateWatch pass from all three vantages before a portal reachability ticket moves to Done.

[judging criteria]: /docs/CONTEXT.md#what-ntt-data-said-it-will-rate

## Boundaries

- GateWatch measures external HTTPS, DNS, and traceroute timings: whether APU's public endpoints answer from outside, and how fast. It doesn't measure indoor Wi-Fi in rooms such as S0801 or E0903, and it doesn't diagnose server root causes.
- Requests are polite: one per endpoint every 10 minutes plus the pre-class check, so 6 an hour per endpoint and 12 on `api.apiit.edu.my`, which serves two of the seven. It never logs in or sends credentials, never calls AttendiX or staff-keyed paths, and requests only URLs named in public source.
- APU's Terms of Use ask for permission before "use of this Website or any of the Contents", so ask the organisers in writing before the demo depends on the feed ([terms of use]).
- During the hackathon, Jira, Confluence, and SharePoint writes go to sites the team owns; connecting APU's Confluence needs admin rights on APU's site ([source routes]).
- The timetable feed carries lecturer names; GateWatch keeps only start times and session counts ([personal data]).
- The Globalping data store, custom MCP, and BigQuery federated query are in preview, and Gemini Enterprise blocks custom MCP data stores by default until an org policy admin allows them ([custom MCP]).

[terms of use]: /docs/research/apu.md#terms-of-use-and-robotstxt
[source routes]: /docs/research/apu.md#how-each-source-reaches-an-agent
[personal data]: /docs/research/apu.md#personal-data-in-the-timetable-feed

## Verification notes

"Run" means the Gemini Deep Research report this set is based on ([00-ranking.md](00-ranking.md)). Checked on 5 November 2026 against the repo research docs, the Gemini Enterprise connector and Workflow Builder pages, the Globalping repositories and API, the ITSM pages through Confluence's public REST API, Apple's review feed, and one unauthenticated request to each APU endpoint (all seven returned `200`; CAS answered as `Apache-Coyote/1.1`, `lms2` set a `MoodleSession` cookie).

Corrections:

- Run said the 2 November review calls re-login and slow loading acute; the review says frequent re-login is annoying. The review counts are in [APSpace review themes], not the social or APU research; Apple's feed returned 22 reviews, including the July 2026 browser review.
- Run said the first FAQ is "Is it down right now?"; the page reads "Is is down right now?" and links to Availability of Services, last edited 6 February 2025 and marked "work in progress".
- Run said S1, S2, S3, and S10 show intermittent service degradation and the need for before-and-after endpoint tests; S1–S3 are Wi-Fi complaints, S10 is a non-APU washer and lift account, and the endpoint-test idea is the close read's inference.
- Run said AttendiX is at `api.apiit.edu.my/attendix`; that URL is the CAS service name in APSpace's 2023 source, which sends AttendiX queries to `attendix.apu.edu.my/graphql`.
- Run said class starts affect hundreds of students at once; the feed has no headcounts, so the file uses session and room counts.
- Run said 8.7% of ideas proposed an indoor Wi-Fi agent; the cluster is "Wi-Fi and network diagnosis or capacity", and 8.7% is the mean of three family shares.
- Run said Uptime Kuma and Pingdom "merely fire a down alert"; Pingdom checks from 100+ servers and re-checks before alerting.
- Run said Gemini Enterprise has a native Globalping connector with `ping`, `traceroute`, `dns`, `mtr`, and `http`; the native data store (preview) only searches the team's Measurements with read-only actions, and those tools belong to the separate Globalping MCP server. The probe command is right as written; its source is the globalping-probe README, not globalping.io. Custom MCP is in preview and blocked by default, so the file adds a path where the Pi calls the Globalping API and writes to the Sheet.
- Run listed Edit Excel data under SharePoint; it is an Outlook action on Excel files in OneDrive or SharePoint. Run listed Create message as a send action; it creates a draft.
- Run used a Request info step for one-click approval; the Approval step is the documented sign-off step. Run said an Event trigger fires when the Pi logs an error; event triggers poll supported connectors with 5–10 minutes' delay and there's no webhook trigger, so the Pi writes a Drive file.
- Run used Cloud Run in `asia-southeast4` (Kuala Lumpur), which [Google Cloud and AI tools](/docs/research/google-cloud.md#cloud-run) took from the pricing page; the Cloud Run locations page doesn't list it, so the file uses `asia-southeast1` (Singapore).
- Run streamed MQTT 5.0 to Cloud Run; Google has no managed MQTT broker, so the file uses HTTPS. Run placed BigQuery in the workflow; BigQuery federated query is in preview and isn't a workflow connector, so the workflow reads a Sheet.
- Run polled the S3 feed every 10 minutes; each GET is a 1.1 MB download APU pays for, so the check is a `HEAD`. Run wrote to APU's ITSM Jira and Confluence; that needs APU admin rights, so hackathon writes go to team-owned sites.
- Run said ITSM has 725 public pages; that is the 3 November count in [KB spaces], and a CQL recount on 5 November returned 621.
- Run said "Centre for Technology and Innovation"; cti.my says "Centre of Technology and Innovation".

Not verified: the 119 Play reviews and their counts (taken from [APSpace review themes]); whether Gemini Enterprise's custom MCP OAuth fields work with Globalping's OAuth; whether a team can target its own adopted probe in a measurement; Pingdom's probe locations in Malaysia; and the cost and limits of a phone probe page left running.

## See also

- [00-ranking.md](00-ranking.md)
- [APU's public documents, data, and systems](/docs/research/apu.md)
- [Competition](/docs/research/competition.md)
- [Social research](/docs/research/social.md)
- [Gemini Enterprise](/docs/research/gemini-enterprise.md)
- [Google Cloud and AI tools](/docs/research/google-cloud.md)
- [IoT and network](/docs/research/iot-and-network.md)
- [Hackathon context](/docs/CONTEXT.md)
