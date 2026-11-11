import type { SourceRole } from '@skyclause/contracts'
import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from '../client'
import { project } from '../schema/project'
import { projectSource, source } from '../schema/sources'

/** All source/pack mutations share this first lock and keep it until the caller commits. */
export async function lockSourceProject(tx: Tx, projectId: string) {
  const [row] = await tx
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.orgId, tx.orgId!)))
    .for('update')
  return row ?? null
}

export async function visibleBindingSource(tx: Tx, sourceId: string) {
  const [row] = await tx.select().from(source).where(eq(source.id, sourceId))
  return row ?? null
}

/** Never lock public C rows: tenant app has read access but cannot UPDATE those rows. */
export async function lockBindingSource(tx: Tx, sourceId: string) {
  const [row] = await tx
    .select()
    .from(source)
    .where(and(eq(source.id, sourceId), eq(source.ownerOrgId, tx.orgId!), inArray(source.kind, ['camera', 'pi'])))
    .for('update')
  return row ?? null
}

export function sourceBindings(tx: Tx, sourceId: string) {
  return tx.select().from(projectSource).where(eq(projectSource.sourceId, sourceId))
}

export function projectBindings(tx: Tx, projectId: string) {
  return tx.select().from(projectSource).where(eq(projectSource.projectId, projectId))
}

export async function insertSourceBinding(
  tx: Tx,
  input: { projectId: string; sourceId: string; role: SourceRole },
  now: Date
) {
  const [created] = await tx
    .insert(projectSource)
    .values({ ...input, orgId: tx.orgId!, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: [projectSource.projectId, projectSource.sourceId, projectSource.role] })
    .returning()
  if (created) return { binding: created, created: true }
  const [binding] = await tx
    .select()
    .from(projectSource)
    .where(
      and(
        eq(projectSource.projectId, input.projectId),
        eq(projectSource.sourceId, input.sourceId),
        eq(projectSource.role, input.role)
      )
    )
  if (!binding) throw new Error('Source binding disappeared while holding the project lock')
  return { binding, created: false }
}

export async function deleteSourceBinding(tx: Tx, bindingId: string): Promise<boolean> {
  const rows = await tx.delete(projectSource).where(eq(projectSource.id, bindingId)).returning({ id: projectSource.id })
  return rows.length > 0
}
