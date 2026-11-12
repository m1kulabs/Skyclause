import Panel from '../../../../features/settings/account/api-keys/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { settingsLocale } from '../../../../features/settings/locale'
import { requireSettings } from '../../../../features/settings/gate'
import { settingsMetadata } from '../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('account', 'api-keys')

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'api-keys' })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="account" section="api-keys" principal={principal} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
