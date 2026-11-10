import Panel from '../../../../../../features/settings/project/packs/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { requireSettings } from '../../../../../../features/settings/gate'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ org: string; project: string }>
  searchParams: Promise<{ pack?: string }>
}) {
  const { org, project } = await params
  const { pack } = await searchParams
  const principal = await requireSettings({ scope: 'project', section: 'packs', orgId: org })
  return (
    <SettingsFrame scope="project" section="packs" principal={principal} org={org} project={project}>
      <Panel org={org} project={project} initialPack={pack} />
    </SettingsFrame>
  )
}
