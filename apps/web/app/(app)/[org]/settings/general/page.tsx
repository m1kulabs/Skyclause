import Panel from '../../../../../features/settings/organisation/general/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'general', orgId: org })
  return (
    <SettingsFrame scope="organisation" section="general" principal={principal} org={org}>
      <Panel />
    </SettingsFrame>
  )
}
