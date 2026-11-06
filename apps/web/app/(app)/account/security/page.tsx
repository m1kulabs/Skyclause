import Panel from '../../../../features/settings/account/security/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'security' })
  return (
    <SettingsFrame scope="account" section="security" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
