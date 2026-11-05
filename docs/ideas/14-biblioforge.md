# BiblioForge

BiblioForge tells APU Library (`LIB`) which large modules in APU's public timetable have few or no matching print copies in its Koha catalogue, whether those copies are already out on loan, and which open-access papers by APU-affiliated authors could go in a module guide, two to four weeks before each intake starts. A Raspberry Pi 5 joins four public sources every morning, and a Gemini Enterprise workflow drafts a Confluence guide and a Jira acquisition request for each flagged module, which one person approves. Proposed track: **Data-Driven Research & Intelligent Decision Making**. Caveat: no source shows a textbook shortage at APU, Koha's own public API shows only 106 of 40,839 items on loan, LIB hasn't been asked, and nothing has been built or run; **Inference** marks conclusions no source states.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Origins](#origins)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Signal to cloud path](#signal-to-cloud-path)
    1.  [Workflow and rule set](#workflow-and-rule-set)
    1.  [States and failure handling](#states-and-failure-handling)
    1.  [Connectors and platform check](#connectors-and-platform-check)
    1.  [Cloud, IoT and network](#cloud-iot-and-network)
    1.  [Real data and privacy](#real-data-and-privacy)
1.  [Why people will use it](#why-people-will-use-it)
1.  [Why the crowd won't build it](#why-the-crowd-wont-build-it)
1.  [Off-campus fit](#off-campus-fit)
1.  [Scores](#scores)
1.  [Research plan](#research-plan)
1.  [Time to impact](#time-to-impact)
1.  [Demo and review](#demo-and-review)
1.  [Build plan](#build-plan)
1.  [Risks and kill criteria](#risks-and-kill-criteria)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## At a glance

| Field                 | Plan                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                 | The team (one builder approves) until LIB's acquisitions librarian takes the approval seat. Nobody at LIB has been asked.                                                                            |
| First users           | LIB staff deciding what to buy or point students to before an intake; students in the largest modules who read the guides. Neither group is engaged yet.                                             |
| Track                 | Data-Driven Research & Intelligent Decision Making.                                                                                                                                                  |
| Trigger               | Gemini Enterprise Schedule trigger, daily at 08:00 MYT; Manual trigger (`@BiblioForge` with a module code).                                                                                          |
| Live signal           | APSpace timetable feed (ETag, `304` when unchanged), APU's intake calendar page, Koha's public REST API (copies and due dates), and the OpenAlex API. No sensor.                                     |
| Connectors            | GA only: Google Drive and Sheets (1P), Confluence Cloud and Jira Cloud (3P) on sites the team owns. No preview feature or custom MCP.                                                                |
| Decision              | Which modules taught to the levels an upcoming intake enters pass the editable rules, whether each Koha title match really is that module's book, and which open-access matches are fit for a guide. |
| Action and approval   | One Approval step; approved runs create or update a Confluence guide, open a Jira acquisition issue, and log the decision in the Sheet.                                                              |
| Reviewer self-trigger | Seated: type `@BiblioForge` and a module code. Unseated: a public page returns the live Koha count and matches for any module name, each with the source URL to re-run it.                           |

## Origins

BiblioForge has one source, the [argon-02 BiblioForge doc](/docs/ideas/argon-02/05-biblioforge.md); there is no merge. It keeps that doc's join of timetable demand, Koha holdings, and APU's open-access works in OpenAlex, its approval-gated Confluence guide and Jira ticket, its loud per-source failures, and its honest admission that no APU holdings complaint exists. Every number was re-checked on 5 November 2026 between 07:15 and 07:45 MYT.

- **Changed:** the weekly Monday run becomes a daily one, so the Runs tab gains history before 10 November and new intakes enter the 14–28-day window as they come. The scarcity ratio becomes three columns (intake-groups, matching copies, copies on loan), because the ratio alone can't tell a short collection from an unused one. Koha queries cover the top 100 modules by intake-groups, not all 857 titles, to keep load on APU's host near 8 minutes a day. The editable rules move into a `Rules` tab the approver can change.
- **Dropped:** Cloud Run, Pub/Sub, and BigQuery (all need a payment card, which the team doesn't have), and with them the preview BigQuery federated query; SharePoint and Outlook (the team has no Microsoft 365 tenant, and the developer sandbox ships sample data the repo bars, see [free sandboxes]); the 138 course pages from the 6-month plan (another APU crawl without permission, and pages aren't modules); and the link to the set's shared edge design, which assumed the card path.
- **Fixed:** the source's November start list omitted 9 November (Diploma semester 2 entry) and 12 November (Degree Level 2). The sixth 2024–2026 topic is now Educational Games and Gamification (23), not Network Security (22). The arXiv caveat covers three 2013–2014 works, not two. The LIB space has 58 public pages; the source's 65 was a 3 November count. The Koha title filter works only with the `x-koha-embed: biblio` header; without it, it returns `HTTP 500`.
- **Contradicted claim fixed:** [APU research](/docs/research/apu.md#data-driven-research--intelligent-decision-making) lists the Koha OPAC as a live HTML catalogue. On 5 November its home page, `robots.txt`, and a search URL all returned Koha's "Log in to your account" page. Only the REST API answers without sign-in, so this doc relies on that API and treats it as access LIB may not intend.
- **Added:** the on-loan count (from the same API call) as counterevidence and as a kill test. Also added: an ISBN-to-title lookup through Open Library for the optional phone scan, because Koha's ISBN filter still returned `HTTP 500` in two query forms.

[free sandboxes]: /docs/research/gemini-enterprise.md#free-sandboxes

## Problem and evidence

- **A rolling calendar:** the [intake calendar], fetched on 5 November 2026, lists November starts on 9 November (Diploma semester 2 entry), 12 November (Degree Level 2), 16 November (Fundamental Mathematics for Computing, FMFC), 19 November (Foundation, Diploma, APIIT Certificate), 23 November (an Intensive English level), 24 November (Bachelor's Level 1), 26 November (Level 3 and Engineering Level 4), and 30 November (full-time Master's and DBA). Later rows run to 27 August 2027.
- **The calendar hurts, by people's own account:** "Timetable churn and a compressed calendar" ranks third on other platforms, frequency 3 and intensity 3 for the maximum score of 9, with APU-specific evidence ([theme ranking]). Lecturers wrote "non-stop intake throughout the year" (29 July 2022) and "Overlapping intake can be a problem" (23 May 2024), and the theme lists no visible workaround ([compressed calendar]). None of this mentions books.
- **No holdings complaint:** the social research has no post about textbook or holdings shortages at APU; its library posts are about seats, from X users not tied to APU ([seats, rooms, and parking]). **Inference:** the pain BiblioForge targets is unproven.
- **Counterevidence, measured today:** on 5 November Koha's public items endpoint reported 40,839 visible items, of which 106 carried a `checked_out_date`, the field set while an item is on loan. Undergraduates may borrow 4 items at a time ([loan limits]); students on the dual degree with De Montfort University (DMU) get ProQuest Ebook Central, EBSCO eBook Academic Collection, and VLeBooks ([DMU e-resources]); and LIB says it is "in a system transition phase", so new print books may be missing from WorldCat Discovery ([WorldCat page]). **Inference:** print borrowing looks light, and many readings may already be digital; either would make an acquisition queue pointless.
- **Demand data exists:** the APSpace [timetable feed][tt] held 31,606 rows for 26 October to 22 November 2026, across 1,045 intakes and 857 module titles ([timetable row counts]); its ETag and `Last-Modified` (28 October 2026) were unchanged on 5 November. `MODULE_NAME` is the string `"null"` in 532 rows ([schema](/docs/research/apu.md#timetable-feed-schema)).
- **Holdings data exists, behind a sign-in page:** Koha's REST API returned 2 copies of _Concurrent programming in Java_ for the title filter "concurrent programming", the name of module `CT074-3-2-CCP`; neither was on loan.
- **APU research exists:** OpenAlex institution `I181397559` listed 3,689 works and 45,087 citations (record updated 4 November). The [works filter][oa works] returned 3,660: 700 from 2024, 570 from 2025, and 605 so far in 2026. 1,818 are open access, 885 of them from 2024–2026. Top 2024–2026 topics: Smart Agriculture and AI (58), Technology Adoption and User Behaviour (52), Artificial Intelligence in Healthcare (37), Diverse Aspects of Tourism Research (30), Environmental Sustainability in Business (25), and Educational Games and Gamification (23). **Inference:** few of these will match a taught module title, and research papers are rarely textbook substitutes; the audit measures both.

[theme ranking]: /docs/research/social.md#other-platforms-theme-ranking
[compressed calendar]: /docs/research/social.md#timetable-churn-and-a-compressed-calendar
[seats, rooms, and parking]: /docs/research/social.md#seats-rooms-and-parking
[loan limits]: https://apiit.atlassian.net/wiki/spaces/LIB/pages/1968930845
[DMU e-resources]: https://apiit.atlassian.net/wiki/spaces/LIB/pages/2904915982
[WorldCat page]: https://apiit.atlassian.net/wiki/spaces/LIB/pages/3640819734
[timetable row counts]: /docs/research/apu.md#timetable-row-counts
[oa works]: https://api.openalex.org/works?filter=authorships.institutions.id:I181397559&group_by=publication_year

## How it works

### Signal to cloud path

The team's Raspberry Pi 5 (8 GB) at a builder's home runs the pipeline daily at 06:00 MYT:

1.  **Module demand:** a conditional `GET` of the [timetable feed][tt] with `If-None-Match`; a `304` confirms the stored copy is current ([change behaviour]). It drops `LECTID`, `NAME`, and `SAMACCOUNTNAME` in memory before anything is stored ([personal data]), strips the section suffix from `MODID`, skips `"null"` names, and counts distinct `INTAKE` and `GROUPING` pairs per module.
1.  **Upcoming intakes:** parses the [intake calendar] for intakes starting 14 to 28 days later. **Inference:** intake codes such as `APD2F2602CS(DA)` appear to carry a level and a start month (`2602`), so the modules current cohorts of that level take stand in for the new cohort's; the audit checks this reading before the ranking relies on it.
1.  **Holdings:** for the top 100 modules by intake-groups, one request each to Koha's `/api/v1/public/items` with `x-koha-embed: biblio`, a `biblio.title` like-filter on the module name, and up to 100 items per page. The Pi counts copies and copies with a due date set. Requests are 5 seconds apart, about 8 minutes a run; `opac.apu.edu.my/robots.txt` returns the sign-in page and sets no crawl delay, so the pace is the team's choice.
1.  **Open-access matches:** pages through APU's 885 open-access works from 2024–2026 by filter (9 pages of 100, $0.0001 each against the $0.10 keyless daily budget, see [OpenAlex]) and matches titles and topics to module names on the Pi. The 2024–2026 window already excludes the 2013–2014 arXiv papers the catalogue flags as likely misattributed.
1.  **To the cloud:** the Pi POSTs each run's rows over HTTPS to an Apps Script web app, whose `doPost` appends them to the `Modules` and `Fetch log` tabs of a Sheet in the licensed Workspace domain ([Pi to Apps Script and Sheets]). Each row carries its source URL, ETag where there is one, HTTP status, response time, the Pi's timestamp, and Apps Script's receipt time.

[change behaviour]: /docs/research/apu.md#timetable-feed-change-behaviour
[personal data]: /docs/research/apu.md#personal-data-in-the-timetable-feed
[Pi to Apps Script and Sheets]: /docs/research/iot-and-network.md#pi-to-apps-script-and-sheets

### Workflow and rule set

1.  **Trigger:** a Schedule trigger runs the workflow daily at 08:00 MYT (Asia/Kuala_Lumpur). A librarian or reviewer can start it with the Manual trigger by typing `@BiblioForge` and a module code; that run checks the one module and shows which rules it passes or fails ([workflows]).
1.  **Read:** an agent step reads the `Rules` tab and that morning's `Modules` rows with `Get cell values`. It first checks the newest Pi timestamp; if no run landed today, it reports that and stops.
1.  **Decide:** code has already counted; the agent decides what counting can't. It judges whether each Koha title match is the module's book (_Concurrent programming in Java_ for "Concurrent Programming" is; a generic "Management" match may not be), which open-access matches suit a student guide, and which modules pass the rules. It then drafts a guide and, where the rules allow, a Jira acquisition request citing the rule row it applied.
1.  **Approve:** an Approval step pauses the run at **Needs Review** ([HITL steps]). The approver sees each module's code and name, intake-group count, the upcoming intake date, copies and copies on loan with Koha query links, and the matched papers, then approves or rejects each draft. Connector writes from a workflow require human review in any case ([workflows]).
1.  **Write:** approved drafts become a Confluence page (Create or Update page) and a Jira issue (Create issue, Create comment); `Update cell values` logs every decision in the Sheet.

The `Rules` tab holds the thresholds, each a team choice until LIB replaces it: at least 6 intake-groups for a module to count; a guide when matching copies number 2 or fewer; an acquisition request only when every matching copy is on loan, or none exists and the module has at least 10 intake-groups; at most 5 modules per run; and the 14–28-day look-ahead. Editing a cell changes the next run.

[HITL steps]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/use-hitl-steps

### States and failure handling

- **Each source fails on its own:** if the timetable feed, intake calendar, Koha, or OpenAlex returns an error, a rate limit, or an unparseable page, the Pi writes that source's status, message, and request time into the affected rows and leaves their counts blank. The review shows those rows as errors, and the agent drafts nothing from them. Nothing reuses yesterday's counts.
- **`304` is not a failure:** it confirms the stored feed copy matches APU's current file.
- **Pi offline or late:** no `Modules` rows for today means the run reports "no Pi run since" the last receipt time, never the last values.
- **Unapproved drafts:** they wait in **Needs Review** and nothing is published. Event-triggered runs that fail on quota aren't retried, and schedule credentials expire every 14 days and need a manual refresh ([unattended runs]).

[unattended runs]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in

### Connectors and platform check

All three are GA and listed among the connectors workflows support ([workflows], checked 5 November 2026). BigQuery isn't on that list, which is one more reason the history stays in the Sheet.

| Connector                 | Type | Access                       | Actions                             | Role                                                   |
| ------------------------- | ---- | ---------------------------- | ----------------------------------- | ------------------------------------------------------ |
| [Google Drive and Sheets] | 1P   | Actions                      | Get cell values, Update cell values | Live read of the Pi's rows and the rules; decision log |
| [Confluence Cloud]        | 3P   | Federated search and actions | Create page, Update page            | Module open-access guides in a team-owned space        |
| [Jira Cloud]              | 3P   | Federated search and actions | Create issue, Create comment        | Acquisition requests in a Jira Cloud Free project      |

The Drive connector needs a Google Workspace domain; consumer `@gmail.com` accounts get `403` ([account limits]). APU runs its knowledge base on Confluence and its Virtual Help Centre on Jira Service Management ([systems APU runs]), but connecting those needs admin rights the team doesn't have, so the build writes to sites the team owns ([how each source reaches an agent]).

[Google Drive and Sheets]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive
[Confluence Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud
[Jira Cloud]: https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud
[account limits]: /docs/research/gemini-enterprise.md#edition-and-account-limits
[systems APU runs]: /docs/research/apu.md#systems-apu-runs
[how each source reaches an agent]: /docs/research/apu.md#how-each-source-reaches-an-agent

### Cloud, IoT and network

- **Cloud:** Apps Script and a Sheet carry the data with no card; Gemini Enterprise does the deciding and writing ([no-card paths](/docs/research/google-cloud.md#paths-that-need-no-payment-card)).
- **IoT, conceded:** there is no sensor. The Pi is a home compute host that parses the 17 MB decoded feed, paces requests, and matches titles; Apps Script could do most of it. The optional phone scan reads an ISBN barcode through the camera ([browser sensors]) and returns the book's copies and matches, which is data entry, not sensing. Because Koha's ISBN filter returned `HTTP 500`, the scan looks the ISBN up in [Open Library] first (9780201310092 returned _Concurrent programming in Java_ on 5 November), then runs Koha's title filter; each step shows its own error.
- **Network:** every source request lands in `Fetch log` with status, bytes, response time, and ETag or `304`, and every row carries the Pi-to-Apps Script hop time. **Inference:** that makes the network visible per request ([what a judge can see]), but it is request telemetry, not a device network.

[browser sensors]: /docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser
[Open Library]: https://openlibrary.org/developers/api
[what a judge can see]: /docs/research/iot-and-network.md#what-a-judge-can-see-of-the-network

### Real data and privacy

- **Real data only:** every value comes from a live public source at run time, and a failed source shows its error. No sample modules, books, or papers, even in the demo.
- **Personal data:** no student records and no lecturer fields from the timetable feed. Koha's items carry due dates but no patron fields, and BiblioForge stores only per-module counts. Prompts hold module names, counts, and paper titles.
- **Terms:** OpenAlex metadata is CC0 ([OpenAlex]); guides link only to open-access URLs and never redistribute PDFs. APU's [Terms of Use][terms] ask for written permission before any use of its contents, and the feed carries no licence. BiblioForge stores aggregates, never re-hosts the raw feed or catalogue, and stops using a source the day APU or LIB objects.

[terms]: /docs/research/apu.md#terms-of-use-and-robotstxt

## Why people will use it

Conceded first: no source shows anyone spending effort on pre-intake holdings checks, asking for reading lists, or keeping a workaround, so there is no revealed demand to cite. LIB's own help pages show a reservation process for copies out on loan ([reserve a book]), which is a library process, not evidence of queues.

- **A channel LIB already uses:** LIB publishes 58 public help pages on Confluence ([knowledge base](/docs/research/apu.md#apu-knowledge-base-on-confluence) counted 65 on 3 November), so a guide in the pilot would sit beside them in a tool students already open; Jira mirrors the Virtual Help Centre.
- **Less cross-referencing:** **Inference:** without BiblioForge, matching an intake's modules to holdings means reading the timetable, signing in to the OPAC, and searching each title; the timed baseline in the [research plan](#research-plan) measures that.

[reserve a book]: https://apiit.atlassian.net/wiki/spaces/LIB/pages/1968767119

## Why the crowd won't build it

In the repo's 780-idea simulation, library services drew 4 ideas and anything built on APSpace drew 3, both in the "Absent" tier ([saturation tiers]). Research trend and literature analytics holds 3.4% and is "Crowded", typically on arXiv, Semantic Scholar, and Cloud SQL ([clusters and shares]); BiblioForge must not drift into a literature dashboard. No library tool appears among [APU student-built tools]. LIB's own WorldCat Discovery, EBSCO databases, and DMU e-resources search holdings but don't know which modules start with which intake. **Inference:** that join is the open ground, if the need is real.

[saturation tiers]: /docs/research/competition.md#saturation-tiers
[clusters and shares]: /docs/research/competition.md#clusters-and-shares
[APU student-built tools]: /docs/research/competition.md#apu-student-built-tools

## Off-campus fit

The build's critical path works with nobody at APU and no APU staff action: the Pi at home, four public endpoints, Apps Script and a Sheet in the licensed domain, and Jira Cloud Free and Confluence sites the team owns. The condition is permission, not presence. It reads APU's timetable feed daily and queries a catalogue whose web pages are sign-in only, and nobody has asked APU or LIB. The team asks the organisers in `#help-desk` for written permission on 5 November and builds while it waits; a refusal stops the build (see [kill criteria](#risks-and-kill-criteria)). The pilot, with LIB as owner and approver, needs LIB's agreement and can't start before it.

## Scores

**54.2 / 100, rank 14 of 18** in the [cross-set ranking](/docs/ideas/00-ranking.md); it passes every gate, with G2, G3 and G4 conditional. Scored on 5 November 2026 on the [matrix](/docs/ideas/00-ranking.md#scoring-matrix) by three independent scorers who read this doc and checked its claims: an NTT DATA forward deployed engineer (FDE), an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student. Models: FDE (Claude Opus 5.5), Lecturer (Claude Sonnet 5.5), Advocate (Claude Fable 5.1). Day-to-day workflow and theme take the lowest score; the rest take the mean.

| Component           | Weight | FDE | Lecturer | Advocate | Used | Lowest scorer's reason                                                                                                                                                                                  |
| ------------------- | -----: | --: | -------: | -------: | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact              |     13 |   2 |        2 |        2 |    2 | LIB is named but hasn't been asked, and Koha's live API shows only 106 of 40,839 items on loan (checked), measured evidence that the shortage the product targets may not exist.                        |
| Connectors          |     13 |   3 |        3 |        4 | 3.33 | Drive/Sheets (1P), plus Confluence (Create and Update page, checked on Google's live page) and Jira (3P), are GA, but both 3P writes go to team-owned sites that no one at LIB reads.                   |
| Day-to-day workflow |     13 |   4 |        4 |        4 |    4 | It runs on a daily 08:00 schedule with a manual trigger, an editable Rules tab, per-source error rows, a staleness stop and one Approval (schedule and HITL behaviour checked in gemini-enterprise.md). |
| Research            |     13 |   2 |        2 |        2 |    2 | The doc concedes no source shows a holdings shortage at APU; the 40-module audit and online interviews are reachable, but the pain is speculative.                                                      |
| Time to impact      |     13 |   2 |        3 |        3 | 2.67 | Dated plans track real intake dates (checked live), but benefit to anyone needs LIB's agreement by 30 November and APU permission, neither of which the team controls.                                  |
| Theme               |     10 |   1 |        2 |        2 |    1 | There is no sensor (conceded), the doc says Apps Script could do most of the Pi's work, and the network is request telemetry only.                                                                      |
| Originality         |      9 |   4 |        4 |        4 |    4 | Library services drew 4 simulated ideas and sit in the Absent tier (checked), and no incumbent joins timetable demand to holdings.                                                                      |
| Real use            |      6 |   1 |        1 |        2 | 1.33 | The doc concedes no revealed demand: no one is cited spending effort on pre-intake holdings checks.                                                                                                     |
| Buildability        |      5 |   3 |        3 |        3 |    3 | It is moderate: a Pi joins four sources with title matching, plus Apps Script, one workflow, Confluence, Jira and a reviewer page.                                                                      |
| Demo                |      5 |   4 |        4 |        4 |    4 | Seated reviewers type @BiblioForge with a module code; unseated ones get live Koha counts with re-runnable URLs (the 2 copies of Concurrent programming in Java reproduced live).                       |

- **Gates:** G1 pass (3 pass, 0 conditional, 0 fail); G2 conditional (2 pass, 1 conditional, 0 fail); G3 conditional (2 pass, 1 conditional, 0 fail); G4 conditional (1 pass, 2 conditional, 0 fail).
- **Off-campus gate, per the lowest scorer:** The build runs from a home Pi on public endpoints and team-owned Atlassian sites, with no campus presence. LIB's agreement (staff action) is needed only for the pilot, not the critical path.
- **What would help most, per the lowest scorer:** Get LIB's acquisitions librarian to confirm a real pre-intake reading or holdings need and take the approval seat, or pivot to a library pain LIB already documents.

## Research plan

Nothing below has been run. Each item needs only the team's phones, laptops, and APKey sign-ins, by 10 November:

1.  **40-module audit (Fri 6 – Sat 7 Nov, 4 person-hours):** take the 40 modules with the most intake-groups. A team member signed in to the OPAC searches each and records the true copies, giving precision and recall for the API's title match. Record copies on loan. Two team members independently mark each open-access match relevant or not, and the doc reports their agreement. Pass line: title-match precision of at least 80% on 40 modules.
1.  **Timed baseline (Sat 7 Nov, 1 person-hour):** a team member times the manual path for 10 modules (timetable, OPAC search, OpenAlex search) against reading BiblioForge's row. A student's time is a proxy for a librarian's and is reported as such ([measuring accuracy]).
1.  **6–8 student interviews in two rounds (Fri 6 and Sun 8 Nov, online):** classmates reached through existing chats, none recruited yet. Past-tense questions on how they got readings for their last module: borrowed, e-book, bought, or lecturer PDF. Consent and anonymised quotes follow [the judging research][consent].
1.  **LIB and organisers (Thu 5 Nov):** one email through the library's published contact route asking whether the public API is meant to be open and how acquisitions are planned before an intake; the `#help-desk` permission request. The plan doesn't count on a reply.

[measuring accuracy]: /docs/research/judging.md#measuring-an-agents-accuracy-honestly
[consent]: /docs/research/judging.md#consent-and-anonymised-quotes

## Time to impact

- **First value (late November 2026):** daily runs flag modules for the 23 November IEP, 24 November Bachelor's Level 1, 26 November Level 3, and 30 November Master's intakes, with the team approving.
- **By 5 February 2027 (3 months):** owner B1 until LIB agrees, then LIB's acquisitions librarian. Runs cover the 1 December part-time research degrees, 4 January FMFC and bridging modules, and 15 January part-time Master's and DBA intakes, with guides for the top 20 modules and title-match precision re-measured monthly.
- **By 5 May 2027 (6 months):** runs cover the 25 February Foundation and Diploma, 25 March Bachelor's Level 1, 30 March Master's, and 22 April Foundation and Diploma intakes. Metrics: lead time from flag to commencement, acquisition requests LIB accepted, and guide page views.
- **Assumptions:** LIB agrees by 30 November 2026 and accepts team-owned sites (moving into APU's own Confluence and Jira needs APU admin action, so it is out of scope); the feed and the Koha API stay public; the audit passes; and someone funds a Standard seat (from $30 a month, [editions]) after the trial.

[editions]: /docs/research/gemini-enterprise.md#gemini-enterprise-editions-and-prices

## Demo and review

- **Video (3:45, labelled with its capture date, following the [minute plan]):** 0:00 the problem and the counterevidence, said plainly; 0:30 the Pi's morning run (feed `304`, Koha statuses, response times) and the Sheet rows; 1:15 the workflow pausing at **Needs Review**, approval, and the Confluence page and Jira issue appearing; 2:00 a broken Koha URL turning its rows into errors with no counts; 2:30 audit precision, on-loan share, and the timed baseline; 3:15 the 3- and 6-month plan.
- **Seated reviewers:** type `@BiblioForge CT074-3-2-CCP` and see the run pause for approval; the owner's Runs tab over several days is captured in the README ([reviewer access]).
- **Unseated reviewers:** an Apps Script page (or a Tailscale Funnel URL on the Pi if the domain blocks public web apps) takes any module name and returns the live Koha count, copies on loan, and open-access matches, each with the Koha and OpenAlex URL so the reviewer can re-run the query and check the number.

[minute plan]: /docs/research/judging.md#minute-plan
[reviewer access]: /docs/research/gemini-enterprise.md#reviewer-access

## Build plan

Three builders: **B1** (Gemini Enterprise workflow, Jira, Confluence), **B2** (Pi pipeline, Apps Script, Sheet), **B3** (research, reviewer page, video).

| Day        | Work                                                                                                                                                                | Exit check                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Thu 5 Nov  | B3 sends the `#help-desk` and LIB requests. B2 ships the feed, calendar, Koha, and OpenAlex steps with error rows. B1 sets up Jira Cloud Free and Confluence.       | One full Pi run lands in the Sheet; a forced bad URL shows its error row.      |
| Fri 6 Nov  | B1 builds the workflow (Schedule, Manual, Approval, three writes) if the licence has arrived. B3 starts the audit and interview round 1.                            | One approved run creates a page and an issue; audit half done.                 |
| Sat 7 Nov  | B1 adds the `Rules` tab and staleness check. B2 adds the reviewer page. B3 finishes the audit and timed baseline; apply the kill tests.                             | Audit scored; kill tests passed or product dropped.                            |
| Sun 8 Nov  | Deepavali. All confirm portal registration by 12:00 (closes 23:59). B3 runs interview round 2. B2 adds the phone scan only if everything else is green.             | Registration locked; three or more daily runs in the Runs tab.                 |
| Mon 9 Nov  | Feature freeze at 12:00. Record the video from the live system; write the README and deck; test the reviewer page logged out.                                       | Video uploaded unlisted; README "How to review" checked by a non-team account. |
| Tue 10 Nov | Refresh schedule credentials (valid to 24 November); recheck every cited number; the leader submits by 18:00 MYT. Leave the Pi and workflow running to 14 November. | Entry locked; the 08:00 run completed cleanly.                                 |

**Cut lines, in order:** the phone scan, the unseated reviewer page's on-loan column, the Jira write (keep the guide). **Never cut:** loud per-source errors, the Approval step, the audit.

## Risks and kill criteria

- **Permission refused:** if the organisers, APU, or LIB object to using the timetable feed or the Koha API, stop that source the same day. Without either, there's no demand or holdings signal, so kill the product.
- **No shortage:** if 2 or fewer of the 40 audited modules have any matching copy on loan, drop the acquisition requests. If open-access match relevance is also below 50%, kill the product; there's nothing left worth approving.
- **Title matching:** below 80% precision, show copy counts as "title matches, unverified" and never draft an acquisition request from them.
- **Licence:** if no Gemini Enterprise licence works by Mon 9 Nov 12:00, the deciding step can't be shown live; the README says so rather than faking a run.
- **APU host behaviour:** if Koha rate-limits or blocks the Pi, or the feed changes shape, the rows show the error and the team doesn't retry harder.

## Not verified

- Whether Koha's `checked_out_date` is the due date (values run to February 2027, which suggests it) and whether circulation still runs in Koha during LIB's "system transition".
- Whether LIB means the public REST API to be open; whether APU or the organisers will give written permission.
- The intake-code reading of level and start month; title-match precision; whether any APU open-access work fits a taught module.
- Whether APU keeps reading lists elsewhere (for example in Moodle, which needs sign-in), and how far DMU e-resources cover module textbooks.
- The licence's domain and edition, whether the Workspace domain allows a public Apps Script web app, and OpenAlex's CC0 terms (taken from the data catalogue).

## See also

- [BiblioForge source doc (argon-02)](/docs/ideas/argon-02/05-biblioforge.md)
- [Cross-set idea ranking](/docs/ideas/00-ranking.md)
- [APU's public documents, data, and systems](/docs/research/apu.md)
- [Public data sources](/docs/research/data-sources.md)
- [Gemini Enterprise](/docs/research/gemini-enterprise.md)
- [IoT and network](/docs/research/iot-and-network.md)
- [Social research](/docs/research/social.md)
- [Competition](/docs/research/competition.md)
- [Hackathon context](/docs/CONTEXT.md)

[intake calendar]: https://www.apu.edu.my/intake-calendar
[tt]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[workflows]: https://docs.cloud.google.com/gemini/enterprise/docs/workflow-builder/workflows
[OpenAlex]: /docs/research/data-sources.md#openalex
