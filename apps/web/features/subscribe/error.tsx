import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'

const unpublished = (error: ApiProblem) =>
  error.status === 503 && JSON.stringify(error.body).includes('privacy-notice-unpublished')

/** A public subscriber's error in plain words: never an HTTP status, a problem slug or the server's English title. */
export function operationError(error: unknown, locale: 'en' | 'ms') {
  if (error instanceof ApiProblem) {
    if (unpublished(error)) return t('subscribe.unpublished', {}, locale)
    // Every expired, used, unknown or wrong-purpose token answers the same 410.
    if (error.status === 410) return t('subscribe.link_expired', {}, locale)
    return t('subscribe.failed', {}, locale)
  }
  return t('subscribe.unavailable', {}, locale)
}

/** An Admin's error on the subscriber and channel screens keeps the status and the problem it names. */
function adminError(error: unknown, locale: 'en' | 'ms') {
  if (error instanceof ApiProblem) {
    if (unpublished(error)) return t('subscribe.unpublished', {}, locale)
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
      {adminError(error, locale)}
    </p>
  ) : null
}
