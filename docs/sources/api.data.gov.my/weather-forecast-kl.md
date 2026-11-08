# Kuala Lumpur weather forecast

MET Malaysia's forecast from the data.gov.my Weather API, preserved for parser tests. The capture contains 21 published records across `Ds058`, `St009` and `Tn079`; the pilot binds only the seven `Ds058` district forecasts for 8–14 November 2026.

## Contents

- [Capture provenance](#capture-provenance)
- [Licence and use](#licence-and-use)

## Capture provenance

- Exact request: [Kuala Lumpur forecast feed][feed].
- Captured at `2026-11-08T01:44:13.158881Z` (UTC), HTTP 200, `application/json`.
- [Response body](weather-forecast-kl-20261108T014413Z.json): 6,653 bytes, copied without formatting from the preimplementation public capture. SHA-256: `1a4ec347805b28a3a5492513e922bd91fc177b3b8715c2efcab355d766487877`.
- [Capture metadata](weather-forecast-kl-20261108T014413Z-metadata.json) retains the inspected request, receipt time, status, location identities and dates, with byte count and attribution.
- [Pilot fixture](/pilot/fixtures/weather-forecast-kl-20261108T014413Z.json) is byte-for-byte identical; parser tests verify equality and SHA-256. No additional HTTP request was made to create these copies.

[feed]: https://api.data.gov.my/weather/forecast/?contains=Kuala%20Lumpur@location__location_name

## Licence and use

Credit: MET Malaysia via data.gov.my, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), under the [Weather API licence](https://developer.data.gov.my/realtime-api/weather). Published forecast strings remain unchanged. These captures are test inputs, never runtime fallback data.
