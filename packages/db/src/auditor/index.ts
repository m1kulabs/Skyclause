import type { RegisterAuditCheck } from '@skyclause/contracts'
import { and, eq, isNotNull, isNull, lte, not, or } from 'drizzle-orm'
import type { Tx } from '../client'
import { auditFinding, organization } from '../schema'

export type AuditFindingInput = Awaited<ReturnType<Parameters<RegisterAuditCheck>[0]['run']>>[number]
export type AuditFindingRow = typeof auditFinding.$inferSelect

/** Includes organisations without projects. Call under withSystem before entering tenants. */
export async function listAuditOrganisations(tx: Tx): Promise<string[]> {
  return (await tx.select({ id: organization.id }).from(organization)).map(({ id }) => id)
}

/** Only returned transition winners may notify; uniqueness and conditional updates arbitrate concurrent ticks. */
export async function reconcileAuditFindings(
  tx: Tx,
  input: {
    check: string
    orgId: string | null
    now: Date
    findings: AuditFindingInput[]
  }
): Promise<{ opened: AuditFindingRow[]; recovered: AuditFindingRow[] }> {
  const { check, orgId, now } = input
  const findings = [...new Map(input.findings.map((f) => [JSON.stringify([f.projectId, f.key]), f])).values()]
  const scope = and(
    eq(auditFinding.check, check),
    orgId === null ? isNull(auditFinding.orgId) : eq(auditFinding.orgId, orgId)
  )
  const opened = findings.length
    ? await tx
        .insert(auditFinding)
        .values(
          findings.map((f) => ({
            check,
            orgId,
            key: f.key,
            projectId: f.projectId,
            refType: f.ref.type,
            refId: f.ref.id,
            accountIds: f.accountIds,
            openedAt: now
          }))
        )
        .onConflictDoNothing()
        .returning()
    : []
  const present = findings.map((f) =>
    and(
      eq(auditFinding.key, f.key),
      f.projectId === null
        ? isNull(auditFinding.projectId)
        : and(isNotNull(auditFinding.projectId), eq(auditFinding.projectId, f.projectId))
    )
  )
  const recovered = await tx
    .update(auditFinding)
    .set({ recoveredAt: now })
    .where(
      and(
        scope,
        isNull(auditFinding.recoveredAt),
        lte(auditFinding.openedAt, now),
        present.length ? not(or(...present)!) : undefined
      )
    )
    .returning()
  return { opened, recovered }
}

export { runAuditCheck } from './check-scope'
