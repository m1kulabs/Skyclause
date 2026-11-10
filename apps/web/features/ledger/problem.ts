import { ApiProblem } from '../../lib/api-fetch'
import { formatDateTime } from '@skyclause/i18n/format'
import { t } from './i18n'

export function problemMessage(error: unknown, locale: 'en' | 'ms' = 'en'): string {
  if (error instanceof ApiProblem && error.status === 429 && error.body.type?.endsWith('budget-exhausted')) {
    const reset = error.body.reset_at
    if (typeof reset === 'string' && Number.isFinite(Date.parse(reset)))
      return t('evidence.budget', { time: formatDateTime(reset, locale) }, locale)
  }
  return t('ledger.failed', {}, locale)
}
