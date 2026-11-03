# APU timetable feed

APU's student portal, APSpace, loads every class session from a JSON file on Amazon S3 that anyone can read without a login, and sibling feeds sit on APU's web-service API. This file records what is public, the schema, change behaviour, personal data, terms, and current users. Researched on 4 November 2026.

Contents:

1.  [How this was checked](#how-this-was-checked)
1.  [Endpoints](#endpoints)
1.  [Schema](#schema)
    1.  [Counts](#counts)
    1.  [Room codes](#room-codes)
1.  [Change behaviour](#change-behaviour)
1.  [Personal data and terms](#personal-data-and-terms)
1.  [Who already uses it](#who-already-uses-it)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## How this was checked

- I read the source of the official [APSpace app][apspace_src] (last pushed 5 January 2023), the live APSpace web bundle, and six student tools, then requested only paths named in that code, with plain `curl` and no credentials, from 00:16 to 00:23 MYT on 4 November 2026.
- Raw responses stay outside the repo. Counts come from the 00:16:50 MYT copy; two older copies came from the Internet Archive ([CDX index][cdx]).

[cdx]: https://web.archive.org/cdx/search/cdx?url=s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable

## Endpoints

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
- **API host:** `api.apiit.edu.my` is Amazon API Gateway behind CloudFront, with no ETag or Last-Modified. The shuttle set's date matches the PDF in [APU public documents](/docs/research/apu-public-documents.md).
- APSpace also calls staff-keyed paths such as `lecturer-timetable/v2/<staff ID>` without a login; I didn't request them.

[tt]: https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable
[il]: https://s3-ap-southeast-1.amazonaws.com/open-ws/intake_listing
[api_il]: https://api.apiit.edu.my/student/intake_listing
[api_hol]: https://api.apiit.edu.my/transix-v2/holiday/active
[api_bus]: https://api.apiit.edu.my/transix-v2/schedule/active
[api_loc]: https://api.apiit.edu.my/transix-v2/locations

## Schema

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
| `ROOM`                         | Room; see [Room codes](#room-codes)                                                                                     |
| `COLOR`                        | Display colour: `blue` on exactly the 2,692 ` (Online)` rows, `yellow` otherwise                                        |
| `LECTID`                       | Lecturer code, 2 to 5 capital letters                                                                                   |
| `NAME`                         | Lecturer's full name                                                                                                    |
| `SAMACCOUNTNAME`               | Lecturer's directory account name                                                                                       |

[iface]: https://github.com/ctiteam/apspace/blob/master/src/app/interfaces/student-timetable.ts

### Counts

- **Rows:** 31,606, one per intake per session. By date, start, room, and `MODID` they form 9,854 sessions, shared by 3.2 intakes on average and up to 123.
- **Dates:** 26 October to 22 November 2026, four weeks with 2,652, 2,790, 1,437, and 2,975 sessions. 8 and 9 November are empty; the holiday feed lists them as Deepavali and its day in lieu. Weekends hold 149 rows.
- **Distinct values:** 1,045 intakes (the listing has 2,001), 3,464 module sections, 857 module titles, 236 rooms, 492 lecturers.
- **Room use:** from 09:00 to 17:00 on the weekdays of the week of 2 November, a mean of 107 of 222 physical rooms held a class in each 15-minute slot (range 5 to 159).
- **History:** archived copies from 10 April 2025 (28,924 rows, 7 to 26 April) and 16 June 2025 (21,061 rows, 9 to 29 June) have the same 18 fields: a rolling three-to-four-week window, stable for at least 19 months.

### Room codes

- 178 rooms follow `Block-Level-Room`: `B-08-01` is Block B, level 8, room 01. Blocks: A (10 rooms, levels 4 to 6), B (62, levels 1 to 9), C (3, levels 3 and 9), D (52, levels 6 to 9), E (34, levels 5 to 9), S (17, levels 4 to 8). Some carry a label, as in `S-05-03 (Architecture Studio)`.
- 44 are named: 29 `Tech Lab <level>-<room>` labs, 7 auditoriums with the level in the name (`Auditorium 3 @ Block C Level 9`), and library discussion, cyber-range presentation, and culinary rooms.
- 14 are online (`ONLMCO3-1`, `ONLMCO3-10` to `-21`, `ONLINE`), with 227 sessions. The `ONLMCO3-*` rows still say `LOCATION` `APU CAMPUS`, so filter online classes by the `ONL` room prefix.
- Two rows end `Tech Lab 6-16 (iMac Suite)` with a stray U+FFFD; trim room names before grouping.

## Change behaviour

- **Two fetches:** 3 November 2026 at 23:53:03 MYT and 4 November at 00:16:50 MYT. Same ETag, Last-Modified, version ID, and SHA-256 of the decoded JSON: 0 sessions added, removed, or changed. The gap was 24 minutes, so this says nothing about cadence.
- **Last write:** both `open-ws` objects were written in the same second, 28 October 2026 at 09:39:49 MYT, and the window still starts with the week of 26 October. **Inference:** one job writes both files, weekly or less often.
- **Cheap check:** `If-None-Match` with the ETag and `If-Modified-Since` each returned `304` with an empty body (00:20:17 and 00:20:18 MYT). A poller can check often and download 1.1 MB only when the ETag moves.
- **Diff key:** with every non-personal field as the key, 37 rows still collide because they differ only in lecturer (co-taught). Dropping lecturer fields and de-duplicating leaves 31,569 rows.

## Personal data and terms

- **Fields that identify people:** `NAME`, `SAMACCOUNTNAME`, and `LECTID` cover 492 lecturers and, with `ROOM` and times, place each named person in a room for every class over four weeks. Drop all three at ingest, before storage, logs, or a model prompt. No field names a student.
- **Law:** APU's [Privacy Notice][privacy] states compliance with the Personal Data Protection Act 2010. **Inference:** reusing lecturer names outside APSpace falls under that Act.
- **Terms:** APU's [Terms of Use][terms] cover "our Website and/or service(s)" and say "You must secure permission from APU prior to hyper-linking to, or use of this Website or any of the Contents". The feed isn't named and carries no licence; GitHub shows no recognised licence for the APSpace source. **Inference:** ask the organisers in `#help-desk` for written permission, naming the URL and fields kept, before a demo depends on it. This is not legal advice.
- **Listing and robots:** bucket listing returns `403 AccessDenied`; `open-ws/robots.txt` and `api.apiit.edu.my/robots.txt` both return `403`. The Internet Archive indexes one URL under the prefix. Only file names in public source code are known; don't probe for others or bulk-download.

[privacy]: https://www.apu.edu.my/privacy-policy
[terms]: https://www.apu.edu.my/terms-of-use

## Who already uses it

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

## Takeaways for this hackathon

- **Inference:** this is the only live, campus-wide, machine-readable APU operations dataset found. It gives room occupancy by block and level in 15-minute steps; with the holiday, shuttle, and location feeds it supports free-room finding, crowd and shuttle demand at class change, and per-intake change alerts.
- **Inference:** an Apps Script trigger or Cloud Run job that polls with `If-None-Match`, diffs each version, and writes to a Sheet or BigQuery gives Gemini Enterprise a live source it can read through the Sheets or BigQuery connector, and the poll itself runs day to day without anyone. Filter the 17 MB file by date or intake before a Sheet, store each ETag and fetch time, and show the error when a fetch fails, per the real-data rule.
- **Inference:** being undocumented, the feed can change or close any time; intakes already moved to the API, and an open lecturer roster invites a lockdown that a public demo could prompt. Ask permission, drop lecturer fields, and treat the schema as unstable.

## See also

- [Public data sources](/docs/research/public-data-sources.md)
- [APU public documents](/docs/research/apu-public-documents.md)
- [Hackathon context](/docs/CONTEXT.md)

[apspace_src]: https://github.com/ctiteam/apspace
