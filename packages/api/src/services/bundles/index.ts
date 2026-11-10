import { HTTP_PROBLEM_STATUS } from '@skyclause/contracts'
import type { InputValue, Operations, Principal } from '@skyclause/contracts'
import {
  approval,
  bundle,
  bundleAlert,
  call,
  grade,
  indicatorSnapshot,
  night,
  notice,
  project,
  reading,
  recipientsByLanguage,
  run,
  runStep,
  sheetVersion,
  source,
  startOfLocalDay,
  window,
  type MissingCall,
  type Tx
} from '@skyclause/db'
import { and, asc, desc, eq, gte, inArray, lt, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

// #150, #79 §4 c-bundle-lifecycle reads: `(ctx: {principal, tx}, input)`, called by the `/v1` handlers and by server
// components (#372). Each answers the wire shape of its operation; a row in another organisation, or in a project the
// principal's grant or link doesn't cover, is 404 (NFR-10).

type Ok<Id extends keyof Operations> = Operations[Id] extends {
  responses: { 200: { content: { 'application/json': { schema: z.ZodType<infer T> } } } }
}
  ? T
  : never
export type BundleView = Ok<'listProjectBundles'>['data'][number]
export type BundleDetail = Ok<'getBundle'>
export type CallView = Ok<'listProjectCalls'>['data'][number]
export type CallDetail = Ok<'getCall'>
export type CallExplanation = Ok<'getCallExplanation'>

type BundleRow = typeof bundle.$inferSelect
type CallRow = typeof call.$inferSelect
type RunRow = typeof run.$inferSelect

const tx = (ctx: ServiceContext) => ctx.tx as Tx
const notFound = (what: string) =>
  new ApiError(HTTP_PROBLEM_STATUS['not-found'], 'not-found', `No ${what} with this ID.`)
const at = (date: Date | null) => (date ? instant(date) : null)

/** #79 §1: `can` checks the project against a share link's project and an OAuth grant's `projectIds`. */
export function inScope(principal: Principal, projectId: string) {
  if (principal.kind === 'share_link') return principal.projectId === projectId
  if (principal.kind === 'oauth') return principal.projectIds === 'all' || principal.projectIds.includes(projectId)
  return true
}

/**
 * Whether the principal reads as a member: `can`'s column for it is Owner, Admin, Approver, Editor or Viewer (PRD roles
 * table). That is a signed-in session, an API key or an OAuth grant whose role is one of those. A guest (anonymous, or
 * the `guest` role on any of them), a guest token, a share link and a link-bound grant take the Guest or Share-link
 * reviewer column, so they don't.
 */
export function isMember(principal: Principal) {
  if (principal.kind === 'session' && principal.isGuest) return false
  const role =
    principal.kind === 'session' || principal.kind === 'api_key' || principal.kind === 'oauth' ? principal.role : null
  return role !== null && role !== 'guest'
}

/**
 * A window as the principal may read it: a non-member gets no title (NFR-11) and no `declared_by`, which can name a
 * subscriber who declared by form.
 */
export function windowFor<W extends { title: string; declared_by: string }>(principal: Principal, w: W): W {
  return isMember(principal) ? w : { ...w, title: '', declared_by: '' }
}

export async function visibleProject(ctx: ServiceContext, projectId: string) {
  const [row] = await tx(ctx).select().from(project).where(eq(project.id, projectId))
  if (!row || !inScope(ctx.principal, row.id)) throw notFound('project')
  return row
}

const CallNotice = z.object({ language: z.enum(['en', 'ms']), subject: z.string(), body: z.string() })

/** A stored call as its wire `CallView`; the channel previews (#152) render from it too. */
export function callView(row: CallRow): CallView {
  return {
    id: row.id,
    bundle_id: row.bundleId,
    window_id: row.windowId,
    night_id: row.nightId,
    mode: row.mode,
    watch: row.watch,
    no_call: row.noCall as string[] | null,
    fired: row.fired as CallView['fired'],
    recommendations: row.recommendations as CallView['recommendations'],
    recipients: row.recipients,
    notices: z.array(CallNotice).parse(row.notices),
    reason: row.reason ?? '',
    state: row.state,
    shadow: row.shadow as CallView['shadow'],
    chosen: row.chosen,
    agrees: row.agrees,
    decision: row.decision,
    expires_at: instant(row.expiresAt),
    triggered_at: instant(row.triggeredAt),
    drafted_at: instant(row.draftedAt),
    approved_at: at(row.approvedAt),
    sent_at: at(row.sentAt),
    superseded_by_call_id: row.supersededByCallId,
    // D20: the ICS UID is set when the call is first sent (#154, #158).
    ics_uid: row.icsUid,
    ics_sequence: row.icsSequence
  }
}

/** A call as the principal may read it: a non-member gets no recipients (subscriber IDs), notices or reason. */
function callFor(principal: Principal, view: CallView): CallView {
  return isMember(principal) ? view : { ...view, recipients: [], notices: [], reason: '' }
}

/** A bundle as the principal may read it: calls by `callFor`, missing calls (#499) without recipients or reason. */
function bundleFor(principal: Principal, view: BundleView): BundleView {
  if (isMember(principal)) return view
  return {
    ...view,
    calls: view.calls.map((c) => callFor(principal, c)),
    ...(view.missing ? { missing: view.missing.map((m) => ({ ...m, recipients: [], reason: null })) } : {})
  }
}

/** #499: a stored missing call as its wire `MissingCall`. */
function missingView(m: MissingCall): NonNullable<BundleView['missing']>[number] {
  const r = m.resolution
  return {
    window_id: m.windowId,
    night_id: m.nightId,
    shadow: m.shadow as CallView['shadow'],
    recipients: m.recipients,
    resolution: r?.action ?? null,
    call_id: r?.action === 'drafted' ? r.callId : null,
    reason: r?.action === 'dismissed' ? r.reason : null,
    resolved_by: r && r.action !== 'superseded' ? r.by : null,
    resolved_at: r ? instant(new Date(r.at)) : null,
    superseded_by: r?.action === 'superseded' ? r.bundleId : null
  }
}

/** The bundles' calls, runs and alerts in three queries, so a page of bundles costs no more than one. */
async function bundleViews(ctx: ServiceContext, rows: BundleRow[]): Promise<BundleView[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  // One transaction is one connection: its queries run one after another.
  const calls = await tx(ctx)
    .select()
    .from(call)
    .where(inArray(call.bundleId, ids))
    .orderBy(asc(call.expiresAt), asc(call.id))
  const runs = await tx(ctx)
    .select()
    .from(run)
    .where(inArray(run.id, [...new Set(rows.map((r) => r.runId))]))
  const alerts = await tx(ctx)
    .select()
    .from(bundleAlert)
    .where(inArray(bundleAlert.bundleId, ids))
    .orderBy(asc(bundleAlert.acceptedAt))
  return rows.map((row) => {
    const parent = runs.find((r) => r.id === row.runId)!
    const missing = row.missing as MissingCall[]
    return {
      id: row.id,
      project_id: row.projectId,
      run_id: row.runId,
      pack: row.pack,
      state: row.state,
      superseded_by: row.supersededBy,
      review_hash: row.reviewHash,
      // A closed bundle has no SLA (it needs no review).
      sla_due_at: at(row.slaDueAt),
      needs_review_at: at(row.needsReviewAt),
      approved_by: row.approvedBy,
      escalation_level: row.escalationLevel,
      draft_only: row.draftOnly,
      calls: calls.filter((c) => c.bundleId === row.id).map(callView),
      ...(missing.length ? { missing: missing.map(missingView) } : {}),
      trigger: parent.trigger,
      triggered_at: instant(parent.triggeredAt),
      sheet_version_id: parent.sheetVersionId,
      alerts: alerts
        .filter((a) => a.bundleId === row.id)
        .map((a) => ({ account_id: a.accountId, notified_at: instant(a.acceptedAt), level: a.level }))
    }
  })
}

const Position = z.object({ at: z.iso.datetime(), id: z.string() })
function position(cursor: string | undefined) {
  if (!cursor) return null
  const parsed = Position.safeParse(decodeCursor(cursor))
  if (!parsed.success)
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  return { at: new Date(parsed.data.at), id: parsed.data.id }
}

/** `GET /v1/projects/{id}/bundles`: newest first, by pack and state. */
export async function listProjectBundles(
  ctx: ServiceContext,
  input: { projectId: string; pack?: BundleRow['pack']; state?: BundleRow['state']; limit: number; cursor?: string }
) {
  await visibleProject(ctx, input.projectId)
  const after = position(input.cursor)
  const filters: SQL[] = [eq(bundle.projectId, input.projectId)]
  if (input.pack) filters.push(eq(bundle.pack, input.pack))
  if (input.state) filters.push(eq(bundle.state, input.state))
  if (after) {
    filters.push(or(lt(bundle.createdAt, after.at), and(eq(bundle.createdAt, after.at), lt(bundle.id, after.id)))!)
  }
  const rows = await tx(ctx)
    .select()
    .from(bundle)
    .where(and(...filters))
    .orderBy(desc(bundle.createdAt), desc(bundle.id))
    .limit(input.limit + 1)
  const views = (await bundleViews(ctx, rows)).map((view) => bundleFor(ctx.principal, view))
  return page(views, input.limit, (view) => ({
    at: instant(rows.find((r) => r.id === view.id)!.createdAt),
    id: view.id
  }))
}

async function visibleBundle(ctx: ServiceContext, id: string) {
  const [row] = await tx(ctx).select().from(bundle).where(eq(bundle.id, id))
  if (!row || !inScope(ctx.principal, row.projectId)) throw notFound('bundle')
  return row
}

/**
 * Each call's recipients counted by language (#152's `recipientsByLanguage`, asked only for a call with recipients),
 * and its notices by channel and suppression, in one query for all the calls; in the order given.
 */
async function recipientCounts(ctx: ServiceContext, calls: Array<{ id: string; recipients: string[] }>) {
  const notices = calls.length
    ? await tx(ctx)
        .select({ callId: notice.callId, channel: notice.channel, status: notice.status })
        .from(notice)
        .where(
          and(
            inArray(
              notice.callId,
              calls.map((c) => c.id)
            ),
            eq(notice.kind, 'call')
          )
        )
    : []
  const counts = []
  for (const c of calls) {
    const own = notices.filter((n) => n.callId === c.id)
    counts.push({
      by_language: c.recipients.length ? await recipientsByLanguage(ctx.tx, c.id) : { en: 0, ms: 0 },
      by_channel: {
        email: own.filter((n) => n.channel === 'email').length,
        push: own.filter((n) => n.channel === 'push').length
      },
      suppressed: own.filter((n) => n.status === 'suppressed').length
    })
  }
  return counts
}

// #79 §1 IndicatorValue as #133 stores it in `indicator_snapshot.site`.
const StoredValue = z.object({
  name: z.string(),
  value: z.union([z.number(), z.boolean(), z.string(), z.array(z.number())]).nullable(),
  unit: z.string(),
  state: z.enum(['fresh', 'stale', 'error', 'recovered', 'pending', 'probation', 'off_hours']),
  since: z.string().nullable(),
  ageS: z.number().nullable(),
  sourceIds: z.array(z.string()),
  readingIds: z.array(z.string()),
  observedAt: z.string().nullable()
})

/** CAL-5: "Normal; N inputs fresh" with each fresh input of the run's snapshot and its age at evaluation. */
export async function normalSummary(ctx: ServiceContext, parent: RunRow) {
  if (!parent.snapshotId) return undefined
  const [snapshot] = await tx(ctx)
    .select({ site: indicatorSnapshot.site })
    .from(indicatorSnapshot)
    .where(eq(indicatorSnapshot.id, parent.snapshotId))
  if (!snapshot) return undefined
  const fresh = Object.values(z.record(z.string(), StoredValue).parse(snapshot.site)).filter((v) => v.state === 'fresh')
  const urls = await sourceUrls(
    ctx,
    fresh.flatMap((v) => v.sourceIds)
  )
  return {
    text: `Normal; ${fresh.length} inputs fresh`,
    inputs: fresh.map((v): InputValue => ({
      name: v.name,
      value: v.value,
      unit: v.unit,
      state: v.state,
      since: v.since,
      age_s: v.ageS === null ? null : Math.round(v.ageS),
      source_ids: v.sourceIds,
      source_url: v.sourceIds.map((id) => urls.get(id)).find(Boolean) ?? null,
      reading_ids: v.readingIds,
      observed_at: v.observedAt
    }))
  }
}

async function sourceUrls(ctx: ServiceContext, ids: string[]) {
  const rows = ids.length
    ? await tx(ctx)
        .select({ id: source.id, url: source.url })
        .from(source)
        .where(inArray(source.id, [...new Set(ids)]))
    : []
  return new Map(rows.map((r) => [r.id, r.url]))
}

/**
 * `GET /v1/bundles/{id}`: the bundle with its calls and their recipient counts, alerts, escalations, missing calls
 * and, when every call is Normal (a Watch included) with no No call and none is missing, CAL-5's trace line.
 */
export async function getBundle(ctx: ServiceContext, input: { id: string }): Promise<BundleDetail> {
  const row = await visibleBundle(ctx, input.id)
  const [view] = await bundleViews(ctx, [row])
  const [parent] = await tx(ctx).select().from(run).where(eq(run.id, row.runId))
  const escalations = await tx(ctx)
    .select({ actorId: approval.actorId, at: approval.createdAt })
    .from(approval)
    .where(and(eq(approval.bundleId, row.id), eq(approval.action, 'escalate')))
    .orderBy(asc(approval.createdAt))
  // Counted from the stored recipients, so a non-member's counts match a member's.
  const counts = await recipientCounts(ctx, view!.calls)
  const shown = bundleFor(ctx.principal, view!)
  const calls = shown.calls.map((c, i) => ({ ...c, recipient_counts: counts[i]! }))
  // A missing call (#499) fired, so the bundle isn't all Normal.
  const normal = !shown.missing && calls.every((c) => c.mode === 'normal' && !c.no_call)
  return {
    ...shown,
    calls,
    summary: normal ? await normalSummary(ctx, parent!) : undefined,
    escalations: escalations.map((e) => ({ actor_id: e.actorId, at: instant(e.at) }))
  }
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** `GET /v1/projects/{id}/calls`: newest drafted first, by window, pack, mode, state and local drafting dates. */
export async function listProjectCalls(
  ctx: ServiceContext,
  input: {
    projectId: string
    windowId?: string
    pack?: BundleRow['pack']
    mode?: NonNullable<CallRow['mode']>
    state?: CallRow['state']
    from?: string
    to?: string
    limit: number
    cursor?: string
  }
) {
  const parent = await visibleProject(ctx, input.projectId)
  const after = position(input.cursor)
  const filters: SQL[] = [eq(call.projectId, input.projectId)]
  if (input.windowId) filters.push(eq(call.windowId, input.windowId))
  if (input.pack) filters.push(eq(bundle.pack, input.pack))
  if (input.mode) filters.push(eq(call.mode, input.mode))
  if (input.state) filters.push(eq(call.state, input.state))
  if (input.from) filters.push(gte(call.draftedAt, await startOfLocalDay(tx(ctx), input.from, parent.timeZone)))
  if (input.to) filters.push(lt(call.draftedAt, await startOfLocalDay(tx(ctx), nextDay(input.to), parent.timeZone)))
  if (after) {
    filters.push(or(lt(call.draftedAt, after.at), and(eq(call.draftedAt, after.at), lt(call.id, after.id)))!)
  }
  const rows = await tx(ctx)
    .select({ call })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .where(and(...filters))
    .orderBy(desc(call.draftedAt), desc(call.id))
    .limit(input.limit + 1)
  return page(
    rows.map((r) => callFor(ctx.principal, callView(r.call))),
    input.limit,
    (view) => ({ at: view.drafted_at, id: view.id })
  )
}

async function visibleCall(ctx: ServiceContext, id: string) {
  const [row] = await tx(ctx).select().from(call).where(eq(call.id, id))
  if (!row || !inScope(ctx.principal, row.projectId)) throw notFound('call')
  return row
}

const Content = z.object({
  clauses: z.array(
    z.object({
      key: z.string(),
      when: z.string(),
      wording: z.object({ en: z.string().optional(), ms: z.string().optional() })
    })
  )
})
// The shadow `Verdict` as stored on the call: its clause results, each with the inputs it read.
const ShadowClauses = z.object({
  clauses: z.array(
    z.looseObject({
      key: z.string(),
      inputs: z.array(z.looseObject({ name: z.string(), reading_ids: z.array(z.string()) }))
    })
  )
})
const Warning = z
  .object({
    text_bm: z.string(),
    text_en: z.string(),
    valid_from_utc: z.string().nullable(),
    valid_to_utc: z.string().nullable()
  })
  .loose()
const StepOutput = z.object({ detail: z.string().optional(), inputs: z.array(z.unknown()).optional() }).loose()

/** CAL-13, CAL-16: the clauses as evaluated with their CEL and wording, the inputs read, MET warnings and the trace. */
async function explanation(ctx: ServiceContext, row: CallRow): Promise<CallExplanation> {
  const [parent] = await tx(ctx)
    .select({ run })
    .from(bundle)
    .innerJoin(run, eq(run.id, bundle.runId))
    .where(eq(bundle.id, row.bundleId))
  const r = parent!.run
  const [version] = r.sheetVersionId
    ? await tx(ctx)
        .select({ content: sheetVersion.content })
        .from(sheetVersion)
        .where(eq(sheetVersion.id, r.sheetVersionId))
    : []
  const sheet = version ? Content.parse(version.content).clauses : []
  const shadow = ShadowClauses.parse(row.shadow).clauses
  const clauses = shadow.map((clause) => {
    const pinned = sheet.find((c) => c.key === clause.key)
    if (!pinned) throw new Error(`clause ${clause.key} is not in sheet version ${r.sheetVersionId}`)
    return { ...clause, cel: pinned.when, wording: pinned.wording } as unknown as CallExplanation['clauses'][number]
  })
  const inputs = [
    ...new Map(shadow.flatMap((c) => c.inputs).map((i) => [i.name, i])).values()
  ] as unknown as InputValue[]
  const readingIds = [...new Set(shadow.flatMap((c) => c.inputs.flatMap((i) => i.reading_ids)))]
  const warnings = readingIds.length
    ? await tx(ctx)
        .select({ id: reading.id, valueJson: reading.valueJson })
        .from(reading)
        .where(and(inArray(reading.id, readingIds), eq(reading.metric, 'warning')))
    : []
  const steps = await tx(ctx).select().from(runStep).where(eq(runStep.runId, r.id)).orderBy(asc(runStep.startedAt))
  return {
    call_id: row.id,
    sheet_version_id: r.sheetVersionId ?? '',
    clauses,
    inputs,
    warnings: warnings.flatMap((w) => {
      const value = Warning.parse(w.valueJson)
      if (!value.valid_from_utc || !value.valid_to_utc) return []
      return [
        {
          reading_id: w.id,
          text: value.text_bm,
          gloss: value.text_en,
          valid_from: value.valid_from_utc,
          valid_to: value.valid_to_utc
        }
      ]
    }),
    trace: steps.map((step) => {
      const output = StepOutput.safeParse(step.output ?? {})
      return {
        step: step.step,
        duration_ms: step.finishedAt ? step.finishedAt.getTime() - step.startedAt.getTime() : 0,
        inputs: (output.success ? (output.data.inputs ?? []) : []) as InputValue[],
        detail: output.success && output.data.detail ? output.data.detail : step.status
      }
    })
  }
}

/** `GET /v1/calls/{id}/explanation`. */
export async function getCallExplanation(ctx: ServiceContext, input: { id: string }): Promise<CallExplanation> {
  return explanation(ctx, await visibleCall(ctx, input.id))
}

/**
 * `GET /v1/calls/{id}`: CAL-12's four instants (trigger or crossing, drafted, approved, sent; null until reached), the
 * explanation, window or night (titles for members only), grade, deliveries, recipient counts and the permalink on
 * `origin` (D33's `/c/{id}`).
 */
export async function getCall(ctx: ServiceContext, input: { id: string; origin: string }): Promise<CallDetail> {
  const row = await visibleCall(ctx, input.id)
  const [w] = row.windowId ? await tx(ctx).select().from(window).where(eq(window.id, row.windowId)) : []
  const [n] = row.nightId ? await tx(ctx).select().from(night).where(eq(night.id, row.nightId)) : []
  const [g] = await tx(ctx).select().from(grade).where(eq(grade.callId, row.id)).orderBy(desc(grade.createdAt)).limit(1)
  const [b] = await tx(ctx)
    .select({ approvedBy: bundle.approvedBy, runId: bundle.runId })
    .from(bundle)
    .where(eq(bundle.id, row.bundleId))
  const deliveries = await tx(ctx)
    .select()
    .from(notice)
    .where(and(eq(notice.callId, row.id), eq(notice.kind, 'call')))
    .orderBy(asc(notice.createdAt))
  return {
    ...callFor(ctx.principal, callView(row)),
    ...(await explanation(ctx, row)),
    project_id: row.projectId,
    trace_id: b!.runId,
    window: w
      ? windowFor(ctx.principal, {
          id: w.id,
          project_id: w.projectId,
          starts_at: instant(w.startsAt),
          ends_at: instant(w.endsAt),
          title: w.title,
          kind: w.kind,
          tz: w.tz,
          declared_by: w.declaredBy,
          guest: w.guest,
          via: w.via,
          expires_at: at(w.expiresAt),
          series_id: w.seriesId,
          ics_feed_id: w.icsFeedId,
          cancelled_at: at(w.cancelledAt),
          share_link_id: w.shareLinkId,
          moderation: w.moderation
        })
      : null,
    night: n
      ? {
          id: n.id,
          project_id: n.projectId,
          date: n.date,
          state: n.state,
          doors: at(n.doors)!,
          show: at(n.show)!,
          arrival_start: at(n.arrivalStart)!,
          arrival_end: at(n.arrivalEnd)!,
          exit_start: at(n.exitStart),
          exit_end: at(n.exitEnd)
        }
      : null,
    approved_by: b?.approvedBy ?? null,
    grade: g
      ? {
          id: g.id,
          call_id: g.callId,
          night_id: g.nightId,
          outcome: g.outcome,
          sheet_version_id: g.sheetVersionId,
          pack: g.pack,
          window_id: g.windowId,
          proposed_mode: g.proposedMode,
          observed_mode: g.observedMode,
          mode_diff: g.modeDiff,
          no_call: g.noCall,
          agrees: g.agrees,
          stale_inputs: g.staleInputs
        }
      : null,
    permalink: new URL(`/c/${row.id}`, input.origin).toString(),
    // Each delivery names its recipient, a subscriber, so only members get them.
    deliveries: (isMember(ctx.principal) ? deliveries : []).map((d) => ({
      recipient_id: d.subscriberId ?? d.accountId ?? d.id,
      language: CallNotice.shape.language.parse(d.language),
      status: d.status,
      accepted_at: at(d.acceptedAt)
    })),
    recipient_counts: (await recipientCounts(ctx, [row]))[0]!
  }
}
