import { expect, test } from 'vitest'
import type { SheetInput } from '@skyclause/clauses'
import {
  clauseSheet,
  evaluatorReevaluation,
  indicatorSnapshot,
  shadowState,
  shareSystemConnection,
  systemPrincipal,
  withTenant
} from '@skyclause/db'
import {
  makeClauseSheet,
  makeOrganization,
  makeProject,
  makeProjectPack,
  makeSheetVersion
} from '../../../packages/db/test/factories'
import { eq } from 'drizzle-orm'
import { registry } from '../src/registry'
import { gradeEngine } from '../src/grades'

const content: SheetInput = {
  pack: 'sky',
  clauses: [
    {
      key: 'camera_watch',
      name: 'Camera watch',
      enabled: true,
      scope: 'site',
      requires: [],
      optional: ['site.camera_far_low_frames'],
      when: 'has(site.camera_far_low_frames) && site.camera_far_low_frames > 3',
      proposes: { watch: true },
      wording: { en: 'Camera watch' }
    }
  ]
}

test('the actual lazy evaluator batch checks a camera publication and commits its shadow without bound sources', async () => {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId, principal: systemPrincipal('camera-composition-test') }, fn)
  const project = await run(async (tx) => {
    const project = await makeProject(tx)
    const sheet = await makeClauseSheet(tx, { projectId: project.id, pack: 'sky' })
    const version = await makeSheetVersion(tx, { sheetId: sheet.id, status: 'published', content })
    await tx.update(clauseSheet).set({ liveVersionId: version.id }).where(eq(clauseSheet.id, sheet.id))
    await makeProjectPack(tx, { projectId: project.id, pack: 'sky', enabled: true, sheetId: sheet.id })
    return project
  })
  await shareSystemConnection(() => registry.batch['evaluator-repair']!(new Date()))
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ projectId: project.id, pack: 'sky' }])
  const snapshots = await run((tx) => tx.select().from(indicatorSnapshot))
  expect(snapshots).toHaveLength(1)
  expect(snapshots[0]?.registryDefinitions).toEqual(
    expect.arrayContaining([
      { name: 'site.camera_far_low_frames', celType: 'int', unit: 'frames', scope: 'site', sourceKind: 'camera' }
    ])
  )
  expect(await run((tx) => tx.select().from(evaluatorReevaluation))).toMatchObject([
    { projectId: project.id, pack: 'sky', completedAt: expect.any(Date) }
  ])
})

test('the actual grade engine can check camera clauses with the installed integer frame declaration', () => {
  const engine = gradeEngine()
  expect(engine.registry?.find((definition) => definition.name === 'site.camera_far_low_frames')).toEqual({
    name: 'site.camera_far_low_frames',
    celType: 'int',
    unit: 'frames',
    scope: 'site',
    sourceKind: 'camera'
  })
  const checked = engine.check(content, engine.registry!)
  expect(checked.publishable).toBe(true)
  expect(checked.sheet?.registryTypes?.['site.camera_far_low_frames']).toBe('int')
})
