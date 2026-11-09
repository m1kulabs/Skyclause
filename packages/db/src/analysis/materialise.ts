import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import {
  analysisMetric,
  bundle,
  call,
  crossing,
  evidenceRequest,
  forecast,
  grade,
  project,
  run,
  shadowState,
  window
} from '../schema'
import { localDate } from './dates'
import { computeMetrics, type DelayFact, type Facts, type MetricRow } from './metrics'

// #162 c-analysis-api: the `analysis-materialise` job's reads and writes, in the caller's `withTenant` transaction.
// TRD grading: analysis is materialised from `grade` (plus call and evidence times); replays never reach it.

export const PERIODS = ['7d', '30d', '90d', 'all'] as const
export type Period = (typeof PERIODS)[number]
const DAYS: Record<Exclude<Period, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

/** `date` moved by `days`, as dates. */
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** A period's project-local dates, inclusive, ending on `today`; all time starts at `start`. */
export function periodRange(period: Period, today: string, start: string) {
  return { from: period === 'all' ? start : addDays(today, 1 - DAYS[period]), to: today }
}

const minutesBetween = (from: unknown, to: unknown) => sql<number>`extract(epoch FROM ${to} - ${from}) / 60`

/** The clause keys a stored verdict (`call.shadow`, `shadow_state.verdict`) fired. */
function firedClauses(verdict: unknown): string[] {
  const clauses = (verdict as { clauses?: unknown } | null)?.clauses
  if (!Array.isArray(clauses)) return []
  return clauses.flatMap((c: { key?: unknown; result?: unknown }) =>
    c?.result === 'fired' && typeof c.key === 'string' ? [c.key] : []
  )
}

/**
 * What the figures count, for one project: its grades outside guest windows and Closed draft-only bundles (GST-5),
 * each with the clauses its call's shadow verdict (or, for a callless window, the window's shadow state) fired; its
 * calls' crossing → approved and approved → sent minutes, on the date each delay started; and LED-6's evidence
 * minutes, on the date the request came in.
 */
export async function analysisFacts(tx: Tx, q: { projectId: string; timeZone: string }): Promise<Facts> {
  const guest = sql<boolean>`(coalesce(${window.guest}, false) OR coalesce(${bundle.draftOnly}, false))`
  // One transaction holds one connection, so its queries run in turn.
  const grades = await tx
    .select({
      pack: grade.pack,
      outcome: grade.outcome,
      callId: grade.callId,
      agrees: grade.agrees,
      staleInputs: grade.staleInputs,
      localDate: sql<string>`${grade.localDate}::text`,
      actual: grade.actual,
      forecast: forecast.forecast,
      callShadow: call.shadow,
      windowShadow: shadowState.verdict
    })
    .from(grade)
    .leftJoin(window, eq(window.id, grade.windowId))
    .leftJoin(call, eq(call.id, grade.callId))
    .leftJoin(bundle, eq(bundle.id, call.bundleId))
    .leftJoin(forecast, eq(forecast.id, grade.forecastId))
    .leftJoin(
      shadowState,
      and(
        isNull(grade.callId),
        eq(shadowState.projectId, grade.projectId),
        eq(shadowState.pack, grade.pack),
        eq(shadowState.scopeKind, 'window'),
        eq(shadowState.scopeId, grade.windowId)
      )
    )
    .where(and(eq(grade.projectId, q.projectId), ne(grade.outcome, 'pending'), sql`NOT ${guest}`))
    .orderBy(asc(grade.localDate), asc(grade.id))
  const calls = await tx
    .select({
      pack: bundle.pack,
      crossingAt: crossing.at,
      approvedAt: call.approvedAt,
      toApproved: minutesBetween(crossing.at, call.approvedAt),
      toSent: minutesBetween(call.approvedAt, call.sentAt),
      crossingDate: localDate(crossing.at, q.timeZone),
      approvedDate: localDate(call.approvedAt, q.timeZone)
    })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .innerJoin(run, eq(run.id, bundle.runId))
    .leftJoin(window, eq(window.id, call.windowId))
    .leftJoin(crossing, and(eq(run.trigger, 'crossing'), sql`${crossing.id}::text = ${run.triggerRef}`))
    .where(and(eq(call.projectId, q.projectId), isNotNull(call.approvedAt), sql`NOT ${guest}`))
    .orderBy(asc(call.approvedAt), asc(call.id))
  const evidence = await tx
    .select({
      minutes: minutesBetween(evidenceRequest.receivedAt, evidenceRequest.draftedAt),
      localDate: localDate(evidenceRequest.receivedAt, q.timeZone)
    })
    .from(evidenceRequest)
    .where(and(eq(evidenceRequest.projectId, q.projectId), isNotNull(evidenceRequest.draftedAt)))
    .orderBy(asc(evidenceRequest.receivedAt), asc(evidenceRequest.id))
  return {
    grades: grades.map((g) => ({
      pack: g.pack,
      outcome: g.outcome,
      callGrade: g.callId !== null,
      agrees: g.agrees,
      staleInputs: g.staleInputs,
      clauses: firedClauses(g.callId !== null ? g.callShadow : g.windowShadow),
      localDate: g.localDate,
      actual: g.actual,
      forecast: g.forecast
    })),
    delays: calls.flatMap((c) => {
      const delays: DelayFact[] = []
      if (c.crossingAt) {
        delays.push({
          pack: c.pack,
          kind: 'crossing_to_approved',
          minutes: Number(c.toApproved),
          localDate: c.crossingDate
        })
      }
      if (c.toSent !== null) {
        delays.push({ pack: c.pack, kind: 'approved_to_sent', minutes: Number(c.toSent), localDate: c.approvedDate })
      }
      return delays
    }),
    evidence: evidence.map((e) => ({ minutes: Number(e.minutes), localDate: e.localDate }))
  }
}

/** Every project, across organisations (`withSystem` sees `project`). */
export function analysisProjects(tx: Tx<SystemPrincipal>) {
  return tx.select({ orgId: project.orgId, projectId: project.id }).from(project).orderBy(asc(project.id))
}

/**
 * Replaces the project's figures with ones computed at `now`: each period ending on the project's local date at
 * `now`, all time from its creation (or its first fact, if earlier), plus one `day` row set per date with any figure
 * (n > 0 only) for the series. Every figure is written, at n = 0 when nothing counts, so a new project reads n = 0
 * everywhere. The delete and inserts share the caller's transaction, so a failed run leaves the last figures.
 */
export async function materialiseAnalysis(tx: Tx, q: { projectId: string; now: Date }) {
  const [p] = await tx
    .select({
      timeZone: project.timeZone,
      today: localDate(sql`${q.now.toISOString()}::timestamptz`, project.timeZone),
      createdOn: localDate(project.createdAt, project.timeZone)
    })
    .from(project)
    .where(eq(project.id, q.projectId))
  if (!p) throw new Error(`no project ${q.projectId} in this organisation`)
  const facts = await analysisFacts(tx, { projectId: q.projectId, timeZone: p.timeZone })
  const dates = [...facts.grades, ...facts.delays, ...facts.evidence]
    .map((f) => f.localDate)
    .filter((d) => d <= p.today)
  const start = dates.reduce((first, d) => (d < first ? d : first), p.createdOn)
  const clauses = [...new Set(facts.grades.filter((g) => g.pack === 'sky').flatMap((g) => g.clauses))].sort()
  const rows: Array<MetricRow & { period: string; rangeFrom: string; rangeTo: string }> = []
  for (const period of PERIODS) {
    const range = periodRange(period, p.today, start)
    for (const row of computeMetrics(facts, range, clauses))
      rows.push({ ...row, period, rangeFrom: range.from, rangeTo: range.to })
  }
  for (const day of [...new Set(dates)].sort()) {
    for (const row of computeMetrics(facts, { from: day, to: day }, [])) {
      if (row.n > 0) rows.push({ ...row, period: 'day', rangeFrom: day, rangeTo: day })
    }
  }
  await tx.delete(analysisMetric).where(eq(analysisMetric.projectId, q.projectId))
  await tx
    .insert(analysisMetric)
    .values(rows.map((row) => ({ ...row, orgId: tx.orgId!, projectId: q.projectId, computedAt: q.now })))
  return rows.length
}
