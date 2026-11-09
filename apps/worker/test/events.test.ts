// #79 §5: the worker's domain-events dispatch through onEvent and handleOnce, and the batch's republish and hourly
// partition maintenance (D45).
import { randomUUID } from 'node:crypto'
import { emitEvent, setEventPublisher, withTenant, type Tx } from '@skyclause/db'
import { makeOrganization, makeProject, makeSource } from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { dispatchEvent, domainEventsFor, onEvent } from '../src/events'

let orgId: string
let sourceId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
  sourceId = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => (await makeSource(tx)).id)
})
afterEach(() => setEventPublisher(null))

const emit = () =>
  withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const projectId = (await makeProject(tx)).id
    return emitEvent(tx, { projectId, type: 'source.bound', data: { source_id: sourceId, role: 'rain_gauge' } })
  })

test('onEvent runs its handler once per event, in the event’s organisation as system job event:<consumer>', async () => {
  const { id } = await emit()
  const seen: Array<{ id: string; type: string; principal: Tx['principal']; orgId: string | null }> = []
  const webhooks = onEvent(['source.bound', 'source.unbound'], 'webhooks', async (event, tx) => {
    seen.push({ id: event.id, type: event.type, principal: tx.principal, orgId: tx.orgId })
  })
  const other = onEvent(['call.sent'], 'calls', async () => {
    throw new Error('not subscribed to source.bound')
  })
  await dispatchEvent([webhooks, other], id)
  await dispatchEvent([webhooks, other], id)
  expect(seen).toEqual([
    {
      id,
      type: 'source.bound',
      principal: { kind: 'system', job: 'event:webhooks', client: 'worker', clientName: null },
      orgId
    }
  ])
})

test('a failing consumer doesn’t stop the others; the dispatch throws, and the redelivery reruns only it', async () => {
  const { id } = await emit()
  const runs: string[] = []
  let failing = true
  const consumers = [
    onEvent(['source.bound'], 'flaky', async () => {
      runs.push('flaky')
      if (failing) throw new Error('endpoint down')
    }),
    onEvent(['source.bound'], 'steady', async () => void runs.push('steady'))
  ]
  await expect(dispatchEvent(consumers, id)).rejects.toThrow(/flaky.*endpoint down/)
  failing = false
  await dispatchEvent(consumers, id)
  expect(runs).toEqual(['flaky', 'steady', 'flaky'])
})

test('an event that no longer exists is acknowledged', async () => {
  const runs: string[] = []
  await dispatchEvent([onEvent(['source.bound'], 'webhooks', async () => void runs.push('ran'))], randomUUID())
  expect(runs).toEqual([])
})

test('the domain-events topic dispatches the pushed event_id to the registered consumers', async () => {
  const { id } = await emit()
  const runs: string[] = []
  const part = domainEventsFor(async () => [onEvent(['source.bound'], 'webhooks', async (e) => void runs.push(e.id))])
  await part.topics!['domain-events']!({ data: { event_id: id }, attributes: {}, messageId: '1', publishTime: '' })
  expect(runs).toEqual([id])
})

test('the batch republishes events left unpublished', async () => {
  const { id } = await emit()
  const published: string[] = []
  setEventPublisher(async ({ event_id }) => void published.push(event_id))
  const part = domainEventsFor(async () => [])
  await part.batch!['domain-events-republish']!(new Date(Date.now() + 31_000))
  expect(published).toContain(id)
})

const furthest = () => {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1))
  return `reading_p${first.toISOString().slice(0, 10).replaceAll('-', '')}`
}
const partitionExists = (name: string) =>
  asLogin('postgres', async (client) => (await client.query('SELECT to_regclass($1) AS t', [name])).rows[0].t !== null)

test('partition maintenance runs in the first batch of each hour only', async () => {
  await asLogin('migrator', async (client) => {
    await client.query('SET ROLE "owner"')
    await client.query(`DROP TABLE ${furthest()}`)
  })
  const maintain = domainEventsFor(async () => []).batch!['partition-maintenance']!
  await maintain(new Date('2026-11-09T10:30:00Z'))
  expect(await partitionExists(furthest())).toBe(false)
  await maintain(new Date('2026-11-09T11:00:41Z'))
  expect(await partitionExists(furthest())).toBe(true)
})
