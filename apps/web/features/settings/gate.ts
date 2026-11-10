import { notFound } from 'next/navigation'
import { getOrgPrincipal, getPrincipal } from '../../lib/principal'
import { maySeeSettings, type SettingsTarget } from './access'

export async function requireSettings(target: SettingsTarget) {
  // The URL names the organisation by slug; a real session's orgId is its ID, filled only for a member (#94).
  const { principal, orgId } = target.orgId
    ? await getOrgPrincipal(target.orgId)
    : { principal: await getPrincipal(), orgId: undefined }
  if (!maySeeSettings(principal, { ...target, orgId: orgId ?? undefined })) notFound()
  return principal
}

export async function requireOrganisationSettings(target: SettingsTarget) {
  if (target.scope !== 'organisation' || !target.orgId) throw new Error('Organisation settings require an organisation')
  const { principal, orgId, organisation } = await getOrgPrincipal(target.orgId)
  if (!maySeeSettings(principal, { ...target, orgId: orgId ?? undefined })) notFound()
  return { principal, organisation }
}
