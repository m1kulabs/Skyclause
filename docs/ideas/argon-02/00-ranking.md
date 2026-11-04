# Argon-02 idea ranking

Five product ideas for the APU Cloud Innovation Hackathon 2026, ranked on an 8-component scoring matrix, with ChronoDiff first. The set comes from a Gemini Deep Research run on 5 November 2026 over this repo's brief, context, and research docs; its claims were checked against the sources it cited, and it doesn't use other idea sets.

Contents:

1.  [Ranking](#ranking)
    1.  [Score changes](#score-changes)
1.  [Scoring matrix](#scoring-matrix)
1.  [Ideation rounds](#ideation-rounds)
    1.  [Round 1: harvest](#round-1-harvest)
    1.  [Round 2: remote access, crowd, and privacy cuts](#round-2-remote-access-crowd-and-privacy-cuts)
    1.  [Round 3: platform and hardware stress test](#round-3-platform-and-hardware-stress-test)
1.  [Shared edge and network design](#shared-edge-and-network-design)
1.  [How the set differs from the crowd](#how-the-set-differs-from-the-crowd)
1.  [Recommendation](#recommendation)
1.  [Verification notes](#verification-notes)
1.  [See also](#see-also)

## Ranking

Every product assumes the team works off campus, gets no help from APU staff or lecturers, and has only phones and one 8 GB Raspberry Pi 5. Scores are out of 100; weights are under [Scoring matrix](#scoring-matrix). They are the run's scores, lowered where a check on 5 November removed a score's basis ([Score changes](#score-changes)); the Run column keeps the run's total. 1P means first-party (Google) connectors and 3P third-party ones. The checks didn't change the order, but KuyohGuard leads CanonKeeper by only half a point.

| Rank | Product                          | Track                                     | Named APU owner              | M1 (20) | M2 (15) | M3 (15) | M4 (15) | M5 (10) | M6 (10) | M7 (10) | M8 (5) | Total | Run  |
| ---- | -------------------------------- | ----------------------------------------- | ---------------------------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------ | ----- | ---- |
| 1    | [ChronoDiff](01-chronodiff.md)   | Intelligent Automation, also Smart Campus | Academic Administration (AA) | 18.5    | 14.5    | 14.0    | 15.0    | 9.5     | 9.0     | 7.5     | 4.0    | 92.0  | 95.5 |
| 2    | [KuyohGuard](02-kuyohguard.md)   | Smart Campus, also Intelligent Automation | Logistics & Operations (LNO) | 17.5    | 13.5    | 15.0    | 14.5    | 7.5     | 8.5     | 6.5     | 4.0    | 87.0  | 92.0 |
| 3    | [CanonKeeper](03-canonkeeper.md) | Intelligent Automation                    | IT Helpdesk (ITSM) and AA    | 19.0    | 14.5    | 12.5    | 15.0    | 7.5     | 7.0     | 7.0     | 4.0    | 86.5  | 89.5 |
| 4    | [GateWatch](04-gatewatch.md)     | Intelligent Automation                    | CTI team and ITSM            | 16.5    | 13.5    | 15.0    | 15.0    | 7.5     | 4.5     | 6.5     | 4.0    | 82.5  | 86.5 |
| 5    | [BiblioForge](05-biblioforge.md) | Data-Driven Research                      | APU Library (LIB)            | 17.0    | 13.0    | 11.0    | 13.0    | 5.5     | 8.5     | 6.0     | 3.5    | 77.5  | 83.0 |

A team selects exactly one track ([tracks]); where the table names two, the second is where the run expects secondary impact.

- **[ChronoDiff](01-chronodiff.md):** the Pi polls APU's public timetable feed (17.15 MB decoded, 1.14 MB transferred) and its intake, holiday, and shuttle feeds, flags changed sessions, room double-bookings, and holiday collisions across the 1,045 intakes in the feed's four-week window, and stages reviewed Jira Cloud, SharePoint, Outlook, Google Calendar, and Gmail updates for Academic Administration. Students keep rebuilding timetable tools: the feed's URL appears in 26 GitHub repositories, `cron-apu-timetable` has 40 forks, and none of 780 simulated ideas is a student-facing timetable change alert ([feed endpoints], [feed rows], [feed users], [saturation tiers]).
- **[KuyohGuard](02-kuyohguard.md):** joins the Sungai Kuyoh river gauge and rainfall station at LRT Bukit Jalil, Rapid Bus KL positions for feeder route T580, MET Malaysia warnings, and APU's class dismissals and 253 shuttle trips, and drafts pre-dismissal advisories and dispatch actions for Logistics & Operations ([Infobanjir], [GTFS Realtime], [feed endpoints]).
- **[CanonKeeper](03-canonkeeper.md):** hashes APU's live feeds and official PDFs, such as department hours, the shuttle schedule, and the intake calendar, checks them against the 1,189 public knowledge base (KB) pages counted on 3 November, and stages reviewed fixes in team-owned Confluence Cloud, Jira Cloud, and SharePoint sites ([APU KB]).
- **[GateWatch](04-gatewatch.md):** checks from outside APU, before each class-start wave, whether APSpace, the timetable feed, and sign-in answer, using an external reachability probe on the Pi, phone cellular checks, and Globalping. Of the 119 newest Google Play reviews of APSpace, 17 mention login, crashes, loading, or errors ([APSpace reviews], [Globalping connector]).
- **[BiblioForge](05-biblioforge.md):** compares upcoming intakes and module cohort sizes from the timetable feed with Koha holdings, read through Koha's public REST API because the OPAC pages need a login, and with APU's OpenAlex works (3,660 by institution filter on 5 November), and drafts acquisition tickets, reading-list pages, and procurement trackers for the Library ([APU systems], [OpenAlex]).

[OpenAlex]: /docs/research/data-sources.md#openalex

### Score changes

Each change below rests on a correction recorded in that product's verification notes. The BigQuery cut applies to every product whose workflow queried BigQuery: workflows don't support it ([workflows]), so the Pi writes decision-ready rows to a Sheet; GateWatch's M1 cut already includes it.

| Product     | Criterion | Run  | Checked | Why                                                                                                                                                                        |
| ----------- | --------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChronoDiff  | M1        | 19.5 | 18.5    | The Confluence connector needs admin rights on APU's site, so Confluence and Jira are team-owned stand-ins; workflows can't query BigQuery                                 |
| ChronoDiff  | M5        | 10.0 | 9.5     | Timetable churn ranks third (tied on the top score), not first; no source shows room double-booking at APU; the attendance link rests on one review                        |
| ChronoDiff  | M6        | 10.0 | 9.0     | "0 of 780" holds only for student-facing alerts; room booking and timetable optimisation holds 2.7%; NTT DATA's demo covers timetables; student tools already sync changes |
| ChronoDiff  | M7        | 8.5  | 7.5     | The only timed baseline is one case at one Zambian university, and the two archived feed copies give no before-and-after pairs                                             |
| KuyohGuard  | M1        | 18.5 | 17.5    | There is no named Confluence search action, the shuttle pages sit in the Accommodation (AC) space, not LNO, and workflows can't query BigQuery                             |
| KuyohGuard  | M2        | 14.0 | 13.5    | A gauge reading can't fire a trigger; the Drive-file workaround adds 5 to 10 minutes, and the lead time is unmeasured                                                      |
| KuyohGuard  | M5        | 9.5  | 7.5     | Only S2 reports 30 to 60 minute waits (S4 says 20 at most, S6 10 to 15); the full-bus quote is second-hand, and the fares come from one resident                           |
| KuyohGuard  | M6        | 9.0  | 8.5     | The rival shuttle repository already lists rain alerts                                                                                                                     |
| KuyohGuard  | M7        | 7.5  | 6.5     | No source shows LNO runs the shuttles, and there is no timed baseline                                                                                                      |
| CanonKeeper | M1        | 19.5 | 19.0    | Workflows can't query BigQuery, so the Pi keeps the KB page index                                                                                                          |
| CanonKeeper | M5        | 9.0  | 7.5     | No source ties repeated enquiries to stale KB pages; the Reddit themes rank fourth; the library-hours page matches the live feed                                           |
| CanonKeeper | M6        | 8.0  | 7.0     | changedetection.io already diffs JSON, PDF text, and LLM summaries, so the edge is the cross-source check alone                                                            |
| GateWatch   | M1        | 18.0 | 16.5    | The native Globalping connector only searches past measurements; live tests need its MCP server through preview custom MCP, blocked by default                             |
| GateWatch   | M2        | 14.0 | 13.5    | The Pi can't fire an event trigger; the Drive-file workaround adds 5 to 10 minutes                                                                                         |
| GateWatch   | M5        | 8.5  | 7.5     | The Reddit evidence is about Wi-Fi, which GateWatch doesn't measure                                                                                                        |
| GateWatch   | M6        | 5.5  | 4.5     | Pingdom already checks from many locations and re-checks before alerting                                                                                                   |
| BiblioForge | M1        | 17.5 | 17.0    | Workflows can't query BigQuery, so the Pi computes the scarcity ranking                                                                                                    |
| BiblioForge | M2        | 13.5 | 13.0    | Manual triggers start from chat, not a phone scan                                                                                                                          |
| BiblioForge | M3        | 12.0 | 11.0    | The ISBN lookup returns HTTP 500, so the phone scan is data entry, not sensing                                                                                             |
| BiblioForge | M4        | 14.5 | 13.0    | The OPAC pages need a login; holdings come from Koha's public REST API, pending the Library's permission                                                                   |
| BiblioForge | M5        | 7.0  | 5.5     | No source shows library or textbook shortages; the library posts are about seats                                                                                           |
| BiblioForge | M8        | 4.0  | 3.5     | The pilot depends on the Library's permission to use the API                                                                                                               |

Not re-scored: KuyohGuard keeps the run's full M3 marks, though its sensor readings come from third-party gauges and GTFS feeds that the team's Pi only polls, timestamps, and forwards, and its phones only test arrival-time arithmetic. The matrix's "the team's Pi 5 and phones produce real readings" is only partly met, but no check contradicted a fact the score rested on.

## Scoring matrix

This is the event's first edition, so there are no past winners, and the website still says official judging criteria "will be released soon" ([judging status], [lineage]). The run built the matrix from four inputs: NTT DATA presenter Deepanraj Vellingiri's spoken outline at the briefing ([briefing Q&A]); the portal's submission requirements ([submission]); the APU School of Technology's Maybank Hackathon 2025 criteria, "innovation, technical feasibility, business value, real-world applicability, presentation quality, and teamwork" ([Maybank]), and GDSC APU's 2024 Workspace Hackathon criteria, "technical, pitch, and business solution" (secondary source, [Workspace criteria]); and this repo's conventions ([conventions]). Each idea is scored out of 100. The KB space codes in M7 are Academic Administration (AA), Logistics & Operations (LNO), IT Helpdesk (ITSM), Library (LIB), Accommodation (AC), Bursary (BUR), and Visa and Immigration (VISA); PDPA is Malaysia's Personal Data Protection Act 2010.

| ID  | Criterion                                 | Weight | Full marks                                                                                                                                                                                                                             | Loses marks                                                                                                          | Where it comes from                                                                                                          |
| --- | ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| M1  | 1P and 3P connector depth                 | 20%    | Pairs 1P connectors (BigQuery, Drive and Sheets, Calendar, Gmail) with 3P connectors that mirror APU's stack (Jira Cloud, Confluence Cloud, SharePoint, OneDrive, Outlook), plus Globalping                                            | A chat prompt or a Gemini API key alone, with no Gemini Enterprise data stores or actions                            | "mainly we focus on 1P and 3P connectors", MCP an "add-on" ([briefing Q&A]); APU's systems ([APU systems])                   |
| M2  | Unattended day-to-day workflow and review | 15%    | Runs on a Schedule or Event trigger, plans for 14-day credential refresh, trigger delay, and Standard quotas, and pauses for human review before any connector write (F1 to F4, [Round 3](#round-3-platform-and-hardware-stress-test)) | A reactive chatbot (31% of simulated ideas) or a static dashboard (31%); promising instant emergency dispatch        | "How will it work in day-to-day productivity life" ([briefing Q&A]); F1 to F4 ([GE constraints])                             |
| M3  | Remote IoT, network, and cloud            | 15%    | The team's Pi 5 and phones produce real device and network readings off campus, show per-hop latency (device timestamp against Pub/Sub `publishTime`), and show offline buffering and reconnect                                        | Needs sensors in APU buildings, rides on APU shuttles, or LoRaWAN (1 of 96 mapped gateways near Kuala Lumpur online) | The theme ([theme]); what judges can see of a network ([judge network]); [LoRaWAN]                                           |
| M4  | Real public data and loud failure         | 15%    | Live public APIs, published datasets, or the team's own sensors; a failed source shows its error, with no cached copy or default                                                                                                       | Synthetic sensor loops, mocked student records, or a silent fallback to a stale snapshot                             | [conventions]; [decisions]                                                                                                   |
| M5  | Social and APU demand                     | 10%    | Traces to documented friction on X, Reddit (S1 to S13), Lowyat.NET, Google Maps, APSpace store reviews, or repeated student-built GitHub tools                                                                                         | A problem with no evidence of friction at APU or in Malaysian higher education                                       | NTT DATA's research point ([judging status]); [social]; [student tools]                                                      |
| M6  | Crowd and substitute edge                 | 10%    | Avoids the largest simulated clusters and the NTT DATA-labelled demos, and beats student scripts and commercial tools                                                                                                                  | Rebuilds a briefing example (HR policy agent, IT helpdesk agent, scholarship checker) or takes a `*Pulse` name       | [clusters]; [NTT DATA demos]; [briefing examples]; [name collisions]                                                         |
| M7  | Named APU owner and measured baseline     | 10%    | Names an APU unit (KB spaces AA, LNO, ITSM, LIB, AC, BUR, VISA) and measures before and after: precision, recall, latency                                                                                                              | "All students and staff"; unmeasured claims such as "slashing university IT response times from hours to seconds"    | 32% of simulated ideas name an owner, 5% cite a baseline, 1% combine an unattended run, owner, and baseline ([crowd misses]) |
| M8  | 3- and 6-month pilot and PDPA             | 5%     | A dated 3- and 6-month plan that needs no APU staff during the hackathon; no biometric data, and no personal data in free-tier prompts                                                                                                 | Needs private records (fee statements, passports, medical files) or face recognition                                 | NTT DATA's time-to-impact point ([judging status]); [PDPA amendment]; [recommended shape]                                    |

The M6 clusters are campus energy and sustainability (10.5% of simulated ideas), Wi-Fi and network diagnosis (8.7%), facilities or IT fault to ticket (7.6%), campus safety (5.5%), and document and admin form processing (5.5%) ([clusters]).

[submission]: /docs/BRIEF.md#submission-requirements
[conventions]: /docs/references/project-conventions.md
[lineage]: /docs/research/winners.md#this-hackathons-lineage
[Workspace criteria]: https://www.instagram.com/p/C-e8zZfvHcu/
[theme]: /docs/BRIEF.md#at-a-glance
[decisions]: /docs/CONTEXT.md#decisions-so-far
[social]: /docs/research/social.md

## Ideation rounds

The run harvested 25 candidates, cut 16 in round 2 and 4 in round 3, and kept five.

### Round 1: harvest

The 25 candidates came from these social and APU inputs, paired with the repo's check of APU's public endpoints on 4 November 2026 ([feed endpoints]):

- 550 X posts from 23 APU and Bukit Jalil queries ([X queries]), and nine Malaysian posts read through X's syndication endpoint, X01 to X09 ([X01 to X09]).
- 13 Reddit close reads, S1 to S13: seven APU threads from r/malaysiauni and six analogues from r/wheelchairs, r/disability, r/PropertyManagement, and r/labrats ([Reddit close reads]).
- Lowyat.NET threads and Google Maps reviews ([Lowyat method], [review sites method]).
- 141 APSpace store reviews: the 119 newest on Google Play and 22 on the App Store ([APSpace reviews]).
- 14 public repositories APU students built for their own campus life ([student tools]).

[X queries]: /docs/research/social.md#x-queries-and-counts
[X01 to X09]: /docs/research/social.md#x-syndication-endpoint-retrieval
[Lowyat method]: /docs/research/social.md#lowyat-forum-method
[review sites method]: /docs/research/social.md#review-sites-method

### Round 2: remote access, crowd, and privacy cuts

Six candidates need someone at APU or in its residences, so building them would force simulated readings and fail M3 and M4. Six collide with the NTT DATA-labelled demos or the largest simulated clusters. Four fail on rules or data access.

| Candidate                                               | Cut for                               | Evidence                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classroom Wi-Fi RF sniffer for rooms S0801 and E0903    | Needs presence in APU classrooms      | A former student names unstable Wi-Fi in both rooms ([S2]); another reports loss near stairs and the cafeteria ([S1])                                             |
| City of Green washing-machine accelerometer             | Needs presence in an APU residence    | Clothes left in about three washers and dryers for hours ([S7]); analogues outside Malaysia ([D1 and D2])                                                         |
| On-campus lift outage tracker                           | Needs presence in APU buildings       | A comment on APU's orientation reel (27 October 2026, 18 likes): a nine-floor block with "only two lift" ([lift comment]); [S8] and [S9] are non-APU analogues    |
| Residence prepaid smart-meter 4 AM cutoff monitor (LNO) | Needs presence in an APU residence    | A review says on-campus electricity "INSTANTLY stops" at 4 AM when payment is late ([residence reviews]); the LNO KB space covers prepaid smart meters ([APU KB]) |
| Cafeteria occupancy and noise sensor                    | Needs presence on campus              | Wi-Fi loss at the cafeteria when crowded ([S1])                                                                                                                   |
| Phone GPS logger riding a Campus Connect shuttle        | Needs a team member on APU's shuttle  | The example in [recommended shape]                                                                                                                                |
| Admissions document checker                             | NTT DATA demo and briefing example    | The briefing's lead example ([briefing examples]); an admissions assistant in APU-NTTDATA ([NTT DATA demos]); document processing holds 5.5% ([clusters])         |
| IT helpdesk password and MFA reset agent                | NTT DATA demo and briefing build      | The IT Helpdesk agent in APU-Operations-NttData ([NTT DATA demos]); a saturated tier ([saturation tiers])                                                         |
| HR policy assistant                                     | NTT DATA demo and briefing build      | Built live at the briefing ([briefing examples]); HR agents in APU-Operations-NttData and Gemini-For-Hrms ([NTT DATA demos])                                      |
| Five-persona campus portal chatbot                      | NTT DATA demo                         | APU-NTTDATA's five persona assistants ([NTT DATA demos])                                                                                                          |
| Building HVAC and energy optimiser                      | Largest simulated cluster             | Campus energy and sustainability, 10.5% ([clusters])                                                                                                              |
| Moodle at-risk grade predictor                          | Crowded cluster, private grades       | Student performance and at-risk insights, 5.3% ([clusters]); grades are personal data the team can't get ([private records])                                      |
| AttendiX 2.0 OTP attendance auto-signer                 | Breaks academic rules                 | The [fastAttendix] and [APUnoATD] pattern; such tools "sit on the wrong side of academic rules" ([unmet needs])                                                   |
| Face-recognition attendance camera                      | Biometric data, crowded               | The 2024 PDPA amendment makes biometric data sensitive ([PDPA amendment]); `attendance face recognition` matches 287 Devpost projects ([Devpost crowding])        |
| EMGS visa passport OCR pipeline                         | Needs private passport data           | [private records]                                                                                                                                                 |
| Wet-lab freezer alarm monitor                           | No public APU lab telemetry or access | S11 to S13 are non-APU analogues ([lab analogues])                                                                                                                |

[S7]: https://www.reddit.com/r/malaysiauni/comments/1l4ub3h/dont_ever_come_to_apus_offcampus_city_of_green/
[D1 and D2]: /docs/research/social.md#d1-and-d2-laundry-analogues-outside-malaysia
[S8]: https://www.reddit.com/r/wheelchairs/comments/1um77dr/finally_had_enough/
[S9]: https://www.reddit.com/r/disability/comments/x51zfe/locked_elevators_in_university_residence_halls_us/
[residence reviews]: /docs/research/social.md#residence-upkeep-and-theft
[private records]: /docs/CONTEXT.md#apus-own-documents-and-systems
[fastAttendix]: https://github.com/jyyyyylim/fastAttendix
[APUnoATD]: https://github.com/caffrey9307/APUnoATD
[unmet needs]: /docs/research/competition.md#unmet-needs-these-tools-point-to
[lab analogues]: /docs/research/social.md#laboratory-alarm-analogues

### Round 3: platform and hardware stress test

The nine remaining candidates were checked against five platform constraints ([GE constraints]):

| ID  | Constraint                                                                                                                                                                                | Source                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| F1  | Adding or updating data through connectors requires human review                                                                                                                          | [workflows]                                |
| F2  | Schedules run on the author's credentials, which expire every 14 days; event triggers lag 5 to 10 minutes, and scheduled runs up to 5 minutes                                             | [Workflow Builder limits], [event trigger] |
| F3  | Standard gives 160 assistant queries per licence per day, pooled, and one agent creation a day; separately, sub-agents go only one level deep                                             | [quotas], [Workflow Builder limits]        |
| F4  | Account type, action availability, and federated versus indexed access are separate checks; Drive, Gmail, and Calendar need organisation accounts, and indexed copies lag 3 hours or more | [GE constraints], [live data]              |
| F5  | Public GTFS Realtime positions cover feeder route T580, not APU's own shuttle fleet                                                                                                       | [GTFS Realtime], [GE constraints]          |

Four candidates scored below 80 because they lacked write-back across several connectors or daily operational urgency:

- A standalone Bukit Jalil air-quality dashboard on DOE APIMS, whose nearest station is 5.9 km away ([APIMS]).
- A static scholarship eligibility calculator over the August 2026 scholarship grid PDF ([scholarship grid]).
- A GitHub trend watcher, one of the briefing's examples ([briefing examples]).
- A Parkhill food-stall map from OpenStreetMap through Overpass QL ([Overpass]).

The five finalists passed every check in the run. BiblioForge's checked score later fell to 77.5, below that line; the cut used the run's own scores, so it stays in the set as the lowest-ranked product.

[live data]: /docs/CONTEXT.md#connectors-and-live-data
[APIMS]: /docs/research/data-sources.md#doe-apims-air-pollutant-index
[scholarship grid]: https://publicwebsite-media.apu.edu.my/assets/2026-08/Scholarships&MeritAwards_Aug2026.pdf
[Overpass]: /docs/research/data-sources.md#openstreetmap-via-overpass

## Shared edge and network design

All five products use the same two device roles on the team's own network.

- **Pi 5 as poller and diff engine:** it polls public feeds and sends only changes. The S3 timetable answers a conditional request with `304` while its ETag, the MD5 of the gzip bytes, hasn't moved; `api.apiit.edu.my` sends no ETag, so the Pi hashes each body itself ([feed endpoints], [feed changes]). It also polls `api.data.gov.my` (4 requests a minute per API), Public Infobanjir (HTML pages that load their rows as JSON), the KB's Confluence REST API, and Koha's public REST API ([data.gov.my limits], [Infobanjir], [APU KB], [APU systems]).
- **Path to the cloud:** each reading carries the Pi's `deviceTimestamp` and goes over HTTPS to Cloud Run in `asia-southeast1` (Singapore), then to Pub/Sub, whose server-set `publishTime` gives the device-to-cloud latency ([Cloud Run locations], [Pub/Sub to Gemini]). Rows land in BigQuery for history, which the Gemini Enterprise assistant can read through the BigQuery connector's federated mode (preview). Workflows don't support BigQuery, so the Pi also writes each decision-ready row to a Google Sheet that the workflow reads ([workflows], [live-data paths]).
- **MQTT option:** MQTT 5.0 over TLS adds QoS 1, retained state, and a Will Message when the Pi drops off ([protocols]). Google has no managed MQTT broker and Pub/Sub takes only REST or gRPC, so this path needs a partner broker such as EMQX Serverless, or a self-hosted one ([MQTT brokers], [Google IoT patterns]).
- **Pi 5 as network probe:** it runs the official `globalping/globalping-probe` Docker container, which supports x86 and ARM and runs with host networking ([globalping-probe]). Gemini Enterprise's Globalping connector (preview, read-only actions) searches past Globalping measurements; running new tests needs the Globalping MCP server through custom MCP, which is in preview and blocked by default ([Globalping connector], [custom MCP]).
- **Two uplinks:** home broadband and a phone hotspot. Pulling the primary link during a review shows failover, and buffered readings arrive after reconnect with their original device timestamps ([judge network]).
- **Phones:** browser sensors over HTTPS, namely Geolocation, DeviceOrientation and DeviceMotion, and camera and microphone through `getUserMedia`, which work on Android and iPhone ([browser sensors]), plus cellular checks from outside the home network.

[data.gov.my limits]: /docs/research/data-sources.md#shared-notes-on-the-datagovmy-api
[live-data paths]: /docs/research/gemini-enterprise.md#comparison-of-live-data-paths
[protocols]: /docs/research/iot-and-network.md#protocols
[browser sensors]: /docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser

## How the set differs from the crowd

| Differentiator          | Typical simulated entry                                                                                                                                                         | This set                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data                    | "Simulate", "mock", "synthetic", or "dummy" appears in 30% of Gemini, 78% of ChatGPT, and 98% of Claude responses; 3% of ideas use public feeds ([crowd misses])                | Live public APU feeds (timetable, `transix-v2`, `quix-customers`, KB, Koha OPAC), Malaysian sensor feeds (Infobanjir, GTFS Realtime), and the team's Pi and phones |
| Interaction             | 31% chat assistants and 31% dashboards; 19% make an unattended workflow the main form ([crowd misses])                                                                          | Schedule and Event workflows that detect changes, check rules, and stage reviewed writes across systems                                                            |
| Enterprise connectors   | None of Jira, ServiceNow, SharePoint, OneDrive, Gmail, Outlook, or MCP in more than 2% of any family's responses; 2 of 780 ideas name one ([model differences], [crowd misses]) | 1P connectors (Drive and Sheets, Calendar, Gmail, with BigQuery for history) plus 3P connectors that match APU's Microsoft 365 and Atlassian stack ([APU systems]) |
| NTT DATA-labelled demos | Persona chatbots and department, IT helpdesk, HR, and admissions agents; one demo already files Jira issues ([NTT DATA demos])                                                  | No persona or department Q&A agent; the products reconcile operations and check physical and network state                                                         |
| Names                   | 116 of 780 titles contain "Pulse"; "CampusPulse" names 54 ([name collisions])                                                                                                   | ChronoDiff, KuyohGuard, CanonKeeper, GateWatch, BiblioForge                                                                                                        |

## Recommendation

Build ChronoDiff as the submission. If the team also wants an environmental and transit sensor pipeline, add KuyohGuard to the same entry; the team still registers one track ([tracks]). Both share one backbone: the Pi 5 writes decision rows to Google Sheets and history through Cloud Run (`asia-southeast1`) and Pub/Sub to BigQuery; a Gemini Enterprise workflow reads the Sheet, waits for approval, and writes to Jira Cloud, SharePoint, Outlook, and Google Calendar ([workflows], [BigQuery connector]).

The KB that CanonKeeper audits, and whose spaces name the owners of the other products, showed 1,189 pages without login in 21 of its 28 spaces on 3 November; the nine spaces listed in the APU research held 1,161 of them, 725 in ITSM alone ([APU KB]). A CQL recount on 5 November returned 1,017, 621 in ITSM ([CanonKeeper](03-canonkeeper.md#verification-notes)).

[BigQuery connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery

## Verification notes

Checked on 5 November 2026 against the repo's research docs and the briefing transcript; the Google Cloud pages for workflows, Workflow Builder quotas and limits, event triggers, quotas, the Globalping connector, and Cloud Run pricing; the GitHub API for the three NTT DATA-labelled repositories and their READMEs; the Globalping probe README and its Docker Hub tags; and APU's Maybank Hackathon 2025 news page. Product-level checks are in each product file; the scores they lowered are under [Score changes](#score-changes).

Confirmed:

- **Simulation:** 156 responses and 780 ideas, sent on 3 November 2026 ([models and samples]); 31% chat, 31% dashboards, 19% unattended workflows; 32% name an owner, 5% a baseline, 1% all three; 116 "Pulse" titles and 54 "CampusPulse" ([crowd misses], [name collisions]).
- **NTT DATA-labelled repositories:** APU-NTTDATA created 19 October, APU-Operations-NttData 29 October, Gemini-For-Hrms 1 November 2026, under a personal account created 22 June 2026 ([NTT DATA demos]).
- **Rubric:** Deepanraj Vellingiri gave the outline from 1:55:14 to 1:56:15, including "How will it work in day-to-day productivity life" at 1:56:06 ([briefing Q&A]); the Maybank criteria match the APU news page word for word ([Maybank]). No official criteria had been posted by 3 November ([judging status]).
- **Platform:** connector writes need human review ([workflows]); credentials expire every 14 days, sub-agent depth is 1 ([Workflow Builder limits]); event triggers lag 5 to 10 minutes ([event trigger]); 160 assistant queries per Standard licence a day, pooled ([quotas]).
- **APU feeds and KB:** 1,138,362 bytes transferred and 17,153,209 decoded; 2,021 intake codes on 4 November (2,020 on 5 November); 253 trips; 15 stops; 29 and 32 holidays; 9 departments ([feed endpoints]); 1,189 pages in 21 spaces and 1,161 in the nine listed, on 3 November ([APU KB]); the feed URL in 26 repositories ([feed users]).
- **Inputs and eliminations:** 550 X posts from 23 queries, X01 to X09, S1 to S13, 141 store reviews, 14 repositories; S0801 and E0903 in [S2]; 1 of 96 gateways online on 3 November 2026 ([LoRaWAN]); 287 Devpost matches ([Devpost crowding]); Act A1727 adds biometric data to sensitive personal data ([Act A1727]).
- **Hardware:** the probe's Docker Hub `latest` tag has `amd64`, `arm64`, and `arm/v7` images, and its README names the Raspberry Pi ([globalping-probe]).

Corrections:

- **Crowd size:** run said more than 1,000 participants; no source gives a number, and the presenter said only "there are a lot of participants" ([competition method]). Dropped.
- **41.7%:** run said 41.7% of competing teams will build sensor dashboards and fault-to-ticket workflows; source says 41.7% of 780 simulated ideas are campus operations on sensor or telemetry feeds (energy, network diagnosis, fault-to-ticket, digital twins, space finders, room booking, queues), from AI brainstorming, not teams ([clusters]).
- **Faking data:** run said 30% to 98% of responses advise simulating ESP32 readings or using sample student records; source says the words "simulate", "mock", "synthetic", or "dummy" appear in 30% of Gemini, 78% of ChatGPT, and 98% of Claude responses ([crowd misses]).
- **Connectors:** run said fewer than 2% of responses mention Jira, SharePoint, OneDrive, Outlook, or MCP; source says none of Jira, ServiceNow, SharePoint, OneDrive, Gmail, Outlook, or MCP appears in more than 2% of any family's responses, and 2 of 780 ideas name Jira, ServiceNow, SharePoint, OneDrive, Salesforce, SAP, or MCP ([model differences], [crowd misses]).
- **Cluster names:** run said "Wi-Fi-to-ticket 8.7%" and "Admissions 5.5%"; source says Wi-Fi and network diagnosis or capacity 8.7%, and document and admin form processing 5.5%, while only 7 of 780 ideas mention admissions ([clusters]).
- **NTT DATA demos:** run said the judging organisation built static sample-data demos; source says the account's READMEs say "delivered by NTT DATA" but its ownership is unverified ([NTT DATA demos]). APU-NTTDATA and APU-Operations-NttData say they run on sample data; Gemini-For-Hrms's README instead claims real lookups and write-backs to SAP SuccessFactors, Jira, and Microsoft 365, including Jira issues with live status ([Gemini-For-Hrms]). Run also tied the HR policy assistant to Gemini-For-Hrms; the HR Policy agent is in APU-Operations-NttData, and one was built live at the briefing.
- **ChronoDiff's open ground:** run said timetable churn and classroom double-booking appear in 0 of 780 simulated ideas; source says none of 780 is a student-facing timetable sync or change alert, but room booking and timetable optimisation holds 2.7%, and 6 ideas mention rescheduling or room changes, mostly from the administrator's side ([saturation tiers], [clusters]). No APU source documents classroom double-booking; the X timetable clash posts aren't APU-specific ([timetable posts]). Two feed fetches 24 minutes apart found no change, so the feed's change rate is unmeasured ([feed changes]).
- **Timetable window:** run called the feed "weekly"; it holds a rolling four-week window, 26 October to 22 November 2026 ([feed rows]).
- **F2 latency:** run said 5 to 10 minutes for events and schedules; event triggers lag 5 to 10 minutes and scheduled runs up to 5 minutes ([event trigger], [Workflow Builder limits]).
- **F3:** run put sub-agent depth under the query quota; it is a separate per-agent limit, and the 160 queries are per licence a day, pooled ([Workflow Builder limits], [quotas]).
- **M1:** run listed Globalping among connectors that mirror APU's stack; APU doesn't run it, and its connector is a read-only preview ([APU systems], [Globalping connector]).
- **Reddit close reads:** run said S1 to S13 come from r/malaysiauni, r/FacilityManagement, and r/homeassistant; source says seven APU threads from r/malaysiauni and six analogues from r/wheelchairs, r/disability, r/PropertyManagement, and r/labrats ([Reddit close reads]).
- **Cafeteria sensor:** run cited S2; the cafeteria report is in [S1].
- **Lift tracker:** run cited S8, S9, and an "18-like review"; S8 and S9 are non-APU analogues, and the 18-like item is an Instagram comment on APU's orientation reel ([lift comment]).
- **MQTT path:** run sent MQTT 5.0 over TLS to Cloud Run and Pub/Sub; Google has no managed MQTT broker, Pub/Sub takes only REST or gRPC, and Cloud Run serves HTTPS and WebSockets, so MQTT needs a separate broker ([MQTT brokers], [Google IoT patterns], [Pub/Sub to Gemini]). `publishTime` exists only on the Pub/Sub path, not for rows written straight to Sheets.
- **BigQuery in workflows:** run queried BigQuery from workflow steps in four products; the workflows page lists the connectors workflows support, and BigQuery isn't one ([workflows]). Each Pi now writes decision-ready rows to a Sheet, and BigQuery keeps history for the assistant.
- **Region:** run put Cloud Run in `asia-southeast4` (Kuala Lumpur); Cloud Run pricing lists that region ([Cloud Run pricing]), but the Cloud Run and BigQuery locations pages list only `asia-southeast1` to `asia-southeast3` ([Cloud Run locations]), so the set uses `asia-southeast1` (Singapore).
- **Review step:** run paused each workflow at a Request info step; that step asks the user questions, while an Approval step presents outputs for sign-off before later steps run, so every product uses Approval ([HITL steps]).
- **Probe source:** run cited the Globalping API repository; the probe container lives in [globalping-probe]. Uplink failover is the Pi's own network setup, not a probe feature.
- **Recommendation:** run said all five products rest on Bukit Jalil's hydrometeorological stations and the KB; only KuyohGuard uses the river and rainfall gauges ([Infobanjir]).
- **Wording:** dropped "100%", "zero overlap", "zero collision", "strict", and "empirical"; Jira write-back alone doesn't set the set apart, since Gemini-For-Hrms claims it too.

The ChronoDiff open-ground and double-booking corrections lower its M5 and M6 under [Score changes](#score-changes).

Not verified:

- The 25-candidate harvest and every score are the run's judgment; no source scores them.
- The named owners come from the run, matched to KB space names; no public page confirms that AA publishes the timetable or that LNO runs the shuttles.
- Whether Globalping measurements can be pinned to the team's own probe, and Globalping's free limits.
- How a Gemini Enterprise app, whose schedules need a multi-region location (`global`, `us`, or `eu`), reads BigQuery data written from `asia-southeast1` through the federated mode, which is in preview ([triggers and schedules]).
- The X posts, Reddit threads, and store reviews weren't reopened; their counts come from the research docs.

[models and samples]: /docs/research/competition.md#models-and-samples
[Act A1727]: https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf
[competition method]: /docs/research/competition.md#sources-searched
[Gemini-For-Hrms]: https://github.com/Ntt-Data-Malaysia-AI-Platform/Gemini-For-Hrms
[timetable posts]: /docs/research/social.md#registration-portals-and-timetables
[feed rows]: /docs/research/apu.md#timetable-row-counts
[triggers and schedules]: /docs/research/gemini-enterprise.md#triggers-and-schedules

## See also

- Product files: [ChronoDiff](01-chronodiff.md), [KuyohGuard](02-kuyohguard.md), [CanonKeeper](03-canonkeeper.md), [GateWatch](04-gatewatch.md), [BiblioForge](05-biblioforge.md).
- [Competition](/docs/research/competition.md): the simulated crowd, the NTT DATA-labelled demos, and APU student-built tools.
- [APU](/docs/research/apu.md): the KB, the APSpace feeds, and APU's systems.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): workflows, quotas, connectors, and the F1 to F5 constraints.
- [IoT and network](/docs/research/iot-and-network.md) and [Google Cloud](/docs/research/google-cloud.md): protocols, brokers, Pub/Sub, and Cloud Run.
- [Social](/docs/research/social.md) and [data sources](/docs/research/data-sources.md): demand evidence and public feeds.
- [Judging](/docs/research/judging.md), [winners](/docs/research/winners.md), [brief](/docs/BRIEF.md), and [context](/docs/CONTEXT.md): the rubric inputs.

[tracks]: /docs/BRIEF.md#challenge-tracks
[judging status]: /docs/BRIEF.md#judging-and-prizes
[recommended shape]: /docs/CONTEXT.md#recommended-shape
[briefing Q&A]: /docs/sources/briefing-session/transcript.md#questions-and-answers
[Devpost crowding]: /docs/research/winners.md#evidence-of-crowding
[Maybank]: https://www.apu.edu.my/index.php/news/apu-students-excel-maybank-hackathon-2025
[PDPA amendment]: /docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment
[clusters]: /docs/research/competition.md#clusters-and-shares
[crowd misses]: /docs/research/competition.md#what-the-crowd-structurally-misses
[name collisions]: /docs/research/competition.md#name-collisions
[NTT DATA demos]: /docs/research/competition.md#demos-already-built-under-the-ntt-data-name
[saturation tiers]: /docs/research/competition.md#saturation-tiers
[briefing examples]: /docs/research/competition.md#ideas-shown-at-the-briefing
[student tools]: /docs/research/competition.md#repositories-and-adoption
[APSpace reviews]: /docs/research/competition.md#the-official-apspace-app
[feed endpoints]: /docs/research/apu.md#timetable-feed-endpoints
[feed users]: /docs/research/apu.md#who-already-uses-the-timetable-feed
[feed changes]: /docs/research/apu.md#timetable-feed-change-behaviour
[APU KB]: /docs/research/apu.md#apu-knowledge-base-on-confluence
[APU systems]: /docs/research/apu.md#systems-apu-runs
[GE constraints]: /docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[Workflow Builder limits]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/quotas-and-limits
[event trigger]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/configure-event-trigger
[quotas]: https://docs.cloud.google.com/gemini/enterprise/docs/quotas-and-pay-as-you-go-usage
[Globalping connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/globalping
[globalping-probe]: https://github.com/jsdelivr/globalping-probe
[Cloud Run pricing]: https://cloud.google.com/run/pricing
[Cloud Run locations]: https://docs.cloud.google.com/run/docs/locations
[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
[custom MCP]: /docs/research/gemini-enterprise.md#requirements-and-registration
[MQTT brokers]: /docs/research/iot-and-network.md#managed-mqtt-brokers
[GTFS Realtime]: https://developer.data.gov.my/realtime-api/gtfs-realtime
[Infobanjir]: https://publicinfobanjir.water.gov.my/waterleveldata/Wilayah%20Persekutuan%20Kuala%20Lumpur
[S1]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/apu_wifi/
[S2]: https://www.reddit.com/r/malaysiauni/comments/1l19a16/comment/mvov59z/
[lift comment]: https://www.instagram.com/reel/De9BNkJAYk1/
[judge network]: /docs/research/iot-and-network.md#what-a-judge-can-see-of-the-network
[LoRaWAN]: /docs/research/iot-and-network.md#lorawan-and-the-things-network-in-kuala-lumpur
[Reddit close reads]: /docs/research/social.md#reddit-close-reads-of-operations-threads
[Pub/Sub to Gemini]: /docs/research/iot-and-network.md#from-pubsub-to-storage-and-gemini
[Google IoT patterns]: /docs/research/iot-and-network.md#architecture-center-reference-architectures
[model differences]: /docs/research/competition.md#model-differences
