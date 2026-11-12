import Panel from '../../../../../features/settings/organisation/general/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('organisation', 'general')

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'general', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="general" principal={principal} org={org} locale={locale}>
      <Panel org={org} locale={locale} />
    </SettingsFrame>
  )
}
