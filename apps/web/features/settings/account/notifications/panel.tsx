import { headers } from 'next/headers'
import { getPrincipal } from '../../../../lib/principal'
import { prefersMalay } from '../../../../lib/preferred-language'
import { NotificationsPanel } from '../../../alerts/notifications-panel'

export default async function Panel() {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) return null
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return <NotificationsPanel key={principal.accountId} accountId={principal.accountId} locale={locale} />
}
