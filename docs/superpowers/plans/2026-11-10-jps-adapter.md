# JPS Rain Adapter Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user already chose the parent session's parallel execution method; no new design interview is needed. This document itself authorizes no implementation or deployment.

**Goal:** Poll and discover real JPS rain gauges through Source120 and expose the three browser-safe rain indicator definitions.

**Architecture:** One per-source adapter uses the existing capture/ingestion runner; one pure parser maps the complete graph payload atomically. Discovery reads the actual portal station table independently of PollContext. The indicator export is isolated from all server code.

**Tech Stack:** Existing TypeScript, Bun, Vitest, Zod contract, PostgreSQL test harness and Terraform job module; no new runtime parser/network dependency.

**Spec:** [JPS design](/docs/superpowers/specs/2026-11-10-jps-adapter-design.md), [#121](https://github.com/m1kulabs/Skyclause/issues/121), [#79](https://github.com/m1kulabs/Skyclause/issues/79). Code baseline `a100fec`; implement after Source120 is merged, using its final APIs.

**Execution base:** d50cd8b813829c5d3d18e31a3e18d10630fd3bf7 for pure Task1; Task2 integrates Source120 first.

## Global constraints

- Real published data only; byte-for-byte archived captures; doubles and mutated captures stay in tests.
- `cadence: 300`, `observed`, `per_source`, no `apiFamily`, no retries; licence ID null and exact label from the design.
- No imports from `pilot/`; no PostgreSQL in scheduled adapter execution; no SourceAdapter/PollContext signature change.
- `rain_5m_mm`, `mm`, `valueJson: null`; source metric contract already exists and needs no migration.
- Keep discovered coordinates null; no typed coordinate constants, cached/dummy catalogue or provider fallback.
- Every shell command starts with `rtk`. No builds, installations, GitHub mutations or source edits were performed to prepare this plan.

## Review focus

- Wrong source IDs or unsafe `meta.jps_id` cannot fetch another URL or persist readings for another gauge.
- Calendar rollovers, nonfinite rainfall and conflicting duplicate timestamps fail the complete poll atomically.
- HTML structural drift or partial malformed station rows preserve the previous catalogue by throwing before its transaction.
- Discovery requires configured User-Agent and ends on timeout, redirects or HTTP failure with no retry/fallback.
- The public indicator subpath bundles for browsers without importing environment or server modules.

### Task 1: Real parser, discovery and browser indicator export

**Files:**

- Create `packages/sources/src/adapters/jps.ts` (adapter/factory, fixed URL, fetch/backfill).
- Create `packages/sources/src/adapters/jps-parser.ts` (pure graph/timestamp parser).
- Create `packages/sources/src/adapters/jps-discovery.ts` (pure table parser plus bounded discovery HTTP boundary).
- Create `packages/sources/src/indicators/index.ts` (three definitions and aggregate export).
- Modify `packages/sources/package.json` (`./indicators` export; type dependency `@skyclause/clauses`) and `packages/sources/tsconfig.json` (clauses project reference).
- Create `packages/sources/test/jps.test.ts`, `packages/sources/test/jps-discovery.test.ts`, `packages/sources/test/indicators.test.ts`.
- Create `packages/sources/test/fixtures/fixtures.json`; copy `rainfall-graph-75-20261105T1312Z.json` byte-for-byte from the existing docs capture and latest-data HTML byte-for-byte from `121-recon/Rainfall-LatestData-All.html` as `rainfall-latest-data-all-20261110T1215Z.html`.
- Create `docs/sources/infobanjirjpskl.water.gov.my/rainfall-latest-data-all-20261110T1215Z.html` from the same recon bytes and `rainfall-station-list.md` recording URL, capture time, body hash, discovery chain and null-coordinate decision. Record all four recon URLs/hashes from `recon-manifest.json`; only the list body is needed as a new repository capture.

**Interfaces:**

- `jpsGraphUrl(source: Source): string` validates positive safe-integer `meta.jps_id` and returns the fixed provider URL.
- `parseJpsRainfall(raw: unknown, source: Source): ReadingInput<'jps_rain'>[]` is pure and throws `SchemaError`.
- `parseJpsStationList(html: string): DiscoveredSource[]` is pure and throws `SchemaError`.
- `JpsDiscoveryOptions = {discoveryHttp?: typeof fetch; userAgent?: string}`; `createJpsRainAdapter(options?: JpsDiscoveryOptions): SourceAdapter<unknown>`; `jpsRain` is the canonical instance.
- `jpsRainIndicators` and `indicators` are `IndicatorDefinition[]`; no runtime import from clauses is required.

- [ ] Write failing tests against the actual graph: SHA-256 `25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95`, 127,043 bytes; 2,269 readings; UTC boundaries `2026-10-28T16:00:00.000Z` and `2026-11-05T13:00:00.000Z`; every adjacent interval 300,000 ms; 2 November `07:00Z` value 9.5; `(06:00Z,07:00Z]` sum 39 and `(06:00Z,08:00Z]` sum 63. Each output matches the existing source metric's unit/value_json schema and uses the bound UUID.
- [ ] Add failures for renamed `data`, text `rf`, another `stationId`, invalid object/row/date, `2026-02-30T15:00:00`, hour 24, unsupported offset and NaN/Infinity. Assert all throw `SchemaError`; identical duplicate collapses and conflicting duplicate rejects; empty `data` returns `[]`. Assert UTC conversion at MYT midnight and optional explicit `+08:00` spelling agree.
- [ ] Add fixed-URL tests: station 75 produces the exact no-query endpoint; invalid/string/negative/fractional/unsafe IDs reject before HTTP; a hostile `source.url` is ignored. Fetch/backfill each make exactly one `ctx.http` call, use JSON Accept, return the same body, consume no family budget and propagate HTTP/timeout errors without retry. More/less than one source rejects.
- [ ] Add actual-list tests: SHA/size from design; exactly 49 unique station IDs; `0232901RF` maps to 75, published name and Seputeh; all coordinates null; names with numeric character entities decode. Mutations removing table/tbody or changing a row ID/name/district/link fail visibly; conflicting internal/external IDs reject. Assert adapter TypeScript contains no numeric coordinate pair and no static list fallback.
- [ ] Add injected discovery transport tests for exact list URL, HTML Accept, configured User-Agent, `redirect: 'manual'`, 20-second timeout, one request, no retry; 302/500, network and malformed HTML reject. Missing/blank factory+environment User-Agent fails before HTTP; explicit nonempty factory User-Agent wins. Verify construction/import reads no environment or network; resolve defaults only on executed discover.
- [ ] Add indicator assertions for exact three names/scopes/types/units/source kinds and `satisfies IndicatorDefinition[]`. In the test, invoke the installed Bun CLI to bundle a temporary entry importing `@skyclause/sources/indicators` with `--target browser`, capture stdout, import the compiled output and assert the same exports. Assert output contains no process/environment/adapter/worker/Node imports. All temporary files live in the test temp directory and are removed.
- [ ] Run `rtk bun run test -- packages/sources/test/jps.test.ts packages/sources/test/jps-discovery.test.ts packages/sources/test/indicators.test.ts`; confirm the new tests fail for missing implementation, not bad fixture paths.
- [ ] Implement only the interfaces above. Keep parser logic free of transport/process; use bounded table/tbody/row/cell extraction and entity decoding, without evaluating map JS. Reject malformed station rows atomically. Resolve discovery options lazily with required environment User-Agent at the server boundary. Port strict timestamp round-trip logic from the pilot into the new pure parser without imports. Add exports/dependency/reference and capture notes.
- [ ] Re-run the same focused tests and `rtk bun run typecheck`; expect PASS. Commit only Task 1 files with `feat: parse and discover JPS rain gauges` after required checks.

### Task 2: Register, prove Source120 ingestion and schedule the real feed

**Files:**

- Modify `packages/sources/src/adapters/index.ts` (import/register canonical `jpsRain`).
- Create `apps/worker/test/sources-jps.test.ts` (actual adapter + actual capture through Source120 and real PostgreSQL).
- Create `infra/environments/production/jps-rain.tf` (existing job module).
- Update only the source capture note/PR verification text with measured results; no runner, evaluator, reducer or UI source changes.

**Interfaces:**

- Consume Task 1's `jpsRain`, Source120 `createSourceJobs`, `executeAdapter`, `createPollContext`, `publishSourceResult`, `ingestSourceResult`, `sourceIngestionDatabase`, and existing `MemoryStore`/`TestClock` test support.
- Production command is existing `node main.js job adapter jps_rain`; exposed `runAdapter(kind, scheduledAt)` remains unchanged.

- [ ] Write a failing registry/integration test with the real adapter, real captured HTTP body and one ownerless gauge bound to two tenant projects. Scheduled execution reads a poll-plan object and publishes a durable result without any database method being called; only explicit ingestion writes PostgreSQL. Exercise a fresh bound-source backfill explicitly, then a normal scheduled poll after that backfill is complete. Count exactly one GET for each request purpose, shared across both tenants; tenant count must never multiply HTTP requests. Separately pin the first-run `jobs.runAdapter` behavior: inspected Source120 can issue backfill plus normal GET in that invocation, conflicting with #121's one-request-per-gauge-per-slot budget. Require the merged Source120 successor to settle that admission behavior before claiming budget acceptance; do not silently weaken the test or edit its runner in this task. Assert one persisted poll per source/request, correct event fanout, 2,269 revision-1 readings and real HTTP 200/latency values.
- [ ] Re-poll the unchanged captured body under a fresh request and ingest: assert persisted outcome `unchanged`, zero new readings. Change exactly one `rf` in a test-only copy and repeat: assert exactly one appended reading at revision 2, prior revision retained, other readings unchanged. Exercise both backfill and subsequent scheduled poll; do not rely on a stale plan body digest to prove dedupe.
- [ ] Execute each test-only schema mutation (`data` renamed, one `rf` text, different `stationId`) through real fetch/parse/runner/durable ingestion. Each new request yields exactly one `schema` error poll for the gauge with actual status/latency and zero readings, regardless of an already populated reading history. No previous observation is returned as a fallback. No evaluator assertion belongs here (#133 owns No call).
- [ ] Exercise catalogue sync with actual parsed list and a real catalogue transaction: the gauge has `jps_id: 75`, null coordinates, 300-second cadence, 600-second stale-after and null licence ID. Inject malformed discovery response before the transaction and assert existing catalogue rows are preserved. Add static configuration assertions for job arguments, `*/5 * * * *`, `Asia/Kuala_Lumpur`, and zero retries; unknown scheduled instant stays null, never wall-clock rounded.
- [ ] Run `rtk bun run test -- apps/worker/test/sources-jps.test.ts` against the existing #79 PostgreSQL harness and record RED due to missing registration/job configuration. Use the parent's already provisioned test PostgreSQL endpoint; do not install packages or rebuild containers just for this plan.
- [ ] Register `jpsRain` and implement one Terraform module block named `jps_rain` with job name `adapter-jps-rain`, args `["job", "adapter", "jps_rain"]`, 5-minute MYT schedule, zero retries and existing local jobs env/identity/secrets/dependencies. Do not add another WorkerPart: Source120 already has the generic adapter job. Preserve the inherited null scheduled-at telemetry and document its limit.
- [ ] Run the focused source+worker tests, `rtk bun run lint`, `rtk bun run typecheck`, `rtk bun run test`, and `rtk terraform fmt -check infra/environments/production/jps-rain.tf`; all must pass. Run `rtk terraform -chdir=infra/environments/production validate` only with existing initialized providers; report any unavailable verification honestly. After code edits, run `rtk graphify update .` per repository instructions. Commit Task 2 as `feat: schedule JPS rain polling`.
- [ ] For production completion after approved deployment/apply: run the job twice a few minutes apart and capture actual ingested polls after the batch. Keep the issue's 24-hour measurement open until 288 real slots have elapsed; report actual count/errors/newest-observation median lag. Record that the captured graph proves `data[].timestamp`, `data[].rf` and top-level `stationId`, closing this adapter's TRD JSON-path uncertainty. Do not claim deployment, 24-hour evidence or scheduler-lag verification from local tests.

## Dependencies and completion

Task 2 depends on Task 1 and merged Source120, including resolution of the inspected first-bind double-GET admission discrepancy before claiming the request budget. #131/#133 can consume the indicator definitions and stored rainfall independently; their implementation is outside this plan. Both tasks fit one coherent #121 PR with separate commits. The production elapsed-time criterion and shared scheduler timestamp limitation are explicit evidence/dependency limits, not fabricated success. No new contract change is required for the chosen null-coordinate behavior or discover implementation.
