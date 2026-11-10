import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'
import { expect, test } from 'vitest'
import {
  sli,
  type ApproverAlert,
  type Evaluation,
  type Handover,
  type PollSlot,
  type Review,
  type SlaDue,
  type SliReads,
  type StoredReading
} from '../src/sli'

// Factory rows, one per timestamp pair the SLIs read. `at` is a time on 6 November 2026 (UTC); `after` is seconds.
const at = (hhmm: string, seconds = 0) => new Date(Date.parse(`2026-11-06T${hhmm}:00Z`) + seconds * 1000)
const later = (from: Date, seconds: number | null) =>
  seconds === null ? null : new Date(from.getTime() + seconds * 1000)

const slot = (adapter: string, hhmm: string, after: number | null): PollSlot => ({
  adapter,
  slotAt: at(hhmm),
  startedAt: later(at(hhmm), after)
})
const stored = (adapter: string, hhmm: string, after: number): StoredReading => ({
  adapter,
  polledAt: at(hhmm),
  storedAt: at(hhmm, after)
})
const evaluation = (hhmm: string, after: number): Evaluation => ({ receivedAt: at(hhmm), evaluatedAt: at(hhmm, after) })
const review = (hhmm: string, after: number): Review => ({ crossingAt: at(hhmm), needsReviewAt: at(hhmm, after) })
const alerted = (hhmm: string, after: number | null): ApproverAlert => ({
  needsReviewAt: at(hhmm),
  acceptedAt: later(at(hhmm), after)
})
const handover = (hhmm: string, after: number | null): Handover => ({
  approvedAt: at(hhmm),
  acceptedAt: later(at(hhmm), after)
})
const due = (hhmm: string, decided: number | null, escalated: number | null): SlaDue => ({
  dueAt: at(hhmm),
  decidedAt: later(at(hhmm), decided),
  escalatedAt: later(at(hhmm), escalated)
})

interface Tables {
  slots?: PollSlot[]
  readings?: StoredReading[]
  evaluations?: Evaluation[]
  reviews?: Review[]
  alerts?: ApproverAlert[]
  handovers?: Handover[]
  sla?: SlaDue[]
}

/** A `SliReads` double over in-memory rows, keeping each read's window rule. */
function readsOver(tables: Tables): SliReads {
  const inWindow = (time: Date, window: { from: Date; to: Date }) => time >= window.from && time < window.to
  const latest = <T>(rows: T[], time: (row: T) => Date, before: Date, count: number) =>
    rows
      .filter((row) => time(row) < before)
      .sort((a, b) => time(b).getTime() - time(a).getTime())
      .slice(0, count)
  const slots = tables.slots ?? []
  return {
    pollSlots: async (w) => slots.filter((row) => inWindow(row.slotAt, w)),
    latestPollSlots: async (before, count) =>
      [...new Set(slots.map((row) => row.adapter))].flatMap((adapter) =>
        latest(
          slots.filter((row) => row.adapter === adapter),
          (row) => row.slotAt,
          before,
          count
        )
      ),
    storedReadings: async (w) => (tables.readings ?? []).filter((row) => inWindow(row.storedAt, w)),
    evaluations: async (w) => (tables.evaluations ?? []).filter((row) => inWindow(row.evaluatedAt, w)),
    reviews: async (w) => (tables.reviews ?? []).filter((row) => inWindow(row.needsReviewAt, w)),
    approverAlerts: async (w) => (tables.alerts ?? []).filter((row) => inWindow(row.needsReviewAt, w)),
    latestApproverAlerts: async (before, count) =>
      latest(tables.alerts ?? [], (row) => row.needsReviewAt, before, count),
    handovers: async (w) => (tables.handovers ?? []).filter((row) => inWindow(row.approvedAt, w)),
    slaDue: async (w) => (tables.sla ?? []).filter((row) => inWindow(row.dueAt, w))
  }
}

/** Runs the handler at `now` and returns every recorded point as `metric stat [adapter]` → value. */
async function measure(tables: Tables, now: Date, reads = readsOver(tables)) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const provider = new MeterProvider({ readers: [new PeriodicExportingMetricReader({ exporter })] })
  await sli(reads, provider.getMeter('test'))(now)
  await provider.forceFlush()
  const points: Record<string, number> = {}
  for (const metric of exporter.getMetrics().flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))) {
    for (const point of metric.dataPoints) {
      const { stat, adapter } = point.attributes
      points[[metric.descriptor.name, stat, adapter].filter(Boolean).join(' ')] = point.value as number
    }
  }
  await provider.shutdown()
  return points
}

// The batch at 10:00 reads one batch behind: [09:30, 09:45), and [08:45, 09:45) for the hourly SLIs.
const batch = at('10:07', 12)

test('empty tables give no data, never zero latency', async () => {
  expect(await measure({}, batch)).toEqual({})
})

test('each SLI from its rows, one batch behind the clock', async () => {
  const points = await measure(
    {
      slots: [
        slot('jps_rain', '09:25', 5), // before the window: counts only towards the latest three
        slot('jps_rain', '09:30', 20),
        slot('jps_rain', '09:35', 90), // late, not missed
        slot('jps_rain', '09:40', null),
        slot('jps_rain', '09:45', null), // not settled yet
        slot('apims', '07:00', null),
        slot('apims', '08:00', null),
        slot('apims', '09:00', null)
      ],
      readings: [
        stored('jps_rain', '09:20', 600),
        stored('jps_rain', '09:15', 16 * 60),
        stored('jps_rain', '09:44', 60)
      ],
      // Twenty evaluations 1 to 20 minutes after their reading; nearest-rank p95 is the 19th, 19 minutes.
      evaluations: [
        ...Array.from({ length: 20 }, (_, i) => evaluation('09:00', (i + 1) * 60)),
        evaluation('09:44', 3600) // evaluated at 10:44, outside the hour
      ],
      reviews: [review('09:00', 60), review('09:10', 120), review('09:20', 240)],
      alerts: [alerted('09:31', 30), alerted('09:38', 90), alerted('09:42', null)],
      handovers: [
        handover('09:00', 10),
        handover('09:05', 20),
        handover('09:10', 30),
        handover('09:15', 40),
        handover('09:20', 75)
      ],
      sla: [due('09:31', -120, null), due('09:35', 300, 2), due('09:40', null, null)]
    },
    batch
  )
  expect(points).toEqual({
    'skyclause.polls_on_schedule slots jps_rain': 3,
    'skyclause.polls_on_schedule on_time jps_rain': 1,
    'skyclause.polls_on_schedule missed jps_rain': 1,
    'skyclause.polls_on_schedule missed_in_a_row jps_rain': 1,
    'skyclause.polls_on_schedule breach jps_rain': 0,
    'skyclause.polls_on_schedule missed_in_a_row apims': 3,
    'skyclause.polls_on_schedule breach apims': 1,
    'skyclause.reading_stored readings jps_rain': 2,
    'skyclause.reading_stored late jps_rain': 1,
    'skyclause.reading_stored max_s jps_rain': 960,
    'skyclause.reading_to_verdict evaluations': 20,
    'skyclause.reading_to_verdict p95_s': 1140,
    'skyclause.reading_to_verdict breach': 1,
    'skyclause.crossing_to_needs_review bundles': 3,
    'skyclause.crossing_to_needs_review p95_s': 240,
    'skyclause.crossing_to_needs_review breach': 1,
    'skyclause.approver_alerted bundles': 3,
    'skyclause.approver_alerted within_60s': 1,
    'skyclause.approver_alerted p95_s': 90,
    'skyclause.approver_alerted failed_in_a_row': 2,
    'skyclause.approver_alerted breach': 1,
    'skyclause.approval_to_provider notices': 5,
    'skyclause.approval_to_provider within_60s': 4,
    'skyclause.approval_to_provider p95_s': 75,
    'skyclause.approval_to_provider breach': 1,
    'skyclause.approval_sla due': 3,
    'skyclause.approval_sla breached': 2,
    'skyclause.approval_sla unescalated': 1,
    'skyclause.approval_sla breach': 1
  })
})

test('targets met record breach 0', async () => {
  const points = await measure(
    {
      slots: [slot('jps_rain', '09:30', 5), slot('jps_rain', '09:35', 5), slot('jps_rain', '09:40', 5)],
      evaluations: [evaluation('09:20', 900)],
      reviews: [review('09:20', 170)],
      alerts: [alerted('09:31', 30), alerted('09:38', 59)],
      handovers: [handover('09:20', 60)],
      sla: [due('09:31', -1, null)]
    },
    batch
  )
  expect(
    Object.fromEntries(
      Object.entries(points).filter(([key]) => / (breach|missed_in_a_row|failed_in_a_row)( |$)/.test(key))
    )
  ).toEqual({
    'skyclause.polls_on_schedule missed_in_a_row jps_rain': 0,
    'skyclause.polls_on_schedule breach jps_rain': 0,
    'skyclause.reading_to_verdict breach': 0,
    'skyclause.crossing_to_needs_review breach': 0,
    'skyclause.approver_alerted failed_in_a_row': 0,
    'skyclause.approver_alerted breach': 0,
    'skyclause.approval_to_provider breach': 0,
    'skyclause.approval_sla breach': 0
  })
})

test('a batch late in its slot reads the same windows', async () => {
  const tables = { reviews: [review('08:45', 10), review('09:44', 10), review('09:45', 10)] }
  expect(await measure(tables, at('10:14', 59))).toEqual(await measure(tables, at('10:00')))
  expect((await measure(tables, at('10:00')))['skyclause.crossing_to_needs_review bundles']).toBe(2)
})

test('an SLI whose read is absent records nothing', async () => {
  const tables = { slots: [slot('jps_rain', '09:30', 5)], evaluations: [evaluation('09:20', 900)] }
  const { pollSlots: _slots, latestPollSlots: _latest, evaluations: _evaluations, ...reads } = readsOver(tables)
  expect(await measure(tables, batch, reads)).toEqual({})
})

test('a failed read fails the batch only once every other read has settled', async () => {
  let settled = false
  const reads: SliReads = {
    ...readsOver({}),
    storedReadings: () => Promise.reject(new Error('connection lost')),
    slaDue: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      settled = true
      return []
    }
  }
  await expect(sli(reads, new MeterProvider().getMeter('test'))(batch)).rejects.toThrow('connection lost')
  expect(settled).toBe(true)
})
