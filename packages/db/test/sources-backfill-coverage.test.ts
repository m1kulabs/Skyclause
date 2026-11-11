import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import {
  sourceBackfillCoverage,
  withSystem,
  withTenant,
  systemPrincipal,
  type Tx,
  type SystemPrincipal,
  projectSource
} from '../src'
import { makeSource, makeReading, makePoll, makeOrganization, makeProject, makeProjectSource } from './factories'
import { memberOf } from './harness'

test('exact morning identities, revisions, ownerless state-wide error polls and scope checks', async () => {
  const groupValue = randomUUID()
  const required = [8, 9, 10].map((day) => ({
    metric: 'api',
    observedAt: new Date(`2026-11-${day.toString().padStart(2, '0')}T22:00:00Z`)
  }))
  const [a, b, formerlyBound, other] = await withSystem('coverage', async (tx) => {
    const rows = []
    for (const i of [1, 2, 3, 4])
      rows.push(await makeSource(tx, { kind: 'apims', meta: { state_id: i === 4 ? randomUUID() : groupValue } }))
    return rows
  })
  const orgId = (await makeOrganization()).id
  await withTenant({ orgId, principal: systemPrincipal('coverage') }, async (tx) => {
    const project = await makeProject(tx)
    const old = await makeProjectSource(tx, { projectId: project.id, sourceId: formerlyBound!.id, role: 'api_station' })
    await tx.delete(projectSource).where(eq(projectSource.id, old.id))
    const device = await makeSource(tx, { kind: 'apims', meta: { state_id: groupValue } })
    await makePoll(tx, { sourceId: device.id, purpose: 'backfill', outcome: 'error' })
  })
  const query = { kind: 'apims' as const, groupByMeta: 'state_id', groupValue, sourceIds: [a!.id, b!.id], required }
  const coverage = () => withSystem('coverage', (tx) => sourceBackfillCoverage(tx, query))
  await withSystem('coverage', async (tx) => {
    for (const day of [1, 2, 3])
      await makeReading(tx, { sourceId: a!.id, metric: 'api', observedAt: new Date(`2026-11-0${day}T22:00:00Z`) })
    for (const { observedAt } of required.slice(0, 2)) {
      await makeReading(tx, { sourceId: b!.id, metric: 'api', observedAt })
      await makeReading(tx, { sourceId: b!.id, metric: 'api', observedAt, revision: 1 })
    }
    await makePoll(tx, { sourceId: other!.id, purpose: 'backfill', outcome: 'error' })
  })
  expect(await coverage()).toEqual({ hasBackfillPoll: false, missingSourceIds: [a!.id, b!.id] })
  await withSystem('coverage', (tx) =>
    makeReading(tx, { sourceId: b!.id, metric: 'api', observedAt: required[2]!.observedAt })
  )
  expect(await coverage()).toEqual({ hasBackfillPoll: false, missingSourceIds: [a!.id] })
  await withSystem('coverage', (tx) =>
    makePoll(tx, { sourceId: formerlyBound!.id, purpose: 'backfill', outcome: 'error' })
  )
  expect(await coverage()).toEqual({ hasBackfillPoll: true, missingSourceIds: [a!.id] })
  await expect(
    withTenant({ orgId, principal: systemPrincipal('coverage') }, (tx) =>
      sourceBackfillCoverage(tx as Tx<SystemPrincipal>, query)
    )
  ).rejects.toThrow(/system scope/)
  await expect(
    withTenant({ orgId, principal: memberOf(orgId) }, (tx) => sourceBackfillCoverage(tx as Tx<SystemPrincipal>, query))
  ).rejects.toThrow(/system scope/)
})
