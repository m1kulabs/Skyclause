// #112 (a-retention): the nightly sweepers and runner on the #79 §7 test database, with an injected clock, an
// in-memory bucket double and an `eraseSubscriber` double (until #110 merges). Every comparison is strict: a row
// exactly on its boundary stays until the next run, and a rerun the same night deletes 0.

import { randomUUID } from 'node:crypto'
import type { EraseSubscriber } from '@skyclause/contracts'
import { log } from '@skyclause/config'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import {
  domainEvent,
  eraseSubscriber,
  exportJob,
  handledEvent,
  handledMessage,
  idempotencyKey,
  rateLimit,
  runRetentionSweep,
  subscriber,
  sweepDomainEvents,
  sweepExportFiles,
  sweepFrames,
  sweepIdempotencyKeys,
  sweepRateLimits,
  sweepSubscribers,
  SWEEPERS,
  systemPrincipal,
  withRetention,
  withSystem,
  withTenant,
  type RetentionBuckets,
  type RetentionObject,
  type SweepDeps,
  type SystemPrincipal,
  type Tx
} from '../src'
import {
  makeDomainEvent,
  makeExportJob,
  makeHandledMessage,
  makeHandledEvent,
  makeOrganization,
  makeProject,
  makeSubscriber
} from './factories'
import { makeIdempotencyKey } from './factories/idempotency_key'
import { makeRateLimit } from './factories/rate_limit'

const DAY_MS = 24 * 60 * 60 * 1_000
/** 03:30 MYT on 9 November 2026, the nightly run's hour. */
const NOW = new Date('2026-11-08T19:30:00.000Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS)

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
const retain = <T>(fn: (tx: Tx<SystemPrincipal>) => Promise<T>) => withRetention('test', fn)

/** An in-memory bucket: `delete` on a missing object is a no-op that records the call, like GCS `ignoreNotFound`. */
function memoryBucket(objects: RetentionObject[] = []) {
  const store = new Map(objects.map((object) => [object.name, object]))
  const deleted: string[] = []
  const bucket = {
    async list(prefix: string) {
      return [...store.values()].filter(({ name }) => name.startsWith(prefix))
    },
    async delete(name: string) {
      deleted.push(name)
      store.delete(name)
    }
  }
  return { bucket, store, deleted }
}

const emptyBuckets = (): RetentionBuckets => ({ frames: memoryBucket().bucket, exports: memoryBucket().bucket })

const frame = (name: string, overrides: Partial<RetentionObject> = {}): RetentionObject => ({
  name,
  metadata: {},
  timeCreated: ago(10),
  customTime: null,
  ...overrides
})

/** #110's erasure as a double that deletes the row; the real one also clears the subscriber's tokens and notices. */
const deletingErase: EraseSubscriber = async (handle, id) => {
  await (handle as unknown as Tx).delete(subscriber).where(eq(subscriber.id, id))
}

/** #110's erasure as a double that keeps the row under a pseudonymous ID: outside the sweep's filter, like the real one. */
const pseudonymisingErase: EraseSubscriber = async (handle, id) => {
  await (handle as unknown as Tx)
    .update(subscriber)
    .set({ email: `${id}@deleted.invalid`, emailHash: null, unsubscribedAt: NOW })
    .where(eq(subscriber.id, id))
}

const deps = (eraseSubscriber: EraseSubscriber, buckets: RetentionBuckets = emptyBuckets()): SweepDeps => ({
  eraseSubscriber,
  buckets
})

const findSubscriber = (tx: Tx, id: string) => tx.query.subscriber.findFirst({ where: eq(subscriber.id, id) })

describe('sweepSubscribers', () => {
  afterEach(() => vi.unstubAllEnvs())

  test.each([1, 1_000])('skips %i pseudonymised subscribers after another 30 days', async (size) => {
    vi.stubEnv('EMAIL_HASH_KEY', 'test-only-email-hash-key-0123456789abcdef')
    const ownOrgId = (await makeOrganization()).id
    const inOwnOrg = <T>(fn: (tx: Tx) => Promise<T>) =>
      withTenant({ orgId: ownOrgId, principal: systemPrincipal('test') }, fn)
    const erased = await inOwnOrg(async (tx) => {
      const row = await makeSubscriber(tx, { unsubscribedAt: ago(31) })
      await eraseSubscriber(tx, row.id)
      return (await findSubscriber(tx, row.id))!
    })
    if (size > 1) {
      await inOwnOrg((tx) =>
        tx.insert(subscriber).values(
          Array.from({ length: size - 1 }, () => {
            const id = randomUUID()
            return {
              id,
              orgId: ownOrgId,
              projectId: erased.projectId,
              email: `${id}@deleted.invalid`,
              emailHash: null,
              unsubscribedAt: erased.unsubscribedAt
            }
          })
        )
      )
    }
    const later = new Date(erased.unsubscribedAt!.getTime() + 31 * DAY_MS)
    // Fail immediately if a tombstone is selected, so the full-batch regression cannot loop forever.
    const rejectResweep: EraseSubscriber = async () => {
      throw new Error('already pseudonymised subscriber selected again')
    }
    expect(await retain((tx) => sweepSubscribers(tx, { orgId: ownOrgId, now: later }, deps(rejectResweep)))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
    const due = await inOwnOrg((tx) =>
      makeSubscriber(tx, { projectId: erased.projectId, unsubscribedAt: erased.unsubscribedAt })
    )
    const eraseDue: EraseSubscriber = async (_handle, id) => {
      if (id !== due.id) throw new Error('already pseudonymised subscriber selected again')
      await inOwnOrg((tx) => eraseSubscriber(tx, id))
    }
    expect(await retain((tx) => sweepSubscribers(tx, { orgId: ownOrgId, now: later }, deps(eraseDue)))).toEqual({
      deleted: 0,
      pseudonymised: 1
    })
  })

  test('erases rows unsubscribed more than 30 days ago, keeps the rest, and a rerun deletes 0', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const past = await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(31) }))
    const inside = await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(29) }))
    const boundary = await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(30) }))
    expect(await retain((tx) => sweepSubscribers(tx, { orgId, now: NOW }, deps(deletingErase)))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    await inOrg(async (tx) => {
      expect(await findSubscriber(tx, past.id)).toBeUndefined()
      expect(await findSubscriber(tx, inside.id)).toBeDefined()
      expect(await findSubscriber(tx, boundary.id)).toBeDefined()
    })
    expect(await retain((tx) => sweepSubscribers(tx, { orgId, now: NOW }, deps(deletingErase)))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
  })

  test('counts a kept row as pseudonymised, and never touches another organisation', async () => {
    const other = (await makeOrganization()).id
    const inOther = <T>(fn: (tx: Tx) => Promise<T>) =>
      withTenant({ orgId: other, principal: systemPrincipal('test') }, fn)
    const kept = await inOther((tx) => makeSubscriber(tx, { unsubscribedAt: ago(60) }))
    const project = await inOrg((tx) => makeProject(tx))
    const due = await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(31) }))
    expect(await retain((tx) => sweepSubscribers(tx, { orgId, now: NOW }, deps(pseudonymisingErase)))).toEqual({
      deleted: 0,
      pseudonymised: 1
    })
    await inOrg(async (tx) => {
      expect(await findSubscriber(tx, due.id)).toBeDefined()
    })
    await inOther(async (tx) => {
      expect(await findSubscriber(tx, kept.id)).toBeDefined()
    })
    expect(await retain((tx) => sweepSubscribers(tx, { orgId, now: NOW }, deps(pseudonymisingErase)))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
  })
})

describe('sweepFrames', () => {
  test('deletes frames past the semester end or 183 days, keeps the rest, and a rerun deletes 0', async () => {
    const prefix = `orgs/${orgId}/`
    const { bucket, store } = memoryBucket([
      frame(`${prefix}old.jpg`, { timeCreated: ago(200) }),
      frame(`${prefix}semester.jpg`, { timeCreated: ago(10), customTime: ago(1) }),
      frame(`${prefix}fresh.jpg`, { timeCreated: ago(10) }),
      frame(`${prefix}boundary.jpg`, { timeCreated: ago(183) }),
      frame(`${prefix}term-boundary.jpg`, { timeCreated: ago(10), customTime: NOW }),
      { name: prefix, metadata: {}, timeCreated: ago(400), customTime: null }
    ])
    const full = deps(deletingErase, { frames: bucket, exports: memoryBucket().bucket })
    expect(await retain((tx) => sweepFrames(tx, { orgId, now: NOW }, full))).toEqual({
      deleted: 2,
      pseudonymised: 0
    })
    expect([...store.keys()].sort()).toEqual(
      [`${prefix}boundary.jpg`, `${prefix}fresh.jpg`, `${prefix}term-boundary.jpg`, prefix].sort()
    )
    expect(await retain((tx) => sweepFrames(tx, { orgId, now: NOW }, full))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
  })

  test('reads the capture time from captured-at metadata, falling back to upload time', async () => {
    const prefix = `orgs/${orgId}/meta/`
    const { bucket } = memoryBucket([
      frame(`${prefix}stale.jpg`, { metadata: { 'captured-at': ago(200).toISOString() }, timeCreated: ago(1) }),
      frame(`${prefix}fresh.jpg`, { metadata: { 'captured-at': ago(1).toISOString() }, timeCreated: ago(200) })
    ])
    const full = deps(deletingErase, { frames: bucket, exports: memoryBucket().bucket })
    expect(await retain((tx) => sweepFrames(tx, { orgId, now: NOW }, full))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    expect((await bucket.list(prefix)).map(({ name }) => name)).toEqual([`${prefix}fresh.jpg`])
  })
})

describe('sweepExportFiles', () => {
  test('deletes expired files by object path, keeps the job row, and a rerun deletes 0', async () => {
    const { bucket, deleted } = memoryBucket([
      frame(`orgs/${orgId}/exports/past.zip`, {}),
      frame(`orgs/${orgId}/exports/inside.zip`, {})
    ])
    // #109 allows one queued or running export per organisation; a finished export has its file.
    const past = await inOrg((tx) =>
      makeExportJob(tx, { status: 'ready', expiresAt: ago(1), objectPath: `orgs/${orgId}/exports/past.zip` })
    )
    const inside = await inOrg((tx) =>
      makeExportJob(tx, {
        status: 'ready',
        expiresAt: new Date(NOW.getTime() + DAY_MS),
        objectPath: `orgs/${orgId}/exports/inside.zip`
      })
    )
    const boundary = await inOrg((tx) =>
      makeExportJob(tx, { status: 'ready', expiresAt: NOW, objectPath: `orgs/${orgId}/exports/past.zip` })
    )
    await inOrg((tx) => makeExportJob(tx, { status: 'failed', expiresAt: ago(1), objectPath: null }))
    const full = deps(deletingErase, { frames: memoryBucket().bucket, exports: bucket })
    expect(await retain((tx) => sweepExportFiles(tx, { orgId, now: NOW }, full))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    expect(deleted).toEqual([`orgs/${orgId}/exports/past.zip`])
    await inOrg(async (tx) => {
      for (const row of [past, inside, boundary])
        expect(await tx.select({ id: exportJob.id }).from(exportJob).where(eq(exportJob.id, row.id))).toHaveLength(1)
    })
    expect(await retain((tx) => sweepExportFiles(tx, { orgId, now: NOW }, full))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
  })

  test('sweeps account-scope rows with no organisation', async () => {
    // #109 keeps an account export under `accounts/{account_id}/exports/`.
    const path = `accounts/${randomUUID()}/exports/past.zip`
    const { bucket, deleted } = memoryBucket([frame(path, {})])
    await withSystem('test', (tx) =>
      makeExportJob(tx, {
        scope: 'account',
        orgId: null,
        accountId: path.split('/')[1],
        status: 'ready',
        expiresAt: ago(1),
        objectPath: path
      })
    )
    const full = deps(deletingErase, { frames: memoryBucket().bucket, exports: bucket })
    expect(await retain((tx) => sweepExportFiles(tx, { orgId: null, now: NOW }, full))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    expect(deleted).toEqual([path])
  })
})

describe('sweepIdempotencyKeys', () => {
  test('deletes rows whose expiresAt has passed, keeps the rest', async () => {
    const past = await withSystem('test', (tx) => makeIdempotencyKey(tx, { expiresAt: ago(1) }))
    const inside = await withSystem('test', (tx) =>
      makeIdempotencyKey(tx, { expiresAt: new Date(NOW.getTime() + 1_000) })
    )
    const boundary = await withSystem('test', (tx) => makeIdempotencyKey(tx, { expiresAt: NOW }))
    const before = await retain((tx) => tx.select({ id: idempotencyKey.id }).from(idempotencyKey))
    expect(new Set(before.map(({ id }) => id)).has(past.id)).toBe(true)
    expect(await retain((tx) => sweepIdempotencyKeys(tx, { orgId: null, now: NOW }))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    const after = await retain((tx) => tx.select({ id: idempotencyKey.id }).from(idempotencyKey))
    const afterIds = new Set(after.map(({ id }) => id))
    expect(afterIds.has(past.id)).toBe(false)
    expect(afterIds.has(inside.id)).toBe(true)
    expect(afterIds.has(boundary.id)).toBe(true)
    // A rerun the same night deletes 0.
    expect(await retain((tx) => sweepIdempotencyKeys(tx, { orgId: null, now: NOW }))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
    await retain(async (tx) => {
      for (const row of [inside, boundary]) await tx.delete(idempotencyKey).where(eq(idempotencyKey.id, row.id))
    })
  })
})

describe('sweepRateLimits', () => {
  test('deletes expired windows, keeps live ones and the boundary second, and a rerun deletes 0', async () => {
    const past = await withSystem('test', (tx) => makeRateLimit(tx, { resetAt: ago(1) }))
    const inside = await withSystem('test', (tx) => makeRateLimit(tx, { resetAt: new Date(NOW.getTime() + 1_000) }))
    const boundary = await withSystem('test', (tx) => makeRateLimit(tx, { resetAt: NOW }))
    expect(await retain((tx) => sweepRateLimits(tx, { orgId: null, now: NOW }))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    const remaining = await retain((tx) => tx.select({ bucket: rateLimit.bucket }).from(rateLimit))
    const buckets = new Set(remaining.map(({ bucket }) => bucket))
    expect(buckets.has(past.bucket)).toBe(false)
    expect(buckets.has(inside.bucket)).toBe(true)
    expect(buckets.has(boundary.bucket)).toBe(true)
    expect(await retain((tx) => sweepRateLimits(tx, { orgId: null, now: NOW }))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
    await retain(async (tx) => {
      for (const row of [inside, boundary]) await tx.delete(rateLimit).where(eq(rateLimit.bucket, row.bucket))
    })
  })
})

describe('sweepDomainEvents', () => {
  test('deletes published rows older than 30 days with their handled marks, and a rerun deletes 0', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const published = (at: Date | null) =>
      inOrg((tx) => makeDomainEvent(tx, { projectId: project.id, publishedAt: at }))
    const past = await published(ago(31))
    await inOrg((tx) => makeHandledEvent(tx, { eventId: past.id, consumer: 'a' }))
    await inOrg((tx) => makeHandledEvent(tx, { eventId: past.id, consumer: 'b' }))
    const inside = await published(ago(29))
    const boundary = await published(ago(30))
    const unpublished = await published(null)
    expect(await retain((tx) => sweepDomainEvents(tx, { orgId: null, now: NOW }))).toEqual({
      deleted: 1,
      pseudonymised: 0
    })
    await inOrg(async (tx) => {
      const events = new Set((await tx.select({ id: domainEvent.id }).from(domainEvent)).map(({ id }) => id))
      expect(events.has(past.id)).toBe(false)
      for (const row of [inside, boundary, unpublished]) expect(events.has(row.id)).toBe(true)
      expect(
        await tx.select({ eventId: handledEvent.eventId }).from(handledEvent).where(eq(handledEvent.eventId, past.id))
      ).toHaveLength(0)
    })
    expect(await retain((tx) => sweepDomainEvents(tx, { orgId: null, now: NOW }))).toEqual({
      deleted: 0,
      pseudonymised: 0
    })
  })
})

describe('sweepHandledMessages', () => {
  test('deletes marks older than one day, keeps the boundary and newer marks, and a rerun deletes 0', async () => {
    const sweeper = SWEEPERS.find(({ name }) => name === 'handled-messages')
    expect(sweeper?.name).toBe('handled-messages')
    if (!sweeper) return

    const consumer = `retention-${Date.now()}`
    const add = (handledAt: Date) => inOrg((tx) => makeHandledMessage(tx, { consumer, handledAt }))
    await add(ago(2))
    const boundary = await add(ago(1))
    const recent = await add(new Date(NOW.getTime() - 23 * 60 * 60 * 1_000))
    const run = (tx: Tx<SystemPrincipal>) => sweeper.run(tx, { orgId: null, now: NOW }, deps(deletingErase))

    expect(await retain(run)).toEqual({ deleted: 1, pseudonymised: 0 })
    const remaining = await inOrg((tx) =>
      tx
        .select({ messageId: handledMessage.messageId })
        .from(handledMessage)
        .where(eq(handledMessage.consumer, consumer))
    )
    expect(new Set(remaining.map(({ messageId }) => messageId))).toEqual(
      new Set([boundary.messageId, recent.messageId])
    )
    expect(await retain(run)).toEqual({ deleted: 0, pseudonymised: 0 })
  })
})

/**
 * NFR-14's table, one row per data class naming the mechanism that enforces it: a sweeper here, a bucket lifecycle
 * rule, or the owner's job. A class with no mechanism fails; rows owned elsewhere stay `it.todo` until their owner
 * merges.
 */
const NFR14: { data: string; mechanism: string; sweeper?: string; owner: string; todo?: string }[] = [
  {
    data: 'readings and error rows from public sources, for the life of the project',
    mechanism: 'deleted with the project',
    owner: 'project deletion',
    todo: 'no project-deletion job has merged yet'
  },
  {
    data: 'camera frames to the semester end, at most 183 days',
    mechanism: 'the frames sweeper here, plus the FRAMES_BUCKET lifecycle rule (#89, read back in production)',
    sweeper: 'frames',
    owner: 'a-retention'
  },
  {
    data: 'raw bus positions, at most 24 hours',
    mechanism: 'dropped at ingest (#125), plus the SCRATCH_BUCKET 1-day rule (#89)',
    owner: 'bus ingest',
    todo: 'after #125, plus the SCRATCH_BUCKET 1-day rule (#89)'
  },
  {
    data: 'guest windows, 14 days from creation',
    mechanism: 'the guest-expiry nightly job (#182)',
    owner: 'guest lifecycle',
    todo: 'after #182'
  },
  {
    data: 'guest accounts, 30 days without activity',
    mechanism: 'the guest-expiry nightly job (#182)',
    owner: 'guest lifecycle',
    todo: 'after #182'
  },
  {
    data: 'subscriber records until unsubscribe plus 30 days',
    mechanism:
      'the subscribers sweeper here erases through eraseSubscriber (#110), leaving the hashed suppression entry',
    sweeper: 'subscribers',
    owner: 'a-retention'
  },
  {
    data: 'ledger and audit log for the life of the organisation',
    mechanism: 'personal fields pseudonymised on account or subscriber deletion (#109)',
    owner: 'account deletion',
    todo: 'after #109'
  },
  {
    data: 'deleted organisation, 30-day grace',
    mechanism: 'the purge job (#109)',
    owner: 'account deletion',
    todo: 'after #109'
  },
  {
    data: 'export files, 7 days',
    mechanism: 'the export-files sweep here, plus the EXPORTS_BUCKET lifecycle rule (#89, read back in production)',
    sweeper: 'export-files',
    owner: 'a-retention'
  },
  {
    data: 'APU timetable NAME, SAMACCOUNTNAME and LECTID',
    mechanism: 'never stored: dropped at ingest, since P1 does not read the feed',
    owner: 'APU ingest',
    todo: 'no APU reader exists in P1 to test the drop against'
  },
  {
    data: 'audit findings, 30 days after recovered_at',
    mechanism: 'an audit-finding sweeper here once the table lands (#132, §3)',
    owner: 'audit findings',
    todo: 'after #132 merges the table'
  },
  {
    data: 'handled SES message IDs',
    mechanism: 'a handled-message sweep here (#461)',
    sweeper: 'handled-messages',
    owner: 'a-retention'
  }
]

describe('NFR-14 retention table', () => {
  test('every data class names a mechanism', () => {
    expect(NFR14).not.toHaveLength(0)
    for (const row of NFR14) expect(row.mechanism, row.data).toMatch(/\S/)
  })

  for (const row of NFR14) {
    if (row.sweeper && !row.todo) {
      test(`${row.data}: enforced by the ${row.sweeper} sweeper`, () => {
        expect(SWEEPERS.map(({ name }) => name)).toContain(row.sweeper)
      })
    } else {
      test.todo(`${row.data}: ${row.mechanism} (${row.todo ?? row.owner})`)
    }
  }
})

describe('runRetentionSweep', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test('logs one line per sweeper per organisation with counts only, and sweeps account-scope exports', async () => {
    const info = vi.spyOn(log, 'info').mockImplementation(() => {})
    vi.spyOn(log, 'error').mockImplementation(() => {})
    const prefix = `orgs/${orgId}/`
    const frames = memoryBucket([frame(`${prefix}old.jpg`, { timeCreated: ago(200) })])
    const exports = memoryBucket([frame(`${prefix}exports/past.zip`, {})])
    const project = await inOrg((tx) => makeProject(tx))
    const email = `swept-${Date.now()}@example.test`
    const messageId = `private-message-${Date.now()}`
    await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, email, unsubscribedAt: ago(31) }))
    await inOrg((tx) =>
      makeExportJob(tx, { status: 'ready', expiresAt: ago(1), objectPath: `${prefix}exports/past.zip` })
    )
    await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(29) }))
    await inOrg((tx) => makeHandledMessage(tx, { consumer: 'retention-runner', messageId, handledAt: ago(2) }))

    await runRetentionSweep(NOW, {
      eraseSubscriber: deletingErase,
      buckets: { frames: frames.bucket, exports: exports.bucket }
    })

    const lines = info.mock.calls.map(([, fields]) => fields as Record<string, unknown>)
    expect(lines).toContainEqual({ sweeper: 'frames', org_id: orgId, deleted: 1, pseudonymised: 0 })
    expect(lines).toContainEqual({ sweeper: 'subscribers', org_id: orgId, deleted: 1, pseudonymised: 0 })
    expect(lines).toContainEqual({ sweeper: 'export-files', org_id: orgId, deleted: 1, pseudonymised: 0 })
    expect(lines).toContainEqual({ sweeper: 'handled-messages', org_id: null, deleted: 1, pseudonymised: 0 })
    for (const name of ['idempotency-keys', 'rate-limits', 'domain-events'])
      expect(lines).toContainEqual({ sweeper: name, org_id: null, deleted: 0, pseudonymised: 0 })
    // Counts and IDs only: never an address, a name or an account ID.
    expect(JSON.stringify(lines)).not.toContain('@')
    expect(JSON.stringify(lines)).not.toContain(email)
    expect(JSON.stringify(lines)).not.toContain(messageId)
  })

  test("erases due subscribers through #110's erasure by default, in each subscriber's organisation", async () => {
    // #110's erasure keeps the address's suppression hash, keyed by EMAIL_HASH_KEY.
    vi.stubEnv('EMAIL_HASH_KEY', 'retention-test-email-hash-key-32-characters')
    const info = vi.spyOn(log, 'info').mockImplementation(() => {})
    vi.spyOn(log, 'error').mockImplementation(() => {})
    const own = (await makeOrganization()).id
    const inOwn = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: own, principal: systemPrincipal('test') }, fn)
    const project = await inOwn((tx) => makeProject(tx))
    const due = await inOwn((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(31) }))

    await runRetentionSweep(NOW, { buckets: emptyBuckets() })

    expect(await inOwn((tx) => findSubscriber(tx, due.id))).toMatchObject({
      email: `${due.id}@deleted.invalid`,
      emailHash: null
    })
    expect(info.mock.calls.map(([, fields]) => fields)).toContainEqual({
      sweeper: 'subscribers',
      org_id: own,
      deleted: 0,
      pseudonymised: 1
    })
  })

  test('keeps going after a failing sweeper and exits non-zero at the end', async () => {
    const info = vi.spyOn(log, 'info').mockImplementation(() => {})
    const failures = vi.spyOn(log, 'error').mockImplementation(() => {})
    const prefix = `orgs/${orgId}/`
    const frames = memoryBucket([frame(`${prefix}old.jpg`, { timeCreated: ago(200) })])
    const project = await inOrg((tx) => makeProject(tx))
    await inOrg((tx) => makeSubscriber(tx, { projectId: project.id, unsubscribedAt: ago(31) }))
    const failing: EraseSubscriber = async () => {
      throw new Error('sesame broke')
    }
    await expect(
      runRetentionSweep(NOW, {
        eraseSubscriber: failing,
        buckets: { frames: frames.bucket, exports: memoryBucket().bucket }
      })
    ).rejects.toThrow(/retention failed for .*subscribers/)
    expect(failures).toHaveBeenCalled()
    // The frames sweeper still had its turn after the subscriber failure.
    expect(info.mock.calls.map(([, fields]) => fields)).toContainEqual({
      sweeper: 'frames',
      org_id: orgId,
      deleted: 1,
      pseudonymised: 0
    })
  })
})
