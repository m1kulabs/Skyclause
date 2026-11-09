// #162 c-analysis-api: `node main.js job analysis-materialise` writes every project's figures, across organisations,
// on the #79 §7 test database.
import { analysisMetric, systemPrincipal, withTenant } from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { materialiseAll } from '../src/analysis'
import { registry } from '../src/registry'

test('analysis-materialise is a registered job', () => {
  expect(registry.jobs['analysis-materialise']).toBeTypeOf('function')
})

test('it materialises each project in its own organisation, stamped with the run time', async () => {
  const now = new Date('2026-11-09T16:30:00Z')
  const projects = await Promise.all(
    [0, 1].map(async () => {
      const orgId = (await makeOrganization()).id
      const as = { orgId, principal: systemPrincipal('test-analysis') }
      return { as, projectId: (await withTenant(as, (tx) => makeProject(tx))).id }
    })
  )
  await materialiseAll(now)
  for (const { as, projectId } of projects) {
    const rows = await withTenant(as, (tx) =>
      tx.select().from(analysisMetric).where(eq(analysisMetric.projectId, projectId))
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.computedAt.getTime() === now.getTime() && r.rangeTo === '2026-11-10')).toBe(true)
  }
})
