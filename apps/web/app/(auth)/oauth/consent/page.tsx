import { getOAuthConsentDetails } from '@skyclause/auth'
import { t } from '@skyclause/i18n'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPrincipal } from '../../../../lib/principal'
import { prefersMalay } from '../../../../lib/preferred-language'
import { oauthConsentRedirect } from '../../../../features/oauth/guard'
import '../../../../features/oauth/catalogue'
import { OAuthConsentForm } from '../../../../features/oauth/consent-form'
import { AuthHeader, AuthMessage } from '../../../../features/public-chrome/auth'
import { marketingHref } from '../../../../features/sign-in/links'

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
    <main className="auth-page" lang={locale} aria-labelledby="oauth-consent-title">
      <AuthHeader
        title={t('oauth.consent.title', { client: details.clientName }, locale)}
        titleId="oauth-consent-title"
        lead={t('oauth.consent.intro', {}, locale)}
        homeHref={marketingHref('/')}
        locale={locale}
      />
      {hasChoices ? (
        <OAuthConsentForm details={details} oauthQuery={oauthQuery} locale={locale} />
      ) : (
        <AuthMessage>{t('oauth.consent.noOrganisations', {}, locale)}</AuthMessage>
      )}
    </main>
  )
}
