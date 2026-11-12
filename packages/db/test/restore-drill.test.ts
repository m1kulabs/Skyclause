// #224: packages/db's side of the restore drill, the DrillDatabase port of apps/worker/src/restore-drill/drill.ts.
import { sql } from 'drizzle-orm'
import { expect, test, vi } from 'vitest'
import { appendLedger, drillDatabase, withSystem, withTenant, type Tx } from '../src'
import { makeAnalyticsEvent, makeDomainEvent, makeOrganization, makeProject } from './factories'
import { asLogin, databaseNow, memberOf } from './harness'

/** 2 ms on the database clock: a JS Date holds milliseconds, and the stamps microseconds. */
const pause = () => asLogin('postgres', (client) => client.query('SELECT pg_sleep(0.002)'))

/** The database clock after a pause, so every row stamped before the call is at or before it. */
async function cutoff() {
  await pause()
  return databaseNow()
}

test('read(host) opens system on the compute at `host`, and closes that connection once `fn` settles', async () => {
  // A host that can't resolve: DATABASE_URL_SYSTEM's own host would have connected.
  await expect(drillDatabase.read('drill.invalid', (db) => db.projectIds())).rejects.toThrow('ENOTFOUND')

  // The test database's host by another name, standing in for a branch compute.
  const host = new URL(process.env.DATABASE_URL_SYSTEM!).hostname === 'localhost' ? '127.0.0.1' : 'localhost'
  const backend = () =>
    withSystem('restore-drill-test', async (tx) => {
      const { rows } = await tx.execute<{ pid: number; user: string }>(
        sql`SELECT pg_backend_pid() AS pid, current_user AS user`
      )
      return rows[0]!
    })
  const inside = await drillDatabase.read(host, () => backend())
  expect(inside.user).toBe('system')
  // The client is ended when `read` settles; its server process exits a moment later.
  await vi.waitFor(async () => {
    const { rows } = await asLogin('postgres', (client) =>
      client.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1', [inside.pid])
    )
    expect(rows[0].n).toBe(0)
  })
})

test('projectIds lists every organisation’s projects, and verifyLedger walks each chain as system in its organisation', async () => {
  const projects = []
  for (let i = 0; i < 2; i++) {
    const orgId = (await makeOrganization()).id
    projects.push(
      await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
        const { id } = await makeProject(tx)
        const first = await appendLedger(tx, { projectId: id, kind: 'grade', refs: {}, body: { n: 1 } })
        const head = await appendLedger(tx, { projectId: id, kind: 'grade', refs: {}, body: { n: 2 } })
        return { id, first, head }
      })
    )
  }
  const [intact, broken] = projects as [(typeof projects)[0], (typeof projects)[0]]
  await asLogin('postgres', async (client) => {
    await client.query('BEGIN')
    await client.query('ALTER TABLE ledger_entry DISABLE TRIGGER append_only')
    await client.query(`UPDATE ledger_entry SET body = '{"n": 9}' WHERE id = $1`, [broken.first.id])
    await client.query('ALTER TABLE ledger_entry ENABLE TRIGGER append_only')
    await client.query('COMMIT')
  })

  const walked = await drillDatabase.read(null, async (db) => {
    const ids = await db.projectIds()
    return { ids, verdicts: [await db.verifyLedger(intact.id), await db.verifyLedger(broken.id)] }
  })

  expect(walked.ids).toEqual(expect.arrayContaining([intact.id, broken.id]))
  expect(walked.verdicts).toEqual([
    { ok: true, count: 2, head_hash: intact.head.hash },
    expect.objectContaining({ ok: false, first_bad: { id: broken.first.id, seq: 1, reason: 'hash' } })
  ])
})

test('newestWrite is the newest database-stamped write at or before `at`, and a row committed after `at` is not counted', async () => {
  const orgId = (await makeOrganization()).id
  const asMember = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
  const newestWrite = (at: Date) => drillDatabase.read(null, (db) => db.newestWrite(at))

  expect(await newestWrite(new Date('2026-01-01T00:00:00Z'))).toBeNull()
  // Each table in turn holds the newest write.
  const writes = [
    () => asMember(async (tx) => (await makeDomainEvent(tx)).createdAt),
    () => withSystem('restore-drill-test', async (tx) => (await makeAnalyticsEvent(tx)).at)
  ]
  let newest: Date | undefined
  for (const write of writes) {
    newest = await write()
    expect(await newestWrite(await cutoff())).toEqual(newest)
  }

  // A row of each table committed after `at`.
  const at = await cutoff()
  await pause()
  for (const write of writes) {
    expect((await write()).getTime()).toBeGreaterThan(at.getTime())
    expect(await newestWrite(at)).toEqual(newest)
  }
})
