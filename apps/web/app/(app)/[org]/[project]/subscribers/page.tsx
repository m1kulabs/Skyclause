import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { prefersMalay } from '../../../../../lib/preferred-language'
import { getOrgPrincipal } from '../../../../../lib/principal'
import { Subscribers } from '../../../../../features/subscribers'
import { maySeeSettings } from '../../../../../features/settings/access'
import { t } from '../../../../../features/subscribers/catalogue'
import { settingsLocale } from '../../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('subscribers.title', {}, await settingsLocale()) }
}

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ org: string; project: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { org, project } = await params
  // The URL names the organisation by slug; a member's session carries its ID and role only once resolved (#647), as
  // on the sibling project pages and requireSettings.
  const { principal, orgId } = await getOrgPrincipal(org)
  if (
    principal?.kind !== 'session' ||
    principal.isGuest ||
    !orgId ||
    principal.orgId !== orgId ||
    !principal.role ||
    !['owner', 'admin', 'approver'].includes(principal.role)
  )
    notFound()
  const manage = maySeeSettings(principal, { scope: 'project', section: 'channels', orgId })
  // An explicit ?lang= wins; otherwise the browser's own order of languages decides, as on every sibling page.
  const { lang } = await searchParams
  const locale =
    lang === 'ms' || lang === 'en' ? lang : prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return <Subscribers org={org} project={project} manage={manage} locale={locale} />
}
