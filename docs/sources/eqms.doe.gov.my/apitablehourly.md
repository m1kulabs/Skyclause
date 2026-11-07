# APIMS hourly history capture

Captured the [DOE APIMS hourly endpoint](https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly) on 7 November 2026 for #53, before implementing the feeder. Every response body below is retained byte for byte; request URLs, UTC capture times, HTTP statuses, byte counts and SHA-256 values are in the [capture manifest](apitablehourly-20261107-capture-manifest.json).

## Coverage

The 12 requested state/day combinations all returned HTTP 200. The 31 October 23:00 request was empty for all three states. Requests through 23:00 on 1, 2 and 3 November returned 25 hourly records for each bound station, from the preceding day at 23:00 through the requested hour. Overlapping requests retain the original bodies; deduplicating by station and timestamp yields 73 distinct hourly readings per bound station from 31 October 23:00 through 3 November 23:00. The 31 October 06:00 observations are unavailable; nothing was invented to fill them.

| Station | State | Requested through (MYT) | Bound rows | Raw response                                                                                                                 |
| ------- | ----: | ----------------------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------- |
| `CA16W` |    14 | 2026-10-31T23:00:00     |          0 | [apitablehourly-state14-20261031T230000-20261107T080610Z.json](apitablehourly-state14-20261031T230000-20261107T080610Z.json) |
| `CA16W` |    14 | 2026-11-01T23:00:00     |         25 | [apitablehourly-state14-20261101T230000-20261107T080610Z.json](apitablehourly-state14-20261101T230000-20261107T080610Z.json) |
| `CA16W` |    14 | 2026-11-02T23:00:00     |         25 | [apitablehourly-state14-20261102T230000-20261107T080610Z.json](apitablehourly-state14-20261102T230000-20261107T080610Z.json) |
| `CA16W` |    14 | 2026-11-03T23:00:00     |         25 | [apitablehourly-state14-20261103T230000-20261107T080610Z.json](apitablehourly-state14-20261103T230000-20261107T080610Z.json) |
| `CA19B` |    10 | 2026-10-31T23:00:00     |          0 | [apitablehourly-state10-20261031T230000-20261107T080610Z.json](apitablehourly-state10-20261031T230000-20261107T080610Z.json) |
| `CA19B` |    10 | 2026-11-01T23:00:00     |         25 | [apitablehourly-state10-20261101T230000-20261107T080610Z.json](apitablehourly-state10-20261101T230000-20261107T080610Z.json) |
| `CA19B` |    10 | 2026-11-02T23:00:00     |         25 | [apitablehourly-state10-20261102T230000-20261107T080610Z.json](apitablehourly-state10-20261102T230000-20261107T080610Z.json) |
| `CA19B` |    10 | 2026-11-03T23:00:00     |         25 | [apitablehourly-state10-20261103T230000-20261107T080610Z.json](apitablehourly-state10-20261103T230000-20261107T080610Z.json) |
| `CA17W` |    16 | 2026-10-31T23:00:00     |          0 | [apitablehourly-state16-20261031T230000-20261107T080610Z.json](apitablehourly-state16-20261031T230000-20261107T080610Z.json) |
| `CA17W` |    16 | 2026-11-01T23:00:00     |         25 | [apitablehourly-state16-20261101T230000-20261107T080611Z.json](apitablehourly-state16-20261101T230000-20261107T080611Z.json) |
| `CA17W` |    16 | 2026-11-02T23:00:00     |         25 | [apitablehourly-state16-20261102T230000-20261107T080611Z.json](apitablehourly-state16-20261102T230000-20261107T080611Z.json) |
| `CA17W` |    16 | 2026-11-03T23:00:00     |         25 | [apitablehourly-state16-20261103T230000-20261107T080611Z.json](apitablehourly-state16-20261103T230000-20261107T080611Z.json) |

## Request and response details

`datetime` is an offset-less MYT hour string, such as `2026-11-02T23:00:00`. Responses are objects with an `api_table_hourly` array. The recorded station IDs are `CA16W` (state 14, Cheras), `CA19B` (state 10, Petaling Jaya) and `CA17W` (state 16, Putrajaya). Responses also include other stations in the same state; no records were removed from these captures.

The bound records expose `DATETIME`, `API` and `PARAM_SYMBOL`, but no `CLASS` field. The historical parser must preserve that absence rather than manufacture a class string. The latest map feed still has its own captured shape in [mapcaqm.md](mapcaqm.md).

A [separate invalid-hour probe](apitablehourly-state14-invalid-datetime-20261107T080654Z.json) sent `datetime=not-an-hour`; it returned HTTP 200 and the recent series from `2026-11-06T17:00:00` to `2026-11-07T16:00:00`, rather than a validation error. Historical ingestion must verify returned observation times against its requested interval so an ignored parameter cannot become mislabeled history.

## Licence and use

The [existing map-feed capture note](mapcaqm.md) records that no published terms for this undocumented endpoint were found on 5 November 2026. These captures remain in the private repository for parser/replay evidence; #36 tracks confirming terms before publication. Recorded bodies are test/replay inputs, never fallback readings for a failed live source.
