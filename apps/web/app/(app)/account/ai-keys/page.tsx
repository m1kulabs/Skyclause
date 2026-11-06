import Panel from '../../../../features/settings/account/ai-keys/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'ai-keys' })
  return (
    <SettingsFrame scope="account" section="ai-keys" principal={principal}>
      <Panel />
    </SettingsFrame>
  )
}
