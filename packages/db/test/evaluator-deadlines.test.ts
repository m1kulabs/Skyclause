import { expect, test } from 'vitest'
import {
  withTenant,
  systemPrincipal,
  replaceEvaluatorDeadline,
  loadEvaluatorDeadline,
  markEvaluatorDeadlineCreated,
  listEvaluatorDeadlineCleanup,
  completeEvaluatorDeadlineCleanup,
  matchEvaluatorDeadline
} from '../src'
import { makeOrganization, makeProject } from './factories'
const at = '2026-11-10T05:00:00.000Z'
async function scene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId, principal: systemPrincipal('test-deadline') }, fn)
  const project = (await run((tx) => makeProject(tx))).id
  return { orgId, project, run }
}
test('commit survives process crash and same due time preserves generation', async () => {
  const x = await scene()
  const first = await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: at }))
  expect(first).toMatchObject({ org: x.orgId, project: x.project, dueAt: at })
  expect(await x.run((tx) => loadEvaluatorDeadline(tx, x.project))).toEqual(first)
  expect(await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: at }))).toEqual(first)
})
test('replacements create before cleanup and stale generations cannot mutate the newest intent', async () => {
  const x = await scene()
  const one = (await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: at })))!
  await x.run((tx) => markEvaluatorDeadlineCreated(tx, one))
  const two = (await x.run((tx) =>
    replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: '2026-11-10T06:00:00.000Z' })
  ))!
  expect(await x.run((tx) => listEvaluatorDeadlineCleanup(tx, x.project))).toEqual([])
  const three = (await x.run((tx) =>
    replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: '2026-11-10T07:00:00.000Z' })
  ))!
  await x.run((tx) => markEvaluatorDeadlineCreated(tx, two))
  expect(await x.run((tx) => listEvaluatorDeadlineCleanup(tx, x.project))).toEqual([])
  await x.run((tx) => markEvaluatorDeadlineCreated(tx, three))
  const cleanup = await x.run((tx) => listEvaluatorDeadlineCleanup(tx, x.project))
  expect(cleanup.map((row) => row.generation)).toEqual(expect.arrayContaining([one.generation, two.generation]))
  await x.run((tx) => completeEvaluatorDeadlineCleanup(tx, two))
  expect(await x.run((tx) => loadEvaluatorDeadline(tx, x.project))).toMatchObject({
    ...three,
    createdAt: expect.any(String)
  })
  expect(await x.run((tx) => matchEvaluatorDeadline(tx, one, new Date(at)))).toBe('obsolete')
})
test('current early delivery retries; exact due and payload association are checked', async () => {
  const x = await scene()
  const intent = (await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: at })))!
  expect(await x.run((tx) => matchEvaluatorDeadline(tx, intent, new Date('2026-11-10T04:00:00Z')))).toBe('early')
  expect(await x.run((tx) => matchEvaluatorDeadline(tx, intent, new Date(at)))).toBe('due')
  expect(
    await x.run((tx) => matchEvaluatorDeadline(tx, { ...intent, dueAt: '2026-11-10T04:00:00Z' }, new Date(at)))
  ).toBe('obsolete')
})

test('simultaneous replacements on separate transactions leave exactly one current generation', async () => {
  const x = await scene()
  const replacements = await Promise.all(
    ['2026-11-10T05:00:00Z', '2026-11-10T06:00:00Z'].map((dueAt) =>
      x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt }))
    )
  )
  expect(new Set(replacements.map((x) => x!.generation)).size).toBe(2)
  const latest = (await x.run((tx) => loadEvaluatorDeadline(tx, x.project)))!
  await x.run((tx) => markEvaluatorDeadlineCreated(tx, latest))
  const cleanup = await x.run((tx) => listEvaluatorDeadlineCleanup(tx, x.project))
  expect(cleanup).toHaveLength(1)
  expect(cleanup[0]!.generation).not.toBe(latest.generation)
})

import { evaluatorDeadline, sweepEvaluatorCoordination, withRetention } from '../src'
import { eq } from 'drizzle-orm'
test('retention keeps unfinished deadlines and removes only completed cleanup', async () => {
  const x = await scene()
  const old = (await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: at })))!
  await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: null }))
  await x.run((tx) => completeEvaluatorDeadlineCleanup(tx, old))
  const current = (await x.run((tx) =>
    replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: '2027-01-01T00:00:00Z' })
  ))!
  await withRetention('test', (tx) => sweepEvaluatorCoordination(tx, new Date('2028-01-01T00:00:00Z')))
  expect(
    await x.run((tx) => tx.select().from(evaluatorDeadline).where(eq(evaluatorDeadline.projectId, x.project)))
  ).toMatchObject([{ generation: current.generation }])
})

test('cleanup acknowledgement cannot erase a later successful in-flight create', async () => {
  const x = await scene()
  const old = (await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: at })))!
  await x.run((tx) => replaceEvaluatorDeadline(tx, { projectId: x.project, dueAt: null }))
  const [deleting] = await x.run((tx) => listEvaluatorDeadlineCleanup(tx, x.project))
  // DELETE returned 404, then an earlier create finally succeeded before DELETE's DB acknowledgement.
  await x.run((tx) => markEvaluatorDeadlineCreated(tx, old))
  await x.run((tx) => completeEvaluatorDeadlineCleanup(tx, deleting!))
  expect((await x.run((tx) => listEvaluatorDeadlineCleanup(tx, x.project))).map((x) => x.generation)).toContain(
    old.generation
  )
})
