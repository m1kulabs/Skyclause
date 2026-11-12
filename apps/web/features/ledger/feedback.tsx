import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { SourceError } from '../data-components/states'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './i18n'

export type LedgerSource = 'project' | 'entries' | 'integrity' | 'archive' | 'requests' | 'pack'

/** A read that failed or is not built, named inside the block that needed it, with a retry. */
export function Failure({
  source,
  error,
  at,
  retry,
  locale
}: {
  source: LedgerSource
  error: unknown
  at?: string
  retry: () => void
  locale: 'en' | 'ms'
}) {
  return (
    <SourceError
      source={t(`ledger.sources.${source}`, {}, locale)}
      status={error instanceof ApiProblem ? error.status : null}
      at={at ?? null}
      retry={
        <Button variant="outline" onClick={retry}>
          {t('ledger.retry', {}, locale)}
        </Button>
      }
      locale={locale}
    />
  )
}

/** Skeleton capsules at the size of what loads: record rows on their pitch, or a block of lines. */
export function Loading({ locale, rows = 0 }: { locale: 'en' | 'ms'; rows?: number }) {
  return (
    <div role="status" className="ledger-loading" data-ledger-loading>
      <span className="sr-only">{t('ledger.loading', {}, locale)}</span>
      {rows ? (
        Array.from({ length: rows }, (_, index) => (
          <div key={index} className="ledger-loading-row" aria-hidden="true">
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-4 w-full max-w-64 rounded-full" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </div>
        ))
      ) : (
        <div className="ledger-loading-block" aria-hidden="true">
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="h-4 w-full max-w-96 rounded-full" />
          <Skeleton className="h-4 w-64 rounded-full" />
        </div>
      )}
    </div>
  )
}
