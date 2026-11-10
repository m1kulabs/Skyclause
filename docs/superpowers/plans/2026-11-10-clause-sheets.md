# Clause sheet versions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement #135's draft/version APIs and atomic, human-approved publication with an authoritative check, current-live diff and labelled stored-run replay.

**Architecture:** Keep raw SheetInput/hash separate from checked engine metadata. DB ownership holds persistence, locking and triggers; API services own validation and preview/publish orchestration; registry routes remain thin and the existing web composition root registers only real runtime providers. Missing production dependencies fail explicitly while raw draft save/list remains usable.

**Tech Stack:** Bun 1.4.4, TypeScript, Hono/zod-openapi, Drizzle/PostgreSQL 18, Vitest and the merged @skyclause/clauses engine.

**Spec:** [Clause sheet versions design](/docs/superpowers/specs/2026-11-10-clause-sheets-design.md), [#135](https://github.com/m1kulabs/Skyclause/issues/135), binding [#79](https://github.com/m1kulabs/Skyclause/issues/79). Read all three; pinned source inspection was `2c2186c489d27e3cb94590ad51cd30a057a210ba`.

Contents:

1. [Global constraints](#global-constraints)
1. [Review focus](#review-focus)
1. [Task 1: Align contracts and persist independent drafts](#task-1-align-contracts-and-persist-independent-drafts)
1. [Task 2: Implement checked draft, replay preview and atomic publish services](#task-2-implement-checked-draft-replay-preview-and-atomic-publish-services)
1. [Task 3: Mount routes and prove production dependency behavior](#task-3-mount-routes-and-prove-production-dependency-behavior)
1. [Execution handoff](#execution-handoff)

**Execution base:** a0bb3adcf7e1fee15cb3719039c18dc32c3035d5. Task1 caller supplies contentHash, API computes canonicalHash; no DB runtime engine dependency for hashing. Only #135 unpublished migration may be renumbered after #120 integration.

**Integration execution note (2026-11-10):** The reviewed sheets head `c6a3a974513b956cf5c00069ef2a8bc3010c6ea7` is normally merged with Source120 release candidate `67ea0308d36f879373c7a0ab8834e1f6123f1dd0`, which includes current main `d50cd8b`. Source owns migrations 0041–0043; only the unpublished sheets migrations are regenerated as 0044 (schema and draft normalization) and 0045 (immutability trigger), preserving the Source journal prefix. The approved semantics and explicit null evaluation providers remain unchanged.

## Global constraints

- One #135 feature PR labelled `contract`; contract alignment is its first phase, not a new child issue or separate merge gate. Record new representation choices (nullable draft n and nullable validation readiness) through #79's contract process.
- Start from clean current main in an isolated worktree; never alter the divergent original checkout. Re-read current relevant files before implementing because #120 is still landing.
- Every shell command is prefixed `rtk`; no new production dependency or public API behavior outside the explicit contract changes in the design.
- Publish remains `/api`; every save is a draft. Published positive numbers are contiguous; drafts have n=null. The merged #137 createProjectRecord already writes both system version-1 defaults and live/project_pack pointers; first human publish is version 2.
- Raw content is only `{pack, clauses}`, `content_hash=canonicalHash(content)`; checked metadata including registryTypes is separate and server-owned.
- Real registry definitions come only from actual registered adapter metadata or an explicit real provider. No runtime fake/test registry, guessed default types, successful missing-data replay or live-to-replay fallback.
- SourceAdapter, PollContext and source metadata models are unchanged. #120 owns SourceMetaHTTP and pending migration slots 0026/0027.
- Generate only #135's migrations after integrating #120; preserve the merged journal prefix and regenerate only this PR's unpublished migrations on conflicts.
- Fresh human session, `clause_sheet.publish`, 12-hour authentication and tenant/project permissions are mandatory; use the existing matrix and middleware, not a second grants matrix.
- No ETag/If-Match requirement is added. Use preview_hash, sheet locks and existing idempotency middleware.

## Review focus

1. Multiple simultaneous draft saves must not reserve or skip published version numbers (Task 1 concurrency test).
1. An old base, missing registry or invalid teaching wording must still save honestly without silently becoming publishable (Tasks 1 and 2 readiness tests).
1. Mutable current windows, missing run metadata and historical registry changes must never turn a replay into invented Normal (Task 2 historical-integrity tests).
1. A replayed Idempotency-Key, concurrent publish or failed shared write must leave exactly one complete publication or no publication (Tasks 2 and 3 transaction/idempotency tests).
1. Human session bearer, exact 12-hour boundary and project-scoped OAuth/share access must follow the same permissions as cookie/direct service paths (Task 3 route matrix and Task 2 direct-service guard tests).

---

### Task 1: Align contracts and persist independent drafts

**Files:**

- Modify: `packages/contracts/src/api/shared.ts`, `packages/contracts/src/api/v1/clause-sheets.ts`, `packages/contracts/src/api/first-party/clause-sheets.ts`.
- Create: `packages/contracts/test/api/clause-sheets.test.ts`.
- Modify: `packages/db/src/schema/clauses.ts`, `packages/db/src/index.ts`, `packages/db/test/factories/sheet_version.ts`.
- Create: `packages/db/src/clause-sheets/repository.ts`, `packages/db/src/clause-sheets/index.ts`, `packages/db/test/clause-sheets.test.ts`.
- Generate: `packages/db/migrations/<next>_b-clause-sheets-api-versions.sql`, matching snapshot/journal; custom trigger migration via drizzle-kit if required by generator conventions.
- Regenerate: `packages/api/openapi.json`.

**Interfaces:**

- Consumes: existing `Tx`, schema `clauseSheet`, `sheetVersion`, `clause`, raw engine `SheetInput`, `CheckResult`, `CheckedSheet`; contract `PageQuery` and `SheetVersion` become aligned as the design specifies.
- Produces: `type SheetRow = typeof clauseSheet.$inferSelect`, `type VersionRow = typeof sheetVersion.$inferSelect`, `type SavedValidation = {check: Omit<CheckResult,'sheet'> | null; checked: CheckedSheet | null; registryHash: string | null}`.
- Repository exports `sheetById(tx: Tx, id: string, lock?: boolean): Promise<SheetRow | null>`, `versionByN(tx: Tx, sheetId: string, n: number): Promise<VersionRow | null>`, `draftById(tx: Tx, sheetId: string, draftId: string, lock?: boolean): Promise<VersionRow | null>`; all selectors bind parent sheet and status.
- Repository exports `insertDraft(tx: Tx, input: {sheet: SheetRow; content: SheetInput; contentHash: string; baseN: number; validation: SavedValidation}): Promise<VersionRow>`, `deleteDraft(tx: Tx, sheetId: string, draftId: string): Promise<string | null>`, `promoteDraft(tx: Tx, input: {sheet: SheetRow; draft: VersionRow; n: number; accountId: string; publishedAt: Date; validation: SavedValidation}): Promise<VersionRow>`.
- Add persistence fields `baseN`, `checkResult`, `checkedContent`, `validationRegistryHash`, `publishPreview`; represent unavailable check as SQL NULL, never a forged issue. `promoteDraft` writes existing projection columns and live ID inside the supplied transaction. Public wire `check` uses snake_case issue fields, `validation_status` is derived from nullable stored validation.

- [ ] **Step 1: Write failing contract and database tests.** Use existing factories only inside tests and actual `withTenant`/PostgreSQL harness. Pin these assertions:

```ts
// Two saved drafts coexist without reserving published numbers.
expect(drafts.map((d) => d.n)).toEqual([null, null])
expect(new Set(drafts.map((d) => d.id)).size).toBe(2)
// Defaults v1 plus any number of drafts still publish the next number 2.
expect(published.n).toBe(2)
expect(published.content).toEqual(rawSheet)
expect(published.contentHash).toBe(canonicalHash(rawSheet))
expect(published.checkedContent).toHaveProperty('registryTypes')
// Missing registry stores a nullable check, not an apparent engine success.
expect(unvalidated.checkResult).toBeNull()
expect(unvalidated.checkedContent).toBeNull()
```

Name additional tests `draft_base_survives_live_drift`, `concurrent_saves_do_not_consume_published_numbers`, `published_update_and_delete_are_rejected`, `draft_delete_does_not_delete_publication`, `draft_ids_are_scoped_to_parent`, `normalizes_draft_numbers_to_null_without_touching_published_rows`, `raw_content_never_contains_checked_metadata`, `wire_contract_supports_diff_selection_and_labelled_evaluate`. Contract tests reject two evaluate selectors and validate optional `base_n`, issue offsets and publication time. Export DraftSheetVersion (n=null) and PublishedSheetVersion (n positive) as a discriminated union; import the published schema in first-party contracts instead of extending the union. Add explicit 501 problem responses on dependency-backed operations.

- [ ] **Step 2: Run the focused tests and confirm behavior failures.** Run `rtk bun run test packages/contracts/test/api/clause-sheets.test.ts packages/db/test/clause-sheets.test.ts`. Expected: FAIL for absent schema fields/repository or missing immutability, not a database connection/setup failure.
- [ ] **Step 3: Align schemas and implement the repository.** Add precisely the design's fields/selectors; retain old `{content}` evaluate requests. Make n nullable, normalize existing draft n to NULL and add the status-aware CHECK specified by the design, preserving the existing unique constraint. Parent row locks serialize promotion and stable base selection. Do not drop or rename columns or the published-number unique constraint. Add the OLD.status='published' trigger; promotion from draft remains permitted. Update the test factory to create valid raw content with n=null for drafts. Add an integration test that calls the actual merged createProjectRecord, reads Sky version 1 equal to defaults/sky.json and its original author/time/hash/live pointers, then publishes version 2; no factory may substitute for this CLS-1 path.
- [ ] **Step 4: Generate migrations and OpenAPI, then rerun the tests.** Commands: `rtk bun run --cwd packages/db generate -- --name b-clause-sheets-api-versions`; use the repo's `--custom` generation path for trigger SQL; `rtk bun run openapi:generate`; `rtk bun run test packages/contracts/test/api/clause-sheets.test.ts packages/db/test/clause-sheets.test.ts`; `rtk bun run openapi:check`. Expected: PASS and generated migration follows the integrated main prefix.
- [ ] **Step 5: Commit this phase.** Stage the listed files and generated owner migration only; commit `feat: persist clause sheet drafts`.

### Task 2: Implement checked draft, replay preview and atomic publish services

**Files:**

- Create: `packages/api/src/services/clause-sheets/{index.ts,ports.ts,preview.ts,serialize.ts}`.
- Extend: `packages/db/src/clause-sheets/repository.ts` for paginated reads, preview cache and stored-run loading.
- Create: `packages/api/test/clause-sheets-services.test.ts`.
- Test data: reuse the existing stored JPS capture/labelled Nov 2 replay helpers inside tests; no runtime fixture import.

**Interfaces:**

- Consumes: Task 1 repository and aligned wire `SheetVersion`, `ClauseSheet`; actual engine `check`, `diff`, `canonicalHash`, `evaluate`, `explain`, `snapshotAt`; real `appendLedger`, `recordAudit`, `emitEvent`, `track` from DB.
- Produces: `RuntimeIndicatorRegistry`, `ClauseSheetPorts`, `setClauseSheetPorts(parts: ClauseSheetPorts): void` exactly as the design defines, with null dependencies by default.
- Define `type ClauseSheetAccess = {can: Can; now: Date}` and use `ServiceContext` as the first parameter of every service. Each service resolves sheet/project and checks target-aware `can` before reading a draft or contacting a dependency.
- Export `listClauseSheets(ctx, input: {projectId: string; query: PageQuery} & ClauseSheetAccess): Promise<Page<ClauseSheet>>`; `listClauseSheetVersions` and `listClauseSheetDrafts` take `{id: string; query: PageQuery} & ClauseSheetAccess` and return `Promise<Page<SheetVersion>>`.
- Export `getClauseSheetVersion(ctx, input: {id: string; n: number} & ClauseSheetAccess): Promise<SheetVersion>`, `getClauseSheetDraft(ctx, input: {id: string; draftId: string} & ClauseSheetAccess): Promise<SheetVersion>`, `createClauseSheetDraft(ctx, input: {id: string; content: SheetInput; base_n?: number} & ClauseSheetAccess): Promise<SheetVersion>`, `deleteClauseSheetDraft(ctx, input: {id: string; draftId: string} & ClauseSheetAccess): Promise<{id: string}>`.
- Export `getClauseSheetDiff`, `evaluateClauseSheet`, `getClauseSheetPublishPreview`, `publishClauseSheet` with `{id, ...validatedRouteQueryOrBody, ...ClauseSheetAccess}` and explicit return types inferred from their aligned operation's 200/201 response schemas. Define aliases `EvaluateView`, `PublishPreviewView`, `PublishedVersionView` in serialize.ts; derive them from `Operations`, not duplicate wire interfaces.
- DB query exports `storedPreviewRuns(tx: Tx, q: {projectId: string; pack: Pack; from: Date; to: Date}): Promise<StoredPreviewRun[]>`, where `StoredPreviewRun` contains run ID/pinned version ID, full stored snapshot, frozen Window[], original engine verdicts and calls with `{id, windowId, nightId, shadow}`. Validate stored JSON before producing this type; never cast incomplete DB snapshot rows into an IndicatorSnapshot.
- `buildPublishPreview(ctx, input: {sheet: SheetRow; draft: VersionRow; from: Instant; to: Instant}): Promise<{view: PublishPreviewView; envelope: PublishPreviewEnvelope}>` lives in preview.ts. Envelope is internal, versioned JSON binding draft ID/hash, live ID, registry hashes, frozen range, run/call manifest and deterministic replay; no unknown types or fresh-clock hashes are accepted.

- [ ] **Step 1: Write failing service tests with real engine checking/evaluation.** Inject registries/ports only in test setup and reset them after each test. Pin:

```ts
expect(saved.content).toEqual(missingTeachingLineSheet)
expect(saved.publishable).toBe(false)
expect(saved.check?.issues.some((i) => i.clause_key === 'haze_severe')).toBe(true)
expect(preview.replay.label).toBe('replay')
expect(preview.replay.changes[0]?.before.mode).toBe('commute_disruption')
expect(preview.replay.changes[0]?.after.mode).toBe('normal')
expect(published.n).toBe(2)
expect(oldVersionAfterPublish).toEqual(oldVersionBeforePublish)
```

Use the stored Nov 2 gauge (39.0 mm at 15:05 MYT), a frozen zero-length 15:30 commute-wave run, and Storm confirmed threshold `>= 40.0`. Name tests `missing_teaching_line_saves_but_publish_is_422`, `hard_cel_issues_save_as_nonpublishable`, `preview_reports_base_drift_against_current_live`, `changed_draft_selection_or_live_returns_preview_stale`, `later_clock_alone_keeps_frozen_preview_valid`, `changed_registry_or_run_manifest_returns_preview_stale`, `mutated_current_windows_do_not_change_recorded_replay`, `missing_frozen_windows_or_registry_metadata_blocks_publish`, `replay_does_not_coerce_no_call_to_normal`, `direct_service_publish_requires_human_recent_auth_and_can`, `no_live_defaults_prevents_human_version_one`, `shared_write_failure_rolls_back_every_publication_row`, `concurrent_distinct_publish_requests_produce_one_version`.

For each failing shared write (ledger/audit/event/track), assert unchanged live ID, no new published version/projection and zero committed publication audit/event/ledger/analytics rows. On success use expectOneAudit and exact typed event payload `{sheet_id,pack,version_n:2}`; ledger kind is `clause_version`, analytics counts are diff key count and changed call count.

- [ ] **Step 2: Run focused tests and confirm behavior failures.** Run `rtk bun run test packages/api/test/clause-sheets-services.test.ts`. Expected: FAIL for missing services; real DB setup and registered engine test data must work.
- [ ] **Step 3: Implement the services and preview.** Save raw drafts even when checks fail or no registry is registered; only absent registry uses null check. Translate either actual contracts or engine NotBuiltError into the registered 501 problem shape; never leak it as a 500. Preserve a supplied old base. Use actual check output unchanged internally; convert issues to wire at serialization. Live evaluate calls SnapshotSource with persist:false; at-evaluate reconstructs recorded history using its explicit port and labels replay. Preview reads actual stored-run windows/snapshots and evaluates at stored tEval. Sort manifests/changes and cache frozen preview metadata; do not call date-range replay or fabricate a current historical registry. Publish rechecks under sheet/draft locks, compares server-recomputed envelope hash and writes all publication effects in one supplied transaction. No publish side effect precedes the guards.
- [ ] **Step 4: Run service/database tests and confirm PASS.** Run `rtk bun run test packages/db/test/clause-sheets.test.ts packages/api/test/clause-sheets-services.test.ts`. Run `rtk bun run typecheck`. Expected: all pass, including real #131 runtime registryTypes use without unsafe manufacture of CheckedSheet.
- [ ] **Step 5: Commit this phase.** Commit `feat: publish checked clause sheet versions`.

### Task 3: Mount routes and prove production dependency behavior

**Files:**

- Create: `packages/api/src/routes/clause-sheets/index.ts`, `packages/api/test/clause-sheets.test.ts`.
- Modify: `packages/api/src/routes/index.ts`, `packages/api/src/index.ts`.
- Modify: `apps/web/lib/api.ts` only when a real provider exists; otherwise leave explicit null dependencies and a clear registration seam. Do not import test helpers here.
- Extend: `apps/web/test/auth/compose.test.ts` or add `apps/web/test/clause-sheets/compose.test.ts` for composition/readiness.

**Interfaces:**

- Consumes: Task 2 service functions; `inTenant`, route `Handlers`, dependency `can/now`, existing `requireHumanSession`, `requireRecentAuth(12)` and Idempotency-Key handling.
- Produces: `clauseSheetHandlers: Handlers` for the eleven #135 operations (nine `/v1`, two `/api`); leave `createReplay` owned by #136 and unbuilt if absent. Spread handlers into the existing registry and export services/ports from API's index for server components/composition.
- Both first-party operations attach human/recent-auth middleware. Each handler supplies target-aware can and injected now to the service, uses `c.req.valid(...)`, and returns the aligned schema/status.

- [ ] **Step 1: Write failing mounted-route and composition tests.** Parameterize every operation with cross-org 404, same-org wrong sheet/draft 404 and denial below its statement. Test owner/admin/approver success; Editor denial on publish; admin-key success on draft and denial on `/api`; OAuth/share/guest/device/system denial; cookie Origin checking; human session bearer success; exactly 12 hours success and 13 hours 401 reauth-required. Assert malformed selector/body validation and all response schemas.

```ts
expect(await problemSlug(stalePreviewResponse)).toBe('preview-stale')
expect(expiredAuthResponse.status).toBe(401)
expect(await problemSlug(expiredAuthResponse)).toBe('reauth-required')
expect(unregisteredDraftResponse.status).toBe(201)
expect((await unregisteredDraftResponse.json()).validation_status).toBe('unavailable')
expect(unregisteredPublishResponse.status).toBe(501)
expect((await unregisteredPublishResponse.json()).owner).toBe('b-evaluator')
```

Test repeated identical publish Idempotency-Key returns the original 201/body and exactly one audit/event/ledger entry. Reusing the key with another body uses the existing 422 idempotency-mismatch policy. Missing registry, missing live SnapshotSource, provider exception and incomplete historical records create no publication side effects and never return a successful empty replay. List/read/delete and raw save continue with no registered provider; no fixtures are imported into web/API production code. Read versions 2 and 3 through the actual endpoint and prove version 2 content/author/time unchanged.

- [ ] **Step 2: Run focused tests and confirm behavior failures.** Run `rtk bun run test packages/api/test/clause-sheets.test.ts apps/web/test/clause-sheets/compose.test.ts` (use existing auth compose path if extended). Expected: new operations initially 501 or absent behavior, not false success from test-only handlers.
- [ ] **Step 3: Mount handlers and real-only composition.** Add thin registered handlers and exports. If no actual registered adapter/evaluator provider exists at integration time, do not register anything or infer definitions; missing dependency responses are the intended production outcome for checks/publish. Document the exact root setter for #133 handoff. Keep full draft/list behavior available independently.
- [ ] **Step 4: Run required verification once on the finished change.** Run `rtk bun run lint`, `rtk bun run typecheck`, `rtk bun run test`, `rtk bun run openapi:check`, `rtk bun run db:seed-check`, then `rtk proxy graphify update .`. Expected: all required gates pass, no OpenAPI publish operation, no production fixture data, own migration follows merged prefix. Review the graph diff and restore/refrain from unrelated graph churn per the repo's established practice. If a dependency is unbuilt, report it explicitly; do not claim live publication demonstrated.
- [ ] **Step 5: Commit, review and prepare the single PR.** Commit `feat: mount clause sheet version routes`; use the repository code review/PR skills, `contract` label and link #135. Record evidence from the commands and real runtime readiness separately. No additional implementation approval round is needed under the user's delegated core choices; final merge/deploy follows the root task's existing authorization.

## Execution handoff

The plan is ready for execution in an isolated worktree after rebasing onto #120's integrated migrations. No source code was changed and no builds, installs or verification tests were run while preparing these artifacts. The reviewed pin is a baseline, not permission to ignore subsequently merged interfaces.

Essential handoff to #133: register a real RuntimeIndicatorRegistry, SnapshotSource and recorded-history/window provider at apps/web/lib/api.ts; consume raw pinned versions plus authoritative checked metadata, including registryTypes. Preserve merged #137 initialization: createProjectRecord already creates both system version-1 raw defaults, no draft, no ledger entry, and sets live/project_pack pointers. Add read/publish integration coverage against that actual path; #135 never fabricates defaults or mutates version 1 to backfill metadata. Production save/list can ship before those ports; publication remains explicitly unavailable until its real prerequisites exist.
