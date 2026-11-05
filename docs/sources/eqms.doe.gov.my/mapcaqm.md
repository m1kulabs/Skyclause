# APIMS mapcaqm feed

The latest Air Pollutant Index for all 68 DOE continuous monitoring stations, behind the API readings in [DESIGN](/docs/DESIGN.md#overview)'s landing example and source health rows. Captured from the [APIMS map feed](https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm) at 21:13 MYT on 5 November 2026, a minute after the JPS rain series.

- [`mapcaqm-20261105T1313Z.json`](mapcaqm-20261105T1313Z.json), named for its capture time in UTC: the response body byte for byte (HTTP 200, 17,031 bytes). Every station's `RECORD_DT` is 21:00 MYT; `CA16W` Cheras reads 67, `CA19B` Petaling Jaya 57 and `CA17W` Putrajaya 62, all "Moderate".
- No published terms for this undocumented endpoint were found on 5 November 2026, so the copy is kept for the examples while this repository is private; [#36](https://github.com/m1kulabs/Skyclause/issues/36) tracks confirming them before publishing.
