import { randomUUID } from 'node:crypto'
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { log, startTelemetry } from '@skyclause/config'
import type { EmailTransport, Notify, RegisterAuditCheck } from '@skyclause/contracts'
import {
  auditEvent,
  auditFinding,
  project,
  run,
  shareSystemConnection,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createAuditor } from '../src/auditor'
import { createAuditRegistry } from '../src/auditor/registry'

type Check = Parameters<RegisterAuditCheck>[0]
const now = new Date('2026-11-09T12:00:00Z')
const finding = () => ({
  key: 'silent',
  projectId: null,
  accountIds: [randomUUID()],
  ref: { type: 'source', id: 'gauge' }
})
const tickOf = (options: Parameters<typeof createAuditor>[0]) => createAuditor(options).batch!.auditor!
const stored = () => withSystem('auditor', (tx) => tx.select().from(auditFinding))
function barrier() {
  let count = 0
  let resolve!: () => void
  const gate = new Promise<void>((r) => {
    resolve = r
  })
  return async () => {
    if (++count === 2) resolve()
    await gate
  }
}
beforeEach(async () => {
  await asLogin('postgres', (client) =>
    client.query('DELETE FROM audit_finding; DELETE FROM project; DELETE FROM auth.organization')
  )
  vi.spyOn(log, 'warn').mockImplementation(() => {})
  vi.spyOn(log, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

test('duplicate names throw and snapshots cannot change after registration', () => {
  const registry = createAuditRegistry()
  const check = { name: 'gauge', run: async () => [] }
  registry.register(check)
  const snapshot = registry.checks()
  expect(() => registry.register(check)).toThrow(/duplicate/i)
  registry.register({ ...check, name: 'crossing' })
  check.name = 'changed'
  expect(snapshot.map((c) => c.name)).toEqual(['gauge'])
  expect(registry.checks().map((c) => c.name)).toEqual(['gauge', 'crossing'])
})

test('minute-five opening plus 30 present ticks and recovery sends two notices; reopen has a new id', async () => {
  const orgId = (await makeOrganization()).id
  const initial = finding()
  let present = false
  const notify = vi.fn<Notify>(async () => {})
  const heartbeat = vi.fn()
  const check: Check = {
    name: 'gauge',
    run: async (handle, clock) => {
      expect((handle as Tx).principal).toEqual(systemPrincipal('auditor'))
      expect((handle as Tx).orgId).toBe(orgId)
      expect(clock).toMatch(/^2026-11-09T/)
      return present ? [initial, initial] : []
    }
  }
  const tick = tickOf({ checks: () => [check], notify, heartbeat })
  await tick(now)
  present = true
  await tick(new Date(now.getTime() + 5 * 60_000))
  expect(notify).toHaveBeenCalledTimes(1)
  const first = (await stored())[0]!
  for (let i = 1; i <= 30; i++) await tick(new Date(now.getTime() + (5 + i * 15) * 60_000))
  expect(notify).toHaveBeenCalledTimes(1)
  present = false
  await tick(new Date(now.getTime() + 500 * 60_000))
  await tick(new Date(now.getTime() + 515 * 60_000))
  expect(notify).toHaveBeenCalledTimes(2)
  expect(notify.mock.calls[0]![1]).toEqual({ accountIds: initial.accountIds, kind: 'auditor', ref: initial.ref })
  expect(notify.mock.calls[1]![1]).toEqual({ ...notify.mock.calls[0]![1], recovered: true })
  present = true
  await tick(new Date(now.getTime() + 530 * 60_000))
  expect(notify).toHaveBeenCalledTimes(3)
  expect((await stored()).find((r) => r.recoveredAt === null)?.id).not.toBe(first.id)
  expect(heartbeat).toHaveBeenCalledTimes(35)
  await withTenant({ orgId, principal: systemPrincipal('auditor') }, async (tx) => {
    expect(await tx.$count(run)).toBe(0)
    // Project factories are not used in this test, so no audit events predate the auditor.
    expect(await tx.$count(auditEvent)).toBe(0)
  })
})

for (const recovery of [false, true])
  test(`concurrent ${recovery ? 'recovery' : 'opening'} has one row transition and one notify`, async () => {
    await makeOrganization()
    const value = finding()
    const notify = vi.fn<Notify>(async () => {})
    if (recovery) await tickOf({ checks: () => [{ name: 'race', run: async () => [value] }], notify })(now)
    notify.mockClear()
    const sync = barrier()
    const tick = tickOf({
      checks: () => [
        {
          name: 'race',
          run: async () => {
            await sync()
            return recovery ? [] : [value]
          }
        }
      ],
      notify
    })
    // Separate scopes are separate physical connections; this is not serialization on one shared connection.
    await Promise.all([shareSystemConnection(() => tick(now)), shareSystemConnection(() => tick(now))])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0]![1].recovered).toBe(recovery ? true : undefined)
    expect(await stored()).toHaveLength(1)
  })

test('A SQL failure preserves A, tenant visibility excludes B, and B runs on the same connection', async () => {
  const a = (await makeOrganization()).id
  const b = (await makeOrganization()).id
  for (const [orgId, count] of [
    [a, 1],
    [b, 2]
  ] as const) {
    await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
      for (let i = 0; i < count; i++) await makeProject(tx)
    })
  }
  const counts = new Map<string, number>()
  let failA = false
  const value = finding()
  const notify = vi.fn<Notify>(async () => {})
  const tick = tickOf({
    checks: () => [
      {
        name: 'tenant',
        run: async (handle) => {
          const tx = handle as Tx
          counts.set(tx.orgId!, await tx.$count(project))
          if (failA && tx.orgId === a) await tx.execute(sql`SELECT 1 / 0`)
          return failA ? [] : [value]
        }
      }
    ],
    notify
  })
  await shareSystemConnection(() => tick(now))
  failA = true
  await shareSystemConnection(() => tick(now))
  expect(counts).toEqual(
    new Map([
      [a, 1],
      [b, 2]
    ])
  )
  expect((await stored()).map((r) => [r.orgId, r.recoveredAt !== null]).sort()).toEqual(
    [
      [a, false],
      [b, true]
    ].sort()
  )
  expect(notify).toHaveBeenCalledTimes(3)
  expect(log.error).toHaveBeenCalledWith(
    'auditor check failed',
    expect.objectContaining({ check: 'tenant', orgId: a, failures: 1 })
  )
})

test('platform runs once, deduplicates staff, routes required mail fields and recovers', async () => {
  await makeOrganization()
  await makeOrganization()
  const value = finding()
  let present = true
  const checkRun = vi.fn<Check['run']>(async (handle) => {
    expect((handle as Tx).orgId).toBeNull()
    return present ? [value] : []
  })
  const notify = vi.fn<Notify>(async () => {})
  const send = vi.fn<EmailTransport['send']>(async () => ({ providerMessageId: 'test' }))
  const tick = tickOf({
    checks: () => [{ name: 'kek', scope: 'platform', run: checkRun }],
    notify,
    email: { send },
    staffEmails: () => [' a@example.org ', 'a@example.org', '', 'b@example.org']
  })
  await tick(now)
  await tick(now)
  expect(checkRun).toHaveBeenCalledTimes(2)
  expect(send).toHaveBeenCalledTimes(2)
  const row = (await stored())[0]!
  expect(send.mock.calls.map(([m]) => m.to)).toEqual(['a@example.org', 'b@example.org'])
  for (const [message] of send.mock.calls) {
    expect(message).toMatchObject({ from: 'system', category: 'auditor', idempotencyKey: `auditor:${row.id}:opened` })
    expect(message.subject).toContain('kek')
    expect(message.text).toContain('gauge')
    expect(message.text).toContain('silent')
  }
  present = false
  await tick(now)
  expect(send).toHaveBeenCalledTimes(4)
  expect(send.mock.calls[2]![0].idempotencyKey).toBe(`auditor:${row.id}:recovered`)
  expect(notify).not.toHaveBeenCalled()
})

test('platform concurrent ticks send once, and rejects non-null projects', async () => {
  const send = vi.fn<EmailTransport['send']>(async () => ({ providerMessageId: 'test' }))
  const sync = barrier()
  const tick = tickOf({
    checks: () => [
      {
        name: 'platform',
        scope: 'platform',
        run: async () => {
          await sync()
          return [finding()]
        }
      }
    ],
    email: { send },
    staffEmails: () => ['a@example.org']
  })
  await Promise.all([tick(now), tick(now)])
  expect(send).toHaveBeenCalledTimes(1)
  await tickOf({
    checks: () => [
      { name: 'invalid', scope: 'platform', run: async () => [{ ...finding(), projectId: randomUUID() }] }
    ],
    email: { send },
    staffEmails: () => ['a@example.org']
  })(now)
  expect(send).toHaveBeenCalledTimes(1)
  expect(await stored()).toHaveLength(1)
})

test('empty org and platform recipients store and warn without sending', async () => {
  await makeOrganization()
  const notify = vi.fn<Notify>(async () => {})
  const send = vi.fn<EmailTransport['send']>(async () => ({ providerMessageId: 'test' }))
  const tick = tickOf({
    checks: () => [
      { name: 'org', run: async () => [{ ...finding(), accountIds: [] }] },
      { name: 'platform', scope: 'platform', run: async () => [finding()] }
    ],
    notify,
    email: { send },
    staffEmails: () => []
  })
  await tick(now)
  expect(await stored()).toHaveLength(2)
  expect(log.warn).toHaveBeenCalledTimes(2)
  expect(notify).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

test('mail rejection rolls back; partial-recipient retry can resend accepted messages', async () => {
  let fail = true
  const accepted: string[] = []
  const send: EmailTransport['send'] = async (m) => {
    if (fail && m.to === 'b@example.org') throw new Error('mail rejected')
    accepted.push(m.to)
    return { providerMessageId: 'test' }
  }
  const tick = tickOf({
    checks: () => [{ name: 'mail', scope: 'platform', run: async () => [finding()] }],
    email: { send },
    staffEmails: () => ['a@example.org', 'b@example.org']
  })
  await tick(now)
  expect(await stored()).toEqual([])
  fail = false
  await tick(now)
  expect(await stored()).toHaveLength(1)
  expect(accepted).toEqual(['a@example.org', 'a@example.org', 'b@example.org'])
})

test('completion heartbeat excludes fatal ticks, includes isolated check failures, and exports an OTel gauge', async () => {
  await makeOrganization()
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  const telemetry = startTelemetry('worker', {
    env: { APP_ENV: 'test', WORKER_URL: 'https://worker.example.org', WORKER_INVOKER_SA: 'worker@example.org' },
    metricExporter: exporter,
    traceExporter: new InMemorySpanExporter(),
    write: () => {}
  })
  try {
    const tick = tickOf({
      checks: () => [
        {
          name: 'fails',
          run: async () => {
            throw new Error('check failed')
          }
        }
      ]
    })
    await tick(now)
    await telemetry.flush()
    const points = () =>
      exporter
        .getMetrics()
        .flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))
        .filter((m) => m.descriptor.name === 'skyclause.heartbeat')
        .flatMap((m) => m.dataPoints.map((p) => ({ attributes: p.attributes, value: p.value })))
    expect(points().map((p) => [p.attributes, p.value])).toEqual([[{ name: 'auditor' }, 1]])
    exporter.reset()
    vi.stubEnv('DATABASE_URL_SYSTEM', '')
    await expect(tick(now)).rejects.toThrow(/DATABASE_URL_SYSTEM/)
    await telemetry.flush()
    expect(points()).toEqual([])
  } finally {
    await telemetry.shutdown()
  }
})

test('20-second timeout preserves an open finding and revokes the late callback', async () => {
  await makeOrganization()
  const notify = vi.fn<Notify>(async () => {})
  await tickOf({ checks: () => [{ name: 'timeout', run: async () => [finding()] }], notify })(now)
  let late!: Tx
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  let lateOutcome!: Promise<unknown>
  const tick = tickOf({
    checks: () => [
      {
        name: 'timeout',
        run: async (tx) => {
          late = tx as Tx
          lateOutcome = gate.then(() => late.select().from(auditFinding).execute()).catch((e) => e)
          await lateOutcome
          return []
        }
      }
    ],
    notify
  })
  await shareSystemConnection(() => tick(now))
  release()
  expect(await lateOutcome).toBeInstanceOf(Error)
  expect((await stored())[0]!.recoveredAt).toBeNull()
  expect(notify).toHaveBeenCalledTimes(1)
}, 30_000)

test('notification rejection rolls back the opening and the next tick retries', async () => {
  await makeOrganization()
  let reject = true
  const notify = vi.fn<Notify>(async () => {
    if (reject) throw new Error('notification store unavailable')
  })
  const value = finding()
  const tick = tickOf({ checks: () => [{ name: 'notify-retry', run: async () => [value] }], notify })
  await tick(now)
  expect(await stored()).toEqual([])
  reject = false
  await tick(now)
  expect(await stored()).toHaveLength(1)
  expect(notify).toHaveBeenCalledTimes(2)
})

test('default notification dependency remains the real unbuilt seam until its owner lands', async () => {
  await makeOrganization()
  await tickOf({ checks: () => [{ name: 'real-notify', run: async () => [finding()] }] })(now)
  expect(await stored()).toEqual([])
  expect(log.error).toHaveBeenCalledWith(
    'auditor check failed',
    expect.objectContaining({ error: expect.stringContaining('c-notifications') })
  )
})

test('staff addresses are read lazily from the worker environment', async () => {
  const send = vi.fn<EmailTransport['send']>(async () => ({ providerMessageId: 'test' }))
  const tick = tickOf({
    checks: () => [{ name: 'env-staff', scope: 'platform', run: async () => [finding()] }],
    email: { send }
  })
  vi.stubEnv('SKYCLAUSE_STAFF_EMAILS', ' a@example.org, a@example.org, b@example.org, ')
  await tick(now)
  expect(send.mock.calls.map(([m]) => m.to)).toEqual(['a@example.org', 'b@example.org'])
})

test('a terminated check connection is fatal and emits no completion heartbeat', async () => {
  await makeOrganization()
  const heartbeat = vi.fn()
  const tick = tickOf({
    heartbeat,
    checks: () => [
      {
        name: 'broken-transport',
        run: async (handle) => {
          // Terminate only this test's active connection: rollback cannot succeed, so traversal must stop.
          await (handle as Tx).execute(sql`SELECT pg_terminate_backend(pg_backend_pid())`)
          return []
        }
      }
    ]
  })
  await expect(shareSystemConnection(() => tick(now))).rejects.toThrow()
  expect(heartbeat).not.toHaveBeenCalled()
  expect(log.error).not.toHaveBeenCalledWith('auditor check failed', expect.anything())
  expect(await stored()).toEqual([])
})
