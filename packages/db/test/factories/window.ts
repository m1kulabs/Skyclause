import { randomUUID } from 'node:crypto'
import type { Tx } from '../../src/client'
import { project, window } from '../../src/schema'
import { makeProject } from './project'
import { rowOf } from './rows'

/** A class window of `projectId`, or of a new project. */
export async function makeWindow(tx: Tx, overrides: Partial<typeof window.$inferInsert> = {}) {
  const parent = overrides.projectId ? await rowOf(tx, project, overrides.projectId) : await makeProject(tx)
  const [row] = await tx
    .insert(window)
    .values({
      orgId: tx.orgId!,
      startsAt: new Date('2026-11-09T06:00:00Z'),
      endsAt: new Date('2026-11-09T08:00:00Z'),
      title: 'Class',
      kind: 'class',
      tz: 'Asia/Kuala_Lumpur',
      declaredBy: randomUUID(),
      via: 'app',
      ...overrides,
      projectId: parent.id
    })
    .returning()
  return row!
}
