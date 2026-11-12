'use client'

import { Button } from '#ui/button'
import { SourceError } from '../data-components/states'
import { t, type Locale } from './i18n'
import { statusOf } from './operations'

/** A failed read, named, with its answer and a retry. Never an empty state. */
export function Failure({
  source,
  error,
  at,
  retry,
  locale
}: {
  source: string
  error: unknown
  at: string
  retry: () => void
  locale: Locale
}) {
  return (
    <SourceError
      source={source}
      status={statusOf(error)}
      at={at}
      locale={locale}
      retry={
        <Button variant="outline" onClick={retry}>
          {t('connect.retry', {}, locale)}
        </Button>
      }
    />
  )
}
