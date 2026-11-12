# Project source list prerequisite design

Implement only `GET /v1/projects/{id}/sources` (`listProjectSources`) to remove
the independent backend 501 blocking #717 Packs. This is **part of #134**,
not completion of #134 or of the browser transport repair. The user opted out
of further brainstorming questions; the parent reviews these explicit choices
before implementation. No implementation or validation was performed here.

Contents:

- [Evidence and approach](#evidence-and-approach)
- [Contract rulings](#contract-rulings)
- [Read and access boundaries](#read-and-access-boundaries)
- [Scope and acceptance](#scope-and-acceptance)

## Evidence and approach

Baseline: `investigate/pilot717`, commit
`83787e800d610c863fe307b0dbc65461e8f515b5`, isolated worktree
`/Users/jeremywoon/.codex/worktrees/2d2a/gdgocapu`.

Binding requirements are [#134](https://github.com/m1kulabs/Skyclause/issues/134),
[#79](https://github.com/m1kulabs/Skyclause/issues/79) §§3–4 and its #133/#138,
APIMS and MET amendments, and `docs/TRD.md` freshness rules. Current contract:
`packages/contracts/src/api/v1/sources.ts:102`; existing binding serializer:
`packages/api/src/services/sources/serialize.ts`; projection:
`packages/db/src/sources/picker.ts`; state authority:
`packages/db/src/evaluator/transitions.ts`.

Use a small signals read service and DB query, the existing route registry,
tenant transaction, pagination helpers and source serializer. Register one
operation. Reusing the picker query unchanged is insufficient: it lacks binding
pagination and slot history, uses observation age for polled sources and returns
last values alongside error state. Changing that shared behavior would alter
#138, whose tests deliberately assert it. Building all signals routes would
expand scope and require unrelated owners. The selected list-only projection
preserves those existing operations.

## Contract rulings

These are recommended decisions, not claims that #134 specifies these details.
The parent must approve or replace them before implementation.

1. **Missing schema fields.** Current `ProjectSource` includes all `Source`
   fields, `project_id`, `role`, nullable `state`, nullable `latest_reading`,
   nullable `age_s`, `recent_errors`, and optional `probation`. It has neither
   `history` nor `last_error`. Shared `Poll` omits DB `message` and `purpose`.
   Add a list-only `ProjectSourceHealth = ProjectSource.extend(...)`, keeping
   bind's schema and shared `Poll` unchanged. Exact additions:

   ```ts
   history?: Array<{
     start_at: string // Instant
     end_at: string // Instant
     status: 'received' | 'missed' | 'error'
   }> // exactly 48, ascending
   last_error?: (Poll & {
     message: string | null
     purpose: string
   }) | null
   ```

   `last_error.started_at` is the genuine error time; no invented `time` alias.
   It is the newest retained error ordered by `(started_at DESC, id DESC)`, of
   any purpose. `purpose` prevents a backfill error being presented as a normal
   poll failure. Keep actual nullable `http_status`, `error_code`, and message.
   `recent_errors` remains the newest five real error polls. Both new fields
   are optional in the schema for compatibility but always populated by the
   implemented GET, asserted at its operation seam. #79's opening paragraph
   explicitly exempts optional response fields on an owned operation from
   its broad amendment/contract-label/child-comment process. Required additions
   would instead trigger that process and break existing typed fixtures; the
   optional approach is selected. Cost: clients tolerate omission from older
   servers while the new server guarantees fields; OpenAPI is regenerated.

2. **48 slots.** At the injected request `now`, use 48 rolling half-open
   intervals `[now - 48*cadence_s, now)`, oldest first, width
   `source.cadence_s`. Attribute only `purpose='poll'` rows by genuine
   `started_at`, never observation or ingestion time. Any error in a slot wins;
   otherwise any `ok`/`unchanged` is `received`; otherwise `missed`. Retain only
   rows started by `now` and, when known, received by `now`. A null legacy
   receipt stays unknown; a currently persisted row still proves its physical
   request, without inventing an ingestion timestamp. Exact `now` belongs to
   the next window; an internal boundary belongs to the following slot.
   APIMS uses logical 3600-second slots despite 900-second physical admission.
   Backfill/probe/discovery never fill these slots. This is recorded normal
   poll history, not proof of a missed scheduler invocation: `scheduledAt` is
   not in `poll`. Device readings with no poll do not manufacture poll success.
   Cost: a failed physical APIMS poll keeps its hourly slot red even after a
   later success; devices without poll rows have missed poll slots independently
   of their owner-computed state. These meanings must be schema descriptions.

3. **State and values.** Return persisted #133 `source_state` exactly, including
   its genuine `since`, or null when absent. Never call evaluator writes or
   derive a fresh default. When the newest normal poll is an error and stored
   state is not `error`, return `state:null` as an explicitly uncomputed current
   projection, plus null latest/age. Never return `fresh` beside that known
   error. If stored state is `error`, return that error and its actual `since`
   with null latest/age. This uses the existing nullable unknown contract while
   preserving #133's error-run/recovery authority. Deriving an error-run onset
   from only the newest poll or five recent errors would invent `since`;
   loading complete evaluator history and device context would expand scope.
   Otherwise use a genuine retained reading received by `now`, preserving the
   established deterministic ordering `(observed_at DESC, received_at DESC,
revision DESC, id DESC)` and all reading fields. No prior-value copy or
   synthesis occurs. Observed age is elapsed whole seconds from its observation;
   a future observed timestamp has null age, never clamped zero. Polled age is
   elapsed whole seconds from the latest successful **normal** poll's
   `started_at`, including `unchanged`; no such poll means null age. Forecast
   future `observed_at`/published date inside `value_json` remain verbatim;
   their age comes from the poll. The singular latest row is not a forecast
   for today or the `/days` result. Cost: state is temporarily unknown until
   #133 materializes an error, rather than a fabricated error onset or a known
   false fresh result. This limited lag case is explicitly not a claim of
   satisfying every full-#134 error-state acceptance scenario.

4. **Probation.** Preserve the existing optional field but omit it unless an
   authoritative merged query exists. Do not invent counts, agreement or
   device freshness. #128's remaining integration is not this prerequisite.

## Read and access boundaries

Use `getProjectRecord(ctx.tx, projectId)` without a lock; validate tenant and
principal project scope as well as `can(principal, 'project.view', target)`.
Forbidden actor classes, including ingest-only devices, get uniform 403 before
resource lookup. An otherwise permitted caller gets 404 for a foreign/hidden
project or an OAuth/share-link project outside its grant. Anonymous requests
keep existing 401. Guest membership with `project.view` can read an authorized
project; this endpoint does not become anonymous because C rows are public.

Within that project, paginate bindings by binding UUID ascending, `limit + 1`,
with an opaque versioned cursor bound to org and project. Preserve each stored
binding role. Public rows must be non-device catalogue rows with
`owner_org_id=null`. Camera/Pi rows require the current organisation and exact
authoritative `meta.project_id`; hide malformed or conflicting private
bindings before any reading/poll projection. Do not let a corrupt binding
grant access to a device owned by another project. Use the caller's RLS tenant
transaction throughout; no system/public-reader escalation on the endpoint.

Batch-load evidence only for the visible page (not one query per source), using
the existing source/state/poll/reading tables and DB-owned SQL. Read-only means
no source-state writes, locks, events, audits, analytics, backfill or upstream
HTTP. Preserve public C access in DB tests; public data does not grant access
to another organisation's project bindings.

## Scope and acceptance

A real empty project returns `{data: [], next_cursor: null}`. Bound sources
conform to the complete list schema, including error rows, 48 slots, real
latest values and null unknowns. Pagination is 1–200, default 50, with no
cross-project cursor reuse. Real PostgreSQL tests cover tenant/project denial,
public C visibility, private ownership, temporal boundaries, no write effects,
captured APIMS data and stored MET future forecast metadata.

No migrations, dependencies, runtime fixtures, frontend/transport changes,
source ingestion or state-machine changes. Preserve every migration and
capture. Remaining #134 routes, SSE/#175, indicators/verdicts, strip, days,
`ShiftConditions`, #127/#128 integrations and production p95 acceptance stay
explicitly open under #134. #139 and submission activity remain outside this
backend change. The PR says **Part of #134**, never **Closes #134**. Local green
checks do not establish deployed browser success or beta readiness.

Parent approval: all four design rulings accepted for this list-only prerequisite under the user's autonomous submission instruction. No full134 closure is authorized. Source-entity/data writes are forbidden; repository implementation edits are the task. Temporal tests use one explicit injected request clock and explicit fixture timestamps, never DB-default clocks against unrelated host cutoffs.
