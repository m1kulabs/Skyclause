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

const ADMIN_REFUSALS: Record<number, string> = {
  403: 'subscribe.error_forbidden',
  409: 'subscribe.error_conflict',
  422: 'subscribe.error_invalid',
  429: 'subscribe.error_busy',
  501: 'subscribe.error_not_available'
}

/** An Admin's error on the subscriber and channel screens, in words; the status and the problem's slug stay for tests. */
function adminError(error: unknown, locale: 'en' | 'ms') {
  if (error instanceof ApiProblem) {
    if (unpublished(error)) return t('subscribe.unpublished', {}, locale)
    return t(ADMIN_REFUSALS[error.status] ?? 'subscribe.failed', {}, locale)
  }
  return t('subscribe.unavailable', {}, locale)
}

export function OperationError({ error, locale }: { error: unknown; locale: 'en' | 'ms' }) {
  const problem = error instanceof ApiProblem ? error : undefined
  return error ? (
    <p
      role="alert"
      className="break-words text-destructive"
      data-http-status={problem?.status}
      data-problem={problem?.body.type?.split('/').pop()}
    >
      {adminError(error, locale)}
    </p>
  ) : null
}
