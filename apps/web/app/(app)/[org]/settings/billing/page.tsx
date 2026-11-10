import { headers } from 'next/headers'
import Panel from '../../../../../features/settings/organisation/billing/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireOrganisationSettings } from '../../../../../features/settings/gate'
import { prefersMalay } from '../../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const { principal, organisation } = await requireOrganisationSettings({
    scope: 'organisation',
    section: 'billing',
    orgId: org
  })
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <SettingsFrame scope="organisation" section="billing" principal={principal} org={org}>
      <Panel organization={organisation ?? null} locale={locale} />
    </SettingsFrame>
  )
}
