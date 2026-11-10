import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { auditFinding, runAuditCheck, shareSystemConnection, withSystem, type Tx } from '../src'

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const probe = (tx: Tx) =>
  tx
    .insert(auditFinding)
    .values({ check: 'late', key: 'probe', accountIds: [], refType: 'test', refId: 'late', openedAt: new Date() })

for (const mode of ['builder', 'prepared', 'relational', 'count', 'all', 'nested'] as const) {
  test(`late ${mode} never executes after the next transaction starts`, async () => {
    let late!: () => Promise<unknown>
    await shareSystemConnection(async () => {
      await expect(
        withSystem('auditor', (tx) =>
          runAuditCheck(
            tx,
            async (handle) => {
              const scoped = handle as Tx
              if (mode === 'builder') {
                const q = probe(scoped)
                late = () => q.execute()
              }
              if (mode === 'prepared') {
                const q = probe(scoped).prepare('late_probe')
                late = () => q.execute()
              }
              if (mode === 'relational') {
                const q = scoped.query.auditFinding.findMany()
                late = () => q.execute()
              }
              if (mode === 'count') {
                const q = scoped.$count(auditFinding)
                late = async () => await q
              }
              if (mode === 'all') {
                late = () => scoped._.session.all(sql`SELECT 1`)
              }
              if (mode === 'nested') {
                await scoped.transaction(async (nested) => {
                  const q = probe(nested as Tx)
                  late = () => q.execute()
                })
              }
              await new Promise(() => {})
            },
            40
          )
        )
      ).rejects.toThrow(/deadline/)
      await withSystem('auditor', async (tx) => {
        await expect(late()).rejects.toThrow(/scope|deadline/)
        expect(await tx.select().from(auditFinding)).toEqual([])
      })
    })
  })
}

test('later callback resolution cannot submit SQL', async () => {
  const gate = deferred()
  let outcome!: Promise<unknown>
  await expect(
    withSystem('auditor', (tx) =>
      runAuditCheck(
        tx,
        async (handle) => {
          outcome = gate.promise.then(() => probe(handle as Tx).execute()).catch((e) => e)
          await outcome
        },
        30
      )
    )
  ).rejects.toThrow(/deadline/)
  gate.resolve()
  expect(await outcome).toBeInstanceOf(Error)
  expect(await withSystem('auditor', (tx) => tx.select().from(auditFinding))).toEqual([])
})

test('slow SQL cancels and queued statements expire before submission on the same connection', async () => {
  let sqlError: unknown
  let queuedError: unknown
  await shareSystemConnection(async () => {
    const before = await withSystem('auditor', (tx) => tx.execute(sql`SELECT pg_backend_pid() AS pid`))
    const started = performance.now()
    await expect(
      withSystem('auditor', (tx) =>
        runAuditCheck(
          tx,
          async (handle) => {
            const scoped = handle as Tx
            const slow = scoped.execute(sql`SELECT pg_sleep(5)`).catch((e) => {
              sqlError = e
            })
            const queued = probe(scoped)
              .execute()
              .catch((e) => {
                queuedError = e
              })
            await Promise.all([slow, queued])
          },
          70
        )
      )
    ).rejects.toThrow()
    expect(performance.now() - started).toBeLessThan(2000)
    expect(sqlError).toMatchObject({ cause: { code: '57014' } })
    expect(queuedError).toBeInstanceOf(Error)
    await withSystem('auditor', async (tx) => {
      const after = await tx.execute(sql`SELECT pg_backend_pid() AS pid`)
      expect(after.rows).toEqual(before.rows)
      expect(await tx.select().from(auditFinding)).toEqual([])
    })
  })
})

test('a caught SQL error still fails the check and leaves the next transaction usable', async () => {
  await shareSystemConnection(async () => {
    await expect(
      withSystem('auditor', (tx) =>
        runAuditCheck(tx, async (handle) => {
          await (handle as Tx).execute(sql`SELECT 1 / 0`).catch(() => {})
          return []
        })
      )
    ).rejects.toMatchObject({ cause: { code: '22012' } })
    expect((await withSystem('auditor', (tx) => tx.execute(sql`SELECT 1 AS ok`))).rows).toEqual([{ ok: 1 }])
  })
})

test('normal return revokes detached work and restores the prior timeout', async () => {
  let late!: () => Promise<unknown>
  await withSystem('auditor', async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '2s'`)
    expect(
      await runAuditCheck(tx, async (handle) => {
        late = () => probe(handle as Tx).execute()
        return 42
      })
    ).toBe(42)
    await expect(late()).rejects.toThrow(/scope/)
    expect((await tx.execute(sql`SHOW statement_timeout`)).rows).toEqual([{ statement_timeout: '2s' }])
  })
})

test('normal return drains already submitted detached SQL before releasing the transaction', async () => {
  let detached!: Promise<unknown>
  let settled = false
  await expect(
    withSystem('auditor', (tx) =>
      runAuditCheck(
        tx,
        async (handle) => {
          detached = (handle as Tx)
            .execute(sql`SELECT pg_sleep(5)`)
            .catch((e) => e)
            .finally(() => {
              settled = true
            })
          await pause(20)
          return []
        },
        80
      )
    )
  ).rejects.toThrow()
  expect(settled).toBe(true)
  await detached
})

test('live scope supports parallel requests, count, relational, prepared and nested queries', async () => {
  await withSystem('auditor', (tx) =>
    runAuditCheck(tx, async (handle) => {
      const scoped = handle as Tx
      expect(scoped.principal).toEqual(tx.principal)
      expect(scoped.orgId).toBe(tx.orgId)
      const [rows, count, relational] = await Promise.all([
        scoped.select().from(auditFinding).prepare('live_probe').execute(),
        scoped.$count(auditFinding),
        scoped.query.auditFinding.findMany()
      ])
      expect(rows).toEqual([])
      expect(count).toBe(0)
      expect(relational).toEqual([])
      await scoped.transaction(async (nested) => {
        expect((await nested.execute(sql`SELECT 1 AS ok`)).rows).toEqual([{ ok: 1 }])
      })
    })
  )
})
