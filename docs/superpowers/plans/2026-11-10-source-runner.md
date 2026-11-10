# Source adapter runner implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Preserve the root controller's execution
> method and the user's opt-out from further design questions.

**Goal:** Deliver #120's shared adapter execution, catalogue and durable poll and
reading pipeline, with database-free scheduled fetch under #79 D45.

**Architecture:** Sources owns stable adapter contracts and registration. Worker
owns GCS/HTTP/Pub/Sub execution, request coordination and composition; db owns
transactional catalogue/poll/reading storage. Real poll-results pull delivery
connects scheduled fetch to the existing 15-minute batch.

**Tech Stack:** TypeScript, Node 22, Bun/Vitest, Zod, Drizzle/Postgres 18,
`@google-cloud/storage`, ADC-backed Pub/Sub REST and Terraform.

**Spec:** [Source runner design](/docs/superpowers/specs/2026-11-10-source-runner-design.md), authoritative issues
[120](https://github.com/m1kulabs/Skyclause/issues/120) and
[79](https://github.com/m1kulabs/Skyclause/issues/79), pinned main
`4096d646c833efe3e2ec630c226cbbcf6f6c1b94`.

Contents:

1. [Global constraints](#global-constraints)
1. [Review focus](#review-focus)
1. [Implementation tasks](#implementation-tasks)
1. [Task 1: align contracts](#task-1-align-contracts)
1. [Task 2: atomic source persistence](#task-2-atomic-source-persistence)
1. [Task 3: database-free execution](#task-3-database-free-execution)
1. [Task 4: live composition and delivery](#task-4-live-composition-and-delivery)
1. [Completion evidence](#completion-evidence)

**Execution base:** `5ca7c61587b458330162833e42dbc2d8095090c1`; engine and inactive auditor are merged. Published migrations now end at0025.

## Global constraints

- All shell commands start with `rtk`. Follow current AGENTS instructions.
- Use an isolated checkout at execution time; do not alter the divergent original
  main or the active writer's worktree. Rebase before allocating migration names.
- “Nothing on a schedule wakes the database more than every 15 minutes.” D45 wins
  over #120's stale per-request PostgreSQL budget implementation detail.
- Four distinct request starts per API family in the trailing 60 seconds;
  budget wait at most 20 seconds; HTTP timeout exactly 20 seconds; no redirects.
- No runtime doubles, seeds, fabricated HTTP status or value fallback. Real
  adapters remain #121–#126; camera/Pi ingestion remains #128.
- Tenant reads/events use `withTenant` with systemPrincipal; catalogue writes use
  `withSystem`. Keep RLS and append-only guards intact.
- Keep SourceAdapter/PollContext signatures stable where possible. Do not relax
  dependency checks to let db import sources. Metric validation runs in worker.
- No source_state or evaluator feature work (#133); no source cadence changes.

## Review focus

1. Concurrent fifth requests and generation conflicts must never overspend the
   family budget; probe jobs count too (phase 3).
1. A lost Pub/Sub acknowledgement or failed second-tenant event publish must
   repair delivery without another reading revision (phases 2 and 4).
1. A project archived after plan generation must not receive a poll event;
   stale plan bindings are revalidated before persistence (phases 2 and 4).
1. A multi-request fetch must not charge once or attribute fabricated transport
   metadata to a parse failure (phase 3).
1. A backfill event racing a job, or a retry after saving the result but before
   publication, must reuse one committed attempt (phases 3 and 4).

## Implementation tasks

### Task 1: align contracts

**Issue:** #544 (contract phase of #120).

**Files:**

- Modify `packages/contracts/src/events.ts` and its existing event schema tests.
- Modify `packages/sources/src/contract.ts`, `packages/sources/src/index.ts`,
  `packages/sources/test/contract.test.ts`.
- Create `packages/sources/src/errors.ts` and
  `packages/sources/src/adapters/index.ts`.
- Update `docs/TRD.md` in a contract-labelled PR; root owns issue #79/#120 and
  affected child comments. Cite this plan's settled D45 ruling.

**Interfaces:**

- Existing `SourceAdapter<Raw>`, `PollContext`, `Source`, `ReadingInput` and
  `ReadingsUpdated` retain their shapes.
- Export `SchemaError`, `HttpError(status, url)`, `TimeoutError(url)`,
  `NetworkError(url, cause)` and `RateLimitedError(family)`.
- Export `adapters: readonly SourceAdapter<unknown>[]` with one registration line
  per real adapter; a lookup rejects unknown kinds. Test doubles live only in
  `packages/sources/test/support/adapter.ts` or worker test support.
- `PollRecordedEventSchema.data.http_status` becomes nullable. Keep event and
  ReadingsUpdated names/keys unchanged.

- [ ] Write failing contract tests: timeout/network/rate-limit poll events accept
      null status, 200/301/500 preserve exact integer status, malformed status fails;
      existing metric schemas and source/reading shapes still pass.
- [ ] Run `rtk bunx vitest run packages/sources/test/contract.test.ts
packages/contracts/test`; confirm the new nullable-metadata test fails first.
- [ ] Implement the narrow contract changes and error exports. Document GCS CAS
      replacing the PG-lock detail, truthful null for no response, nullable licence
      IDs, coordination writes in contract probes, and exactly-once committed
      backfill rather than impossible exactly-once HTTP across crashes.
- [ ] Re-run those tests and `rtk bun run typecheck`; preserve the existing
      contract's runtime schemas, identities and dependency boundaries.
- [ ] Commit `fix: align source polling contracts`.
      Root completes the contract-labelled PR/affected child comments before phase 2.

### Task 2: atomic source persistence

**Files:**

- Modify `packages/db/src/schema/partitioned.ts`,
  `packages/db/src/schema/sources.ts`, `packages/db/src/index.ts`.
- Add generated source licence migration and custom partition migration under
  `packages/db/migrations/`; at the pinned base the next IDs are 0025 and 0026.
  Resolve actual next IDs after root's current work lands; update journal and
  snapshots with the normal generator, never overwrite another migration.
- Create `packages/db/src/sources/{types,queries,catalogue,write,index}.ts`.
- Create `packages/db/test/sources-{write,catalogue,queries}.test.ts`; extend
  existing `packages/db/test/schema.test.ts`, catalogue/RLS tests and source/poll
  factories only where needed.

**Interfaces:**

- `listSourceOrganisations(tx: Tx<SystemPrincipal>): Promise<string[]>`.
- `boundSources(tx: Tx, kind: SourceKind): Promise<BoundSource[]>`, where each
  entry contains source fields and distinct `{orgId, projectId}` binding refs.
- `openCrowdPeriods(tx: Tx, now: Date): Promise<CrowdPeriodDto[]>`.
- `upsertSourceCatalogue(tx: Tx<SystemPrincipal>, adapter: CatalogueMetadata,
entries: DiscoveredSourceDto[]): Promise<void>`.
- `recordSourceRequest(tx: Tx<SystemPrincipal>, input: SourceRequestWrite):
Promise<StoredSourcePoll[]>`.
- `loadStoredRequest(tx: Tx<SystemPrincipal>, requestId: string):
Promise<StoredSourcePoll[]>`; `emitSourcePoll(tx: Tx, projectId: string,
poll: StoredSourcePoll): Promise<void>` dedupes `(pollId, projectId)`.
- Define DTOs in db/types using contracts' existing SourceKind and ordinary JSON
  types. `SourceRequestWrite` includes requestId, startedAt, purpose, family,
  HTTP metadata, per-source body digest and fully validated readings, with
  receivedAt from the write clock. `StoredSourcePoll` includes stable id,
  sourceId, kind, outcome, httpStatus, newRows, purpose and startedAt.

- [ ] Write failing database tests for absent observedAt, receivedAt, successful
      HTTP status and latency; an error carrying readings is rejected atomically.
      New first reading has revision 1; changed value gives exactly revision 2;
      canonical JSON key reordering gives no revision; different item keys coexist;
      legacy null item keys compare as empty without updating old rows.
- [ ] Add concurrency/replay tests: two transactions inserting one changed value
      produce one new revision; redelivering one request returns the same poll IDs;
      batched three-source request yields three polls with one request ID.
- [ ] Add RLS tests across two orgs, duplicate binding roles, archived-only and
      owner-scoped device sources. Test crowd state/period boundaries and nullable
      exits. Catalogue upsert preserves source ID and existing readings, propagates
      licence null, metadata, and staleAfterS override/default 2×cadence.
- [ ] Run `rtk bunx vitest run packages/db/test/sources-write.test.ts
packages/db/test/sources-catalogue.test.ts packages/db/test/sources-queries.test.ts`;
      confirm failure before implementation.
- [ ] Add poll purpose default `poll`, body_sha256 and api_family; add default
      empty item_key for new rows, retain legacy nullable history, and explicitly
      write initial revision 1. Make source licence_id nullable. Keep partition,
      uniqueness, RLS and append-only behavior; no backfill UPDATE of old readings.
- [ ] Implement sorted per-source advisory transaction locks, validation before
      insert, existing handleOnce request receipt, semantic reading dedupe, and
      stable persisted result loading. These ingestion locks are compatible with
      D45; they are not live request-budget locks.
- [ ] Implement tenant-scoped queries/upserts and per-project event receipts.
      Do not call withTenant inside withSystem. The worker sequences those wrappers.
- [ ] Run the new tests plus `packages/db/test/schema.test.ts` and
      `packages/db/test/catalogue.test.ts`, then `rtk bun run db:seed-check`.
- [ ] Commit `feat: persist source polls and revisions`.

### Task 3: database-free execution

**Files:**

- Create `apps/worker/src/sources/{types,storage,budget,http,execute,backfill}.ts`.
- Create `apps/worker/test/sources-{storage,budget,http,execute,backfill}.test.ts`
  and `apps/worker/test/support/source-adapter.ts`.
- Add `@skyclause/sources` workspace dependency/reference in worker manifest and
  tsconfig; keep existing GCS dependency, no package boundary exceptions.

**Interfaces:**

- `SourceObjectStore` provides `read(path): Promise<{body: Uint8Array,
generation: string} | null>` and `write(path, body, expectedGeneration):
Promise<string>`; generation 0 means absent. Real implementation uses GCS.
- `takeSourceBudget(store, family, requestId, clock): Promise<void>`; clock has
  wall `now`, monotonic elapsed time and awaitable `sleep` for deterministic tests.
- `createPollContext(options): {ctx: PollContext; requests: RequestCapture[]}`.
  Options supply adapter kind/family, source scope, storage, budget, HTTP,
  USER_AGENT, periods, logger and clock. Captures include actual bytes/digest,
  status, latency, start, request ID and typed error.
- `executeAdapter(adapter, sources, contextFactory, options):
Promise<SourceExecutionResult>`; options purpose/scheduledAt/previous digest;
  result contains per-physical-request captures and parsed reading outputs.
- `runBackfillOnce(adapter, source, ports): Promise<'running' | 'complete' |
'unsupported'>`; both job and event use this exact operation.
- Control objects are separate from adapter storage: poll plans, family budgets,
  source backfill claims and immutable results. Adapter paths follow the design.

- [ ] Write failing tests for 4 successful simultaneous starts and a denied fifth,
      family isolation, trailing-window boundary, concurrent 412 retries, restart
      with existing reservations, same request ID retry, and exactly 20-second wait.
- [ ] Write HTTP tests for 301/500/429, timeout during body consumption, network
      failure, malformed JSON, SchemaError, enforced User-Agent, redirect manual,
      exact body SHA-256, no second request on retry, and true measured metadata.
- [ ] Write executor tests for batching/per-source mode, all-identical bodies
      skipping parse, mixed old/new source digest, semantic unchanged rows, rejected
      foreign source IDs/metrics/units/JSON, and no readings after any operation error.
      Multi-request fetch must reserve twice and preserve both request metadata.
- [ ] Write storage tests for scratch vs sources paths, traversal rejection,
      404-only absence and propagated auth errors. Backfill tests race event/job,
      replay a saved result after publish failure, reject stale lease owners and
      recover an expired claim without inventing a second committed result.
- [ ] Run `rtk bunx vitest run apps/worker/test/sources-storage.test.ts
apps/worker/test/sources-budget.test.ts apps/worker/test/sources-http.test.ts
apps/worker/test/sources-execute.test.ts apps/worker/test/sources-backfill.test.ts`;
      establish red failures, then implement the smallest code satisfying them.
- [ ] Implement GCS CAS reservations with no DB imports in budget/http/execute;
      typed metadata sidecar; metric validation via SOURCE_METRICS; request-scoped
      budget credit; immutable result persistence and fenced backfill claims. No
      runtime map substitutes for cross-instance GCS coordination.
- [ ] Re-run phase tests and typecheck, then commit
      `feat: execute source adapters durably`.

### Task 4: live composition and delivery

**Files:**

- Create `apps/worker/src/sources/{plan,ingest,pubsub,jobs,index}.ts`.
- Modify `apps/worker/src/registry.ts` with one sources registration;
  `apps/worker/src/main.ts` only if shared publisher setup needs an explicit port.
- Modify `packages/config/src/env.ts` or validate source-job-specific env in
  sources/jobs without making unrelated jobs require source-only configuration.
- Create `infra/environments/production/sources.tf`; modify messaging.tf for a
  real poll-results topic/pull subscription and worker subscriber IAM.
- Create `apps/worker/test/sources-{ingest,jobs,integration}.test.ts`; update
  registry/infra tests and `infra/README.md` for actual operator commands.

**Interfaces:**

- `refreshSourcePlan(now: Date): Promise<void>` enumerates orgs using db queries,
  stores a versioned GCS plan with bindings, source details, successful digests
  and relevant periods. Plan read validates a schema and fails visibly if absent.
- `publishSourceResult(result): Promise<void>` saves immutable GCS result and
  publishes strict `{operation_id, kind, object_path, sha256}` to poll-results.
- `pullSourceResults(): Promise<PulledSourceResult[]>` and
  `ackSourceResults(ackIds: string[]): Promise<void>` use real Pub/Sub REST + ADC.
- `ingestSourceResult(message): Promise<void>` verifies path/hash/schema,
  rechecks current bindings, writes requests via withSystem, emits tenant events
  with stable receipt keys, publishes ReadingsUpdated and only then permits ack.
- `sources: WorkerPart` owns adapter/catalogue-sync/adapter-contracts jobs,
  source.bound consumer and sources-ingest batch. Export a `runAdapter(kind,
scheduledAt)` port usable by #125's future minute handler with no Postgres.

- [ ] Write failing integration tests for real registry job dispatch, three
      polls/one request/two tenant event sets, replay with a new Pub/Sub message ID,
      successful persistence then failed fan-out/publish, and no premature ack.
      Re-delivery must repair effects and keep revision count unchanged.
- [ ] Prove minute runAdapter uses only GCS/HTTP/PubSub: inject DB functions that
      throw and exercise the exported port. Prove latest-plan source bound/archived
      changes are revalidated at ingestion and no unrelated tenant data escapes.
- [ ] Test scheduled slot propagation, missing config/plan failures, empty real
      registry truthful reporting, unknown adapter rejection, contract-probe failure
      logging, and catalogue discovery failure preserving prior rows.
- [ ] Run `rtk bunx vitest run apps/worker/test/sources-ingest.test.ts
apps/worker/test/sources-jobs.test.ts apps/worker/test/sources-integration.test.ts`;
      confirm red tests before composition.
- [ ] Implement real runtime ports and WorkerPart. The batch pulls/drains durable
      results before refreshing plans. Ack only after all effects succeed; duplicate
      readings-updated messages retain the same poll ID. Large bodies stay in GCS.
      source.bound loads/validates its source in the event's tenant transaction and
      triggers the shared GCS backfill request without nesting withSystem; no HTTP
      execution belongs inside a long-lived DB transaction. Use the tenant handler to
      durably establish the GCS request, then run the executor after the tenant
      transaction ends. Its durable claim/result lets the job repair a missed
      after-commit execution; a missed
      event is repaired by the adapter job's outstanding-backfill scan.
- [ ] Add actual daily catalogue-sync and adapter-contracts job blocks using the
      existing job module and ADC identities. Add the pull topic/subscription, not a
      DB-writing push handler. Leave adapter-specific schedules to their tickets.
- [ ] Re-run targeted tests, run Terraform formatting/validation using existing
      initialized tools, build worker, and run all completion checks below once.
- [ ] Update graph with `rtk proxy graphify update .`, review the full diff and
      commit `feat: wire buffered source ingestion`.

## Completion evidence

Run and record `rtk bun run lint`, `rtk bun run typecheck`, `rtk bun run test`,
`rtk bun run test:e2e`, `rtk bun run openapi:check`, and
`rtk bun run db:seed-check`, plus `rtk bun run --cwd apps/worker build`.
Tests must be fresh and failures investigated; do not widen timeouts or silently
skip integration coverage. Map every #120 acceptance criterion to tests and
attach exact output to the PR as #79 requires.

A production APIMS execution/day of adapter-contract results waits for #123;
SIG-2's No call half waits for #133. Do not report these live checks as passed
from doubles. Expose polls/readings/events/readings-updated for those consumers,
with no evaluator or fake adapter included. Root owns deployment, external
contract/issue edits and integration/review decisions.
