# Project source list implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (the parent's selected fresh
> implementer/reviewer workflow) or superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement only `listProjectSources`, the #134 backend prerequisite
for #717 Packs, with complete truthful source health and tenant isolation.

**Architecture:** A read-only signals service calls a DB-owned paginated binding
projection in the existing tenant transaction. A list-specific serializer
extends the existing bound-source DTO without changing #138 bind/catalogue
semantics. The route registry mounts exactly one additional operation.

**Tech stack:** TypeScript, Hono/Zod registry, Drizzle, real PostgreSQL, Vitest;
existing runtime and dependencies only.

**Spec:** [Project source list prerequisite design](/docs/superpowers/specs/2026-11-12-project-source-list-design.md),
[#134](https://github.com/m1kulabs/Skyclause/issues/134),
[#79](https://github.com/m1kulabs/Skyclause/issues/79) and its current amendments.
Parent approval of the design's explicit rulings precedes code.

Contents:

- [Global constraints](#global-constraints)
- [Review focus](#review-focus)
- [Task 1: Define and read source health](#task-1-define-and-read-source-health)
- [Task 2: Mount the authorized read](#task-2-mount-the-authorized-read)
- [Task 3: Verify and hand off the prerequisite](#task-3-verify-and-hand-off-the-prerequisite)

## Global constraints

- Baseline `83787e800d610c863fe307b0dbc65461e8f515b5`, isolated worktree
  `/Users/jeremywoon/.codex/worktrees/2d2a/gdgocapu`; inspect current status before
  editing. Import only merged repository code, no teammate WIP.
- Actual Node `v22.22.0` from
  `/Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/tooling/node22/bin/node`;
  Bun `1.4.4`; verify actual executables, not only `PATH` labels.
- Local PostgreSQL `SKYCLAUSE_DB_HOST=127.0.0.1`,
  `SKYCLAUSE_DB_PORT=56440`; existing harness creates migrated isolated test
  databases. Never production DB or reset/delete shared volumes.
- Every heavy run uses
  `/Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/validation-lock.py`
  and its shared `heavy-validation.lock`. At most four Vitest workers; retain
  default 5000 ms test timeout. Save exact HEAD, command, exit status and logs
  under `/Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/`.
- Prefix shell commands with `rtk`; inspect matching Graphify queries first.
  No new dependencies/migrations, raw SQL outside DB, runtime fixtures, UI
  changes, source-entity writes, state recomputation, external calls or cloud changes.
- Preserve migrations/captures. Real captured data for evidence; synthetic
  temporal/error/authorization cases are test-only doubles, never runtime data.
- Keep #134 open and all remaining routes unbuilt; no premature #717 completion.

## Review focus

- APIMS multiple physical outcomes in one logical slot: error remains visible
  (Task 1 boundary test).
- Legacy null receipt and late ingestion: no invented receipt or availability
  (Task 1 temporal projection test).
- Future MET dates and unchanged polls: raw date retained, polled age correct
  (Task 2 DTO test).
- Corrupt same-org device binding: project ownership prevents private data leak
  (Task 1 ownership and Task 2 scoped-principal tests).
- Evaluator lag and absent state: never reconstruct healthy state or expose
  last value after the newest normal error (Task 2 error test).

## Task 1: Define and read source health

**Files:**

- Modify `packages/contracts/src/api/v1/sources.ts` and generated
  `packages/api/openapi.json`.
- Create `packages/contracts/test/api/source-health.test.ts`.
- Create `packages/db/src/signals/index.ts`; export it from
  `packages/db/src/index.ts`.
- Create `packages/db/test/source-health.test.ts`.

**Interfaces:**

- Consume `Tx`, `source`, `sourceState`, `projectSource`, `poll`, `reading`, and
  `SourceProjection` from the existing DB modules. Do not change the existing
  picker projection's behavior or #133 evaluator functions.
- Produce `ProjectSourceHealth` schema local to the contract module, used only
  by `listProjectSources.responses[200] = Page(ProjectSourceHealth)`, with the
  exact additions in the design.
- Export DB types and function:

  ```ts
  type ProjectSourceHealthRecord = SourceProjection & {
    bindingId: string
    projectId: string
    role: SourceRole
    normalPolls: Array<typeof poll.$inferSelect> // bounded 48-slot interval
    latestNormalPoll: typeof poll.$inferSelect | null
    latestGoodNormalPoll: typeof poll.$inferSelect | null
  }
  listProjectSourceRecords(
    tx: Tx,
    query: { projectId: string; limit: number; afterId?: string; now: Date }
  ): Promise<ProjectSourceHealthRecord[]>
  ```

- [ ] Write failing contract tests: valid complete list row; supplied history
      has exactly 48 slots; nullable state/reading/error/status; supplied last_error
      requires message and purpose. Both additions are optional in the schema;
      existing list fixtures and bind's response still parse without them.
- [ ] Write failing real-PG tests: empty list; binding UUID pagination with
      `limit+1`; two tenants share captured public `CA16W` but not bindings; own
      camera/Pi needs matching `meta.project_id`; malformed/foreign/conflicting
      device metadata is excluded before projecting its values. Include a private
      source also incorrectly bound to a different project: do not return it as
      legitimately owned without rejecting that conflict. Retain the existing
      `packages/db/test/catalogue.test.ts` real `withPublicReader`/foreign-tenant
      assertions proving C sources, polls, readings and state remain public while
      device rows do not; run that suite with this task's focused checks.
- [ ] Add named temporal cases: retained 3-hour-old error despite five newer
      successes; backfill-only source produces no normal-poll evidence; APIMS
      cadence 3600 with 900-second outcomes; equal clock ordering by UUID; rows
      received after `now` excluded; null legacy receipt kept null; readings
      received after `now` excluded. Use `capturedCa16w()` from
      `packages/db/test/source-binding-capture.ts` for the real API value.
- [ ] Run focused tests through the validation wrapper; observe expected
      missing-schema/query failures. Implement batched DB reads and contract only.
      `recentErrors` is five newest error polls (all purposes), ordered by actual
      start/id; its first entry supplies `last_error`. Enforce private ownership
      before evidence queries. Latest reading preserves existing deterministic
      ordering with a received-by-now cutoff. Normal poll selection is purpose
      aware and never uses backfill to set freshness.
- [ ] Re-run focused contracts/DB tests green; run `rtk bun run openapi:generate`
      through the wrapper, then `rtk bun run --filter @skyclause/sdk generate` via the normal generator. Check schema changes are list-only; do not hand-edit SDK hashes. Commit
      `feat: define project source health reads`.

## Task 2: Mount the authorized read

**Files:**

- Create `packages/api/src/services/signals/index.ts` and `serialize.ts`.
- Create `packages/api/src/routes/signals/index.ts`; register `signalHandlers`
  in `packages/api/src/routes/index.ts`.
- Export service/types from `packages/api/src/index.ts`.
- Create `packages/api/test/project-sources.test.ts`.

**Interfaces:**

- Consume Task 1 DB records, `getProjectRecord(handle: TxHandle, projectId:
string)`, `serializeBoundSource(row: SourceProjection, binding:
Pick<BoundSourceView, 'project_id' | 'role'>, now: Date)`, `page`,
  `decodeCursor`, `inTenant`, and `SourcesAccess = {can: Can; now: Date}`.
- Define `ProjectSourcesQuery` from
  `Operations['listProjectSources']['request']['query']` and
  `ProjectSourceHealthView` from that operation's 200 schema data element.
- Export `listProjectSources(ctx: ServiceContext, input: {projectId: string;
query: ProjectSourcesQuery}, access: SourcesAccess):
Promise<Page<ProjectSourceHealthView>>`.
- Define `serializeProjectSourceHealth(row: ProjectSourceHealthRecord,
now: Date): ProjectSourceHealthView`. Reuse the existing serializer for the
  complete base DTO; override only list-specific latest/age rules and append
  history/last_error. Never alter bind/catalogue behavior.
- Cursor payload is strict `{v: 1, org_id: UUID, project_id: UUID,
binding_id: UUID}`; mismatches/malformed cursors are 422 on `/cursor`.

- [ ] Write failing operation tests using `createTestApi`, real `withTenant`,
      injected clock and real `recordAudit`: newly created empty project 200;
      captured bound public source complete DTO; error state's exact `since` plus
      null latest/age; absent state stays null; fresh stored state plus newest
      normal error returns state/latest/age null without a stored-state write;
      actual GET rows always contain history and last_error despite optional
      schema compatibility; no source-state/audit/domain-event/analytics/binding
      writes.
- [ ] Add temporal response assertions: 48 ascending half-open slots exactly
      ending `now`; oldest edge included, internal edge in next slot, exact `now`
      excluded; error takes precedence over later success in its slot; 3-hour-old
      error has actual nullable HTTP status/message/time; backfill error retained
      as last_error with purpose while normal slots remain unaffected. A MET
      captured future-date reading retains original metadata, latest successful
      normal unchanged poll defines `age_s`; backfill alone cannot define polled
      age. Do not change tests to bless zero age for future observations.
- [ ] Add `crossOrgCase('listProjectSources', ...).run()` for a foreign project.
      Cover viewer, guest with permission, read API key and authorized OAuth/
      reviewer link; same-org out-of-scope OAuth/link 404; denied permission and
      ingest-only key 403 even for foreign IDs; missing principal 401; private
      device metadata hidden; invalid limit/cursor 422 and limit-1 pagination
      visits each binding once. Test the direct service denial too because it is
      callable without HTTP middleware; do not rely on `testCan` to enforce
      project scope (that double ignores the target argument).
- [ ] Run the new API suite red: authorized route currently returns 501.
      Implement the service checks before lookup, explicit principal/tenant scope,
      nonlocking project existence read, DB query and serializer; register exactly
      one handler using `inTenant` and injected `now()`.
- [ ] Run API suite plus `source-binding.test.ts`, `source-packs.test.ts` and
      `cross-org-meta.test.ts` green. Commit
      `feat: serve authorized project source health`.

## Task 3: Verify and hand off the prerequisite

**Files:** only generated graph evidence if required, and external artifact
logs. No extra implementation scope.

- [ ] Under the shared lock and verified runtime, run focused tests with
      `rtk bun x vitest run --project @skyclause/contracts --project @skyclause/db
--project @skyclause/api packages/contracts/test/api/source-health.test.ts
packages/db/test/source-health.test.ts packages/api/test/project-sources.test.ts
packages/api/test/source-binding.test.ts packages/api/test/source-packs.test.ts
packages/api/test/cross-org-meta.test.ts --maxWorkers=4`.
      Expected: all pass, real PG harness, no skipped new tests.
- [ ] Run required gates, sequentially through the same lock:
      `rtk bun run lint`, `rtk bun run typecheck`,
      `rtk bun run test --maxWorkers=4`, `rtk bun run openapi:check`, and
      `rtk bun run db:seed-check`. Verify the root test script forwards the worker
      cap; if it does not, build SDK as the script does and invoke Vitest directly
      with `--maxWorkers=4`, recording the equivalent command. Expected: exit 0
      for each. Do not raise timeouts to hide failures.
- [ ] Run the matching pinned `rtk proxy /Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/tooling/graphify-0.9.105/bin/graphify update .` (never the lossy global0.9.61); inspect source diff and graph output, and
      save exact verification evidence. Fresh independent review checks design
      rulings, private-data scopes and 48-slot semantics before integration.
- [ ] Parent opens/merges the reviewed prerequisite PR under
      existing authorization. Its description states `Part of #134`, identifies
      additive schema/semantic rulings, the #79 owned-optional-field exemption,
      and remaining #134 ownership. Keep
      #134 open; do not claim production p95, frontend transport success or #717
      completion from this backend merge. Return the backend commit/PR and checks
      to the parent for the separately owned browser verification.

Parent approval: all four design rulings accepted for this list-only prerequisite under the user's autonomous submission instruction. No full134 closure is authorized. Source-entity/data writes are forbidden; repository implementation edits are the task. Temporal tests use one explicit injected request clock and explicit fixture timestamps, never DB-default clocks against unrelated host cutoffs.
