import Panel from '../../../../features/settings/account/api-keys/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'api-keys' })
  return (
    <SettingsFrame scope="account" section="api-keys" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
