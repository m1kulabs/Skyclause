import type { TxHandle } from '@skyclause/contracts'
import { and, asc, eq, sql } from 'drizzle-orm'
import { recordAudit } from '../audit'
import type { SystemPrincipal, Tx } from '../client'
import { organization, pilotArchive, project } from '../schema'

// #146 ticket decision, archive (LED-8, D4, D10): the pilot's exports sit beside the ledger as read-only files, one
// `pilot_archive` row each for `PILOT_PROJECT`, never a `ledger_entry`.

export type PilotArchiveKind = (typeof pilotArchive.$inferInsert)['kind']

/** `PILOT_PROJECT` (`{org}/{project}`, by slug) as IDs, read in `withSystem`; throws when it names no project. */
export async function findPilotProject(tx: Tx<SystemPrincipal>, ref: string) {
  const [orgSlug, projectSlug, ...rest] = ref.split('/')
  if (!orgSlug || !projectSlug || rest.length) throw new Error(`PILOT_PROJECT must be {org}/{project}, not ${ref}`)
  const [row] = await tx
    .select({ orgId: project.orgId, projectId: project.id })
    .from(project)
    .innerJoin(organization, eq(organization.id, project.orgId))
    .where(and(eq(organization.slug, orgSlug), eq(project.slug, projectSlug)))
  if (!row) throw new Error(`PILOT_PROJECT ${ref} names no project`)
  return row
}

/**
 * One `pilot_archive` row per file, idempotent by `sha256` within the project, audited as `staff.action` (D30: a
 * person runs the job on production) when it's new. Runs in `withTenant` with a system principal.
 */
export async function recordPilotArchive(
  handle: TxHandle,
  file: { projectId: string; kind: PilotArchiveKind; objectPath: string; sha256: string; capturedAt: Date }
): Promise<{ id: string; created: boolean }> {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('recordPilotArchive needs a withTenant transaction')
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`skyclause.pilot_archive:${file.projectId}`}, 0))`
  )
  const [held] = await tx
    .select({ id: pilotArchive.id })
    .from(pilotArchive)
    .where(and(eq(pilotArchive.projectId, file.projectId), eq(pilotArchive.sha256, file.sha256)))
  if (held) return { id: held.id, created: false }
  const [row] = await tx
    .insert(pilotArchive)
    .values({ orgId: tx.orgId, ...file })
    .returning({ id: pilotArchive.id })
  await recordAudit(tx, {
    action: 'staff.action',
    target: { type: 'pilot_archive', id: row!.id },
    projectId: file.projectId,
    after: {
      kind: file.kind,
      sha256: file.sha256,
      object_path: file.objectPath,
      captured_at: file.capturedAt.toISOString()
    }
  })
  return { id: row!.id, created: true }
}

/** The project's archived pilot files. */
export async function listPilotArchive(handle: TxHandle, projectId: string) {
  const tx = handle as Tx
  return tx
    .select({
      id: pilotArchive.id,
      kind: pilotArchive.kind,
      objectPath: pilotArchive.objectPath,
      sha256: pilotArchive.sha256,
      capturedAt: pilotArchive.capturedAt
    })
    .from(pilotArchive)
    .where(eq(pilotArchive.projectId, projectId))
    .orderBy(asc(pilotArchive.kind), asc(pilotArchive.capturedAt))
}
