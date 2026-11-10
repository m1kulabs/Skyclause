import { headers } from 'next/headers'
import { EnableAlertsCard } from '../../../../../features/alerts/enable-alerts-card'
import Panel from '../../../../../features/settings/organisation/rota/panel'
import { SettingsFrame } from '../../../../../features/settings/frame'
import { requireSettings } from '../../../../../features/settings/gate'
import { prefersMalay } from '../../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const principal = await requireSettings({ scope: 'organisation', section: 'rota', orgId: org })
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  const role =
    principal?.kind === 'session' && principal.role === 'owner'
      ? 'owner'
      : principal?.kind === 'session' && principal.role === 'admin'
        ? 'admin'
        : 'approver'
  return (
    <SettingsFrame scope="organisation" section="rota" principal={principal} org={org}>
      <Panel
        org={principal?.kind === 'session' ? (principal.orgId ?? org) : org}
        viewer={{ accountId: principal?.kind === 'session' ? principal.accountId : '', role }}
        locale={locale}
        alertsCard={<EnableAlertsCard />}
      />
    </SettingsFrame>
  )
}
