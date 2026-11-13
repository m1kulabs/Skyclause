import Panel from '../../../../../../features/settings/project/channels/panel'
import { SettingsFrame } from '../../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../../features/settings/locale'
import { requireSettings } from '../../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../../features/settings/metadata'
import { FirstRunProgress } from '../../../../../../features/onboarding/first-run-progress'

export const generateMetadata = settingsMetadata('project', 'channels')

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await requireSettings({ scope: 'project', section: 'channels', orgId: org })
  const locale = await settingsLocale()
  // The first run's channel step opens this page, so its steps continue here for an Owner or Admin.
  const firstRun =
    principal?.kind === 'session' && (principal.role === 'owner' || principal.role === 'admin') ? (
      <FirstRunProgress org={org} locale={locale} />
    ) : null
  return (
    <SettingsFrame scope="project" section="channels" principal={principal} org={org} project={project} locale={locale}>
      <div className="grid min-w-0 gap-8">
        {firstRun}
        <Panel locale={locale} />
      </div>
    </SettingsFrame>
  )
}
