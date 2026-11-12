import en from '../../../../packages/i18n/catalogue/en/data.json'
import { t } from './catalogue'

type Locale = 'en' | 'ms'

const registryShaped = /^(site|w)\./

function catalogued(name: string): boolean {
  let node: unknown = en.indicators
  for (const part of name.split('.')) {
    if (node === null || typeof node !== 'object') return false
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string'
}

/**
 * An indicator's name for people ("Rain in the last 60 minutes (site)"), never its registry key (`site.rain_60m_mm`). A
 * key the catalogue does not hold reads "Other input"; a name that is not a registry key is already a name and is
 * printed as it came.
 */
export function indicatorName(name: string, locale: Locale): string {
  if (!registryShaped.test(name)) return name
  return catalogued(name) ? t(`data.indicators.${name}`, {}, locale) : t('data.indicators.other', {}, locale)
}
