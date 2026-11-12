import Panel from '../../../../../features/settings/project/general/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'
import { settingsLocale } from '../../../../../features/settings/locale'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'general', orgId: org })
  const locale = await settingsLocale()
  return (
    <SettingsFrame scope="project" section="general" principal={principal} org={org} project={project} locale={locale}>
      <Panel locale={locale} />
    </SettingsFrame>
  )
}
