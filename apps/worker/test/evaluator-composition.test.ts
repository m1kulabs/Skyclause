import { expect, test } from 'vitest'
import { withTenant, systemPrincipal, createProjectRecord } from '@skyclause/db'
import { makeOrganization } from '../../../packages/db/test/factories'
import { registry } from '../src/registry'
import { gradeEngine } from '../src/grades'

test('production registry supplies actual evaluator history to Sky grading and mounts the live loop', async () => {
  expect(registry.topics['readings-updated']).toBeTypeOf('function')
  expect(registry.queues['evaluator-deadlines']).toBeTypeOf('function')
  expect(registry.ticks).not.toHaveProperty('evaluator')
  const orgId = (await makeOrganization()).id
  await withTenant({ orgId, principal: systemPrincipal('test-evaluator-compose') }, async (tx) => {
    const created = await createProjectRecord(tx, {
      name: 'Grade composition',
      slug: 'grade-composition',
      siteName: 'APU',
      siteLat: 3,
      siteLon: 101,
      packs: ['sky']
    })
    expect(gradeEngine().history).toBeTypeOf('function')
    expect(
      await gradeEngine().history!(tx, {
        projectId: created.project.id,
        from: '2026-11-11T01:00:00Z',
        to: '2026-11-11T02:00:00Z'
      })
    ).toMatchObject({ sources: [], readings: [], polls: [] })
    expect(gradeEngine().registry?.find((d) => d.name === 'site.rain_60m_mm')).toMatchObject({ sourceKind: 'jps_rain' })
  })
})
