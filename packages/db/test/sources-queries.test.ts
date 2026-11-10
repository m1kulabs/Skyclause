import { expect, test } from 'vitest'
import {
  boundSources,
  listSourceOrganisations,
  openCrowdPeriods,
  systemPrincipal,
  withSystem,
  withTenant
} from '../src'
import { makeNight, makeOrganization, makePoll, makeProject, makeProjectSource, makeSource } from './factories'
import { memberOf } from './harness'

const system = systemPrincipal('test-source-queries')

test('tenant binding queries dedupe roles, omit archived projects and scope owner devices to their organisation', async () => {
  const a = (await makeOrganization()).id
  const b = (await makeOrganization()).id
  const archivedOnly = (await makeOrganization()).id
  await withTenant({ orgId: archivedOnly, principal: memberOf(archivedOnly) }, (tx) =>
    makeProject(tx, { archivedAt: new Date() })
  )
  const catalogue = await withSystem(system.job, (tx) => makeSource(tx))
  await withSystem(system.job, async (tx) => {
    await makePoll(tx, {
      sourceId: catalogue.id,
      bodySha256: 'a'.repeat(64),
      startedAt: new Date('2026-11-10T01:00:00Z')
    })
    await makePoll(tx, {
      sourceId: catalogue.id,
      outcome: 'unchanged',
      bodySha256: 'b'.repeat(64),
      startedAt: new Date('2026-11-10T02:00:00Z')
    })
    await makePoll(tx, {
      sourceId: catalogue.id,
      outcome: 'error',
      bodySha256: 'c'.repeat(64),
      startedAt: new Date('2026-11-10T03:00:00Z')
    })
  })
  const active = await withTenant({ orgId: a, principal: memberOf(a) }, async (tx) => {
    const project = await makeProject(tx)
    await makeProjectSource(tx, { projectId: project.id, sourceId: catalogue.id, role: 'rain_gauge' })
    await makeProjectSource(tx, { projectId: project.id, sourceId: catalogue.id, role: 'api_station' })
    const device = await makeSource(tx, { kind: 'camera' })
    await makeProjectSource(tx, { projectId: project.id, sourceId: device.id })
    return { project, device }
  })
  const other = await withTenant({ orgId: b, principal: memberOf(b) }, async (tx) => {
    const project = await makeProject(tx)
    await makeProjectSource(tx, { projectId: project.id, sourceId: catalogue.id, role: 'rain_gauge' })
    const archived = await makeProject(tx, { archivedAt: new Date() })
    const unused = await makeSource(tx)
    await makeProjectSource(tx, { projectId: archived.id, sourceId: unused.id, role: 'rain_gauge' })
    return project
  })
  expect(await withSystem(system.job, listSourceOrganisations)).toEqual(expect.arrayContaining([a, b]))
  expect(await withSystem(system.job, listSourceOrganisations)).not.toContain(archivedOnly)
  expect(await withSystem(system.job, (tx) => boundSources(tx, 'jps_rain'))).toEqual([])
  expect(await withTenant({ orgId: a, principal: memberOf(a) }, (tx) => boundSources(tx, 'jps_rain'))).toMatchObject([
    { id: catalogue.id, bindings: [{ orgId: a, projectId: active.project.id }], previousBodySha256: 'b'.repeat(64) }
  ])
  expect(await withTenant({ orgId: b, principal: memberOf(b) }, (tx) => boundSources(tx, 'jps_rain'))).toMatchObject([
    { id: catalogue.id, bindings: [{ orgId: b, projectId: other.id }] }
  ])
  expect(await withTenant({ orgId: b, principal: memberOf(b) }, (tx) => boundSources(tx, 'camera'))).toEqual([])
  expect(await withTenant({ orgId: a, principal: memberOf(a) }, (tx) => boundSources(tx, 'camera'))).toMatchObject([
    { id: active.device.id }
  ])
})

test('crowd periods enforce tenant, active project, state and half-open arrival/exit boundaries without invented ends', async () => {
  const orgId = (await makeOrganization()).id
  const other = (await makeOrganization()).id
  const now = new Date('2026-11-10T04:00:00Z')
  const start = new Date('2026-11-10T03:00:00Z')
  const end = new Date('2026-11-10T05:00:00Z')
  const ids = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const project = await makeProject(tx)
    const arrival = await makeNight(tx, { projectId: project.id, arrivalStart: now, arrivalEnd: end })
    const exit = await makeNight(tx, {
      projectId: project.id,
      state: 'in_progress',
      arrivalStart: start,
      arrivalEnd: now,
      exitStart: now,
      exitEnd: end
    })
    await makeNight(tx, { projectId: project.id, arrivalStart: start, arrivalEnd: now })
    await makeNight(tx, { projectId: project.id, arrivalStart: start, arrivalEnd: null })
    await makeNight(tx, { projectId: project.id, arrivalStart: null, exitStart: start, exitEnd: end })
    await makeNight(tx, { projectId: project.id, arrivalStart: start, arrivalEnd: end, state: 'graded' })
    await makeNight(tx, { projectId: project.id, arrivalStart: start, arrivalEnd: now, exitStart: start, exitEnd: now })
    const archived = await makeProject(tx, { archivedAt: now })
    await makeNight(tx, { projectId: archived.id, arrivalStart: start, arrivalEnd: end })
    return { arrival: arrival.id, exit: exit.id }
  })
  const found = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) => openCrowdPeriods(tx, now))
  expect(found.map(({ id }) => id).sort()).toEqual([ids.arrival, ids.exit].sort())
  expect(found.find(({ id }) => id === ids.arrival)).toMatchObject({
    arrivalStart: now.toISOString(),
    exitStart: null,
    exitEnd: null
  })
  expect(await withTenant({ orgId: other, principal: memberOf(other) }, (tx) => openCrowdPeriods(tx, now))).toEqual([])
})
