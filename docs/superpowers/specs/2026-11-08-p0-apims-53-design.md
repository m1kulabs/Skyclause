# APIMS polling and one-time history backfill

Design for [#53](https://github.com/m1kulabs/Skyclause/issues/53), under the pilot contract in [#47](https://github.com/m1kulabs/Skyclause/issues/47). The user authorized completing the core queue in the order #53, #52, #57 and #56, using Superpowers before implementation. This document covers #53 only; the later subsystems receive their own plans.

Contents:

1. [Intent and existing evidence](#intent-and-existing-evidence)
1. [Approaches](#approaches)
1. [Source and parsing contract](#source-and-parsing-contract)
1. [Polling and revisions](#polling-and-revisions)
1. [Backfill and recovery](#backfill-and-recovery)
1. [Native integration](#native-integration)
1. [Verification and closure](#verification-and-closure)
1. [Builder decisions](#builder-decisions)

## Intent and existing evidence

Supply real hourly air-pollution readings for the three bound Sky stations, including the morning history needed by the existing Haze clauses. Fetch the public map endpoint every 15 minutes. Preserve source failure and missing observations explicitly; no model arithmetic, fallback readings or invented classes.

The urgent capture step is already merged in #381 at `994ee66f8a36f0a552541967922226ade048cb62`. The [capture note](/docs/sources/eqms.doe.gov.my/apitablehourly.md) and its manifest retain all requested state/day responses for 31 October–3 November. Each station has 73 distinct hourly observations from 31 October 23:00 through 3 November 23:00. The 31 October 06:00 records are unavailable. History exposes `DATETIME`, `API` and `PARAM_SYMBOL`, with no `CLASS`. An invalid requested datetime returned recent data, so response timestamps must be checked against the requested interval.

The baseline is merged main `c02df09254eac5a93098c16a8e73175addb59325`, identical in full tree to the independently reviewed and Linux-CI-tested `60eb03eb8882328552b833e0ce72a0213c424e20`: 663 pilot tests passed. The original checkout stays untouched; use the existing managed worktree on `codex/p0-apims-53`.

## Approaches

Recommended: follow the existing JPS module boundary. A pure parser and poll/backfill orchestrator receive explicit clock, HTTP and storage ports; native adapters provide narrow reads, validated literal-cell writes and the existing script lock. This fits the user's approved core-first workflow and the current Apps Script scaffold.

A direct service-bound handler reduces interfaces but couples the source and recovery tests to native services. A generalized adapter runner would overlap P1 #120 and broaden this ticket. The proposed JPS-style boundary is the one sensible fit for the current issue. These are builder recommendations, not claims of separate user approval of each internal choice.

## Source and parsing contract

- Latest URL: `https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm`. History URL: `https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly`, with encoded `stateid` and offset-less MYT `datetime=YYYY-MM-DDTHH:00:00`.
- Bound stations and state IDs are fixed real configuration: `CA16W` / 14, `CA19B` / 10, `CA17W` / 16. Initial source names use their actual captured `STATION_LOCATION` strings. Add missing source rows only; do not overwrite existing configuration. Sources use kind `apims`, cadence 60, stale threshold 120, freshness `observed`, and the issue's licence string `No published terms found (5 Nov 2026)`.
- Store only these bound stations that have a compatible `sources` row. Unbound stations in the state/map responses are not ingested.
- Latest responses contain `data`; historical responses contain `api_table_hourly`. Validate the envelope and required bound-record metadata. Invalid JSON, structural schema errors, invalid calendar/time values and conflicting duplicate observations reject that HTTP response without writing readings.
- Resolve `RECORD_DT` or `DATETIME` as MYT with explicit `+08:00`, validating actual dates instead of accepting JavaScript rollover. Hourly timestamps must lie on the hour. History observations must lie in the inclusive 25-stamp range `[requested_end - 24 hours, requested_end]`; a response outside it is an error, not substituted history.
- `API` is a finite nonnegative JSON number, with genuine zero preserved. A bound station missing from a valid HTTP response, or having null/negative/otherwise invalid API, is omitted and named in the poll's diagnostic text; valid peer stations still store. Duplicate station/time rows with identical values collapse; conflicting values reject the response.
- Latest `CLASS` is preserved verbatim in `note` as `{"class": sourceClass}`. Required latest metadata missing or malformed is a schema error. Historical rows have no fabricated class: use an empty JSON object when the field is absent; preserve a real string if a later compatible history response supplies it.

## Polling and revisions

One map fetch creates one aggregate `polls` row: `source_kind=apims`, `source_id=apims`. Thus 96 scheduled map requests correspond to 96 map polls per 24 hours, independent of station count. All observations from that fetch link to its UUIDv7 `poll_id`.

Reading IDs are `{STATION_ID}:api:{observed_at}`. Rows have source kind `apims`, metric `api`, unit `API`, actual source/receipt instants, HTTP status, latency and provenance poll ID. Every row passes the existing `validateReading` and validated append adapter. Dedupe on station/metric/time; compare the highest stored revision's numeric value. Same value appends nothing, changed value appends revision + 1. Source class alone does not create a numeric-value revision. The same value from history appends nothing and therefore preserves an existing map row and its class. If a later history response disagrees numerically, apply the same revision + 1 rule as any re-fetch: append a new immutable revision carrying only that response's actual metadata. An absent historical class stays absent in the new revision; never carry an earlier map class onto a different value. No existing row is updated or deleted, and no special map-versus-history precedence overrides the shared value-revision contract.

Non-2xx, transport exceptions and schema failures create exactly one error poll for that HTTP attempt and no readings; exceptions use status 0. Successful responses are `ok` when they append readings and `unchanged` otherwise, retaining partial-station diagnostics even when peers succeeded. Storage failures propagate as storage failures, not fabricated HTTP errors. No immediate retry loop is added.

Run the existing evaluation tick once after this invocation's attempted work is recorded, including error outcomes, so the existing error/No-call logic sees the new rows. Do not modify indicators or Haze clauses in this ticket.

## Backfill and recovery

After the map attempt, check the three most recent 06:00 MYT instants that have actually occurred. Before today's 06:00, the newest eligible morning is yesterday's. A state is eligible only when its bound station lacks one of those readings, it has no earlier completed backfill request, and it has no existing pending backfill plan.

For each eligible state, freeze a private three-request plan before fetching history. Its hour anchor is the invocation's actual current MYT hour; its three request ends are that hour and 24 and 48 hours earlier. Persist only owned APIMS state/request metadata in Script Properties, using a versioned feature-specific key. No new sheet columns or external queue are needed.

Each history request writes its own poll with `source_kind=apims_backfill` and a deterministic `source_id=apims:backfill:{stateId}:{requestedEndWithOffset}`. This distinguishes one-time history from the 96 daily map requests and provides an exact checkpoint key. Reading rows still have kind `apims` and link to that request's actual poll ID.

On continuation, process the frozen pending requests before considering a new plan for that state. A matching persisted history poll proves the request completed, including an error result; do not refetch it. Mark completion only after the readings/poll writes flush. A failed state/checkpoint write must not suppress the other planned hours; re-read persisted request polls on retry. Completed failed requests remain visible and are not silently retried forever, consistent with the ticket's once-only rule. A legacy earlier backfill poll without private state suppresses a new batch, as the ticket specifies.

The HTTP reads and Sheets writes are not a transaction. If a write fails, propagate the failure and retain pending work; replay checks the recorded request first and reuses ordinary reading deduplication when no poll was committed. A repeated read after an interrupted unrecorded attempt is permitted; there is no email-like external send side effect. Do not add a general ingestion transaction framework.

Bound the work under Apps Script's execution budget. Persist pending state before stopping; at least one eligible pending request can progress, and later states cannot be permanently starved. A second ordinary run after all nine history requests completed makes no history calls.

## Native integration

- Add focused `apims` parsing/polling modules and tests; use explicit ports. Share existing UUIDv7, MYT, reading validation and literal-cell append helpers. Keep existing JPS behavior intact.
- Export parameterless `pollApims()` under exactly one existing script lock. Add one registry line at 15-minute cadence. Dev remains manual; pilot setup remains guarded by the stamped pilot ID.
- Native reads include only needed source metadata, reading revision fields and backfill poll keys. Use real UrlFetch responses, no fixture/runtime fallback. Flush backfill writes before private completion checkpoints. Invalid private state is an explicit error, not permission to rearm a new batch.
- Preserve all workbook columns, nine OAuth scopes, lazy native imports and the emitted-bundle logical-assignment guard introduced by #383.
- Existing health currently matches polls by station ID, while the indicator engine already supports aggregate APIMS polls. Extend health narrowly to associate a successful aggregate/backfill poll with a station through that station's stored `readings.poll_id`. Preserve other source kinds and direct station-ID polling. A station missing from a partial response must not gain successful-poll health from a peer's reading. No new health response fields are added.

## Verification and closure

Copy the real preserved history bodies into `pilot/fixtures/` with provenance and hash checks, keeping the source originals untouched. Tests cover the published latest values `CA16W=67`, `CA19B=57`, `CA17W=62` at `2026-11-05T21:00:00+08:00`, `Moderate` verbatim, historical class absence, real capture overlap, unchanged-overlap map-class preservation, changed-overlap revision with no carried class, empty 31 October responses and ignored datetime rejection.

Pin partial/missing/zero values, malformed metadata, conflicting duplicates, repeated versus changed values, native Date cells, timeout/non-2xx/schema outcomes, no-source-row filtering, pre/post-06:00 eligibility, three morning instants per station, and no history calls on a completed second run. Test interruption after each backfill checkpoint, persisted-then-thrown poll writes, and time-budget continuation without duplicate readings or dropped remaining hours. Native tests assert narrow reads, literal writes, flush/checkpoint ordering, one lock, top-level export, cadence and station-correct health.

After scoped implementation/review, run lint, typecheck, pilot tests and exact-commit local Linux test/lint/build/secrets jobs. Verify a fresh build is accepted by the actual personal dev Apps Script parser and byte-verified by readback before merge. Run the real dev handler and report each backfill poll, per-station reading counts and the newest three actual 06:00 values. Do not send mail as part of this feeder.

Shared-pilot observation remains blocked by #48: the Workspace pilot owner has not provisioned its script/deployment variables. The final acceptance needs 24 hours with 96 map polls, outcome counts and actual station readings. Keep #53 open until its required acceptance is verified, unless the user explicitly approves moving that remaining pilot acceptance to #380 as they previously did for #51/#54/#55. Do not treat code completion as proof of live operational behavior.

## Builder decisions

The module split, function/type names and private-state representation may be finalized in the implementation plan. Builder calls in this proposal are aggregate map poll identity, separate history poll identity, resumable fixed backfill requests, value-only revisions, captured real source-name configuration and the narrow station/poll health join. They preserve the issue's HTTP-count budget, existing schema and missing-data rules. The builder check identified one ambiguity about overlapping map/history values. The shared revision contract resolves it: append changed numeric values as a new revision, preserving each response's own class metadata and leaving prior rows immutable. This is the author's call, with potential downstream replay rework if a source-precedence rule is later required. No approver, teammate, recipient, source reading or shared-pilot identity may be invented.
