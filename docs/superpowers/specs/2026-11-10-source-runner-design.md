# Source adapter runner design

Implement issue #120 (`b-sources-core`) against main
`4096d646c833efe3e2ec630c226cbbcf6f6c1b94`. The user delegated implementation
choices and opted out of further design questions. This document records engineering
calls, not new user approvals. No source files were changed during this research.

Contents:

1. [Authority and current seams](#authority-and-current-seams)
1. [Approach and contract alignment](#approach-and-contract-alignment)
1. [Execution and metadata](#execution-and-metadata)
1. [Persistence and concurrency](#persistence-and-concurrency)
1. [Catalogue, context, and worker wiring](#catalogue-context-and-worker-wiring)
1. [Verification and evaluator handoff](#verification-and-evaluator-handoff)

## Authority and current seams

Read [issue 120](https://github.com/m1kulabs/Skyclause/issues/120), binding
[issue 79](https://github.com/m1kulabs/Skyclause/issues/79) sections 1, 3, 5, 6,
D9, D15, D16 and D45, and the pinned code. The initial graphify query at the
09a1 worktree found `PollContext`, `SourceAdapter`, the partitioned schema and
worker seams; it was truncated, so targeted pinned reads supplied the evidence.

- `packages/sources/src/contract.ts` is authoritative for adapter signatures,
  metrics, units, JSON schemas and `ReadingsUpdated`. There is no runner or real
  registered adapter at this revision. Do not add a live test adapter.
- `source.meta` and `reading.item_key` already exist. `poll` lacks `body_sha256`
  and `purpose`; `reading.item_key` is nullable and revision defaults to 0.
  `source.licence_id` is nonnullable although `Licence.id` permits null.
- `poll` and `reading` are append-only monthly partitions. A custom migration
  must update their SQL and `schema/partitioned.ts`; normal generation excludes
  those tables. Never create pending polls and update their outcomes.
- `withSystem` sees projects and catalogue sources across organisations, but
  cannot see tenant `project_source` or `night` rows. `emitEvent` requires
  `withTenant`. Enumerate organisations through projects, then use the existing
  tenant wrappers; do not loosen RLS or invent an identity.
- `WorkerPart` has jobs, ticks, batch, topics and events. `pubsubPublisher` is a
  real ADC-backed REST publisher. `onEvent` wraps tenant `handleOnce`.
  `readings-updated` is provisioned; `poll-results` is not. The batch shares one
  system connection, and nested `with*` calls on it throw.
- The package boundary checker forbids db importing sources. Worker validates
  source metric schemas; db consumes structural write DTOs and validates storage
  invariants. If source types must cross db, add type-only re-exports through
  contracts, never a runtime dependency or a weakened boundary rule.

## Approach and contract alignment

Use an executor separated from storage, with a real HTTP context and immutable
request-result envelopes. The writer, event fan-out and Pub/Sub acknowledgement
are idempotent independently. A direct database job is smaller but contradicts
D45; putting the whole pipeline in each adapter duplicates correctness logic.

**Resolved contract conflict:** #79 D45 prevails. Scheduled fetch reads a GCS
poll plan, reserves through GCS generation-CAS, publishes real `poll-results`, and
never touches Postgres. The 15-minute batch ingests. This explicitly replaces
#120's stale Postgres advisory-lock budget detail; no DB-wake exception and no
widened source cadence. The root controller made this engineering ruling under
the user's delegated core implementation authorization.

Before behavioral implementation, use the #79 contract-change process: a
contract-labelled PR and affected child-ticket comments align the budget
mechanism, nullable no-response HTTP metadata and nullable licence IDs. Root owns
those external edits. No new approval question is required. The alternatives
considered were synchronous DB polling (violates D45) and pre-reserved future DB
slots (do not model actual starts, late jobs or retries). GCS CAS is the smallest
correct coordinator already available in this stack.

## Execution and metadata

Keep `SourceAdapter<Raw>` and `PollContext` compatible. Export typed `HttpError`,
`TimeoutError`, `NetworkError`, `SchemaError` and `RateLimitedError` from sources;
classification relies on these types, not error-string matching.

`executeAdapter(adapter, sources, contextFactory, options)` belongs in the worker
source module. `options` carries `purpose`, `scheduledAt` and request UUIDv7
creation. The context factory supplies a request ledger as an implementation
sidecar; adapter authors still see only the established `PollContext`.

- Deduplicate bound source IDs before fetching. `all_bound` fetches once with
  every bound source; `per_source` fetches each once. No source unbound or archived-only in the latest valid poll plan is
  fetched; ingestion rechecks current bindings before writing polls, so a stale
  plan cannot persist polls for a source no longer bound to any active project. Ownerless catalogue sources are the scheduled runner's scope;
  camera/Pi owner-scoped device ingestion remains #128.
- Each physical `ctx.http` call gets a fresh UUIDv7 `request_id` and start instant,
  with one eventual poll per participating source. Multiple HTTP calls in a
  fetch are recorded separately. Parse output belongs to the final successful
  data request; preceding successful requests have zero rows. An aggregate
  fetch/parse failure writes no readings for that operation. Do not silently
  combine several upstream requests into a single budget slot.
- A preflight `ctx.budget.take(family)` reserves the next request, and automatic
  `http` reservation consumes that credit once. A later physical request takes
  another slot. Adapter code must not accidentally double-charge the first call.
- Send `ADAPTER_USER_AGENT` on every call, overriding adapter attempts to replace
  it. Use redirect `manual`, an abort deadline of exactly 20,000 ms covering body
  consumption, monotonic latency, and no hidden retries. 301 and 500 are `http`;
  429 is an HTTP error too, distinct from local `rate_limited`.
- Read successful response bytes once, retain SHA-256, and expose repeatable
  `json/text/arrayBuffer` methods over those bytes. Malformed JSON becomes
  `SchemaError`. Schema and reading validation failures are poll errors, never
  partial readings. Bodies may be persisted to GCS and represented by pointers
  to avoid Pub/Sub size limits.
- Compare each source with its previous successful `ok` body digest for the same
  purpose. For a single-response fetch, skip parsing entirely if all participating
  sources match; otherwise parse once and filter unchanged sources from writes.
  Do not bypass aggregate multi-response parsing based only on the last body's
  digest. Empty valid results are `unchanged` and never create placeholder values.
- Typed metadata: status is the observed HTTP status, or null if no response
  exists; latency is always the measured nonnegative integer, including timeout,
  network and budget wait. This requires nullable `poll.recorded.http_status`.
  A denied local budget also needs null status: #120's wording allowing null only
  for timeout/network is inconsistent with its no-request rate-limit outcome.
  Preserve truthful null rather than fabricating status 0 or 200, and document
  that narrow clarification with the implementation.
- Log adapter, actual URL, request ID, purpose, scheduled slot, started_at, lag,
  outcome, status and duration. Preserve the Scheduler slot from invocation
  metadata/explicit job argument; do not call execution start the scheduled slot.
  Manual executions use a null scheduled slot. Adapter schedule owners must pass
  the slot to the exported runner; a Cloud Run job does not automatically inherit
  Scheduler HTTP headers as argv.

## Persistence and concurrency

`recordSourceRequest(tx, input)` runs in `withSystem`, returning stable stored
poll summaries. Validate all successful readings before inserting any. Refuse
missing observedAt/receivedAt/status/latency at the writer seam; only error polls
may have absent HTTP status, and error input with readings is rejected.
`received_at` is assigned from the actual transaction write clock, not fetch time.

Lock source IDs in sorted order with transaction advisory locks. Recheck previous
digest and latest reading revision under the lock. Normalize itemKey to empty
string for new rows and treat historical null keys as equivalent in comparisons;
do not rewrite append-only historical readings. New initial revision is 1;
changed `(value, value_text, canonical value_json, unit)` appends latest+1.
Equal values append nothing. Two list items at one observation time stay distinct.
Explicit row revision values avoid changing legacy callers' behavior needlessly.

Add `poll.purpose` default `poll`, `body_sha256` nullable, and an API-family field
for truthful historical request accounting. Use a stable envelope ID/request IDs
and existing `handleOnce(tx, 'sources:request', {messageId: requestId}, ...)` to
make delivery replay return existing polls without repeating inserts. Stable
poll IDs come from the first persisted result, never a new retry allocation.

`takeSourceBudget(family, requestId, clock)` uses one GCS control object per
family. Read its generation and `{requests: [{requestId, startedAt}]}`, discard
starts outside `(now-60s, now]`, and conditionally save a new entry with
`ifGenerationMatch`; use 0 only when the object is absent. Four distinct IDs may
start; the same ID is idempotent. A 412 rereads and retries rather than admitting
a fifth request. A crash retains its reservation until 60 seconds elapse. When
full, wait outside GCS operations until the earliest expiry, stopping after a
monotonic 20 seconds, then produce a rate_limited result without HTTP. Always
recompute the wall-clock window after waiting. Contract-only probes use the same
object; they write coordination metadata, never polls/readings. No new DB table,
no fixed-window counter and no pending poll are needed.

Backfill uses a GCS source-scoped claim shared by source.bound and the job.
Create `control/backfills/{sourceId}.json` with `ifGenerationMatch: 0`, owner token,
lease expiry and state `running`; the winner renews a 60-second lease at most every
20 seconds while running. Losers read the claim and do not fetch. A completed
claim points to an immutable, generation-preconditioned result object and the
same stable operation/request IDs. Save that result before changing the claim to
`complete`; retries reuse the durable result. Normal jobs inspect claim/result
state at start and publish completed unacknowledged results, rather than fetching
backfill again. A completed error result also counts as the ticket's one attempt.
The ingest receipt eventually records the backfill poll, and poll-plan refresh
marks it done. Only an expired claim without a result can be stolen with matching
generation. Result objects include the lease owner token in their immutable path. Publish
only the result referenced by the claim after a generation-matched transition to
complete; a stale lease holder cannot publish its competing result. Existing running backfill keeps normal polling for
that source deferred until its durable outcome is available.

This guarantees one persisted backfill and one active fetch under concurrent
job/event races. A process pause past its lease can cause overlapping external
GETs; arbitrary death between GET and result persistence can repeat the GET.
Exactly-once external network execution across crashes is impossible, so the
contract-alignment note pins exactly-once to committed backfill and ordinary
concurrent delivery. No DB lock is held across network work.

Event fan-out is a separate idempotent tenant step after poll commit:
`handleOnce(tx, 'sources:poll-events', {messageId: pollId}, ...)` within each
organisation is insufficient because handled_message is global. Use a key that
includes organisation, or one `(pollId, projectId)` key per project. Emit one
`poll.recorded` per distinct bound project, irrespective of duplicate roles.
Then publish `ReadingsUpdated` for sources with new_rows>0 using the real
publisher. A delivery is acknowledged only after ingestion, tenant fan-out and
publish succeed. Failure replays persisted summaries, repairs missing tenant
fan-out, and may republish the same source/poll message harmlessly. Do not use
an afterCommit hook that merely logs a failed readings publish and loses it.

## Catalogue, context, and worker wiring

`upsertSourceCatalogue(tx, adapterMetadata, discovered)` uses the existing
owner/kind/external-ID unique key with owner null. Update metadata, coordinates,
URL, licence, cadence and stale_after (entry override, otherwise 2×cadence).
Never delete rows; this is the simplest way to preserve rows with readings.
Make licence_id nullable to match the existing public adapter contract; metadata
is discovery data, not runner state. A failed discovery fails the job, never
fills defaults for missing real sources. An empty adapter registry is truthful,
but cannot be reported as evidence of working live adapters.

`loadBoundSources(kind)` and `loadOpenCrowdPeriods(now)` enumerate organisations
and use tenant reads. Periods must be upcoming/in_progress with a nonnull arrival
start and arrival `[start,end)` or exit `[start,end)` containing now; missing ends
do not invent a duration. Published poll plans carry source data, binding refs,
prior successful digests and upcoming/in-progress periods. The executor filters
periods against its current clock. Plan absence/corruption fails visibly, with
no database fallback in minute polling.

GCS storage uses ADC and existing bucket IAM. `scratch/...` stays at that path in
SCRATCH_BUCKET; every other relative path is `sources/{kind}/{path}` in
SOURCES_BUCKET. Reject absolute paths and dot-segment traversal. Only object 404
maps to null; permissions/network errors propagate. Control objects such as poll
plans and claims use an internal worker store, not adapter-visible namespaces.

Add a real `poll-results` topic and pull subscription with worker subscriber IAM.
The 15-minute batch pulls, persists, fans out, publishes readings-updated and acks;
it then refreshes poll plans. No immediate DB-writing push subscription. Results are immutable GCS objects;
Pub/Sub carries a small strict envelope with object path, SHA-256, operation ID
and kind. Retry publication reads the same result, never re-fetches upstream.
Register a sources WorkerPart containing `adapter`, `catalogue-sync` and
`adapter-contracts` jobs, a `source.bound` consumer and ingestion/plan batch.
Adapter-specific schedules remain adapter tickets. Daily catalogue/contracts
jobs get actual infra blocks. Runtime config fails on missing USER_AGENT,
SOURCES_BUCKET, SCRATCH_BUCKET or GCP_PROJECT when the corresponding job starts.
Contract jobs fetch/parse each registered adapter once from real catalogue
sources; no invented representative station. Log adapter/URL/status/error and
fail the execution on any failed adapter.

## Verification and evaluator handoff

Use test doubles only inside tests. Integration tests must exercise actual
Postgres locks, partitions, RLS and concurrent callers. Tests cover 301/500,
exact 20-second timeout, network/schema failures, concurrent fifth budget take,
60-second boundary, late/out-of-order envelopes, repeated delivery and partial
fan-out failure, changed revisions, list item keys, two tenant bindings and
archived-only sources. Do not widen timeouts to make tests pass.

For #133 deliver only truthful polls, readings, tenant `poll.recorded`, and the
existing `ReadingsUpdated` body. Error/no-row polls still emit poll.recorded so a
consumer can notice failure. Do not implement source_state, evaluator timers,
source.error/recovered/stale, or No call in this ticket. Full SIG-2 No call and
live APIMS/day-long production evidence depend on #133/#123 respectively; these
are acceptance dependencies, not excuses to leave the core runtime unwired.
