# Unfiltered MET forecast capture

On 11 November 2026, one read-only GET to `https://api.data.gov.my/weather/forecast/` returned HTTP 200. The existing worker captured transport applied weather-family admission, a 20-second timeout, manual redirects, and no retries. No credentials were sent. Capture times, request identity, latency, response headers, and policy are recorded in [the capture metadata](weather-forecast-all-20261111T140148Z-metadata.json).

[The archived body](weather-forecast-all-20261111T140148Z.json) contains the exact decoded response entity bytes returned by that transport: 919,092 bytes, SHA-256 `4cfd224c629aaf6f4655d613b8624f5543251659da8c414146b492b2dfeec5f1`. Fetch decoded the provider's Brotli content encoding. The source test fixture is byte-identical; neither file has been reformatted.

The response is a top-level array of 3,080 records with 440 distinct published location IDs. Each ID has exactly seven records, dated 11–17 November 2026, and one consistent published location name. The response provides no total-count or next-page field. Discovery retains these published identities and names with null coordinates. This capture does not establish a total provider inventory or a future fixed count.

The official [Weather API documentation](https://developer.data.gov.my/realtime-api/weather) describes a seven-day forecast and nested published location identities. Its [request query documentation](https://developer.data.gov.my/request-query) documents an optional record limit; its [response format documentation](https://developer.data.gov.my/response-format) describes a default record list and an optional metadata envelope. These pages were read on 11 November 2026. They do not document a default forecast cap, an offset, or a pagination contract. No truncation was demonstrated in this response, and no undocumented pagination or extra limit-probing request was added.

This archive is test evidence. Runtime discovery always requests the provider through the injected captured transport; it never imports the archive.
