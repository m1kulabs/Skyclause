import { Verdict } from '@skyclause/contracts'
import { z } from 'zod'
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
import { and, asc, desc, eq, inArray, isNull, lt, lte, max, or, sql, type SQL } from 'drizzle-orm'
import type { Tx } from '../client'
import { reading, poll } from '../schema/partitioned'
import {
  bundle,
  call,
  night,
  project,
  projectPack,
  projectSource,
  source,
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

function persistedVerdict(value: unknown, pack: Pack, kind: string, scopeId: string | null, label: string): Verdict {
  const parsed = Verdict.safeParse(value)
  if (
    !parsed.success ||
    parsed.data.pack !== pack ||
    parsed.data.scope.kind !== kind ||
    parsed.data.scope.id !== scopeId
  ) {
    throw new Error(`Invalid persisted ${label}`)
  }
  return parsed.data
}

function requiredBlockers(verdict: Verdict): BlockedInput[] {
  // A not_open clause never blocks. Only actual required-input failures are overlaid.
  return verdict.clauses.length > 0
    ? verdict.clauses.filter((c) => c.result === 'blocked').flatMap((c) => c.blocked_by)
    : (verdict.no_call?.inputs ?? [])
}

function noCall(inputs: BlockedInput[]): { inputs: BlockedInput[] } | null {
  const unique = new Map(
    inputs.map((input) => [JSON.stringify([input.name, input.source_id, input.state, input.since]), input])
  )
  return unique.size ? { inputs: [...unique.values()] } : null
}

// Read projection of #122's forecast_day value_json contract. db cannot depend on sources (§1).
const ForecastDay = z.object({
  date: z.iso.date(),
  afternoon_forecast: z.string(),
  gloss_en: z.record(z.string(), z.string())
})

function serializeCall(row: typeof call.$inferSelect, shadow: Verdict): WireCallView {
  const notices = Array.isArray(row.notices)
    ? (row.notices as Array<{ language: 'en' | 'ms'; subject: string; body: string }>)
    : []

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
  const [calendar] = await tx
    .select({
      today: sql<string>`to_char(${now.toISOString()}::timestamptz AT TIME ZONE ${project.timeZone}, 'YYYY-MM-DD')`,
      dayEnd:
        sql<string>`(date_trunc('day', ${now.toISOString()}::timestamptz AT TIME ZONE ${project.timeZone}) + interval '1 day') AT TIME ZONE ${project.timeZone}`.mapWith(
          (value) => new Date(value)
        )
    })
    .from(project)
    .where(eq(project.id, projectId))
  if (!calendar) throw new Error('Project summary unavailable: project not found')
  const { today, dayEnd } = calendar

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

  const callVerdicts = new Map(
    calls.map((c) => {
      const pack = bundleById.get(c.bundleId)!.pack
      const kind = c.windowId ? 'window' : c.nightId ? 'night' : 'site'
      return [c.id, persistedVerdict(c.shadow, pack, kind, c.windowId ?? c.nightId, 'call shadow')]
    })
  )
  const shadowVerdicts = new Map(
    shadows.map((s) => [s.id, persistedVerdict(s.verdict, s.pack, s.scopeKind, s.scopeId, 'shadow verdict')])
  )

  const activeShadows = shadows.filter((s) => {
    if (s.scopeKind === 'window') {
      const win = s.scopeId ? windowById.get(s.scopeId) : null
      return win !== undefined && win !== null && win.cancelledAt === null && win.endsAt > now
    }
    if (s.scopeKind === 'night') {
      const n = s.scopeId ? nightById.get(s.scopeId) : null
      return n !== undefined && n !== null && n.state !== 'unlisted' && (n.exitEnd ?? n.arrivalEnd ?? now) > now
    }
    return true
  })

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

  const sourceIds = [...new Set(boundSources.map((b) => b.sourceId))]
  const sources = sourceIds.length ? await tx.select().from(source).where(inArray(source.id, sourceIds)) : []
  const latestReadings = sourceIds.length
    ? await tx
        .select({ sourceId: reading.sourceId, at: max(reading.observedAt) })
        .from(reading)
        .where(and(inArray(reading.sourceId, sourceIds), lte(reading.observedAt, now)))
        .groupBy(reading.sourceId)
    : []
  const latestPolls = sourceIds.length
    ? await tx
        .select({ sourceId: poll.sourceId, at: max(poll.startedAt) })
        .from(poll)
        .where(
          and(inArray(poll.sourceId, sourceIds), lte(poll.startedAt, now), inArray(poll.outcome, ['ok', 'unchanged']))
        )
        .groupBy(poll.sourceId)
    : []
  const sourceById = new Map(sources.map((s) => [s.id, s]))
  const observedAtBySource = new Map(latestReadings.map((r) => [r.sourceId, r.at]))
  const polledAtBySource = new Map(latestPolls.map((p) => [p.sourceId, p.at]))

  for (const c of calls) {
    const v = callVerdicts.get(c.id)!
    const current = activeShadows.filter(
      (s) => s.pack === v.pack && s.scopeKind === v.scope.kind && s.scopeId === v.scope.id
    )
    const provenance = [
      ...(v.no_call?.inputs ?? []),
      ...requiredBlockers(v),
      ...current.flatMap((s) => requiredBlockers(shadowVerdicts.get(s.id)!))
    ]
    for (const name of z.array(z.string()).nullable().parse(c.noCall) ?? []) {
      if (!provenance.some((input) => input.name === name))
        throw new Error(`Missing provenance for blocked input ${name}`)
    }
  }

  function currentNoCall(pack: Pack, windowId?: string): { inputs: BlockedInput[] } | null {
    const current = activeShadows.filter(
      (s) =>
        s.pack === pack &&
        (windowId === undefined || (s.scopeKind === 'window' && s.scopeId === windowId) || s.scopeKind === 'site')
    )
    const inputs = current.flatMap((s) => requiredBlockers(shadowVerdicts.get(s.id)!))
    // Without a current verdict for a call's scope, its persisted blockers are the only known provenance.
    for (const c of inForceCalls.filter(
      (c) => bundleById.get(c.bundleId)?.pack === pack && (windowId === undefined || c.windowId === windowId)
    )) {
      const v = callVerdicts.get(c.id)!
      const sameScope = current.some((s) => s.scopeKind === v.scope.kind && s.scopeId === v.scope.id)
      if (!sameScope) inputs.push(...requiredBlockers(v))
    }
    return noCall(
      inputs.flatMap((input) => {
        const state = input.source_id ? stateBySourceId.get(input.source_id) : undefined
        if (!state) return [input]
        // Fresh source data does not prove a derived interval has complete required coverage.
        if (state.state === 'fresh' || state.state === 'off_hours') return [input]
        return [{ ...input, state: state.state, since: toIso(state.since) }]
      })
    )
  }

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
        no_call: currentNoCall(pack)
      }
    }

    const packShadows = activeShadows.filter((s) => s.pack === pack)

    if (packShadows.length > 0) {
      const parsed = packShadows.map((s) => {
        const v = shadowVerdicts.get(s.id)!
        return { row: s, mode: v.mode, watch: v.watch }
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
        no_call: currentNoCall(pack)
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

  // Overlap today's local calendar day and remain nonended; a previous-day start may cross midnight.
  const activeWindows = windows.filter((w) => w.cancelledAt === null && w.endsAt > now && w.startsAt < dayEnd)
  const atRiskWindowIds = new Set<string>()
  for (const w of activeWindows) {
    for (const pack of ALL_PACKS) {
      const winCalls = inForceCalls.filter((c) => c.windowId === w.id && bundleById.get(c.bundleId)?.pack === pack)
      const winShadows = activeShadows.filter((s) => s.pack === pack && s.scopeKind === 'window' && s.scopeId === w.id)
      const modeRisk =
        winCalls.length > 0
          ? winCalls.some((c) => (c.mode !== null && c.mode !== 'normal') || c.watch)
          : winShadows.some((s) => {
              const v = shadowVerdicts.get(s.id)!
              return (v.mode !== null && v.mode !== 'normal') || v.watch
            })
      if (modeRisk || currentNoCall(pack, w.id) !== null) atRiskWindowIds.add(w.id)
    }
  }

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
      const src = sourceById.get(bound.sourceId)
      const at =
        src?.freshness === 'observed' ? observedAtBySource.get(bound.sourceId) : polledAtBySource.get(bound.sourceId)
      if (at) {
        const ageS = Math.floor((now.getTime() - new Date(at).getTime()) / 1000)
        if (oldestAgeS === null || ageS > oldestAgeS) oldestAgeS = ageS
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
        calls: calls
          .filter((c) => c.bundleId === latestBundleRow.id)
          .map((c) => serializeCall(c, callVerdicts.get(c.id)!))
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

  const forecastSourceIds = new Set(
    boundSources
      .filter(
        (b) =>
          b.role === 'met_forecast' &&
          sourceById.get(b.sourceId)?.kind === 'met_forecast' &&
          stateBySourceId.get(b.sourceId)?.state === 'fresh'
      )
      .map((b) => b.sourceId)
  )
  const readings = forecastSourceIds.size
    ? await tx
        .select()
        .from(reading)
        .where(
          and(
            inArray(reading.sourceId, [...forecastSourceIds]),
            eq(reading.metric, 'forecast_day'),
            lte(reading.observedAt, now)
          )
        )
    : []
  // Use the latest observed revision per source/date: a later fair-weather revision supersedes a storm.
  const forecastDays = new Map<string, { at: number; revision: number; date: string; text: string }>()
  for (const r of readings) {
    if (!forecastSourceIds.has(r.sourceId) || r.metric !== 'forecast_day') continue
    const parsed = ForecastDay.safeParse(r.valueJson)
    if (!parsed.success) throw new Error('Invalid persisted forecast_day reading')
    const key = `${r.sourceId}:${parsed.data.date}`
    const previous = forecastDays.get(key)
    if (
      !previous ||
      r.observedAt.getTime() > previous.at ||
      (r.observedAt.getTime() === previous.at && r.revision > previous.revision)
    ) {
      forecastDays.set(key, {
        at: r.observedAt.getTime(),
        revision: r.revision,
        date: parsed.data.date,
        text: parsed.data.afternoon_forecast
      })
    }
  }
  const nextStormDate =
    [...forecastDays.values()]
      .filter((d) => d.date >= today && /^ribut petir\b/i.test(d.text))
      .map((d) => d.date)
      .sort()[0] ?? null

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
    next_storm_date: nextStormDate,
    next_action: nextAction
  }
}
