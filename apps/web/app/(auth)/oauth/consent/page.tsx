import { getOAuthConsentDetails } from '@skyclause/auth'
import { t } from '@skyclause/i18n'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPrincipal } from '../../../../lib/principal'
import { prefersMalay } from '../../../../lib/preferred-language'
import { oauthConsentRedirect } from '../../../../features/oauth/guard'
import '../../../../features/oauth/catalogue'
import { OAuthConsentForm } from '../../../../features/oauth/consent-form'
import { submitOAuthConsent } from './actions'

export default async function OAuthConsentPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const principal = await getPrincipal()
  const destination = oauthConsentRedirect(principal)
  if (destination) redirect(destination)

  const query = await searchParams
  const signedParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) signedParams.append(key, item)
  }
  const oauthQuery = signedParams.toString()
  if (!oauthQuery) notFound()
  const requestHeaders = new Headers(await headers())
  let details
  try {
    details = await getOAuthConsentDetails(requestHeaders, oauthQuery)
  } catch {
    notFound()
  }
  const locale = prefersMalay(requestHeaders.get('accept-language')) ? 'ms' : 'en'
  const hasChoices = details.link || details.organisations.length > 0
  return (
    <main className="grid gap-6 py-8" aria-labelledby="oauth-consent-title">
      <header className="grid gap-2">
        <p className="text-sm text-muted-foreground">{t('oauth.consent.brand', {}, locale)}</p>
        <h1 id="oauth-consent-title" className="text-2xl font-semibold text-balance">
          {t('oauth.consent.title', { client: details.clientName }, locale)}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">{t('oauth.consent.intro', {}, locale)}</p>
      </header>
      {hasChoices ? (
        <OAuthConsentForm details={details} oauthQuery={oauthQuery} locale={locale} action={submitOAuthConsent} />
      ) : (
        <p role="alert" className="rounded-md border border-border bg-card p-4 text-sm leading-6">
          {t('oauth.consent.noOrganisations', {}, locale)}
        </p>
      )}
    </main>
  )
}
