# SpineDesk Pulse

SpineDesk Pulse is a scheduled Gemini Enterprise workflow for APU's TechCentre. Phones and laptops in a classroom act as Wi-Fi and A/V probes, each degraded reading is checked against the live timetable and APU's IT helpdesk knowledge base (KB), and the workflow drafts an urgent Jira Cloud and ServiceNow ticket for one-tap approval. It ranks first at 97.5 / 100 in the Intelligent Automation & Digital Transformation track ([ranking](00-ranking.md)).

Contents:

1.  [Problem at TechCentre](#problem-at-techcentre)
    1.  [Classroom Wi-Fi and A/V evidence](#classroom-wi-fi-and-av-evidence)
    2.  [Urgent SLA and the ticket gap](#urgent-sla-and-the-ticket-gap)
2.  [How SpineDesk Pulse works](#how-spinedesk-pulse-works)
    1.  [Probe and network architecture](#probe-and-network-architecture)
    2.  [SpineDesk Pulse connectors](#spinedesk-pulse-connectors)
    3.  [Classroom SLA rulebook](#classroom-sla-rulebook)
    4.  [SpineDesk Pulse daily run](#spinedesk-pulse-daily-run)
3.  [SpineDesk Pulse validation](#spinedesk-pulse-validation)
    1.  [Interviews and timed observation](#interviews-and-timed-observation)
    2.  [SpineDesk Pulse evaluation set](#spinedesk-pulse-evaluation-set)
4.  [SpineDesk Pulse rollout](#spinedesk-pulse-rollout)
5.  [SpineDesk Pulse data and privacy](#spinedesk-pulse-data-and-privacy)
6.  [SpineDesk Pulse evidence limits](#spinedesk-pulse-evidence-limits)
7.  [See also](#see-also)

## Problem at TechCentre

### Classroom Wi-Fi and A/V evidence

- **Students and lecturers notice:** students lose signal "around the cafeteria when there's a lot of people and near any of the stairs" on Wi-Fi 6 and 6E devices, and lecturers mock the Wi-Fi in class ([wifi thread]).
- **APU's KB names the cause:** Wi-Fi is "a shared (and half-duplex) medium", Teams traffic can push airtime to "100% utilization", and "only one device in a room or classroom needs to be connected" to a Teams call ([KB Teams Wi-Fi]).
- **Projection depends on Wi-Fi:** lecturers project wirelessly with Epson EasyMP Network Projection and per-block projector profiles, and must "walk-in to TechCentre which presently located at level 6 opposite of Block D" to install the software ([KB projector]). APU's campus guide puts Tech Centre on Spine level 6, "just below the Technology Services Office" ([KB campus guide]).
- **Sign-up is fiddly:** devices join through OnBoard@APU, which guides them to Student@APU 2.0 or Staff@APU 2.0, with separate guides per operating system ([KB Wi-Fi], [KB OnBoard Android], [KB OnBoard iPhone]).

[wifi thread]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/
[KB Wi-Fi]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/669581410
[KB OnBoard Android]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/670105616
[KB OnBoard iPhone]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/674529297
[KB campus guide]: https://apiit.atlassian.net/wiki/spaces/LNO/pages/3855974442

### Urgent SLA and the ticket gap

APU's SLA treats "Classroom teaching and learning (during session) including Wi-Fi connection, A/V, and streaming issues" as urgent. During office hours, 8:30 AM to 6:00 PM Monday to Friday, urgent matters "will be responded immediately with the consideration of onsite assistance travel time". Other requests are FIFO, with a first response within 24 hours and resolution within 48 ([KB SLA]).

Reporting a fault mid-lecture is slow. A ticket goes through APSpace > More > Help Centre, a sign-in, a department and request type, and typed details ([KB Virtual Help Centre]), and that is hard on the degraded Wi-Fi being reported. Helpdesk staff elsewhere complain of tickets with "a complete lack of information in the subject line or description box" ([ticketing issue thread]).

[KB Virtual Help Centre]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/1337360387
[ticketing issue thread]: https://www.reddit.com/r/sysadmin/comments/1ijcdej/

## How SpineDesk Pulse works

### Probe and network architecture

The probe needs no board, so OnBoard@APU's certificate sign-up can't block it. It's a zero-install web page opened from a QR code on the lectern, such as room B-06-07.

1.  **Edge signal:** every 10 seconds the page records HTTP round-trip time (RTT) and jitter over five sequential `fetch()` calls timed with `performance.now()`, the share of failed requests, and `navigator.connection` type, downlink, and RTT where the browser supports it. The lecturer has two one-tap flags: projector unreachable, and Teams call freezing.
2.  **Visible network:** when the Wi-Fi drops, readings wait in IndexedDB with `device_captured_at` and `offline_reconnect_count`. On reconnect, through Wi-Fi or a hotspot, they flush to an Apps Script web app or Cloud Run feeder that stamps `server_received_at`. The Sheet and dashboard show device-to-row latency and highlight offline bursts, as the [IoT and network] research recommends.
3.  **Cloud orchestration:** the probe, a Cloud Run MCP server, and the evaluation scripts are built in Google Antigravity, and the workflow runs in Gemini Enterprise Workflow Builder.

[IoT and network]: /docs/research/iot-and-network.md

### SpineDesk Pulse connectors

Stages and actions come from the [Gemini Enterprise data] research. The Jira Cloud, ServiceNow, and inbox endpoints are team-controlled sandboxes holding only real records ([context connectors]).

| Connector               | Stage   | Job in the workflow                                                                                                                 |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Google Drive and Sheets | GA      | Read `SpineDesk_Live_Telemetry` and `TechCentre_SLA_Rulebook` live; append audit rows                                               |
| Gmail                   | GA      | Event trigger on the sandbox helpdesk inbox; draft the lecturer a workaround from the matched KB article                            |
| Google Calendar         | GA      | Create a 15-minute dispatch event for the on-duty technician, allowing travel time                                                  |
| Jira Cloud              | GA      | Create an issue with room, class code, RTT, failures, and KB link; comment on repeats; change status                                |
| ServiceNow              | GA      | Create and update the matching incident (OAuth Authorization Code flow)                                                             |
| SharePoint              | GA      | Upload the daily incident summary                                                                                                   |
| Globalping              | Preview | Ping, traceroute, or HTTP from public probes to `apu.edu.my` and the ingest endpoint, to tell upstream from in-room faults          |
| Custom MCP on Cloud Run | Preview | `get_active_class(room, time)`; `search_kb(symptom)`, reading APU's public KB live over the Confluence REST API; `check_upstream()` |

[Gemini Enterprise data]: /docs/research/gemini-enterprise.md#data-in-and-out
[context connectors]: /docs/CONTEXT.md#connectors-and-live-data

### Classroom SLA rulebook

The 15 rules live in the `TechCentre_SLA_Rulebook` Sheet so TechCentre can change thresholds without touching prompts. VendorGuard, the top-scoring entry at Agent Academy 2026, kept its 15 rules in an editable data store the same way ([agent hackathon winners]).

1.  **R01–R04, priority:** match the reading's time and room to the published timetable ([KB timetable]) and APU's class code format, such as `APP___CT042-3-1-IDB-LAB-1___2020-06-14` ([KB class code]). A class in session during office hours is urgent under the SLA; anything else is FIFO.
2.  **R05–R08, fault signatures:**
    - **Teams airtime contention:** upstream Globalping checks are healthy, but at least three probes in the room show jitter above 120 ms or downlink under 1.5 Mbps. Attach the KB advice that one device per room joins the Teams call ([KB Teams Wi-Fi]).
    - **OnBoard@APU sign-up:** a user taps "can't connect". Attach the guide for their operating system.
    - **Projector profile:** the lecturer flags the projector. Attach the block's projector profile guide and dispatch an A/V technician ([KB projector]).
    - **VirtualLab lag:** a lab class (`-LAB-`) shows high RTT. Attach the VirtualLab connection and file-transfer guides ([KB VirtualLab], [KB VirtualLab files]).
3.  **R09–R12, deduplication:** repeat reports from one room within 10 minutes become comments and a count on the open Jira issue, found by JQL, rather than new tickets. APU's own ticket statuses list duplicates as a reason to cancel ([KB ticket status]).
4.  **R13–R15, closing:** APU closes a ticket after two days of inactivity, and a reply reopens it to Waiting for Support ([KB ticket status]). Helpdesks elsewhere fight tickets reopened by "thanks" emails ([thanks thread]), so a thank-you reply is logged as confirmation and the ticket stays Done.

[agent hackathon winners]: /docs/research/winners.md
[KB timetable]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/321257473
[KB class code]: https://apiit.atlassian.net/wiki/spaces/AA/pages/1626997180
[KB VirtualLab]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/884047873
[KB VirtualLab files]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/227639317
[KB ticket status]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/1530527755
[thanks thread]: https://www.reddit.com/r/sysadmin/comments/ho6k8a/

### SpineDesk Pulse daily run

The workflow runs every 15 minutes during office hours, and on Gmail and Jira Cloud events, which Workflow Builder polls every 5–10 minutes; there is no webhook trigger. Each run reads untriaged telemetry rows, enriches them through the MCP server and Globalping, scores them against the rulebook, and prepares the Jira issue, ServiceNow incident, Calendar event, and Gmail draft. The platform pauses runs that affect other people and requires review of connector writes, so the TechCentre duty lead approves each dispatch with one tap. Schedules run on the author's credentials, which expire every 14 days ([context workflows]).

[context workflows]: /docs/CONTEXT.md#workflows-and-unattended-runs

## SpineDesk Pulse validation

### Interviews and timed observation

Following the [build plan] and [research and impact] guidance: recruit 6–8 people on 4 November (TechCentre and helpdesk staff, lecturers, and class representatives), interview them in two rounds on 5–6 November, and run one timed observation.

- **To a lecturer:** "Think back to the last time classroom Wi-Fi or the wireless projector failed during a live lecture. Walk me through what you did in the first five minutes. Did you open a ticket on Virtual Help Centre, call 03-8992 5050, or use another workaround?"
- **To TechCentre staff:** "On the last urgent classroom ticket you handled, what information was missing from the first report, and how many minutes passed from the fault starting to you reaching the room?"
- **To a student:** "The last time the Wi-Fi slowed down in a class where everyone had laptops open, what were people running, and how did you finish the class task?"
- **Timed observation, Thursday 5 November:** time real Virtual Help Centre submissions step by step (sign-in, department, request type, typing the room and class) and the wait for a first response. This is the baseline; no figure is assumed before it.
- **Round 2, Friday 6 November:** test the thin slice with interviewees and record each finding-to-decision change in the README, such as adding offline buffering if phones lose the network mid-reading.

[build plan]: /docs/CONTEXT.md#build-plan-to-17-november
[research and impact]: /docs/research/judging.md

### SpineDesk Pulse evaluation set

A frozen set of 45 real items collected on campus from 4 to 7 November: each is a real probe capture or a real troubleshooting scenario from APU's 725 public IT helpdesk pages ([APU public documents]). Two teammates label every item before the agent runs. The positive class is "urgent classroom action needed". A missed outage costs class time, while a false alarm costs the duty lead a few seconds, so the targets are recall of at least 90% and precision of at least 85%. Report true and false positives and negatives, and failure cases such as short spikes while walking past stairwell access points.

## SpineDesk Pulse rollout

Nothing in APU's private systems or network configuration changes before launch. The horizons follow the BSc Computer Science intakes on 24 November 2026 and 25 March 2027 ([APU public documents]).

| Horizon    | Scope                             | Owner and steps                                                                                                                                                    | Gate                                                                                                                 |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Months 1–3 | Block B and Block D classrooms    | TechCentre lead with CTI (`cti@apu.edu.my`): QR codes on lecterns, the rulebook Sheet, APU's Virtual Help Centre project, 15-minute office-hours runs              | Precision and recall floors agreed with the owner before go-live (NIST AI RMF MAP 1.5); every write approved         |
| Months 4–6 | All blocks, auditoriums, and labs | IT operations with Academic Administration: add the probe link beside the AttendiX 2.0 attendance step ([KB AttendiX]) so opening attendance runs a 3-second check | Fewer unlogged in-class faults against the baseline; a quarterly congested access point heatmap for the network team |

[KB AttendiX]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/221088395

## SpineDesk Pulse data and privacy

- **Real data, loud failure:** every row is a real browser measurement from team devices or a live Globalping result, enriched with live calls to APU's public KB. If the KB or Globalping fails, the MCP server and dashboard show the HTTP status and time, with no mock, seed, or cached fallback ([project conventions]).
- **No personal data:** the probe stores no names, student IDs, MAC addresses, images, or audio; only RTT, jitter, failures, downlink, room code, and time. Rows are deleted after 30 days.

[project conventions]: /docs/references/project-conventions.md

## SpineDesk Pulse evidence limits

- **No baseline yet:** the triage time saved is unknown until the 5 November observation.
- **Safari has no `navigator.connection`:** iPhones report `fetch()` timings and failures only.
- **Which office dispatches:** Tech Centre and the Technology Services Office above it are separate rooms; confirm in interviews which one sends technicians to classrooms.
- **Not APU evidence:** a widely shared "amazing student wifi" post on r/malaysiauni never names APU, and its commenters are from other campuses, so don't cite it.

## See also

- [Argon idea ranking](00-ranking.md)
- [IoT and network](/docs/research/iot-and-network.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise.md#data-in-and-out)
- [APU IT helpdesk SLA][KB SLA] and [Teams Wi-Fi contention][KB Teams Wi-Fi] in APU's KB

[KB projector]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/218857672
[KB Teams Wi-Fi]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2291695772
[KB SLA]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/491356161
[APU public documents]: /docs/research/apu.md
