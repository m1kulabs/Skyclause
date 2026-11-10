import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { Principal } from '@skyclause/contracts'
import { shareSystemConnection, withSystem, withTenant, type Tx } from '../src'
import { connection } from '../src/client'
import { makeOrganization } from './factories'

const pid = async (tx: Tx<Principal | null>) =>
  Number((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0]!.pid)

test('inside shareSystemConnection, withSystem and withTenant for a system principal use one connection in turn', async () => {
  const orgId = (await makeOrganization()).id
  const pids = await shareSystemConnection(async () => {
    const first = await withSystem('batch', pid)
    const tenant = await withSystem('batch', async (tx) => tx.principal).then((principal) =>
      withTenant({ orgId, principal }, pid)
    )
    // Siblings started together take turns rather than interleave their transactions.
    const together = await Promise.all([
      withSystem('batch', async (tx) => (await tx.execute(sql`SELECT pg_sleep(0.05)`), pid(tx))),
      withSystem('batch', pid)
    ])
    return [first, tenant, ...together]
  })
  expect(new Set(pids).size).toBe(1)
})

test('a with* call nested in another on the shared connection throws instead of deadlocking', async () => {
  await expect(
    shareSystemConnection(() => withSystem('batch', () => withSystem('batch', async () => 'inner')))
  ).rejects.toThrow(/needs a second connection/)
  // Outside it, nesting uses the pool as usual.
  expect(await withSystem('batch', () => withSystem('batch', async () => 'inner'))).toBe('inner')
})

test('a with* call left running after shareSystemConnection settles fails instead of using a returned connection', async () => {
  let late: Promise<unknown> = Promise.resolve()
  await shareSystemConnection(async () => {
    late = new Promise((resolve) => setTimeout(resolve, 20)).then(() => withSystem('batch', async () => 'late'))
  })
  await expect(late).rejects.toThrow(/was released/)
})

test('a broken shared client rejects queued transactions without entering their callbacks', async () => {
  let entered = false
  let brokenPid = 0
  await expect(
    shareSystemConnection(async () => {
      const broken = withSystem('auditor', async (tx) => {
        brokenPid = await pid(tx)
        await tx.execute(sql`SELECT pg_terminate_backend(pg_backend_pid())`)
      })
      const queued = withSystem('auditor', async () => {
        entered = true
      })
      const outcomes = await Promise.allSettled([broken, queued])
      expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected'])
    })
  ).rejects.toThrow(/terminated/)
  expect(entered).toBe(false)
  expect(await withSystem('auditor', pid)).not.toBe(brokenPid)
})

test('shared connections retain only the permanent client error listener after release', async () => {
  for (let i = 0; i < 3; i++) {
    await shareSystemConnection(() => withSystem('auditor', pid))
    const client = await connection('SYSTEM').pool.connect()
    try {
      // pg-pool removes its idle listener on acquisition; only the permanent logger remains, never a batch listener.
      expect(client.listenerCount('error')).toBe(1)
    } finally {
      client.release()
    }
  }
})

test('a with* call made while a left-running one holds the shared connection as it ends fails instead of running after it', async () => {
  let left: Promise<unknown> = Promise.resolve()
  let late: Promise<unknown> = Promise.resolve()
  let ran = false
  await shareSystemConnection(async () => {
    left = withSystem('batch', (tx) => tx.execute(sql`SELECT pg_sleep(0.2)`))
    // Called while the share waits for `left`; its expectation is attached at once, before the share settles.
    late = expect(
      new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
        withSystem('batch', async () => {
          ran = true
        })
      )
    ).rejects.toThrow(/was released/)
  })
  await late
  expect(ran).toBe(false)
  await left
})
