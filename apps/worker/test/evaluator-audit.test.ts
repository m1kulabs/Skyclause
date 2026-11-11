import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics'
import { afterEach, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { withTenant, systemPrincipal, project, source, type Tx } from '@skyclause/db'
import {
  makeOrganization,
  makeMember,
  makeProject,
  makeSource,
  makeReading,
  makePoll,
  makeProjectSource
} from '../../../packages/db/test/factories'
import { createAuditRegistry, auditChecks } from '../src/auditor/registry'
import { createAuditor } from '../src/auditor'
import { registerEvaluatorAuditChecks } from '../src/evaluator/audit'
import { recordUsedReadingLatency } from '../src/evaluator/measurement'

const origin = Date.parse('2026-11-11T02:00:00Z')
const instant = (seconds: number) => new Date(origin + seconds * 1000)
const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})
async function scene() {
  const orgId = (await makeOrganization()).id
  const owner = await makeMember({ organizationId: orgId, role: 'owner' })
  const admin = await makeMember({ organizationId: orgId, role: 'admin' })
  await makeMember({ organizationId: orgId, role: 'viewer' })
  const run = <T>(fn: (tx: Tx) => Promise<T>) =>
    withTenant({ orgId, principal: systemPrincipal('test-evaluator-audit') }, fn)
  const parent = await run((tx) => makeProject(tx, { cameraDayStart: '09:00:00', cameraDayEnd: '17:00:00' }))
  cleanup.push(() =>
    run((tx) =>
      tx
        .update(project)
        .set({ archivedAt: instant(0) })
        .where(eq(project.id, parent.id))
    )
  )
  const registry = createAuditRegistry()
  registerEvaluatorAuditChecks(registry.register)
  const check = (name: string, seconds: number) =>
    run((tx) =>
      registry
        .checks()
        .find((c) => c.name === name)!
        .run(tx, instant(seconds).toISOString())
    )
  return { orgId, run, parent, registry, check, admins: [owner.userId, admin.userId].sort() }
}
test.each([
  ['jps_rain', 600, 'observed'],
  ['met_warning', 1200, 'polled'],
  ['apims', 7200, 'polled'],
  ['pi', 3600, 'observed'],
  ['camera', 1200, 'observed']
] as const)(
  '%s silence uses its actual evidence clock, scoped admins and exact threshold',
  async (kind, threshold, freshness) => {
    const s = await scene()
    const input = await s.run(async (tx) => {
      const input = await makeSource(tx, { kind, freshness, probation: false, meta: { project_id: s.parent.id } })
      await makeProjectSource(tx, { projectId: s.parent.id, sourceId: input.id, createdAt: instant(-60) })
      await makeReading(tx, {
        sourceId: input.id,
        observedAt: instant(freshness === 'polled' ? -86400 : 0),
        receivedAt: instant(0)
      })
      await makePoll(tx, { sourceId: input.id, startedAt: instant(0), receivedAt: instant(0) })
      return input
    })
    expect(await s.check('evaluator-source-silent', threshold - 1)).toEqual([])
    const findings = await s.check('evaluator-source-silent', threshold)
    expect(findings).toEqual([
      {
        key: `source:${s.parent.id}:${input.id}`,
        projectId: s.parent.id,
        accountIds: s.admins,
        ref: { type: 'source', id: input.id }
      }
    ])
    // An error poll does not reset the last-good clock.
    await s.run((tx) =>
      makePoll(tx, {
        sourceId: input.id,
        startedAt: instant(threshold),
        receivedAt: instant(threshold),
        outcome: 'error',
        httpStatus: 503
      })
    )
    expect(await s.check('evaluator-source-silent', threshold + 1)).toEqual(findings)
    await s.run(async (tx) => {
      await makeReading(tx, {
        sourceId: input.id,
        observedAt: instant(threshold + 2),
        receivedAt: instant(threshold + 2)
      })
      await makePoll(tx, { sourceId: input.id, startedAt: instant(threshold + 2), receivedAt: instant(threshold + 2) })
    })
    expect(await s.check('evaluator-source-silent', threshold + 3)).toEqual([])
    const other = await scene()
    expect(await other.check('evaluator-source-silent', threshold + 3)).toEqual([])
  }
)
test('camera probation, off-hours, unknown parent and archived projects cannot raise silence', async () => {
  const s = await scene()
  const input = await s.run(async (tx) => {
    const input = await makeSource(tx, { kind: 'camera', probation: true, meta: { project_id: s.parent.id } })
    await makeProjectSource(tx, { projectId: s.parent.id, sourceId: input.id, createdAt: instant(-86400) })
    await makeReading(tx, { sourceId: input.id, observedAt: instant(-86400), receivedAt: instant(-86400) })
    return input
  })
  expect(await s.check('evaluator-source-silent', 1200)).toEqual([])
  await s.run((tx) => tx.update(source).set({ probation: false }).where(eq(source.id, input.id)))
  expect(await s.check('evaluator-source-silent', 7 * 3600)).toEqual([]) //17:00 MYT
  expect(await s.check('evaluator-source-silent', -3601)).toEqual([]) //08:59:59 MYT
  expect(await s.check('evaluator-source-silent', -2401)).toEqual([]) //09:19:59 MYT
  expect(await s.check('evaluator-source-silent', -2400)).toHaveLength(1)
  await s.run((tx) => tx.update(source).set({ meta: {} }).where(eq(source.id, input.id)))
  expect(await s.check('evaluator-source-silent', 1200)).toEqual([])
  await s.run(async (tx) => {
    await tx
      .update(source)
      .set({ meta: { project_id: s.parent.id } })
      .where(eq(source.id, input.id))
    await tx
      .update(project)
      .set({ archivedAt: instant(0) })
      .where(eq(project.id, s.parent.id))
  })
  expect(await s.check('evaluator-source-silent', 1200)).toEqual([])
})
test('Rapid Rail overdue reads the latest eligible metadata, never mutable catalogue next_update', async () => {
  const s = await scene()
  const input = await s.run(async (tx) => {
    const input = await makeSource(tx, { kind: 'rapidrail_od', meta: { next_update: '2000-01-01T00:00:00Z' } })
    await makeProjectSource(tx, { projectId: s.parent.id, sourceId: input.id, createdAt: instant(-60) })
    await makeReading(tx, {
      sourceId: input.id,
      metric: 'metadata',
      observedAt: instant(-60),
      receivedAt: instant(0),
      value: null,
      valueJson: {
        data_as_of: '2026-11-11',
        last_updated: '2026-11-11',
        next_update: '2026-11-11',
        data_as_of_utc: instant(-120).toISOString(),
        last_updated_utc: instant(-60).toISOString(),
        next_update_utc: instant(0).toISOString()
      }
    })
    return input
  })
  expect(await s.check('evaluator-rapidrail-overdue', 7199)).toEqual([])
  expect(await s.check('evaluator-rapidrail-overdue', 7200)).toEqual([
    {
      key: `rapidrail:${s.parent.id}:${input.id}`,
      projectId: s.parent.id,
      accountIds: s.admins,
      ref: { type: 'source', id: input.id }
    }
  ])
  await s.run((tx) =>
    makeReading(tx, {
      sourceId: input.id,
      metric: 'metadata',
      observedAt: instant(7201),
      receivedAt: instant(7201),
      value: null,
      valueJson: {
        data_as_of: '2026-11-11',
        last_updated: '2026-11-11',
        next_update: '2026-11-12',
        data_as_of_utc: instant(-120).toISOString(),
        last_updated_utc: instant(7201).toISOString(),
        next_update_utc: instant(86400).toISOString()
      }
    })
  )
  expect(await s.check('evaluator-rapidrail-overdue', 7202)).toEqual([])
})
test('isolated real auditor opens and recovers once without activating production checks', async () => {
  const before = auditChecks().map((c) => c.name)
  await import('../src/registry')
  expect(
    auditChecks()
      .map((c) => c.name)
      .filter((n) => n.startsWith('evaluator-'))
  ).toEqual([])
  expect(auditChecks().map((c) => c.name)).toEqual(expect.arrayContaining(before))
  const s = await scene()
  expect(() => registerEvaluatorAuditChecks(s.registry.register)).toThrow('duplicate audit check')
  const input = await s.run(async (tx) => {
    const input = await makeSource(tx, { kind: 'jps_rain' })
    await makeProjectSource(tx, { projectId: s.parent.id, sourceId: input.id, createdAt: instant(-60) })
    await makeReading(tx, { sourceId: input.id, observedAt: instant(0), receivedAt: instant(0) })
    return input
  })
  const sent: boolean[] = []
  const auditor = createAuditor({
    checks: () => s.registry.checks(),
    notify: async (_tx, q) => {
      sent.push(q.recovered ?? false)
    },
    heartbeat: () => {}
  })
  await auditor.batch!.auditor!(instant(900))
  await auditor.batch!.auditor!(instant(901))
  await s.run((tx) => makeReading(tx, { sourceId: input.id, observedAt: instant(902), receivedAt: instant(902) }))
  await auditor.batch!.auditor!(instant(903))
  expect(sent).toEqual([false, true])
})
test('latency records actual committed receipt-to-use once, with no unused, timer or rollback samples', async () => {
  const s = await scene()
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const meter = new MeterProvider({ readers: [new PeriodicExportingMetricReader({ exporter })] })
  try {
    const rows = await s.run(async (tx) => {
      const input = await makeSource(tx)
      const poll = await makePoll(tx, { sourceId: input.id, startedAt: instant(-86400), receivedAt: instant(0) })
      const used = await makeReading(tx, {
        sourceId: input.id,
        pollId: poll.id,
        observedAt: instant(-86400),
        receivedAt: instant(0)
      })
      const unused = await makeReading(tx, {
        sourceId: input.id,
        pollId: poll.id,
        observedAt: instant(-86300),
        receivedAt: instant(0)
      })
      return { poll, used, unused }
    })
    const q = {
      projectId: s.parent.id,
      pack: 'sky' as const,
      pollId: rows.poll.id,
      readingIds: [rows.used.id],
      tEval: instant(15).toISOString()
    }
    const points = async () => {
      await meter.forceFlush()
      return (
        exporter
          .getMetrics()
          .flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))
          .filter((m) => m.descriptor.name === 'skyclause.reading_to_shadow_verdict')
          .at(-1)
          ?.dataPoints.map((p) => p.value) ?? []
      )
    }
    await s.run(async (tx) => {
      await recordUsedReadingLatency(tx, q, meter.getMeter('test'))
      expect(await points()).toEqual([])
    })
    await s.run((tx) => recordUsedReadingLatency(tx, q, meter.getMeter('test')))
    await s.run((tx) => recordUsedReadingLatency(tx, { ...q, readingIds: [] }, meter.getMeter('test')))
    await expect(
      s.run(async (tx) => {
        await recordUsedReadingLatency(tx, { ...q, readingIds: [rows.unused.id] }, meter.getMeter('test'))
        throw new Error('rollback')
      })
    ).rejects.toThrow('rollback')
    expect(await points()).toMatchObject([{ count: 1, sum: 15, min: 15, max: 15 }])
  } finally {
    await meter.shutdown()
  }
})
