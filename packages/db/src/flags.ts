import type { Principal, ReservedSlug } from '@skyclause/contracts'
import { and, eq, isNull, or } from 'drizzle-orm'
import { recordAudit } from './audit'
import { systemPrincipal, withSystem, withTenant, type Tx } from './client'
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

/** #79 §6's flags and where each is set: `pack_crowd` per organisation, the rest globally. */
export const FEATURE_FLAGS = {
  pack_crowd: 'organisation',
  guest_entry: 'global',
  inbound_email: 'global',
  a2a: 'global',
  msgraph: 'global',
  jira: 'global'
} as const
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS

/** D30's home for platform-wide audit rows. */
const COMMONS = 'commons' satisfies ReservedSlug

/**
 * `flag:set`'s write (#79 §6): upserts the organisation's row (`pack_crowd`) or the global one (the rest), and its
 * `flag.changed` audit row, in one transaction as system job `flag:set`. A global flag is audited on the `commons`
 * organisation, so it fails until `commons:provision` has made it.
 */
export async function setFlag(flag: { key: FeatureFlagKey; enabled: boolean; orgId?: string }) {
  const orgId = flag.orgId ?? null
  const perOrganisation = FEATURE_FLAGS[flag.key] === 'organisation'
  if (perOrganisation !== (orgId !== null)) {
    throw new Error(
      `${flag.key} is set ${perOrganisation ? 'per organisation, with --org' : 'globally, without --org'}`
    )
  }
  const auditOrg =
    orgId ??
    (await withSystem('flag:set', async (tx) => {
      const [commons] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, COMMONS))
      return commons?.id
    }))
  if (!auditOrg) throw new Error('a global flag is audited on the commons organisation, which doesn’t exist yet')
  await withTenant({ orgId: auditOrg, principal: systemPrincipal('flag:set') }, async (tx) => {
    const scope = orgId ? eq(featureFlag.orgId, orgId) : isNull(featureFlag.orgId)
    const [before] = await tx
      .select({ enabled: featureFlag.enabled })
      .from(featureFlag)
      .where(and(eq(featureFlag.key, flag.key), scope))
    await tx
      .insert(featureFlag)
      .values({ key: flag.key, orgId, enabled: flag.enabled })
      .onConflictDoUpdate({
        target: [featureFlag.key, featureFlag.orgId],
        set: { enabled: flag.enabled, updatedAt: new Date() }
      })
    await recordAudit(tx, {
      action: 'flag.changed',
      target: { type: 'feature_flag', id: flag.key },
      before: before ? { enabled: before.enabled, org_id: orgId } : null,
      after: { enabled: flag.enabled, org_id: orgId }
    })
  })
}
