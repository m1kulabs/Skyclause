# Hackathon context

What a team needs to know, beyond the rules, to compete well in the APU Cloud Innovation Hackathon 2026: what NTT DATA said it will rate, what past winners share, how to build inside Gemini Enterprise while still covering the Cloud + IoT + Network theme, and which tools and real data fit a one-week build. The event's facts (eligibility, tracks, dates, submission fields, what the briefing said) are in the [brief]; the evidence behind this page is in [docs/research](/docs/research/). Updated on 3 November 2026, after the briefing; **Inference** marks conclusions that no source states outright.

Contents:

1.  [Decisions so far](#decisions-so-far)
1.  [What the judges will reward](#what-the-judges-will-reward)
    1.  [What NTT DATA said it will rate](#what-ntt-data-said-it-will-rate)
    1.  [Sponsor and organiser lenses](#sponsor-and-organiser-lenses)
1.  [What past winners share](#what-past-winners-share)
1.  [Crowded and open ground](#crowded-and-open-ground)
1.  [Building inside Gemini Enterprise](#building-inside-gemini-enterprise)
    1.  [Workflows and unattended runs](#workflows-and-unattended-runs)
    1.  [Connectors and live data](#connectors-and-live-data)
    1.  [Reviewer access](#reviewer-access)
    1.  [Antigravity](#antigravity)
1.  [Covering the theme](#covering-the-theme)
    1.  [Cloud](#cloud)
    1.  [IoT](#iot)
    1.  [Network](#network)
1.  [Real data per track](#real-data-per-track)
    1.  [Public feeds](#public-feeds)
    1.  [APU's own documents and systems](#apus-own-documents-and-systems)
1.  [Tools and accounts](#tools-and-accounts)
1.  [Recommended shape](#recommended-shape)
1.  [Submission checklist](#submission-checklist)
1.  [Build plan to 17 November](#build-plan-to-17-november)
1.  [Strategic risks](#strategic-risks)
1.  [See also](#see-also)

## Decisions so far

The repo allows only real public data, never mock or sample data, with no fallback when a source fails ([project conventions]). On 3 November 2026 the user ruled on the cases that rule left open:

- **Allowed:** live readings from the team's own phones or boards; a published real dataset replayed as a stream, labelled as a replay; a real sensor log the team recorded, once published with its provenance, then replayed; a 3–4 minute video recorded from the live system running on real data, labelled as a recording with its capture date. The video was ruled in after the briefing, where NTT DATA asked for one.
- **Forbidden:** synthetic or random readings; recorded data shown when a live source fails (already in the rule); a video that stands in for live access. Reviewers still get the live system.

On 4 November 2026 the user added one case: mock GPS is allowed in tests and in the recorded demo, and doesn't need a label. **Inference:** this covers positions only. Feeds, phones, network, and cloud stay real, results measured from mocked runs aren't evidence, and the team doesn't claim a mocked run happened at a real place.

The case-by-case table for sensor data is in [IoT and network](/docs/research/iot-and-network.md#real-versus-simulated-data).

[project conventions]: /docs/references/project-conventions.md

## What the judges will reward

### What NTT DATA said it will rate

No official criteria are posted. Asked at the briefing, the NTT DATA presenter said an NTT DATA team will review and rate projects on five points ([brief](/docs/BRIEF.md#judging-and-prizes)); weights, scale, and reviewers are unknown. The evidence column is **Inference**.

| Point                | What the presenter said                                          | Evidence to show                                                                        |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Impact               | How the solution affects students, the university, or operations | A named APU office or group, the real volume it handles, a timed baseline, before/after |
| Technical build      | Mainly the 1P and 3P connectors used; MCP is an add-on           | A table of every connector, its mode, and its job; a diagram naming each hop            |
| Research             | How well the team researched the problem                         | 6–8 interviews in two rounds, one timed observation, quotes labelled by role            |
| Time to impact       | How soon the impact arrives, for example three or six months     | A dated 3- and 6-month plan with owners and the assumptions it rests on                 |
| Day-to-day workflows | For automated workflows, how they work in day-to-day use         | A scheduled or event-triggered workflow, several days of unattended run history         |

What the presenter stressed around those points ([briefing]):

- **"Maximizing", not "agentic":** "simply sending mail on behalf of me is not agentic"; he wants an agent that "will run twenty-four by seven on behalf of me automatically without disruption", like an admissions agent that checks each intake's applications for months.
- **Outcome over tooling:** asked whether to show where teammates used AI, he said he wants "the outcome where it exactly fits", for an operations team or for students.
- **Impact as a success ratio:** less manual work and an accuracy figure; his example guessed 80%. Measure it instead: precision and recall on 30–50 real items, with the sample size ([research and impact]).
- **Connectors he named:** Google Drive, OneDrive, Microsoft 365, and Google Workspace as the main ones; free Jira, ServiceNow, and SAP sandboxes; Salesforce and SAP as partners; MCP servers such as GitHub's. ADK is "very limited" for this hackathon, "but up to you guys".

**Inference:** comparable rubrics also score a working product, design, and originality, and KitaHack 2026's final gave presentation 40% ([judging and pitching]); expect those to count at the 17 November final, whose format is unannounced.

### Sponsor and organiser lenses

**Inference:** each likely judge group has a visible bias ([judging and pitching], [briefing slides]).

- **NTT DATA:** the briefing team was its Head of Cloud and AI, three forward deployed engineers (FDEs), and two engineers, from a practice that aims to certify 5,000 Gemini Enterprise experts and co-build 500 agents with Google Cloud. Expect them to judge like a client deployment: connectors into real systems, a workflow that runs, and a measured outcome for an office.
- **APU School of Technology:** its staff teach a Coral Edge TPU to Vertex AI pipeline and call Google APU's "primary cloud partner". Expect them to spot a faked IoT layer quickly and to value privacy-conscious edge processing.
- **Google Cloud:** expect a clear reason for every Google product and current product names.

[briefing slides]: /docs/sources/briefing-session/slides.md

## What past winners share

No earlier APU Cloud Innovation Hackathon with published winners was found, nor any Gemini Enterprise or Agentspace hackathon, nor any NTT DATA judging record ([past winners], [agent hackathon winners]). From 18 winners of KitaHack, the Solution Challenge, and other Google and APU events, and from winners of Google's Rapid Agent Hackathon, Microsoft's Agent Academy Hackathon, and other agent contests:

- **A narrow, named user:** people with mild dementia, flood rescuers, procurement staff, on-call engineers; never just "students". Agent winners are almost all staff and operations tools, and university customer stories centre on admissions and student services.
- **Started by a trigger, gated by a person:** agent winners start from an email arriving, a ticket, a schedule, or a data change, not a chat message, and ask a person before anything they can't undo. Fivetran on Rapid Agent's winners: "None of the teams set out to build a better chatbot."
- **Every connected system named:** VendorGuard, the top-scoring entry at Agent Academy 2026, chained Outlook, Power Automate, Dataverse, and Teams; KitaHack 2025's EqualLens chained five Google products. Rapid Agent's technical criterion was "the interaction with Google Cloud and Partner services".
- **A narrow, inspectable rule set:** VendorGuard scored contracts against 15 rules kept in a data store staff can edit, the closest parallel to the briefing's admissions agent.
- **Measured outcomes are rare and per task:** "under two minutes", up to 40% less incident-handling time; Gaze Link reported a 30-person test. No winner found states a 3- or 6-month rollout plan. **Inference:** a dated plan with a baseline answers a judging point most entries will skip.
- **Hardware and sensors are rare:** 3 of the 10 Solution Challenge winners from 2022 to 2024 built a device; sensor-driven agent winners act on network, satellite, or monitoring telemetry, never campus IoT.

## Crowded and open ground

- **Saturated and crowded:** the crowd baseline's [Saturation tiers](/docs/research/competition.md#saturation-tiers) class campus energy, Wi-Fi and network diagnosis, facilities or IT fault-to-ticket agents, document processing and admissions checkers, HR policy and IT helpdesk agents, and campus Q&A chatbots as saturated. Navigation, study planners, live dashboards and several other categories are crowded. The tiers combine simulated brainstorming, briefing examples, NTT DATA-labelled demos and published projects.
- **Live feeds don't make open ground:** lecturer dashboards (35 Devpost matches), classroom occupancy (28), and helpdesk tickets (60) looked thinner among published projects ([agent hackathon winners]). But across 780 simulated ideas, campus operations on sensor or telemetry feeds hold 41.7%, and telemetry-to-ticket agents hold 16.3%, using the mean of the three model families' shares ([Crowd map](/docs/research/competition.md#crowd-map)). **Inference:** low historical counts don't establish low competition here; a campus network watch that files tickets follows one of the largest simulated clusters.
- **How crowded categories were won:** depth and an explicit limit on what the agent may do alone, not more agents or novelty. EqualLens covered the whole hiring flow; TrustLens set out 11 document types and 46 checks ([past winners]).

## Building inside Gemini Enterprise

The NTT DATA presenters called Gemini Enterprise mandatory, with agents built inside it, while the organisers' posts say "where it fits" ([brief](/docs/BRIEF.md#source-discrepancies)). **Inference:** NTT DATA rates the entries, so build the core in Gemini Enterprise; anything else, such as a sensor feeder, exists to feed it. Details are in [Gemini Enterprise] and [Gemini Enterprise data].

### Workflows and unattended runs

- **The "maximizing" agent is a workflow:** Workflow Builder (formerly Agent Designer, GA since 3 September 2026) builds chat agents and workflows. Workflows start on a schedule (cron allowed), on a connector event polled every 5–10 minutes (Confluence, Gmail, Google Calendar, Google Drive, Jira Cloud, OneDrive, Outlook, ServiceNow, SharePoint, Teams), or by hand, and each has a **Runs** tab with step-by-step traces. There is no webhook trigger.
- **Three catches:** schedules run on the author's credentials, which expire every 14 days and must be refreshed by hand; scheduled runs that affect other people, such as sending email, pause for approval; and connector writes from a workflow "require human review". **Inference:** the presenter set his "maximizing" agent against one that waits on "reviewing, getting it approved" ([briefing]), but the platform pauses for approval anyway. Show the watching, deciding, and drafting running unattended for days, and leave the human one click, rather than claim zero-touch.
- **Quotas are small:** on Standard, 1 agent creation per licensed user per day, pooled (Plus: 10), and 160 assistant queries per user per day. Pools reset at 4:00 PM MYT; a free trial has no pay-as-you-go above them, and event-triggered runs that fail on quota aren't retried.
- **Full-code agents** built with ADK or Agent Platform can be published into Standard and Plus apps, but need a billing account. **Inference:** use them only for what the no-code builder can't do.

### Connectors and live data

- **Indexed copies are banned for live values:** ingested connectors refresh every 3 hours at best for third-party apps and every day at best for Cloud Storage, and keep answering from the old copy when the source fails, which is the cached copy the rule forbids. **Inference:** live readings reach the agent only through federated search, live queries, actions, or MCP tools, where a failed source fails the query.
- **Write actions worth showing:** on GA Google connectors, Drive and Sheets (cell reads and writes since 12 October 2026), Gmail send, and Calendar events; on GA third-party connectors, Jira Cloud create issue, ServiceNow create incident, Slack, Outlook, SharePoint, Teams, and GitHub. Supabase, Salesforce, and Globalping (real network measurements) are in preview. There is no SAP connector.
- **Custom MCP is the add-on, and it's gated:** the Custom MCP Server store is in preview, needs Streamable HTTP over public HTTPS with OAuth or no auth, and is blocked by default by an organisation policy only an Organization Policy Administrator can lift.
- **Account type decides the path:** Drive, Gmail, and Calendar connectors don't support consumer `@gmail.com` accounts, despite the presenter saying they "work perfectly". Without a card, the best live path is phone or board → Apps Script web app → a Sheet in the licensed Workspace domain, read live through Drive and Sheets, with an Apps Script time trigger polling public feeds into it. On consumer accounts, use Supabase Free with the Supabase connector instead. With a card: Pub/Sub → BigQuery, read through BigQuery's federated query mode (preview), plus a Cloud Run MCP server that fetches public feeds on demand and passes their errors through ([Gemini Enterprise data]).
- **Sandboxes hold only real records:** Jira Cloud Free (10 users), Salesforce Developer Edition, and a ServiceNow Personal Developer Instance (reclaimed after 10 days of inactivity) can hold records the system creates from real events; delete any preloaded demo records. The Microsoft 365 developer sandbox is closed to most students and ships sample data, which the rule bars ([Gemini Enterprise data](/docs/research/gemini-enterprise.md#free-sandboxes)).

### Reviewer access

- **Each reviewer needs** a licence seat, the Gemini Enterprise User role on the team's project, and the agent shared with them; Frontline seats can only run agents shared with them. Sharing is documented only "within your organization", and organisations created since 3 May 2024 limit IAM grants to their own domain by default, so `@nttdata.com` reviewers may need an exception ([Gemini Enterprise](/docs/research/gemini-enterprise.md#reviewer-access)).
- **The app URL isn't public:** it comes from the app's **Integration** page, like `https://vertexaisearch.cloud.google.com/home/cid/<id>`, and refuses anyone without a seat and role. The presenter described reviewers being invited for "the top use cases" ([briefing]). **Inference:** the submission's demo link should open the README's "How to review" section: the app URL, how to request access, and the video.
- **Shared users see their own runs, not the owner's:** capture the owner's Runs tab over several days in the README and video, and give reviewers a trigger they can fire themselves, such as emailing a test inbox or dropping a file into a shared folder.

### Antigravity

- Google's agentic development platform: desktop app (2.0 since May 2026, with subagents and scheduled tasks), CLI, IDE, and SDK. The presenters pitched it for setting up 3P connectors and MCP servers and called it a "required prerequisite" ([brief](/docs/BRIEF.md#tools)).
- **The licence may not include it:** free-trial Gemini Enterprise seats exclude AI developer tools, and paid Standard or Plus seats carry $10 or $15 of Antigravity credit per user per month. The free Individuals plan on a personal account has weekly limits and Gemini 3.8 Flash, but not Gemini 4 Argon ([Gemini Enterprise](/docs/research/gemini-enterprise.md#antigravity)).
- **Inference:** use it to build the feeder (Apps Script, an MCP server) and to work through connector setup, and say so in the README, since the presenter asked teams to show how they used it.

## Covering the theme

The theme is "When Cloud, IoT, and Network Converge" ([brief](/docs/BRIEF.md#at-a-glance)). **Inference:** with asynchronous judging, each of the three parts only scores if the repo, video, and Gemini Enterprise app make it visible.

### Cloud

- **Inference:** Gemini Enterprise and its workflow are the cloud layer judges will look at; the feeder that lands readings where a connector can query them live is the rest. Google has had no managed IoT service since Cloud IoT Core retired on 16 August 2023 ([IoT and network]).
- **Without a card:** phone or board → HTTPS to an Apps Script web app → Sheet → Gemini Enterprise. **With a card:** device → HTTPS on Cloud Run → Pub/Sub → a BigQuery subscription → Gemini Enterprise ([Gemini Enterprise data], [Google tools]).

### IoT

- **Phones are the fastest real sensor:** geolocation, motion, camera, and microphone work in browsers on Android and iPhone; Web Bluetooth, Web NFC, and the Generic Sensor API are Chromium-only and absent on iOS ([IoT and network]).
- **Boards are a lead-time risk:** Cytron ships from Penang in 2–3 working days; the Pico W and NodeMCU ESP32 were out of stock on 3 November while the Pico 2 W was in stock at RM31.60–39.60; Deepavali is Sunday 8 November, with Monday 9 November reported as the replacement holiday (secondary) ([IoT and network]).
- **LoRaWAN isn't viable this week:** 1 of 96 mapped gateways near Kuala Lumpur was online, and Cytron's cheapest gateway costs RM998.75 ([IoT and network]).

### Network

- **Inference:** a network is invisible unless the demo shows it. Visible proofs: per-reading latency from the device timestamp to the time the row lands; a device dropping offline and its buffered readings arriving on reconnect; a diagram naming every hop, protocol, and connector ([IoT and network]). Globalping's connector (preview) can add real ping, traceroute, or HTTP measurements from public probes, such as the path to the team's own ingest endpoint ([Gemini Enterprise data]).
- **Campus Wi-Fi is unknown for devices:** OnBoard@APU uses an on-screen enrolment with up to four devices per user, and nothing public says whether headless boards can join. Plan on a phone hotspot and ask APU IT Helpdesk early ([IoT and network]).

## Real data per track

### Public feeds

Each source below returned current data on 3 November 2026 without a key; endpoints, limits, and licences are in [public data sources].

| Track                  | Strongest real sources near APU                                                                                                                                        | Sensor feed          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Smart Campus           | Rapid Bus KL GTFS Realtime positions every 30 seconds, with route T580 stopping about 360 m from campus, joined to GTFS Static; OpenStreetMap around TPM; MET forecast | Bus GPS              |
| Intelligent Automation | Public Infobanjir gauge "Sg. Kuyoh di LRT Bukit Jalil" every 15 minutes with four alert thresholds; DOE APIMS air quality hourly, nearest station 5.9 km; MET warnings | River gauge, air     |
| Data-Driven Research   | OpenAlex's 3,711 APU works with topics (CC0); Rapid Rail daily origin-destination ridership, including Bukit Jalil, up to the previous day                             | No (daily aggregate) |

- **The limits force a poller:** data.gov.my allows 4 requests a minute per API, APIMS blocks browser requests from other sites, and Infobanjir is HTML only. **Inference:** one scheduled job, such as an Apps Script time trigger, that polls each feed and stores every snapshot with its source timestamp keeps the app inside the limits and is itself a visible network layer. On a consumer account, Apps Script triggers get 90 minutes of runtime a day, about 3.75 seconds per run at one-minute polling ([Gemini Enterprise data]). When a poll fails, the row records that feed's error, not the last snapshot.
- **Terms:** data.gov.my is CC BY 4.0 and OpenAlex is CC0; WAQI forbids storing its data, Open-Meteo's free tier is non-commercial, and APIMS and Infobanjir publish no terms. List attributions in the README.

### APU's own documents and systems

APU documents no data API, though APSpace's timetable is a public, undocumented feed ([APU timetable feed](/docs/research/apu.md#apspace-timetable-feed)), and much of its operating knowledge is public ([APU public documents]):

- **Knowledge base:** `kb.apu.edu.my` is APU's Confluence site, where 21 of its 28 spaces hold 1,189 pages readable without login, 725 of them IT helpdesk articles, some edited on 3 November. Other spaces cover academic administration, the library, graduation, accommodation, logistics, and visas.
- **Documents:** the shuttle schedule (effective 22 October 2026), the November 2026 orientation guide, Student Handbook v8.0, the application form's required-documents checklist, 138 course pages with entry requirements and fees, the August 2026 scholarship grid, the PTPTN guide, and the refund policy. Academic regulations, programme handbooks, and the academic calendar are login-gated.
- **Systems:** Microsoft 365 for mail and files (Outlook, Teams, OneDrive, SharePoint), a Virtual Help Centre on Jira Service Management, Confluence, Moodle, APSpace, and Koha; Google is not APU's mail or file platform. **Inference:** SharePoint, OneDrive, and Jira connectors on sites the team owns mirror APU's real operations better than Gmail or Drive alone.
- **Terms:** `robots.txt` allows crawling, but APU's Terms of Use reserve copyright and ask permission for any use of the site's contents. **Inference:** ask the organisers in `#help-desk` for written permission, store each file's source URL and fetch time, and keep the orientation guide's default-password page out of any agent.
- **Private records can't be demoed:** **Inference:** real application files, grades, and fee statements are personal data the team can't get, and invented ones break the rule. Ground ideas like the admissions checker in the public rules, and feed them only real inputs: sensor readings, public feeds, or records the system itself creates.

## Tools and accounts

As of 3 November 2026; quotas and prices change without notice ([Google tools], [Gemini Enterprise]).

- **Gemini Enterprise licence:** Google sponsors a trial licence; whether per person or per team, which edition, and when it arrives are unknown. The briefing's path: Google Cloud console → Gemini Enterprise → create an app → **Configuration** → **Feature management** → turn on chat agents and workflows ([brief](/docs/BRIEF.md#tools)). If the console offers a free trial or asks you to buy credits, the licence hasn't reached the project; don't buy credits, ask the organisers.
- **Ask the organisers now:** whether licences sit on Workspace or consumer accounts; whether the custom MCP policy is lifted; which roles teams hold on their project; whether the seats are a free trial, which excludes Antigravity; and how reviewers get seats.
- **A card is needed** for Pub/Sub, Cloud Functions, Agent Runtime for full-code agents, Cloud Run outside AI Studio's Starter Tier, and the $300 Free Trial; Google Cloud credits are unconfirmed. Cloud Billing rejects prepaid cards and debit cards that require two-factor authentication. The Free Trial is once per person, so pick whose card the team uses early ([Google tools]).
- **Free without a card:** Apps Script, Google Sheets, Supabase Free, Jira Cloud Free, Salesforce Developer Edition, a ServiceNow developer instance, GitHub, and the Gemini API free tier, whose prompts may be read by human reviewers and must not contain personal information ([Google tools], [Gemini Enterprise data]).
- **Renamed in 2026:** Agent Designer is Workflow Builder, Vertex AI is Gemini Enterprise Agent Platform, Looker Studio is Data Studio, free Gemini CLI moved to Antigravity, and Gemini 2.5 is legacy. The presenters' models are Gemini 3.8 Flash and Gemini 4 Argon. Use current names in the README and deck.

## Recommended shape

**Inference**, from the sections above; the track and idea are the team's call. Check the [Crowd map](/docs/research/competition.md#crowd-map) and [Saturation tiers](/docs/research/competition.md#saturation-tiers) before choosing: a live feed and write actions alone don't distinguish an idea.

- **Problem:** one operational process owned by one named APU office, such as IT helpdesk, library, logistics and operations, or admissions, where real events arrive daily and someone checks them by hand.
- **Signal:** a real live input: readings from the team's phones or boards, a public feed, or real events such as emails or tickets, landing where a connector queries it live. One board only if it arrives by 6 November, and never on the critical path.
- **Workflow:** a Gemini Enterprise workflow on a schedule or event that reads 1P and 3P connectors, decides against an inspectable rule set grounded in APU's public documents, and acts through write actions, such as a Jira issue or an email draft, with the one human approval the platform requires before anything reaches people.
- **Connectors:** at least one 1P (Drive and Sheets, Gmail) and one 3P that mirrors APU's stack (Jira, SharePoint or OneDrive, ServiceNow); a custom MCP server only as the add-on.
- **Proof:** several days of run history, a timed baseline, precision and recall on 30–50 real items, and 6–8 interviews with the office's staff or users.
- **Plan:** what changes for the office by 3 months and what is measured by 6, with owners named.
- **Example:** a logistics shuttle-disruption watch: a phone on an actual Campus Connect shuttle records GPS and timestamps, a scheduled workflow compares the observed journey with APU's published shuttle schedule, and drafts a Jira follow-up and rider notice for approval when an observed departure is late. Missing readings show an error, not a service disruption. Shuttle, bus and parking ideas hold 0.5% of the simulation and sit in its "Absent" tier ([Saturation tiers](/docs/research/competition.md#saturation-tiers)); that tier means sparse coverage, not zero ideas or guaranteed low competition.
- **Tracks:** Intelligent Automation fits "maximizing" most directly; Smart Campus needs an operations angle; Data-Driven Research has the least APU-specific data.
- **Avoid:** a chat-only agent; ideas that need private records; ingested connectors for live values; a public web app as the main product; face or other biometric data, which the 2024 PDPA amendment made sensitive; personal data in free-tier prompts; LoRaWAN; depending on custom MCP before the organisers confirm it's allowed.

## Submission checklist

There are two lists: the portal's, and what NTT DATA asked for at the briefing ([brief](/docs/BRIEF.md#submission-requirements)). Meet both.

- **Portal:** project title, one track, a summary of at least 50 characters, an HTTPS repo link, a PDF deck of at most 10 MB, and a demo link. Only the leader submits, and final submission locks the entry.
- **NTT DATA:** a README covering the existing problem, how you solve it, the research you did, how the team worked, and the impact or outcome; slides or a PDF and a high-level diagram in the repo; a 3–4 minute video of the same five points that shows the solution working; reviewer access to the Gemini Enterprise app.

The quality layer ([research and impact], [judging and pitching]):

- **Repo:** public and opening from a logged-out browser, though the presenter left that to teams; no secrets, with GitHub push protection on.
- **README:** the five headings in the briefing's words, then "Data and privacy" and "How to review or run it"; a connector table and "How it runs day to day" under the solution, and "Time to impact: 3 and 6 months" under impact. Add a Mermaid diagram of device, network, feeder, connectors, workflow, and actions; a table of what is live, what is replayed, and from which source; data sources and licences; and AI tools used, including Antigravity. A skeleton is in [research and impact](/docs/research/judging.md#readme-skeleton).
- **Video:** about 3:45, with the demo and impact inside the first three minutes; labelled as a recording with its capture date in the title, on screen, and in the description; YouTube unlisted, checked from a logged-out browser. A minute plan is in [research and impact](/docs/research/judging.md#minute-plan).
- **Deck:** a PDF that reads without a presenter, one idea per slide, sections following NTT DATA's five points, and a privacy slide. GitHub ignores links inside PDFs, so print the repo, app, and video URLs as visible text on the first and last slides.
- **Live system:** the workflow keeps running through 11–14 November, with schedule credentials refreshed just before; feeds and any board online; sandboxes awake; failed sources showing their errors, never cached data.

## Build plan to 17 November

**Inference:** a schedule that front-loads the risky parts and runs research alongside the build.

| When      | Goal                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 3 Nov     | Briefing done; send the organisers the account and licence questions; pick track, office, and problem; order any board by 4 Nov |
| 4 Nov     | Licence working; one thin slice live: real signal → connector → workflow run → action; recruit 6–8 interviewees                 |
| 5–6 Nov   | Two interview rounds and one timed observation; freeze problem and baseline; add the 3P connector and approval; start schedules |
| 7 Nov     | Score the agent on 30–50 real items; fix what the misses show                                                                   |
| 8 Nov     | README, deck, and diagram drafts; confirm every member has registered before registration closes that night                     |
| 9 Nov     | Feature freeze; record the video from the live system; test reviewer access with a non-team account; compress the deck          |
| 10 Nov    | Final submission by the leader early in the day, not at 11:59 PM                                                                |
| 11–14 Nov | Assessment: keep the workflow, feeds, and any board running; watch quotas; leave the repo's default branch untouched            |
| 15 Nov    | Top 5 announced; if selected, cut the pitch to the announced format                                                             |
| 16–17 Nov | Rehearse with one speaker; test the auditorium network and a phone hotspot; pitch live                                          |

## Strategic risks

The [brief's open questions](/docs/BRIEF.md#open-questions) list what the organisers haven't answered. Risks to plan around:

- **The official criteria may reweight everything above,** and the organisers may relax or confirm the Gemini Enterprise requirement. Re-read this page when either changes.
- **The licence arrives late or on the wrong terms:** consumer accounts break Workspace connectors, a free trial drops Antigravity, the custom MCP policy stays on, or reviewers' domains are blocked. Ask this week, and build the feeder and research in the meantime.
- **Unattended runs stall:** credentials expire 14 days after setup, actions wait in **Needs Review**, quota failures aren't retried, and a dormant ServiceNow instance fails its queries. Refresh credentials before 11 November and check runs daily.
- **Preview features change:** Supabase, Salesforce, Globalping, BigQuery federated query, and custom MCP are all preview; keep GA connectors on the critical path.
- **A public source fails during assessment:** the rule requires showing the error, so prefer documented sources. The APIMS endpoint is undocumented and could change without notice.
- **APU's content terms:** its Terms of Use reserve copyright; get written permission before ingesting its pages.
- **Devices can't join campus Wi-Fi:** use a phone hotspot; ask APU IT Helpdesk this week.
- **Stale tutorials** that use Agent Designer, 2025 product names, and retired free tiers.

## See also

- [Brief](/docs/BRIEF.md): the event's rules, dates, briefing, and open questions.
- [Gemini Enterprise]: workflows, triggers, quotas, reviewer access, Antigravity, connectors, freshness, actions, MCP, live-data paths, and sandboxes.
- [Google tools]: Google Cloud and AI products beyond Gemini Enterprise, quotas, prices, and the no-card path.
- [Past winners]: earlier and agent-hackathon winner profiles, patterns by NTT DATA's judging points, and crowding counts.
- [Competition](/docs/research/competition.md): what other teams will likely build and existing products that already do the job.
- [Judging and pitching]: comparable rubrics, user research, impact measurement, time to impact, packaging, the README, the video, and the pitch.
- [APU public documents]: APU's public documents, knowledge base, timetable feed, and systems.
- [Public data sources]: the live data catalogue per track.
- [IoT and network]: Google Cloud IoT architecture, sensors, boards, protocols, pitfalls, and what the team's phones and one Pi 5 can sense, run and serve unattended from a home.
- [Social research](/docs/research/social.md): pain points from X, Reddit, and other platforms.
- [Everyday signals](/docs/research/everyday.md): students' lives away from campus on Reddit, X and other platforms, and which phone and Pi tools people keep using.
- [Rules and guarantees](/docs/research/rules-and-guarantees.md): APU and provider rules and guarantees re-checked at their sources.

[brief]: /docs/BRIEF.md
[briefing]: /docs/sources/briefing-session/transcript.md
[past winners]: /docs/research/winners.md
[agent hackathon winners]: /docs/research/winners.md
[judging and pitching]: /docs/research/judging.md
[research and impact]: /docs/research/judging.md
[Gemini Enterprise]: /docs/research/gemini-enterprise.md
[Gemini Enterprise data]: /docs/research/gemini-enterprise.md#data-in-and-out
[APU public documents]: /docs/research/apu.md
[Google tools]: /docs/research/google-cloud.md
[IoT and network]: /docs/research/iot-and-network.md
[public data sources]: /docs/research/data-sources.md
