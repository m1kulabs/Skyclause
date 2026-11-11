# APIMS history recon, 10 November 2026

The [manifest](manifest.json) records three serial public GETs made on 10 November 2026 at 14:19:22 UTC. Each had a 20-second deadline and no retries or credentials. The response files preserve the original bytes; the manifest records their original URLs, request start/end clocks, status, size and SHA-256.

States 14, 10 and 16 returned HTTP 200 with 50, 150 and 25 rows respectively. Every station has 25 inclusive hourly observations from 9 November 22:00 through 10 November 22:00 MYT. Every row omits `CLASS`; `PARAM_SYMBOL` is retained verbatim. `datetime` is an offset-less MYT hour.

This recon verifies the current one-day response shape and alignment. It does not establish a fresh 72-hour history window, historical retention bounds, ingestion, deployment or live acceptance. The successful three-day bodies archived in the [7 November capture set](../apitablehourly.md) supply the independent full-window parser fixtures. No additional GETs were made during Task 1 implementation.
