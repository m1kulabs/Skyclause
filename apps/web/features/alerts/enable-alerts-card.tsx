import { headers } from 'next/headers'
import { getPrincipal } from '../../lib/principal'
import { prefersMalay } from '../../lib/preferred-language'
import { DeviceAlerts } from './device-alerts'
import styles from './alerts.module.css'

export interface EnableAlertsCardProps {
  projectId?: string
}

export async function EnableAlertsCard(_props: EnableAlertsCardProps) {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) return null
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <div className={styles.card}>
      <DeviceAlerts key={principal.accountId} locale={locale} />
    </div>
  )
}
