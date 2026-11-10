import { headers } from 'next/headers'
import Panel from '../../../../../features/settings/organisation/audit/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'
import { prefersMalay } from '../../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'audit', orgId: org })
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <SettingsFrame scope="organisation" section="audit" principal={principal} org={org}>
      <Panel org={org} locale={locale} />
    </SettingsFrame>
  )
}
