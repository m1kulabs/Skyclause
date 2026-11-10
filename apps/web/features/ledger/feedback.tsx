import { Alert, AlertDescription } from '#ui/alert'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { t } from './i18n'
import { problemMessage } from './problem'

export function Failure({ error, retry, locale }: { error: unknown; retry: () => void; locale: 'en' | 'ms' }) {
  return (
    <Alert role="alert">
      <AlertDescription>{problemMessage(error, locale)}</AlertDescription>
      <Button variant="outline" onClick={retry}>
        {t('ledger.retry', {}, locale)}
      </Button>
    </Alert>
  )
}

export function Loading({ locale }: { locale: 'en' | 'ms' }) {
  return (
    <div role="status">
      <p>{t('ledger.loading', {}, locale)}</p>
      <Skeleton className="mt-3 h-24 w-full" />
    </div>
  )
}
