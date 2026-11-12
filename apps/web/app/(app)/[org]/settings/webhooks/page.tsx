import Panel from '../../../../../features/settings/organisation/webhooks/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'webhooks', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="organisation" section="webhooks" principal={principal} org={org} locale={locale}>
      <Panel />
    </SettingsFrame>
  )
}
