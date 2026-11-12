import Panel from '../../../../../features/settings/organisation/ai-keys/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'ai-keys', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="ai-keys" principal={principal} org={org} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
