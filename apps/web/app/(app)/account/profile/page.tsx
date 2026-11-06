import Panel from '../../../../features/settings/account/profile/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'profile' })
  return (
    <SettingsFrame scope="account" section="profile" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
