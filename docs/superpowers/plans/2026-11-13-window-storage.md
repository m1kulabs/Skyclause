# Window storage implementation plan

Approved issue139 Task3 isolated from pure parser work. Use subagent-driven-development for one storage task; parent owns independent review and later integration into the whole139 branch.

**Goal:** durable native/imported identities and atomic tenant-scoped window mutations with correct local-time conversion, events and cancellation ledger history.

**Spec:** approved lifecycle design copied verbatim to /Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/139-storage-design.md. Original complete plan available through commit e2e799beaac13d675bb8b875bf7dc638f84f6644. This is original Task3, not the whole139 issue.

Contents:

1. [Global constraints](#global-constraints)
1. [Task 1: Durable identities and atomic mutations](#task-1-durable-identities-and-atomic-mutations)

## Global constraints

- Branchfeat/windows-storage-20261113, existing clean isolated worktree3973, base8ea6a992. Originalmain untouched. The CI-only41e5bbe1 commit is retained on its separate branch and PR774; remote checks do not require its old local checkout.
- Every shell/subprocess beginsrtk; heavy commands through pinnedrun-check.py shared lock, Node22.22/Bun1.4.4/localPG56440/maxWorkers4/default5000ms. Use existing approved VM/DB, no new images/config/productionmigration.
- SQL onlypackages/db; applied migrations/snapshots immutable. Recheck migration numbering before generation and final integration.
- No API services/routes, parser/frontend, cloud/GitHub/push changes. Real data only in production; isolated test doubles permitted. No reference-project names anywhere in repository artifacts.
- New storage primitives consume service-validated input; authorization and actual guest/unattended policy remain API/181 work. Derive audit actor from tx.principal, never caller actor fields. Tx carries principal andorgId.
- Main already supplies packages/db/src/windows/index.ts, WindowRow, narrow WindowInsert, insertWindow, listWindowRecords andlatestWindowCalls. Preserve their public names/behavior. Use a distinct WindowMutationInsert inferred from schema with orgId omitted for the new mutation union, rather than widen the existing single-window WindowInsert. The canonical tx.orgId is injected, never trusted from values. Integrate exports without duplication.
- No-op/cancel replay writes no event or ledger. Keep sent calls/bundles intact. Source restoration cannot undo manual overrides. Use real appendLedger in the caller's Tx; no nestedtenant/system connections or per-occurrenceconnections.
- Immutable calendar metadata revision/representative/fullsortedIDset follows approved design; wire contract/consumer amendments stay parentTask4/6. Existingparenthelper preflight and coremember operations can progress without runtimeguest defaults.
- Bound parser fixes are independent: normalizeddocument shape and local-span callback stay stable; parser recurrence admission changes do not require DB code. Read the copied calendar types for exact structural span only; DB cannot import API/ical.js.
- Parent owns final whole139 graph/integrated fullsuite/Linux. Agent runs new/focusedDB regressions, DBtypecheck/rootlint andnormalcommit hooks, then reports exacthead/tree andeveryRED/GREEN command/exit/log. Never mark139complete or close it.

### Task 1: Durable identities and atomic mutations

**Files:** modify `packages/db/src/schema/windows.ts`, `packages/db/src/index.ts`; modify `packages/db/src/windows/index.ts`; create `packages/db/src/windows/{types,calendar-time,mutations,repository}.ts`; add generated next migration, its new snapshot and journal entry; tests `packages/db/test/windows-lifecycle.test.ts`, `windows-calendar-time.test.ts`. No prior migration edits.

**Interfaces:** `resolveWindowLocalSpan(tx:Tx, span:LocalSpan):Promise<{startsAt:Date;endsAt:Date}>` (define matching DB-local structural input); `writeWindowChange(tx:Tx, change:WindowChange):Promise<WindowRow>`; `lockWindowParent(tx:Tx,id:string):Promise<WindowRow|null>`. `WindowChange` is a discriminated union `{kind:'create'; values:WindowMutationInsert; now:Date; calendar?:CalendarBatch}` or `{kind:'update'; id:string; patch:Partial<Pick<WindowMutationInsert,'title'|'kind'|'startsAt'|'endsAt'|'tz'|'localOverride'>>; now:Date; calendar?:CalendarBatch}` or `{kind:'cancel'; id:string; origin:'manual'|'series'|'source'; now:Date; calendar?:CalendarBatch}` or `{kind:'restore-source';id:string;now:Date;calendar:CalendarBatch}`. Source restoration requires an active feed/series and a non-overridden source-cancelled row; it emits window.updated and retains prior ledger history. Inputs are service-validated; patch fields are optional individually. Reuse the existing exported `WindowRow` and narrow `WindowInsert`; export distinct `WindowMutationInsert` inferred from the schema with `orgId` omitted. Mutation primitive computes actual differences, writes events and uses real appendLedger for sent-call cancellation.

- [ ] Write failing real-DB tests for both unique identities, same-org series/feed constraints, legacy nullable identity handling, concurrent same-occurrence insertion, all-or-nothing events/ledger and cancellation replay. A sent-call cancel preserves calls and produces one verifiable `window_cancelled` entry with the exact pseudonymous actor and injected cancellation time. Ledger failure rolls the whole mutation back. No-op update/cancel emits nothing; a manual cancellation marks local override, and source cancellation/restoration cannot override it.
- [ ] Add local-time tests for MYT overnight 23:00–01:00, a DST spring gap rejected by round trip, fall overlap matching PostgreSQL's standard-time choice, and a daily series keeping 09:00 local across an offset change. Do not implement this by midnight-plus-minutes.
- [ ] Run `rtk bunx vitest run packages/db/test/windows-lifecycle.test.ts packages/db/test/windows-calendar-time.test.ts`; observe failure. Add the design's columns/indexes and generate the new migration with `rtk bun run --cwd packages/db generate -- --name b-windows-api-lifecycle`. Add tenant-scoped locks and mutation functions, with feed → series → sorted windows lock order.
- [ ] Run the same command and `rtk bunx vitest run packages/db/test/tenancy.test.ts packages/db/test/migrate.test.ts`. Confirm all pass on the local Postgres harness after `rtk bun run db:up`. Never run a production migration. Review nullable legacy behavior and preserved applied migration hashes before commit.
