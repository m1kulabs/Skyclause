import { metrics, type Attributes, type Meter } from '@opentelemetry/api'
import { METRICS, type SliStat } from '@skyclause/contracts'
import type { WorkerPart } from '../server'
import { databaseReads } from './reads'

// a-observability: TRD's SLIs from stored timestamps. The handler runs in the worker's 15-minute batch (D45),
// on the batch's shared connection, so it never wakes the database itself.

/** `[from, to)`. */
export interface TimeWindow {
  from: Date
  to: Date
}

export interface PollSlot {
  adapter: string
  slotAt: Date
  /** `poll.started_at` of the poll that served the slot; null if none did. */
  startedAt: Date | null
}
export interface StoredReading {
  adapter: string
  /** Its poll's `started_at`. */
  polledAt: Date
  /** When the batch wrote the row. */
  storedAt: Date
}
export interface Evaluation {
  /** The newest `reading.received_at` the snapshot used. */
  receivedAt: Date
  evaluatedAt: Date
}
export interface Review {
  crossingAt: Date
  needsReviewAt: Date
}
export interface ApproverAlert {
  needsReviewAt: Date
  /** The first `bundle_alert.accepted_at`; null if no alert was accepted. */
  acceptedAt: Date | null
}
export interface Handover {
  approvedAt: Date
  /** `notice.accepted_at`; null if the provider hasn't accepted it. */
  acceptedAt: Date | null
}
export interface SlaDue {
  dueAt: Date
  /** The first approve, edit or reject `approval` row. */
  decidedAt: Date | null
  /** The first `escalate` `approval` row. */
  escalatedAt: Date | null
}

/**
 * The timestamp reads, as `system`. Each method is one query; rows fall in a window by the field named. An SLI whose
 * read is absent records nothing, like an empty window.
 */
export interface SliReads {
  /** Every Scheduler slot each adapter was due in the window (`slotAt`). */
  pollSlots?(window: TimeWindow): Promise<PollSlot[]>
  /** Each adapter's latest `count` slots due before `before`. */
  latestPollSlots?(before: Date, count: number): Promise<PollSlot[]>
  /** By `storedAt`. */
  storedReadings(window: TimeWindow): Promise<StoredReading[]>
  /** By `evaluatedAt`. */
  evaluations?(window: TimeWindow): Promise<Evaluation[]>
  /** Bundles reaching needs review (`needsReviewAt`), with their run's `crossing.at`. */
  reviews(window: TimeWindow): Promise<Review[]>
  /** By `needsReviewAt`. */
  approverAlerts(window: TimeWindow): Promise<ApproverAlert[]>
  /** The latest `count` bundles to reach needs review before `before`. */
  latestApproverAlerts(before: Date, count: number): Promise<ApproverAlert[]>
  /** Call notices of approved bundles, by `approvedAt`. */
  handovers(window: TimeWindow): Promise<Handover[]>
  /** By `dueAt` (`bundle.sla_due_at`). */
  slaDue(window: TimeWindow): Promise<SlaDue[]>
}

const MINUTE = 60_000
const BATCH = 15 * MINUTE

/** NFR-1 to NFR-3 targets (PRD, relaxed in #220 where noted). */
const TARGET = {
  pollStartS: 60,
  missedInARow: 3,
  storedAfterPollS: 15 * 60, // #220
  readingToVerdictS: 16 * 60, // #220
  crossingToNeedsReviewS: 3 * 60,
  approverAlertS: 60,
  failedInARow: 2,
  approvalToProviderS: 60,
  approvalToProviderShare: 0.999
}

const SLIS = [
  'pollsOnSchedule',
  'readingStored',
  'readingToVerdict',
  'crossingToNeedsReview',
  'approverAlerted',
  'approvalToProvider',
  'approvalSla'
] as const
type Sli = (typeof SLIS)[number]

const seconds = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 1000

/** Nearest-rank 95th percentile. */
function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0
}

function byAdapter<T extends { adapter: string }>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) groups.set(row.adapter, [...(groups.get(row.adapter) ?? []), row])
  return groups
}

/** How many of `rows`, newest first, fail before the first that doesn't. */
function inARow<T>(rows: T[], time: (row: T) => Date, failed: (row: T) => boolean) {
  const newestFirst = [...rows].sort((a, b) => time(b).getTime() - time(a).getTime())
  const index = newestFirst.findIndex((row) => !failed(row))
  return index === -1 ? newestFirst.length : index
}

/**
 * Records each SLI for the batch slot holding `now`, one batch behind (rows the previous batch wrote are all in):
 * `[slot − 30 min, slot − 15 min)`, and the hour to `slot − 15 min` for the hourly p95s. A window with no rows
 * records nothing.
 */
export function sli(reads: SliReads, meter: Meter = metrics.getMeter('skyclause')) {
  const gauges = Object.fromEntries(SLIS.map((key) => [key, meter.createGauge(METRICS[key])])) as Record<
    Sli,
    ReturnType<Meter['createGauge']>
  >
  const record = (metric: Sli, stats: Partial<Record<SliStat, number>>, attributes: Attributes = {}) => {
    for (const [stat, value] of Object.entries(stats)) gauges[metric].record(value, { ...attributes, stat })
  }

  return async (now: Date) => {
    const slot = Math.floor(now.getTime() / BATCH) * BATCH
    const to = new Date(slot - BATCH)
    const window = { from: new Date(slot - 2 * BATCH), to }
    const hour = { from: new Date(to.getTime() - 60 * MINUTE), to }

    const pending = [
      reads.pollSlots?.(window) ?? [],
      reads.latestPollSlots?.(to, TARGET.missedInARow) ?? [],
      reads.storedReadings(window),
      reads.evaluations?.(hour) ?? [],
      reads.reviews(hour),
      reads.approverAlerts(window),
      reads.latestApproverAlerts(to, TARGET.failedInARow),
      reads.handovers(hour),
      reads.slaDue(window)
    ] as const
    // Every read settles before the handler does: the batch's shared connection refuses a call made after that.
    await Promise.allSettled(pending)
    const [slots, latestSlots, readings, evaluations, reviews, alerts, latestAlerts, handovers, sla] =
      await Promise.all(pending)

    for (const [adapter, rows] of byAdapter(slots)) {
      record(
        'pollsOnSchedule',
        {
          slots: rows.length,
          on_time: rows.filter((r) => r.startedAt && seconds(r.slotAt, r.startedAt) <= TARGET.pollStartS).length,
          missed: rows.filter((r) => !r.startedAt).length
        },
        { adapter }
      )
    }
    for (const [adapter, rows] of byAdapter(latestSlots)) {
      const missed = inARow(
        rows,
        (r) => r.slotAt,
        (r) => !r.startedAt
      )
      record('pollsOnSchedule', { missed_in_a_row: missed, breach: Number(missed >= TARGET.missedInARow) }, { adapter })
    }

    for (const [adapter, rows] of byAdapter(readings)) {
      const lags = rows.map((r) => seconds(r.polledAt, r.storedAt))
      record(
        'readingStored',
        {
          readings: rows.length,
          late: lags.filter((s) => s > TARGET.storedAfterPollS).length,
          max_s: Math.max(...lags)
        },
        { adapter }
      )
    }

    if (evaluations.length) {
      const value = p95(evaluations.map((r) => seconds(r.receivedAt, r.evaluatedAt)))
      record('readingToVerdict', {
        evaluations: evaluations.length,
        p95_s: value,
        breach: Number(value > TARGET.readingToVerdictS)
      })
    }

    if (reviews.length) {
      const value = p95(reviews.map((r) => seconds(r.crossingAt, r.needsReviewAt)))
      record('crossingToNeedsReview', {
        bundles: reviews.length,
        p95_s: value,
        breach: Number(value > TARGET.crossingToNeedsReviewS)
      })
    }

    const alertFailed = (r: ApproverAlert) =>
      !r.acceptedAt || seconds(r.needsReviewAt, r.acceptedAt) > TARGET.approverAlertS
    if (alerts.length) {
      const accepted = alerts.flatMap((r) => (r.acceptedAt ? [seconds(r.needsReviewAt, r.acceptedAt)] : []))
      record('approverAlerted', {
        bundles: alerts.length,
        within_60s: alerts.filter((r) => !alertFailed(r)).length,
        ...(accepted.length && { p95_s: p95(accepted) })
      })
    }
    if (latestAlerts.length) {
      const failed = inARow(latestAlerts, (r) => r.needsReviewAt, alertFailed)
      record('approverAlerted', { failed_in_a_row: failed, breach: Number(failed >= TARGET.failedInARow) })
    }

    if (handovers.length) {
      const accepted = handovers.flatMap((r) => (r.acceptedAt ? [seconds(r.approvedAt, r.acceptedAt)] : []))
      const within = accepted.filter((s) => s <= TARGET.approvalToProviderS).length
      record('approvalToProvider', {
        notices: handovers.length,
        within_60s: within,
        ...(accepted.length && { p95_s: p95(accepted) }),
        breach: Number(within / handovers.length < TARGET.approvalToProviderShare)
      })
    }

    if (sla.length) {
      const breached = sla.filter((r) => !r.decidedAt || r.decidedAt > r.dueAt)
      const unescalated = breached.filter((r) => !r.escalatedAt).length
      record('approvalSla', {
        due: sla.length,
        breached: breached.length,
        unescalated,
        breach: Number(unescalated > 0)
      })
    }
  }
}

/** The `sli` batch handler over the database's timestamps; `meter` is for tests. */
export function createSliPart(meter?: Meter): WorkerPart {
  return { owner: 'a-observability', batch: { sli: (now) => sli(databaseReads(), meter)(now) } }
}

export const sliPart = createSliPart()
