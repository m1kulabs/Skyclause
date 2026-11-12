'use client'

import { useEffect, useState } from 'react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { Skeleton } from '#ui/skeleton'
import { StatusMark } from '../brand/status-mark'
import { SourceError } from '../data-components/states'
import { ApiProblem } from '../../lib/api-fetch'
import { apiFetch, type Delivery } from './operations'
import { t } from './catalogue'

export function ZonedTime({ value }: { value: string | null | undefined }) {
  return value ? <time dateTime={value}>{formatDateTime(value, 'en')}</time> : <span>{t('webhooks.not_recorded')}</span>
}

/** One attempt's outcome as a mark with its word: delivered on a 2xx, failed on any other answer, none when it did not answer. */
function outcome(attempt: Delivery) {
  if (attempt.status_code === null) return { state: 'error', word: t('webhooks.no_response') } as const
  return attempt.status_code >= 200 && attempt.status_code < 300
    ? ({ state: 'fresh', word: t('webhooks.delivered') } as const)
    : ({ state: 'error', word: t('webhooks.failed_attempt') } as const)
}

export function DeliveryLog({
  org,
  webhookId,
  selected,
  cursor,
  refresh,
  select,
  paginate
}: {
  org: string
  webhookId: string
  selected: string | null
  cursor: string | null
  refresh: number
  select: (id: string | null) => void
  paginate: (cursor: string | null) => void
}) {
  const [result, setResult] = useState<{ data: Delivery[]; next_cursor: string | null }>()
  const [failed, setFailed] = useState<{ error: unknown; at: string }>()
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setResult(undefined)
    setFailed(undefined)
    void apiFetch('listWebhookDeliveries', {
      org,
      params: { id: webhookId },
      query: { limit: 50, ...(cursor ? { cursor } : {}) },
      signal: controller.signal
    })
      .then((page) => {
        if (!controller.signal.aborted) setResult(page)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed({ error, at: new Date().toISOString() })
      })
    return () => controller.abort()
  }, [org, webhookId, cursor, refresh, reload])

  if (failed)
    return (
      <SourceError
        source={t('webhooks.source_deliveries')}
        status={failed.error instanceof ApiProblem ? failed.error.status : null}
        at={failed.at}
        retry={
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            {t('webhooks.retry')}
          </Button>
        }
      />
    )
  if (!result)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-6 w-1/2 rounded-full" />
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-10 w-full rounded-full" />
        <p role="status" className="sr-only">
          {t('webhooks.loading_deliveries')}
        </p>
      </div>
    )
  const grouped = new Map<string, Delivery[]>()
  for (const delivery of result.data) {
    const attempts = grouped.get(delivery.event_id) ?? []
    attempts.push(delivery)
    grouped.set(delivery.event_id, attempts)
  }
  const groups = [...grouped.entries()].sort(
    ([, a], [, b]) => Date.parse(b[0]!.request_body.created_at) - Date.parse(a[0]!.request_body.created_at)
  )

  return (
    <div className="webhook-log" data-webhook-log>
      {!groups.length && (
        <div className="grid gap-1 rounded-md bg-raised p-4">
          <p className="type-card-title">{t('webhooks.no_event')}</p>
          <p className="type-body text-muted-foreground">{t('webhooks.no_event_next')}</p>
        </div>
      )}
      {groups.map(([eventId, attempts], groupIndex) => (
        <section className="webhook-event" key={eventId} data-event-id={eventId}>
          <div className="grid gap-0.5">
            <h3 className="type-card-title [overflow-wrap:anywhere]" translate="no">
              {t('webhooks.event', { id: eventId })}
            </h3>
            <p className="type-small text-muted-foreground" translate="no">
              {t('webhooks.event_type', { type: attempts[0]!.request_body.type })}
            </p>
          </div>
          {attempts
            .sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at))
            .map((attempt, attemptIndex) => {
              const open = selected ? selected === attempt.id : groupIndex === 0 && attemptIndex === 0
              const headers = new Map(
                Object.entries(attempt.request_headers).map(([name, value]) => [name.toLowerCase(), value])
              )
              const result = outcome(attempt)
              return (
                <details key={attempt.id} open={open} data-delivery-id={attempt.id} className="webhook-attempt">
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      select(open ? null : attempt.id)
                    }}
                  >
                    <time dateTime={attempt.attempted_at} data-numeric>
                      {formatDateTime(attempt.attempted_at, 'en')}
                    </time>
                    <span>{t('webhooks.attempt', { number: formatNumber(attempt.attempt, 'en') })}</span>
                    <span className="webhook-outcome">
                      <StatusMark state={result.state} variant="plain" label={result.word} />
                      <span data-numeric>{attempt.status_code ?? t('webhooks.not_available')}</span>
                    </span>
                    <span data-numeric className="webhook-duration">
                      {t('webhooks.milliseconds', { value: formatNumber(attempt.latency_ms, 'en') })}
                    </span>
                  </summary>
                  <div className="webhook-evidence">
                    <dl>
                      <dt>{t('webhooks.delivery_state')}</dt>
                      <dd>{attempt.state}</dd>
                      <dt>{t('webhooks.next_retry')}</dt>
                      <dd>
                        {attempt.next_retry_at ? (
                          <ZonedTime value={attempt.next_retry_at} />
                        ) : (
                          t(attempt.next_retry_at === null ? 'webhooks.no_retry' : 'webhooks.not_recorded')
                        )}
                      </dd>
                      <dt>{t('webhooks.error')}</dt>
                      <dd>{attempt.error ?? t('webhooks.not_recorded')}</dd>
                    </dl>
                    <h4>{t('webhooks.headers')}</h4>
                    <dl>
                      {[
                        ['header_id', 'Skyclause-Webhook-Id'],
                        ['header_timestamp', 'Skyclause-Webhook-Timestamp'],
                        ['header_signature', 'Skyclause-Signature']
                      ].map(([key, name]) => {
                        return (
                          <div key={key}>
                            <dt translate="no">{t(`webhooks.${key}`)}</dt>
                            <dd translate="no">{headers.get(name!.toLowerCase()) ?? t('webhooks.not_recorded')}</dd>
                          </div>
                        )
                      })}
                    </dl>
                    <h4>{t(attempt.raw_request_body === undefined ? 'webhooks.decoded_body' : 'webhooks.raw_body')}</h4>
                    <CodeBlock>
                      <CodeBlockContent wrap translate="no">
                        {attempt.raw_request_body ?? JSON.stringify(attempt.request_body, null, 2)}
                      </CodeBlockContent>
                    </CodeBlock>
                    <h4>{t('webhooks.response')}</h4>
                    <CodeBlock>
                      <CodeBlockContent wrap translate="no">
                        {attempt.response_body ?? t('webhooks.not_recorded')}
                      </CodeBlockContent>
                    </CodeBlock>
                  </div>
                </details>
              )
            })}
        </section>
      ))}
      <div className="webhook-actions">
        {cursor && (
          <Button variant="outline" onClick={() => paginate(null)}>
            {t('webhooks.previous')}
          </Button>
        )}
        {result.next_cursor && (
          <Button variant="outline" onClick={() => paginate(result.next_cursor)}>
            {t('webhooks.next')}
          </Button>
        )}
      </div>
    </div>
  )
}
