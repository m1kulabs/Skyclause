import Panel from '../../../../../../features/settings/project/channels/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../../features/settings/locale'
import { requireSettings } from '../../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('project', 'channels')

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'channels', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="project" section="channels" principal={principal} org={org} project={project} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
