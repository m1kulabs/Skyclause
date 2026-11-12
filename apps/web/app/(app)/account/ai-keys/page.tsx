import Panel from '../../../../features/settings/account/ai-keys/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { settingsLocale } from '../../../../features/settings/locale'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'ai-keys' })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="account" section="ai-keys" principal={principal} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
