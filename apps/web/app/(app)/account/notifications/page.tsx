import Panel from '../../../../features/settings/account/notifications/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { settingsLocale } from '../../../../features/settings/locale'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'notifications' })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="account" section="notifications" principal={principal} locale={locale}>
      <Panel />
    </SettingsFrame>
  )
}
