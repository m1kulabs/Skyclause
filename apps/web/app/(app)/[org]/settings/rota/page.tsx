import { EnableAlertsCard } from '../../../../../features/alerts/enable-alerts-card'
import Panel from '../../../../../features/settings/organisation/rota/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { settingsLocale } from '../../../../../features/settings/locale'
import { requireSettings } from '../../../../../features/settings/gate'
import { settingsMetadata } from '../../../../../features/settings/metadata'

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
      <Panel
        org={principal?.kind === 'session' ? (principal.orgId ?? org) : org}
        viewer={{ accountId: principal?.kind === 'session' ? principal.accountId : '', role }}
        locale={locale}
        alertsCard={<EnableAlertsCard />}
      />
    </SettingsFrame>
  )
}
