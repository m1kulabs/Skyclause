import Panel from '../../../../../../features/settings/project/public/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { requireSettings } from '../../../../../../features/settings/gate'
import { settingsLocale } from '../../../../../../features/settings/locale'
import { settingsMetadata } from '../../../../../../features/settings/metadata'

export const generateMetadata = settingsMetadata('project', 'public')

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'public', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="project" section="public" principal={principal} org={org} project={project} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
