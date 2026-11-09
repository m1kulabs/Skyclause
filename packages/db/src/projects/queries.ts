import type {
  BlockedInput,
  Bundle as WireBundle,
  CallView as WireCallView,
  InputState,
  Mode,
  Night as WireNight,
  Pack,
  PackState,
  TxHandle
} from '@skyclause/contracts'
import { and, asc, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm'
import type { Tx } from '../client'
import {
  bundle,
  call,
  night,
  project,
  projectPack,
  projectSource,
  rotaShift,
  shadowState,
  sourceState,
  window as windowTable
} from '../schema'

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALL_PACKS: readonly Pack[] = ['sky', 'crowd']
const IN_FORCE_CALL_STATES = ['approved', 'edited', 'sending', 'sent'] as const
const MODE_RANK: Record<Mode, number> = {
  normal: 1,
  outdoor_limited: 2,
  commute_disruption: 3,
  hybrid_recommended: 4,
  surge_night: 4
}
const SIGNAL_HEALTH_PRIORITY: Record<InputState, number> = {
  error: 7,
  stale: 6,
  probation: 5,
  pending: 4,
  recovered: 3,
  fresh: 2,
  off_hours: 1
}

export function normalizeTime(value: string | null): string | null {
  if (value === null) return null
  return value.replace(/^(\d{2}:\d{2}):00$/, '$1')
}

export function normalizeProjectRow<T extends typeof project.$inferSelect>(row: T): T {
  return {
    ...row,
    cameraDayStart: normalizeTime(row.cameraDayStart),
    cameraDayEnd: normalizeTime(row.cameraDayEnd)
  }
}

function sortPacks<T extends { pack: Pack }>(rows: T[]): T[] {
  const order: Record<Pack, number> = { sky: 0, crowd: 1 }
  return [...rows].sort((a, b) => order[a.pack] - order[b.pack])
}

export async function getProjectRecord(handle: TxHandle, projectId: string) {
  if (!UUID_REGEX.test(projectId)) return null
  const tx = handle as Tx
  if (typeof (tx as Partial<Tx>).select !== 'function') return null
  const [row] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!row) return null
  const packs = await tx.select().from(projectPack).where(eq(projectPack.projectId, projectId))
  return {
    project: normalizeProjectRow(row),
    packs: sortPacks(packs)
  }
}

export async function getProjectSettingsRecord(handle: TxHandle, projectId: string) {
  const base = await getProjectRecord(handle, projectId)
  if (!base) return null
  const tx = handle as Tx
  const shifts = await tx
    .select()
    .from(rotaShift)
    .where(eq(rotaShift.projectId, projectId))
    .orderBy(asc(rotaShift.order), asc(rotaShift.id))
  const rotaOverride =
    shifts.length === 0
      ? null
      : shifts.map((s) => ({
          account_id: s.accountId,
          days: s.days.map(String),
          local_start: normalizeTime(s.localStart) ?? s.localStart,
          local_end: normalizeTime(s.localEnd) ?? s.localEnd,
          condition: s.condition,
          order: s.order,
          template: s.template
        }))
  return {
    ...base,
    rotaOverride
  }
}

export interface ListProjectRecordsQuery {
  slug?: string
  projectIds?: string[]
  limit: number
  cursor?: { createdAt: Date; id: string } | null
}

export async function listProjectRecords(handle: TxHandle, query: ListProjectRecordsQuery) {
  const tx = handle as Tx
  if (typeof (tx as Partial<Tx>).select !== 'function') return []
  if (query.projectIds && query.projectIds.length === 0) {
    return []
  }

  const filters: SQL[] = []
  if (query.slug !== undefined) {
    filters.push(eq(project.slug, query.slug))
  }
  if (query.projectIds !== undefined) {
    const validIds = query.projectIds.filter((id) => UUID_REGEX.test(id))
    if (validIds.length === 0) return []
    filters.push(inArray(project.id, validIds))
  }
  if (query.cursor) {
    filters.push(
      or(
        lt(project.createdAt, query.cursor.createdAt),
        and(eq(project.createdAt, query.cursor.createdAt), lt(project.id, query.cursor.id))
      )!
    )
  }

  const rows = await tx
    .select()
    .from(project)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(project.createdAt), desc(project.id))
    .limit(query.limit + 1)

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const packs = await tx.select().from(projectPack).where(inArray(projectPack.projectId, ids))

  return rows.map((r) => ({
    project: normalizeProjectRow(r),
    packs: sortPacks(packs.filter((p) => p.projectId === r.id))
  }))
}

function toIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function toIsoOrNull(d: Date | null): string | null {
  return d ? toIso(d) : null
}

function extractShadowSpanEnd(shadow: unknown): Date | null {
  if (!shadow || typeof shadow !== 'object') return null
  const clauses = (shadow as { clauses?: unknown }).clauses
  if (!Array.isArray(clauses)) return null
  let maxEnd: Date | null = null
  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object') continue
    const span = (clause as { span?: { to?: unknown } }).span
    if (span && typeof span.to === 'string') {
      const parsed = new Date(span.to)
      if (!Number.isNaN(parsed.getTime()) && (!maxEnd || parsed > maxEnd)) {
        maxEnd = parsed
      }
    }
  }
  return maxEnd
}

function extractVerdictNoCall(verdict: unknown): { inputs: BlockedInput[] } | null {
  if (!verdict || typeof verdict !== 'object') return null
  const noCall = (verdict as { no_call?: unknown }).no_call
  if (!noCall || typeof noCall !== 'object') return null
  const inputs = (noCall as { inputs?: unknown }).inputs
  if (!Array.isArray(inputs)) return null
  return { inputs: inputs as BlockedInput[] }
}

function extractCallNoCall(callRow: typeof call.$inferSelect): { inputs: BlockedInput[] } | null {
  const fromShadow = extractVerdictNoCall(callRow.shadow)
  if (fromShadow) return fromShadow
  if (Array.isArray(callRow.noCall) && callRow.noCall.length > 0) {
    return {
      inputs: callRow.noCall.map((name) => ({
        name: String(name),
        source_id: null,
        state: 'stale' as const,
        since: toIso(callRow.triggeredAt)
      }))
    }
  }
  return null
}

function serializeCall(row: typeof call.$inferSelect): WireCallView {
  const notices = Array.isArray(row.notices)
    ? (row.notices as Array<{ language: 'en' | 'ms'; subject: string; body: string }>)
    : []
  const shadow =
    row.shadow && typeof row.shadow === 'object' && 'scope' in (row.shadow as Record<string, unknown>)
      ? (row.shadow as WireCallView['shadow'])
      : {
          scope: row.windowId
            ? { kind: 'window' as const, id: row.windowId }
            : row.nightId
              ? { kind: 'night' as const, id: row.nightId }
              : { kind: 'site' as const, id: null },
          pack: 'sky' as const,
          mode: row.mode,
          watch: row.watch,
          no_call: extractVerdictNoCall(row.shadow),
          recommendations: (row.recommendations ?? []) as WireCallView['recommendations'],
          clauses: [],
          open_from: null
        }

  return {
    id: row.id,
    bundle_id: row.bundleId,
    window_id: row.windowId,
    night_id: row.nightId,
    mode: row.mode,
    watch: row.watch,
    no_call: (row.noCall as string[] | null) ?? null,
    fired: (row.fired as WireCallView['fired']) ?? [],
    recommendations: (row.recommendations as WireCallView['recommendations']) ?? [],
    recipients: row.recipients,
    notices,
    reason: row.reason ?? '',
    state: row.state,
    shadow,
    chosen: row.chosen,
    agrees: row.agrees,
    decision: row.decision,
    expires_at: toIso(row.expiresAt),
    triggered_at: toIso(row.triggeredAt),
    drafted_at: toIso(row.draftedAt),
    approved_at: toIsoOrNull(row.approvedAt),
    sent_at: toIsoOrNull(row.sentAt),
    superseded_by_call_id: row.supersededByCallId,
    ics_uid: row.icsUid,
    ics_sequence: row.icsSequence
  }
}

export async function getProjectSummaryRecord(handle: TxHandle, projectId: string, now: Date = new Date()) {
  const tx = handle as Tx

  const windows = await tx.select().from(windowTable).where(eq(windowTable.projectId, projectId))
  const windowById = new Map(windows.map((w) => [w.id, w]))

  const nights = await tx
    .select()
    .from(night)
    .where(eq(night.projectId, projectId))
    .orderBy(asc(night.date), asc(night.id))
  const nightById = new Map(nights.map((n) => [n.id, n]))

  const bundles = await tx
    .select()
    .from(bundle)
    .where(eq(bundle.projectId, projectId))
    .orderBy(desc(bundle.createdAt), desc(bundle.id))
  const bundleById = new Map(bundles.map((b) => [b.id, b]))

  const calls =
    bundles.length > 0
      ? await tx
          .select()
          .from(call)
          .where(
            inArray(
              call.bundleId,
              bundles.map((b) => b.id)
            )
          )
          .orderBy(asc(call.expiresAt), asc(call.id))
      : []

  const shadows = await tx.select().from(shadowState).where(eq(shadowState.projectId, projectId))

  function isCallInForce(c: typeof call.$inferSelect): boolean {
    if (!(IN_FORCE_CALL_STATES as readonly string[]).includes(c.state)) return false
    if (c.supersededByCallId !== null) return false

    if (c.windowId !== null) {
      const win = windowById.get(c.windowId)
      if (!win || win.cancelledAt !== null) return false
      const spanEnd = extractShadowSpanEnd(c.shadow)
      const effectiveEnd = spanEnd && spanEnd > win.endsAt ? spanEnd : win.endsAt
      return effectiveEnd > now
    }

    if (c.nightId !== null) {
      const n = nightById.get(c.nightId)
      if (!n || n.state === 'unlisted') return false
      const effectiveEnd = n.exitEnd ?? n.arrivalEnd ?? c.expiresAt
      return effectiveEnd > now
    }

    return c.expiresAt > now
  }

  function compareModes(
    a: { mode: Mode | null; watch: boolean; at: Date },
    b: { mode: Mode | null; watch: boolean; at: Date }
  ): number {
    const rankA = a.mode ? MODE_RANK[a.mode] : 0
    const rankB = b.mode ? MODE_RANK[b.mode] : 0
    if (rankA !== rankB) return rankB - rankA
    if (a.watch !== b.watch) return a.watch ? -1 : 1
    return b.at.getTime() - a.at.getTime()
  }

  const inForceCalls = calls.filter(isCallInForce)

  const packStates: PackState[] = ALL_PACKS.map((pack) => {
    const packInForce = inForceCalls.filter((c) => bundleById.get(c.bundleId)?.pack === pack)
    if (packInForce.length > 0) {
      const sorted = [...packInForce].sort((a, b) =>
        compareModes(
          { mode: a.mode, watch: a.watch, at: a.approvedAt ?? a.sentAt ?? a.createdAt },
          { mode: b.mode, watch: b.watch, at: b.approvedAt ?? b.sentAt ?? b.createdAt }
        )
      )
      const winner = sorted[0]!
      return {
        pack,
        basis: 'approved_call',
        call_id: winner.id,
        mode: winner.mode,
        watch: winner.watch,
        no_call: extractCallNoCall(winner)
      }
    }

    const activeShadows = shadows.filter((s) => {
      if (s.pack !== pack) return false
      if (s.scopeKind === 'window' && s.scopeId) {
        const win = windowById.get(s.scopeId)
        if (!win || win.cancelledAt !== null || win.endsAt <= now) return false
      }
      if (s.scopeKind === 'night' && s.scopeId) {
        const n = nightById.get(s.scopeId)
        if (!n || n.state === 'unlisted') return false
        const end = n.exitEnd ?? n.arrivalEnd
        if (end && end <= now) return false
      }
      return true
    })

    if (activeShadows.length > 0) {
      const parsed = activeShadows.map((s) => {
        const v = (s.verdict ?? {}) as { mode?: Mode | null; watch?: boolean }
        const mode = v.mode && v.mode in MODE_RANK ? v.mode : null
        return { row: s, mode, watch: Boolean(v.watch), noCall: extractVerdictNoCall(s.verdict) }
      })
      parsed.sort((a, b) =>
        compareModes(
          { mode: a.mode, watch: a.watch, at: a.row.updatedAt },
          { mode: b.mode, watch: b.watch, at: b.row.updatedAt }
        )
      )
      const winner = parsed[0]!
      return {
        pack,
        basis: 'engine_verdict',
        call_id: null,
        mode: winner.mode,
        watch: winner.watch,
        no_call: winner.noCall
      }
    }

    return {
      pack,
      basis: null,
      call_id: null,
      mode: null,
      watch: false,
      no_call: null
    }
  })

  const activeWindows = windows.filter((w) => w.cancelledAt === null && w.endsAt > now)
  const atRiskWindowIds = new Set<string>()
  for (const w of activeWindows) {
    const winCalls = inForceCalls.filter((c) => c.windowId === w.id)
    if (winCalls.some((c) => (c.mode !== null && c.mode !== 'normal') || c.watch)) {
      atRiskWindowIds.add(w.id)
      continue
    }
    const winShadows = shadows.filter((s) => s.scopeKind === 'window' && s.scopeId === w.id)
    for (const s of winShadows) {
      const v = (s.verdict ?? {}) as { mode?: Mode | null; watch?: boolean }
      if ((v.mode && v.mode !== 'normal') || Boolean(v.watch) || extractVerdictNoCall(s.verdict) !== null) {
        atRiskWindowIds.add(w.id)
        break
      }
    }
  }

  const boundSources = await tx.select().from(projectSource).where(eq(projectSource.projectId, projectId))
  const sourceStates =
    boundSources.length > 0
      ? await tx
          .select()
          .from(sourceState)
          .where(
            inArray(
              sourceState.sourceId,
              boundSources.map((b) => b.sourceId)
            )
          )
      : []
  const stateBySourceId = new Map(sourceStates.map((s) => [s.sourceId, s]))

  let signalState: InputState = 'pending'
  let inputsReporting = 0
  let oldestAgeS: number | null = null

  if (boundSources.length > 0) {
    let bestPriority = -1
    for (const bound of boundSources) {
      const st = stateBySourceId.get(bound.sourceId)
      const currentState: InputState = st?.state ?? 'pending'
      if (currentState === 'fresh' || currentState === 'recovered') {
        inputsReporting += 1
      }
      if (st) {
        const ageS = Math.max(0, Math.floor((now.getTime() - st.since.getTime()) / 1000))
        if (oldestAgeS === null || ageS > oldestAgeS) {
          oldestAgeS = ageS
        }
      }
      const prio = SIGNAL_HEALTH_PRIORITY[currentState]
      if (prio > bestPriority) {
        bestPriority = prio
        signalState = currentState
      }
    }
  }

  const latestBundleRow = bundles[0] ?? null
  const latestBundle: WireBundle | null = latestBundleRow
    ? {
        id: latestBundleRow.id,
        project_id: latestBundleRow.projectId,
        run_id: latestBundleRow.runId,
        pack: latestBundleRow.pack,
        state: latestBundleRow.state,
        superseded_by: latestBundleRow.supersededBy,
        review_hash: latestBundleRow.reviewHash,
        sla_due_at: toIsoOrNull(latestBundleRow.slaDueAt),
        needs_review_at: toIsoOrNull(latestBundleRow.needsReviewAt),
        approved_by: latestBundleRow.approvedBy,
        escalation_level: latestBundleRow.escalationLevel,
        draft_only: latestBundleRow.draftOnly,
        calls: calls.filter((c) => c.bundleId === latestBundleRow.id).map(serializeCall)
      }
    : null

  const candidateNight = nights.find(
    (n) =>
      (n.state === 'upcoming' || n.state === 'in_progress') &&
      n.doors !== null &&
      n.show !== null &&
      n.arrivalStart !== null &&
      n.arrivalEnd !== null &&
      (n.exitEnd ?? n.arrivalEnd) >= now
  )
  const nextNight: WireNight | null = candidateNight
    ? {
        id: candidateNight.id,
        project_id: candidateNight.projectId,
        date: candidateNight.date,
        state: candidateNight.state,
        doors: toIso(candidateNight.doors!),
        show: toIso(candidateNight.show!),
        arrival_start: toIso(candidateNight.arrivalStart!),
        arrival_end: toIso(candidateNight.arrivalEnd!),
        exit_start: toIsoOrNull(candidateNight.exitStart),
        exit_end: toIsoOrNull(candidateNight.exitEnd)
      }
    : null

  const nonCancelledWindows = await tx
    .select({ id: windowTable.id })
    .from(windowTable)
    .where(and(eq(windowTable.projectId, projectId), isNull(windowTable.cancelledAt)))
    .limit(1)

  const nextAction: 'bind_source' | 'declare_window' | null =
    boundSources.length === 0 ? 'bind_source' : nonCancelledWindows.length === 0 ? 'declare_window' : null

  return {
    pack_states: packStates,
    windows_at_risk: atRiskWindowIds.size,
    signal_health: {
      state: signalState,
      inputs_reporting: inputsReporting,
      oldest_age_s: oldestAgeS
    },
    latest_bundle: latestBundle,
    next_night: nextNight,
    next_storm_date: null,
    next_action: nextAction
  }
}
