# Rapid Rail origin-destination ridership

Daily station-to-station ridership for the Rapid Rail network, behind the Crowd `sp17_exits` readings (#68). Captured from the [dataset metadata](https://raw.githubusercontent.com/data-gov-my/datagovmy-meta/main/data-catalogue/ridership_od_rapidrail_daily.json) at 22:56 MYT on 6 November 2026, a minute before the 2026 parquet.

- [`ridership-od-rapidrail-daily-20261106T1456Z.json`](ridership-od-rapidrail-daily-20261106T1456Z.json), named for its capture time in UTC: the metadata response body byte for byte (HTTP 200, 5,352 bytes). It reports `data_as_of` 2026-11-05 23:59, `last_updated` 2026-11-06 16:05 and `next_update` 2026-11-07 22:00, all read as MYT, with editions 2023–2026.
- The yearly parquets at `https://storage.data.gov.my/transportation/rail/rapidrail_{yyyy}_daily.parquet` (HTTP 200, columns `origin, destination, date, ridership` with `date` a timestamp; 2023, 2024 and 2026 are ZSTD, 2025 is BROTLI):

  | Edition | Bytes     | Last-Modified                 | ETag                               | Rows      | Nights                |
  | ------- | --------- | ----------------------------- | ---------------------------------- | --------- | --------------------- |
  | 2023    | 5,719,014 | Mon, 21 Sep 2026 15:12:49 GMT | `d3aefc087f22dd8c0cab1578cbdbc9ab` | 6,332,750 | 2023-01-01–2023-12-31 |
  | 2024    | 6,099,463 | Wed, 23 Sep 2026 16:05:56 GMT | `c2091947d3fadd5d39692709d805266e` | 6,350,100 | 2024-01-01–2024-12-31 |
  | 2025    | 5,491,753 | Thu, 02 Apr 2026 03:02:42 GMT | `c780a99da2c98af56271a70c206fda93` | 6,169,960 | 2025-01-01–2025-12-31 |
  | 2026    | 5,463,471 | Fri, 06 Nov 2026 08:05:37 GMT | `38d85f43273d68e7c56b36b0f25ad1a9` | 5,362,695 | 2026-01-01–2026-11-05 |

- [`rapidrail-sp17-extract-20261106T1456Z.json`](rapidrail-sp17-extract-20261106T1456Z.json): every 2026-edition row with destination `SP17: Bukit Jalil` for 10 January and 1–4 November 2026 (735 rows in 5 day groups of 147, each with its `A0: All Stations` total row), projected to `origin, destination, date, ridership` with `date` as `YYYY-MM-DD`. Extract query: keep rows where `destination` is `SP17: Bukit Jalil` and the day is 2026-01-10 or 2026-11-01 to 2026-11-04, then sort by day and origin. 10 January sums to 38,447 exits excluding `A0: All Stations` (76,894 with it); 4 November, a concert night, sums to 33,804.
- The [data.gov.my FAQ](https://open.data.gov.my/faq) licenses this dataset under CC BY 4.0, so the copies credit Rapid Rail via data.gov.my.
