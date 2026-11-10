import { headers } from 'next/headers'
import Panel from '../../../../../features/settings/organisation/members/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'
import { prefersMalay } from '../../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'members', orgId: org })
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <SettingsFrame scope="organisation" section="members" principal={principal} org={org}>
      <Panel
        org={principal?.kind === 'session' ? (principal.orgId ?? org) : org}
        viewerRole={principal?.kind === 'session' && principal.role === 'owner' ? 'owner' : 'admin'}
        accountId={principal?.kind === 'session' ? principal.accountId : undefined}
        locale={locale}
      />
    </SettingsFrame>
  )
}
