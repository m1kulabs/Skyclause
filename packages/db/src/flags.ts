import type { Principal } from '@skyclause/contracts'
import { and, eq, isNull, or } from 'drizzle-orm'
import { recordAudit } from './audit'
import { withSystem, withTenant, type SystemPrincipal, type Tx } from './client'
import { featureFlag, organization } from './schema'

/**
 * Whether a #79 §6 flag is on: the organisation's row when `orgId` is given and has one, else the global row; a flag
 * with neither is off. RLS shows a tenant transaction only the global rows and its own organisation's.
 */
export async function isFlagEnabled(tx: Tx<Principal | null>, key: string, orgId?: string): Promise<boolean> {
  const scope = orgId ? or(isNull(featureFlag.orgId), eq(featureFlag.orgId, orgId)) : isNull(featureFlag.orgId)
  const rows = await tx
    .select({ orgId: featureFlag.orgId, enabled: featureFlag.enabled })
    .from(featureFlag)
    .where(and(eq(featureFlag.key, key), scope))
  return (rows.find((row) => row.orgId !== null) ?? rows[0])?.enabled ?? false
}

/** #79 §6's flags: `pack_crowd` per organisation, `guest_entry` and `inbound_email` global, the rest off. */
export const FEATURE_FLAGS = ['pack_crowd', 'guest_entry', 'inbound_email', 'a2a', 'msgraph', 'jira'] as const
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]

const flagJob: SystemPrincipal = { kind: 'system', job: 'flag:set', client: 'worker', clientName: null }

/**
 * `flag:set`'s write (#79 §6): upserts the organisation's row, or the global one without `orgId`, and its
 * `flag.changed` audit row in one transaction as system job `flag:set`. A global flag is audited on the `commons`
 * organisation (D30's home for platform-wide writes), so it fails until `commons:provision` has made it.
 */
export async function setFlag(f: { key: FeatureFlagKey; enabled: boolean; orgId?: string }) {
  const orgId = f.orgId ?? null
  const auditOrg =
    orgId ??
    (await withSystem('flag:set', async (tx) => {
      const [commons] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, 'commons'))
      return commons?.id
    }))
  if (!auditOrg) throw new Error('a global flag is audited on the commons organisation, which doesn’t exist yet')
  await withTenant({ orgId: auditOrg, principal: flagJob }, async (tx) => {
    const scope = orgId ? eq(featureFlag.orgId, orgId) : isNull(featureFlag.orgId)
    const [before] = await tx
      .select({ enabled: featureFlag.enabled })
      .from(featureFlag)
      .where(and(eq(featureFlag.key, f.key), scope))
    await tx
      .insert(featureFlag)
      .values({ key: f.key, orgId, enabled: f.enabled })
      .onConflictDoUpdate({
        target: [featureFlag.key, featureFlag.orgId],
        set: { enabled: f.enabled, updatedAt: new Date() }
      })
    await recordAudit(tx, {
      action: 'flag.changed',
      target: { type: 'feature_flag', id: f.key },
      before: before ? { enabled: before.enabled, org_id: orgId } : null,
      after: { enabled: f.enabled, org_id: orgId }
    })
  })
}
