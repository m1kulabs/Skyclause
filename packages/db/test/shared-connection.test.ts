import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import type { Principal } from '@skyclause/contracts'
import { shareSystemConnection, withSystem, withTenant, type Tx } from '../src'
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
