import Panel from '../../../../../../features/settings/project/channels/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { requireSettings } from '../../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'channels', orgId: org })
  return (
    <SettingsFrame scope="project" section="channels" principal={principal} org={org} project={project}>
      <Panel />
    </SettingsFrame>
  )
}
