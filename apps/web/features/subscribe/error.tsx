import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'

export function operationError(error: unknown, locale: 'en' | 'ms') {
  if (error instanceof ApiProblem) {
    if (error.status === 503 && JSON.stringify(error.body).includes('privacy-notice-unpublished')) {
      return t('subscribe.unpublished', {}, locale)
    }
    return t(
      'subscribe.error',
      { status: error.status, reason: error.body.title ?? error.body.type ?? error.message },
      locale
    )
  }
  return t('subscribe.unavailable', {}, locale)
}

export function OperationError({ error, locale }: { error: unknown; locale: 'en' | 'ms' }) {
  return error ? (
    <p role="alert" className="break-words text-destructive">
      {operationError(error, locale)}
    </p>
  ) : null
}
