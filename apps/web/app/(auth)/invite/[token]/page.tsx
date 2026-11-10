import { headers } from 'next/headers'
import { getPrincipal } from '../../../../lib/principal'
import { prefersMalay } from '../../../../lib/preferred-language'
import { InvitePanel } from '../../../../features/members/invite-panel'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, principal, requestHeaders] = await Promise.all([params, getPrincipal(), headers()])
  const locale = prefersMalay(requestHeaders.get('accept-language')) ? 'ms' : 'en'
  const signedIn = principal?.kind === 'session' && !principal.isGuest

  return <InvitePanel token={token} locale={locale} signedIn={signedIn} />
}
