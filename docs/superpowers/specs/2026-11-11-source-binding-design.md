# Source binding design for #138

Plan only, 10 November 2026. This implements [#138](https://github.com/m1kulabs/Skyclause/issues/138) against binding contract [#79](https://github.com/m1kulabs/Skyclause/issues/79), with delivery targeted before 13 November. The controller approved the fixed `meta.project_id` ownership rule and honest nullable state/licence for this plan; all schema and owner deltas remain explicit implementation work in the contract-labelled #138 PR. No source files, Git index, HEAD, migrations, cloud resources or database rows were changed during planning.

## Contents

- [Evidence and boundary](#evidence-and-boundary)
- [Approach](#approach)
- [Public and internal interfaces](#public-and-internal-interfaces)
- [Catalogue projection](#catalogue-projection)
- [Atomic binding and pack changes](#atomic-binding-and-pack-changes)
- [Device ownership](#device-ownership)
- [Owner deltas and readiness](#owner-deltas-and-readiness)

## Evidence and boundary

Code was read at pinned commit `219b38f72dbf05c8a4e3c074078f5273e55ab63e` in the read-only release worktree `/Users/jeremywoon/.codex/worktrees/2d2a/gdgocapu`; later controller publication must not change this plan's baseline silently. Graphify query identified the source contracts, C RLS tables, catalogue/query modules, project services and binding event. Actual GitHub #138, #79, #128, #133 and #179 bodies were read as requirements data.

Existing code provides:

- `ServiceContext = {principal: Principal; tx: Tx}`, `inTenant`, `withTenant`, real `can`, scoped principals, request idempotency and transactional audit/event/analytics writers.
- `source`, global `source_state`, tenant `project_source`, and `project_pack`; all needed persistence already exists. Only `packages/db` owns SQL.
- #137 `createProject(ctx, input, options)` creates both packs and default published sheets, with Crowd disabled. Pack toggles never write sheets. #135 sheet publishing is real.
- #120 `source.bound` consumer records intent inside its short transaction, then performs backfill outside it. Active `boundSources` excludes archived projects and collapses roles to project references. Preserve these signatures and semantics.
- #150 already copies `project_pack.sla_s ?? DEFAULT_SLA_S[pack]` at draft time; defaults are Sky 600 s and Crowd 7200 s. No old bundle is rewritten.

This feature owns four operations: catalogue listing, bind, unbind and pack PATCH. It does not implement #128 devices, #134 historical/state APIs, #142 UI, #174 settings UI, adapters or #133 evaluator. It reads persisted source data directly without depending on those future read API implementations.

## Approach

Use the existing tenant transaction, shared source service, DB query modules and event outbox. Infer the one allowed role from source kind; the published bind request has only `source_id`. This gives #128 and #179 the exact same write path as HTTP and prevents caller-supplied incompatible roles.

A separate onboarding binding writer would duplicate audit, role and Crowd checks. A new ownership/state framework would exceed this ticket and obscure #128's project-owned contract. Neither is needed. This recommendation is a planning choice for controller review, not a claim of separate human design approval.

No new table, migration, dependency, poller or connection is required. Keep published migrations and journal untouched.

## Public and internal interfaces

Create `packages/api/src/services/sources/{index,serialize}.ts`, `packages/api/src/routes/sources/index.ts`, and `packages/db/src/sources/{picker,binding}.ts`. Append exports to existing barrels and add one handler registry spread. Preserve existing source runner APIs.

```ts
type SourcesAccess = { can: Can; now: Date }
type CatalogueQuery = {
  kind?: SourceKind; near?: string; q?: string; limit: number; cursor?: string
}
type CatalogueSourceView = Source & {
  distance_km: number | null; latest_reading: Reading | null;
  age_s: number | null; source_state: SourceState | null
}
type BoundSourceView = Source & {
  project_id: string; role: SourceRole; state: SourceState | null;
  latest_reading: Reading | null; age_s: number | null; recent_errors: Poll[]
}
listCatalogueSources(ctx: ServiceContext, query: CatalogueQuery,
  access: SourcesAccess): Promise<Page<CatalogueSourceView>>
bindSource(ctx: ServiceContext, input: {projectId: string; sourceId: string},
  access: SourcesAccess): Promise<BoundSourceView>
unbindSource(ctx: ServiceContext, input: {projectId: string; sourceId: string},
  access: SourcesAccess): Promise<void>
updateProjectPack(ctx: ServiceContext,
  input: {projectId: string; pack: Pack; enabled?: boolean; sla_s?: number | null},
  access: SourcesAccess): Promise<ProjectPack>
```

`SourcesAccess.can` is mandatory and passed from API dependencies. All services enforce permissions themselves so in-process callers cannot bypass the matrix. The one explicit internal exception is a trusted `system` principal in a transaction for the target organisation, allowing #179 provisioning; never accept a wire flag to activate it. #128 calls `bindSource` with the creating Admin's principal and transaction. #179 calls it with its existing system transaction and real project/source IDs, after resolving every catalogue prerequisite. No service opens/commits its own transaction or fetches a provider.

Wire routes retain existing operation IDs, paths and response codes: POST 201, DELETE 204, PATCH 200. POST body remains `{source_id}` and role is inferred. Catalogue and bind views use schema-inferred exported aliases; the structural types above state their exact required fields. No metadata, tokens, frame object paths beyond already-authorized reading payloads, or project daylight settings are added to `Source`.

Authorization checks project visibility before returning any project mutation: tenant row existence and OAuth/share target scope return 404 when unavailable; then `can(principal, 'sources.manage', {projectId})` enforces the real role/key matrix. Admin/Owner sessions and Admin/Owner `admin` keys pass; Editors, read keys, OAuth, share, guest and device principals cannot mutate. Catalogue requires `project.view`; public catalogue rows stay visible, while private device rows must also belong to a project the principal can view. Do not confuse route middleware's untargeted permission check with project authorization.

## Catalogue projection

`GET /v1/catalogue/sources` accepts `kind`, `near=lat,lon`, `q`, `limit`, `cursor`. Validate finite latitude [-90,90] and longitude [-180,180], requiring both values; invalid kind, coordinates or cursor yield 422. Trim `q`; empty means no filter; perform a case-insensitive literal substring match on name or `external_id` (escape SQL wildcard characters). Reuse PageQuery defaults and bounds.

Compute distance in the DB query using haversine, WGS84 latitude/longitude, mean radius exactly 6371.0088 km, and clamp the floating point haversine term to [0,1]. Either source coordinate missing or `near` absent gives `distance_km: null`; never substitute zero or typed coordinates. With `near`, order non-null distance ascending then source UUID ascending, null distances last then UUID ascending. Without `near`, order UUID ascending. Serialize full precision; rounding belongs to UI.

Use a keyset cursor `{v:1, filter_hash, distance_km, id}` over the normalized kind/near/q and ordering; reject filter reuse, malformed/non-finite/negative distances, and non-null distance when `near` is absent, with 422. Query `limit+1`, apply the same C RLS, ownership/scope predicate and sort on every page, and use existing `page` encoding. This is ordinary live catalogue pagination; a provider moving a station between requests can move its position, with no snapshot persistence promised.

For each selected source, select its newest reading by `observed_at DESC, received_at DESC, revision DESC, id DESC`; never replace a live value with a capture. `age_s = max(0, floor((access.now - observed_at)/1000))`, null without a reading. Return the persisted `source_state` or null; no row means evaluator state unavailable, not healthy. Latest reading is the stored reading even when state is stale/error because this endpoint is a source picker, not an evaluation verdict. Do not derive or upsert state here. For bind's existing `recent_errors`, return at most the newest 5 error polls by `started_at DESC,id DESC`; this small response projection does not implement #134 history routes.

Return `licence_id: null` when the DB is null and `licence_label: "no published terms"` in that case. Otherwise retain the stored licence fields. No string ID, fallback state, guessed station location or synthetic reading is permitted.

## Atomic binding and pack changes

All mutations lock the tenant `project` row `FOR UPDATE` before inspecting bindings/packs. Bind reads the selected source under C RLS and locks its source row only for an owned camera/Pi; this serializes same-device writes across target projects. All calls use this order. Never `FOR UPDATE` a public catalogue source: its tenant read policy permits SELECT but its write policy does not permit locking it for update. Public-source binds need only the project lock and existing unique key. Preserve the existing project/source RLS; no `withSystem` bypass for user routes.

Kind-to-role mapping is total and exact:

| Kind              | Role           |
| ----------------- | -------------- |
| jps_rain          | rain_gauge     |
| apims             | api_station    |
| met_warning       | warnings       |
| met_forecast      | met_forecast   |
| rapidrail_od      | rail_station   |
| golive, wikipedia | venue_listings |
| gtfs_rt           | bus_feed       |
| gtfs_static       | gtfs_static    |
| camera            | camera         |
| pi                | pi             |

Bind inserts once under the existing `(project_id,source_id,role)` unique key. A source can be erroring, stale, pending, probationary, off-hours or have no state/reading; none blocks binding. Existing identical binding returns its current DTO with no new writes; key replay returns the stored response through existing middleware. New-key retry after a committed request but before response storage remains harmless. Do not reinterpret a stale historic row with another role: an existing role differing from the mapping is 422 validation-failed and no mutation.

On an actual bind: one `source.bound` audit, one `source.bound` event with `{source_id,role}` and correct project envelope, and one `track(tx,'source_bound',{adapter:kind,cadence_min:cadenceS/60},{projectId})`. On actual unbind: one corresponding audit/event and no bind analytics. Use the source ID as audit target (`type: 'source'`); before/after contain only `{source_id,role}` or null. All are in the same transaction as the row change. On audit/event/analytics failure or caller rollback, nothing commits or publishes. No duplicate publish is promised; the outbox/consumers already handle delivery retries.

DELETE first resolves the source under C RLS and device ownership, returning 404 for a missing/unavailable source even if no binding exists. For an available source with an already absent binding on an authorized project it is a 204 no-op, with no audit/event. While Crowd is enabled, deleting its last `rail_station` or `venue_listings` fails 409 `pack-prerequisites`, with `missing` listing the roles that would be absent after deletion. Additional bindings of that role allow deletion. No extra Sky prerequisites or generic restrictions on unrelated roles are introduced.

PATCH overlays only supplied `enabled`/`sla_s`. Enabling Crowd first requires `pack_crowd`, else 403 `feature-off`; then requires rail and listings, else 409 `pack-prerequisites` with deterministic `missing: ['rail_station','venue_listings']` filtered to absent roles. Check these whenever `enabled:true` is requested, including an already enabled row. Disabling remains possible with the flag off or prerequisites missing. SLA-only updates remain possible in either state. Sky has no feature/source prerequisite. Preserve `sheet_id` and schedule, and never write clause sheets.

On a changed SLA, emit exactly one existing `sla.changed` audit with complete before/after `{pack,enabled,sla_s}`. Enabled-only changes need an explicit `pack.updated` audit catalogue addition; a PATCH changing both uses one `sla.changed` audit covering both. No-op PATCH writes no audit. Pack PATCH emits no invented domain event. No bundle field changes: #150's draft reader consumes the next SLA; nullable SLA resets to its existing default behavior.

Concurrent enable/remove and two removals cannot leave enabled Crowd missing a required role because they serialize on the same project lock. Bind/unbind events retain their project envelope. Archiving retains bindings; #120's active-bound-project filter continues to exclude archived projects from automatic polls/fanout. This ticket adds no new archive behavior or synthetic unbound event on archive.

## Device ownership

[#128](https://github.com/m1kulabs/Skyclause/issues/128) explicitly creates project-owned camera/Pi devices and uses one project's daylight/time zone, semester and frame path. #138's organisation-visible catalogue wording is not permission to rebind a private device into another project. A global `source_state` cannot represent two cameras' project-specific daylight schedules for one shared source.

Minimal proposed owner delta: #128 stores immutable `source.meta.project_id` at creation, along with `owner_org_id`, and atomically creates its first binding through this `bindSource`. A private device is bindable only to that project. Binding verifies metadata is a UUID naming an existing project in the same tenant, equals target project, and no binding to a different project already exists. Missing, malformed or mismatched device ownership is 404 and leaves everything untouched; do not infer ownership from the first current binding after an unbind. Unbinding never transfers/deletes ownership. The source lock prevents races. Public catalogue rows remain reusable across projects and organisations as before; ownerless camera/Pi rows are refused as malformed private-device ownership.

Catalogue includes all valid owned devices for ordinary organisation members allowed `project.view`, and only owner-project-visible devices for project-scoped OAuth/share principals. Missing/invalid project metadata yields no device row, not a cross-project exposure. Existing legacy devices without trustworthy owner metadata become unavailable until their owning ticket resolves them; never infer or backfill guessed ownership. This narrows service visibility without changing C RLS or storage ownership. #128 ingest, token rotation and #134 private source reads must use the same owning-project resolution; #133 must resolve camera off-hours from this one project, not whichever binding it happens to load. These are explicit owner integration deltas, not implementations in #138. If the controller rejects metadata ownership, a durable owner-project column plus additive migration is required before device reuse can be shipped; do not silently permit multiple projects.

## Owner deltas and readiness

The following contract gaps exist at the pin and require a contract-labelled change to owned schemas plus #79/affected-ticket notifications at implementation time:

1. `api/v1/catalogue.ts`: add the specified kind/near/q query, `distance_km` response, and unavailable-scope 404. Keep limit/cursor from PageQuery.
2. `api/shared.ts Source.licence_id`: allow null, matching DB and #120; never manufacture an ID. This is shared and requires owner alignment.
3. `api/v1/sources.ts ProjectSource.state`: allow null for a source with no #133 state. It affects #134's shared view; align that owner instead of setting a fake fresh/stale state.
4. Unbind/pack route responses: declare 409 pack-prerequisites. The generic `Problem` schema does not declare `missing`; use a dedicated `Problem.extend({missing: z.array(SourceRole)})` for these 409 responses, without widening unrelated problems. Add `pack.updated` to the shared audit action catalogue for enabled-only changes.
5. #128/#133/#134 device owner-project metadata rule above. No source-state schema change is proposed.

Known runtime prerequisites are distinct from successful null data: JPS has 49 real catalogue rows, all coordinates null, so their distances are honestly null; #123 is preparing 68 real APIMS stations with coordinates and live readings. A successful catalogue response with absent readings/state is not evidence that #123/#133 is ready. The stored 5 November `mapcaqm` capture contains actual CA16W API 67 at 21:00 MYT; use that byte-for-byte capture only in an isolated test DB for the 5.9 km ±0.3 km PRJ-2 test at `near=3.0559,101.6997`. No test rows or fixtures enter runtime.

Production proof after #123 must find real CA16W, its genuine coordinates, distance and latest reading whose `received_at-observed_at <= 900 s`; source age is reported separately. Until then, record this check as blocked on #123, never passed by null rows. #133 state readiness, #120 cloud/backfill/day-long checks and provider limitations remain honestly named. No provider networking or runtime writes were performed for this plan.

Execution checkpoint: isolated2d2a was reused after JPS121 merged/closed/evidence archived. Branch feat/b-source-binding starts at main006444c280daa08eb412b38564d2e5eedf5e5703. This is the implementation destination, not the earlier read-only release stage. Hosted billing remains unavailable; user explicitly authorized local CI as alternate. Core-first closure may transfer important actual provider/runtime acceptance explicitly unverified to an open owner issue, never mark it passed.
