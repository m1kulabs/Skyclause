import Panel from '../../../../../../features/settings/project/rota/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { requireSettings } from '../../../../../../features/settings/gate'
import { settingsLocale } from '../../../../../../features/settings/locale'
import { settingsMetadata } from '../../../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('project', 'rota')

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'rota', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="project" section="rota" principal={principal} org={org} project={project} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
