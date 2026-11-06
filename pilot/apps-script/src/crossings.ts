import { toMytIso } from '../../shared/time.ts'
import type { SkyClauseKey, SkyVerdict, SkyVerdictValue } from './clauses.ts'
import type { Cell, Row } from './schema.ts'

export interface SkyCrossingWindowMeta {
  kind: string
  date: string
  start_myt: string
  end_myt: string
}

export interface SkyCrossingInputEvidence {
  name: string
  value: Cell | null
  unit: string
  source_id: string | null
  source_ids: string[]
  reading_ids: string[]
  observed_at: string | null
  age_min: number | null
  state: string | null
  state_since: string | null
}

export interface SkyCrossingChange {
  scope: string
  window: SkyCrossingWindowMeta | null
  from: SkyVerdictValue
  to: SkyVerdictValue
  fired: SkyClauseKey[]
  blocked: SkyClauseKey[]
  inputs: SkyCrossingInputEvidence[]
}

export interface SkyCrossingDocument {
  crossing_id: string
  pack: 'sky'
  replay: boolean
  t_eval: string
  snapshot_id: string
  clause_version: string | number | null
  replay_notice?: string
  replay_clause_content_json?: string
  changes: SkyCrossingChange[]
}

export interface PlannedSkyCrossingFile {
  filename: string
  document: SkyCrossingDocument
}

export interface SkyCrossingInput {
  tEval: string
  verdicts: readonly SkyVerdict[]
  previousState: readonly Row<'shadow_state'>[]
  ledgerSourceRefs: readonly string[]
  windows: readonly Row<'windows'>[]
  sequence: number
  replay?: boolean
  replayNotice?: string | null
}

export interface SkyCrossingPlan {
  shadowRows: Row<'shadow'>[]
  stateRows: Row<'shadow_state'>[]
  crossing: PlannedSkyCrossingFile | null
}

const VALID_VERDICTS = new Set<SkyVerdictValue>([
  'normal',
  'outdoor_limited',
  'commute_disruption',
  'hybrid_recommended',
  'no_call'
])

const ABOVE_NORMAL_MODES = new Set<SkyVerdictValue>(['outdoor_limited', 'commute_disruption', 'hybrid_recommended'])

const MINUTE_MS = 60_000

function normalizeIsoCell(cell: Cell | undefined | null): string | null {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : null
  }
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return toMytIso(new Date(ms))
}

function parseVerdictValue(raw: Cell | undefined): SkyVerdictValue | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim() as SkyVerdictValue
  return VALID_VERDICTS.has(trimmed) ? trimmed : null
}

function normalizeMytClock(cell: Cell | undefined): { clock: string; dateFromIso: string | null } | null {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    if (!Number.isFinite(ms)) return null
    const iso = toMytIso(cell)
    return { clock: iso.slice(11, 16), dateFromIso: iso.slice(0, 10) }
  }
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim()
  if (!trimmed) return null

  const bareMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (bareMatch) {
    const hours = Number(bareMatch[1])
    const minutes = Number(bareMatch[2])
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { clock: `${bareMatch[1]}:${bareMatch[2]}`, dateFromIso: null }
    }
    return null
  }

  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  const iso = toMytIso(new Date(ms))
  return { clock: iso.slice(11, 16), dateFromIso: iso.slice(0, 10) }
}

function buildWindowMeta(scope: string, windows: readonly Row<'windows'>[], evalDate: string): SkyCrossingWindowMeta {
  const row = windows.find((w) => String(w.window_id ?? '').trim() === scope)
  if (!row) {
    throw new Error(`Missing declared window metadata for scope ${scope}`)
  }
  const startClock = normalizeMytClock(row.start_myt)
  const endClock = normalizeMytClock(row.end_myt)
  if (!startClock || !endClock) {
    throw new Error(`Invalid window start_myt or end_myt for scope ${scope}`)
  }
  const rawDate = String(row.date ?? '').trim()
  const date = rawDate || endClock.dateFromIso || startClock.dateFromIso || evalDate
  const kind = String(row.kind ?? '').trim()
  return {
    kind,
    date,
    start_myt: startClock.clock,
    end_myt: endClock.clock
  }
}

function isVerdictSpanOpen(
  verdict: SkyVerdict,
  windows: readonly Row<'windows'>[],
  evalDate: string,
  tEvalMs: number
): boolean {
  if (verdict.scope === 'site') return true
  const fromIso = normalizeIsoCell(verdict.spanFrom)
  const toIso = normalizeIsoCell(verdict.spanTo)
  if (fromIso && toIso) {
    const fromMs = Date.parse(fromIso)
    const toMs = Date.parse(toIso)
    return tEvalMs >= fromMs && tEvalMs <= toMs
  }

  const row = windows.find((w) => String(w.window_id ?? '').trim() === verdict.scope)
  if (!row) return false
  const endClock = normalizeMytClock(row.end_myt)
  if (!endClock) return false
  const dateStr = String(row.date ?? '').trim() || endClock.dateFromIso || evalDate
  const endMs = Date.parse(`${dateStr}T${endClock.clock}:00+08:00`)
  if (!Number.isFinite(endMs)) return false
  const spanFromMs = endMs - 30 * MINUTE_MS
  const spanToMs = endMs + 60 * MINUTE_MS
  return tEvalMs >= spanFromMs && tEvalMs <= spanToMs
}

function collectChangeInputs(verdict: SkyVerdict): SkyCrossingInputEvidence[] {
  const activeClauses: SkyClauseKey[] = [...verdict.firedClauses, ...verdict.blockedClauses]
  const byName = new Map<string, SkyCrossingInputEvidence>()

  for (const key of activeClauses) {
    const clauseRes = verdict.clauses[key]
    if (!clauseRes) continue
    for (const ev of clauseRes.evidence) {
      if (byName.has(ev.name)) continue
      const sourceIds = [...ev.sourceIds]
      const readingIds = [...ev.readingIds]
      const value: Cell | null = ev.value === '' || ev.value === undefined || ev.value === null ? null : ev.value

      byName.set(ev.name, {
        name: ev.name,
        value,
        unit: ev.unit,
        source_id: sourceIds.length === 1 ? sourceIds[0]! : null,
        source_ids: sourceIds,
        reading_ids: readingIds,
        observed_at: ev.observedAt ?? null,
        age_min: ev.ageMin ?? null,
        state: ev.state ?? null,
        state_since: ev.stateSince ?? null
      })
    }
  }

  return Array.from(byName.values())
}

function formatCrossingIds(tEvalIso: string, sequence: number): { crossingId: string; filename: string } {
  const yyyyMMdd = `${tEvalIso.slice(0, 4)}${tEvalIso.slice(5, 7)}${tEvalIso.slice(8, 10)}`
  const HHmm = `${tEvalIso.slice(11, 13)}${tEvalIso.slice(14, 16)}`
  const seq = String(sequence).padStart(2, '0')
  return {
    crossingId: `X-${yyyyMMdd}-${HHmm}-${seq}`,
    filename: `crossing-${yyyyMMdd}-${HHmm}-${seq}.json`
  }
}

export function planSkyCrossings(input: SkyCrossingInput): SkyCrossingPlan {
  const tEvalIso = normalizeIsoCell(input.tEval)
  if (!tEvalIso) {
    throw new Error(`Invalid tEval timestamp: ${String(input.tEval)}`)
  }
  const tEvalMs = Date.parse(tEvalIso)
  const evalDate = tEvalIso.slice(0, 10)

  if (typeof input.sequence !== 'number' || !Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new Error(`Invalid crossing sequence: ${String(input.sequence)}`)
  }

  const replay = input.replay === true
  const replayNotice = typeof input.replayNotice === 'string' ? input.replayNotice.trim() : ''
  if (!replay && replayNotice.length > 0) {
    throw new Error('replayNotice cannot be supplied when replay is false')
  }

  let snapshotId = tEvalIso
  let clauseVersion: string | number | null = null
  if (input.verdicts.length > 0) {
    const first = input.verdicts[0]!
    const firstSnap = normalizeIsoCell(first.snapshotId)
    if (!firstSnap) {
      throw new Error(`Invalid verdict snapshotId: ${String(first.snapshotId)}`)
    }
    snapshotId = firstSnap
    clauseVersion = first.clauseVersion ?? null

    for (const v of input.verdicts) {
      const vSnap = normalizeIsoCell(v.snapshotId)
      if (vSnap !== snapshotId) {
        throw new Error(`Inconsistent snapshotId across verdicts: ${String(v.snapshotId)} vs ${snapshotId}`)
      }
      if ((v.clauseVersion ?? null) !== clauseVersion) {
        throw new Error(
          `Inconsistent clauseVersion across verdicts: ${String(v.clauseVersion)} vs ${String(clauseVersion)}`
        )
      }
    }
  }

  const priorByScope = new Map<string, Row<'shadow_state'>>()
  for (const row of input.previousState) {
    const scope = String(row.scope ?? '').trim()
    if (scope) priorByScope.set(scope, row)
  }

  const ledgerRefSet = new Set(
    input.ledgerSourceRefs.map((ref) => String(ref ?? '').trim()).filter((ref) => ref.length > 0)
  )

  const { crossingId, filename } = formatCrossingIds(tEvalIso, input.sequence)
  const shadowRows: Row<'shadow'>[] = input.verdicts.map((v) => ({ ...v.shadowRow }))
  const stateRows: Row<'shadow_state'>[] = []
  const evaluatedScopes = new Set<string>()
  const changes: SkyCrossingChange[] = []

  for (const verdict of input.verdicts) {
    const scope = verdict.scope
    evaluatedScopes.add(scope)

    const prior = priorByScope.get(scope)
    const fromVerdict = parseVerdictValue(prior?.verdict) ?? 'normal'
    const priorSince =
      prior && prior.since !== undefined && String(prior.since).trim() !== '' ? String(prior.since).trim() : tEvalIso
    const priorLastCrossingId = prior ? String(prior.last_crossing_id ?? '').trim() : ''
    const toVerdict = verdict.verdict

    if (toVerdict === fromVerdict) {
      stateRows.push({
        scope,
        verdict: fromVerdict,
        since: prior ? priorSince : tEvalIso,
        last_crossing_id: priorLastCrossingId
      })
      continue
    }

    const isSite = scope === 'site'
    let eligible = false

    if (isSite) {
      eligible = true
    } else if (ABOVE_NORMAL_MODES.has(toVerdict)) {
      eligible = true
    } else if (toVerdict === 'no_call') {
      eligible = isVerdictSpanOpen(verdict, input.windows, evalDate, tEvalMs)
    } else if (toVerdict === 'normal') {
      eligible = priorLastCrossingId.length > 0 && !ledgerRefSet.has(priorLastCrossingId)
    }

    if (eligible) {
      changes.push({
        scope,
        window: isSite ? null : buildWindowMeta(scope, input.windows, evalDate),
        from: fromVerdict,
        to: toVerdict,
        fired: [...verdict.firedClauses],
        blocked: [...verdict.blockedClauses],
        inputs: collectChangeInputs(verdict)
      })
      stateRows.push({
        scope,
        verdict: toVerdict,
        since: tEvalIso,
        last_crossing_id: crossingId
      })
    } else {
      stateRows.push({
        scope,
        verdict: toVerdict,
        since: tEvalIso,
        last_crossing_id: priorLastCrossingId
      })
    }
  }

  for (const row of input.previousState) {
    const scope = String(row.scope ?? '').trim()
    if (!scope || evaluatedScopes.has(scope)) continue
    stateRows.push({
      scope,
      verdict: row.verdict ?? 'normal',
      since: row.since ?? '',
      last_crossing_id: row.last_crossing_id ?? ''
    })
  }

  if (changes.length === 0) {
    return {
      shadowRows,
      stateRows,
      crossing: null
    }
  }

  const document: SkyCrossingDocument = {
    crossing_id: crossingId,
    pack: 'sky',
    replay,
    t_eval: tEvalIso,
    snapshot_id: snapshotId,
    clause_version: clauseVersion,
    ...(replay && replayNotice.length > 0 ? { replay_notice: replayNotice } : {}),
    changes
  }

  return {
    shadowRows,
    stateRows,
    crossing: {
      filename,
      document
    }
  }
}
