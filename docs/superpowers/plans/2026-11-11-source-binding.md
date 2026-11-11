# Source binding implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, natively in one isolated branch. Independent review is required before merge; this planning run spawns no agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship #138's source catalogue, shared binding seam and safe Crowd/SLA changes using real persisted sources.

**Architecture:** Reuse the current tenant transaction and DB-only SQL modules. All binding and pack mutations serialize on the project row; device ownership adds a source-row lock and fixed project metadata check. The existing outbox, idempotency and #120 consumer perform delivery/backfill outside the write transaction.

**Tech stack:** Existing Bun/TypeScript, Hono/Zod OpenAPI, Drizzle/Postgres, Vitest and the repo test-database harness; no new dependency.

**Spec:** [Source binding design](/docs/superpowers/specs/2026-11-11-source-binding-design.md), actual [#138](https://github.com/m1kulabs/Skyclause/issues/138) and [#79](https://github.com/m1kulabs/Skyclause/issues/79). Baseline is `219b38f72dbf05c8a4e3c074078f5273e55ab63e` in the read-only release worktree.

## Contents

- [Global constraints](#global-constraints)
- [Review focus](#review-focus)
- [File and seam map](#file-and-seam-map)
- [Task 1: catalogue projection and owned contract corrections](#task-1-catalogue-projection-and-owned-contract-corrections)
- [Task 2: shared transactional bind and unbind](#task-2-shared-transactional-bind-and-unbind)
- [Task 3: Crowd prerequisites, SLA and release verification](#task-3-crowd-prerequisites-sla-and-release-verification)

## Global constraints

- Plan before implementation. This artifact creates no code/index/HEAD/GitHub/cloud/database changes; no build, install or graph refresh was run for planning.
- Every shell command starts with `rtk`; use `rtk proxy` for commands without a specialized wrapper.
- Only `packages/db` holds SQL text, migrations, policies, triggers and connections.
- Use real public data in runtime; test factories/doubles and stored captures stay inside isolated test databases. Never run fixture ingestion against production.
- Preserve `SourceAdapter`/`PollContext`, active-bound-project/archive fanout and #120's intent-before-HTTP transaction boundary. D45 allows scheduled DB work only in the existing 15-minute batch.
- Do not edit the reference release worktree. Execute in a new isolated branch from final integrated main after checking this pin's changes are present. No migration is planned; never edit published migrations or journal.
- Fixed private-device owner is `source.meta.project_id` set by #128 from the actual device-create route's project, plus `owner_org_id`. No cross-project reuse, current-binding inference or RLS widening.
- Keep a missing evaluator state nullable; do not invent `fresh`, `pending`, coordinate constants or station readings.
- Contract deltas belong in a contract-labelled #138 PR with #79/affected-ticket alignment, not an extra alignment-issue gate. Root has approved ownership and honest-null rulings for this plan.
- Finish before 13 November 2026 with fresh gates, independent review, green CI, squash merge and acceptance evidence before closure; blocked provider checks are recorded honestly.

## Review focus

1. Project-scoped OAuth/share sees only device rows whose fixed owner project it can view; foreign org/project, malformed metadata and legacy ownerless devices fail closed (Tasks 1–2).
2. Two concurrent last-role removals or enable/remove requests cannot leave enabled Crowd without rail/listings (Tasks 2–3).
3. Commit followed by idempotency-response failure, new-key retry and caller rollback do not duplicate or leak audit/event/analytics writes (Task 2).
4. Unknown coordinates, absent state/reading and a real provider outage remain distinguishable from a working provider and empty result; no synthetic healthy values (Task 1 and runtime gate).
5. Updating SLA preserves old bundle deadlines/sheet versions; only later drafts use the new value or existing default for null (Task 3).

## File and seam map

Create:

- `packages/db/src/sources/picker.ts`: C RLS catalogue/source projection, distance and keyset reads.
- `packages/db/src/sources/binding.ts`: row locks, binding CRUD and pack records; no networking.
- `packages/api/src/services/sources/index.ts`: authorization, exact role map, mutation policy and shared writes.
- `packages/api/src/services/sources/serialize.ts`: schema-inferred `CatalogueSourceView`/`BoundSourceView`, complete source/reading/poll serialization and nullable state/licence.
- `packages/api/src/routes/sources/index.ts`: four Hono handler entries, opening `inTenant` and supplying real `can`/clock.
- `packages/db/test/source-binding.test.ts` and `packages/api/test/source-binding.test.ts`: isolated DB/service/HTTP behavior; reuse existing harnesses.
- `apps/web/test/source-binding-permissions.test.ts`: composition-level service authorization using the actual `@skyclause/auth` `can`; app tests may depend on auth and API without violating package boundaries.

Modify only owned contract declarations in `packages/contracts/src/api/v1/{catalogue,sources,packs}.ts`, shared `Source.licence_id` in `packages/contracts/src/api/shared.ts`, the audit action catalogue `packages/contracts/src/audit.ts`, and existing barrels `packages/db/src/sources/index.ts`, `packages/api/src/index.ts`, handler registry `packages/api/src/routes/index.ts`; regenerate `packages/api/openapi.json` at implementation time; the existing generator explicitly writes this path. Update affected SDK expectations only if schema generation requires them; do not hand-patch generated declarations. Add byte-for-byte APIMS capture to `packages/db/test/fixtures/` and its manifest only if #123's merged test capture cannot be reused.

The API exports exactly the signatures and DTOs in the design. DB exports these exact helpers, using `Tx` and existing Drizzle inferred row types:

```ts
type SourceProjection = {
  source: typeof source.$inferSelect;
  state: typeof sourceState.$inferSelect | null;
  latestReading: typeof reading.$inferSelect | null;
  recentErrors: Array<typeof poll.$inferSelect>;
}
type PickerQuery = {
  kind?: SourceKind; near?: {lat: number; lon: number}; q?: string;
  limit: number; cursor?: {distanceKm: number | null; id: string};
  projectIds?: string[] // undefined means all tenant projects
}
listSourcePickerRecords(tx: Tx, query: PickerQuery):
  Promise<Array<SourceProjection & {distanceKm: number | null}>>
sourceProjection(tx: Tx, sourceId: string): Promise<SourceProjection | null>
lockSourceProject(tx: Tx, projectId: string): Promise<typeof project.$inferSelect | null>
visibleBindingSource(tx: Tx, sourceId: string): Promise<typeof source.$inferSelect | null>
lockBindingSource(tx: Tx, sourceId: string): Promise<typeof source.$inferSelect | null> // owned device only
sourceBindings(tx: Tx, sourceId: string): Promise<Array<typeof projectSource.$inferSelect>>
projectBindings(tx: Tx, projectId: string): Promise<Array<typeof projectSource.$inferSelect>>
insertSourceBinding(tx: Tx, input: {projectId: string; sourceId: string; role: SourceRole},
  now: Date): Promise<{binding: typeof projectSource.$inferSelect; created: boolean}>
deleteSourceBinding(tx: Tx, bindingId: string): Promise<boolean>
projectPackRecord(tx: Tx, projectId: string, pack: Pack): Promise<typeof projectPack.$inferSelect | null>
patchProjectPackRecord(tx: Tx, input: {projectId: string; pack: Pack;
  enabled?: boolean; slaS?: number | null}, now: Date): Promise<typeof projectPack.$inferSelect>
```

Read via `visibleBindingSource` first; call `lockBindingSource` only for owned camera/Pi and revalidate ownership. Public catalogue rows must not use FOR UPDATE because C RLS does not grant their tenant caller UPDATE visibility. Helpers rely on caller transaction/locking; service enforces invariants and writes audit/event/analytics in that same transaction. `sourceBindings` uses the existing tenant and source locks; fixed metadata is the authoritative owner even after unbind. API never supplies raw SQL or opens a second connection. `sourceProjection` must be called only after source ownership/scope authorization; it is not a public history API.

### Task 1: catalogue projection and owned contract corrections

**Files:** picker/serialize/service/route files and barrels above; catalogue/shared/source/packs contract declarations; API and DB tests; generated OpenAPI.

**Consumes:** `ServiceContext`, `SourcesAccess`, existing PageQuery, C RLS and source rows; source/state/reading/poll schemas; real `Can`; existing pagination helpers.

**Produces:** `listCatalogueSources(ctx, query, access): Promise<Page<CatalogueSourceView>>`, DB picker/projection helpers, exported DTOs, dedicated 409 prerequisite problem schema and nullable bind-state schema consumed in Tasks 2–3.

- [ ] Read the design and integrated baseline; create an isolated `feat/b-source-binding` branch/worktree using the worktree skill. Re-query graphify before code navigation. Read execution/verification skills; no changes to the release worktree.
- [ ] Write failing catalogue tests under `describe('catalogue')` in the two named test files: `real_capture_distance_and_age`, `null_coordinate_state_reading`, `literal_name_station_search`, `distance_ties_cursor_filters`, `device_owner_scope`, `invalid_query`, `catalogue_permissions`. Assert the following exact outcomes:

```ts
expect(ca16w.distance_km).toBeGreaterThanOrEqual(5.6)
expect(ca16w.distance_km).toBeLessThanOrEqual(6.2)
expect(ca16w.latest_reading?.value).toBe(67)
expect(ca16w.age_s).toBe(780) // capture 13:00Z, injected now 13:13Z
expect(unlocated.distance_km).toBeNull()
expect(unmaterialized.source_state).toBeNull()
expect(unread.latest_reading).toBeNull()
expect(unread.age_s).toBeNull()
expect(noTerms.licence_id).toBeNull()
expect(noTerms.licence_label).toBe('no published terms')
```

Derive CA16W coordinates/reading/time from actual `docs/sources/eqms.doe.gov.my/mapcaqm-20261105T1313Z.json` using #123's merged parser when present; no typed station coordinate. `near=3.0559,101.6997` is the acceptance input. If parser is unmerged, decode the stored capture in a test-only helper, with manifest, never a runtime adapter substitute. Sort nulls last, ties by UUID; paginate every item once over unchanged rows, reject cursor/filter mismatch. `q='%'` matches a literal percent, not all rows. Use stored 49-row JPS capture only in tests when testing null distances.

- [ ] Assert ordinary tenant viewers can read catalogue; denied principal gets 403; foreign org header gets 404. OAuth/share scoped to project A cannot see device metadata/reading for B, while public catalogue remains visible; valid A device appears. Missing/malformed/wrong-org owner project and ownerless camera/Pi never appear. Invalid coordinate/kind/cursor gives 422; error source with persisted latest reading is returned as error, not replaced.
- [ ] Run `rtk proxy bunx vitest run packages/db/test/source-binding.test.ts packages/api/test/source-binding.test.ts -t 'catalogue'`; confirm RED is the new behavior/stub, not environment failure.
- [ ] Implement only catalogue path and owned schema deltas: add query fields/distance, nullable Source licence ID, nullable ProjectSource state, explicit prerequisite 409 responses using `Problem.extend({missing:z.array(SourceRole)})`. Infer exported view aliases from operation schemas. Add one source handler registry spread; no handlers for #134 routes.
- [ ] Implement DB haversine radius 6371.0088, stable keyset ordering, query normalization/filter hash and scoped device ownership predicate. Serialize actual stored state/readings, age from observed_at, exact null licence label, 5 newest error polls for future bind response. No state writes/provider calls.
- [ ] Re-run focused tests to GREEN; run `rtk proxy bun run openapi:generate` then `rtk proxy bun run openapi:check`. Review contract diff including generated clients against existing usage; amend #79/affected ticket alignment in the eventual PR, with no separate blocking issue.
- [ ] Commit this deliverable with `feat: list source catalogue by distance` after native self-review. Request the agreed independent reviewer gate at the branch review boundary; do not spawn a planning agent.

### Task 2: shared transactional bind and unbind

**Files:** `binding.ts`, source service/route/serialize/barrels; both source-binding test files and `apps/web/test/source-binding-permissions.test.ts`. No #128 implementation or migrations.

**Consumes:** Task 1 DTO/projection/authorization helpers; `recordAudit`, `emitEvent`, `track`; real project rows and kind-role map; existing idempotency middleware.

**Produces:** `bindSource(ctx,{projectId,sourceId},access): Promise<BoundSourceView>` and `unbindSource(ctx,{projectId,sourceId},access): Promise<void>` exported from `@skyclause/api`, callable inside #128/#179's current transaction.

- [ ] Add failing tests `kind_role_map`, `bind_error_or_unmaterialized`, `bind_replay_and_new_key_retry`, `bind_unbind_one_audit_event`, `ownership_survives_unbind`, `transaction_rollback`, `service_permissions`, `system_provisioning_rerun`, `active_project_fanout`. Table-test all 11 source kinds against the design's exact role map; POST accepts only `{source_id}` and never trusts a supplied role. Admin/Owner and admin-scoped permitted keys pass; Editor/read key/OAuth/share/device deny; direct service calls enforce same matrix. Run these direct permission assertions in the app composition test with the actual production `can`, including an Editor holding an admin-scoped key, OAuth project bounds and read-only keys; `testDeps().can` alone is not sufficient because its stand-in omits scope/target checks. Do not introduce an API-to-auth import or hand-copy a second matrix. Out-of-scope/other-tenant project and other-tenant/device-owner-project mismatch give 404.
- [ ] Assert first POST 201 writes one binding, one `expectOneAudit('source.bound')`, one `expectEvent('source.bound')`, and one analytics event `{adapter:kind,cadence_min:cadenceS/60}`. Same idempotency key replays identical response; new key on existing binding writes nothing. Same key with changed input is 422 idempotency-mismatch. Error state and null state/readings do not block POST. Source/projection schemas parse the returned body.
- [ ] Assert fixed `meta.project_id` equals target and tenant; a device belonging to A cannot be bound by another Admin to B even after unbinding from A. Unknown/malformed metadata and ownerless camera/Pi fail 404 with zero effects. Known public sources may bind to multiple projects; explicitly bind a public source through the real `app` tenant role to catch an accidental FOR UPDATE on a C-read-only row; inspect source runner query results to prove existing active-project fanout still deduplicates roles and excludes archived projects.
- [ ] Assert available-source absent-binding DELETE is 204 with no writes; foreign/missing source is 404; actual DELETE emits exactly one unbound audit/event. Inject audit/event/analytics failure or throw after a successful in-process bind and assert outer transaction rollback leaves zero binding/audit/event/analytics and no published event. Simulate commit then response-store failure and retry with a new key: still one change. Test system provisioning twice in a caller-owned transaction: second run changes nothing. In-process seam does not require an HTTP Idempotency-Key or start a nested transaction.
- [ ] Run focused new tests to RED. Implement minimal DB helpers and service authorization, project lock then private-device-only source lock, exact role mapping, unique insert/no-op, fixed ownership validation, projection return and transactional writers. Do not modify #120 consumer, global source_state or source context signatures.
- [ ] Re-run focused tests to GREEN. Run `rtk proxy bunx vitest run packages/db/test/sources-queries.test.ts apps/worker/test/sources-integration.test.ts packages/api/test/source-binding.test.ts packages/db/test/source-binding.test.ts apps/web/test/source-binding-permissions.test.ts` once to cover preserved source runner seams; a genuine failing environment is named, never converted to PASS.
- [ ] Record owner delta for #128 creation/ingest/token rotation and #133/#134 owner-project lookup. Fixed `meta.project_id` is set from the actual creation route, immutable; legacy unknown ownership becomes unavailable. No new migration or guessed backfill. Commit `feat: share atomic source binding service` after native review.

### Task 3: Crowd prerequisites, SLA and release verification

**Files:** binding/service/routes/test files above; `packages/contracts/src/audit.ts` for `pack.updated`; generated OpenAPI; only necessary behavior docs and graph output during execution.

**Consumes:** Task 2 common project lock and binding writes; Task 1 409 schema; `isFlagEnabled`, existing project_pack and #150 draft-time SLA reader.

**Produces:** `updateProjectPack(ctx,input,access): Promise<ProjectPack>`; enabled-Crowd removal guard in unbind; all four #138 routes built and documented.

- [ ] Add RED cases `crowd_missing_roles`, `crowd_feature_flag`, `last_required_role_removal`, `concurrent_remove_enable`, `pack_disable_and_noop`, `sla_before_after_and_future_draft`. Assert flag-off enable 403 feature-off; flag-on no bindings 409 with `missing:['rail_station','venue_listings']`; listings-only missing rail; rail-only missing listings; erroring-but-bound sources satisfy the binding prerequisite. Both roles permit enabling. Sky can enable without these roles.
- [ ] Assert removing the last required binding while Crowd is on is 409, with unchanged binding/audit/event count; removing a redundant one succeeds, unrelated role succeeds, and disabling Crowd permits later removal. Use two independent real test transactions to race two last-role removals and enable/remove; at most one conflicting operation succeeds and the final enabled pack retains both roles. Serialize via the shared project row lock, not test sleeps or process-local mutexes.
- [ ] Assert disabled/flag-off pack accepts disable or SLA-only change; missing project/pack is 404; unauthorized write 403; no-op produces zero audit. SLA change makes one `sla.changed` audit with before/after including enabled/SLA; enabled-only change makes one `pack.updated`; combined change makes one sla audit, not two. Preserve sheet_id/schedule and assert sheet/version counts unchanged. `sla_s` zero/fraction/empty patch yields 422; null stays null and uses existing defaults for the next draft.
- [ ] At #150's existing real draft seam, create a test-only draft before and after SLA PATCH and assert earlier `sla_due_at` unchanged and later uses the new SLA; null-reset draft uses Sky 600/Crowd 7200. Do not implement a mock bundle drafter or mutate old bundles.
- [ ] Run new cases to RED; implement flag precedence, deterministic missing roles, last-role deletion check under the shared lock, partial pack update and single audit logic. Use existing flag lookup with tx.orgId, no feature cache/default-on. Add the audit catalogue action; emit no new pack domain event.
- [ ] Run focused tests to GREEN, then review all changes against #138/#79 and the five review focus cases. Commit `feat: guard crowd bindings and pack settings`.
- [ ] Run fresh `rtk proxy bun run lint`, `rtk proxy bun run typecheck`, `rtk proxy bun run test`, `rtk proxy bun run test:e2e`, `rtk proxy bun run openapi:check`, `rtk proxy bun run db:seed-check`; inspect every exit/output. Execute the normal graph refresh only now via `rtk proxy graphify update .`. Lint/typecheck after generated graph/doc changes if those changes fall under the lint surface. No repeated full checks without changed inputs or unresolved failures.
- [ ] Obtain independent whole-branch standards/spec review, fix findings, and rerun affected checks before final fresh gates. Compare any published main/provider contracts against this pin and normally integrate the pinned main; never use #133 WIP as authoritative. Reviewer explicitly checks mandatory service authorization, project lock ordering, ownership metadata, DTO nullability and rollback.
- [ ] Create contract-labelled PR titled exactly `feat: bind catalogue sources to projects`, referencing #138 and mapping acceptance lines to evidence. Align #79 and comment affected #128/#133/#134 only as authorized by controller; keep changes concrete in this PR. Wait for all CI checks green, squash merge, then confirm resulting main checks and deployed revision. Do not merge red/pending CI.
- [ ] Runtime verification uses read-only real catalogue calls and already-authorized real projects; do not fabricate devices/readings or load capture fixtures. Confirm JPS null coordinates sort last and licence label remains honest. After #123, CA16W must exist with real coordinates, distance in acceptance range, actual latest reading and `received_at-observed_at <= 900s`. Record absent state as #133 readiness, missing provider/readings as #123 dependency, not successful silence. Verify newly authorized real binding's event reaches the existing #120/#133 consumers without holding HTTP inside Tx when those runtime prerequisites are ready.
- [ ] Quote production results and any blocked prerequisites on #138. Close only when the acceptance requirements applicable now are proven and controller accepts explicitly conditional checks; no claim that #123/#133/#557 runtime readiness passed from test doubles or null catalogue state. Link PR, checks and production evidence in final handoff.

## Planning self-review

The three tasks cover every #138 clause: Task 1 catalogue/query/distance/licence/age/state and private source visibility; Task 2 role fit/error binding/idempotency/audit/events/analytics/shared #128/#179 seam; Task 3 flags/prerequisites/removal guards/SLA preservation and gates. All exported service signatures match the design. No production data insertion, provider availability claim, UI work or evaluator implementation is hidden in the plan. Independent implementation review remains a future gate, not a review claimed by this planning run.
