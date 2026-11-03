# Competition

Who and what an entry in the APU Cloud Innovation Hackathon 2026 competes with: the likely crowd of other teams, and existing products that already do the job, so a team can see where the crowd will sit and where it won't. The crowd part combines the hackathon's own signals, public GitHub repositories, a simulation of the AI brainstorming many teams will do, Devpost and GitHub crowding counts, and evidence of what APU students already build and use for themselves. The substitutes part is primary-source checks of products that already do the jobs proposed by the [Astra shortlist](/docs/ideas/astra/00-ranking.md). It merges the earlier crowd-baseline research with the substitute checks from the Astra feasibility research; both were researched on 3 November 2026.

Contents:

1.  [Signals from this hackathon](#signals-from-this-hackathon)
    1.  [Ideas shown at the briefing](#ideas-shown-at-the-briefing)
    1.  [Public repositories so far](#public-repositories-so-far)
    1.  [Demos already built under the NTT DATA name](#demos-already-built-under-the-ntt-data-name)
    1.  [What other students built in the same weeks](#what-other-students-built-in-the-same-weeks)
1.  [Crowd map](#crowd-map)
    1.  [Clusters and shares](#clusters-and-shares)
    1.  [Model differences](#model-differences)
    1.  [Name collisions](#name-collisions)
1.  [Crowding counts](#crowding-counts)
1.  [Saturation tiers](#saturation-tiers)
1.  [What the crowd structurally misses](#what-the-crowd-structurally-misses)
1.  [APU student-built tools](#apu-student-built-tools)
    1.  [Repositories and adoption](#repositories-and-adoption)
    1.  [The official APSpace app](#the-official-apspace-app)
    1.  [Unmet needs these tools point to](#unmet-needs-these-tools-point-to)
1.  [Existing substitutes](#existing-substitutes)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [Method](#method)
    1.  [Sources searched](#sources-searched)
    1.  [Simulation prompts](#simulation-prompts)
    1.  [Models and samples](#models-and-samples)
    1.  [Extraction and clustering](#extraction-and-clustering)
    1.  [Errors and limits](#errors-and-limits)
    1.  [Substitute checks](#substitute-checks)
1.  [See also](#see-also)

## Signals from this hackathon

### Ideas shown at the briefing

Everyone at the briefing heard the same worked examples, and the organisers said they would share the recording, so expect many teams to start from them ([briefing]):

- **Admissions document checker:** a workflow that runs at 9 AM daily, reads applicants' files from Google Drive or SharePoint, finds missing or wrong documents such as expiring passports, and emails the applicant. It was demonstrated at 0:46:43 and repeated as the main Smart Campus and Automation example at 1:39:28 and 1:41:42.
- **HR policy agent:** a chat agent over SharePoint, OneDrive and Drive files that summarises policies and the medical plan, shown live as "this agent I built for the HR department" (0:44:34).
- **Student study agent:** "four or five agents" that plan and track learning, for example finishing linear regression in five days (1:38:48), plus coordinating online training courses (1:37:58).
- **Research paper comparison:** Deep Search over 20 to 25 IEEE papers to draft a scope of work for PhD students (0:52:06).
- **Scholarship and fees agent:** a dashboard or single prompt that checks scholarship eligibility from the student's CGPA (1:44:23 to 1:45:17).
- **Data and trend watchers:** cleaning IoT telemetry or Kaggle data, and a GitHub MCP agent that notifies you of trending repositories (1:42:37 to 1:44:23).
- **Priority email triage:** a morning prompt that lists high-priority mail and drafts replies (0:44:52).
- **Student portal mock-up:** the Antigravity demo built "a basic HTML site for the APU education sector" with course progress, announcements and a service directory (1:28:30 to 1:33:12).

**Inference:** these examples, the Discord example ideas, and the HR/IT, admissions and student-portal demos below form one shared starting set. Teams that build any of them will look alike to reviewers who wrote them.

### Public repositories so far

As of 3 November 2026, GitHub holds almost no public trace of other entries:

- Two repositories carry the hackathon's name: [meowkemp/APU-Cloud-Innovation-Hackathon] and [bryanfrds/GDG-APU-Cloud-Innovation-Hackathon-]. Both were created on 3 November 2026 and hold only a README (0 KB); the second says "Our entry for the APU Cloud Innovation Hackathon 2026 (GDG on Campus APU)." A third match is this team's own repository and is excluded.
- [nacyng-netizen/apu-smart-shuttle] (created 1 November 2026) is a README for a Flutter, Firebase and Google Maps shuttle tracker with "real-time GPS tracking", ETAs, traffic and rain alerts, "under development for the APU Cloud Innovation Hackathon". It names no Gemini Enterprise part.
- Code search found the hackathon name only in an [awesome-developer-conferences] list. "NexConnect" matched only unrelated companies.
- Acronym noise: "APU" repositories created in the same weeks include an Azim Premji University campus app (food menu, shuttle, holidays) and Ritsumeikan APU bus trackers; neither is this hackathon.

**Inference:** most teams had not published anything by the briefing night, so GitHub can't show the field yet. Re-run the searches after the 10 November deadline if the repository links become public.

[meowkemp/APU-Cloud-Innovation-Hackathon]: https://github.com/meowkemp/APU-Cloud-Innovation-Hackathon
[bryanfrds/GDG-APU-Cloud-Innovation-Hackathon-]: https://github.com/bryanfrds/GDG-APU-Cloud-Innovation-Hackathon-
[nacyng-netizen/apu-smart-shuttle]: https://github.com/nacyng-netizen/apu-smart-shuttle
[awesome-developer-conferences]: https://github.com/Infrasity-Labs/awesome-developer-conferences/blob/main/countries/malaysia.md

### Demos already built under the NTT DATA name

A GitHub account named `Ntt-Data-Malaysia-AI-Platform` (a personal account created in June 2026 whose bio describes an Azure, AWS and GCP cloud solution architect) holds APU demos whose READMEs say "delivered by NTT DATA". Its ownership was not verified beyond that.

- **[APU GenAI Assistant][apu-nttdata]** (created 19 October 2026): five persona assistants on Cloud Run, for prospective students (admissions, scholarships, visas), current students (fees, timetable, results, attendance), lecturers (quizzes, rubrics, feedback), admin staff (HR, finance, IT policies, tickets) and researchers (funding calls, grants, ethics), each with a dashboard and four "one-click AI tools" such as a study planner. Its README says all records are sample data.
- **[APU Operations AI][apu-ops]** (created 29 October 2026): "Gemini agents for every APU department": an IT Helpdesk agent (troubleshooting, password and MFA reset, software access tickets, Wi-Fi and VPN setup), an HR Policy agent, a Student Recruitment agent, a Finance and Procurement agent and an Institutional Knowledge agent, as a static demo on sample data.
- **[NTT DATA HRMS][hrms]** (created 1 November 2026): 18 Gemini agents over SAP SuccessFactors, including IT and Facilities requests "raised in Jira with live status".

**Inference:** if these belong to the briefing team, the reviewers have already built the persona chatbot, the department Q&A agent, the IT helpdesk agent, the HR policy agent and the admissions assistant themselves, on sample data. An entry in those shapes restates their demo; what their demos lack is real data and an unattended run.

[apu-nttdata]: https://github.com/Ntt-Data-Malaysia-AI-Platform/APU-NTTDATA
[apu-ops]: https://github.com/Ntt-Data-Malaysia-AI-Platform/APU-Operations-NttData
[hrms]: https://github.com/Ntt-Data-Malaysia-AI-Platform/Gemini-For-Hrms

### What other students built in the same weeks

GitHub shows what students elsewhere build when they pair "campus" with Gemini, which is a fair proxy for first instincts:

- 50 repositories created from 20 October to 3 November 2026 match `campus gemini`. Of the first 40 returned, about 15 are campus question-answering chatbots or document RAG assistants, 4 are complaint or maintenance ticket systems, 3 are placement or interview coaches, 2 are lost-and-found portals, 2 are second-hand marketplaces and 2 are 3D campus scenes; the rest are single examples such as an emergency triage agent, an event-attendance QR app, a carbon coach and an intent-based campus network manager ([campus gemini search]).
- 804 repositories created in the same two weeks have "smart campus" in their name or description, mostly coursework: complaint and maintenance management, room booking, attendance, navigation and parking ([smart campus search]).

[campus gemini search]: https://github.com/search?q=campus+gemini+created%3A%3E%3D2026-10-20&type=repositories
[smart campus search]: https://github.com/search?q=%22smart+campus%22+in%3Aname%2Cdescription+created%3A%3E%3D2026-10-20&type=repositories

## Crowd map

**This is a simulation of other teams' AI brainstorming, not a list of ideas for this team.** Read it as an avoid-list. How it was run is under [Method](#method).

### Clusters and shares

Shares are the share of each family's ideas in the cluster; "Overall" is their mean. "Main track" is the track the ideas named or implied most often, and "Typical stack" lists the parts they named most. One idea (0.1%) fit no cluster.

| Cluster                                      | Overall | Gemini | ChatGPT | Claude | Main track         | Typical stack                                                                       |
| -------------------------------------------- | ------- | ------ | ------- | ------ | ------------------ | ----------------------------------------------------------------------------------- |
| Campus energy and sustainability             | 10.5%   | 11.1%  | 11.2%   | 9.2%   | Data, Smart Campus | Temperature and occupancy sensors, smart meters or plugs, MQTT or Pub/Sub, BigQuery |
| Wi-Fi and network diagnosis or capacity      | 8.7%    | 6.1%   | 4.0%    | 16.0%  | Automation         | Access-point, gateway and router telemetry, auto-filed IT ticket                    |
| Facilities or IT fault to maintenance ticket | 7.6%    | 7.5%   | 6.0%    | 9.2%   | Automation         | Temperature, vibration and acoustic sensors on equipment, LoRaWAN, ticket routing   |
| Campus safety and emergency response         | 5.5%    | 8.6%   | 4.0%    | 4.0%   | Smart Campus       | Smoke, gas or seismic sensors, ESP32, Firebase, LoRa                                |
| Document and admin form processing           | 5.5%    | 6.1%   | 6.0%    | 4.4%   | Automation         | Uploaded PDFs, cloud storage, student portal; no device data                        |
| Student performance and at-risk insights     | 5.3%    | 6.4%   | 4.4%    | 5.2%   | Data, Automation   | LMS (Moodle, Blackboard), attendance, grades, BigQuery                              |
| Live campus dashboard or digital twin        | 4.9%    | 4.3%   | 6.8%    | 3.6%   | Smart Campus, Data | Occupancy and temperature sensors, ESP32, MQTT, Firebase                            |
| Study-space and room finder                  | 4.8%    | 2.5%   | 4.0%    | 8.0%   | Smart Campus       | Occupancy, noise and CO2 sensors, Wi-Fi counts, ESP32, Pub/Sub, BigQuery            |
| Campus navigation and accessible routing     | 4.5%    | 4.6%   | 5.2%    | 3.6%   | Smart Campus       | BLE beacons, QR codes, Wi-Fi positioning, Firebase, AR                              |
| Smart farming                                | 4.2%    | 4.3%   | 2.4%    | 6.0%   | Data               | Soil-moisture sensors, LoRaWAN, weather forecasts                                   |
| City traffic and smart-city dashboards       | 3.8%    | 2.5%   | 8.0%    | 0.8%   | Data               | Traffic sensors and cameras, traffic lights, 5G                                     |
| Cold chain, logistics and industry           | 3.5%    | 5.7%   | 0.4%    | 4.4%   | Automation         | Temperature, humidity and GPS trackers, private 5G                                  |
| Research trend and literature analytics      | 3.4%    | 3.9%   | 2.4%    | 4.0%   | Data               | arXiv, Semantic Scholar, Cloud SQL                                                  |
| New-student onboarding                       | 3.4%    | 2.5%   | 2.4%    | 5.2%   | Smart Campus       | BLE beacons, QR or NFC checkpoints, handbooks                                       |
| General campus assistant or chatbot          | 3.3%    | 3.6%   | 5.6%    | 0.8%   | Smart Campus       | Campus documents, announcements, LMS                                                |
| Flood prediction and warning                 | 3.2%    | 0.4%   | 5.6%    | 3.6%   | Data               | Rainfall and water-level sensors, LoRaWAN, cellular                                 |
| Learning companion or study planner          | 2.7%    | 2.9%   | 4.0%    | 1.2%   | Smart Campus       | Course materials, timetable, RAG                                                    |
| Room booking and timetable optimisation      | 2.7%    | 3.2%   | 1.2%    | 3.6%   | Automation         | Bookings, occupancy and door sensors, Google Chat or Slack                          |
| Queue and crowd prediction                   | 2.5%    | 0.7%   | 6.0%    | 0.8%   | Smart Campus       | People counters or Wi-Fi density, often simulated                                   |
| Remote patient monitoring and hospitals      | 2.4%    | 2.1%   | 5.2%    | 0.0%   | Data               | Wearables, EHR                                                                      |
| Air quality and public health                | 2.2%    | 1.8%   | 2.8%    | 2.0%   | Data               | Air-quality sensors, LoRa                                                           |
| IoT and network security                     | 1.5%    | 2.1%   | 1.2%    | 1.2%   | Automation         | Network traffic and device behaviour                                                |
| HR or IT support for staff                   | 1.4%    | 2.1%   | 0.0%    | 2.0%   | Automation         | Policy documents, Active Directory, Google Workspace                                |
| Campus resource forecasting                  | 1.4%    | 2.5%   | 0.8%    | 0.8%   | Data               | Usage logs                                                                          |
| Shuttle, bus or parking                      | 0.5%    | 1.1%   | 0.0%    | 0.4%   | Smart Campus       | GPS, Pub/Sub, BigQuery                                                              |
| Student wellbeing                            | 0.5%    | 1.4%   | 0.0%    | 0.0%   | Smart Campus       | Wearables or Wi-Fi signals                                                          |

- **Campus operations on sensor or telemetry feeds is the centre:** energy, network diagnosis, fault-to-ticket, digital twins, space finders, room booking and queues together hold 41.7% of simulated ideas.
- **The "telemetry to ticket" agent is the second-largest crowd:** network diagnosis plus facilities fault-to-ticket hold 16.3% overall and 25.2% of Claude's ideas.
- **Each track prompt pulls toward its examples:** Smart Campus (P2) gives navigation 15%, onboarding 15%, space finders 13% and campus assistants 12%. Automation (P3) gives document processing 23%, student performance 21% and fault-to-ticket 19%. Data (P4) gives energy 16%, farming 13%, research analytics 12% and city traffic 11%. The full brief (P5) gives energy 15%, network diagnosis 13%, fault-to-ticket 10% and space finders 10%.
- **The minimal prompt drifts off campus:** for P1, 82% of Gemini, 70% of ChatGPT and 42% of Claude ideas are about cities, farms, hospitals or logistics. For P4, the same holds for 40% to 70%.
- **The briefing's own examples barely appear:** no simulated idea mentions scholarships or a GitHub trend watcher, and 7 of 780 mention admissions. **Inference:** teams that attended the briefing will add those examples on top of this map, so the crowd around them comes from the briefing rather than from AI suggestions.

### Model differences

- **Claude Sonnet 5.5 leans to operations agents:** network diagnosis is 16% of its ideas and space finders 8%. Its ideas are chat agents first (48% main form), name a staff owner most often (42%), and its responses mention "connector" (32%), BigQuery (34%) and ESP32 or Raspberry Pi (60%).
- **ChatGPT (`chat-latest`) leans to dashboards and off-campus ideas:** dashboards are the main form for 46%; city traffic (8%), queues (6%), flood (5.6%) and patient monitoring (5.2%) are its strong clusters, and 30% of its responses mention Malaysia or Kuala Lumpur.
- **Gemini (mostly 3.5 Flash-Lite) leans to workflows:** a background workflow is the main form for 28% of its ideas; safety (8.6%) and logistics (5.7%) are its strong clusters. Scheduling words appear in 71% of its responses and Moodle or "LMS" in 30%; it is the only family to name APSpace (3 responses). The six Gemini 3.6 Flash responses, mostly from P1, were mainly logistics (23%) and safety (20%).
- **All three share a blind spot:** none of Jira, ServiceNow, SharePoint, OneDrive, Gmail, Outlook or MCP appears in more than 2% of any family's responses, and none mentions Antigravity or NotebookLM.

### Name collisions

- 780 ideas carry only 388 distinct names. "CampusPulse" names 54 ideas (7%), from all three families, and appears in 54 of the 156 responses (35%); 116 titles (15%) contain "Pulse".
- Other repeated names: EcoGrid (12), CampusFix (11), APU Pulse (11), EcoPulse (10), EcoCampus (10) and SmartFlow (10).
- **Inference:** expect several entries called CampusPulse or another "Pulse". An AI-suggested name tells reviewers the idea came from the same place as everyone else's.

## Crowding counts

Counts for the 10 largest simulated clusters, taken on 3 November 2026. Devpost counts are projects matching every word of the query. GitHub counts are repositories matching every word in the default search fields: all time / created in 2026 / created since 1 October 2026.

| Cluster             | Devpost matches                                                                                  | GitHub repositories                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Campus energy       | `campus energy dashboard` 105; `hvac occupancy` 58; `energy monitoring` 1,830                    | `campus energy` 1,088 / 721 / 202                                                               |
| Network diagnosis   | `campus wifi` 254; `wifi troubleshooting` 153; `wifi campus agent` 14                            | `campus wifi` 402 / 236 / 47                                                                    |
| Fault to ticket     | `campus maintenance` 205; `maintenance ticket` 185; `it helpdesk agent` 71; `campus helpdesk` 12 | `campus maintenance` 899 / 758 / 217; `campus helpdesk` 397 / 335 / 135                         |
| Campus safety       | `campus safety` 1,227; `campus emergency` 484                                                    | `campus safety` 1,171 / 756 / 161                                                               |
| Document processing | `document processing` 6,461; `document verification university` 191; `admission documents` 155   | `document processing` 26,237 / 11,192 / 1,260                                                   |
| Student performance | `at risk students` 2,011; `student at risk lecturer` 13                                          | `student performance prediction` 13,488 / 8,972 / 1,296; `at risk students` 1,926 / 1,286 / 209 |
| Digital twin        | `smart campus` 1,344; `smart campus dashboard` 432; `campus digital twin` 47                     | `smart campus` 16,044 / 12,630 / 2,185; `campus digital twin` 324 / 284 / 82                    |
| Space finder        | `study space` 2,497; `study space finder` 43                                                     | `study space` 6,532 / 3,104 / 675                                                               |
| Navigation          | in [winners](/docs/research/winners.md#evidence-of-crowding)                                     | `campus navigation` 3,874 / 2,240 / 493                                                         |
| Smart farming       | `smart farming` 1,303; `smart irrigation` 645; `precision agriculture` 521                       | `smart farming` 9,540 / 5,155 / 631                                                             |

Other Devpost counts: for the briefing's examples, `study planner` 1,093, `hr chatbot` 311, `scholarship eligibility` 231 and `admission documents` 155; for areas the simulation left out, `timetable calendar sync` 46, `timetable change notification` 11, `campus shuttle` 79, `shuttle tracker` 15, `lab equipment booking` 25 and `exam seating` 16.

- **Devpost understates this crowd:** the largest simulated clusters are thin on Devpost when phrased the campus way (`campus helpdesk` 12, `wifi campus agent` 14, `campus digital twin` 47, `hvac occupancy` 58). **Inference:** Devpost records what teams built before agent builders; when every team asks the same assistants, few Devpost matches no longer means open ground. This qualifies the [context file's reading](/docs/CONTEXT.md#crowded-and-open-ground), and the same reading in [winners](/docs/research/winners.md#takeaways-for-this-hackathon), that an agent filing tickets from a live feed would be close to unopposed: that holds among published agent winners, but it is the second-largest simulated cluster here.
- **The GitHub crowd is recent:** for 11 of the 13 GitHub queries above, more than half of all matching repositories were created in 2026, for example 284 of 324 for `campus digital twin` and 335 of 397 for `campus helpdesk`. Part of this is GitHub's general growth.

## Saturation tiers

Tiers combine the simulated share, what every team heard at the briefing, the NTT DATA-labelled demos, and Devpost history in [winners](/docs/research/winners.md#evidence-of-crowding).

- **Saturated:** campus energy and sustainability (10.5% simulated); Wi-Fi and network diagnosis (8.7%); facilities or IT fault-to-ticket agents (7.6%); document processing and the admissions document checker (5.5%, the briefing's lead example, and an admissions agent in the NTT DATA demo); HR policy and IT helpdesk agents (1.4% simulated, but built live at the briefing and in the NTT DATA demos); persona and campus Q&A chatbots (3.3% simulated, five personas in the NTT DATA demo, about 15 of 40 recent `campus gemini` repositories, and heavy on Devpost).
- **Crowded:** campus safety (5.5%); student performance insights (5.3%, a Discord example); live dashboards or digital twins (4.9%); study-space finders (4.8%); navigation (4.5%, a Discord example, heavy on Devpost); onboarding (3.4%, a Discord example); research trend analytics (3.4%, a Discord and briefing example); learning companions and study planners (2.7%, a Discord and briefing example, heavy on Devpost); and the off-campus set of smart farming (4.2%), city traffic (3.8%), logistics (3.5%) and flood warning (3.2%).
- **Thin:** room booking and timetable optimisation (2.7%), queues and crowds (2.5%), patient monitoring (2.4%), air quality (2.2%), IoT security (1.5%), campus resource forecasting (1.4%, a Discord example), and scholarship eligibility (no simulated idea, though every briefing attendee heard it).
- **Absent:** student-facing timetable sync or change alerts (none of 780 ideas; 6 mention rescheduling or room changes, mostly from the administrator's side), attendance-code entry (none), lost and found (none), lecturer consultation booking (none), APCard top-ups and payments (3 ideas), library services (4), shuttle, bus or parking (0.5%), student wellbeing (0.5%), and anything built on APSpace (3 ideas).

## What the crowd structurally misses

Shares are of the 780 simulated ideas (mean of the three families) unless they say "responses", which means the 156 full answers. These are signals about the field, not product pitches. The combined reading is in [Takeaways for this hackathon](#takeaways-for-this-hackathon).

- **Real data:** 48% of ideas would have the team deploy new sensors and 34% would read existing campus systems, but only 3% use public data feeds. The answers also tell teams to fake the data: "simulate", "mock", "synthetic" or "dummy" appears in 98% of Claude, 78% of ChatGPT and 30% of Gemini responses, as in "2-3 real sensors plus simulated data for the rest". **Inference:** most rival demos will run on simulated readings, which this repo's rules forbid anyway, so a live, real feed is rare.
- **Named connectors:** NTT DATA said 1P and 3P connectors are the main technical focus ([briefing] at 1:55:01), yet the named connectors it listed appear in at most 2% of responses (see [Model differences](#model-differences)). Only 2 of 780 ideas name Jira, ServiceNow, SharePoint, OneDrive, Salesforce, SAP or MCP.
- **Unattended runs as the core:** 43% of ideas mention acting on a schedule or trigger, but only 19% make an unattended workflow the main form; 31% are chat assistants and 31% dashboards. The scheduled part is usually a feature line, not the product.
- **A named operations owner:** 32% name the staff team that acts on the output (Claude 42%, Gemini 33%, ChatGPT 22%).
- **A measured baseline:** 5% cite a current measured number or a quantified target tied to one; typical claims are unmeasured, such as "slashing university IT response times from hours to seconds". Only 1% combine an unattended run, a named owner and a measured baseline, while 17% (27% of Claude's) combine an unattended run, a named owner and a stated data source (new sensors, campus systems or public feeds).
- **APU's own systems and users:** APSpace appears in 3 ideas, and no idea treats the timetable or attendance as a service students use. Lecturers are the primary user of 4% of ideas and researchers of 4%, against students 25%, mixed groups 22% and admin staff 21%.
- **Staying on campus:** with the minimal prompt, 42% to 82% of ideas leave campus, which fits the theme but not NTT DATA's first criterion of impact on "students, the university, or operations" ([briefing] at 1:55:01).

## APU student-built tools

These are the substitutes APU students have already built for their own campus life, and the official app they build around.

### Repositories and adoption

Public repositories by APU (Asia Pacific University, Malaysia) students for their own campus life, from GitHub search on 3 November 2026. Stars and forks are small across the board, so treat repeat rebuilds over the years as the stronger adoption signal.

| Need                     | Repository                                 | Stars | Forks | Last push   | What it does                                                                           |
| ------------------------ | ------------------------------------------ | ----- | ----- | ----------- | -------------------------------------------------------------------------------------- |
| Timetable to calendar    | [Hackthletes-APU/cron-apu-timetable][cron] | 1     | 40    | 20 Jun 2026 | GitHub Actions cron that copies the APU timetable into Google Calendar                 |
| Timetable to calendar    | [osscv/APLife][aplife]                     | 6     | 0     | 12 May 2026 | Android app syncing classes, exams and holidays to the phone calendar with reminders   |
| Timetable to calendar    | [AaronKhoolb/APSync][apsync]               | 1     | 0     | 12 May 2026 | Syncs the APSpace timetable to a calendar, checks for changes every 12 hours, notifies |
| Timetable to calendar    | [ian-hon/apspace-to-calendar][apcal]       | 0     | 0     | 12 May 2026 | Copies weekly timetables from APIIT's API into Google Calendar                         |
| Timetable to chat        | [notedwin-dev/ApSpace-Discord-Bot][dbot]   | 2     | 0     | 17 May 2026 | Discord bot posting daily and weekly timetables, with an empty-room finder             |
| Timetable comparison     | [CEOofYap/timetable][ttcompare]            | 0     | 2     | 26 Sep 2026 | Compares several students' timetables to find free time and meeting slots              |
| Timetable library        | [chengkangzai/laravel-apu-schedule][lapu]  | 1     | 0     | 22 Jun 2026 | PHP package to query APU timetable data                                                |
| Attendance code entry    | [jyyyyylim/fastAttendix][fastatt]          | 5     | 1     | 16 Nov 2022 | Minimal front end for submitting APU attendance codes                                  |
| Attendance code entry    | [caffrey9307/APUnoATD][noatd]              | 0     | 0     | 6 Oct 2025  | Flutter app automating APSpace attendance OTP submission                               |
| Attendance code entry    | [limxuan/apu-attendix-server][attsrv]      | 0     | 0     | 10 Dec 2025 | Go server for submitting attendance with an OTP                                        |
| Attendance anti-cheating | [dom8s/apspace-secure-attendance][secatt]  | 0     | 0     | 14 Sep 2026 | Final-year project adding campus Wi-Fi and device checks to stop remote code sharing   |
| APSpace for agents       | [helloSamTee/AIC_APSpace_MCP][apmcp]       | 0     | 0     | 19 Jan 2026 | An MCP server for APSpace with an ADK agent                                            |
| Shuttle                  | [Kibbs-dibs/BUSSYSTEM][bus]                | 0     | 0     | 22 Jul 2026 | Shuttle demand forecasting, bus occupancy by camera, and complaint triage              |
| Society app              | [apusds/SDS-App][sds]                      | 2     | 1     | 6 Oct 2021  | Student Developer Society app, 12 open issues                                          |

Older rebuilds of the same two needs include timetable tools from 2013 ([takeurtime]), 2017 to 2019 ([apu_tt], [ate]), 2021 ([ScheduleSync], Outlook) and 2023 ([bettertimetable], ICS), a Telegram timetable bot from 2018 ([fatduck], 6 open issues), and attendance takers from 2021 to 2025 ([autoAttendix2], [apu-attendance]).

- **Timetable tools are the most rebuilt:** at least 12 independent timetable sync, export, chat or comparison tools from 2013 to 2026, five of them created in 2026. The 40 forks of the cron repository were all made in February and April 2025, which looks like a workshop where students set it up for themselves.
- **Motivation in the builders' words:** the Discord bot's author wrote that their parents kept asking "Is the timetable still the same as last week?", so they had been "manually typing out the timetables weekly" for two years ([dbot]). APSync's selling point is that it "checks for changes every 12 hours and notifies you if anything shifted" ([apsync]).
- **Attendance codes are the second:** at least seven tools automate or speed up entering attendance OTPs, and a 2026 final-year project works the other side, blocking codes shared off campus ([secatt]).
- **Interest in agents over APSpace exists:** an APSpace MCP server with an ADK agent was published in January 2026 ([apmcp]).

[cron]: https://github.com/Hackthletes-APU/cron-apu-timetable
[aplife]: https://github.com/osscv/APLife
[apsync]: https://github.com/AaronKhoolb/APSync
[apcal]: https://github.com/ian-hon/apspace-to-calendar
[dbot]: https://github.com/notedwin-dev/ApSpace-Discord-Bot
[ttcompare]: https://github.com/CEOofYap/timetable
[lapu]: https://github.com/chengkangzai/laravel-apu-schedule
[fastatt]: https://github.com/jyyyyylim/fastAttendix
[noatd]: https://github.com/caffrey9307/APUnoATD
[attsrv]: https://github.com/limxuan/apu-attendix-server
[secatt]: https://github.com/dom8s/apspace-secure-attendance
[apmcp]: https://github.com/helloSamTee/AIC_APSpace_MCP
[bus]: https://github.com/Kibbs-dibs/BUSSYSTEM
[sds]: https://github.com/apusds/SDS-App
[takeurtime]: https://github.com/anonoz/takeurtime
[apu_tt]: https://github.com/pickfire/apu_tt
[ate]: https://github.com/pickfire/ate
[schedulesync]: https://github.com/ErwinSuwito/ScheduleSync
[bettertimetable]: https://github.com/mattlab7/bettertimetable
[fatduck]: https://github.com/fat-duck/fatduck
[autoattendix2]: https://github.com/bryanc12/autoAttendix2
[apu-attendance]: https://github.com/daniellim051000/apu-attendance

### The official APSpace app

APU's official app is APSpace, published by APIIT Sdn. Bhd. Its public source mirror, [ctiteam/apspace] (12 stars, 5 forks), was last pushed on 5 January 2023, and all 27 open issues are automated dependency bumps.

| Store       | Rating | Ratings | Installs | Last update       | Source       |
| ----------- | ------ | ------- | -------- | ----------------- | ------------ |
| Google Play | 3.27   | 381     | 10K+     | 24 September 2026 | [play store] |
| App Store   | 3.62   | 143     | n/a      | 24 September 2026 | [app store]  |

Review themes, from the 119 newest Google Play reviews (2018 to 2 November 2026) and the 22 App Store reviews in Apple's feed:

- **Access and stability dominate:** 17 Play reviews mention login, crashes, loading or errors. The most-liked review (52 likes, December 2023) is stuck on an update screen and "can't see my new schedule".
- **Attendance and timetable are the jobs people open it for:** 18 Play reviews mention attendance and 15 the timetable, schedule or classes. A 2 November 2026 review says frequent re-login is annoying "when i have to take attendance, check timetable last minute, and top up apcard" (3 stars).
- **The timetable and empty-room data are distrusted:** a June 2026 App Store review says the app shows classes not in the current semester "almost more than 1 year", has "no realtime updated class schedule timing", and that "some of the empty class shows is fake" (3 stars).
- **The app now hands off to the browser:** two 2026 reviews (July, App Store, 1 star; September, Play, 3 stars) say logging in opens the APU website instead of the app.
- **Feature asks over the years:** a classroom-availability search (2019), a timetable widget (2022, 4 likes), a campus map for new students (2022, 4 likes), and a consultation-booking link (2018). One 2023 review says the shuttle timings page "keeps on loading with no end" (7 likes).

[ctiteam/apspace]: https://github.com/ctiteam/apspace
[play store]: https://play.google.com/store/apps/details?id=my.edu.apiit.apspace
[app store]: https://apps.apple.com/my/app/apspace/id1413678891

### Unmet needs these tools point to

These are signals, not product pitches.

- **Timetable change awareness:** students repeatedly build their own sync and change alerts because the official timetable isn't trusted to stay current and doesn't reach their calendar or family. Strength: high (12+ rebuilds over 13 years, 40 forks, a 2026 review).
- **Attendance code friction:** repeated OTP automation tools and reviews about slow loading during attendance. Strength: medium; the fixes students build sit on the wrong side of academic rules.
- **Live room availability that is accurate:** asked for since 2019, offered by APSpace, and called "fake" in 2026. Strength: medium.
- **Shuttle reliability:** one hackathon repo, one 2026 shuttle project and one store complaint. Strength: low to medium.

## Existing substitutes

Products that already do the jobs proposed by the [Astra shortlist](/docs/ideas/astra/00-ranking.md), checked on 3 November 2026 for that shortlist. These are primary-source checks of proposed mechanisms, not evidence that APU has adopted them. Product pages establish advertised capabilities, not comparative performance. The "Remaining hypothesis" column is the Astra research's reading for each idea, and the IDs are the ones the Astra idea briefs cite.

| ID  | Astra idea    | Primary source                                                                                                      | What already exists                                                                                                                  | Remaining hypothesis worth testing                                                                                                                                                                |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | [Recheck]     | [NetBeez higher education][netbeez]                                                                                 | Client-perspective Wi-Fi sensors and student digital-experience monitoring.                                                          | A low-cost, student-initiated before/after verification packet linked to one real support case might fit an underserved local workflow. Monitoring itself is established.                         |
| C2  | [Recheck]     | [Atlassian incident automation][jsm automation] and [Atlassian's June 2026 reopening announcement][jsm reopen]      | Incident automation and reopening with retained history.                                                                             | The gap, if present, is obtaining comparable physical recovery evidence, not inventing ticket reopening. Configure existing Jira automation if it already solves the entire task.                 |
| C3  | [LastLink]    | [Transit GO][transit go] and [University of Maryland Transit FAQ][umd transit]                                      | Crowdsourced vehicle positions, arrival information, disruption notices and trip planning already serve campuses.                    | An APU liaison's evidence-backed service-change request, with explicit separation of observed waits and missing telemetry, is a narrower possible contribution.                                   |
| C4  | [WashWitness] | [Circuit Go's publisher listing][circuit go] and [Scape's machine-fault procedure][scape]                           | Machine availability, reservations, payments and reporting faults are existing functions.                                            | Verify whether a machine actually completes a useful wash/dry after repair, while distinguishing occupied, failed and unreachable states. No demand for another payment app has been established. |
| C5  | [LabRelay]    | [UNT Health freezer monitoring procedure][unt freezer] and [Rudolph Lab's first-person monitoring account][rudolph] | Temperature thresholds, offline alarms and remote alerts already exist. The lab account describes intermittent Wi-Fi causing alerts. | Acknowledgement, responsibility and an independently observed return to normal might be the neglected work. A new alert dashboard has weak differentiation.                                       |
| C6  | [AccessRelay] | [Virginia Tech elevator-outage notice][vt outage]                                                                   | Campus outage notices and closure maps already exist.                                                                                | Track whether a person can complete the intended activity through an agreed alternative, then verify restored access. The existence of a map does not establish that this handoff is solved.      |

[recheck]: /docs/ideas/astra/01-recheck.md
[lastlink]: /docs/ideas/astra/02-lastlink.md
[accessrelay]: /docs/ideas/astra/03-accessrelay.md
[washwitness]: /docs/ideas/astra/04-washwitness.md
[labrelay]: /docs/ideas/astra/05-labrelay.md
[netbeez]: https://netbeez.net/higher-education/
[jsm automation]: https://support.atlassian.com/jira-service-management-cloud/docs/automate-incident-management-in-jira-service-management/
[jsm reopen]: https://community.atlassian.com/forums/discussion/3250997/you-can-now-reopen-closed-alerts-in-jira-service-management-operations
[transit go]: https://transitapp.com/en/features/go-crowdsourcing
[umd transit]: https://transportation.umd.edu/transit-app-faqs
[circuit go]: https://play.google.com/store/apps/details?id=co.uk.circuit.go.app
[scape]: https://help.scape.com/what-should-i-do-if-a-machine-isnt-working
[unt freezer]: https://www.unthealth.edu/corelabs/rees-scientific-freezer-fridge-monitoring-directions.html
[rudolph]: https://rudolphlab.com/blog/temperature-monitoring-of-freezers
[vt outage]: https://news.vt.edu/notices/facilities/2026/09/08-01.html

## Takeaways for this hackathon

- **Against the crowd (inference):** the crowd will cluster on sensor-fed campus operations shown on simulated data, behind a chat window or dashboard, without named connectors or a measured baseline. The scarce combination is a real feed, a named APU owner, a measured before-and-after, and an unattended run that uses Gemini Enterprise's own connectors.
- **Against existing substitutes, for the Astra shortlist (inference):** originality is most plausible in the last handoff: evidence of usable recovery, an actionable service-change packet, or confirmation that an alternative actually worked. Every Astra finalist has substantial existing substitutes. None has been proven globally unique, and the search is not exhaustive.
- **Boundaries for the Astra product documents:** keep strict boundaries. HTTPS timings are application reachability, not radio signal strength or root-cause diagnosis; a camera records a physical observation but does not turn a manual report into autonomous sensing; an accelerometer measures vibration, not cleanliness; a cold-box experiment is not validation on a laboratory freezer. These boundaries must appear in the product documents.

## Method

### Sources searched

- **Discord and briefing:** every capture under [docs/sources/discord.com](/docs/sources/discord.com/apu-cloud-innovation-hackathon-discord.md) and the [briefing transcript][briefing]. The Discord captures leave out participants' own posts (for example, team-seeking posts in `#team-formation`) for privacy, and the `#project-discussion` idea lab has no captured replies, so no participant's idea is on record ([#team-formation], [#project-discussion]). Participant numbers are not published in any capture; the presenter only said "there are a lot of participants" ([briefing] at 1:50:28).
- **GitHub:** repository search for repositories created on or after 20 October 2026 matching "APU Cloud Innovation Hackathon", "Cloud Innovation Hackathon", "NexConnect", "apu hackathon", "gdgocapu", "GDGoC APU", "Gemini Enterprise" with APU, "APU campus", "apu smart campus", "When Cloud, IoT, and Network Converge" and similar; code search for the hackathon name, "NexConnect" with "APU", and "gdgocapu". All run on 3 November 2026 between about 10:40 and 11:00 PM MYT.
- **Simulation:** five participant prompts, each sent repeatedly to three model families at default sampling settings, described below. Raw outputs stay in the scratch folder, not the repo.
- **Crowding counts:** Devpost's project search JSON (`devpost.com/software/search.json?query=...`, the same index as the [Devpost search] page), which matches every word and breaks on hyphens and quotes, so queries avoid both; and GitHub repository search totals, all time, since 1 January 2026, and since 1 October 2026. Counts already in [winners](/docs/research/winners.md#evidence-of-crowding) are not repeated.
- **APU student tools:** GitHub repository search for APSpace, APU timetable, APIIT, APU bus and shuttle, APU attendance and Attendix, APU Telegram and Discord bots, "Asia Pacific University" and others; the Apple App Store lookup and review feed and the Google Play listing and newest reviews for APSpace.

[#team-formation]: /docs/sources/discord.com/team-formation.md
[#project-discussion]: /docs/sources/discord.com/project-discussion.md
[devpost search]: https://devpost.com/software/search?query=campus+digital+twin

### Simulation prompts

The briefing presenter told teams without ideas to "go to Antigravity, ask for ideas" and to "give prompt to Gemini Enterprise itself. You get use cases" ([briefing] at 1:29:22 and 1:45:17). The prompts below use only the public brief: the theme, the three tracks with their Discord example ideas, and "use Gemini Enterprise" ([problem statements]). Each asks for five ideas.

1.  **P1, minimal:** "We're a team joining the APU Cloud Innovation Hackathon 2026. The theme is "When Cloud, IoT, and Network Converge" and we have to build with Gemini Enterprise. Give us 5 project ideas, each with a title and a short description."
1.  **P2, Smart Campus track:** "My team picked the Smart Campus & Student Experience track for the APU Cloud Innovation Hackathon 2026 (theme: "When Cloud, IoT, and Network Converge"). The track is about improving student life, access to campus services, and connectivity. Their example ideas are campus navigation, personalized onboarding, or an AI learning companion. We need to use Gemini Enterprise. Suggest 5 project ideas with a title and short description for each."
1.  **P3, Intelligent Automation track:** "Hackathon: APU Cloud Innovation Hackathon 2026, theme "When Cloud, IoT, and Network Converge". Our track is Intelligent Automation & Digital Transformation: use AI to streamline repetitive work and university workflows. Example ideas they gave: HR/IT support, document processing, or student performance insights for lecturers. We must build it in Gemini Enterprise. Give me 5 ideas (title + short description)."
1.  **P4, Data-Driven Research track:** "We are doing the Data-Driven Research & Intelligent Decision Making track at the APU Cloud Innovation Hackathon 2026. Theme is "When Cloud, IoT, and Network Converge". The track: turn data into useful insights for research and planning, e.g. research visualization, trend analysis, or resource forecasting. Tool: Gemini Enterprise. Can you suggest 5 project ideas? Title and short description for each please."
1.  **P5, full brief, aiming to win:**

    ```text
    We're 4 APU (Asia Pacific University, Malaysia) students entering the APU Cloud Innovation Hackathon 2026 and we want to win. Theme: "When Cloud, IoT, and Network Converge". There are three tracks, we pick one:
    1. Smart Campus & Student Experience - improve student life, access to campus services, and connectivity (examples: campus navigation, personalized onboarding, AI learning companion)
    2. Intelligent Automation & Digital Transformation - use AI to streamline repetitive work and university workflows (examples: HR/IT support, document processing, student performance insights for lecturers)
    3. Data-Driven Research & Intelligent Decision Making - turn data into useful insights for research and planning (examples: research visualization, trend analysis, resource forecasting)
    We need to use Gemini Enterprise and we have about one week to build a prototype. Give us 5 strong ideas that could win, with a title, short description and which track for each.
    ```

[problem statements]: /docs/sources/discord.com/problem-statements.md

### Models and samples

All requests were sent on 3 November 2026 between about 10:38 and 11:40 PM MYT, as one user message with no system prompt and no sampling settings (no temperature, top-p or thinking parameters), so each model ran at its defaults.

| Family    | Model ID sent           | Model reported in the response   | Responses                                | Ideas |
| --------- | ----------------------- | -------------------------------- | ---------------------------------------- | ----- |
| Gemini    | `gemini-3.6-flash`      | `gemini-3.6-flash`               | 6 (P1: 3, P3: 1, P4: 2, P2 and P5: none) | 30    |
| Gemini    | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite`          | 50 (10 per prompt)                       | 250   |
| OpenAI    | `chat-latest`           | `chat-latest` (no dated version) | 50 (10 per prompt)                       | 250   |
| Anthropic | `claude-sonnet-5-5`     | `claude-sonnet-5-5`              | 50 (10 per prompt)                       | 250   |

Every response contained exactly five ideas: 156 responses, 780 ideas. Gemini went through the Gemini API (`generateContent`, thought parts dropped), OpenAI through Chat Completions, and Anthropic through the Messages API with `max_tokens` 16000.

The newest Flash in the Gemini API's model list is `gemini-3.8-flash`, which `gemini-flash-latest` also points to; it could not be used (see [Errors and limits](#errors-and-limits)). Gemini 3.6 Flash, the newest Flash that answered, ran out of quota after six responses, so Gemini 3.5 Flash-Lite supplies 250 of the 280 Gemini ideas. **Inference:** the Gemini column reflects Flash-Lite more than the newest Flash.

### Extraction and clustering

1.  **Extraction:** `gpt-5.4-mini` with a strict JSON schema read each response and returned, per idea: title; a one-line summary of up to 25 words; track; setting (campus or off campus); primary user; main form (chat assistant, dashboard, app or portal, background workflow); whether it acts on a schedule or trigger without being asked; its device data source (new sensors the team deploys, existing campus systems, simulated, public feeds, none); whether it names the staff team that acts on the output; whether it cites a measured baseline or quantified target; and named systems and technologies. Flags were judged strictly from each idea's own text.
1.  **Discovery:** each "title: summary" was embedded with `text-embedding-3-small`, and k-means (k = 28) on the first 500 ideas showed the clusters, from which a 27-category taxonomy was written.
1.  **Assignment:** `gpt-5.4-mini` put each of the 780 ideas into one category. The k-means clusters agreed with these labels for 79% of ideas, and a manual read of 40 random labels found 38 sensible; the two misses put industrial ideas in campus categories.
1.  **Shares:** families have different sample counts, so "Overall" is the mean of the three family shares, which weights each family equally. Keyword counts over the full 156 responses back the structural findings.

### Errors and limits

- **Gemini 3.8 Flash:** the first five parallel calls returned HTTP 429 (free tier, 5 requests per minute per model). Slower retries returned HTTP 503 "This model is currently experiencing high demand" for about ten minutes, and then HTTP 429 for the free-tier limit of 20 requests per day, with a retry delay of about 17 hours. `gemini-3.7-flash` reported the same `gemini-3.8-flash` daily quota. Routing the model through OpenRouter failed with HTTP 403 "Key limit exceeded (total limit)", because that key has a $0 limit.
- **Gemini 3.6 Flash:** six responses succeeded; the other calls returned HTTP 503 (high demand) and then HTTP 429 for its own 20-per-day free-tier limit.
- **No other failures:** all 50 Flash-Lite, 50 OpenAI and 50 Anthropic requests succeeded, as did all extraction, embedding and labelling calls.
- **What the simulation can't show:** it samples AI brainstorming, not the teams. Real teams also start from the briefing's examples, coursework and their own experience. The prompts are short and English-only, and a team that asks one model sees a narrower set than the pooled map (see [Model differences](#model-differences)). Labels have about a 5% visible error rate. Devpost and GitHub counts match words, not meaning, so read them as relative sizes.

### Substitute checks

The [existing substitutes](#existing-substitutes) come from the Astra feasibility research. It browsed the linked primary documentation and first-party product pages on 3 November 2026. Search families included university Wi-Fi monitoring, incident reopening, campus transit crowdsourcing, laundry availability/fault reporting, laboratory freezer alarms, and elevator outages. Reddit pages were opened or inspected through indexed results; quotations were avoided. Existing repository feed tests are attributed to their original research, not presented as fresh API tests in this session. No prototype or interviews were conducted in this research session. X and Reddit methodology, dates and access limitations are separately recorded in [social](/docs/research/social.md).

The same research session's platform constraints (F1 to F5) are now in [Gemini Enterprise](/docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences), and its additional demand evidence (D1 to D3) in [social](/docs/research/social.md#d1-and-d2-laundry-analogues-outside-malaysia) (D3 is [S8](/docs/research/social.md#s8-a-lift-outage-leaves-a-student-outside-the-lecture-hall)); the Reddit and feed-test sentences above cover those sections.

## See also

- [Winners](/docs/research/winners.md#saturated-idea-types): Devpost counts for the historically saturated idea types, how winners in crowded categories stood out, and what agent entries reward.
- [Hackathon context](/docs/CONTEXT.md#crowded-and-open-ground): the team's working view of crowded and open ground, which this file qualifies.
- [Brief](/docs/BRIEF.md#challenge-tracks): the tracks and example ideas every team starts from.
- [Briefing transcript](/docs/sources/briefing-session/transcript.md): the worked examples and NTT DATA's spoken judging outline.
- [APU](/docs/research/apu.md) and [data sources](/docs/research/data-sources.md): real APU and public data that the simulated crowd does not use.
- [Judging](/docs/research/judging.md): what NTT DATA rewards.
- [Astra shortlist](/docs/ideas/astra/00-ranking.md): the ideas the existing substitutes were checked against.

[briefing]: /docs/sources/briefing-session/transcript.md
