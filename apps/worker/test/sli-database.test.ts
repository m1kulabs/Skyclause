import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'
import { systemPrincipal, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeApproval,
  makeBundle,
  makeBundleAlert,
  makeCall,
  makeCrossing,
  makeNotice,
  makeOrganization,
  makePoll,
  makeProject,
  makeReading,
  makeRun,
  makeSource
} from '@skyclause/db/test/factories/index'
import { expect, test } from 'vitest'
import { createSliPart } from '../src/sli'

// a-observability: the `sli` batch handler over factory rows in the test database, with an injected clock. `at` is a
// time on 6 November 2026 (UTC), plus seconds.
const at = (hhmm: string, seconds = 0) => new Date(Date.parse(`2026-11-06T${hhmm}:00Z`) + seconds * 1000)

const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

/** Runs the registered batch handler at `now` and returns every recorded point as `metric stat [adapter]` → value. */
async function measure(now: Date) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const provider = new MeterProvider({ readers: [new PeriodicExportingMetricReader({ exporter })] })
  await createSliPart(provider.getMeter('test')).batch!.sli!(now)
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

test('an empty database gives no data, never zero latency', async () => {
  expect(await measure(batch)).toEqual({})
})

test('each SLI from the stored timestamps of every organisation', async () => {
  // NFR-1 storage: catalogue sources, their scheduled polls and the readings the batch stored from them.
  await withSystem('test', async (tx) => {
    const rain = await makeSource(tx, { kind: 'jps_rain' })
    const apims = await makeSource(tx, { kind: 'apims' })
    const stored = async (sourceId: string, polled: string, after: number, purpose = 'poll') => {
      const poll = await makePoll(tx, { sourceId, startedAt: at(polled), purpose })
      await makeReading(tx, { sourceId, pollId: poll.id, observedAt: at(polled), receivedAt: at(polled, after) })
    }
    await stored(rain.id, '09:20', 600)
    await stored(rain.id, '09:15', 16 * 60) // late
    await stored(rain.id, '09:25', 600, 'backfill') // not a scheduled poll
    await stored(rain.id, '09:44', 60) // stored at 09:45, after the window
    await stored(apims.id, '09:33', 420)
  })

  const a = (await makeOrganization()).id
  const b = (await makeOrganization()).id

  // A bundle in Needs review at `reviewAt`, from a run serving `crossings` (its own key, then coalesced ones).
  const reviewed = async (
    tx: Tx,
    projectId: string,
    reviewAt: string,
    crossings: string[],
    extra: Parameters<typeof makeBundle>[1] = {}
  ) => {
    const keys = []
    for (const crossingAt of crossings)
      keys.push(`crossing:${(await makeCrossing(tx, { projectId, at: at(crossingAt) })).id}`)
    const run = await makeRun(tx, {
      projectId,
      status: 'drafted',
      ...(keys.length && { trigger: 'crossing', dedupeKey: keys[0], coalescedKeys: keys.slice(1) })
    })
    return makeBundle(tx, { runId: run.id, state: 'needs_review', needsReviewAt: at(reviewAt), ...extra })
  }
  const approved = async (tx: Tx, bundleId: string, approvedAt: string) =>
    makeCall(tx, { bundleId, state: 'approved', approvedAt: at(approvedAt) })
  const handedOver = async (tx: Tx, projectId: string, callId: string, acceptedAt: Date | null, extra = {}) =>
    makeNotice(tx, { projectId, callId, ...(acceptedAt && { status: 'sent', acceptedAt }), ...extra })

  await inOrg(a, async (tx) => {
    const { id: projectId } = await makeProject(tx)
    // Crossing to needs review: 60 s, and 4 minutes from the earlier of two coalesced crossings.
    const first = await reviewed(tx, projectId, '09:01', ['09:00'])
    await reviewed(tx, projectId, '09:14', ['09:10', '09:12'])
    // Approver alerts: the on-duty alert accepted after 30 s; a later bundle reached only by its escalation.
    const requested = await reviewed(tx, projectId, '09:30', [])
    await makeBundleAlert(tx, { bundleId: requested.id, acceptedAt: at('09:30', 30) })
    const unalerted = await reviewed(tx, projectId, '09:42', [])
    await makeBundleAlert(tx, { bundleId: unalerted.id, acceptedAt: at('09:42', 20), level: 'next_approver' })
    // Approved in the app 40 s after Needs review, before its alert was due: not a failed alert.
    await reviewed(tx, projectId, '09:35', [], { state: 'approved', approvedAt: at('09:35', 40) })
    // Approval to provider: two notices accepted after 10 and 40 s; a suppressed recipient is never handed over.
    const call = await approved(tx, first.id, '09:05')
    await handedOver(tx, projectId, call.id, at('09:05', 10))
    await handedOver(tx, projectId, call.id, at('09:05', 40))
    await handedOver(tx, projectId, call.id, null, { status: 'suppressed' })
    // Calls approved before and after the hour.
    for (const approvedAt of ['08:30', '09:50']) {
      const outside = await approved(tx, first.id, approvedAt)
      await handedOver(tx, projectId, outside.id, at(approvedAt, 5))
    }
    // Approval SLA: approved in time; breached but escalated; superseded by a newer draft before it fell due.
    const decided = await reviewed(tx, projectId, '09:01', [], { slaDueAt: at('09:31') })
    await makeApproval(tx, { bundleId: decided.id, createdAt: at('09:29') })
    const escalated = await reviewed(tx, projectId, '09:05', [], { slaDueAt: at('09:35') })
    await makeApproval(tx, { bundleId: escalated.id, action: 'escalate', createdAt: at('09:20') })
    const successor = await makeBundle(tx, { runId: first.runId, createdAt: at('09:36') })
    await reviewed(tx, projectId, '09:11', [], {
      slaDueAt: at('09:41'),
      state: 'superseded',
      supersededBy: successor.id
    })
  })

  await inOrg(b, async (tx) => {
    const { id: projectId } = await makeProject(tx)
    const bundle = await reviewed(tx, projectId, '09:22', ['09:20'])
    const alerted = await reviewed(tx, projectId, '09:38', [])
    await makeBundleAlert(tx, { bundleId: alerted.id, acceptedAt: at('09:39', 30) })
    // Approved 90 s after Needs review with no alert: its alert was due, so it failed.
    await reviewed(tx, projectId, '09:40', [], { state: 'approved', approvedAt: at('09:41', 30) })
    const call = await approved(tx, bundle.id, '09:25')
    await handedOver(tx, projectId, call.id, at('09:26', 15))
    await handedOver(tx, projectId, call.id, null)
    await reviewed(tx, projectId, '09:10', [], { slaDueAt: at('09:40') })
    // Alerted in time, but after the window: the next batch's, not part of this one's streak.
    const next = await reviewed(tx, projectId, '09:50', [])
    await makeBundleAlert(tx, { bundleId: next.id, acceptedAt: at('09:50', 10) })
  })

  expect(await measure(batch)).toEqual({
    'skyclause.reading_stored readings jps_rain': 2,
    'skyclause.reading_stored late jps_rain': 1,
    'skyclause.reading_stored max_s jps_rain': 960,
    'skyclause.reading_stored readings apims': 1,
    'skyclause.reading_stored late apims': 0,
    'skyclause.reading_stored max_s apims': 420,
    'skyclause.crossing_to_needs_review bundles': 3,
    'skyclause.crossing_to_needs_review p95_s': 240,
    'skyclause.crossing_to_needs_review breach': 1,
    'skyclause.approver_alerted bundles': 4,
    'skyclause.approver_alerted within_60s': 1,
    'skyclause.approver_alerted p95_s': 90,
    'skyclause.approver_alerted failed_in_a_row': 2,
    'skyclause.approver_alerted breach': 1,
    'skyclause.approval_to_provider notices': 4,
    'skyclause.approval_to_provider within_60s': 2,
    'skyclause.approval_to_provider p95_s': 75,
    'skyclause.approval_to_provider breach': 1,
    'skyclause.approval_sla due': 4,
    'skyclause.approval_sla breached': 2,
    'skyclause.approval_sla unescalated': 1,
    'skyclause.approval_sla breach': 1
  })
})
