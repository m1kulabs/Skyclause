# APU's public documents, data, and systems

Which real, public APU documents and data could ground a Gemini Enterprise agent under the repo's real-data rule, and what public evidence shows which systems APU runs, so a team can pick connectors that mirror APU's real operations. This file merges a survey of APU's public documents and systems, researched on 3 November 2026 (every URL got a real request, 21:52–22:15 MYT), with a study of the public timetable feed behind APSpace, researched on 4 November 2026 (requests 00:16–00:23 MYT); downloads and raw responses are kept outside the repo.

Contents:

1.  [How this was checked](#how-this-was-checked)
1.  [APU Knowledge Base on Confluence](#apu-knowledge-base-on-confluence)
1.  [APSpace timetable feed](#apspace-timetable-feed)
    1.  [Timetable feed endpoints](#timetable-feed-endpoints)
    1.  [Timetable feed schema](#timetable-feed-schema)
        1.  [Timetable row counts](#timetable-row-counts)
        1.  [Timetable room codes](#timetable-room-codes)
    1.  [Timetable feed change behaviour](#timetable-feed-change-behaviour)
    1.  [Personal data in the timetable feed](#personal-data-in-the-timetable-feed)
    1.  [Who already uses the timetable feed](#who-already-uses-the-timetable-feed)
1.  [Public documents by track](#public-documents-by-track)
    1.  [Smart Campus & Student Experience](#smart-campus--student-experience)
    1.  [Intelligent Automation & Digital Transformation](#intelligent-automation--digital-transformation)
    1.  [Data-Driven Research & Intelligent Decision Making](#data-driven-research--intelligent-decision-making)
1.  [Material that is not public](#material-that-is-not-public)
1.  [Terms of use and robots.txt](#terms-of-use-and-robotstxt)
1.  [Systems APU runs](#systems-apu-runs)
1.  [How each source reaches an agent](#how-each-source-reaches-an-agent)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## How this was checked

- **Login:** every document in the track tables opened with a plain `curl` request and no cookies or credentials. Exceptions are listed under [Material that is not public](#material-that-is-not-public).
- **HTML pages:** `www.apu.edu.my` runs Drupal 10. Each page weighs 300–670 KB, mostly shared navigation, and shows no last-updated date. The `Last-Modified` header is the cache time (the day of the request), so it is not a content date.
- **PDFs:** hosted on `publicwebsite-media.apu.edu.my` (Amazon S3). "Uploaded" is the file's `Last-Modified` header; any date printed in the document is given separately. All PDFs below have a text layer (`pdftotext` worked); the scholarship grid extracts only partly.
- **Sitemap quirk:** `new.apu.edu.my/sitemap.xml` now lists 339 URLs under the host `training.apiit.edu.my`, a CNAME of `apu.edu.my`. The same paths work on `www.apu.edu.my`, which is what the tables cite.
- **Timetable feed:** I read the source of the official [APSpace app][apspace_src] (last pushed 5 January 2023), the live APSpace web bundle, and six student tools, then requested only paths named in that code, with plain `curl` and no credentials, from 00:16 to 00:23 MYT on 4 November 2026. Counts come from the 00:16:50 MYT copy; two older copies came from the Internet Archive ([CDX index][cdx]).
- **Covered elsewhere:** the [public data sources](/docs/research/data-sources.md#apus-own-public-information) catalogue covers APU's lack of an API, its ROR, OpenAlex and Wikidata IDs, and the APSpace source code; this file doesn't repeat them. That catalogue found no public API or open-data portal on APU's site; the [APSpace feeds](#apspace-timetable-feed) below are publicly readable but undocumented.

[apspace_src]: https://github.com/ctiteam/apspace
[cdx]: https://web.archive.org/cdx/search/cdx?url=s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable

## APU Knowledge Base on Confluence

The biggest public source is not on the main website. [`kb.apu.edu.my`][kb_home] redirects to APU's Confluence Cloud site `apiit.atlassian.net`, where the home page calls it "the one-stop university wide information and document hub on academic and non-academic activities" and says to log in "to view limited access articles". Confluence's REST API answered without credentials and listed 28 spaces; I counted the pages visible to an anonymous visitor in 21 of them, 1,189 in total.

| Space                                  | Public pages | Newest edit | What it covers                                                           |
| -------------------------------------- | -----------: | ----------- | ------------------------------------------------------------------------ |
| [IT Helpdesk (ITSM)][kb_itsm]          |          725 | 3 Nov 2026  | APKey, Microsoft 365, OneDrive, Teams, Wi-Fi, labs, tickets, policies    |
| [Programme Documentation (PD)][kb_pd]  |          135 | 9 Jun 2026  | Index of programme handbooks; the handbooks themselves are restricted    |
| [Academic Administration (AA)][kb_aa]  |          103 | 2 Oct 2026  | Exam dockets, EC claims, referrals, deferment, transcripts, the handbook |
| [Library (LIB)][kb_lib]                |           65 | 11 Feb 2026 | Hours, Koha catalogue, e-databases, borrowing                            |
| [Graduation (GRAD)][kb_grad]           |           48 | 24 Feb 2026 | Registration, invitation letters, certificates                           |
| [Accommodation (AC)][kb_ac]            |           29 | 17 Sep 2026 | Residence fees, booking, check-out, rules                                |
| [Logistics & Operations (LNO)][kb_lno] |           29 | 28 Oct 2026 | APCard parking, prepaid smart meters                                     |
| [Visa and Immigration (VISA)][kb_visa] |           19 | 3 Aug 2026  | Student pass, overstay, passport renewal, EMGS notices                   |
| [Bursary (BUR)][kb_bur]                |            8 | 15 May 2026 | Paying fees online, Flywire, refund policies                             |

- Bodies are readable: for example the library-hours page returned "Monday – Friday: 8:30 a.m. – 7:00 p.m." (edited 10 May 2024), and ITSM's [ICT Regulations][kb_ict] (edited 2 January 2025) is APU's acceptable-use rule set, covering monitoring, hardware care, and misuse.
- ITSM also publishes the [Password and Authentication Policy][kb_pwd] (3 January 2025), [Policy: Microsoft 365 Storage][kb_m365] (6 August 2025), [SharePoint & Microsoft Teams Site Provisioning Policy][kb_spo] (effective 1 January 2025), BYOD and USB policies, and "Policy: AI-Driven Security Policies for APU's Digital Ecosystem" (1 April 2026).
- Pages are short Q&A articles ("How to open a ticket on Virtual Help Centre?", "I would like to defer my semester/intake?"), which suit retrieval well. Many were last edited in 2020–2023, so an agent should show each answer's edit date.

[kb_home]: https://apiit.atlassian.net/wiki/spaces/KB/overview
[kb_itsm]: https://apiit.atlassian.net/wiki/spaces/ITSM/overview
[kb_pd]: https://apiit.atlassian.net/wiki/spaces/PD/overview
[kb_aa]: https://apiit.atlassian.net/wiki/spaces/AA/overview
[kb_lib]: https://apiit.atlassian.net/wiki/spaces/LIB/overview
[kb_grad]: https://apiit.atlassian.net/wiki/spaces/GRAD/overview
[kb_ac]: https://apiit.atlassian.net/wiki/spaces/AC/overview
[kb_lno]: https://apiit.atlassian.net/wiki/spaces/LNO/overview
[kb_visa]: https://apiit.atlassian.net/wiki/spaces/VISA/overview
[kb_bur]: https://apiit.atlassian.net/wiki/spaces/BUR/overview
[kb_ict]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2215379058
[kb_pwd]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2476572694
[kb_m365]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2812936216
[kb_spo]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/3096641634

## APSpace timetable feed

APU's student portal, APSpace, loads every class session from a JSON file on Amazon S3 that anyone can read without a login, and sibling feeds sit on APU's web-service API. This section records what is public, the schema, change behaviour, personal data, and current users; the feed's terms are under [Terms of use and robots.txt](#terms-of-use-and-robotstxt). Researched on 4 November 2026.

### Timetable feed endpoints

Bytes are the transfer size, then the decoded size. `…` stands for `https://api.apiit.edu.my`.

| Endpoint                                                                  | HTTP | Bytes                  | Last-Modified (MYT), ETag                 | Fetched (MYT)   | Content                                                                        |
| ------------------------------------------------------------------------- | ---: | ---------------------- | ----------------------------------------- | --------------- | ------------------------------------------------------------------------------ |
| [`open-ws/weektimetable`][tt]                                             |  200 | 1,138,362 / 17,153,209 | 28 Oct 2026 09:39:49, `c9d8d238…a24842dd` | 00:16:50        | Class sessions, 18 fields                                                      |
| [`open-ws/intake_listing`][il]                                            |  200 | 8,697 / 106,673        | 28 Oct 2026 09:39:49, `305100ee…e7595ccd` | 00:19:16        | 2,002 `INTAKE_CODE` and `COLOR` pairs, one code null                           |
| `open-ws/` (bucket listing)                                               |  403 | 243                    | none                                      | 00:19:17        | `AccessDenied`                                                                 |
| [`…/student/intake_listing`][api_il]                                      |  200 | 8,611 / 67,332         | none                                      | 00:19:50        | 2,021 intake codes                                                             |
| [`…/transix-v2/holiday/active`][api_hol]                                  |  200 | 1,863 / 16,386         | none                                      | 00:19:17        | 2025 and 2026 holidays, 29 and 32 entries, each tagged all, students, or staff |
| [`…/transix-v2/schedule/active`][api_bus]                                 |  200 | 4,473 / 172,256        | none                                      | 00:19:48        | Shuttle set "WEF 22 Oct 2026", 253 trips                                       |
| [`…/transix-v2/locations`][api_loc]                                       |  200 | 800 / 3,391            | none                                      | 00:19:48        | 15 shuttle stops with coordinates                                              |
| `…/examination/<intake>`                                                  |  200 | 3                      | none                                      | 00:19:49, 00:23 | `[]` for both intakes tried                                                    |
| `…/quix/get/file`, header `X-Filename: quix-customers`                    |  200 | 568 / 2,828            | none                                      | 00:19:49        | Opening hours and contacts of 9 APU departments, `lastModified` 29 Aug 2026    |
| `…/transix/holidays/filtered/students`, `/locations`, `/trips/applicable` |  403 | 23                     | none                                      | 00:19:17        | `{"message":"Forbidden"}`: the old v1 paths in the 2023 source are closed      |

- **Timetable object:** stored gzip-compressed, versioned (`x-amz-version-id`), with no `Cache-Control`; the ETag is the MD5 of the gzip bytes. GETs with an `Origin` header get `Access-Control-Allow-Origin: *`, so any web page can read it.
- **Official use:** the live APSpace bundle `main.0caa4a4148aae0d2.js` (`Last-Modified` 13 August 2026) hard-codes the timetable URL and calls it without a login. It reads intakes from `…/student/intake_listing`; only the 2023 source uses the `open-ws` copy.
- **API host:** `api.apiit.edu.my` is Amazon API Gateway behind CloudFront, with no ETag or Last-Modified. The shuttle set's date matches the shuttle schedule PDF under [Smart Campus & Student Experience](#smart-campus--student-experience).
- APSpace also calls staff-keyed paths such as `lecturer-timetable/v2/<staff ID>` without a login; I didn't request them.

[tt]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[il]: https://s3-ap-southeast-1.amazonaws.com/open-ws/intake_listing
[api_il]: https://api.apiit.edu.my/student/intake_listing
[api_hol]: https://api.apiit.edu.my/transix-v2/holiday/active
[api_bus]: https://api.apiit.edu.my/transix-v2/schedule/active
[api_loc]: https://api.apiit.edu.my/transix-v2/locations

### Timetable feed schema

One JSON array of flat objects with the same 18 fields. The [APSpace interface][iface] names 12; the other meanings are read from the data. One row, personal fields redacted:

```json
{
  "INTAKE": "APD2F2602CS(DA)",
  "GROUPING": "G1",
  "MODID": "CT074-3-2-CCP-L-9",
  "MODULE_NAME": "Concurrent Programming",
  "CLASS_CODE": "CSSE___CT074-3-2-CCP-L-9___2026-08-05",
  "DAY": "WED",
  "DATESTAMP": "04-Nov-26",
  "DATESTAMP_ISO": "2026-11-04",
  "TIME_FROM": "04:00 PM",
  "TIME_TO": "06:00 PM",
  "TIME_FROM_ISO": "2026-11-04T16:00:00+08:00",
  "TIME_TO_ISO": "2026-11-04T18:00:00+08:00",
  "LOCATION": "APU CAMPUS",
  "ROOM": "B-08-01",
  "COLOR": "yellow",
  "LECTID": "<redacted>",
  "NAME": "<redacted>",
  "SAMACCOUNTNAME": "<redacted>"
}
```

| Field                          | Meaning                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `INTAKE`                       | Cohort code                                                                                                             |
| `GROUPING`                     | Tutorial group, `G1` to `G6`; `G1` is 89% of rows                                                                       |
| `MODID`                        | Module code, then `L`, `T`, `LAB`, or `P` and a section number; online sections end in ` (Online)`                      |
| `MODULE_NAME`                  | Module title; the string `"null"` in 532 rows                                                                           |
| `CLASS_CODE`                   | One of 16 unit prefixes such as `CSSE` or `SOGS`, the section, and a 2026 date, joined by `___`; plain `G1` in 533 rows |
| `DAY`                          | `MON` to `SUN`                                                                                                          |
| `DATESTAMP`, `DATESTAMP_ISO`   | Session date, as `04-Nov-26` and ISO                                                                                    |
| `TIME_FROM`, `TIME_TO`         | Local start and end, 12-hour                                                                                            |
| `TIME_FROM_ISO`, `TIME_TO_ISO` | Start and end, ISO 8601 with `+08:00`                                                                                   |
| `LOCATION`                     | `APU CAMPUS` or `ONL`                                                                                                   |
| `ROOM`                         | Room; see [Timetable room codes](#timetable-room-codes)                                                                 |
| `COLOR`                        | Display colour: `blue` on exactly the 2,692 ` (Online)` rows, `yellow` otherwise                                        |
| `LECTID`                       | Lecturer code, 2 to 5 capital letters                                                                                   |
| `NAME`                         | Lecturer's full name                                                                                                    |
| `SAMACCOUNTNAME`               | Lecturer's directory account name                                                                                       |

[iface]: https://github.com/ctiteam/apspace/blob/master/src/app/interfaces/student-timetable.ts

#### Timetable row counts

- **Rows:** 31,606, one per intake per session. By date, start, room, and `MODID` they form 9,854 sessions, shared by 3.2 intakes on average and up to 123.
- **Dates:** 26 October to 22 November 2026, four weeks with 2,652, 2,790, 1,437, and 2,975 sessions. 8 and 9 November are empty; the holiday feed lists them as Deepavali and its day in lieu. Weekends hold 149 rows.
- **Distinct values:** 1,045 intakes (the listing has 2,001), 3,464 module sections, 857 module titles, 236 rooms, 492 lecturers.
- **Room use:** from 09:00 to 17:00 on the weekdays of the week of 2 November, a mean of 107 of 222 physical rooms held a class in each 15-minute slot (range 5 to 159).
- **History:** archived copies from 10 April 2025 (28,924 rows, 7 to 26 April) and 16 June 2025 (21,061 rows, 9 to 29 June) have the same 18 fields: a rolling three-to-four-week window, stable for at least 19 months.

#### Timetable room codes

- 178 rooms follow `Block-Level-Room`: `B-08-01` is Block B, level 8, room 01. Blocks: A (10 rooms, levels 4 to 6), B (62, levels 1 to 9), C (3, levels 3 and 9), D (52, levels 6 to 9), E (34, levels 5 to 9), S (17, levels 4 to 8). Some carry a label, as in `S-05-03 (Architecture Studio)`.
- 44 are named: 29 `Tech Lab <level>-<room>` labs, 7 auditoriums with the level in the name (`Auditorium 3 @ Block C Level 9`), and library discussion, cyber-range presentation, and culinary rooms.
- 14 are online (`ONLMCO3-1`, `ONLMCO3-10` to `-21`, `ONLINE`), with 227 sessions. The `ONLMCO3-*` rows still say `LOCATION` `APU CAMPUS`, so filter online classes by the `ONL` room prefix.
- Two rows end `Tech Lab 6-16 (iMac Suite)` with a stray U+FFFD; trim room names before grouping.

### Timetable feed change behaviour

- **Two fetches:** 3 November 2026 at 23:53:03 MYT and 4 November at 00:16:50 MYT. Same ETag, Last-Modified, version ID, and SHA-256 of the decoded JSON: 0 sessions added, removed, or changed. The gap was 24 minutes, so this says nothing about cadence.
- **Last write:** both `open-ws` objects were written in the same second, 28 October 2026 at 09:39:49 MYT, and the window still starts with the week of 26 October. **Inference:** one job writes both files, weekly or less often.
- **Cheap check:** `If-None-Match` with the ETag and `If-Modified-Since` each returned `304` with an empty body (00:20:17 and 00:20:18 MYT). A poller can check often and download 1.1 MB only when the ETag moves.
- **Diff key:** with every non-personal field as the key, 37 rows still collide because they differ only in lecturer (co-taught). Dropping lecturer fields and de-duplicating leaves 31,569 rows.

### Personal data in the timetable feed

- **Fields that identify people:** `NAME`, `SAMACCOUNTNAME`, and `LECTID` cover 492 lecturers and, with `ROOM` and times, place each named person in a room for every class over four weeks. Drop all three at ingest, before storage, logs, or a model prompt. No field names a student.
- **Law and terms:** reusing lecturer names outside APSpace falls under the Personal Data Protection Act 2010 (**Inference**); the Privacy Notice, Terms of Use, and the feed's missing licence are under [Terms of use and robots.txt](#terms-of-use-and-robotstxt).

### Who already uses the timetable feed

| Project                         | What it does                                                                                                | Fetches                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [APSpace][apspace_src]          | APU's official portal, built by its CTI team; shows each student's timetable                                | Again whenever a session predates this week |
| [cron-apu-timetable][cron]      | GitHub Actions job that filters by intake, group, and electives and writes Google Calendar events; 40 forks | Fridays 02:00 UTC                           |
| [APSync][apsync]                | Android app that syncs classes to the phone calendar and notifies changes                                   | Every 12 hours                              |
| [apspace-to-calendar][a2c]      | Python loop that fills shared Google Calendars for five intake and group pairs                              | Every 3 days                                |
| [ApSpace Discord Bot][bot]      | Daily and weekly timetable posts, an empty-room finder, online versus physical classes                      | 00:00 Friday to Sunday, 20:00 Sunday        |
| [laravel-apu-schedule][laravel] | PHP package that queries intakes, groups, modules, and the holiday feed                                     | 24-hour cache                               |

- A [GitHub code search][search] for the URL found 32 files in 26 repositories, 17 pushed in 2026 (cron-apu-timetable keeps the URL in a secret). Beyond calendar sync they include CLIs, free-time comparison across intakes, a "study space finder", and [APLife][aplife], which also syncs exams, holidays, and shuttles.
- The bot's author built it because a parent kept asking "Is the timetable still the same as last week?" ([README][bot]). The calendar tool's fetch line is commented "apiit has bad security lol" ([main.py][a2c_main]).
- **Limits:** about ten requests per host drew no throttling or rate-limit headers. No CDN fronts the S3 URL, so APU pays for each 1.1 MB download; API replies pass through CloudFront as cache misses.

[cron]: https://github.com/Hackthletes-APU/cron-apu-timetable
[apsync]: https://github.com/AaronKhoolb/APSync
[a2c]: https://github.com/ian-hon/apspace-to-calendar
[a2c_main]: https://github.com/ian-hon/apspace-to-calendar/blob/main/main.py
[bot]: https://github.com/notedwin-dev/ApSpace-Discord-Bot
[laravel]: https://github.com/chengkangzai/laravel-apu-schedule
[search]: https://github.com/search?q=%22open-ws%2Fweektimetable%22&type=code
[aplife]: https://github.com/osscv/APLife

## Public documents by track

Documents on APU's website, media host, and KB, grouped by the hackathon track each fits best.

### Smart Campus & Student Experience

| Document                                          | Format, size       | Dated                                  | What an agent could answer or do                                                            |
| ------------------------------------------------- | ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Campus Connect shuttle schedule][shuttle]        | PDF, 5 pp, 1.1 MB  | Effective 22 Oct 2026; uploaded 23 Oct | Next weekday departure, LRT Bukit Jalil ↔ APU and each residence route                      |
| [Shuttle services page][shuttle_page]             | HTML               | Not shown                              | Who may board; monthly passes RM70–RM140 by route; Student ID rule                          |
| [Intake calendar][intake]                         | HTML               | Not shown                              | Intake dates by level and programme, through 27 Aug 2027                                    |
| [Level 1 Orientation Guide, Nov 2026][orient]     | PDF, 17 pp, 2.4 MB | Uploaded 27 Oct 2026                   | First-week setup: APKey, APSpace, Office 365, Teams, Moodle, fees due 16 Nov 2026, contacts |
| [APU Student Handbook][handbook]                  | PDF, 36 pp, 448 KB | Version 8.0, 1 Jul 2023                | Attendance, library rules, ICT rules, fees, deferment, withdrawal                           |
| [Guide for new APU students][newguide]            | HTML               | Not shown                              | Campus and residence addresses, getting around Kuala Lumpur                                 |
| [Campus facilities][facilities]                   | HTML               | Not shown                              | Facility list (labs, library, Google Center of Excellence, sports), mostly a gallery        |
| [Library website][library]                        | HTML (WordPress)   | Not shown                              | Opening hours Mon–Fri 8.30 a.m.–7.00 p.m., Sat 9.00 a.m.–1.00 p.m.; e-resources             |
| [Library catalogue (Koha OPAC)][opac]             | HTML               | Live                                   | Search holdings; link a student to a book's record                                          |
| [Health support services][health]                 | HTML               | Not shown                              | On-campus Oceana Clinic services, EMGS medical screening                                    |
| [Insurance for international students][insurance] | HTML               | Not shown                              | Cover details; links the [MiCare panel GP list][micare] (PDF, 81 pp, uploaded 31 Jul 2026)  |
| [APU e-Counselling][ecounsel]                     | HTML               | Not shown                              | Counsellor hours 10 a.m.–7 p.m. and WhatsApp channels                                       |

- The handbook is attached to the KB's [Student Handbook][kb_handbook] page with an APIIT version and two engineering supplements; the PDF's title metadata reads "PROPOSED" and its footer "Version 8.0 - 20230701", so it may lag current rules.
- The orientation guide prints the default first-login password pattern for new students. **Inference:** leave that page out of any agent's data store.
- The e-Counselling page lists counsellors by name and phone. **Inference:** under PDPA, point the agent at the page rather than storing the numbers.

[shuttle]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf
[shuttle_page]: https://www.apu.edu.my/shuttle-services-campus-connect
[intake]: https://www.apu.edu.my/intake-calendar
[orient]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Nov_Level%201%20Orientation%20Guide.pdf
[handbook]: https://apiit.atlassian.net/wiki/download/attachments/1199570953/APU%20Student%20Handbook-Jul%202023.pdf
[kb_handbook]: https://apiit.atlassian.net/wiki/spaces/AA/pages/1199570953
[newguide]: https://www.apu.edu.my/guide-new-apu-students
[facilities]: https://www.apu.edu.my/campus-facilities
[library]: https://library.apu.edu.my/
[opac]: https://opac.apu.edu.my/
[health]: https://www.apu.edu.my/health-support-services
[insurance]: https://www.apu.edu.my/insurance-information-apu-international-students
[micare]: https://publicwebsite-media.apu.edu.my/assets/2026-07/MiCare%20panel%20GP%20list%20(Aso)%20for%20Jun%2026%20(1).pdf
[ecounsel]: https://www.apu.edu.my/apu-e-counselling

### Intelligent Automation & Digital Transformation

These suit NTT DATA's admissions, scholarship, and IT-support examples.

| Document                                                  | Format, size           | Dated                          | What an agent could answer or do                                                            |
| --------------------------------------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| [Undergraduate application form][app_ug]                  | PDF form, 2 pp, 229 KB | Uploaded 23 Jun 2025           | "Part I: Important checklist" of required attachments; check a file against it              |
| [Course pages][course_cs] (138 in the sitemap)            | HTML                   | Not shown                      | Entry requirements, English scores, intakes, yearly fees per course                         |
| [Entry qualifications for international students][entryq] | PDF, 27 pp, 566 KB     | Dec 2025; uploaded 5 Jan 2026  | Map a foreign qualification to SPM or STPM equivalence                                      |
| [International application procedures][intlapp]           | HTML                   | Not shown                      | Five-stage international admission process                                                  |
| [English requirements][english]                           | HTML                   | Not shown                      | Minimum IELTS, TOEFL, PTE, MUET by level                                                    |
| [Scholarships & Merit Awards, Aug 2026][schol]            | PDF, 12 pp, 1.2 MB     | Uploaded 15 Aug 2026           | Discount tiers by SPM, UEC, A-Level, STPM and other results; CGPA 2.50 renewal rule         |
| [Scholarships & financial aid hub][scholhub]              | HTML                   | Not shown                      | Links to Malaysian, international, postgraduate, SPM, UEC, A-Level, IGCSE, external schemes |
| [PTPTN guide, Aug 2026][ptptn]                            | PDF, 8 pp, 4.6 MB      | Uploaded 5 Aug 2026            | Loan eligibility (GPA 2.00), income bands, disbursement into fees                           |
| [Fees & refund policy][refund]                            | HTML                   | Not shown                      | Refund windows (more than 14 days, 50% charge), RM200 transfer fee, payment channels        |
| [Privacy notice (PDPA)][privacy]                          | HTML                   | Not shown                      | What personal data APU collects, why, and who it is disclosed to                            |
| [ICT Regulations][kb_ict] and ITSM policies               | HTML (Confluence)      | 2025–2026                      | Acceptable-use, password, storage, and site-provisioning answers for IT support             |
| [Digital learning quick reference][dlguide]               | PDF, 3 pp, 253 KB      | 17 Mar 2020; uploaded Apr 2025 | Moodle, Teams, APSpace attendance steps; helpdesk contacts (dated)                          |

- Example course page: [BSc (Hons) Computer Science][course_cs] lists 3 years, intakes 24 Nov 2026, 25 Mar 2027 and 6 Jul 2027, and RM104,600 total for Malaysians (RM33,800, RM34,800, RM36,000 by year).
- A postgraduate application form is linked from [Download eBrochures][ebro] beside the undergraduate one.

[app_ug]: https://publicwebsite-media.apu.edu.my/assets/2025-06/e2025%20May%20APU%20Application%20Form_UG-fill%5B4%5D.pdf
[course_cs]: https://www.apu.edu.my/course/bsc-hons-in-computer-science
[entryq]: https://publicwebsite-media.apu.edu.my/assets/2026-01/The%20List%20of%20Entry%20Qualifications%20for%20International%20Student%20-%20Dec%202025.pdf
[intlapp]: https://www.apu.edu.my/international-students-application-procedures
[english]: https://www.apu.edu.my/english-requirements
[schol]: https://publicwebsite-media.apu.edu.my/assets/2026-08/Scholarships&MeritAwards_Aug2026.pdf
[scholhub]: https://www.apu.edu.my/scholarships-financial-aids
[ptptn]: https://publicwebsite-media.apu.edu.my/assets/2026-08/e2026Aug_PTPTN%20Guide-A4-8pp.pdf
[refund]: https://www.apu.edu.my/fees-refund-policy
[privacy]: https://www.apu.edu.my/privacy-policy
[dlguide]: https://publicwebsite-media.apu.edu.my/assets/2025-04/quick_reference_guide_for_students_digital_learning_17032020.pdf
[ebro]: https://www.apu.edu.my/download-eBrochures

### Data-Driven Research & Intelligent Decision Making

APU's own documents are thin for this track; the stronger research sources are external (see [public data sources](/docs/research/data-sources.md#data-driven-research--intelligent-decision-making)).

| Document                                 | Format, size       | Dated                | What an agent could answer or do                                    |
| ---------------------------------------- | ------------------ | -------------------- | ------------------------------------------------------------------- |
| [Course pages][course_cs], all 138       | HTML               | Not shown            | One real table of fees, durations and intakes to compare programmes |
| [Intake calendar][intake]                | HTML               | Not shown            | Intake counts per level and month for planning                      |
| [Postgraduate brochure, Oct 2026][pgbro] | PDF, 49 pp, 5.9 MB | Uploaded 22 Oct 2026 | Postgraduate programme catalogue                                    |
| [Computing brochure, Jul 2026][compbro]  | PDF, 39 pp, 5.7 MB | Uploaded 3 Aug 2026  | Computing programme catalogue                                       |
| [Library catalogue (Koha OPAC)][opac]    | HTML               | Live                 | Holdings by subject, to show what the library already stocks        |

**Inference:** a crawl of the 138 course pages into BigQuery is the one APU-specific document dataset here, and it is a single snapshot, not a time series; the only live APU dataset found is the [timetable feed](#apspace-timetable-feed).

[pgbro]: https://publicwebsite-media.apu.edu.my/assets/2026-10/e2026oct_pg_brochure.pdf
[compbro]: https://publicwebsite-media.apu.edu.my/assets/2026-08/e2026July_Computing.pdf

## Material that is not public

- **Academic regulations and policies:** the KB's Rules & Regulations and Policies & Procedures spaces each show only a welcome page to anonymous visitors.
- **Programme handbooks:** the PD index is public, but a linked handbook page returned `404` without login.
- **Fee schedule as one document:** none found; fees appear only per course page.
- **Academic calendar (semester and exam dates):** not found; only the intake calendar is public. The API's holiday feed lists public holidays, and its examination path returned `[]` for both intakes tried ([Timetable feed endpoints](#timetable-feed-endpoints)).
- **Theses and final-year projects (APres), APSpace, Moodle, Virtual Help Centre tickets:** need an APKey. I didn't log in. I sent only unauthenticated requests to the root URLs of APSpace, `sso.apu.edu.my`, CAS, and the Jira portal to read HTTP status and server headers. APSpace's timetable feed is the exception: it needs no login ([APSpace timetable feed](#apspace-timetable-feed)).

## Terms of use and robots.txt

- **Terms:** APU's [Terms of Use][terms] cover APU, APIIT and related entities, and "our Website and/or service(s)", and show no date. They say the website's text, images and other contents "are protected by copyrights, trademarks and other forms of proprietary rights" and that "Modification of any of the Contents or use of the Contents for any other purpose will be a violation of copyright". Graphics, photographs, video, audio, software and images "may not be reproduced, published, distributed, copied, modified or appropriated or exploited in any manner without written permission of APU". Clause 6 says "You must secure permission from APU prior to hyper-linking to, or use of this Website or any of the Contents". Malaysian law governs.
- **Confluence KB:** I found no separate terms on the KB pages; APU's Terms of Use name "this Website" only.
- **Timetable feed:** the Terms of Use don't name the feed, and it carries no licence; GitHub shows no recognised licence for the APSpace source.
- **robots.txt:** identical on `apu.edu.my`, `www.apu.edu.my` and `new.apu.edu.my` ([robots.txt][robots]): Drupal's default, `User-agent: *` with disallows only for `/admin/`, `/search/`, `/user/*` login paths, `/core/`, `/profiles/` and README files. No `Crawl-delay` and no `Sitemap` line.
- **Feed listing and robots:** the `open-ws` bucket listing returns `403 AccessDenied`; `open-ws/robots.txt` and `api.apiit.edu.my/robots.txt` both return `403`. The Internet Archive indexes one URL under the prefix. Only file names in public source code are known; don't probe for others or bulk-download.
- **Privacy:** the [Privacy Notice][privacy] states compliance with the Personal Data Protection Act 2010. **Inference:** reusing the timetable feed's lecturer names outside APSpace falls under that Act ([Personal data in the timetable feed](#personal-data-in-the-timetable-feed)).
- **Inference:** robots.txt doesn't block a website-crawl data store, but the Terms of Use reserve copyright and ask for permission before "use of this Website or any of the Contents". Because the hackathon is run by APU's School of Technology, the cleanest path is to ask the organisers in `#help-desk` for written permission. For the website, ask to index the public pages and PDFs for a private prototype, keep the data store private, and cite the source URL in every answer. For the timetable feed, name the URL and fields kept, and ask before a demo depends on it. This is a reading of the terms, not legal advice.

[terms]: https://www.apu.edu.my/terms-of-use
[robots]: https://www.apu.edu.my/robots.txt

## Systems APU runs

From public pages, DNS and HTTP headers only.

| System                  | What APU runs                                                            | Public evidence                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email                   | Microsoft 365 (Exchange Online) for staff and students                   | MX `apu.edu.my` → `apu-edu-my.mail.protection.outlook.com`; `mail.apu.edu.my` → `mail-apu-edu-my.mail.protection.outlook.com`; autodiscover → `autodiscover.outlook.com`; SPF `spf.protection.outlook.com` |
| Files and collaboration | Microsoft Teams, OneDrive, SharePoint                                    | [Orientation guide][orient]; [M365 storage policy][kb_m365]: students 10 GB mail and 10 GB OneDrive, staff 50 GB and 200 GB; [site provisioning policy][kb_spo]                                            |
| Identity                | APKey (`TP` number `@mail.apu.edu.my`), Microsoft sign-in, plus CAS      | Storage policy: users "log in to APSpace via Microsoft Single Sign-On"; KB "What is Central Authentication Service?"; `cas.apiit.edu.my` answers on Tomcat                                                 |
| LMS                     | Moodle at `lms2.apiit.edu.my`                                            | `lms.apu.edu.my` redirects there (`303`); [digital learning guide][dlguide]; [intake calendar][intake]; handbook §5.2                                                                                      |
| Student portal          | APSpace: timetable, QR attendance, results, fee statement, bus tracking  | [Orientation guide][orient]; served from Amazon S3 and CloudFront; timetable and shuttle feeds on S3 and API Gateway ([APSpace timetable feed](#apspace-timetable-feed))                                   |
| Helpdesk                | "Virtual Help Centre" on Jira Service Management (`apiit.atlassian.net`) | KB "Create ticket from Outlook" uses the "Jira Cloud add-in on Outlook"; Atlassian TXT verification and SPF include                                                                                        |
| Knowledge base          | Confluence Cloud                                                         | `kb.apu.edu.my` → `apiit.atlassian.net/wiki`                                                                                                                                                               |
| Library                 | Koha catalogue; WordPress site; EBSCO and EZproxy for e-resources        | `opac.apu.edu.my` meta generator "Koha"; `library.apu.edu.my` generator WordPress 6.8 with EBSCO and EZproxy links                                                                                         |
| Website and DNS         | Drupal 10 on Apache; DNS on AWS Route 53; media on Amazon S3             | `x-generator: Drupal 10`; `awsdns` name servers; `server: AmazonS3` on the media host                                                                                                                      |
| Payments                | FPX online payment via APSpace, Flywire, JomPAY                          | [Fees & refund policy][refund]; [orientation guide][orient]                                                                                                                                                |
| ERP or finance          | Not found                                                                | SAP appears only as teaching software: ITSM has SAP GUI 7.50 install guides, and the [careers page][careers] lists ERP-SAP as a lecturing specialisation                                                   |

- **Google:** `apu.edu.my` carries three `google-site-verification` TXT records and a `google-gws-recovery-domain-verification` record, and the campus has a "Google Center of Excellence". No MX points to Google, and a KB article explains syncing the Office 365 calendar to Google Calendar. **Inference:** Google is not APU's email or file platform.
- Other TXT records verify TeamViewer SSO, Apple, Autodesk and the mailers Brevo, Mailjet and Enginemailer.
- A job-posting search turned up no ERP or finance system; the careers page's SAP and AutoCount mentions are requirements for accounting lecturers.

[careers]: https://www.apu.edu.my/careers

## How each source reaches an agent

All of this section is **Inference**; connector features and limits are covered in [Gemini Enterprise](/docs/research/gemini-enterprise.md).

| Source                                                                  | Route into Gemini Enterprise                                                                                                                                             | Supports                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Course, intake, scholarship, refund, shuttle pages                      | Website-crawl data store limited to `www.apu.edu.my` paths such as `/course/*`                                                                                           | Admissions, scholarship, study planning                                            |
| Shuttle, scholarship, PTPTN, application-form, entry-qualification PDFs | Fetch into a team Google Drive folder (Drive connector) or a Cloud Storage data store                                                                                    | Scholarship eligibility, admissions checks                                         |
| ITSM, AA, LIB, VISA, GRAD KB pages                                      | A Confluence connector needs admin rights on APU's site, so fetch public pages by REST into Drive or Cloud Storage with the source URL in each file                      | IT support, student services Q&A                                                   |
| Virtual Help Centre (Jira Service Management)                           | A free Jira Cloud site the team owns, with the Jira connector creating real tickets                                                                                      | IT and HR support                                                                  |
| Microsoft 365 (Outlook, SharePoint, OneDrive, Teams)                    | SharePoint or OneDrive connector on a site the team controls, holding the public PDFs                                                                                    | Every idea; mirrors where APU staff keep files                                     |
| 138 course pages as a table                                             | Load into BigQuery as a structured data store                                                                                                                            | Programme and fee comparisons (research track)                                     |
| APSpace timetable, holiday, shuttle, and location feeds                 | An Apps Script trigger or Cloud Run job polls with `If-None-Match`, diffs each version, and writes to a Sheet or BigQuery, read through the Sheets or BigQuery connector | Free-room finding, class-change crowd and shuttle demand, per-intake change alerts |

- Pairing a 1P source (Drive or website crawl) with 3P connectors that match APU's real stack (SharePoint or OneDrive and Jira) speaks directly to the judges' connector criterion.
- The timetable poll runs day to day without anyone. Filter the 17 MB file by date or intake before writing it to a Sheet.
- Under the real-data rule, every fetch job that fills Drive, a Sheet, or BigQuery should fail loudly and show the error when APU's server errors, and store each file's source URL (for the timetable feed, its ETag) and fetch time.

## Takeaways for this hackathon

- **Evidence:** the public Confluence KB holds 1,189 anonymous-readable pages, 725 of them IT helpdesk articles edited as recently as 3 November 2026. **Inference:** it is the best real knowledge base for an IT-support or student-services agent.
- **Inference:** the APSpace timetable feed is the only live, campus-wide, machine-readable APU operations dataset found. It gives room occupancy by block and level in 15-minute steps; with the holiday, shuttle, and location feeds it supports free-room finding, crowd and shuttle demand at class change, and per-intake change alerts.
- **Inference:** polled into a Sheet or BigQuery ([How each source reaches an agent](#how-each-source-reaches-an-agent)), the feed gives Gemini Enterprise a live source whose poll runs day to day without anyone.
- **Inference:** being undocumented, the feed can change or close any time; intakes already moved to the API, and an open lecturer roster invites a lockdown that a public demo could prompt. Ask permission, drop lecturer fields, and treat the schema as unstable.
- **Evidence:** the application form's checklist, the MQA-based entry-qualification list, and 138 course pages with entry requirements are all public. **Inference:** an admissions agent that checks an applicant's file against the checklist and the course's entry rules is fully groundable.
- **Evidence:** the August 2026 scholarship grid, the PTPTN guide and the refund policy are public. **Inference:** a scholarship-eligibility agent is also groundable, but the grid needs re-keying because its PDF text extracts only partly.
- **Evidence:** APU runs Microsoft 365, Jira Service Management and Confluence, not Google Workspace. **Inference:** SharePoint, OneDrive and Jira connectors mirror APU's real operations better than Gmail or Google Drive alone.
- **Evidence:** academic regulations, programme handbooks and the academic calendar are login-gated. **Inference:** avoid promising answers that depend on them.

## See also

- [Hackathon brief](/docs/BRIEF.md)
- [Hackathon context](/docs/CONTEXT.md)
- [Public data sources](/docs/research/data-sources.md): live public APIs and datasets by track
- [Gemini Enterprise](/docs/research/gemini-enterprise.md): connectors and their limits
- [Google Cloud](/docs/research/google-cloud.md): Cloud and AI products, free tiers, BigQuery sandbox
- [Judging](/docs/research/judging.md): packaging, privacy, and attribution in the deck
- [Project conventions](/docs/references/project-conventions.md): the real-data rule
