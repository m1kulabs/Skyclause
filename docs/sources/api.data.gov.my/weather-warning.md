# Weather warnings

MET Malaysia's weather warnings from the data.gov.my Weather API, behind the warnings that [DESIGN](/docs/DESIGN.md#voice-and-content) sets in Malay with an English gloss, and the source health rows. Captured from the [warning feed](https://api.data.gov.my/weather/warning/) at 21:13 MYT on 5 November 2026, a minute after the JPS rain series.

- [`weather-warning-20261105T1313Z.json`](weather-warning-20261105T1313Z.json), named for its capture time in UTC: the response body byte for byte (HTTP 200, 8,888 bytes). It holds 4 records: two Strong Winds and Rough Seas warnings issued at 20:30, the Thunderstorms Warning issued at 21:05 and valid 21:00 to 01:00, and a No Advisory record issued at 17:30.
- The [Weather API](https://developer.data.gov.my/realtime-api/weather) licenses all weather feeds under CC BY 4.0, so the copy credits MET Malaysia via data.gov.my.
