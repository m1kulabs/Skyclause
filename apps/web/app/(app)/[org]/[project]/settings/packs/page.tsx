import Panel from '../../../../../../features/settings/project/packs/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { requireSettings } from '../../../../../../features/settings/gate'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'packs', orgId: org })
  return (
    <SettingsFrame scope="project" section="packs" principal={principal} org={org} project={project}>
      <Panel />
    </SettingsFrame>
  )
}
