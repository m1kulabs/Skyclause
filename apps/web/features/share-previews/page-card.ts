import { originOf } from '../../lib/origins'
import { type Locale } from './i18n'
import { pageCardImage } from './og-card'
import { copyOf, isSharedPage, PAGES } from './pages'
import { notFound } from './problems'

/** `GET /og.png?page=…&lang=…`: the page's card; an unknown page is a 404. */
export function pageOg(request: Request): Response {
  const query = new URL(request.url).searchParams
  const page = query.get('page') ?? 'landing'
  if (!isSharedPage(page)) return notFound()
  const locale: Locale = query.get('lang') === 'ms' && page !== 'terms' ? 'ms' : 'en'
  const { heading, description } = copyOf(page, locale)
  const own = originOf(PAGES[page].surface)
  return pageCardImage({ heading, line: description, host: own ? new URL(own).host : '' }, locale)
}
