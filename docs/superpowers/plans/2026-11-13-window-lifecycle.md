# Remaining window lifecycle implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Use the execution method already authorized by the parent; this artifact does not authorize new agents. Steps use checkbox syntax for tracking.

**Goal:** Deliver weekly series, edits/cancellations and imported-calendar lifecycle around the teammate's single-window list/create slice.

**Architecture:** Pure recurrence and ICS normalization feed tenant-scoped DB mutations. Existing window events drive evaluator/calendar consumers; one representative ICS event carries the complete immutable batch context for existing requestRun. Due work runs only inside the existing 15-minute batch.

**Tech stack:** TypeScript, Zod/Hono, Drizzle/PostgreSQL, Bun/Vitest, existing exact `ical.js` 2.2.1 and `@skyclause/config/net`.

**Spec:** [Remaining window lifecycle design](/docs/superpowers/specs/2026-11-13-window-lifecycle-design.md), with [proposal decisions and prerequisites](/docs/superpowers/specs/2026-11-13-window-lifecycle-proposal.md). Baseline `f69fee4ff98acdb41e277af6958079ea9e2c7073`; inspect the teammate's published seam before integration.

Contents:

1.  [Global constraints](#global-constraints)
1.  [Review focus](#review-focus)
1.  [Shared interface vocabulary](#shared-interface-vocabulary)
1.  [Task 1: Weekly recurrence and WIN-8 validation](#task-1-weekly-recurrence-and-win-8-validation)
1.  [Task 2: Bounded ICS normalization](#task-2-bounded-ics-normalization)
1.  [Task 3: Durable identities and atomic mutations](#task-3-durable-identities-and-atomic-mutations)
1.  [Task 4: Series and edit/cancel operations](#task-4-series-and-editcancel-operations)
1.  [Task 5: Calendar feed operations and guarded reconciliation](#task-5-calendar-feed-operations-and-guarded-reconciliation)
1.  [Task 6: Due checks and consumer integration](#task-6-due-checks-and-consumer-integration)
1.  [Final verification and handoff](#final-verification-and-handoff)

## Global constraints

- AlaskanTuna owns single-window `listWindows`/`createWindow`; integrate its helpers, do not duplicate its slice. No frontend or Apps Script changes.
- Every shell command begins `rtk`; use only the pinned graphify executable named by the parent for query/update.
- Only `packages/db` holds SQL/migrations/connections. Canonical Can and tenant/project authorization remain intact. New migrations only; baseline last migration is 0049, choose the actual next number after integration.
- Real runtime ports only; test doubles stay in tests. No runtime seeded windows, invented source data, successful budget default, raw calendar fallback or alternate scheduler.
- Window write instants are UTC with a positive four-digit year and at most millisecond precision; reject finer precision instead of Date truncation, leaving shared Instant unchanged. This request clarification joins the Task 4 contract amendment.
- At most 12 hours; start at most 90 elapsed days ahead; zero-duration commute allowed; past creation refused. Native recurrence materializes only `[now, now + 90 days]`.
- Parent accepted count-before-skips and preserving started series history. The listed parent decisions are accepted; wire/event amendments and owner dependencies must be integrated before their corresponding tasks. Existing wire recurrence field is `until`.
- Daily series/file-calendar extension and hourly URL refresh are due checks in the existing 15-minute batch (D45), never new Scheduler jobs or minute-tick DB work.
- ICS parser exactly `2.2.1`; proposed limits: 5 MiB UTF-8, 10,000 VEVENTs, 100,000 iterator steps, 10,000 resulting occurrences, 20,000 changed rows. Reject whole-document overflow; never truncate.
- Keep external reference-project/deck/script/pipeline names out of repository artifacts and GitHub text.

## Review focus

1.  Count/skip/weekday/DST boundaries must not produce an extra occurrence or change a local clock. Pin in Tasks 1 and 3.
1.  Recurrence-ID exception moves and invalid/absent source data must not delete or duplicate the wrong window. Pin in Tasks 2 and 5.
1.  Concurrent manual edits, feed removal and late refresh results must preserve overrides/tombstones and roll back partial ledger/event writes. Pin in Tasks 3 and 5.
1.  Delayed or reordered events and an immediately claimed run must still request the complete immutable ICS changed set. Pin in Task 6.
1.  Direct-service calls, cross-tenant IDs, guest/share budgets and revoked grants must not bypass authorization or multiply unattended declarations. Pin in Tasks 4–6; real #181 policy is an activation prerequisite.

## Shared interface vocabulary

Keep these new internal types in `packages/api/src/services/windows/calendar-types.ts`; export public worker entry points through `packages/api/src/services/windows/index.ts` and `package.json` `./windows`. Use contract-inferred request/response types rather than handwritten wire copies. DB mutation types live in its own `windows/types.ts` so DB never imports API.

```ts
type FieldIssue = { pointer: string; detail: string }
type WindowKind = 'class' | 'event' | 'commute_wave'
type CalendarTransport = { assertPublicUrl: AssertPublicUrl; safeFetch: SafeFetch }
interface CalendarOptions {
  projectTz: string
  kind: WindowKind
  now: Date
  through: Date
  resolveLocalSpan: ResolveLocalSpan
}
type LocalDate = string // validated YYYY-MM-DD
interface NativeRule {
  frequency: 'weekly'
  days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
  until?: LocalDate
  count?: number
  skip_dates: LocalDate[]
}
interface LocalSpan {
  date: LocalDate
  start: string
  end: string
  endDayOffset: number
  tz: string
}
type ResolveLocalSpan = (span: LocalSpan) => Promise<{ startsAt: Date; endsAt: Date }>
interface CalendarIssue {
  uid: string | null
  recurrenceId: string | null
  pointer: string
  detail: string
}
interface CalendarOccurrence {
  uid: string
  recurrenceId: string
  recurring: boolean
  startsAt: Date
  endsAt: Date
  title: string
  tz: string
}
interface CalendarDocument {
  version: 1
  jcal: unknown[]
} // validated whitelisted component structure
interface ParsedCalendar {
  document: CalendarDocument
  occurrences: CalendarOccurrence[]
  skipped: CalendarIssue[]
  protectedIdentities: Array<{ uid: string; recurrenceId: string | null }>
}
interface CalendarBatch {
  feed_id: string
  revision: string
  window_ids?: string[]
}
```

`CalendarDocument` serializes only the design's whitelisted properties, not arbitrary original jCal; validate it again when loading. `protectedIdentities` names rejected event/series identities whose existing windows must not be mistaken for deletions. Native series enumeration produces civil dates; timezone resolution is the separate `ResolveLocalSpan` seam. Task 3 exports the real DB implementation.

## Task 1: Weekly recurrence and WIN-8 validation

**Files:** create `packages/api/src/services/windows/recurrence.ts`, `calendar-types.ts`, `validation.ts`; test `packages/api/test/windows-recurrence.test.ts`. After teammate integration, merge equivalent validation into its helper instead of retaining two copies. Do not edit routes yet.

**Interfaces:** `validateRecurrence(rule: NativeRule, anchor: LocalDate): FieldIssue[]`; `expandWeeklyDates(rule: NativeRule, anchor: LocalDate, through: LocalDate): LocalDate[]`; `validateWindowFields(fields: {starts_at:string; ends_at:string; kind:'class'|'event'|'commute_wave'; tz:string}, now:Date): FieldIssue[]`. Real zone resolution comes from Task 3; pure validation checks instant ordering/length/horizon, while zone existence is checked at the service seam.

- [ ] Write failing tests: anchor `2026-11-16`, Mondays/Wednesdays, skip `2026-11-25`, inclusive until `2026-12-23` returns exactly 11 dates; replacing until with count 12 returns the identical dates. Extension from the original anchor never restarts count or fills a skipped date. Duplicate weekdays, neither/both bound, invalid dates and wrong-weekday anchor fail at exact recurrence pointers.
- [ ] Write WIN-8 boundary tests at injected `now=2026-11-13T00:00:00Z`: exact 12 hours and exact +90 days succeed; +1 ms, reverse end, zero class/event and -1 ms start produce `/ends_at` or `/starts_at`. Zero commute succeeds. Reject malformed dates, year zero and more than three fractional digits at the corresponding field; a submillisecond value just beyond the 12-hour/90-day boundary must not round into acceptance. Independent invalid fields return multiple errors; overnight local date enumeration does not use process timezone.
- [ ] Run `rtk bunx vitest run packages/api/test/windows-recurrence.test.ts`; observe the specific missing implementation/assertion failures, then implement bounded civil-date enumeration and validation.
- [ ] Run the same command and confirm PASS. Self-review and commit the pure deliverable; the parent performs independent task review before the next task begins. It is independently buildable before the teammate branch exists.

## Task 2: Bounded ICS normalization

**Files:** create `packages/api/src/services/windows/parse-ics.ts`; modify `packages/api/package.json` and `bun.lock` to promote the existing parser pin; tests `packages/api/test/windows-ics-parser.test.ts` and test-only ICS inputs inside that file or its fixture directory.

**Interfaces:** `parseCalendar(text:string, options:CalendarOptions): Promise<ParsedCalendar>`; `expandCalendar(document:CalendarDocument, options:CalendarOptions): Promise<ParsedCalendar>`. `CalendarParseError` carries field/whole-document errors; neither function imports HTTP or DB.

- [ ] Write failing tests covering standalone UID, weekly RRULE with EXDATE, RDATE, COUNT/UNTIL, moved RECURRENCE-ID retaining original identity, cancelled instance/master, duplicate identity, invalid UID/title/zone, floating project-local timestamps, source VTIMEZONE, rejected/protected TZID without VTIMEZONE, and two documents defining the same TZID differently without cross-contamination. Preserve required recurrence properties while dropping DESCRIPTION/ATTENDEE/CONTACT/ORGANIZER/attachments from persisted `document`. Standalone identity is the empty string; source-frame recurring identity survives project-zone changes and exception moves. Reject missing/duplicate or >1024 UTF-8-byte UID/recurrence identity as whole-document errors before persistence, never truncate.
- [ ] Add explicit adversarial tests: all-day and >12-hour events enter `skipped`; invalid known UID becomes protected from deletion; malformed calendar rejects the document; >5 MiB UTF-8 (including multibyte text), >10,000 events/output and far-past SECONDLY rules exceed limits with a real error before partial output is returned. Count historical iterator steps, not just accepted future output. No arbitrary “now DTSTART” shortcut.
- [ ] Run `rtk bunx vitest run packages/api/test/windows-ics-parser.test.ts`, observe failure, then use pinned ICAL Event/iterator/exception APIs and the injected local-time resolver. Reject TZID without its source VTIMEZONE explicitly; serialize only normalized permitted semantics.
- [ ] Run the same command and confirm PASS. Verify parser pin remains exactly 2.2.1 in manifest/lock. This task is independent of list/create and contains no runtime fixture.

## Task 3: Durable identities and atomic mutations

**Files:** modify `packages/db/src/schema/windows.ts`, `packages/db/src/index.ts`; create `packages/db/src/windows/{index,types,calendar-time,mutations,repository}.ts`; add generated next migration, its new snapshot and journal entry; tests `packages/db/test/windows-lifecycle.test.ts`, `windows-calendar-time.test.ts`. No prior migration edits.

**Interfaces:** `resolveWindowLocalSpan(tx:Tx, span:LocalSpan):Promise<{startsAt:Date;endsAt:Date}>` (define matching DB-local structural input); `writeWindowChange(tx:Tx, change:WindowChange):Promise<WindowRow>`; `lockWindowParent(tx:Tx,id:string):Promise<WindowRow|null>`. `WindowChange` is a discriminated union `{kind:'create'; values:WindowInsert; now:Date; calendar?:CalendarBatch}` or `{kind:'update'; id:string; patch:Partial<Pick<WindowInsert,'title'|'kind'|'startsAt'|'endsAt'|'tz'|'localOverride'>>; now:Date; calendar?:CalendarBatch}` or `{kind:'cancel'; id:string; origin:'manual'|'series'|'source'; now:Date; calendar?:CalendarBatch}` or `{kind:'restore-source';id:string;now:Date;calendar:CalendarBatch}`. Source restoration requires an active feed/series and a non-overridden source-cancelled row; it emits window.updated and retains prior ledger history. Inputs are service-validated; patch fields are optional individually. Export `WindowRow`/`WindowInsert` from the schema's inferred types. Mutation primitive computes actual differences, writes events and uses real appendLedger for sent-call cancellation.

- [ ] Write failing real-DB tests for both unique identities, same-org series/feed constraints, legacy nullable identity handling, concurrent same-occurrence insertion, all-or-nothing events/ledger and cancellation replay. A sent-call cancel preserves calls and produces one verifiable `window_cancelled` entry with the exact pseudonymous actor and injected cancellation time. Ledger failure rolls the whole mutation back. No-op update/cancel emits nothing; a manual cancellation marks local override, and source cancellation/restoration cannot override it.
- [ ] Add local-time tests for MYT overnight 23:00–01:00, a DST spring gap rejected by round trip, fall overlap matching PostgreSQL's standard-time choice, and a daily series keeping 09:00 local across an offset change. Do not implement this by midnight-plus-minutes.
- [ ] Run `rtk bunx vitest run packages/db/test/windows-lifecycle.test.ts packages/db/test/windows-calendar-time.test.ts`; observe failure. Add the design's columns/indexes and generate the new migration with `rtk bun run --cwd packages/db generate -- --name b-windows-api-lifecycle`. Add tenant-scoped locks and mutation functions, with feed → series → sorted windows lock order.
- [ ] Run the same command and `rtk bunx vitest run packages/db/test/tenancy.test.ts packages/db/test/migrate.test.ts`. Confirm all pass on the local Postgres harness after `rtk bun run db:up`. Never run a production migration. Review nullable legacy behavior and preserved applied migration hashes before commit.

## Task 4: Series and edit/cancel operations

**Files:** integrate actual teammate `packages/api/src/services/windows/index.ts` and `packages/api/src/routes/windows/index.ts`; create `series.ts`, `lifecycle.ts` beside services; modify `packages/contracts/src/api/v1/windows.ts`, `packages/api/src/routes/index.ts`, generated `packages/api/openapi.json`; tests `packages/api/test/windows-lifecycle.test.ts`, contract windows tests. The inspected OpenAPI script writes `packages/api/openapi.json`.

**Interfaces:** `createWindowSeries(ctx:ServiceContext,deps:{can:Can;now:Date},input:CreateWindowInput & {projectId:string}):Promise<WindowView>`; `updateWindow(ctx,deps,input:{id:string;scope:'occurrence'|'series';patch:UpdateWindowInput}):Promise<WindowView>`; `cancelWindow(ctx,deps,input:{id:string;scope:'occurrence'|'series'}):Promise<WindowView>`. Derive CreateWindowInput/UpdateWindowInput/WindowView from Operations schemas. Reuse the teammate's actual authorization, provenance and view functions; add only the recurrence branch to its create handler.

- [ ] Before edits, review the published single-window diff once and map its real helpers to the design's required semantics. If still unpublished, continue Tasks 1–3/5 parser tests and leave this task explicitly dependent; do not implement another list/create path.
- [ ] Write failing route/service tests for strict unknown root/nested fields, all WIN-8 errors, exactly 11 recurring rows, occurrence-vs-series edit/cancel, started rows retained, explicit historical occurrence cancellation retaining its original starts/ends and calls while appending a new current-time withdrawal, rejected past creation/time edits, tombstones surviving daily extension and meaningful no-op retries. API-key, member OAuth/MCP and CLI-session idempotency must create one series/11 rows, emit one set of events and return the same selected occurrence. Test direct service authorization, Viewer denial and foreign target 404 for every mutation.
- [ ] Add isolated test-double tests proving each guest/share occurrence consumes a real-shaped BudgetGate call inside the transaction and denial yields 429 with exact Retry-After (reset +61 seconds gives 61), rolling back all writes. Do not wire placeholder budgetGate into runtime; production guest/share activation awaits #181's real typed policy and unattended eligibility decision.
- [ ] Run `rtk bunx vitest run packages/api/test/windows-lifecycle.test.ts packages/contracts/test/api/windows-ui.test.ts`; observe failure, implement strict contracts/services using Task 3, and run the same command to PASS. Regenerate OpenAPI with `rtk bun run openapi:generate`; `rtk bun run openapi:check` must PASS. Include declared 422/409 errors for scope/state cases and preserve single-window response behavior.

## Task 5: Calendar feed operations and guarded reconciliation

**Files:** create API `services/windows/{feeds,fetch-ics}.ts`, `routes/ics-feeds/index.ts`; extend DB `windows/repository.ts`/`mutations.ts`; modify contracts `api/v1/ics-feeds.ts`, `api/shared.ts`, operation exports if required and API handler registry; tests `packages/api/test/windows-ics-feeds.test.ts`, `packages/db/test/windows-ics-diff.test.ts`.

**Interfaces:** here `ctx:ServiceContext`, `deps:{can:Can;now:Date}` and `IcsFeedView` is inferred from the amended getIcsFeed 200 schema. `listIcsFeeds(ctx,deps,input:{projectId:string;limit:number;cursor?:string}):Promise<{data:IcsFeedView[];next_cursor:string|null}>`; `getIcsFeed(ctx,deps,id:string):Promise<IcsFeedView>`; `createIcsFeed(ctx,deps,input:{projectId:string;kind?:WindowKind;url:string}|{projectId:string;kind?:WindowKind;file:{name:string;content:string}}):Promise<IcsFeedView>`; `deleteIcsFeed(ctx,deps,id:string):Promise<IcsFeedView>`. `fetchCalendar(url:string, validators:{etag:string|null;lastModified:string|null}, transport:{assertPublicUrl:AssertPublicUrl;safeFetch:SafeFetch}):Promise<{status:'unchanged'}|{status:'changed';text:string;etag:string|null;lastModified:string|null}>`. Production transport is the existing guarded implementation; injected substitutes are tests only. `createIcsFeed` URL mode performs authorization and `assertPublicUrl` preflight inside its existing Tx, inserts a pending feed with `next_refresh_at=deps.now`, and returns 201 without calendar HTTP or windows. File mode imports immediately without HTTP, binding `resolveWindowLocalSpan(ctx.tx, span)` to the existing Tx. `fetchCalendar` is called only by the worker after committing its claim transaction; no new idempotency engine is introduced.

- [ ] Write failing operation tests for get/list/create/delete, kind default class, strict URL-or-file, one-time upload, source status/skipped response, idempotent creation, Viewer mutation denial, cross-org 404 and real unsafe URL preflight mapping. Assert URL creation returns 201/status=pending, null refreshed_at/last_attempt_at and zero imported windows, schedules next_refresh_at=now, and invokes no safeFetch. Same-key replay returns the same feed and original pending response through existing middleware; get/list later report actual state. File import returns ready only after atomic parse/apply and invokes no HTTP. Test HTTPS public redirects to private/loopback/link-local/metadata against the actual worker guard with test DNS/network seams; assert these later failures persist status=error/last_error.code=unsafe-url, rather than claiming the earlier 201 failed; never pass a raw unguarded fetch in production.
- [ ] Write diff tests: source end change preserves ID and sets times_changed; title-only change does not; no-op emits nothing; EXDATE/disappearance/cancellation is retained and ledgered; moved exception retains identity; malformed or oversized body causes zero diff; a skipped invalid UID does not cancel old rows; outside-horizon absence is not deletion; manual override/cancellation survives refresh; a genuinely restored source identity revives the same non-overridden row and retains cancellation history; feed deletion preserves calls and prevents later claim application.
- [ ] Add conditional fetch tests: ETag takes precedence, Last-Modified otherwise, 304 retains authoritative semantics and extends horizon, unsuccessful HTTP exposes error and cannot masquerade as an empty document. Assert exact transport options 10,000 ms/5,242,880 bytes/3 redirects/HTTPS. Whitelisted source document contains no unrelated fields.
- [ ] Run `rtk bunx vitest run packages/api/test/windows-ics-feeds.test.ts packages/db/test/windows-ics-diff.test.ts`; observe failure, implement the routes/services and atomic reconciliation with Task 2/3, then rerun to PASS. Enforce total changed-row bound before mutation. Regenerate/check OpenAPI, including truthful 201 pending-registration wording and optional status/last-attempt fields. Record the UI conflict precisely: import-form.tsx:66–69 ignores the returned feed, declare-window-dialog.tsx:147 chooses imported, and English windows.json:102 says “Calendar imported.” @kymil4 owns distinguishing queued URL registration from completed file import; this task edits no frontend. Read cursors bind tenant/project and validate malformed values using existing pagination conventions.

## Task 6: Due checks and consumer integration

**Files:** create `apps/worker/src/windows/index.ts`; append registry import/entry; export API windows worker functions in `packages/api/package.json`; modify `packages/contracts/src/events.ts`, `apps/worker/src/runs/consumers.ts`; tests `apps/worker/test/windows-due.test.ts`, `apps/worker/test/runs-triggers.test.ts`, existing evaluator/ics consumer tests.

**Interfaces:** `extendDueWindowSeries(tx:Tx,projectId:string,now:Date):Promise<number>`; `claimDueIcsFeeds(tx:Tx,projectId:string,now:Date):Promise<FeedClaim[]>`; `refreshClaimedIcsFeed(claim:FeedClaim, deps:{withTenant:WithTenant;now:()=>Date;transport:CalendarTransport}):Promise<void>`. `FeedClaim` holds authoritative `{orgId:string;projectId:string;feedId:string;claimId:string;url:string;etag:string|null;lastModified:string|null}` read under tenant scope. `windowsPart(deps:{now:()=>Date;transport:CalendarTransport}):WorkerPart` registers only batch `windows-due`; production dependencies use existing withTenant, guard and clock. Complete function return before shared connection release. `refreshClaimedIcsFeed` performs guarded HTTP with no tenant Tx held, then uses one fresh withTenant apply Tx for claim fencing, parse/expand/diff and writes; all PostgreSQL local-span resolutions close over that same Tx, never one withTenant/connection per occurrence.

- [ ] Write failing worker tests: a newly queued URL imports at its first eligible existing batch and moves pending to ready only after success; claim time becomes last_attempt_at while refreshed_at remains null until success; local-date daily extension runs once; source URL refresh not before one hour; file never fetched; duplicate batch claim does not fetch twice; crash permits a new claim at one hour; old claim arriving after later claim/deletion does nothing; source failure records actual error and leaves successful validator/data untouched; new genuine source success clears error. Archived/suspended projects do not grow new windows. Assert HTTP starts after claim commit and before apply begins, and every local-span resolution uses the same apply Tx; rollback leaves no partial windows. No unscoped T-table reads, per-occurrence transactions or nested withTenant/withSystem.
- [ ] For guest/share unattended tests, require real merged #181 policy plus authoritative current grant/account lookup; revoked/expired/grant-outside-project cannot create more windows. If that seam is absent, leave those runtime paths unavailable and report the exact prerequisite. Do not serialize credentials or trust an old role snapshot as authorization.
- [ ] Write a manual edit test for an imported window: without source-calendar metadata it remains an ordinary window trigger and must not be deduplicated by mutable feed ETag. Source import/refresh/extension producers must supply their immutable calendar metadata. Write event/consumer test with two changed windows, delivery of a nonrepresentative first, representative later, and the run claimed immediately: exactly one complete calendar run references both IDs and immutable revision. A later feed revision before delivery cannot alter the first run's key. Each ordinary window event still reaches evaluator/conditions-calendar consumers. Duplicated representative does not create another run; a later revision does.
- [ ] Run `rtk bunx vitest run apps/worker/test/windows-due.test.ts apps/worker/test/runs-triggers.test.ts apps/worker/test/ics.test.ts`; observe failure. Implement existing batch due checks and the bounded calendar event amendment: one representative includes window_ids, others omit it. Consumer uses requestRun only from representative; producer metadata is mandatory for newly emitted ICS events, with no mutable-feed fallback. Run the same command to PASS and `rtk bunx vitest run apps/worker/test/evaluator-loop.test.ts` once.

## Final verification and handoff

- [ ] Parent applies approved #79/#139/#151 contract changes and affected-child notices; planning artifacts themselves do not authorize posting. State all remaining #181 and live-calendar prerequisites precisely.
- [ ] Run `rtk bun run lint`, `rtk bun run typecheck`, `rtk bun run test`, `rtk bun run openapi:check`. Record actual results, not expected outcomes. Existing tests must remain green, especially the teammate's list/latest-per-pack-call and idempotency coverage.
- [ ] Run the pinned graphify update through `rtk proxy` after product source changes, as AGENTS requires; inspect resulting changes. Review migration immutability, no new scheduler, no UI edits, no runtime fixtures/stubs, and parser exact pin.
- [ ] Parent obtains the authorized independent review and integrates the branch. Local evidence establishes core implementation only; production WIN-4 requires a real public event change and one observed hourly refresh/calendar run. Do not close all #139 acceptance while guest/share or this human/live requirement is still unverified without the user's explicit core-first accounting.

Validation commands run through the task-owned shared-lock wrapper at /Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/run-check.py, with Node22.22/Bun1.4.4, local PostgreSQL56440, at most four workers and unchanged default timeouts. The parent owns final full-suite/Linux gates.
