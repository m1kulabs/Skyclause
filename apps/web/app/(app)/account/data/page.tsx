import Panel from '../../../../features/settings/account/data/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { settingsLocale } from '../../../../features/settings/locale'
import { requireSettings } from '../../../../features/settings/gate'
import { getAccountEmail } from '../../../../lib/principal'
import { settingsMetadata } from '../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('account', 'data')

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'data' })
  const email = await getAccountEmail()
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="account" section="data" principal={principal} locale={locale}>
      <Panel email={email} locale={locale} />
    </SettingsFrame>
  )
}
