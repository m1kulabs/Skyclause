import Panel from '../../../../../features/settings/organisation/data/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('organisation', 'data')

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'data', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="data" principal={principal} org={org} locale={locale}>
      <Panel
        org={org}
        role={principal?.kind === 'session' ? (principal.role ?? undefined) : undefined}
        locale={locale}
      />
    </SettingsFrame>
  )
}
