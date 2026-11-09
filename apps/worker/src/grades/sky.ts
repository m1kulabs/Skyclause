import { compare, type ProposedBundle, type Verdicts } from '@skyclause/agent'
import type { ReadingHistory, SheetInput, SkyMode } from '@skyclause/clauses'
import {
  gradingProjects,
  liveSheet,
  recordGrade,
  sheetVersionContent,
  skyCandidates,
  withSystem,
  type SkyCandidate,
  type Tx
} from '@skyclause/db'
import { requireEngine, type GradeEngine } from './engine'
import { forEachProject } from './projects'
import { lastSpanEnd, gradeSky as outcomeOf } from './rules'

// #161 c-grades, TRD grading: the grade-sky job (23:55 and 06:30 MYT, D26).

const JOB = 'grade-sky'
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
/** Windows that ended this far back still get graded, so a missed run catches up. */
const LOOKBACK = 14 * DAY
/** History before the window: `site.api_0600_min_last3_max` reads three days of APIMS. */
const HISTORY_BEFORE = 4 * DAY
/** TRD grading's observed inputs: gauge, APIMS and warnings in force; a camera only once its probation passed. */
const OBSERVED = new Set(['jps_rain', 'apims', 'met_warning'])
const DEVICES = new Set(['camera', 'pi'])

function observedOnly(h: ReadingHistory): ReadingHistory {
  const kept = h.sources.filter((s) => OBSERVED.has(s.kind) || (DEVICES.has(s.kind) && !s.probation))
  const ids = new Set(kept.map((s) => s.id))
  return {
    sources: kept,
    polls: h.polls.filter((p) => ids.has(p.sourceId)),
    readings: h.readings.filter((r) => ids.has(r.sourceId))
  }
}

type StoredCall = SkyCandidate['calls'][number]
const names = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : (value as { inputs?: unknown } | null)?.inputs
  if (!Array.isArray(list)) return []
  return list.flatMap((item) => (typeof item === 'string' ? [item] : typeof item?.name === 'string' ? [item.name] : []))
}

/** CAL-4's stale-input flag: `compare` over the stored call and the shadow verdict it was drafted against. */
function staleInputs(c: StoredCall, windowId: string): boolean {
  const shadow = c.shadow as Partial<Verdicts['windows'][number]> | null
  if (!Array.isArray(shadow?.clauses)) return false
  const fired = Array.isArray(c.fired)
    ? (c.fired as Array<{ clause?: unknown; inputs?: unknown }>).map((f) => ({
        clause: String(f.clause),
        inputs: names(f.inputs)
      }))
    : []
  const proposal: ProposedBundle = {
    pack: 'sky',
    items: [],
    calls: [
      {
        window_id: windowId,
        mode: c.mode,
        watch: c.watch,
        no_call: c.noCall === null ? null : names(c.noCall),
        fired,
        recommendations: [],
        recipients: [],
        notices: [],
        reason: ''
      }
    ]
  }
  const verdict = {
    scope: { kind: 'window', id: windowId },
    mode: shadow.mode ?? null,
    watch: shadow.watch ?? false,
    noCall: shadow.noCall ?? null,
    clauses: shadow.clauses.map((clause) => ({
      ...clause,
      blockedBy: clause.blockedBy ?? [],
      inputs: clause.inputs ?? []
    }))
  }
  const verdicts = { site: [], windows: [verdict], nights: [] } as unknown as Verdicts
  return compare(proposal, verdicts)[0]!.staleInputs
}

export async function gradeSky(e: GradeEngine, now: Date) {
  const engine = requireEngine(e, JOB, ['history', 'registry'])
  const projects = await withSystem(JOB, (tx) => gradingProjects(tx, now))
  await forEachProject(JOB, projects, (tx, p) => gradeProject(tx, engine, { ...p, now }))
}

async function gradeProject(
  tx: Tx,
  engine: ReturnType<typeof requireEngine<'history' | 'registry'>>,
  q: { projectId: string; timeZone: string; now: Date }
) {
  const windows = await skyCandidates(tx, {
    projectId: q.projectId,
    timeZone: q.timeZone,
    endedAfter: new Date(q.now.getTime() - LOOKBACK),
    endedBy: q.now
  })
  let live: Awaited<ReturnType<typeof liveSheet>> | undefined
  let graded = 0
  for (const w of windows) {
    const calls = w.calls.filter((c) => !w.gradedCallIds.includes(c.id))
    const callless = w.calls.length === 0 && w.shadowFired && !w.windowGraded
    if (!calls.length && !callless) continue
    const windowApproved = w.calls.some((c) => c.approvedAt !== null)
    const observations = new Map<string, Awaited<ReturnType<typeof observe>>>()
    for (const c of callless ? [null] : calls) {
      live ??= await liveSheet(tx, q.projectId, 'sky')
      const versionId = c?.sheetVersionId ?? w.shadowVersionId ?? live?.versionId
      if (!versionId) throw new Error(`window ${w.id} has no pinned, shadow or live Sky sheet version`)
      if (!observations.has(versionId)) observations.set(versionId, await observe(tx, engine, w, versionId, q))
      const observation = observations.get(versionId)!
      if (!observation) continue
      const result = outcomeOf({
        call: c && {
          mode: c.mode as SkyMode | null,
          noCall: c.noCall !== null,
          approved: c.approvedAt !== null,
          state: c.state
        },
        observed: observation.mode,
        shadowFired: w.shadowFired,
        windowApproved
      })
      const guest = w.guest || c?.draftOnly === true
      const written = await recordGrade(tx, {
        projectId: q.projectId,
        pack: 'sky',
        callId: c?.id ?? null,
        windowId: w.id,
        sheetVersionId: versionId,
        outcome: result.outcome,
        proposedMode: c?.mode ?? null,
        observedMode: observation.mode,
        modeDiff: result.modeDiff,
        noCall: result.noCall,
        agrees: c?.agrees ?? false,
        staleInputs: c ? staleInputs(c, w.id) : false,
        localDate: w.localDate,
        readingIds: observation.readingIds,
        reasons: guest ? [] : result.reasons,
        ledger: !guest && c?.bundleState !== 'closed'
      })
      if (written) graded++
    }
  }
  return graded
}

/** The pinned version's window verdict over the span's observed readings, or null while its last span is open. */
async function observe(
  tx: Tx,
  engine: ReturnType<typeof requireEngine<'history' | 'registry'>>,
  w: SkyCandidate,
  versionId: string,
  q: { projectId: string; now: Date }
) {
  const content = (await sheetVersionContent(tx, versionId)) as SheetInput
  const checked = engine.check(content, engine.registry)
  if (!checked.ok || !checked.sheet) {
    throw new Error(`sheet version ${versionId} doesn't check: ${checked.issues.map((i) => i.message).join('; ')}`)
  }
  const end = lastSpanEnd(w, checked.sheet.clauses)
  if (q.now < end) return null
  const tEval = end.toISOString()
  const history = await engine.history(tx, {
    projectId: q.projectId,
    from: new Date(w.startsAt.getTime() - HISTORY_BEFORE).toISOString(),
    to: tEval
  })
  const snapshot = engine.snapshotAt(observedOnly(history), engine.registry, q.projectId, 'sky', tEval)
  const verdicts = engine.evaluate(
    checked.sheet,
    snapshot,
    [{ id: w.id, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), kind: w.kind, tz: w.tz }],
    tEval
  )
  const verdict = verdicts.windows.find((v) => v.scope.id === w.id)
  if (!verdict) throw new Error(`evaluate gave no verdict for window ${w.id}`)
  return {
    mode: verdict.noCall ? null : (verdict.mode as SkyMode | null),
    readingIds: [...new Set(verdict.clauses.flatMap((c) => c.inputs.flatMap((i) => i.readingIds)))]
  }
}
