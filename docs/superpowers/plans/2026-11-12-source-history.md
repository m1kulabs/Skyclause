# Source history implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (the approved implementer/reviewer workflow) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Implement only the two #134 raw source readings/polls GET operations with truthful stored evidence, bounded pagination and tenant/project access enforcement.

**Architecture:** A DB-owned SELECT-only query seam resolves source classification and authoritative private ownership before querying evidence. Signals services enforce canonical Can, range validation and cursor identity, then explicitly serialize the raw SQL records. Existing handlers mount the services in the caller's tenant transaction.

**Tech stack:** TypeScript, existing Hono/Zod contracts, Drizzle, PostgreSQL RLS, Vitest and Bun; no new runtime dependency.

**Spec:** [Approved source history design](/docs/superpowers/specs/2026-11-12-source-history-design.md), [#134](https://github.com/m1kulabs/Skyclause/issues/134), binding [#79](https://github.com/m1kulabs/Skyclause/issues/79), [#88](https://github.com/m1kulabs/Skyclause/issues/88), and the existing source-list behavior in [PR #738](https://github.com/m1kulabs/Skyclause/pull/738).

Contents:

1. [Global constraints](#global-constraints)
1. [Review focus](#review-focus)
1. [Task 1: Define source history contracts and queries](#task-1-define-source-history-contracts-and-queries)
1. [Task 2: Serve and verify authorized source history](#task-2-serve-and-verify-authorized-source-history)

## Global constraints

- Work in the isolated `feat/source-history-20261112` checkout at `/Users/jeremywoon/.codex/worktrees/f085/gdgocapu`; inspect status before editing and use only current merged code. No domain-port prerequisites are assumed or stubbed.
- Parent approved `from`, `to`, `outcome` and the other design rulings under the user's instruction to proceed. Parent owns recording #79/#134 amendments and the contract-labelled PR. Do not reopen settled design questions. Optional endpoint-local poll diagnostics use the owned optional-response-field exemption.
- Prefix every shell/subprocess command with `rtk`; query the pinned Graphify 0.9.105 before source exploration. Never use the lossy global Graphify binary. Preserve migrations and immutable captures.
- Use the established Node 22/Bun 1.4.4 validation runtime, real local test PostgreSQL harness and shared `/Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/run-check.py` wrapper with `heavy-validation.lock` for heavy checks. At most four Vitest workers; retain the default 5000 ms test timeout. Never use production DB or reset shared volumes.
- No new dependency/migration, frontend product change, provider/network request, cloud action, domain write, lock, source repair, state computation or backfill. SQL, policy and connections remain in `packages/db`; all product queries use the caller's current tenant Tx.
- Keep shared Poll/Reading and the merged source-list/catalogue/binding behavior unchanged. Real captured APIMS/MET data supplies evidence; test doubles are allowed only in tests.
- Requests use `limit` 1–200, default 50; optional UTC `from`/`to` filter `[from,to)` on `observed_at` for readings and `started_at` for polls. Polls adds optional `outcome` exactly `ok|unchanged|error`. Operation-local range/cursor instants accept at most six fractional digits, rejecting greater precision instead of PostgreSQL rounding. They reject PostgreSQL-unsupported year `0000` while accepting year `0001`. Shared Instant/response schemas remain unchanged. Invalid ranges/filters/cursors are 422 with query pointers.
- Catalogue is non-camera/non-pi with null owner and stays readable across organisations/by guests and scoped grants without a local binding. Private metadata, tenant ownership, real project and grant scope fail closed before evidence.
- Retain all raw revisions, actual nulls, nested JSON keys and full PostgreSQL timestamp precision. No cached/default/empty fallback on failure and no invented current health, receipt or transport status.
- Scope and PR wording are **Part of #134**. Keep the whole issue open; no SSE/strip/days/ShiftConditions, frontend, Apps Script or production-readiness claim follows from this slice.
- Save commands, RED/GREEN results, exit status and exact candidate HEAD/tree evidence under `/Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/`. Fresh task reviews and final parent review remain separate from implementation checks.

## Review focus

- Public catalogue requested by a guest or scoped OAuth/share link without any caller-side binding: success, with no private project data leak (Task 1 public query tests; Task 2 canonical-Can tests).
- Corrupt private metadata, nonexistent/foreign owning project or conflicting legacy binding: 404 before evidence, never ownership inferred from a binding (Task 1 access tests; Task 2 denied-read tests).
- A three-hour-old error behind many successes, backfill purpose and null receipt/status: return actual diagnostics without fabricated values (Task 1 poll query tests; Task 2 raw response tests).
- Many revisions/items at equal observation times, submillisecond differences and partition boundaries: every row once across cursor pages (Task 1 keyset tests; Task 2 operation pagination tests).
- Nested JSON field spelling and future forecast observation dates: preserve source content and precision without current-state filtering (Task 1 raw row tests; Task 2 explicit serializer tests).

## Task 1: Define source history contracts and queries

**Deliverable:** Independently tested schemas and SELECT-only tenant query seam. HTTP handlers can remain unbuilt until Task 2.

**Files:**

- Modify `packages/contracts/src/api/v1/sources.ts`.
- Create `packages/contracts/test/api/source-history.test.ts`.
- Create `packages/db/src/signals/history.ts`.
- Modify `packages/db/src/signals/index.ts` to export the new types/functions; its existing root DB export already exposes signals.
- Create `packages/db/test/source-history.test.ts`.
- Regenerate `packages/api/openapi.json`, `packages/sdk/openapi/openapi.json`, `packages/sdk/openapi/schemas/listSourceReadings.json`, `packages/sdk/openapi/schemas/listSourcePolls.json` and `packages/sdk/src/generated.ts` using the existing generators, including any normally generated content hashes.

**Interfaces:**

Consume existing `Tx`, `source`, `project`, `projectSource`, `reading` and `poll` schema types, shared `Instant`, `Page`, `PageQuery`, `Reading` and `Poll`. Keep schema additions local to `sources.ts`: readings range query; polls range/outcome query; `PollHistory = Poll.extend({message: z.string().nullable().optional(), purpose: z.string().optional(), received_at: Instant.nullable().optional()})`. Bind each query and response only to its owned raw operation. Services in Task 2 infer their types from `Operations`, not a parallel handwritten contract.

Export these exact DB types and functions from `history.ts` and the signals barrel:

```ts
type SourceHistoryAccess = {
  source: typeof source.$inferSelect
  projectId: string | null
}
type HistoryPosition = { at: string; id: string }
type SourceHistoryPage = {
  sourceId: string
  limit: number
  from?: string
  to?: string
  after?: HistoryPosition
}
type SourceReadingRecord = Omit<typeof reading.$inferSelect, 'observedAt' | 'receivedAt' | 'deviceTime'> & {
  observedAt: string
  receivedAt: string
  deviceTime: string | null
}
type SourcePollRecord = Omit<typeof poll.$inferSelect, 'startedAt' | 'receivedAt'> & {
  startedAt: string
  receivedAt: string | null
}
getSourceHistoryAccess(tx: Tx, sourceId: string): Promise<SourceHistoryAccess | null>
listSourceReadingRecords(tx: Tx, query: SourceHistoryPage): Promise<SourceReadingRecord[]>
listSourcePollRecords(tx: Tx, query: SourceHistoryPage & {
  outcome?: 'ok' | 'unchanged' | 'error'
}): Promise<SourcePollRecord[]>
```

The access lookup returns `projectId:null` only for valid catalogue classification. It validates own-tenant private ownership and a real metadata project with no conflicting binding. Compare metadata as text against actual project UUID text, never cast malformed JSON. Evidence functions require prior caller authorization, retain RLS, return at most `limit+1` rows, and do not load projections/state or take locks. Timestamp record fields are exact UTC SQL strings, including nullable device/legacy receipt times.

- [ ] **Write contract RED tests.** Assert both queries retain `from`/`to`, polls retains `outcome=error`, default limit is 50, limits 1 and 200 succeed and 0/201/fractional limits fail. Reject malformed/non-UTC instants at their field, equal/reversed bounds at `/to`, and unsupported supplied outcomes at `/outcome`. Include two valid ordered instants differing only in microseconds so range validation cannot collapse them through `Date`; reject more than six fractional digits at their field and treat equivalent zero-padded bounds as equal. Assert optional nullable poll diagnostics survive response parsing and existing base Poll/Reading fixtures remain compatible.
- [ ] **Write access-query RED tests against real PostgreSQL.** A captured catalogue source with real APIMS evidence is readable in two unrelated tenant transactions and a guest transaction without a project binding. A correctly owned unbound camera/Pi resolves its real metadata project. Foreign owner/project, absent/invalid metadata, numeric project metadata, nonexistent project, conflicting same-org binding, null-owner private kind and owned non-device kind return null before evidence queries. Use test-only privileged setup solely for otherwise impossible legacy corruption; product lookup remains tenant-scoped.
- [ ] **Write raw-query RED tests.** Assert `[from,to)` exact lower/upper edges and open bounds for both time columns, only the selected source, `limit+1`, all revisions/metrics/items at one timestamp, unchanged nested JSON/text/nulls and genuine future forecast observation. Insert test-only microsecond timestamps directly into PostgreSQL and traverse newest-first `(time,id)` across October/November partitions with limit 1, asserting exact returned IDs once and full timestamp strings. Include a removed cursor row to prove keyset progress requires no anchor lookup. Poll tests retain a three-hour-old error after five newer successes, null HTTP/message/legacy receipt, actual backfill purpose and all outcomes when no filter is supplied; `outcome=error` selects only errors.
- [ ] **Run focused tests and retain RED evidence.** Through the shared validation wrapper, run `rtk bunx vitest run packages/contracts/test/api/source-history.test.ts packages/db/test/source-history.test.ts --maxWorkers=4`. First demonstrate a contract assertion failure against the existing operation query (unknown fields are stripped). Missing new DB seams may be scaffolded with explicit unbuilt behavior for a meaningful expected failure; an unrelated setup/import/database failure is not the intended RED.
- [ ] **Implement the contract and DB seam.** Use bound Drizzle predicates and `limit+1`; readings order `(observed_at DESC,id DESC)`, polls `(started_at DESC,id DESC)`, with strict tuple-equivalent continuation. Project all response timestamps to exact UTC strings in DB-owned SQL and bind time filters/positions without `Date` truncation. Keep raw JSON and stored outcomes/purposes intact. Apply the design's range checks with fractional precision and query paths.
- [ ] **Verify Task 1 GREEN and regressions.** Repeat the focused command until all new assertions pass. Then run `rtk bunx vitest run packages/db/test/source-health.test.ts packages/db/test/catalogue.test.ts packages/api/test/source-binding.test.ts packages/api/test/source-packs.test.ts --maxWorkers=4` through the wrapper. Expected: all pass, proving existing source health/catalogue/binding contracts remain intact.
- [ ] **Generate and review the Task 1 contract artifacts.** Run `rtk bun run openapi:generate` and `rtk bun run --filter @skyclause/sdk generate` through the established wrapper. Inspect only the two raw operations plus normal generated hashes/types; no hand edits or unrelated schema changes. Self-review and commit the task as `feat: define source history queries`; the parent obtains independent Task 1 review before Task 2 begins.

## Task 2: Serve and verify authorized source history

**Deliverable:** Both complete HTTP operations and direct service seams, consuming Task 1's tested query contract. Final generation and verification are part of this task, not an additional implementation task.

**Files:**

- Create `packages/api/src/services/signals/history.ts`.
- Modify `packages/api/src/services/signals/index.ts` to export history services/types.
- Modify `packages/api/src/services/signals/serialize.ts` with explicit raw row serializers.
- Modify `packages/api/src/routes/signals/index.ts` to add both handler entries to the already registered signals handler map.
- Modify `packages/api/src/index.ts` to export the services and their query/view types.
- Create `packages/api/test/source-history.test.ts`.
- Create `apps/web/test/source-history-permissions.test.ts` for tests using production canonical Can; no frontend product file changes.
- Update generated `graphify-out/graph.json` using the pinned updater; regenerate OpenAPI/SDK normally only if Task 2 changes their contract inputs.

**Interfaces:**

Consume Task 1's `getSourceHistoryAccess`, record/query types and two evidence functions; existing `ServiceContext`, `SourcesAccess = {can: Can; now: Date}`, `inTenant`, `page`, `decodeCursor`, `ApiError` and `validationFailed`. Import no implementation from `packages/auth` into API; the app-level integration test supplies canonical Can.

Produce these service types/exports, inferred from the committed operations:

```ts
type SourceReadingsQuery = z.infer<Operations['listSourceReadings']['request']['query']>
type SourcePollsQuery = z.infer<Operations['listSourcePolls']['request']['query']>
type SourcePollView = z.infer<
  Operations['listSourcePolls']['responses'][200]['content']['application/json']['schema']
>['data'][number]
listSourceReadings(ctx: ServiceContext, input: {
  sourceId: string; query: SourceReadingsQuery
}, access: SourcesAccess): Promise<Page<Reading>>
listSourcePolls(ctx: ServiceContext, input: {
  sourceId: string; query: SourcePollsQuery
}, access: SourcesAccess): Promise<Page<SourcePollView>>
serializeSourceReading(row: SourceReadingRecord): Reading
serializeSourcePoll(row: SourcePollRecord): SourcePollView
```

Place services and their local shared authorization/cursor helper in `history.ts`, serializers in the existing `serialize.ts`, and re-export through signals/root API barrels. The strict cursor payload is `{v:1, kind:'readings'|'polls', org_id:UUID, source_id:UUID, from:Instant|null, to:Instant|null, outcome:'ok'|'unchanged'|'error'|null, at:Instant, id:UUID}`. Readings requires `outcome:null`. Require exact filter identity and permit changing `limit`; return cursor errors at `/cursor`. Cursor timestamps carry SQL precision. Query/range parsing is repeated in direct services, not trusted solely to HTTP middleware.

- [ ] **Write operation RED tests.** With real tenant transactions, assert each authorized route changes from 501 to schema-valid 200 and an empty page when no matching rows exist. Captured APIMS/MET readings retain every revision/item, future dates, exact nullable fields and nested provider JSON keys. Test source state `error` with retained reading history: raw stored readings remain visible while polls returns the actual error, without any synthetic reading or current-state decoration. Assert the three-hour-old error appears under `outcome=error` despite five newer successes, with actual message/purpose and nullable receipt/status.
- [ ] **Write permission RED tests for both operations and direct calls.** Use `crossOrgCase()` once per operation for authorized foreign-private-source 404. Cover viewer/guest/read-key catalogue success across organisations without bindings, plus scoped OAuth/share-link catalogue success independently of bound projects. Own private device needs its actual metadata project; wrong scoped OAuth/link project and corrupt ownership return 404 before evidence. Device ingest-only, system, scopeless key/token and failed unscoped Can return uniform 403 for local/foreign/missing IDs. Missing principal is 401; existing session organisation failures remain 400/404. Targeted private Can denial is 403. In `apps/web/test/source-history-permissions.test.ts`, repeat allowed/denied/scoped cases using `@skyclause/auth/can`, following the existing project-source integration test.
- [ ] **Write pagination/validation RED tests.** On both endpoints assert default50/min1/max200, limit-1 traversal with equal and microsecond timestamps over partition boundaries, exact terminal `next_cursor:null`, and successful limit changes. Reject malformed, wrong-version, cross-source, cross-tenant, cross-operation and changed from/to/outcome cursors at `/cursor`. Assert valid open ranges, included lower/excluded upper edge, and equal/reversed ranges at `/to`. Revoke/change a test principal's permission after page 1 and prove its cursor cannot bypass reauthorization. Assert reading cursor `outcome` is null.
- [ ] **Write no-effect and failure RED tests.** Compare complete stored source, reading, poll, source-state, binding, audit, domain-event and analytics rows before and after repeated successful and denied service/operation calls. Instrument evidence functions to prove ownership denials precede raw queries. Inject a DB read failure and assert a failure response/rejection rather than an empty/cached/default page. Existing generic rate-limit/tool bookkeeping is outside domain-row assertions; no new such behavior is introduced.
- [ ] **Run Task 2 tests and retain intended RED.** Through the shared wrapper run `rtk bunx vitest run packages/api/test/source-history.test.ts apps/web/test/source-history-permissions.test.ts --maxWorkers=4`. Expect missing exports/authorized 501 or assertion failures for the unimplemented behavior, not a harness failure.
- [ ] **Implement services, serializers and handlers.** Enforce uniform forbidden-actor checks before target lookup, then tenant/UUID/source ownership and private project-grant checks exactly as the design states. Validate query/cursor, call Task 1 functions with the existing Tx and use `page()`. Map Reading top-level fields explicitly, copy `value_json` unchanged, stringify revision, and pass exact timestamp strings through. Poll always supplies real optional diagnostic values. Handlers read validated params/query and deps then invoke services using `inTenant`. Do not modify source-list behavior or add a connection/global setter.
- [ ] **Verify Task 2 GREEN and focused regression coverage.** Run `rtk bunx vitest run packages/contracts/test/api/source-history.test.ts packages/db/test/source-history.test.ts packages/api/test/source-history.test.ts apps/web/test/source-history-permissions.test.ts packages/api/test/project-sources.test.ts apps/web/test/project-sources-permissions.test.ts packages/api/test/source-binding.test.ts packages/api/test/source-packs.test.ts packages/api/test/cross-org-meta.test.ts --maxWorkers=4` through the wrapper. Expected: all pass with the real PG harness and no skipped new tests. Report focused results; the parent obtains independent Task 2 review after the source commit and routes findings without widening scope.
- [ ] **Generate the final artifacts.** If contract inputs changed after Task 1, run `rtk bun run openapi:generate` and `rtk bun run --filter @skyclause/sdk generate` again and inspect their exact operation-only diff. Run `rtk proxy /Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/tooling/graphify-0.9.105/bin/graphify update .`; inspect generated output. Never hand-edit SDK/OpenAPI/graph artifacts or immutable captures/migrations.
- [ ] **Run final required gates sequentially under the shared lock.** Run `rtk bun run lint`, `rtk bun run typecheck`, `rtk bun run test --maxWorkers=4`, `rtk bun run openapi:check`, and `rtk bun run db:seed-check`. Expected exit status is 0 for each. Verify the root test script forwards the worker cap; otherwise use its SDK build followed by capped Vitest and record that equivalent command. Use the established exact-candidate Linux typecheck gate if the native environment requires it; preserve SHA/tree and actual job/exit evidence. Do not raise timeouts or claim an unavailable check passed.
- [ ] **Commit and hand off the reviewed slice.** Commit `feat: serve authorized source history`; parent performs whole-branch review and contract-labelled PR integration under existing authorization. Report all actual checks and unverified items. The PR says `Part of #134`, links its contract amendment and retains remaining issue work, frontend ownership and production acceptance explicitly. No whole-issue completion or browser/beta-readiness claim is authorized.
