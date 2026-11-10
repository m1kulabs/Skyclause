import Panel from '../../../../../features/settings/organisation/integrations/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'
import { headers } from 'next/headers'
import { prefersMalay } from '../../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'integrations', orgId: org })
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <SettingsFrame scope="organisation" section="integrations" principal={principal} org={org}>
      <Panel org={org} locale={locale} />
    </SettingsFrame>
  )
}
