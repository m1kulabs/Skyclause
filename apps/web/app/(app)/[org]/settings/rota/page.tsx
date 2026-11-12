import { EnableAlertsCard } from '../../../../../features/alerts/enable-alerts-card'
import Panel from '../../../../../features/settings/organisation/rota/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../features/settings/metadata'
import { FirstRunProgress } from '../../../../../features/onboarding/first-run-progress'

export const generateMetadata = settingsMetadata('organisation', 'rota')

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'rota', orgId: org })
  const locale = await settingsLocale()
  const role =
    principal?.kind === 'session' && principal.role === 'owner'
      ? 'owner'
      : principal?.kind === 'session' && principal.role === 'admin'
        ? 'admin'
        : 'approver'
  return (
    <SettingsFrame scope="organisation" section="rota" principal={principal} org={org} locale={locale}>
      <div className="grid min-w-0 gap-8">
        {/* The first run's rota step opens this page, so its steps continue here (an Owner's or Admin's, as they read
            and skip the organisation's steps), and disappear once every step is done. */}
        {role === 'owner' || role === 'admin' ? <FirstRunProgress org={org} locale={locale} /> : null}
        <Panel
          org={principal?.kind === 'session' ? (principal.orgId ?? org) : org}
          viewer={{ accountId: principal?.kind === 'session' ? principal.accountId : '', role }}
          locale={locale}
          alertsCard={<EnableAlertsCard />}
        />
      </div>
    </SettingsFrame>
  )
}
