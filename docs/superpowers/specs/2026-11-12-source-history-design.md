# Source history design

Implement the two raw source-history operations in [#134](https://github.com/m1kulabs/Skyclause/issues/134): `GET /v1/sources/{id}/readings` and `GET /v1/sources/{id}/polls`. This approved backend slice provides truthful stored evidence for permitted readers and leaves the remaining signals work open.

Contents:

1. [Scope and contract authority](#scope-and-contract-authority)
1. [Request and response contract](#request-and-response-contract)
1. [Access boundary](#access-boundary)
1. [Query and serialization boundary](#query-and-serialization-boundary)
1. [Pagination contract](#pagination-contract)
1. [Acceptance and limitations](#acceptance-and-limitations)

## Scope and contract authority

The binding authority is [#79](https://github.com/m1kulabs/Skyclause/issues/79), the operation registry contract [#88](https://github.com/m1kulabs/Skyclause/issues/88), and [TRD API conventions](/docs/TRD.md#api-conventions). The merged source-list implementation in [PR #738](https://github.com/m1kulabs/Skyclause/pull/738) establishes the source classification, private ownership and uniform forbidden-actor behavior reused here. This design does not change that operation or its health projection.

The user authorized proceeding with this direction. The parent approved `from`, `to` and `outcome` as contract rulings and owns recording the amendment on #79 and #134 and applying the contract label to the implementation PR. These request additions require that contract process; they are not covered by the exemption for owned optional response fields. No further design confirmation is required by this document.

Only the two raw GET operations, their contracts, DB query module, services, serializers, generated artifacts and tests are in scope. No new dependency or migration is expected. Do not implement frontend product code, indicators, verdicts, SSE, strip, days, `ShiftConditions`, device ingest, state computation, provider HTTP, Apps Script or cloud changes. No unmerged dependency, test double for an unavailable domain port, or frontend work is needed to make these two operations complete.

## Request and response contract

Both operations retain their existing path, operation ID, `b-signals-api` owner, `project.view` statement and organisation/authentication conventions. Guest access means an authenticated guest session or token carrying the permitted statement; these do not become anonymous public routes.

Both queries contain the existing `limit` integer 1–200, default 50, and optional opaque `cursor`. Add optional `from` and `to` using shared RFC 3339 UTC `Instant`. The range is half-open `[from,to)`: readings filter `observed_at`, polls filter `started_at`. Either bound may be omitted. Operation-local range instants accept at most six fractional digits, matching PostgreSQL microsecond precision; greater precision returns 422 at its field instead of silently rounding a boundary. Shared `Instant` and response schemas remain unchanged. Invalid instants return 422 `validation-failed` with their query pointer; when both are present, require `from < to`, preserving fractional precision, with the range error at `/to`. Do not impose strip's 48-hour or days' 14-day cap on these raw operations. Future observation dates in a genuine forecast remain valid data.

The polls query additionally accepts optional `outcome: 'ok' | 'unchanged' | 'error'`. Omission returns every retained outcome and purpose; supplying another value returns 422 at `/outcome`. This implements the existing #134 requirement for `/polls?outcome=error`. Do not add metric, purpose or search filters to this slice. Stored outcomes remain represented by the existing `Poll.outcome` string, without inventing or rewriting legacy values.

Responses retain `Page<T> = {data: T[], next_cursor: string | null}`. Readings use the unchanged shared `Reading` schema, including its string `revision`. Return all retained revisions and item keys matching the range, with nullable fields intact. Do not select only the latest revision, substitute an earlier success, suppress stored history because current source state is error, or synthesize a reading from an error poll. Current health remains the source-list operation's responsibility; historical raw rows acquire no invented state or age.

Keep shared `Poll` unchanged. Define an operation-local `PollHistory` extending it with optional `message: string | null`, `purpose: string`, and `received_at: Instant | null`. The implemented polls GET always populates those additions with actual stored values, including a null legacy receipt or HTTP status. Their optional schema status preserves existing client compatibility and uses the owned optional-response-field exemption. Do not infer completion time from latency, invent transport status or message, normalize a stored purpose, or add digest/API-family fields.

A visible source with no matching retained rows returns an empty page. A stored error remains an error poll even if no reading accompanied it. A database failure propagates as a failure; it never becomes an empty or cached page.

## Access boundary

Every HTTP handler runs in `inTenant`; direct services enforce the same checks so server components cannot bypass the boundary. Inject the existing canonical `Can` through `SourcesAccess`, and keep all SQL and connections inside `packages/db` using the current tenant `Tx`.

First reject `device` and `system`, a key/token whose scopes do not map to `project.view`, and a principal failing unscoped `can(principal, 'project.view')`. Return uniform 403 `insufficient-scope` before looking up the target, whether its ID is local, foreign or missing. This follows #79's binding amendment and PR #738. Anonymous HTTP requests retain 401. Existing organisation middleware retains missing-header 400 and mismatched/nonmember 404 behavior.

For otherwise permitted callers, require the principal's organisation to match `tx.orgId` and require a UUID source ID. Missing, malformed, foreign or hidden sources return 404. Source classification matches #738:

- Public catalogue: kind is neither `camera` nor `pi`, and `owner_org_id` is null. Every permitted guest or other-organisation principal can read its evidence, even without a caller-side project binding. OAuth/share-link project bounds do not turn catalogue rows into private resources.
- Private device: kind is `camera` or `pi`, owner equals the current organisation, and `meta.project_id` exactly names a real project in that organisation. Missing/malformed/foreign project metadata and conflicting bindings to another project fail closed before evidence reads. A private kind with null owner or a non-device kind with an owner also fails closed. Compare JSON metadata as text against real project UUID text; never cast untrusted JSON into UUID.

For a private device, an OAuth project list or share-link project excluding its authoritative project returns 404. Then require `can(principal, 'project.view', {projectId})`, with 403 on a denied statement. A correct private device does not need a current binding to its owning project to expose its stored history. A corrupt binding cannot establish ownership or widen a grant.

The DB lookup returns either the classified source and authoritative project ID, or null. Resolve ownership before querying readings/polls. C RLS remains active as a second boundary; never escalate to `withSystem` or public-reader connections in the product path. Authorize again for every cursor request.

## Query and serialization boundary

Add a focused `packages/db/src/signals/history.ts` module for the source-access lookup and the two SQL pages. Existing tables and RLS already support these reads. The module does not load current source state or call source projections, mutation locks or upstream adapters. Keep the already merged source-list path unchanged.

Both history functions select only the requested source, apply the exact range/outcome predicates, apply a strict keyset comparison, order deterministically and limit to `limit + 1`. They return DB row types with timestamp fields projected to exact UTC strings. PostgreSQL retains microseconds while JavaScript `Date` loses submilliseconds; retain the SQL precision through filtering, cursor creation and response serialization. Bind timestamp strings directly as PostgreSQL timestamp parameters rather than round-tripping them through `Date`.

Explicitly map top-level DB property names to the wire. Preserve `value_json` recursively without key conversion, preserve text/nulls verbatim and stringify the stored integer reading revision. Generic `toWire()` recursively renames nested object keys and is unsuitable for this raw provider payload. Do not refactor the existing source-list or catalogue serializers as part of this change.

Read-only means no domain source/poll/reading/state/binding/audit/event/analytics writes, no locks, repair, state materialization, backfill or provider HTTP. Generic existing HTTP rate-limit/tool bookkeeping remains governed by the unchanged middleware. Existing source/time indexes are the initial access path; this scope introduces no production latency claim or speculative index migration.

## Pagination contract

Return readings ordered `(observed_at DESC, id DESC)` and polls `(started_at DESC, id DESC)`. Each partitioned primary key includes the time, so the cursor position is the complete `(time,id)` pair. Multiple metrics, item keys and revisions at the same observation time all remain visible. Use the existing API `page()` helper over at most `limit + 1` SQL rows, issuing a string cursor only while another row remains.

The strict versioned cursor contains endpoint kind, tenant organisation ID, source ID, exact query filter identity (`from`, `to`, and polls `outcome`, using null for omitted values), and the last returned row's exact timestamp and UUID. Reject malformed payloads and wrong endpoint, source, tenant or filter with 422 `validation-failed` at `/cursor`. The cursor's instant must preserve the full UTC SQL precision. A different limit is allowed between pages. Cursors are positions, never authorization grants.

Keyset pagination remains usable when retention removes the cursor row. This is a live traversal, not a frozen snapshot: a later inserted older observation may appear behind the cursor; a newer row ahead of it requires a fresh traversal. No inferred availability cutoff, snapshot time or completeness guarantee is supplied.

## Acceptance and limitations

Real PostgreSQL query tests and HTTP/direct-service tests cover both operations, public C access from guests and another organisation without bindings, private metadata/grant isolation, uniform forbidden-actor denials, range/outcome validation and precise keyset paging. Canonical-Can integration lives in an app test that can import auth, without changing frontend product code or introducing an API-to-auth dependency. Captured APIMS/MET values provide real evidence; temporal/error/security fixtures are test-only doubles.

Pin all revisions/items, null unit/value/poll/device timestamps, raw nested JSON keys, future forecast dates, a three-hour-old error behind newer successes, backfill purposes, null transport status/legacy receipt, range boundaries, equal timestamps, microsecond differences, partition boundaries and cursor misuse. Compare complete domain rows before and after repeated reads and denials; no source-side effects are permitted.

The two-task [implementation plan](/docs/superpowers/plans/2026-11-12-source-history.md) includes RED→GREEN evidence, generated OpenAPI/SDK/graph review and required checks. This work is **Part of #134**. The remaining routes, SSE/event-hub integration, device/forecast/probation integrations, production p95, browser verification and beta readiness remain outside this slice. No completion claim for the whole issue follows from these two reads.
