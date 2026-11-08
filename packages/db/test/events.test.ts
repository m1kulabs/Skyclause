// #79 §5 "Write": emitEvent, the after-commit publish, the batch republish and handleOnce.
import { setTimeout as delay } from 'node:timers/promises'
import type { Principal } from '@skyclause/contracts'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, expect, test } from 'vitest'
import {
  domainEvent,
  emitEvent,
  handleOnce,
  republishEvents,
  setEventPublisher,
  withSystem,
  withTenant,
  type Tx
} from '../src'
import { makeOrganization, makeProject, makeSource } from './factories'
import { asLogin, expectEvent, memberOf, refusal } from './harness'

let orgId: string
let sourceId: string
const published: string[] = []
const system: Principal = { kind: 'system', job: 'test-events', client: 'worker', clientName: null }
const asMember = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  sourceId = await asMember(async (tx) => (await makeSource(tx, { kind: 'camera' })).id)
})
afterEach(() => {
  published.length = 0
  setEventPublisher(null)
})

const bound = (projectId: string) => ({
  projectId,
  type: 'source.bound' as const,
  data: { source_id: sourceId, role: 'camera' }
})
const publishTo = () => setEventPublisher(async ({ event_id }) => void published.push(event_id))
const row = async (id: string) =>
  asLogin('postgres', async (client) => (await client.query('SELECT * FROM domain_event WHERE id = $1', [id])).rows[0])

test('emitEvent writes the event, notifies skyclause_events and, after commit, publishes it and marks it published', async () => {
  publishTo()
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const notified: unknown[] = []
  const event = await asLogin('app', async (listener) => {
    listener.on('notification', ({ channel, payload }) => notified.push({ channel, payload: JSON.parse(payload!) }))
    await listener.query('LISTEN skyclause_events')
    const emitted = await asMember(async (tx) => {
      const result = await emitEvent(tx, bound(projectId))
      expect(published).toEqual([])
      return result
    })
    await delay(200)
    return emitted
  })
  expect(event.seq).toBe(1)
  expect(notified).toEqual([
    {
      channel: 'skyclause_events',
      payload: { id: event.id, org_id: orgId, project_id: projectId, seq: 1, type: 'source.bound' }
    }
  ])
  expect(published).toEqual([event.id])
  expect((await row(event.id)).published_at).toBeInstanceOf(Date)
  const found = await expectEvent('source.bound', { projectId })
  expect(found.data).toEqual({ source_id: sourceId, role: 'camera' })
})

test('emitEvent throws on data outside the event’s schema, writing nothing', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const invalid = { ...bound(projectId), data: { source_id: 'not-a-uuid', role: 'camera' } }
  await expect(asMember((tx) => emitEvent(tx, invalid))).rejects.toThrow(/source_id/)
  await expect(expectEvent('source.bound', { projectId })).rejects.toThrow(/found 0/)
})

test('a rolled-back transaction neither notifies nor publishes', async () => {
  publishTo()
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const notified: unknown[] = []
  await asLogin('app', async (listener) => {
    listener.on('notification', ({ payload }) => notified.push(payload))
    await listener.query('LISTEN skyclause_events')
    const failed = asMember(async (tx) => {
      await emitEvent(tx, bound(projectId))
      throw new Error('roll back')
    })
    await expect(failed).rejects.toThrow('roll back')
    await delay(200)
  })
  expect(notified).toEqual([])
  expect(published).toEqual([])
  await expect(expectEvent('source.bound', { projectId })).rejects.toThrow(/found 0/)
})

test('two concurrent transactions get consecutive seq in commit order', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  await asMember((tx) => emitEvent(tx, bound(projectId)))
  let locked!: () => void
  let commit!: () => void
  const holding = new Promise<void>((resolve) => (locked = resolve))
  const released = new Promise<void>((resolve) => (commit = resolve))
  const order: string[] = []
  const first = asMember(async (tx) => {
    const event = await emitEvent(tx, bound(projectId))
    locked()
    await released
    return event
  }).then((event) => (order.push('first'), event))
  await holding
  const second = asMember((tx) => emitEvent(tx, bound(projectId))).then((event) => (order.push('second'), event))
  await delay(200)
  // The second waits on the project's event_counter row until the first commits.
  expect(order).toEqual([])
  commit()
  const [a, b] = await Promise.all([first, second])
  expect([a.seq, b.seq, order]).toEqual([2, 3, ['first', 'second']])
})

test('emitEvent refuses a project of another organisation', async () => {
  const other = (await makeOrganization()).id
  const projectId = await withTenant(
    { orgId: other, principal: memberOf(other) },
    async (tx) => (await makeProject(tx)).id
  )
  expect(await refusal(asMember((tx) => emitEvent(tx, bound(projectId))))).toMatch(/not in this transaction/)
})

test('the batch republishes a row unpublished for 31 s exactly once, and leaves one 29 s old', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  // No publisher while emitting, as when Pub/Sub was down: the row stays unpublished.
  const event = await asMember((tx) => emitEvent(tx, bound(projectId)))
  const createdAt: Date = (await row(event.id)).created_at
  publishTo()
  await republishEvents(new Date(createdAt.getTime() + 29_000))
  expect(published).not.toContain(event.id)
  await republishEvents(new Date(createdAt.getTime() + 31_000))
  await republishEvents(new Date(createdAt.getTime() + 62_000))
  expect(published.filter((id) => id === event.id)).toEqual([event.id])
})

test('the republish fails loudly without a publisher', async () => {
  await expect(republishEvents(new Date())).rejects.toThrow(/no event publisher/)
})

test('handleOnce runs fn once per consumer and event; a second delivery runs nothing', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const { id } = await asMember((tx) => emitEvent(tx, bound(projectId)))
  const runs: string[] = []
  const deliver = (consumer: string) =>
    withTenant({ orgId, principal: system }, (tx) => handleOnce(tx, consumer, id, async () => void runs.push(consumer)))
  expect([await deliver('webhooks'), await deliver('webhooks'), await deliver('notifications')]).toEqual([
    true,
    false,
    true
  ])
  expect(runs).toEqual(['webhooks', 'notifications'])
})

test('handleOnce records nothing when fn throws, so the redelivery runs it', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const { id } = await asMember((tx) => emitEvent(tx, bound(projectId)))
  const deliver = (fn: () => Promise<void>) =>
    withTenant({ orgId, principal: system }, (tx) => handleOnce(tx, 'webhooks', id, fn))
  await expect(deliver(async () => Promise.reject(new Error('endpoint down')))).rejects.toThrow('endpoint down')
  expect(await deliver(async () => {})).toBe(true)
})

test('withSystem reads every organisation’s events, and app can’t read handled_event', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const { id } = await asMember((tx) => emitEvent(tx, bound(projectId)))
  const seen = await withSystem('test-dispatch', (tx) => tx.select().from(domainEvent).where(eq(domainEvent.id, id)))
  expect(seen).toHaveLength(1)
  expect(await refusal(asMember((tx) => tx.execute(sql`SELECT * FROM handled_event`)))).toMatch(/permission denied/)
})

test('handleOnce dedupes on an SES message ID: the same message delivered twice runs fn once', async () => {
  const messageId = `0100019a${crypto.randomUUID().replaceAll('-', '')}-000000`
  const runs: string[] = []
  const deliver = (consumer: string, id = messageId) =>
    withTenant({ orgId, principal: system }, (tx) =>
      handleOnce(tx, consumer, { messageId: id }, async () => void runs.push(consumer))
    )
  expect([
    await deliver('evidence-inbound'),
    await deliver('evidence-inbound'),
    await deliver('crowd-replies'),
    await deliver('evidence-inbound', `${messageId}-other`)
  ]).toEqual([true, false, true, true])
  expect(runs).toEqual(['evidence-inbound', 'crowd-replies', 'evidence-inbound'])
})

test('handleOnce records no SES message when fn throws, so the redelivery runs it', async () => {
  const messageId = `0100019a${crypto.randomUUID().replaceAll('-', '')}-000001`
  const deliver = (fn: () => Promise<void>) =>
    withTenant({ orgId, principal: system }, (tx) => handleOnce(tx, 'evidence-inbound', { messageId }, fn))
  await expect(deliver(async () => Promise.reject(new Error('reply failed')))).rejects.toThrow('reply failed')
  expect(await deliver(async () => {})).toBe(true)
})

test('app can’t read handled_message', async () => {
  expect(await refusal(asMember((tx) => tx.execute(sql`SELECT * FROM handled_message`)))).toMatch(/permission denied/)
})

test('a publisher set through one copy of the module serves another, as Next.js may load two', async () => {
  // A query string makes Vitest load a second, separate instance of the module.
  const second: string = '../src/events.ts?second-instance'
  const copy = (await import(second)) as typeof import('../src/events')
  expect(copy.setEventPublisher).not.toBe(setEventPublisher)
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const event = await asMember((tx) => emitEvent(tx, bound(projectId)))
  copy.setEventPublisher(async ({ event_id }) => void published.push(event_id))
  await republishEvents(new Date(Date.now() + 31_000))
  expect(published).toContain(event.id)
})
