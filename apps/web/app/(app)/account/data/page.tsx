import { headers } from 'next/headers'
import Panel from '../../../../features/settings/account/data/panel'
import { SettingsFrame } from '../../../../features/settings/frame'
import { requireSettings } from '../../../../features/settings/gate'
import { getAccountEmail } from '../../../../lib/principal'
import { prefersMalay } from '../../../../lib/preferred-language'

export default async function Page() {
  const principal = await requireSettings({ scope: 'account', section: 'data' })
  const email = await getAccountEmail()
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <SettingsFrame scope="account" section="data" principal={principal}>
      <Panel email={email} locale={locale} />
    </SettingsFrame>
  )
}
