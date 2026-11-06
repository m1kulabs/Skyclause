import Panel from '../../../../features/settings/account/notifications/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'notifications' })
  return (
    <SettingsFrame scope="account" section="notifications" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
