import Panel from '../../../../features/settings/account/data/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'data' })
  return (
    <SettingsFrame scope="account" section="data" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
