import english from '../catalogue/en/notices.json'
import malay from '../catalogue/ms/notices.json'
import './brand'
import { catalogueFiles, catalogueFor, messageAt } from './catalogue'
import { t } from './index'

// #152 (c-notice-templates): opt in at the feature boundary, as brand.ts does. Notices also use `brand` (the fixed
// NTC-3 and non-affiliation lines, mode words) and `format` (MYT times, ages).
catalogueFiles['../catalogue/en/notices.json'] = { default: english }
catalogueFiles['../catalogue/ms/notices.json'] = { default: malay }

/** Whether `notices.<path>` exists, for labels that fall back to a key the catalogue doesn't name (custom clauses). */
export const hasNotice = (path: string) => messageAt(catalogueFor('en', 'notices'), path.split('.')) !== undefined

const TIME_ZONE = 'Asia/Kuala_Lumpur'

/** A 24-hour MYT clock time without its zone, for spans the catalogue prints as `{start}–{end} MYT` (LOC-6). */
export const formatClock = (value: Date | string) =>
  new Intl.DateTimeFormat('en-MY', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value))

/** DESIGN's subject date, `{Ddd D Mmm}` in MYT: "Mon 2 Nov", "Isn 2 Nov". */
export function formatDateShort(value: Date | string, locale: 'en' | 'ms') {
  const parts = new Intl.DateTimeFormat(locale === 'ms' ? 'ms-MY' : 'en-MY', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value
  return t('notices.date_short', { weekday: part('weekday'), day: part('day'), month: part('month') }, locale)
}

export { t }
