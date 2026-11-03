# Argon idea ranking

Five product ideas for the APU Cloud Innovation Hackathon 2026, scored out of 100 on a rubric built from NTT DATA's five briefing points and the Google and APU rubrics. Each one is a Gemini Enterprise workflow that starts on a schedule or a connector event, works through first-party (1P) and third-party (3P) connectors, and stops for one human approval before it writes anything; all but Research & FYP Nexus act on live network or sensor readings. Chat-style campus assistants are left out because APU already runs one, and the category is crowded on Devpost. SpineDesk Pulse ranks first.

Contents:

1.  [Ranking](#ranking)
2.  [Scoring rubric](#scoring-rubric)
    1.  [Where the rubric comes from](#where-the-rubric-comes-from)
    2.  [Rubric components](#rubric-components)
3.  [APU problem evidence](#apu-problem-evidence)
    1.  [Classroom Wi-Fi and A/V drops](#classroom-wi-fi-and-av-drops)
    2.  [Shuttle crowding, rain, and attendance](#shuttle-crowding-rain-and-attendance)
    3.  [Timetable gaps and room comfort](#timetable-gaps-and-room-comfort)
    4.  [Final year project supervision](#final-year-project-supervision)
    5.  [AIDA already covers campus Q&A](#aida-already-covers-campus-qa)
4.  [Ideation rounds](#ideation-rounds)
    1.  [Round 1: crowding and feasibility filter](#round-1-crowding-and-feasibility-filter)
    2.  [Round 2: live data and theme test](#round-2-live-data-and-theme-test)
    3.  [Round 3: scoring the finalists](#round-3-scoring-the-finalists)
5.  [Why SpineDesk Pulse ranks first](#why-spinedesk-pulse-ranks-first)
6.  [Evidence limits](#evidence-limits)
7.  [See also](#see-also)

## Ranking

| #   | Idea                                                           | Track                  | C1   | C2   | C3   | C4   | C5  | C6  | C7  | C8  | Total |
| --- | -------------------------------------------------------------- | ---------------------- | ---- | ---- | ---- | ---- | --- | --- | --- | --- | ----- |
| 1   | [SpineDesk Pulse](01-spinedesk-pulse.md)                       | Intelligent Automation | 19.5 | 19.5 | 14.5 | 15.0 | 9.5 | 9.5 | 5.0 | 5.0 | 97.5  |
| 2   | [Kuyoh Shuttle Sentinel](02-kuyoh-shuttle-sentinel.md)         | Intelligent Automation | 19.0 | 18.5 | 14.5 | 14.0 | 9.0 | 9.0 | 4.5 | 5.0 | 93.5  |
| 3   | [Timetable & HVAC Reconciler](03-timetable-hvac-reconciler.md) | Intelligent Automation | 18.0 | 18.0 | 14.0 | 12.5 | 7.5 | 8.5 | 4.5 | 5.0 | 88.0  |
| 4   | [Research & FYP Nexus](04-research-fyp-nexus.md)               | Data-Driven Research   | 17.5 | 17.5 | 13.0 | 11.0 | 9.0 | 9.0 | 4.5 | 5.0 | 86.5  |
| 5   | [OnBoard Airtime Guard](05-onboard-airtime-guard.md)           | Smart Campus           | 16.5 | 16.5 | 12.5 | 14.5 | 9.5 | 8.0 | 3.5 | 5.0 | 86.0  |

1.  **SpineDesk Pulse:** for TechCentre. Classroom phones and laptops work as Wi-Fi and A/V probes, and the workflow drafts urgent Jira Cloud and ServiceNow tickets before a lecture stalls.
2.  **Kuyoh Shuttle Sentinel:** for Logistics & Operations and Academic Administration. It combines Rapid Bus KL T580 GPS, the Sungai Kuyoh river gauge at LRT Bukit Jalil, and MET Malaysia warnings, then drafts shuttle advisories and a proposed 15-minute attendance grace window.
3.  **Timetable & HVAC Reconciler:** for Academic Administration and Facilities. It audits each week's published intake timetables for long gaps, physical and online mix-ups, and group-prefix breaks, and flags rooms that are booked but empty.
4.  **Research & FYP Nexus:** for the School of Technology FYP committee. It matches final-year proposals to APU lecturers by their 3.7k OpenAlex works and flags overlapping or outdated topics.
5.  **OnBoard Airtime Guard:** for students and CTI. Crowd-sensed Wi-Fi throughput and noise readings point study groups to vacant rooms that are quiet and have fast Wi-Fi.

## Scoring rubric

### Where the rubric comes from

The website says the judging criteria "will be released soon", and none had been posted by 3 November ([brief]). The rubric combines three lenses:

- **NTT DATA's five points:** at the briefing, NTT DATA Forward Deployed Engineer Deepanraj Vellingiri said an NTT DATA team will rate impact, the technical build (mainly the 1P and 3P connectors, with MCP as an add-on), research, time to impact over three or six months, and how automated workflows run day to day ([context]).
- **APU School of Technology:** its staff teach a Coral Edge TPU to Vertex AI pipeline, so they will expect a real IoT layer and privacy-conscious edge processing ([context]).
- **Google student programmes:** KitaHack and the Solution Challenge reward a working prototype over a mockup, real-user feedback, and responsible data use ([judging and pitching]).

[brief]: /docs/BRIEF.md#judging-and-prizes
[context]: /docs/CONTEXT.md#what-the-judges-will-reward
[judging and pitching]: /docs/research/judging-and-pitching.md

### Rubric components

| ID  | Component                    | Points | Full marks                                                                                                                            | Loses marks                                                                   |
| --- | ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | Impact and measured outcome  | 20     | A named APU office, its real volume, a timed baseline, and precision and recall on 30–50 real items                                   | "All students"; a guessed accuracy figure; no baseline                        |
| C2  | 1P and 3P connectors, MCP    | 20     | GA Google Workspace connectors plus GA 3P connectors such as Jira Cloud, ServiceNow, and SharePoint, with live actions; MCP as add-on | Chat only; ingested index copies for live values                              |
| C3  | Day-to-day workflow          | 15     | Starts on a schedule or connector event, reads an editable rulebook, stops for one approval before writes                             | Needs a typed prompt; writes without review                                   |
| C4  | Cloud, IoT, and network      | 15     | Live edge signals with the network visible per reading: RTT, jitter, failures, device-to-row latency, offline buffering               | Invisible network; mocked sensor data; a board blocked by OnBoard@APU sign-up |
| C5  | Problem research             | 10     | Verified posts, APU knowledge base (KB) pages, 6–8 interviews in two rounds, and one timed observation                                | Opinion questions; no quotes; claims the sources don't support                |
| C6  | Time to impact               | 10     | A dated 3- and 6-month plan tied to intakes, a named owner, and an agreed precision and recall gate                                   | Needs changes to APU's private systems before a pilot                         |
| C7  | Differentiation              | 5      | A thin Devpost niche; no overlap with AIDA or the briefing's four examples                                                            | Rebuilds AIDA; AI tutor, mental health, or face-recognition attendance        |
| C8  | Responsible AI and real data | 5      | Live public APIs or team-captured readings only; source errors shown; no biometric data; no personal data in free-tier prompts        | Mock, seed, or cached fallback data; face recognition                         |

## APU problem evidence

Posts on r/malaysiauni, r/malaysia, r/KualaLumpur, and r/sysadmin were checked against APU's public KB on `apiit.atlassian.net`, which holds 1,189 pages readable without login, 725 of them IT helpdesk articles ([APU public documents]).

[APU public documents]: /docs/research/apu-public-documents.md

### Classroom Wi-Fi and A/V drops

- Students lose signal "around the cafeteria when there's a lot of people and near any of the stairs" on Wi-Fi 6 and 6E devices, a commenter says "The traffic is so congested they need more APs", and lecturers joke "top 1 technology uni but wifi is so bad" ([wifi thread]).
- APU's KB explains why: Wi-Fi is "a shared (and half-duplex) medium", Teams traffic can push airtime to "100% utilization", and "only one device in a room or classroom needs to be connected" to a Teams call ([KB Teams Wi-Fi]).
- APU's SLA lists "Classroom teaching and learning (during session) including Wi-Fi connection, A/V, and streaming issues" as urgent, answered immediately during office hours "with the consideration of onsite assistance travel time" ([KB SLA]).

[wifi thread]: https://www.reddit.com/r/malaysiauni/comments/1thgkyj/
[KB Teams Wi-Fi]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2291695772

### Shuttle crowding, rain, and attendance

- APU's shuttle schedule, effective 22 October 2026, says "When the bus is full, it will depart" and that "during peak times and unusual traffic patterns, the buses may not be able to arrive or depart following the published schedules" ([shuttle schedule]).
- A commenter warns that "morning might have a lot of people", so students due on campus at 9 should leave early ([orientation thread]).
- Events jam the area: "Bukit jalil can get severely crowded if there's football match or concert at bukit jalil stadium or axiata arena" ([crowded stations thread]), and "November is usually rainy season" ([concert thread]).
- Students say APU requires 80% attendance per module ([attendance worry thread]). For a student on 79%, a commenter explains the rule exists "so that you are not to be barred from the final exam of the course", and another says the shortfall affected their visa status ([79% thread]).

[shuttle schedule]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf
[orientation thread]: https://www.reddit.com/r/malaysiauni/comments/1souu9p/
[crowded stations thread]: https://www.reddit.com/r/malaysia/comments/12agyxn/
[concert thread]: https://www.reddit.com/r/KualaLumpur/comments/1dn5in8/
[79% thread]: https://www.reddit.com/r/malaysiauni/comments/1rlbahv/

### Timetable gaps and room comfort

- "APU's timetable system are automated by an internal AI-algorithm with no proper supervision. The catch is, the AI-algorithm doesn't work well all the time" ([timetable algorithm thread]).
- A student describes "class A starts at 8am, class B starts at 4pm and they dont do online classes" ([cashgrab thread]); another skipped a class "due to physical and online confusion" ([attendance worry thread]).
- When APU renamed tutorial groups from T1 to G1, cached selections broke students' timetable views until they switched intakes or cleared the app cache ([KB timetable prefix]).
- Room comfort evidence is mixed: one visitor found room B-06-07 "sooo cold" ([one sem thread]), another claims the air conditioning is switched off except on open day ([campus life thread]), and the canteen air "feels humid" ([cashgrab thread]).

[timetable algorithm thread]: https://www.reddit.com/r/malaysiauni/comments/16ml7by/
[one sem thread]: https://www.reddit.com/r/malaysiauni/comments/1nsp664/
[campus life thread]: https://www.reddit.com/r/malaysiauni/comments/1afogdy/
[cashgrab thread]: https://www.reddit.com/r/malaysiauni/comments/1sufodw/
[KB timetable prefix]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/801013944

### Final year project supervision

- A student's mentor "doesn't know what general IT requirements are for FYP", and a reply advises contacting "lecturers or researchers in your faculty that are undergoing research" for a title ([FYP struggles thread]).
- The final year project is an MQA requirement for a bachelor's degree, and external marking can push graduation from finals in March to a ceremony in November ([FYP mandatory thread]).
- On a 194-point post, a Software Engineering student says "the syllabus like no update", and a diploma intern found the internship slides were "literally from 2024" ([do not come thread]).

[FYP struggles thread]: https://www.reddit.com/r/malaysiauni/comments/1v6s3e6/
[FYP mandatory thread]: https://www.reddit.com/r/malaysiauni/comments/1ib4taf/
[do not come thread]: https://www.reddit.com/r/malaysiauni/comments/1wt49ge/

### AIDA already covers campus Q&A

APU's Digital Solutions Team (CTI) runs AIDA, a chat assistant inside APSpace and at `aida.apu.edu.my` that answers from APU's KB with cited sources, looks up a weekly timetable by intake code, and covers campus navigation and shuttle routes ([KB AIDA]). It's a question-and-answer tool: it doesn't read live sensor or network data, run on a schedule, or write to Jira, ServiceNow, or Google Workspace. Any student chatbot, navigation app, or FAQ bot would compete with it.

[KB AIDA]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/3791422495

## Ideation rounds

### Round 1: crowding and feasibility filter

Twenty concepts came from the problem statements, the briefing, and the evidence above. Twelve were dropped using Devpost project counts from 3 November ([past winners]), AIDA's features, the 2024 PDPA amendment, and hardware limits:

1.  **Already in AIDA and crowded:** campus navigation map (`campus map` 2,506, `campus navigation` 974), student onboarding chatbot (`university chatbot` 1,026), IT and bursary FAQ bot, and static shuttle timetable bot.
2.  **The briefing's own examples**, which every team heard: admissions missing-file checker, scholarship eligibility agent, study planner (`AI tutor` 4,464, `learning companion` 6,753), and GitHub trend watcher ([context crowding]).
3.  **Sensitive data and crowding:** face-recognition attendance (`attendance tracking` 736, `attendance face recognition` 287; GDGoC APU taught it with YOLO in March 2025; the 2024 PDPA amendment makes biometric data sensitive), and a mental health companion (`mental health` 13,678).
4.  **Hardware and private data:** a LoRaWAN campus sensor mesh (1 of 96 mapped gateways near Kuala Lumpur was online, and a gateway costs about RM1,000 ([IoT and network])), and a GPA dropout predictor, which needs private student records.

[past winners]: /docs/research/past-winners.md
[context crowding]: /docs/CONTEXT.md#crowded-and-open-ground

### Round 2: live data and theme test

Eight concepts faced three tests from the Gemini Enterprise and IoT research ([Gemini Enterprise data], [IoT and network]):

1.  **No ingestion lag:** third-party index copies lag by at least 3 hours and Cloud Storage by 1 day, and both keep serving old data when a source fails. Live readings must land in a Sheet read through Drive and Sheets actions, a BigQuery federated query, or a custom MCP server.
2.  **Visible network:** reviewers on 11–14 November must see per-reading latency, device-to-cloud timestamps, and readings buffered offline arriving on reconnect.
3.  **Loud failure:** a failed source shows its error, with no mock or cached fallback ([project conventions]).

Three were dropped: a prepaid residence meter top-up (needs private payment access), a cafeteria food-waste camera (`food waste` 5,171 on Devpost, weak 3P connector fit), and a VirtualLab licence optimiser (no public telemetry).

[Gemini Enterprise data]: /docs/research/gemini-enterprise-data.md
[project conventions]: /docs/references/project-conventions.md

### Round 3: scoring the finalists

The five survivors were scored on C1–C8, giving the [ranking](#ranking). C5 reflects a check of every cited post and KB page on 3 November 2026: Kuyoh Shuttle Sentinel loses a point because no cited post shows standing-room-only buses or flooding on the corridor, and Timetable & HVAC Reconciler loses two because no post shows air conditioning running in empty rooms.

## Why SpineDesk Pulse ranks first

- **Full theme marks:** the network is both the sensor and the problem, so Cloud, IoT, and network meet in one workflow.
- **Strong connector story:** GA Drive and Sheets, Gmail, Google Calendar, Jira Cloud, ServiceNow, and SharePoint carry the critical path; Globalping and the custom MCP server are preview add-ons.
- **A written owner and rule:** TechCentre already treats in-class Wi-Fi and A/V faults as urgent under a published SLA ([KB SLA]), so the workflow automates a promise APU has made.
- **No hardware risk:** phones and laptops are the probes, so OnBoard@APU sign-up doesn't block anything.

If the team prefers outdoor transit data that daily commuters feel, Kuyoh Shuttle Sentinel (93.5) is the alternative, built on keyless government feeds from `api.data.gov.my` and Public Infobanjir ([public data sources]).

## Evidence limits

- **No measured baselines yet:** every time saving in these docs needs the timed observation on 5 November; none is assumed.
- **Thin posts on some claims:** the shuttle threads show crowding and early starts, not exact arrival times, and nothing in them shows corridor flooding. The Sungai Kuyoh gauge read 26.37 m on 3 November, below its 28.00 m Normal level ([public data sources]).
- **Room comfort is contested:** the posts disagree on air conditioning, so the HVAC half of idea 3 needs room checks before it goes in a pitch.

## See also

- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
- [Agent hackathon winners](/docs/research/agent-hackathon-winners.md) and [past winners](/docs/research/past-winners.md)
- [Gemini Enterprise data](/docs/research/gemini-enterprise-data.md) and [IoT and network](/docs/research/iot-and-network.md)
- [APU public documents](/docs/research/apu-public-documents.md) and [public data sources](/docs/research/public-data-sources.md)
- [Research and impact](/docs/research/research-and-impact.md)

[KB SLA]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/491356161
[attendance worry thread]: https://www.reddit.com/r/malaysiauni/comments/1vctvfq/
[IoT and network]: /docs/research/iot-and-network.md
[public data sources]: /docs/research/public-data-sources.md
