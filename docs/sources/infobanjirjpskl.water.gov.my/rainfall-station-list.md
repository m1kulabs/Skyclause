# JPS rainfall station list

The official Kuala Lumpur portal exposes its station catalogue in [the latest-data table](https://infobanjirjpskl.water.gov.my/Rainfall/LatestData/All). The archived [response body](rainfall-latest-data-all-20261110T1215Z.html) is preserved byte-for-byte; it is evidence and a test fixture, never a runtime fallback.

Contents:

1. [Collection provenance](#collection-provenance)
1. [Catalogue interpretation](#catalogue-interpretation)
1. [Local ingestion evidence](#local-ingestion-evidence)

## Collection provenance

The recon manifest was observed at `2026-11-10T12:15:28.616407+00:00`. The filename uses that manifest time as an approximate collection time. Individual HTTP request timestamps were not separately recorded, so this is not an exact timestamp for the latest-data response.

The request chain was `/Rainfall` → `/Rainfall/Summary` → `/Rainfall/District/9` → `/Rainfall/LatestData/All`. These are the four response hashes recorded by the recon manifest; only the final body is added as a new repository capture.

| Official URL                                                                             |   Bytes | SHA-256                                                            |
| ---------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------ |
| [/Rainfall](https://infobanjirjpskl.water.gov.my/Rainfall)                               |  19,951 | `2939983cecb665cb7d88f6f516f57bb2ed34ce94c6f60852f52d5f77bf6623d9` |
| [/Rainfall/Summary](https://infobanjirjpskl.water.gov.my/Rainfall/Summary)               |  17,393 | `37d0b3e3cbcbe7674540569cfc84bad78404cb6b08ece40ef7921588e7ec7b8c` |
| [/Rainfall/District/9](https://infobanjirjpskl.water.gov.my/Rainfall/District/9)         |  39,048 | `8711666a851879e29dd7d59a66fc7712d555ca1df0fc3588e415758f85da0403` |
| [/Rainfall/LatestData/All](https://infobanjirjpskl.water.gov.my/Rainfall/LatestData/All) | 228,937 | `2bbe128c892708226c4419a57ce401e57d4933d1feab3e99ed0f5a8254a82d8b` |

## Catalogue interpretation

The exact `table#Online-rainfalldata` contains 49 stations. Its external ID `0232901RF` is linked to internal station 75, named `SG. KUYOH DI LRT BUKIT JALIL`, district `Seputeh`. Discovery reads displayed ID/name/district and the relative `/Rainfall/Station/{id}?districtId=0` link, and builds the fixed official graph URL. It ignores the separate historical summary tables, rainfall totals and map JavaScript.

All discovered latitude and longitude values stay null for #121. The original graph capture has null coordinates. This newer HTML includes map coordinates, but the accepted adapter scope preserves nulls rather than transcribing or inferring coordinates. The table publishes no state text, so discovery omits `meta.state`. The graph separately publishes `KL`.

The [original graph capture](rainfall-graph-75.md) remains 127,043 bytes with SHA-256 `25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95`. Copies of both bodies in `packages/sources/test/fixtures/` are registered in `fixtures.json` with matching hashes. The station-list manifest explicitly labels its timestamp as approximate.

## Local ingestion evidence

The real graph capture passed the registered adapter, durable capture/result pipeline and PostgreSQL ingestion in local integration tests. One ownerless gauge bound to two tenant projects produced 2,269 revision-1 readings, one poll and two project events from one HTTP request. A later normal poll of identical bytes appended no readings and persisted `unchanged`; changing one `rf` in a test-only copy appended exactly one revision-2 reading while retaining all original rows. Renamed `data`, text `rf` and mismatched `stationId` each persisted a `schema` error poll with zero new readings against populated history. Transport doubles returned HTTP 200 and advanced the test clock by 37 ms; those status/latency values reached PostgreSQL. They are local measurements, not live provider latency. A separate wall-clock measurement of explicit PostgreSQL ingestion took 4,804 ms initially, 5,864 ms unchanged and 5,812 ms for the correction. The existing writer visits each observation to maintain its capture head and compare prior values; unchanged bodies therefore still incur database work. Only the full-capture test cases receive a 60-second timeout; small cases and existing/global timeouts remain unchanged.

Job-first, event-first and concurrent first-bind executions reuse the actual durable backfill capture within the gauge's 300-second cadence, including immediate reuse after ingestion acknowledgement. The result retains purpose `backfill`; it does not establish normal live-poll freshness. At the next cadence the job issues a normal poll. Neither tenant count nor a new runtime instance multiplies the first request.

The graph's `data[].timestamp`, `data[].rf` and top-level `stationId` paths are verified by the archived body and parser tests. Production scheduling is configured for five-minute MYT execution with zero retries. The existing Scheduler-to-Cloud Run call does not carry the actual scheduled instant, so `scheduled_at` and scheduler lag remain null. No deployment, live execution, scheduler-lag measurement or 288-slot/24-hour evidence is claimed by these tests.
