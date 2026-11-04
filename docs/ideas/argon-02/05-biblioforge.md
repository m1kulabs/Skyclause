# BiblioForge: intake-driven Koha and OpenAlex reading-list provisioner

BiblioForge is a Track 3 (Data-Driven Research & Intelligent Decision Making) workflow for APU Library (`LIB`), with Academic Administration (`AA`) as a second user. Each week a Raspberry Pi 5 (8 GB) joins APU's intake calendar, module demand from the APSpace timetable feed, copy counts from APU's Koha catalogue, and APU's open-access works in OpenAlex; a Gemini Enterprise workflow then drafts reading guides in Confluence Cloud, acquisition tickets in Jira Cloud, and procurement items in SharePoint for a librarian to approve.

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

APU runs a rolling intake calendar. The [intake calendar] page, fetched on 5 November 2026, lists these November starts: Fundamental Mathematics for Computing (FMFC) on 16 November; Foundation, Diploma, and APIIT Certificate on 19 November; an Intensive English Programme level on 23 November; Bachelor's Level 1 on 24 November; Bachelor's Level 3 and Engineering Level 4 entry on 26 November; and full-time Master's and DBA on 30 November. Later dates run to 27 August 2027, the last day of an English summer camp.

Students and staff name the calendar as a pain point. On platforms other than X and Reddit, "Timetable churn and a compressed calendar" ranks third, with frequency 3 and intensity 3 for a score of 9, the maximum, and the evidence is APU-specific ([theme ranking](/docs/research/social.md#other-platforms-theme-ranking)). Lecturers on [Jobstreet] wrote "non-stop intake throughout the year" (29 July 2022) and "Overlapping intake can be a problem" (23 May 2024) ([compressed calendar](/docs/research/social.md#timetable-churn-and-a-compressed-calendar)). The social research found no post about textbook or holding shortages at APU; its library posts are about seats, from X users not tied to APU ([seats, rooms, and parking](/docs/research/social.md#seats-rooms-and-parking)).

Three public sources hold the pieces, and nothing joins them:

- **Module demand:** the APSpace [timetable feed][tt] lists each class session with `INTAKE`, `GROUPING`, `MODID`, and `MODULE_NAME`. The 4 November 2026 copy held 31,606 rows for 26 October to 22 November 2026, covering 1,045 intakes and 857 module titles ([timetable row counts](/docs/research/apu.md#timetable-row-counts)).
- **Holdings:** the library runs a Koha catalogue ([systems APU runs](/docs/research/apu.md#systems-apu-runs)). The [OPAC][opac] web pages ask for a sign-in, but Koha's public REST API on the same host answered without one on 5 November 2026 and reported 40,839 publicly visible items ([verification notes](#verification-notes)).
- **APU research:** OpenAlex institution `I181397559` ([institution record][oa inst]). On 5 November 2026 the record listed 3,689 works and 45,087 citations, and the [works filter][oa works] returned 3,660 works: 700 from 2024, 570 from 2025, and 605 so far in 2026. Of these, 1,818 are open access, 885 of them from 2024–2026. Primary topics for 2024–2026 included Smart Agriculture and AI (58), Technology Adoption and User Behaviour (52), Artificial Intelligence in Healthcare (37), Diverse Aspects of Tourism Research (30), Environmental Sustainability in Business (25), and Network Security and Intrusion Detection (22).

**Inference:** when print copies are short for a large module, nothing points that module's students to open-access papers by APU authors.

[intake calendar]: https://www.apu.edu.my/intake-calendar
[Jobstreet]: https://my.jobstreet.com/companies/asia-pacific-university-168553381646759/reviews
[tt]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[opac]: https://opac.apu.edu.my/
[oa inst]: https://api.openalex.org/institutions/I181397559
[oa works]: https://api.openalex.org/works?filter=authorships.institutions.id:I181397559&group_by=publication_year

## Why existing tools miss it

- **The crowd:** in the repo's 780-idea simulation, library services drew 4 ideas (the "Absent" tier) and anything built on APSpace drew 3. Research trend and literature analytics drew 3.4%, typically on arXiv, Semantic Scholar, and Cloud SQL, and sits in the "Crowded" tier ([saturation tiers](/docs/research/competition.md#saturation-tiers), [clusters and shares](/docs/research/competition.md#clusters-and-shares)). **Inference:** none of these clusters joins timetable demand, holdings, and APU's own works.
- **Government statistics:** MOHE's higher-education statistics are aggregate PDFs with no APU rows, and data.gov.my's `lecturers_uni` covers public universities only ([MOHE statistics](/docs/research/data-sources.md#higher-education-statistics-mohe)). APU-level student analytics can't come from public tables, so BiblioForge works at module and institution level.
- **The library's own tools:** the Library (`LIB`) knowledge-base space had 65 public pages on 3 November 2026 (58 in a 5 November recount), covering hours, the Koha catalogue, e-databases, and borrowing ([knowledge base](/docs/research/apu.md#apu-knowledge-base-on-confluence)). One page (edited 25 December 2025) says WorldCat Discovery is the main search on the library website and in APSpace, that the library "is currently in a system transition phase", and that new print books may not appear there yet, so students should check the OPAC ([KB page][kb worldcat]). **Inference:** neither search knows which modules start with which intake.

[kb worldcat]: https://apiit.atlassian.net/wiki/spaces/LIB/pages/3640819734

## How it works

The team's off-campus Raspberry Pi 5 (8 GB) runs a weekly pipeline:

1.  **Module demand:** fetches the [timetable feed][tt] with `If-None-Match`, which returns `304` when the ETag hasn't moved ([change behaviour](/docs/research/apu.md#timetable-feed-change-behaviour)). It drops `LECTID`, `NAME`, and `SAMACCOUNTNAME` at ingest ([personal data](/docs/research/apu.md#personal-data-in-the-timetable-feed)), strips the section suffix from `MODID`, and counts distinct `INTAKE` and `GROUPING` pairs per module.
1.  **Intake dates:** parses the commencement dates from the [intake calendar] page.
1.  **Holdings:** queries Koha's public items endpoint on `opac.apu.edu.my` with a title filter for each module name and reads the copy count from the `X-Total-Count` header. The cohort-to-holding scarcity ratio is active `INTAKE` and `GROUPING` pairs divided by matching copies.
1.  **Open-access matches:** pages through APU's 2024–2026 open-access works in OpenAlex by filter (885 works on 5 November 2026, 100 per page) and matches them to module titles on the Pi. It skips the 2013–2014 arXiv silicon spin-qubit papers that the data catalogue flags as likely affiliation misattribution ([OpenAlex](/docs/research/data-sources.md#openalex)).
1.  **Rank:** sorts modules by scarcity ratio, attaches each one's open-access matches from 2024 onward, and writes the result to the `Module_Scarcity_and_OA_Matches` Google Sheet with each input's source URL, ETag where there is one, and fetch time.
1.  **History:** posts the same rows over HTTPS to Cloud Run in `asia-southeast1` (Singapore), then Pub/Sub and a BigQuery subscription, following the set's [shared edge path](00-ranking.md#shared-edge-and-network-design).

### Edge and network

- **Request pacing:** the Pi spaces requests to APU hosts 5 seconds apart. That pace is the team's choice: `opac.apu.edu.my/robots.txt` returns the sign-in page rather than a robots file, and `library.apu.edu.my/robots.txt` disallows only `/wp-admin/`; neither sets a `Crawl-delay`.
- **OpenAlex budget:** 10 requests a second without a key, and keyless requests share a $0.10 daily budget per IP address ([rate limits][oa limits]). Filter and `group_by` calls cost $0.0001 each and searches $0.001 ([OpenAlex](/docs/research/data-sources.md#openalex)), so the weekly run's 9 filter pages cost under $0.001.
- **Phone input:** a team phone opens an HTTPS page served from the Pi; camera access through [getUserMedia] needs HTTPS ([browser sensors](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser)). The page reads an ISBN barcode from a textbook or a printed reading list and sends it with a module code to the Pi, which returns the module's open-access matches and a holdings check. The scan saves typing ISBNs off campus; it is data entry, not sensing. On 5 November 2026 an ISBN filter on the Koha items endpoint returned `HTTP 500`, so the holdings half of a scan currently shows that error.

[oa limits]: https://developers.openalex.org/how-to-use-the-api/rate-limits-and-authentication
[getUserMedia]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

### Connectors

Type is 1P (first-party Google) or 3P (third-party). The workflow reads the Sheet; BigQuery holds history for the Gemini Enterprise assistant, because BigQuery isn't among the connectors workflows support ([workflows]).

| Connector                  | Type | Access                                                         | Actions                                                                             | Role                                                                                                    |
| -------------------------- | ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [BigQuery][ge bq]          | 1P   | Federated query (preview) from the assistant, not the workflow | SQL query through the BigQuery MCP server                                           | Answers staff questions over the weekly ranking history                                                 |
| [Google Drive and Sheets]  | 1P   | Actions                                                        | Get cell values, Update cell values                                                 | Gives the workflow the Pi's weekly ranking and records each review decision                             |
| [Confluence Cloud]         | 3P   | Federated search and actions                                   | Create page, Update page                                                            | Publishes Module Open-Access Companion Guides in a team-owned `LIB` space                               |
| [Jira Cloud]               | 3P   | Federated search and actions                                   | Create issue, Update issue, Create comment                                          | Opens acquisition requests for high-demand, low-copy modules before the 19 and 24 November 2026 intakes |
| [SharePoint] and [Outlook] | 3P   | Federated search and actions                                   | Create list item (SharePoint); Edit Excel data, Create message, Send mail (Outlook) | Adds acquisition priorities to a procurement list and emails the module leader                          |

APU's own Confluence, Jira Service Management, and Microsoft 365 need admin rights the team doesn't have, so the hackathon build writes to Confluence, Jira, and SharePoint sites the team owns; in the pilot, LIB connects APU's sites ([how each source reaches an agent](/docs/research/apu.md#how-each-source-reaches-an-agent)).

[ge bq]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[Google Drive and Sheets]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive
[Confluence Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud
[Jira Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[SharePoint]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint
[Outlook]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-outlook

## Day-to-day workflow

1.  **Trigger:** a Schedule trigger runs the workflow weekly on Mondays at 08:00 (Asia/Kuala_Lumpur), and each run picks the intakes that start 14 to 28 days later. A librarian can also start it with the Manual trigger by typing `@` and the workflow name in chat, with a module code as input ([workflows]).
1.  **Ranking:** an agent step reads the Pi's ranked rows from the `Module_Scarcity_and_OA_Matches` Sheet with `Get cell values` and drafts a guide, a ticket, and a procurement item for each top module.
1.  **Approval:** an Approval step pauses the run with **Needs Review** status ([HITL steps]). The reviewer, LIB's acquisitions librarian in the pilot and a team member in the hackathon build, sees the `MODID`, `MODULE_NAME`, active intake and group count, the next intake date (for example 19, 24, or 30 November 2026), the copy count with Koha links, and the matched papers, then approves or rejects the drafts.
1.  **Approved writes:** the workflow creates or updates each approved module's companion guide in Confluence, adds a SharePoint list item, opens a Jira acquisition issue, and sends an Outlook email; it records each decision in the Sheet with `Update cell values`. Connector writes from a workflow require human review in any case ([workflows]).
1.  **Failure behaviour:** each source fails on its own. If the timetable feed, intake calendar, Koha API, or OpenAlex returns an error, a rate limit, or an unparseable page, the Pi writes that source's error and request time into the affected Sheet rows and leaves their ratio blank, and the review shows those rows as errors. It doesn't reuse last week's counts or matches. A `304` from the timetable feed isn't a failure; it confirms the stored copy is current. Scheduled runs use the author's credentials, which expire every 14 days and need a manual refresh ([unattended runs](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in)).

[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps

## Baseline, metrics, and 3- and 6-month plan

- **Baseline:** not yet measured. The aim is to flag gaps 2 to 4 weeks before each commencement date; whether LIB now meets textbook shortages mid-semester is an assumption to check with LIB, along with how far ahead of an intake acquisitions start today.
- **Metrics:** lead time from flag to commencement date; precision of the open-access matches and accuracy of the title-based copy counts, each scored on 30–50 real `MODID` modules with the sample size stated ([what NTT DATA will rate](/docs/CONTEXT.md#what-ntt-data-said-it-will-rate)); and the number of 2024–2026 APU open-access works linked from guides.
- **3 months:** LIB runs pre-intake audits for the late-November 2026, December 2026, and January 2027 intakes (for example 1 December research degrees, 4 January FMFC, and 15 January part-time Master's) and publishes guides for the top 20 Computing and Engineering modules.
- **6 months:** coverage extends to every module in the timetable feed and the 138 courses on APU's site ([course pages](/docs/research/data-sources.md#apus-own-public-information)) ahead of the 25 February, 25 and 30 March, and 22 April 2027 intakes.

## Boundaries

- **Koha access:** the OPAC web pages are sign-in only, which suggests LIB means the catalogue for members. Ask LIB and the organisers for written permission before the demo depends on the public API. If they refuse, the holdings column says access isn't granted and no ratio is shown.
- **Timetable feed:** it is undocumented, unlicensed, and covered by APU's Terms of Use, so ask before a demo depends on it ([terms](/docs/research/apu.md#terms-of-use-and-robotstxt)). It covers a rolling three-to-four-week window of current classes, so a new intake appears only once its classes are scheduled. Cohort counts are intake and group codes, not student headcounts.
- **Title matching:** matching a module name against book titles misses books with other titles and catches unrelated ones, which is why copy-count accuracy is a measured metric.
- **OpenAlex:** metadata is CC0 ([about][oa about]). Guides link only to open-access URLs and never redistribute publisher PDFs. Affiliations can be wrong, as the arXiv caveat shows.
- **Personal data:** no student records, no lecturer names from the timetable feed, and no borrower data; the Koha items endpoint returns checkout dates but no patron fields. Module-leader email addresses come from LIB, not from the feed.

[oa about]: https://openalex.org/about

## Verification notes

"Run" means the Gemini Deep Research report this set is based on ([ranking](00-ranking.md)).

Checked on 5 November 2026 (MYT) against the intake calendar, the OpenAlex API, `opac.apu.edu.my` (web pages, `robots.txt`, and four REST API calls), `library.apu.edu.my/robots.txt`, three LIB knowledge-base pages, the Gemini Enterprise connector, workflow, and human-in-the-loop pages, and the repo research docs linked above.

- **Catalogue access:** the run said the Koha OPAC is publicly searchable without a login. Every OPAC page, search and `robots.txt` included, returns Koha's "Log in to your account" page (template `opac-auth.tt`), as did the Internet Archive's 5 October 2026 copy; `opac.apiit.edu.my` does the same. Koha's public REST API answered without login: `/api/v1/public/libraries`, `/api/v1/public/biblios/382063/items`, and `/api/v1/public/items` with a title filter (2 copies for "concurrent programming"; 40,839 visible items). The holdings step now uses that API.
- **ISBN lookup:** the run said a phone scan checks live OPAC availability. An ISBN filter on the items endpoint returned `HTTP 500` ("Something went wrong"), so the scan's holdings half shows that error.
- **Bachelor's date:** the run said Bachelor's degrees start on 26 November 2026. The calendar says Level 1 starts on 24 November; 26 November is Level 3 and Engineering Level 4 entry. The Jira and approval dates now read 19 and 24 November.
- **OpenAlex counts:** the run said 3,711 works by filter, 3,741 works and 41,527 citations on the record, 702, 574, and 606 by year, and 1,844 open access, which match the repo catalogue's 3 November figures. On 5 November the API returned 3,660, 3,689 and 45,087 (record updated 4 November), 700, 570, and 605, and 1,818. Tourism moved to 30 (now "Diverse Aspects of Tourism Research") and Environmental Sustainability in Business to 25.
- **arXiv caveat:** 17 APU works now carry an arXiv location (13 on 3 November); the two oldest, from 2013 and 2014, are the silicon device papers. The 2024–2026 window already excludes them.
- **Social evidence:** the run cited library and resource competition in peak weeks. The social research has no APU textbook or holdings complaint, and its library posts concern seats outside APU; dropped. The compressed-calendar ranking (Rank 3, score 9) is accurate.
- **Paper claims:** the run said "peer-reviewed papers authored by APU faculty". Open-access status doesn't imply peer review, and OpenAlex affiliation covers any APU-affiliated author; reworded.
- **Confluence actions:** the run listed `Search Confluence`. The connector page lists Create page and Update page (plus blog post, space, and attachment actions) and federated search, not a named search action.
- **Triggers:** the run fired the Manual trigger from a phone scan and scheduled a run 14 days before each commencement date. The workflows page defines Manual as a user typing `@` and the workflow name in chat, and Schedule as a frequency or cron expression. The Pi answers scans, and the weekly run picks intakes 14–28 days out.
- **Approval step:** the run used Request info for the publish decision. The HITL page defines Request info as asking the user questions and Approval as presenting outputs for sign-off; changed to Approval.
- **Course count:** the run said "138 APU course programmes"; the source counts 138 course pages in APU's sitemap.
- **Crawl rate:** the run's 1 request every 5 seconds comes from no robots rule; kept as the team's own limit.
- **BigQuery in the workflow:** the run had the workflow query BigQuery (federated) for the top modules and create the Sheet. The workflows page's supported connectors don't include BigQuery, so the Pi ranks the modules and writes the Sheet, the workflow reads it with `Get cell values`, and BigQuery keeps history for the assistant.
- **Transport:** the run's shared design sent readings over MQTT 5.0 or HTTPS to Cloud Run in `asia-southeast4`. This file follows the ranking's shared path: HTTPS to Cloud Run in `asia-southeast1`, Pub/Sub, and a BigQuery subscription.
- **Pilot permission:** the run planned a 3- and 6-month pilot with no dependency on APU staff. Holdings now come from Koha's public REST API, and only LIB can say whether the team may use it; no one has asked LIB or the organisers, and no permission has been given. The pilot can't start until LIB agrees.
- **KB page count:** the LIB space's 65 public pages are the repo's 3 November count; a 5 November recount gave 58.

Confirmed: the FMFC, Foundation and Diploma, IEP, Master's, and DBA dates and the 27 August 2027 end; OpenAlex's 10 requests a second without a key, the $0.10 keyless daily budget, and $0.0001 per filter call (`cost_usd` in each response); 4 of 780 library ideas and the 3.4% literature-analytics share; the MOHE and `lecturers_uni` limits; the Jira, Drive and Sheets, SharePoint, and Outlook actions; BigQuery federated query is in preview and uses the BigQuery MCP server.

Not verified: OpenAlex's CC0 terms (the about page didn't render to `curl`; taken from the repo catalogue); whether WorldCat Discovery shows APU holdings to guests; other ISBN filter forms on the Koha API; whether LIB means the public API to be open; the team's Microsoft 365 tenant; title-matching precision.

## See also

- [Argon-02 idea ranking](00-ranking.md)
- [APU's public documents, data, and systems](/docs/research/apu.md)
- [Public data sources](/docs/research/data-sources.md)
- [Competition](/docs/research/competition.md)
- [Social research](/docs/research/social.md)
- [Gemini Enterprise](/docs/research/gemini-enterprise.md)
- [IoT and network](/docs/research/iot-and-network.md)
- [Hackathon context](/docs/CONTEXT.md)
