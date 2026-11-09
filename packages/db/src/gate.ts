import type { ProjectGate } from '@skyclause/contracts'
import { eq } from 'drizzle-orm'
import type { Tx } from './client'
import { organization, project } from './schema'

/**
 * #79 §1 projectGate (PRJ-8, D36): `suspended` once the organisation's `deletion_requested_at` is set, which wins over a
 * project's archive since it gates the whole organisation; `archived` once `archived_at` is set; else `open`.
 */
export const projectGate: ProjectGate = async (handle, projectId) => {
  const tx = handle as Tx
  const [row] = await tx
    .select({ archivedAt: project.archivedAt, deletionRequestedAt: organization.deletionRequestedAt })
    .from(project)
    .innerJoin(organization, eq(organization.id, project.orgId))
    .where(eq(project.id, projectId))
  if (!row) throw new Error(`project ${projectId} not found in this transaction`)
  if (row.deletionRequestedAt) return 'suspended'
  return row.archivedAt ? 'archived' : 'open'
}
