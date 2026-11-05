# Rainfall graph for station 75

The 5-minute rain series for JPS gauge `0232901RF`, Sg. Kuyoh di LRT Bukit Jalil, station 75 on the JPS Kuala Lumpur flood portal, which [DESIGN](/docs/DESIGN.md#overview) replays for the 2 November 2026 storm. Captured from the [rainfall graph endpoint](https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75) at 21:12 MYT on 5 November 2026. The endpoint keeps 7 days, so after 9 November this copy is the only record of 2 November.

- [`rainfall-graph-75-20261105T1312Z.json`](rainfall-graph-75-20261105T1312Z.json), named for its capture time in UTC: the response body byte for byte (HTTP 200, 127,043 bytes). It holds the station record and 2,269 readings, one every 5 minutes from 29 October 00:00 to 5 November 21:00; `timestamp` is MYT without an offset, and `rf` and `dailyrf` are in mm.
- No published terms for this endpoint were found on 5 November 2026, so the copy is kept for the replay while this repository is private; [#36](https://github.com/m1kulabs/Skyclause/issues/36) tracks confirming them before publishing.
