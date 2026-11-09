import type { AgentInput, ProposedBundle } from '@skyclause/agent'
import { validate } from '@skyclause/agent/validate'
import { canonicalHash, type Window } from '@skyclause/clauses'
import { HTTP_PROBLEM_STATUS, type Json } from '@skyclause/contracts'
import {
  appendLedger,
  approveGuard,
  bundle,
  call,
  emitEvent,
  expireCall,
  markSending,
  memberReadsMalay,
  night,
  project,
  projectSource,
  queueCallNotices,
  recordApproval,
  recordAudit,
  REVIEW_STATES,
  source,
  track,
  transition,
  window,
  writeCallContent,
  type CallContent,
  type Tx
} from '@skyclause/db'
import { asc, eq, inArray } from 'drizzle-orm'
import { ApiError } from '../../problems'
import type { ServiceContext } from '../../tenancy'
import { callView, getBundle, type BundleDetail } from '../bundles'
import { checkNotices, invalid, plan, shadowContent, type Decision, type Planned } from './content'
import { confirmedToken, recheck, recheckToken, type Recheck } from './recheck'

export { setRecheckPorts, type RecheckPorts } from './recheck'
export type { Decision } from './content'

// #153 c-approval-api: `POST /api/bundles/{id}/approve`, the one place a bundle is approved (TRD "Approval and
// delivery"). One transaction re-checks the inputs (CAL-9), applies the approver's pick, edits and rejections (CAL-4,
// CAL-6, CAL-15, LOC-5) and writes the `approval` rows, ledger entries, audit events, outbox `notice` rows and
// `bundle.approved`. Outcomes that must commit (a re-check's snapshot and `reconfirm`) come back as `problem`.

export interface ApproveInput {
  id: string
  review_hash: string
  reconfirm: boolean
  calls: Decision[]
  now: Date
  /** Where `/c/{id}` permalinks live. */
  origin: string
  /** The Skyclause origins a notice may link to (`validate`). */
  origins: string[]
}

export type ApproveOutcome = { ok: true; bundle: BundleDetail } | { ok: false; problem: ApiError }

type CallRow = typeof call.$inferSelect
type Role = 'owner' | 'admin' | 'approver'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => new ApiError(HTTP_PROBLEM_STATUS['not-found'], 'not-found', 'No bundle with this ID.')

/** Who approves: the route admits only a member session that holds `bundle.approve`. */
function approverOf(ctx: ServiceContext): { accountId: string; role: Role } {
  const p = ctx.principal
  if (p.kind !== 'session' || !p.role || !['owner', 'admin', 'approver'].includes(p.role)) {
    throw new Error('an approval needs the session of an Owner, Admin or Approver')
  }
  return { accountId: p.accountId, role: p.role as Role }
}

/** Every call named once, in this bundle (before `approveGuard`, which throws on a foreign call). */
function checkNamed(decisions: Decision[], calls: CallRow[]) {
  const seen = new Set<string>()
  for (const d of decisions) {
    if (!calls.some((c) => c.id === d.call_id))
      throw invalid(`Call ${d.call_id} is not in this bundle.`, { callId: d.call_id })
    if (seen.has(d.call_id)) throw invalid(`Call ${d.call_id} is decided twice.`, { callId: d.call_id })
    seen.add(d.call_id)
  }
}

/**
 * CAL-4 and CAL-6: one decision per open call (a pick where the agent and the engine disagree), each on a call still
 * drafted; an edit changes wording or removes recipients, and approve and reject carry neither.
 */
function checkDecisions(decisions: Decision[], calls: CallRow[], now: Date) {
  for (const d of decisions) {
    const c = calls.find((row) => row.id === d.call_id)!
    if (c.state !== 'drafted')
      throw invalid(`Call ${c.id} is ${c.state}; only a drafted call is decided.`, { callId: c.id })
    if (d.action !== 'edit' && (d.notices || d.recipients)) {
      throw invalid(`Only an edit changes the wording or recipients of call ${c.id}.`, { callId: c.id })
    }
    if (d.action === 'edit' && !d.notices?.length && !d.recipients) {
      throw invalid(`The edit of call ${c.id} changes nothing.`, { callId: c.id })
    }
    const removable = new Set(c.recipients)
    if (d.recipients?.some((id) => !removable.has(id))) {
      throw invalid(`An edit only removes recipients of call ${c.id}.`, { callId: c.id })
    }
    if (d.action !== 'reject' && !c.agrees && !d.chosen) {
      throw invalid(`Call ${c.id}'s agent and engine disagree: pick one.`, { callId: c.id })
    }
  }
  const undecided = calls.filter(
    (c) => c.state === 'drafted' && c.expiresAt > now && !decisions.some((d) => d.call_id === c.id)
  )
  if (undecided.length) {
    throw invalid(`Decide every call: ${undecided.map((c) => c.id).join(', ')}.`, { callId: undecided[0]!.id })
  }
}

/** The bundle's windows as the engine reads them, and each call's span for its notice (D32: never its title). */
async function spans(tx: Tx, calls: CallRow[], timeZone: string) {
  const windowIds = calls.flatMap((c) => (c.windowId ? [c.windowId] : []))
  const nightIds = calls.flatMap((c) => (c.nightId ? [c.nightId] : []))
  const windows = windowIds.length ? await tx.select().from(window).where(inArray(window.id, windowIds)) : []
  const nights = nightIds.length ? await tx.select().from(night).where(inArray(night.id, nightIds)) : []
  const engine: Window[] = windows.map((w) => ({
    id: w.id,
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
    kind: w.kind,
    tz: timeZone
  }))
  const spanOf = (c: CallRow) => {
    const w = windows.find((row) => row.id === c.windowId)
    if (w) return { startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() }
    const n = nights.find((row) => row.id === c.nightId)
    return n?.arrivalStart && n.exitEnd
      ? { startsAt: n.arrivalStart.toISOString(), endsAt: n.exitEnd.toISOString() }
      : undefined
  }
  return { engine, spanOf }
}

/** The sources the calls' verdicts cite, for attributions, `{….station}` and wire `source_url`s. */
async function citedSources(tx: Tx, calls: CallRow[]) {
  const ids = [
    ...new Set(
      calls.flatMap((c) =>
        (c.shadow as CallView['shadow']).clauses.flatMap((cl) => cl.inputs.flatMap((i) => i.source_ids))
      )
    )
  ].filter((id) => UUID.test(id))
  const rows = ids.length ? await tx.select().from(source).where(inArray(source.id, ids)) : []
  return new Map(rows.map((r) => [r.id, r]))
}

type CallView = ReturnType<typeof callView>

/** D23: `validate` reruns on the approved agent calls against the confirmed snapshot. */
async function revalidate(
  tx: Tx,
  o: {
    recheck: Recheck
    approved: Array<{ row: CallRow; planned: Planned }>
    pack: 'sky' | 'crowd'
    projectId: string
    readsMalay: boolean
    origins: string[]
  }
) {
  const agent = o.approved.filter((a) => a.planned.view.chosen !== 'shadow')
  if (!agent.length) return { ok: true as const }
  const scopeOf = (row: CallRow) => (row.windowId ?? row.nightId)!
  const { snapshot, sheet } = o.recheck
  const bound = await tx
    .select({ url: source.url })
    .from(projectSource)
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(eq(projectSource.projectId, o.projectId))
  const windows = await tx
    .select()
    .from(window)
    .where(
      inArray(
        window.id,
        agent.flatMap((a) => (a.row.windowId ? [a.row.windowId] : []))
      )
    )
  const proposed: ProposedBundle = {
    pack: o.pack,
    calls: agent.map(({ row, planned: { view } }) => ({
      window_id: scopeOf(row),
      mode: view.mode,
      watch: view.watch,
      no_call: view.no_call,
      fired: view.fired,
      recommendations: view.recommendations,
      recipients: view.recipients,
      notices: view.notices,
      reason: view.reason
    })),
    items: []
  }
  return validate(proposed, {
    pack: o.pack,
    sheet: {
      pack: sheet.pack,
      clauses: sheet.clauses.filter((c) => c.enabled).map((c) => ({ key: c.key, when: c.when, wording: c.wording }))
    },
    snapshot: snapshot as AgentInput['snapshot'],
    met_warnings: [],
    windows: windows.map((w) => ({ id: w.id, starts_at: w.startsAt.toISOString(), ends_at: w.endsAt.toISOString() })),
    // The drafted recipients were the run's candidates; an edit only removes some.
    candidates: Object.fromEntries(
      agent.map(({ row }) => [scopeOf(row), row.recipients.map((id) => ({ id, language: 'en' as const }))])
    ),
    yesterday_grades: [],
    quotable: [],
    malay_reader: o.readsMalay,
    source_urls: [...new Set(bound.map((b) => b.url))],
    origins: o.origins
  })
}

export async function approveBundle(ctx: ServiceContext, input: ApproveInput): Promise<ApproveOutcome> {
  const tx = ctx.tx as Tx
  const { accountId, role } = approverOf(ctx)
  const { now } = input
  if (!UUID.test(input.id)) throw notFound()
  const [b] = await tx.select().from(bundle).where(eq(bundle.id, input.id))
  if (!b) throw notFound()
  const calls = await tx.select().from(call).where(eq(call.bundleId, b.id)).orderBy(asc(call.expiresAt), asc(call.id))
  checkNamed(input.calls, calls)

  // CAL-7, CAL-8: a superseded bundle or call, or an expired one asked for, is refused under the bundle's lock.
  const guard = await approveGuard(
    tx,
    b.id,
    input.calls.map((d) => d.call_id),
    now
  )
  if (!guard.ok && guard.problem === 'bundle-superseded') {
    throw new ApiError(409, 'bundle-superseded', 'A newer bundle covers these calls; review it instead.', {
      superseded_by_call_id: guard.successor.callIds[0],
      successor_bundle_id: guard.successor.bundleId
    })
  }
  if (!guard.ok) {
    throw new ApiError(409, 'call-expired', 'A call expired before it was approved; reload the bundle.', {
      call_id: guard.callIds[0],
      call_ids: guard.callIds
    })
  }
  // D23, GST-5: a guest window's draft never sends.
  if (b.draftOnly || !REVIEW_STATES.includes(b.state)) {
    throw invalid(
      `This bundle is ${b.draftOnly ? 'a draft that never sends' : b.state}; it isn't waiting for approval.`
    )
  }
  checkDecisions(input.calls, calls, now)

  const [p] = await tx.select().from(project).where(eq(project.id, b.projectId))
  const { engine, spanOf } = await spans(tx, calls, p!.timeZone)
  const sources = await citedSources(tx, calls)
  const urls = new Map([...sources].map(([id, s]) => [id, s.url]))

  // CAL-9: compare what the run saw with a fresh snapshot.
  const checked = await recheck(tx, { bundle: b, calls, windows: engine, urls, now })
  const confirmed = input.reconfirm ? await confirmedToken(tx, b, input.review_hash, checked) : null
  const changed = checked.changedInputs.length > 0 || checked.changedVerdicts.length > 0
  if (!confirmed && (changed || input.review_hash !== b.reviewHash)) {
    if (b.state === 'needs_review') await transition(tx, b.id, { bundle: 'reconfirm' }, now)
    return {
      ok: false,
      problem: new ApiError(
        409,
        'inputs-changed',
        'Inputs changed since drafting; review the difference and confirm.',
        {
          review_hash: recheckToken(checked),
          changed_inputs: checked.changedInputs,
          changed_verdicts: checked.changedVerdicts
        }
      )
    }
  }

  // Per call: the pick, the edit and LOC-5, then the rendered notices' checks (CAL-15).
  const readsMalay = await memberReadsMalay(tx, accountId)
  const stations = new Map([...sources].map(([id, s]) => [id, s.externalId]))
  const approved: Array<{ row: CallRow; decision: Decision; planned: Planned }> = []
  for (const decision of input.calls) {
    if (decision.action === 'reject') continue
    const row = calls.find((c) => c.id === decision.call_id)!
    const shadow =
      decision.chosen === 'shadow'
        ? shadowContent(row.id, checked.verdicts.get(row.id)!, { ...checked, stations })
        : undefined
    const planned = plan(callView(row), decision, { shadow, readsMalay })
    const window = spanOf(row)
    const cited = [...new Set(planned.view.shadow.clauses.flatMap((c) => c.inputs.flatMap((i) => i.source_ids)))]
    checkNotices(planned.view, {
      permalink: `${input.origin}/c/${row.id}`,
      approver: { role, at: now.toISOString() },
      project: { name: p!.name },
      ...(window ? { window } : {}),
      sources: cited.flatMap((id) => {
        const s = sources.get(id)
        return s ? [{ name: s.name, licence: s.licenceLabel }] : []
      })
    })
    approved.push({ row, decision, planned })
  }

  // CAL-9 confirmed: record it, then D23's `validate` against the confirmed snapshot.
  if (confirmed) {
    await recordApproval(tx, {
      projectId: b.projectId,
      bundleId: b.id,
      actorId: accountId,
      action: 'reconfirm',
      diff: {
        confirmed_snapshot_id: confirmed.snapshotId,
        snapshot_id: checked.snapshotId,
        changed_inputs: checked.changedInputs,
        changed_verdicts: checked.changedVerdicts
      } as unknown as Json,
      at: now
    })
    const validation = await revalidate(tx, {
      recheck: checked,
      approved,
      pack: b.pack,
      projectId: b.projectId,
      readsMalay,
      origins: input.origins
    })
    if (!validation.ok) {
      return {
        ok: false,
        problem: new ApiError(422, 'redraft-required', 'The calls no longer pass validation; request a new run.', {
          reasons: validation.reasons
        })
      }
    }
  }

  const rejected = input.calls.filter((d) => d.action === 'reject').map((d) => calls.find((c) => c.id === d.call_id)!)
  return {
    ok: true,
    bundle: await commit(ctx, { b, calls, approved, rejected, accountId, role, confirmed: !!confirmed, now })
  }
}

async function commit(
  ctx: ServiceContext,
  o: {
    b: typeof bundle.$inferSelect
    calls: CallRow[]
    approved: Array<{ row: CallRow; decision: Decision; planned: Planned }>
    rejected: CallRow[]
    accountId: string
    role: Role
    confirmed: boolean
    now: Date
  }
) {
  const tx = ctx.tx as Tx
  const { b, calls, approved, rejected, accountId, role, now } = o
  const decided = new Set([...approved.map((a) => a.row.id), ...rejected.map((c) => c.id)])
  const sending = approved.map((a) => a.row.id)

  for (const { row, decision, planned } of approved) {
    await writeCallContent(tx, row.id, planned.content, now)
    if (decision.chosen === 'shadow') {
      await recordApproval(tx, {
        projectId: b.projectId,
        bundleId: b.id,
        callId: row.id,
        actorId: accountId,
        action: 'choose_verdict',
        diff: { before: agentContent(row), after: planned.content } as unknown as Json,
        at: now
      })
    }
  }
  // CAL-8: a call left undecided because its time passed expires now, so the bundle can be approved.
  for (const c of calls) {
    if (c.state === 'drafted' && !decided.has(c.id) && c.expiresAt <= now) {
      await expireCall(tx, c.id, now)
    }
  }
  await transition(
    tx,
    b.id,
    {
      bundle: 'approved',
      calls: Object.fromEntries([
        ...approved.map((a) => [a.row.id, a.decision.action === 'edit' ? 'edited' : 'approved'] as const),
        ...rejected.map((c) => [c.id, 'rejected'] as const)
      ]),
      approvedBy: accountId
    },
    now
  )
  // An all-rejected bundle has nothing to send and stays approved.
  if (sending.length) await markSending(tx, b.id, sending, now)

  for (const c of calls) {
    const a = approved.find((x) => x.row.id === c.id)
    const isRejected = rejected.includes(c)
    if (!a && !isRejected) continue
    const counts = a
      ? await queueCallNotices(tx, {
          projectId: b.projectId,
          bundleId: b.id,
          callId: c.id,
          recipients: a.planned.view.recipients,
          languages: a.planned.view.notices.map((n) => n.language)
        })
      : null
    const action = a ? a.decision.action : 'reject'
    await recordApproval(tx, {
      projectId: b.projectId,
      bundleId: b.id,
      callId: c.id,
      actorId: accountId,
      action,
      diff: a ? (approvalDiff(c, a.planned) as unknown as Json) : null,
      at: now
    })
    await appendLedger(tx, {
      projectId: b.projectId,
      kind: action === 'edit' ? 'call_edited' : action === 'reject' ? 'call_rejected' : 'call_approved',
      refs: {
        call_id: c.id,
        bundle_id: b.id,
        ...(c.windowId ? { window_id: c.windowId } : {}),
        ...(c.nightId ? { night_id: c.nightId } : {})
      },
      body: {
        pack: b.pack,
        mode: a ? a.planned.view.mode : c.mode,
        watch: a ? a.planned.view.watch : c.watch,
        approver_role: role,
        ...(a
          ? {
              chosen: a.planned.view.chosen,
              notices: counts,
              ...(a.planned.fallback ? { language_fallback: 'en' } : {})
            }
          : {})
      }
    })
    if (a?.decision.action === 'edit') {
      await recordAudit(tx, {
        action: 'call.edited',
        target: { type: 'call', id: c.id },
        projectId: b.projectId,
        after: {
          wording: (a.decision.notices ?? []).map((n) => n.language),
          recipients_removed: c.recipients.length - a.planned.view.recipients.length
        }
      })
    }
    if (isRejected) {
      await recordAudit(tx, { action: 'call.rejected', target: { type: 'call', id: c.id }, projectId: b.projectId })
    }
  }

  const rejectedIds = rejected.map((c) => c.id)
  await recordAudit(tx, {
    action: 'bundle.approved',
    target: { type: 'bundle', id: b.id },
    projectId: b.projectId,
    after: {
      sending_call_ids: sending,
      rejected_call_ids: rejectedIds,
      edited_call_ids: approved.filter((a) => a.decision.action === 'edit').map((a) => a.row.id),
      reconfirmed: o.confirmed
    }
  })
  await emitEvent(tx, {
    projectId: b.projectId,
    type: 'bundle.approved',
    data: {
      bundle_id: b.id,
      pack: b.pack,
      state: 'approved',
      call_ids: calls.map((c) => c.id),
      sla_due_at: b.slaDueAt?.toISOString() ?? null,
      sending_call_ids: sending,
      rejected_call_ids: rejectedIds
    }
  })
  await track(
    tx,
    'bundle_approved',
    {
      pack: b.pack,
      minutes_to_approve: Math.round((now.getTime() - (b.needsReviewAt ?? b.createdAt).getTime()) / 60_000),
      edited: approved.some((a) => a.decision.action === 'edit'),
      rejected: rejectedIds.length > 0,
      recheck_changed: o.confirmed
    },
    { projectId: b.projectId }
  )
  return getBundle(ctx, { id: b.id })
}

/** The agent's call, kept on a shadow pick's `choose_verdict` row. */
function agentContent(row: CallRow): CallContent {
  return {
    chosen: 'agent',
    mode: row.mode,
    watch: row.watch,
    noCall: row.noCall as string[] | null,
    recommendations: row.recommendations,
    fired: row.fired as CallContent['fired'],
    notices: row.notices as CallContent['notices']
  }
}

/** An approve or edit row's diff: the wording and recipients before and after, and LOC-5's fallback. */
function approvalDiff(row: CallRow, planned: Planned) {
  const removed = row.recipients.filter((id) => !planned.view.recipients.includes(id))
  return {
    chosen: planned.view.chosen,
    ...(removed.length ? { recipients_removed: removed } : {}),
    ...(canonicalHash(row.notices) !== canonicalHash(planned.view.notices)
      ? { notices: { before: row.notices, after: planned.view.notices } }
      : {}),
    ...(planned.fallback ? { language_fallback: { to: 'en', reason: 'malay-reader-required' } } : {})
  }
}
