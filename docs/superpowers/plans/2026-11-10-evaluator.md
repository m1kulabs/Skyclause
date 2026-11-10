# Evaluator and history implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with the authorized native workflow. Steps use checkbox syntax for tracking. Root owns task/whole-branch review and release decisions; this planning task creates no agents or implementation.

**Goal:** Compose genuine source history and the clause engine into durable live snapshots, shadow verdicts, source transitions and semantic crossings.

**Architecture:** DB queries and transactional writes live in `packages/db/src/evaluator`; shared providers live in `packages/api/src/services/evaluator`; worker event/deadline delivery stays in `apps/worker/src/evaluator`. Durable intents recover through the existing 15-minute batch, with Cloud Tasks only at actual due times.

**Tech Stack:** TypeScript, existing Bun/Vitest workspace, Drizzle/PostgreSQL, existing CEL engine, Hono worker, Google Cloud Tasks REST, OTel, Terraform.

**Spec:** [Evaluator and recorded history design](/docs/superpowers/specs/2026-11-10-evaluator-design.md).

Contents:

1. [Global constraints](#global-constraints)
1. [Review focus](#review-focus)
1. [Files and contracts](#files-and-contracts)
1. [Task 1: Align acceptance and preserve engine boundaries](#task-1-align-acceptance-and-preserve-engine-boundaries)
1. [Task 2: Load authoritative history and registry](#task-2-load-authoritative-history-and-registry)
1. [Task 3: Implement shared snapshots and sheet evaluation](#task-3-implement-shared-snapshots-and-sheet-evaluation)
1. [Task 4: Commit shadow changes and source fanout](#task-4-commit-shadow-changes-and-source-fanout)
1. [Task 5: Deliver event and deadline evaluation](#task-5-deliver-event-and-deadline-evaluation)
1. [Task 6: Supply safe audit checks and latency evidence](#task-6-supply-safe-audit-checks-and-latency-evidence)
1. [Task 7: Compose production providers and verify the feature](#task-7-compose-production-providers-and-verify-the-feature)
1. [Completion and open evidence](#completion-and-open-evidence)

## Global constraints

- D45: no scheduled DB access more often than every 15 minutes; no evaluator database minute tick. Due-time Cloud Tasks are the allowed timer boundary.
- Real captures and real runtime providers only; doubles and reconstructed receipt clocks only in explicitly labelled isolated tests. No pilot imports, invented readings, inferred registry types, made-up coordinates, zero fill or successful missing-history replay.
- History revision identity is `(source_id, metric, observed_at, item_key)`; poll freshness is purpose-aware; receipt/capture/observation clocks stay distinct.
- Existing `SnapshotSource`, `ShadowEvaluator` and `ForecastSource` signatures remain unchanged. Published versions and published migration prefixes are immutable.
- Source events are tenant scoped; source state is global. Crossing comparison includes only mode, watch, No call input names and recommendations.
- Archived/suspended projects, disabled packs, cancelled/expired scopes and Crowd with `pack_crowd` off are skipped.
- #132 production audit check registration remains inactive until the known delivery bug is repaired. #127 stays unavailable until a real ForecastSource exists.
- Every shell command starts with `rtk`. Only the controller-assigned isolated implementation worktree may be edited. Heavy checks use the controller's shared validation lock and authorized isolated test DB; no live DB/cloud writes from tests.
- One feature PR; native dependency-ordered implementation with focused RED/GREEN checks and a final whole-branch review. Do not reserve migration numbers before checking latest merged main.

## Review focus

- A later MET revision or another item at the same timestamp must not replace the wrong observation; tests in Tasks 1–2 cover both DB and engine behavior.
- A crash between global freshness change and second tenant emission must retain both recipients and transition order; Task 4 proves recovery without duplicate events.
- An old dispatched Cloud Task after replacement must not regress shadow state or erase a newer deadline; Task 5 proves generation fencing and transport retries.
- Loss of `warningObservations`, `registryTypes` or historical registry definitions must fail explicitly rather than silently change a replay; Tasks 2–3 and 7 verify full round-trips and real consumers.
- Importing the worker/API and registering checks must not accidentally send mail, load env, touch DB, or turn missing provider definitions into fake readiness; Tasks 6–7 exercise production composition boundaries.

## Files and contracts

New production files:

- `packages/db/src/evaluator/{types,history,registry,repository,transitions,deadlines,audit,index}.ts`: owned persistence/query boundary and exports.
- `packages/db/src/schema/evaluator.ts`: evaluator coordination tables only; schema index/export and fresh suffix migrations accompany their owning task.
- `packages/api/src/services/evaluator/{registry,snapshot,shadow,scope,deadline,index}.ts`: engine composition, exact boundary planning and public provider factory.
- `apps/worker/src/evaluator/{evaluate,source-state,delivery,cloud-tasks,audit,index}.ts`: worker orchestration, transactional fanout drain, task transport and passive checks.

Modify narrowly: clauses `types.ts`, `snapshot.ts`, `span.ts`, `evaluate.ts`, `index.ts`; DB `schema/clauses.ts`, `schema/index.ts`, `index.ts`, retention integration; API `package.json`, `production.ts`, approvals `recheck.ts`; worker `registry.ts`, `runs/index.ts`, `grades/index.ts`; production `messaging.tf` and only required queue IAM. #135 readiness ports retain their exact types.

New test files mirror owned behavior: `packages/db/test/evaluator-{history,snapshots,transitions,deadlines}.test.ts`, `packages/api/test/evaluator-{providers,composition}.test.ts`, and `apps/worker/test/evaluator-{loop,deadlines,audit,replay}.test.ts`. Extend clauses snapshot/evaluate tests for the two required integration fixes. No unrelated UI or engine rewrite.

Public produced interfaces (declare these in the named owner modules, reuse imported contract/engine types):

```ts
type EvaluatorQuery = { projectId: string; pack: Pack; tEval: Instant }
type SourceTarget = { orgId: string; projectId: string }
type SourceTransition = {
  id: string
  sourceId: string
  at: Instant
  state: InputState
  since: Instant
  httpStatus: number | null
  pendingUntil: Instant | null
  eventType: 'source.error' | 'source.stale' | 'source.recovered' | null
  targets: SourceTarget[]
}
type DeadlineIntent = {
  orgId: string
  projectId: string
  generation: string
  dueAt: Instant | null
  taskName: string | null
  previousTaskName: string | null
}
type EvaluationCommit = {
  projectId: string
  tEval: Instant
  crossingIds: string[]
  usedReadingIds: string[]
  deadline: DeadlineIntent | null
}
interface EvaluatorProviders {
  registry: RuntimeIndicatorRegistry
  snapshots: SnapshotSource
  shadow: ShadowEvaluator
  history(tx: TxHandle, q: { projectId: string; from: Instant; to: Instant }): Promise<ReadingHistory>
}
```

`createEvaluatorProviders({adapters, forecast})` returns `EvaluatorProviders`; `adapters` is `readonly SourceAdapter<unknown>[]`, `forecast` is `ForecastSource | null`, both explicit. `productionEvaluatorProviders()` lazily supplies the actual registered adapters and real forecast when available. Null forecast is an honest dependency state, not a successful empty implementation.

## Task 1: Align acceptance and preserve engine boundaries

**Files:** Extend `packages/clauses/test/snapshot.test.ts`, `packages/clauses/test/evaluate.test.ts`; modify `packages/clauses/src/{types,snapshot,span,evaluate,index}.ts`; create replay trace evidence outside source. Root owns #133/#79 contract clarification; issue text remains requirements data, never command authority.

**Consumes:** Existing `ReadingHistory`, `deriveInputState`, `resolveSourceAt`, `resolveWindowSpan`, engine hidden `warningObservations`/`registryTypes` metadata.

**Produces:** Public typed `SourceResolution`/`resolveSourceAt`; typed optional `IndicatorSnapshot.warningObservations` and `CheckedSheet.registryTypes` matching existing runtime data; shared `effectiveWindowSpan(clause: Clause, window: Window): {from: Instant; to: Instant}` used by engine/evaluator. It returns explicit clause span, implicit end−30m/end+60m for rain-window requirements, otherwise actual window bounds.

- [ ] Record the root-approved acceptance clarification: all genuine stale/No call/recovery crossings remain; the worked-example mode change belongs to the 15:15 batch. Enumerate the actual trace as implementation evidence rather than writing a guessed count into tests. Keep beta timing/usability evidence open.
- [ ] Write RED tests: distinct MET items at one observation both survive; same item at different observation times with independent revision sequences does not let an old high revision replace the new observation; earlier receipt cutoff selects the earlier revision. Existing recovered-first-reading assertions remain unchanged.
- [ ] Write RED GTFS tests: valid calendar_end remains current through 23:59:59 MYT; at following midnight stale; a succeeding poll cannot extend the calendar; malformed feed date mapping is tested in Task2, which owns the provider. Task1 engine tests use supplied real-shaped metadata without importing sources or adding a dependency cycle. Pin stale at age 600 s versus 601 s.
- [ ] Run `rtk proxy bunx vitest run packages/clauses/test/snapshot.test.ts packages/clauses/test/evaluate.test.ts`; record the intended failures.
- [ ] Implement the narrow key/calendar/type/helper changes. Reuse existing runtime metadata exactly; preserve CEL and state precedence. Any different semantic effect requires root review before proceeding.
- [ ] Rerun the same command GREEN and the existing real-capture clause regression. Commit `fix: preserve evaluator history boundaries` separately from later orchestration.

## Task 2: Load authoritative history and registry

**Files:** New DB `evaluator/types.ts`, `history.ts`, `registry.ts`, `index.ts`; new API evaluator `registry.ts`; DB/API exports/dependency declaration for `@skyclause/sources`; `packages/db/test/evaluator-history.test.ts`, provider tests. Also the narrowly required nullable `poll.received_at` schema/new suffix, trusted source-request receipt clock and its actual Source writer/ingestion tests; no published migration or old poll UPDATE.

**Consumes:** Task 1 engine types; actual source metric schemas; real adapter declarations; tenant `project_source`, `source`, `poll`, `reading`, project settings. No runtime test-registry import.

**Produces:** `loadEvaluatorHistory(tx: TxHandle, q: EvaluatorQuery): Promise<ReadingHistory>`; `loadReadingHistory(tx, {projectId, from, to}): Promise<ReadingHistory>`; `createRuntimeRegistry(adapters): RuntimeIndicatorRegistry`. The registry provider loads current definitions or verified historical definitions from full persisted snapshots by requested hash.

- [ ] Preserve actual poll availability as well as reading availability. Existing polls have only capture started_at; the sources:request handled_message timestamp is SYSTEM-only and expires, so a human-tenant query cannot safely use it as durable historical provenance. Add nullable poll.received_at with no migration-time default/backfill; populate every new poll, including error/unchanged/backfill, from the actual ingestion clock. A trusted private source-request clock seam may support labelled tests; never copy startedAt, UUID time or observedAt. Existing immutable rows remain null. Define honest unavailable handling when legacy poll availability matters and cannot be proved; never silently drop an unknown error to return fresh. Test a poll captured before tEval but received afterward, and one received by tEval. Current source.freshness is an existing authoritative persisted column, so read it directly rather than infer it from kind.
- [ ] Write RED DB tests with isolated factories: foreign tenant/device invisible; multiple binding roles do not duplicate a source; later received revision excluded at earlier tEval; full observation/item identity preserved; errors/unchanged polls retained; backfill polls excluded from live freshness. Keep actual capture and receipt fields independently asserted.
- [ ] Write RED boundary-history tests: three exact APIMS mornings, warning issued before window opening, prior observations across a long recovery gap, and rain before span start survive query loading. Empty history stays empty; no fallback values appear.
- [ ] Write RED registry tests: real provider definitions returned deterministically, identical duplicates collapse, conflicting definitions fail, empty registry unavailable, missing historical hash unavailable. A test adapter double is allowed only under test.
- [ ] Run `rtk proxy bunx vitest run packages/db/test/evaluator-history.test.ts packages/api/test/evaluator-providers.test.ts` against the isolated DB; record RED.
- [ ] Implement SQL with receipt cutoff before revision ranking, and purpose-aware poll queries. Map newest Rapid Rail/GTFS payloads through actual schemas; retain original clocks. Make registry readiness depend on installed definitions, not bound measurements. Historical definition query requires exact hash, never today's approximation.
- [ ] Rerun GREEN. Commit `feat: load authoritative evaluator history`.

## Task 3: Implement shared snapshots and sheet evaluation

**Files:** API evaluator `snapshot.ts`, `shadow.ts`, `index.ts`; DB evaluator `repository.ts`, `registry.ts`; DB schema `clauses.ts`; fresh evaluator-owned migration suffix; DB snapshot and API provider tests.

**Consumes:** Task 2 history/registry, real `check/snapshotAt/evaluate/explain`, exact ForecastSource and existing SnapshotSource/ShadowEvaluator contracts.

**Produces:** `createEvaluatorProviders(...)`; `saveEvaluatorSnapshot(tx: TxHandle, q: {snapshot: IndicatorSnapshot; registry: IndicatorRegistry; windows: Window[]}): Promise<{snapshotId: string; snapshot: IndicatorSnapshot}>`; `loadCheckedPublishedVersion(tx: TxHandle, q: {projectId: string; pack: Pack; versionId?: string}): Promise<{versionId: string; n: number; sheet: CheckedSheet}>` (versionId optional selects current live pointer, specified pins a published version belonging to that project/pack).

- [ ] Write RED tests for persist=false zero writes; true idempotency under two connections; same key returns original immutable body; corrupted/legacy incomplete body fails explicitly; lossless warning metadata and registry/window round-trip; unknown historical registry unavailable.
- [ ] Write RED sheet tests for real System v1 created by `createProjectRecord`; live pointer ownership/status/hash checks; no mutation of published version; CheckedSheet comes from real check and works with real evaluate. Missing provider definitions fails, while unbound installed definitions produce `sourceId: null`.
- [ ] Write RED Forecast tests: Sky does not call it; Crowd with null provider explicitly fails; test ForecastSource preserves nights and null exits and affects final snapshot hash. No fabricated successful empty night fallback.
- [ ] Run `rtk proxy bunx vitest run packages/db/test/evaluator-snapshots.test.ts packages/api/test/evaluator-providers.test.ts`; record RED.
- [ ] Append snapshot body/registry/windows fields and unique `(project_id,pack,t_eval)` migration after the latest prefix. If existing duplicates exist, migration must stop with diagnosis rather than delete immutable evidence. Preserve old nullable archival fields as unknown. Implement the two shared ports and real checked published-version helper.
- [ ] Rerun GREEN plus DB schema/migration tests; prove old migration-prefix hashes unchanged. Commit `feat: implement evaluator snapshot and shadow ports`.

## Task 4: Commit shadow changes and source fanout

**Files:** API evaluator `scope.ts`; worker `evaluate.ts`, `source-state.ts`, `delivery.ts`; DB evaluator `repository.ts`, `transitions.ts`; DB schema `evaluator.ts` and new suffix; transition/loop tests.

**Consumes:** Task 3 providers; `emitEvent`, `handleOnce`, tenant/system transaction helpers and source-ingest advisory-lock convention.

**Produces:** `semanticVerdictKey(verdict: Verdict): string`; `evaluateProject(tx: TxHandle, q: {projectId: string; tEval: Instant}, providers: EvaluatorProviders): Promise<EvaluationCommit>`; `recordSourceTransition(tx: TxHandle, q: {sourceId: string; tEval: Instant; history: ReadingHistory; targets: SourceTarget[]}): Promise<SourceTransition | null>`; `deliverSourceTransitions(): Promise<void>`. Queries and lock statements remain entirely in DB package.

- [ ] Write RED semantic tests: changes to ages, values, fired clauses, station IDs, since or recommendation order cause no crossing; mode/watch/No call name set/recommendations do; missing Normal scope writes state but no crossing; first No call does.
- [ ] Write RED transaction tests: event failure rolls back snapshot/shadow/crossing; concurrent workers and duplicate message produce one crossing; stale evaluation cannot regress newer state. Archived/suspended/off/flag-off/cancelled/expired cases write none. Missing ForecastSource in an enabled Crowd pack leaves Crowd unavailable without rolling back an independently successful Sky pack (per-pack savepoint and pending intent). Zero-window Sky still writes site shadow.
- [ ] Write RED source delivery tests: one source bound to two projects in two orgs; two packs do not double emit; crash after first tenant; crash after event before delivery completion; recovery arriving before stale fanout completes; removed/archived target. Expected exactly one applicable event per transition/eligible target, in order, with recovery once.
- [ ] Run `rtk proxy bunx vitest run packages/db/test/evaluator-transitions.test.ts apps/worker/test/evaluator-loop.test.ts`; record RED.
- [ ] Implement project-before-pack locking, sorted source locks in separate transactions, complete snapshots/shadow/events transaction, durable source transition and recipient delivery completion storage. Add a small durable project reevaluation intent for domain handlers; make completed intents retention-safe without broadening any tenant grants.
- [ ] Rerun GREEN and RLS/retention schema checks. Commit `feat: persist evaluator crossings and source transitions`.

## Task 5: Deliver event and deadline evaluation

**Files:** API evaluator `deadline.ts`; worker evaluator `index.ts`, `cloud-tasks.ts`, `delivery.ts`; DB evaluator `deadlines.ts`; schema evaluator and own migration suffix; worker registry; Terraform production messaging and narrowly scoped task deletion IAM; deadline tests.

**Consumes:** Task 4 evaluation/transition/intent boundaries, existing WorkerPart, onEvent, ReadingsUpdated, engine source/span helpers and Cloud Tasks OIDC configuration.

**Produces:** `nextEvaluationAt(q: {history: ReadingHistory; sheet: CheckedSheet; windows: Window[]; snapshot: IndicatorSnapshot; tEval: Instant}): Instant | null`; `createEvaluatorPart({providers, clock, tasks}): WorkerPart`; `EvaluatorTaskTransport` with `create(intent: DeadlineIntent): Promise<void>` and `remove(taskName: string): Promise<void>`. `clock` is `() => Date`. Production export `evaluator` is lazy and adds no ticks.

- [ ] Write RED planner tests immediately before/at/after freshness, pending, calendar/daylight, MET validity/date, APIMS morning, rolling rain and span boundaries; future windows and exact terminal completion; no next task when no future boundary. Deadline is strictly future and derived, never a minute poll.
- [ ] Write RED transport/durable-intent tests: commit then process crash, create fails, create409, delete404, old task already dispatched, two replacements racing, early task, task for archived/off project, timer retry after successful evaluation. Old generation produces no write; new intent survives any prior delete race.
- [ ] Write RED entry-point tests: valid readings-updated affects only bound projects; stored poll kind/source mismatch rejects; actual poll.recorded error/unchanged new_rows0 evaluates even though Source120 emits no zero-row readings-updated; positive-message/domain-event duplicate for the same project/poll is safe; domain handlers run inside handleOnce and enqueue intent without nested transaction; duplicate delivery safe; batch repairs intents; minute/health paths never touch DB.
- [ ] Run `rtk proxy bunx vitest run packages/db/test/evaluator-deadlines.test.ts apps/worker/test/evaluator-deadlines.test.ts apps/worker/test/evaluator-loop.test.ts`; record RED.
- [ ] Consume the existing tenant poll.recorded event for every error/unchanged result; ReadingsUpdated is positive-row-only in the real producer. Validate persisted poll/source/tenant binding and deduplicate project/poll across both inputs without changing Source120 publication behavior.
- [ ] Implement generation-specific create-before-delete replacement and batch repair. Reuse invoker OIDC checks. Add `evaluator-deadlines` queue and worker delete permission only on that queue; preserve enqueuer and serviceAccountUser conventions. Validate queue scheduling horizon against official current Cloud Tasks documentation during implementation; retain farther future intent until the existing batch can schedule it, never invent periodic DB timers.
- [ ] Add one owner import/registration line; no direct run creation. Rerun GREEN, worker registry/server tests and Terraform static validation without apply. Commit `feat: schedule evaluator changes at their due time`.

## Task 6: Supply safe audit checks and latency evidence

**Files:** DB evaluator `audit.ts`; worker evaluator `audit.ts`, measurement hook in `evaluate.ts`; audit/replay tests. Existing auditor production registration remains unchanged.

**Consumes:** Actual histories/source transitions, memberships, RegisterAuditCheck, isolated audit registry, METRICS.readingToShadowVerdict and post-commit hook.

**Produces:** `registerEvaluatorAuditChecks(register: RegisterAuditCheck): void`; org-scoped checks named `evaluator-source-silent` and `evaluator-rapidrail-overdue`; histogram with seconds units from actual used readings' receipts. Measure on newly ingested reading event IDs and only after successful committed evaluation, avoiding timer-only repeats of historical rows; durable handler receipts protect duplicate message delivery.

- [ ] Write RED check tests for gauge600/MET1200/APIMS7200/camera1200 daylight/Pi3600 thresholds, two-hour Rapid Rail pending overrun, real recipient membership/tenant scope, recovery clearing findings, and camera off-hours/probation. Run definitions through isolated actual auditor registry; test registration exactly once.
- [ ] Write RED production safety test proving importing evaluator/registry does not register global audit checks or invoke notify/email. #132 repair must precede any separate activation change.
- [ ] Write RED meter test: receipt to committed use <=60s with injected clock; excludes unused/old timer-only readings and rolled-back evaluation. Keep source observation age separate.
- [ ] Run `rtk proxy bunx vitest run apps/worker/test/evaluator-audit.test.ts apps/worker/test/evaluator-loop.test.ts`; record RED. Implement checks and metric, then rerun GREEN. Commit `feat: expose evaluator audits and latency measurement`.

## Task 7: Compose production providers and verify the feature

**Files:** API package narrow `./evaluator` export, production composition, approvals pinned sheet construction; worker runs/grades composition; #135 ports setup; composition/replay tests; implementation report and separate graph update commit after source is stable.

**Consumes:** All prior produced providers and actual owner ports: `setClauseSheetPorts({registry,snapshots,recordedAt:null})`, `setRecheckPorts({snapshots,shadow})`, worker RunPorts, `setGradeEngine({registry,history})`. Keep null forecast unchanged until real #127 integration.

**Produces:** Working lazy production seams, exact reviewed replay trace and honest dependency inventory.

- [ ] Write RED runtime composition tests loading real API production path and worker registry with no env/secrets/DB access at import. Exercise actual provider functions through test DB rows; verify no test fixture registry enters runtime imports. Empty actual adapters remain unavailable rather than silently “ready.”
- [ ] Write RED real-consumer tests: System v1 publication -> real check -> snapshot -> evaluate; #135 live preview uses persist=false; stored-run preview recovers exact historical registry; CAL-9 pinned version uses real CheckedSheet registryTypes; runs snapshots/shadow and Sky grade history reach actual providers. Arbitrary historical recordedAt stays explicit unavailable; Forecast/replay remain owned gaps.
- [ ] Write labelled APIMS fixture replay from `docs/sources/eqms.doe.gov.my/mapcaqm-20261105T1313Z.json`: CA16W67 maximum and haze_watch not_fired at 21:13 MYT with zero windows, plus explicit missing morning behavior. Parse provenance bytes without production imports from fixtures.
- [ ] Write labelled JPS DB replay from verified `packages/clauses/test/fixtures/rainfall-graph-75-20261105T1312Z.json`, 127043 bytes, SHA256 `25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95`. Keep original captured_at separate; simulated poll time is observation+5m and simulated DB receipt is its real 15-minute batch slot. Drive every due deadline and batch 14:00–16:30 MYT, record every source state and verdict transition, and assert the root-aligned expected trace after inspecting it. Assert the required 15:15 mode change from the real preceding verdict, snapshot and single event for that transition. Never coerce total crossings to one.
- [ ] Add stopped-gauge/first-recovered/second-fresh tests through real history/providers, and APIMS error poll producing named No call for both haze clauses. Synthetic perturbations stay isolated tests. A captured full sheet cannot succeed by filling missing rows.
- [ ] Run `rtk proxy bunx vitest run packages/api/test/evaluator-composition.test.ts apps/worker/test/evaluator-replay.test.ts`; record RED then wire lazy composition and rerun GREEN. Do not import the API root app from worker just to obtain providers.
- [ ] Under controller's validation lock, run focused evaluator/consumer tests, `rtk proxy bun run lint`, `rtk proxy bun run typecheck`, `rtk proxy bun run test`, `rtk proxy bun run openapi:check`, `rtk proxy bun run db:seed-check` and the existing worker production bundle/smoke script. Use only authorized isolated DB. Add schema/RLS/retention checks and verify all pre-existing migration bytes. Check full actual source output, not cached prior task logs.
- [ ] After stable code, run one `rtk proxy graphify update .` (AST only), verify generated graph and format it, commit graph separately. Record final source/tree/graph pins. Rerun checks only when changed bytes or a failed check justify it.
- [ ] Commit `feat: compose real evaluator providers`, request root whole-branch review, address all findings, then prepare one `feat: write shadow verdicts and crossings` feature PR using the PR skill. Root owns current integration pin, merge/closure and live checks; do not claim unused cloud/provider paths tested.

## Completion and open evidence

This plan has been self-reviewed for requirement coverage, signatures, transaction ownership and the five review-focus classes. It makes no claim that implementation tests were run. The source roots remained read-only; only these artifacts were written.

Code completion requires fresh passing checks, exact migration-prefix proof, verified real production composition and reviewed behavior. Provider registry emptiness is not solved by this feature: default Sky needs the referenced real adapter definitions to land. #121 alone cannot supply all default Sky indicators. Binding/window APIs (#138/#139), real ForecastSource (#127), general replay/historical context (#136), Commons rendering (#179/#183), and #132 production audit activation remain explicit dependencies.

Keep #557 and appropriate owner issues open for cloud queue/IAM/deployment/OIDC evidence, real provider ingestion and SIG-2, actual Commons CLS-11, source-to-verdict p95/day measurements, and stale/recovery usability under D45. Unit simulations cannot close those checks. Root must align #133/#79 crossing acceptance first and decide issue closure only after remaining acceptance has an explicit live-evidence home; no automatic “Closes #133” while claiming all acceptance complete.
