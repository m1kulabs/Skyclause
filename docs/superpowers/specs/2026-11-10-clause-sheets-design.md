# Clause sheet versions design

Read-only design for [#135](https://github.com/m1kulabs/Skyclause/issues/135), prepared against pinned main `2c2186c489d27e3cb94590ad51cd30a057a210ba`. The user delegated implementation choices for the 13 November live submission; this document makes those choices explicit. No product source, branch, migration or GitHub state was changed while preparing it.

Contents:

1. [Intent and scope](#intent-and-scope)
1. [Approaches and decision](#approaches-and-decision)
1. [Contract alignment](#contract-alignment)
1. [Persistence and raw content](#persistence-and-raw-content)
1. [Runtime composition](#runtime-composition)
1. [Preview and publish](#preview-and-publish)
1. [Permission and failure rules](#permission-and-failure-rules)
1. [Dependencies and remaining decisions](#dependencies-and-remaining-decisions)

## Intent and scope

Every save preserves a draft, including non-publishable CEL or missing teaching wording. A human Approver, Admin or Owner may publish only after recent authentication, authoritative engine checking, a diff against current live and a labelled 30-day replay. Published versions remain immutable and every publish commits its version, projection, ledger, audit, event and analytics together.

The work includes the registered read/draft/evaluate/preview/publish operations. It excludes date-range replay (#136), changing default initialization (#137, already merged), grid/dialog UI (#144/#145), evaluator/source implementation (#133 and adapter tickets), and replacing the run orchestration or approval implementations. Factories and injected ports exist only in tests. Real production gaps stay visible.

## Approaches and decision

1. Store canonical raw content and separately retain authoritative checked metadata. Recheck raw content against a real registry when publishing/evaluating. Recommended: preserves portable API content, immutable hashes and engine correctness.
1. Store `CheckedSheet` directly as public content. Rejected: #131 emits runtime `registryTypes`, while public `SheetInput` contains only `pack` and `clauses`; mixing these changes content hashing and exposes implementation metadata.
1. Ship a guessed registry or successful empty replay while dependencies are absent. Rejected: violates the real-data rule and can permit an unsafe publish.

Implement the first approach in one #135 feature PR, labelled `contract`. Review contracts, persistence and service behavior in phases within that PR. Binding #79 already requires most missing wire fields, so schema lag does not create an extra issue or merge gate.

## Contract alignment

Pinned facts: `api/v1/clause-sheets.ts` has no diff query, evaluate accepts only `{content}`, shared `SheetVersion` lacks `base_n`, checks and publication time, and only the first-party version extension contains `published_at`. The current DB has `n NOT NULL UNIQUE(sheet_id,n)` with no base/check columns. #135 requires the missing behavior.

Within the same PR, align `packages/contracts/src/api/{shared.ts,v1/clause-sheets.ts,first-party/clause-sheets.ts}` and regenerate `packages/api/openapi.json`:

- Retain every existing route and operation ID. Publish remains `/api` only; no `/v1` operation ID may match `/approve|publish|send/i`.
- Export aligned DraftSheetVersion/PublishedSheetVersion schemas and form SheetVersion as their status-discriminated union; replace the first-party local SheetVersion.extend call with the published schema. Published DTO n remains positive. Make `SheetVersion` status-aware: published `n` stays a positive integer, draft `n` is null. Extend it with `base_n` (nullable for system defaults), `published_at`, `check` (nullable when an authoritative registry is unavailable), `publishable` and `validation_status: 'checked' | 'unavailable'`. Existing response fields remain intact.
- Draft create accepts `{content, base_n?}`; omitted base pins the live `n` at save time (0 if defaults have not been initialized). A supplied, existing older published base still saves; it does not silently become the current base. Reject an invented positive base that never belonged to this sheet.
- Diff query is `{base: 'live' | positive integer, head: 'draft:<uuid>' | positive integer}`; both selectors resolve within this sheet and tenant.
- Evaluate preserves the existing `{content}` form, and also accepts exactly one of `draft_id` or `version_n` instead of content, plus optional RFC3339 `at`. Response preserves `check` and `verdicts`, adding `label: 'live' | 'replay'` and `explanations` from `explain`.
- Preview retains its existing shape and adds `base_n`, `live_n` and `base_drift` (draft base differs from current live). Validate draft IDs as UUIDv7 consistently in both first-party requests.
- Contract tests pin non-publishable draft persistence, selection exclusivity, snake_case issues (`clause_key`) and replay labels. Nullable draft n and check/readiness are explicit representation calls to record in #135/#79 through the contract process within this PR; the omitted binding behavior is schema alignment.

No clause-sheet ETag or `If-Match` contract exists in #79, TRD or pinned routes. Do not invent one. Concurrency uses `preview_hash`, row locks and existing Idempotency-Key middleware. If an ETag is later desired, that is separate contract work.

## Persistence and raw content

Owner files: `packages/db/src/schema/clauses.ts`, a new `packages/db/src/clause-sheets/{index.ts,repository.ts}`, and generated migrations. Add nullable integer `base_n`, JSONB `check_result`, JSONB `checked_content`, text `validation_registry_hash`, and JSONB `publish_preview` to `sheet_version`; keep `content` as parsed raw `SheetInput` and `content_hash = canonicalHash(content)`.

Two minimal number representations were considered: keep NOT NULL and give drafts negative sentinels; or let unnumbered drafts have n=NULL and constrain positive numbers to publications. Choose nullable n: it matches #79/#135's draft-then-numbered-on-publish semantics and avoids inventing draft version numbers. The owned expand migration changes only n nullability (ALTER COLUMN n DROP NOT NULL, no column drop/rename), sets existing draft n to NULL, retains UNIQUE(sheet_id,n), and adds a status-aware CHECK: draft implies n IS NULL; published implies n IS NOT NULL AND n > 0. PostgreSQL uniqueness permits multiple NULL drafts. Published n stays strictly positive and contiguous: live.n + 1, ignoring drafts. Draft routes address drafts by UUID; published version DTOs and positive version routes retain positive n. Draft DTO n is explicitly null in the aligned contract. Test normalization with mixed drafts/publications and prove published n, content, hashes and pointers are untouched.

Save immutable draft content; there is no PATCH draft route. Editing means POST a new draft. Draft deletion removes only a draft. Publishing promotes the selected draft row to `published`, assigns the next positive `n`, author and time, and atomically updates live. Keep other drafts and their `base_n` unchanged.

Keep internal checked metadata as the exact successful `check(...).sheet`, including #131's runtime `registryTypes`. Public content remains only `{pack, clauses}`. Recomputing hashes never includes checked metadata or preview cache. An unavailable registry means `check_result=null`, `checked_content=null`, `publishable=false`, `validation_status='unavailable'`; never persist fabricated CheckIssues as if the engine produced them. Recheck on publish even if saved checks passed.

The migration also creates a BEFORE UPDATE OR DELETE trigger rejecting changes when OLD.status='published'; draft-to-published UPDATE remains allowed. The trigger covers system version 1 too. A clause projection row belongs to its published version; write each clause key and its existing projection columns without deleting historic version projections. Fetch old raw versions, authors and times unchanged. SQL and trigger text stay in packages/db.

Generate this owner's migration after #120's pending 0026/0027 migrations integrate. Preserve the merged journal prefix; rebase and regenerate only #135's own unpublished migration on conflict. Do not edit or renumber #120's migrations.

## Runtime composition

Use the actual app composition root `apps/web/lib/api.ts` (it currently registers auth), not a new browser registry or fixtures. Export an explicit internal registration seam from `packages/api/src/services/clause-sheets/ports.ts` and API's index:

```ts
interface RuntimeIndicatorRegistry {
  load(tx: TxHandle, q: {
    projectId: string; pack: Pack; registryHash?: string
  }): Promise<IndicatorRegistry>
}
interface ClauseSheetPorts {
  registry: RuntimeIndicatorRegistry | null
  snapshots: SnapshotSource | null
  recordedAt: null | ((tx: TxHandle, q: {
    projectId: string; pack: Pack; tEval: Instant
  }) => Promise<{history: ReadingHistory; windows: Window[]}>)
}
setClauseSheetPorts(parts: ClauseSheetPorts): void
```

Default all dependencies to null. A real provider derives definitions from explicitly registered `SourceAdapter.indicators` or an explicitly supplied equivalent real evaluator port. Validate duplicate definitions for conflicts and returned registry hash; never derive celType/unit/scope/sourceKind from names, metric schemas or default sheets. `packages/sources/src/adapters/index.ts` currently exports an empty registered array. An empty unregistered provider is unavailable, not a complete registry. #120's SourceMetaHTTP is unrelated; do not modify SourceAdapter, PollContext or source metadata models here.

Use contracts NotBuiltError (or explicitly map the engine's separately implemented NotBuiltError to ApiError) so dependency gaps become 501 rather than 500. Add the owned 501 problem responses to affected route schemas. With no provider: list/read/delete still work and save stores raw content with unavailable validation. Authoritative preview/publish fail 501 `not-built` with owner `b-evaluator`; no publication side effects occur. Live evaluate needs #133's `SnapshotSource.take(...persist:false)`; `at` needs recorded history/windows, `snapshotAt` and an authoritative matching registry. Neither path substitutes a recorded snapshot when live input fails.

Preview is a replay of stored runs, not a fresh SnapshotSource call, and does not intrinsically require #133 if a real registry and complete stored records are available. #151 already stores `{snapshotId,snapshot,windows}` in `run_step('snapshot').output` and `{versionId,n,sheet,verdicts,...}` in shadow output. Use these frozen windows and snapshots. The `indicator_snapshot` DB table alone omits registryHash and cannot reconstruct full historical windows; never fill those gaps from the current window table or a fabricated registry.

Historical records require consistent project/pack/run/version pins, valid snapshot/hash and authoritative checked metadata or matching registered registry definitions. Missing or incompatible records fail closed with 422 `not-publishable` and reasons naming affected runs; do not skip them and report a successful zero-call replay. The same rule applies to historical evaluate; missing history is an explicit dependency/data failure.

## Preview and publish

Preview loads the selected draft plus live version, rechecks raw content, diffs live raw content and re-evaluates the draft at each stored run's `snapshot.tEval` on that run's frozen windows. Restrict to project/pack, `triggered_at` in the frozen UTC interval `[to - 30*24h, to]`, where `to` is preview request time. Include all recorded runs; runs with no calls contribute none, while calls require an exact replayable scope. Count each call once. Compare the replayed engine mode to that call's stored engine `shadow.mode`, not an approver/agent edit. No-call is represented faithfully; it is not coerced to Normal. Only a mode change enters the required `changes` list. Sort replay runs and changed calls by UUID for deterministic hashing.

Save a server-owned preview envelope on the draft containing frozen from/to, draft ID/hash, live version ID, registry hashes and exact replay result. Hash with `canonicalHash({draft_id, content_hash, live_version_id, registry_hashes, replay})`; replay includes interval, evaluated call IDs/input manifest and deterministic changed-call result. The external response keeps the existing replay fields; internal manifest participates in the hash but does not leak as a new public field. Cache updates do not change content_hash.

Publish locks the parent sheet then selected draft, validates human/recent-auth/permission again at the service boundary, rechecks content and recomputes preview over the saved envelope's same time interval. A changed draft selection/content, live ID, registry or stored run manifest/result yields 409 `preview-stale`. Merely advancing the clock does not change the previous preview's interval. A preview from another draft/sheet/tenant never matches. Invalid or deleted draft yields 404; hard check failure or `publishable=false` yields 422 `not-publishable` with exact engine reasons, including `haze_severe` and the teaching line.

The actual merged #137 implementation is packages/db/src/projects/create.ts:createProjectRecord: it atomically writes both raw default sheets as published n=1 with publishedBy=null, canonical hash and publication time; sets each liveVersionId and project_pack.sheetId; creates no draft and no ledger entry. Preserve that path and verify it through #135 reads. Existing v1 rows have no checked metadata: check their raw content with an actual registered registry when evaluation needs it; never mutate published rows to backfill runtime metadata or reconstruct it by cast. A malformed legacy sheet with live:null may be previewed, but publish returns 422 not-publishable for missing initialization rather than inventing human version 1.

After all checks, one caller transaction:

- Promote the draft to next published number; retain raw hash and separately checked metadata.
- Update `clause_sheet.live_version_id`, insert that version's clause projection.
- `appendLedger(tx,{projectId,kind:'clause_version',refs:{sheet_id,version_id},body:{pack,version_n,content_hash,clauses_changed,replay_calls_changed}})`.
- `recordAudit(tx,{action:'clause_sheet.published',target:{type:'clause_sheet',id:sheetId},projectId,before:{live_version_id},after:{version_id,version_n,content_hash}})`.
- `emitEvent(tx,{projectId,type:'clause_sheet.published',data:{sheet_id,pack,version_n}})` and `track(tx,'clause_published',{pack,clauses_changed:diff.length,replay_calls_changed:replay.calls_changed},{projectId})`.

Use the real merged appendLedger/audit/event/track implementations (all exist at the pin); injected failures are tests only. Their failure rolls back every write. Existing route idempotency returns one result for a replayed key, and a second distinct publish against the old preview gets stale. No send or requestRun happens here; the domain event drives #133.

## Permission and failure rules

All handlers use `inTenant` and the owning service gets `{principal,tx}`. Resolve the sheet/project under RLS first, then call `can(principal, statement, {projectId})` to enforce OAuth/share project restrictions; foreign/mismatched sheet, version or draft is 404. Registry middleware still denies principals below the operation statement. Draft statements require Editor+ or an admin-scoped key capped by its current role; OAuth draft scopes do not grant clause draft editing.

Both `/api` operations explicitly use `requireHumanSession` and `requireRecentAuth(12)`, in addition to metadata permission and `/api` session/Origin policy. Accept cookie or session bearer humans; deny Editors, guest sessions, keys (including admin keys), OAuth, share links and device/system principals. Exactly 12 hours passes; 13 hours returns 401 `reauth-required`. Direct service use must enforce the same publish checks with a passed permission function and injected `now`, rather than relying only on route middleware.

## Dependencies and remaining decisions

No further design-approval question is needed. Two representation decisions need the existing contract process recorded during implementation: nullable unnumbered draft n and nullable check/readiness fields. Existing omitted selectors/base drift/labels are contract alignment inside #135's PR, not new child issues.

Production publication needs a real registered indicator registry. #137 is already merged and initializes both system version-1 defaults and live pointers; exercise that real path, not factory-only defaults. Live evaluate needs #133; historical evaluate needs its real recorded-history provider. Publish preview can use already complete #151 stored outputs without #136 date-range replay. #120 must finish its migration allocation before #135 generates migrations. #144/#145 can consume stable draft/version APIs while publication explicitly reports unavailable dependencies.

A known neighboring mismatch is approvals/recheck.ts constructing CheckedSheet without registryTypes. Do not copy or silently fix it in #135; coordinate its correction with #133's checked-version loader. #135 must expose persisted authoritative metadata so that loader can use exact version content, never current live. No source edits, builds, installs or tests were run for this read-only planning task; implementation verification is in the plan.

## Execution rulings

Execution starts at current main a0bb3adc, after re-reading current files. Source #120 still owns its unpublished migrations and will land first; #135 may use the next local suffix now, then regenerate/renumber only its own unpublished migration on integration. This permits independent progress without rewriting another owner’s history. Database code consumes caller-supplied canonical content hashes and structural/contract types; API computes canonicalHash. Do not implement JCS in SQL or introduce a database runtime dependency on the clause engine solely for hashing.
