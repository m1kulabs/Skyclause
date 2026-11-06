import { notFound } from 'next/navigation'
import { EnableAlertsCard } from '../../../features/alerts/enable-alerts-card'
import { t } from '../../../features/alerts/i18n'
export const instant = false
export default function Page() {
  if (process.env.APP_ENV !== 'test') notFound()
  return (
    <main className="p-6">
      <h1>{t('alerts.harnessTitle')}</h1>
      <EnableAlertsCard />
    </main>
  )
}
