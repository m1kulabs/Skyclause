import Panel from '../../../../../features/settings/organisation/billing/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireOrganisationSettings } from '../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const { principal, organisation } = await requireOrganisationSettings({
    scope: 'organisation',
    section: 'billing',
    orgId: org
  })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="billing" principal={principal} org={org} locale={locale}>
      <Panel organization={organisation ?? null} locale={locale} />
    </SettingsFrame>
  )
}
