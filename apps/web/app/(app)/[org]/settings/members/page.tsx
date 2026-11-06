import Panel from '../../../../../features/settings/organisation/members/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'members', orgId: org })
  return (
    <SettingsFrame scope="organisation" section="members" principal={principal} org={org}>
      <Panel />
    </SettingsFrame>
  )
}
