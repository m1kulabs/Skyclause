import Panel from '../../../../../features/settings/organisation/members/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('organisation', 'members')

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'members', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="members" principal={principal} org={org} locale={locale}>
      <Panel
        org={principal?.kind === 'session' ? (principal.orgId ?? org) : org}
        viewerRole={principal?.kind === 'session' && principal.role === 'owner' ? 'owner' : 'admin'}
        accountId={principal?.kind === 'session' ? principal.accountId : undefined}
        locale={locale}
      />
    </SettingsFrame>
  )
}
