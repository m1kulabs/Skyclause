'use client'

import { Button } from '#ui/button'
import { SourceError } from '../data-components/states'
import { t } from './i18n'
import { statusOf } from './operations'

/** A failed read, named, with its answer and a retry. Never an empty state. */
export function Failure({
  source,
  error,
  at,
  retry
}: {
  source: string
  error: unknown
  at: string
  retry: () => void
}) {
  return (
    <SourceError
      source={source}
      status={statusOf(error)}
      at={at}
      retry={
        <Button variant="outline" onClick={retry}>
          {t('connect.retry')}
        </Button>
      }
    />
  )
}
