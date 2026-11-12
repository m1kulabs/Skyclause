import Panel from '../../../../features/settings/account/appearance/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { settingsLocale } from '../../../../features/settings/locale'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'appearance' })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="account" section="appearance" principal={principal} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
