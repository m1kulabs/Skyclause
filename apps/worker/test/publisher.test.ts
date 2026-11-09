// #79 §5: emitEvent publishes {event_id} to Pub/Sub `domain-events` after commit, through the composition roots'
// publisher, against a fetch double: no request reaches Google.
import { pubsubPublisher } from '@skyclause/config'
import {
  DOMAIN_EVENTS_TOPIC,
  emitEvent,
  republishEvents,
  RUNS_REQUESTED,
  setEventPublisher,
  setRunPublisher,
  shareSystemConnection,
  withTenant
} from '@skyclause/db'
import { makeOrganization, makeProject, makeRun, makeSource } from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import { registry } from '../src/registry'
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'

let orgId: string
let sourceId: string
const published: unknown[] = []
let status = 200

const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const { messages } = JSON.parse(String(init?.body)) as { messages: Array<{ data: string }> }
  published.push({
    url: String(input),
    data: messages.map(({ data }) => JSON.parse(Buffer.from(data, 'base64').toString('utf8')))
  })
  return new Response(JSON.stringify({ messageIds: ['1'] }), { status })
}) as typeof globalThis.fetch
const headers = async () => new Headers({ authorization: 'Bearer test-token' })

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  sourceId = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => (await makeSource(tx)).id)
  setEventPublisher(pubsubPublisher('skyclause', DOMAIN_EVENTS_TOPIC, { fetch, headers }))
})
afterEach(() => {
  published.length = 0
  status = 200
})
afterAll(() => {
  setEventPublisher(null)
  setRunPublisher(null)
})

const emit = () =>
  withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const projectId = (await makeProject(tx)).id
    return emitEvent(tx, { projectId, type: 'source.bound', data: { source_id: sourceId, role: 'rain_gauge' } })
  })
const publishedAt = (id: string) =>
  asLogin(
    'postgres',
    async (client) => (await client.query('SELECT published_at FROM domain_event WHERE id = $1', [id])).rows[0]
  )

test('a committed event is published to domain-events as {event_id} and marked published', async () => {
  const { id } = await emit()
  expect(published).toEqual([
    {
      url: 'https://pubsub.googleapis.com/v1/projects/skyclause/topics/domain-events:publish',
      data: [{ event_id: id }]
    }
  ])
  expect((await publishedAt(id)).published_at).toBeInstanceOf(Date)
})

test('a refused publish leaves the event unpublished, and the batch’s republish sends it', async () => {
  status = 503
  const { id } = await emit()
  expect((await publishedAt(id)).published_at).toBeNull()
  status = 200
  published.length = 0
  await republishEvents(new Date(Date.now() + 31_000))
  expect(published).toContainEqual({
    url: 'https://pubsub.googleapis.com/v1/projects/skyclause/topics/domain-events:publish',
    data: [{ event_id: id }]
  })
  expect((await publishedAt(id)).published_at).toBeInstanceOf(Date)
})

test('runs-republish publishes a queued run to runs-requested as {run_id, org_id}', async () => {
  setRunPublisher(pubsubPublisher('skyclause', RUNS_REQUESTED, { fetch, headers }))
  const { id } = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) =>
    makeRun(tx, { projectId: (await makeProject(tx)).id, createdAt: new Date(Date.now() - 120_000) })
  )
  await shareSystemConnection(() => registry.batch['runs-republish']!(new Date()))
  expect(published).toContainEqual({
    url: 'https://pubsub.googleapis.com/v1/projects/skyclause/topics/runs-requested:publish',
    data: [{ run_id: id, org_id: orgId }]
  })
})
