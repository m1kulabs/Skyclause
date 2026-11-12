import { headers } from 'next/headers'
import { prefersMalay } from '../../../../../lib/preferred-language'
import { CallsPage, type CallsFilters } from '../../../../../features/calls/calls-page'
import { t } from '../../../../../features/calls/i18n'
import { settingsLocale } from '../../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('calls.title', {}, await settingsLocale()) }
}

type SearchValue = string | string[] | undefined
const first = (value: SearchValue) => (Array.isArray(value) ? value[0] : value)

export default async function CallsRoute({
  params,
  searchParams
}: {
  params: Promise<{ org: string; project: string }>
  searchParams: Promise<Record<string, SearchValue>>
}) {
  const [{ org, project }, query, requestHeaders] = await Promise.all([params, searchParams, headers()])
  const filters: CallsFilters = {
    pack: first(query.pack),
    mode: first(query.mode),
    state: first(query.state),
    from: first(query.from),
    to: first(query.to),
    cursor: first(query.cursor)
  }
  return (
    <CallsPage
      org={org}
      projectSlug={project}
      filters={filters}
      locale={prefersMalay(requestHeaders.get('accept-language')) ? 'ms' : 'en'}
    />
  )
}
