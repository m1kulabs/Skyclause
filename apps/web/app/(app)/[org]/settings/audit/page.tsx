import Panel from '../../../../../features/settings/organisation/audit/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'audit', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="audit" principal={principal} org={org} locale={locale} wide>
      <Panel org={org} locale={locale} />
    </SettingsFrame>
  )
}
