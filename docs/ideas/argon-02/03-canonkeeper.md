# CanonKeeper: knowledge base drift auditor for APU's Confluence and live feeds

CanonKeeper is a scheduled Gemini Enterprise workflow for the owners of APU's IT Helpdesk (`ITSM`), Academic Administration (`AA`), and Logistics & Operations (`LNO`) knowledge base spaces, on Track 2, Intelligent Automation & Digital Transformation ([challenge tracks](/docs/BRIEF.md#challenge-tracks)). A Raspberry Pi 5 polls APU's live feeds and PDFs, compares their facts with the public pages of APU's Confluence knowledge base (KB), and stages redline page updates in Confluence Cloud, Jira Cloud, and SharePoint for a maintainer to approve. It's not a student Q&A chatbot; it fixes the pages a chatbot would read.

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

Students and staff report slow answers and scattered information:

- On the other platforms (Google Maps reviews, Lowyat.NET, and other review and social sites), "Admin replies and handoffs" ranks first, with a score of 9 of 9. About 37 of the 58 low-star [Google Maps reviews][apu google maps] mention admin, staff, replies, email, phone or management ([other platforms ranking], [admin replies]).
- On X, "Staff inboxes, tickets, and admin load" ranks second (score 9, not APU-specific): higher-ed staff describe repetitive email and users who don't read ([X ranking], [staff inboxes]).
- On Reddit, "APU bursary, admissions and residence replies" and "Information scattered for new and prospective students" both rank fourth (score 6) ([Reddit ranking]). One APU student opened an AMA because it "Was a bit hard for me to find info on APU right after I finished SPM" ([APU AMA]).

None of these posts names a stale KB page.

APU's KB, `kb.apu.edu.my`, redirects to the Confluence Cloud site `apiit.atlassian.net`. Its [REST API][kb spaces api] lists 28 spaces without credentials, and on 3 November 2026 an anonymous visitor could read 1,189 pages in 21 of them, 1,161 in the nine largest: ITSM 725, Programme Documentation (PD) 135, AA 103, Library (LIB) 65, Graduation (GRAD) 48, Accommodation (AC) 29, LNO 29, Visa and Immigration (VISA) 19, and Bursary (BUR) 8 ([APU KB]). Many pages were last edited in 2020–2023 ([APU KB]). Examples, with edit times from the API's `version.when` field on 5 November 2026:

- LNO's [RapidKL Bus & LRT][rapidkl page] page was last edited on 29 March 2021.
- ITSM's [MathWorks MATLAB][matlab page] guide tells students to launch "MATLAB R2020b"; it was last edited on 6 September 2021 (UTC).
- LIB's [library-hours page][lib hours page] was edited on 10 May 2024. Its weekday and Saturday hours still match the Library entry in `quix-customers`, so an old edit date isn't drift by itself.
- AA's [Student Handbook][handbook page] page attaches the APU Student Handbook PDF, whose footer reads "Version 8.0 - 20230701" ([APU documents]).
- Legacy pages on `kb.sites.apiit.edu.my` carry the banner "THIS PAGE IS RETIRED TO UPDATE THE CONTENT GO:" with a link into `apiit.atlassian.net` ([legacy KB page]).

APU's live feeds and media host carry the late-2026 facts:

- `api.apiit.edu.my/quix/get/file` with header `X-Filename: quix-customers` returns the opening hours and contacts of 9 departments, with `lastModified` 29 August 2026 inside the JSON ([feed endpoints]).
- `transix-v2/schedule/active` returns the shuttle set "WEF 22 Oct 2026" with 253 trips, matching the [Campus Connect shuttle schedule][shuttle pdf], effective 22 October 2026 ([feed endpoints]).
- The [Level 1 Orientation Guide][orientation guide] for November 2026 has 17 pages, was uploaded on 27 October 2026, and sets fees due by 16 November 2026 ([APU documents]).
- The [intake calendar] lists intakes through 27 August 2027.

**Inference:** a retrieval chatbot over the KB alone can return a 2021 page as the current answer.

[apu google maps]: https://www.google.com/maps/place/?q=place_id:ChIJ2SVQebtKzDERaKlLcSoYNxw
[other platforms ranking]: /docs/research/social.md#other-platforms-theme-ranking
[admin replies]: /docs/research/social.md#admin-replies-and-handoffs
[X ranking]: /docs/research/social.md#x-theme-ranking
[staff inboxes]: /docs/research/social.md#staff-inboxes-tickets-and-admin-load
[Reddit ranking]: /docs/research/social.md#reddit-theme-ranking
[APU AMA]: https://www.reddit.com/r/malaysiauni/comments/1puqcva/
[kb spaces api]: https://apiit.atlassian.net/wiki/rest/api/space?limit=100
[rapidkl page]: https://apiit.atlassian.net/wiki/spaces/LNO/pages/1199669249/RapidKL+Bus+LRT
[matlab page]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/988905517/MathWorks+MATLAB
[lib hours page]: https://apiit.atlassian.net/wiki/spaces/LIB/pages/539197469/What+is+the+library+operation+hours
[handbook page]: https://apiit.atlassian.net/wiki/spaces/AA/pages/1199570953
[legacy KB page]: https://kb.sites.apiit.edu.my/knowledge-base/tag/intake/
[shuttle pdf]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf

## Why existing tools miss it

- About 15 of the first 40 `campus gemini` repositories created from 20 October to 3 November 2026 are campus Q&A chatbots or document RAG assistants ([campus gemini search], [student builds]).
- A GitHub account named `Ntt-Data-Malaysia-AI-Platform`, whose READMEs say "delivered by NTT DATA" (ownership not verified), holds [APU-NTTDATA] (five persona assistants) and [APU-Operations-NttData] (department agents, including an Institutional Knowledge agent), both on sample data ([NTT DATA demos]).
- CanonKeeper doesn't answer students. It repairs the KB through the Confluence Cloud `Update page` and Jira Cloud `Create issue` actions ([Confluence connector], [Jira connector]).
- Visualping monitors a web page, or a section of one, and alerts on change ([Visualping]). changedetection.io also watches JSON APIs and PDF text and can summarise a diff with an LLM ([changedetection.io]). Each watch reports changes to its own URL. CanonKeeper checks whether a change in one source, such as a `quix-customers` update or a new PDF, contradicts a claim on a separate Confluence page.

[campus gemini search]: https://github.com/search?q=campus+gemini+created%3A%3E%3D2026-10-20&type=repositories
[student builds]: /docs/research/competition.md#what-other-students-built-in-the-same-weeks
[APU-NTTDATA]: https://github.com/Ntt-Data-Malaysia-AI-Platform/APU-NTTDATA
[APU-Operations-NttData]: https://github.com/Ntt-Data-Malaysia-AI-Platform/APU-Operations-NttData
[NTT DATA demos]: /docs/research/competition.md#demos-already-built-under-the-ntt-data-name
[Visualping]: https://cc.au.dk/en/cdmm/tools-and-tutorials/data-collection/visualping
[changedetection.io]: https://github.com/dgtlmoon/changedetection.io

## How it works

The Pi collects and matches changes off campus, and the team's phones are a planned second input; a scheduled workflow reviews the matches and stages fixes for approval.

### Edge and network

The team's own Raspberry Pi 5 (8 GB) runs a daily crawler off campus. It reads:

- JSON feeds: `quix-customers`, `transix-v2/schedule/active`, and `transix-v2/holiday/active` ([feed endpoints]).
- Drupal 10 pages on `www.apu.edu.my`: `intake-calendar`, `shuttle-services-campus-connect`, and `fees-refund-policy` ([APU documents], [refund policy]).
- PDFs on `publicwebsite-media.apu.edu.my` (Amazon S3), with text extracted locally by `pdftotext` ([how APU was checked]).
- The Confluence REST API on `apiit.atlassian.net/wiki`: page bodies and `version.when` edit times across the 21 spaces that had public pages on 3 November ([APU KB]).

S3 PDFs carry `Last-Modified` and `ETag` headers. `api.apiit.edu.my` sends neither, and Drupal's `Last-Modified` is the cache time, so the Pi hashes those response bodies and reads the `lastModified` field inside `quix-customers` ([feed endpoints], [how APU was checked]).

The Pi keeps an index of the public pages: page ID, space, title, edit date, and the entities extracted from each body (dates, RM amounts, URLs, software versions, opening hours). When a source changes, it matches the changed entities against the index and writes each match, with both sources' URLs and dates, to the `Canonical_Source_vs_KB_Diff` Google Sheet over HTTPS. It also posts every fetch result over HTTPS to Cloud Run in `asia-southeast1` (Singapore), then Pub/Sub and a BigQuery subscription, which keep the history ([shared network design]).

**Planned, not yet built or tested:** team smartphones would use the browser camera API ([`getUserMedia`][getUserMedia], which needs HTTPS and a permission prompt; [phone sensors]) to photograph printed handouts, orientation flyers, or screenshots of notices. Photos would be uploaded to Google Drive or OneDrive, where a Gemini agent step would extract dates, fees, and contact hours and check whether they match the late-2026 feeds or a stale Confluence page.

[shared network design]: 00-ranking.md#shared-edge-and-network-design
[getUserMedia]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
[refund policy]: https://www.apu.edu.my/fees-refund-policy
[how APU was checked]: /docs/research/apu.md#how-this-was-checked
[phone sensors]: /docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser

### Connectors

Type is 1P (first-party Google) or 3P (third-party).

| Connector                                | Type | Access                                             | Actions                                                                          | Role                                                                                                                |
| ---------------------------------------- | ---- | -------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [Confluence Cloud][Confluence connector] | 3P   | Ingestion or federated, plus actions               | `Create page`, `Update page`, `Upload attachment`; data store search             | Searches the team's mirror of the public spaces (ITSM, AA, LNO, LIB, AC, VISA, BUR, GRAD) and writes approved edits |
| [Jira Cloud][Jira connector]             | 3P   | Federated, plus actions                            | `Create issue`, `Update issue`, `Assign issue`, `Link issues`                    | Files a drift ticket assigned to the owning space admin (ITSM, AA, or LNO)                                          |
| [SharePoint]                             | 3P   | Federated, plus actions                            | `Upload document`, `Update page`, `Create list item`                             | Mirrors approved policy updates and holds the audit ledger                                                          |
| [OneDrive], [Outlook]                    | 3P   | Federated, plus actions                            | OneDrive `Upload file`; Outlook `Edit Excel data`, `Create message`, `Send mail` | Logs drift counts in the Microsoft 365 governance workbook and notifies department owners                           |
| [Google Drive]                           | 1P   | Federated, plus actions                            | `Get cell values`, `Update cell values`, `Read document`                         | Holds the Pi's daily `Canonical_Source_vs_KB_Diff` Sheet, which the workflow reads with `Get cell values`           |
| [BigQuery]                               | 1P   | Federated query (preview), from the assistant only | SQL through the BigQuery MCP server                                              | Stores fetch history and match results for analysis in the Gemini Enterprise assistant; not a workflow step         |

Workflows support Drive, Confluence, Jira, OneDrive, Outlook, and SharePoint among their connectors, but not BigQuery, so no workflow step queries BigQuery ([workflows]).

The Confluence data store doesn't support spaces shared through anonymous access, guest links, or public URLs, and its setup needs Confluence organization admin access and an OAuth 2.0 app ([Confluence connector], [Confluence setup]). The team isn't APU's admin, so CanonKeeper mirrors the public spaces into a Confluence Cloud site the team owns, fetched by REST as [APU's source routes][source routes] suggest.

[SharePoint]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint
[OneDrive]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-onedrive
[Outlook]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-outlook
[Google Drive]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive
[BigQuery]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/connect-bigquery
[Confluence setup]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud/third-party-config
[source routes]: /docs/research/apu.md#how-each-source-reaches-an-agent

## Day-to-day workflow

1.  **Trigger:** a Gemini Enterprise Schedule trigger runs daily at 06:00 MYT, or a team member starts a Manual trigger (`@CanonKeeper`) after uploading a phone capture of a printed or social-media notice, once that planned path is built ([workflows], [triggers]).
1.  **Compare:** the workflow reads the Pi's matches from the `Canonical_Source_vs_KB_Diff` Sheet with `Get cell values` and searches the team's Confluence mirror for each matched page to confirm its current text. Typical entities are the 9 department schedules in `quix-customers`, the monthly shuttle passes of RM70, RM75, RM100 and RM140 on the [shuttle services page][shuttle page], or the setup dates in the orientation guide.
1.  **Human approval:** an Approval step ([HITL steps]) shows the knowledge base maintainer the canonical source URL and its date (for example 29 August 2026 or 27 October 2026), the stale page's URL and date (for example 29 March 2021, or the handbook's 1 July 2023), and the redline replacement text with a `[Verified against live feed: <date>]` provenance banner. Workflow writes through connectors require human review in any case ([workflows]).
1.  **Approved writes:** the workflow runs `Update page` on the team's Confluence mirror, creates a linked Jira Cloud ticket, and adds a `Create list item` row to the SharePoint governance list.
1.  **Failure behaviour:** when a feed, PDF, or the Confluence API returns an error, times out, or doesn't parse, the Pi writes that source's error and HTTP status to the Sheet in place of a value. The review shows the error, and CanonKeeper proposes no edit from that source until a fetch succeeds; there is no cached copy or default value. Schedules run on the author's credentials, which expire every 14 days and must be refreshed by hand ([unattended runs]).

[shuttle page]: https://www.apu.edu.my/shuttle-services-campus-connect
[triggers]: /docs/research/gemini-enterprise.md#triggers-and-schedules
[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps
[unattended runs]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in

## Baseline, metrics, and 3- and 6-month plan

- **Baseline:** maintainers check the 1,189 public pages (21 spaces, on 3 November 2026) by hand, and pages last edited in 2020–2023 stay live beside 2026 policies ([APU KB]). No timed manual audit exists yet.
- **With CanonKeeper:** every public page is checked against the JSON feeds and PDFs, and each mismatch (date, RM amount, URL, software version, opening hours) is shown with both sources' timestamps.
- **Metric:** precision and recall on a set of 30–50 real KB-to-feed entity pairs across ITSM, AA, LNO, LIB, AC, VISA, and BUR, reported with the sample size ([judging points]).
- **3 months:** a pilot on LNO (29 pages on 3 November), AC (29), VISA (19), and BUR (8), covering the November 2026 and February 2027 intakes ([intake calendar]).
- **6 months:** coverage extends to AA (103 pages on 3 November) and ITSM (725), and every public page carries an automated verification date ([APU KB]).

[judging points]: /docs/CONTEXT.md#what-ntt-data-said-it-will-rate

## Boundaries

- The orientation guide's default-password page (page 5, which prints the temporary-password pattern) stays out of ingestion and prompts ([APU documents], [APU systems context]).
- APU's [Terms of Use][terms] reserve copyright and ask for permission before "use of this Website or any of the Contents" ([terms section]). The team asks the organisers in `#help-desk` for written permission, which covers the Confluence mirror, and stores every document's source URL and fetch time ([APU systems context]).
- `Update page` and `Create issue` run only on the team's own Atlassian Cloud and Microsoft 365 tenants, never on APU's KB or helpdesk ([Confluence connector], [Confluence setup]).

[terms]: https://www.apu.edu.my/terms-of-use
[terms section]: /docs/research/apu.md#terms-of-use-and-robotstxt
[APU systems context]: /docs/CONTEXT.md#apus-own-documents-and-systems

## Verification notes

"Run" means the Gemini Deep Research report this set is based on ([ranking](00-ranking.md)).

Checked on 5 November 2026 (MYT) against the Confluence REST API (`/space`, `/content/<id>?expand=version`, CQL `/search`), the `quix-customers` and `transix-v2/schedule/active` endpoints, `HEAD` requests on the two S3 PDFs, a download of the orientation guide (`pdfinfo`, `pdftotext`), the intake calendar, shuttle services, terms of use and legacy KB pages, the Gemini Enterprise connector and Workflow Builder pages, the changedetection.io README, and the repo's research docs.

Confirmed: 28 spaces; RapidKL page edited 29 March 2021; "MATLAB R2020b" on the MATLAB page (its last edit, 6 September 2021 UTC, is added); library-hours page edited 10 May 2024; the retired-page banner; 9 departments in `quix-customers`; shuttle set "WEF 22 Oct 2026" with 253 trips; orientation guide 17 pages, `Last-Modified` 27 October 2026, fees due by 16 November 2026, temporary password on page 5; latest intake 27 August 2027; passes RM70, RM75, RM100 and RM140; the Jira Cloud, SharePoint, OneDrive, Outlook and Drive actions listed; BigQuery federated query (preview) through the BigQuery MCP server; Schedule and Manual triggers; the Terms of Use quotes.

Corrections:

- **Page counts:** the run gave 1,189 pages and the per-space counts as current. They are the 3 November 2026 count ([APU KB]); a CQL re-count on 5 November returned 1,017 pages (ITSM 621, PD 128, AA 92, LIB 58, AC 29, LNO 26, VISA 19, BUR 8, GRAD 7). This file keeps the dated 3 November figures.
- **Change dates:** the run said the Pi reads `Last-Modified` and `ETag` headers and the reviewer sees a `Last-Modified` date of 29 August 2026. `api.apiit.edu.my` sends no `ETag` or `Last-Modified`, and Drupal's `Last-Modified` is the cache time ([feed endpoints], [how APU was checked]); 29 August 2026 is the `lastModified` field inside the `quix-customers` JSON (`2026-08-29 18:53:34+00:00`).
- **Library hours:** the run listed the 10 May 2024 library-hours page as drift. Its hours (Monday–Friday 8:30 a.m.–7:00 p.m., Saturday 9:00 a.m.–1:00 p.m.) match the Library entry in `quix-customers`; the file now says an old edit date isn't drift by itself.
- **Social evidence:** the run said staff field repetitive enquiries "because students encounter outdated or conflicting procedures". [Social research](/docs/research/social.md) shows repetitive email and scattered information but no post blaming stale KB pages, so the causal claim is dropped. The run called the two Reddit themes primary; they rank fourth (score 6). "Admin replies and handoffs" ranks first alone; ranks 2 and 3 share its score of 9.
- **Competition:** the run said "15 of the first 40" repositories; the source says "about 15". The run said NTT DATA built the two demos as departmental Q&A bots; the account's READMEs say "delivered by NTT DATA", its ownership is not verified, and the demos are persona assistants and department agents on sample data ([NTT DATA demos]).
- **Change monitors:** the run said Visualping and changedetection.io "only flag DOM or pixel changes on a single URL". Visualping monitors whole pages or sections ([Visualping]); the changedetection.io README lists JSON API monitoring, PDF text changes, and LLM change summaries ([changedetection.io]). The file cites the README instead of a starred-repository list.
- **Confluence actions:** the run listed `Search Confluence (CQL)` as an action. The connector page lists `Create page`, `Update page`, `Create blog post`, `Create space`, `Download attachment`, and `Upload attachment`, plus unnamed read-only actions, and supports federated search as well as ingestion ([Confluence connector]). The anonymous, guest-link, and public-URL limitation is listed for the ingestion data store.
- **Confluence setup:** the run said the connector "requires OAuth admin access on a workspace the team owns". The setup page needs Confluence organization admin access, an OAuth 2.0 (3LO) app, and the Discovery Engine Editor role ([Confluence setup]); "team-owned" follows because the team isn't APU's admin.
- **Microsoft actions:** the run gave `Edit Excel data`, `Create message`, and `Send mail` under OneDrive and Outlook together. All three are Outlook connector actions (`Create message` creates a draft); OneDrive supplies `Upload file` ([Outlook], [OneDrive]).
- **Review step:** the run used a `Request info` step as its mandatory human review before writes. The HITL page says Request info asks the user questions and Approval presents outputs for sign-off ([HITL steps]); the file uses Approval and cites the workflow page's rule that connector writes need human review ([workflows]).
- **BigQuery:** the run had the workflow query BigQuery for a metadata index of the KB pages. The workflows page's supported connectors don't include BigQuery ([workflows]), so the Pi keeps the index and writes its matches to the Sheet, and BigQuery holds history for the assistant.
- **Phone capture:** the run described it as part of the working design. It isn't built, so the file marks it planned and untested.
- **Pilot timing:** the run said the pilot runs "ahead of" the November 2026 intake. Course pages list a 24 November 2026 intake ([APU automation documents]), a week after the 17 November final, so the plan says "covering".

Not verified: why the 5 November page count is lower than the 3 November count (pages restricted or removed, or a different counting method); the handbook PDF footer (taken from [APU documents], not re-read); whether the Approval step behaves as documented in scheduled runs; Microsoft 365 and Atlassian connectors on team-owned tenants; `pdftotext` on the Pi itself; and the phone-capture extraction, which hasn't been built.

[APU automation documents]: /docs/research/apu.md#intelligent-automation--digital-transformation

## See also

- [Argon-02 idea ranking](00-ranking.md)
- [APU's public documents, data, and systems](/docs/research/apu.md)
- [Social research](/docs/research/social.md)
- [Competition](/docs/research/competition.md)
- [Gemini Enterprise](/docs/research/gemini-enterprise.md)
- [Hackathon context](/docs/CONTEXT.md)

[APU KB]: /docs/research/apu.md#apu-knowledge-base-on-confluence
[feed endpoints]: /docs/research/apu.md#timetable-feed-endpoints
[APU documents]: /docs/research/apu.md#smart-campus--student-experience
[orientation guide]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Nov_Level%201%20Orientation%20Guide.pdf
[intake calendar]: https://www.apu.edu.my/intake-calendar
[Confluence connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud
[Jira connector]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
