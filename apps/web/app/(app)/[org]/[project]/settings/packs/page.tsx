import Panel from '../../../../../../features/settings/project/packs/panel'
import { devicesBuilt } from '../../../../../../features/settings/project/packs/controls'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { requireSettings } from '../../../../../../features/settings/gate'
import { settingsLocale } from '../../../../../../features/settings/locale'

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
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="project" section="packs" principal={principal} org={org} project={project} locale={locale}>
      <Panel org={org} project={project} initialPack={pack} devices={devicesBuilt()} locale={locale} />
    </SettingsFrame>
  )
}
