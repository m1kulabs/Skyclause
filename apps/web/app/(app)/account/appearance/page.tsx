import Panel from '../../../../features/settings/account/appearance/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'appearance' })
  return (
    <SettingsFrame scope="account" section="appearance" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
