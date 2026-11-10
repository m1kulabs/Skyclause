'use client'

import { useEffect, useState } from 'react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Empty, EmptyHeader, EmptyDescription } from '#ui/empty'
import { apiFetch, type Delivery } from './operations'
import { t } from './catalogue'

export function ZonedTime({ value }: { value: string | null | undefined }) {
  return value ? <time dateTime={value}>{formatDateTime(value, 'en')}</time> : <span>{t('webhooks.not_recorded')}</span>
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
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setResult(undefined)
    setFailed(false)
    void apiFetch('listWebhookDeliveries', {
      org,
      params: { id: webhookId },
      query: { limit: 50, ...(cursor ? { cursor } : {}) },
      signal: controller.signal
    })
      .then((page) => {
        if (!controller.signal.aborted) setResult(page)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [org, webhookId, cursor, refresh])

  if (failed) return <p role="alert">{t('webhooks.delivery_failed')}</p>
  if (!result) return <p role="status">{t('webhooks.loading_deliveries')}</p>
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
        <Empty>
          <EmptyHeader>
            <EmptyDescription>{t('webhooks.no_event')}</EmptyDescription>
          </EmptyHeader>
          <p>{t('webhooks.no_event_next')}</p>
        </Empty>
      )}
      {groups.map(([eventId, attempts], groupIndex) => (
        <section className="webhook-event" key={eventId} data-event-id={eventId}>
          <h3 translate="no">{t('webhooks.event', { id: eventId })}</h3>
          <p translate="no">{t('webhooks.event_type', { type: attempts[0]!.request_body.type })}</p>
          {attempts
            .sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at))
            .map((attempt, attemptIndex) => {
              const open = selected ? selected === attempt.id : groupIndex === 0 && attemptIndex === 0
              const headers = new Map(
                Object.entries(attempt.request_headers).map(([name, value]) => [name.toLowerCase(), value])
              )
              return (
                <details key={attempt.id} open={open} data-delivery-id={attempt.id}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      select(open ? null : attempt.id)
                    }}
                  >
                    <span>{t('webhooks.attempt', { number: formatNumber(attempt.attempt, 'en') })}</span>
                    <span>
                      {t('webhooks.status')}
                      {t('webhooks.value_separator')}
                      {attempt.status_code ?? t('webhooks.not_available')}
                    </span>
                    <span>{t('webhooks.milliseconds', { value: formatNumber(attempt.latency_ms, 'en') })}</span>
                  </summary>
                  <dl>
                    <dt>{t('webhooks.attempted_at')}</dt>
                    <dd>
                      <ZonedTime value={attempt.attempted_at} />
                    </dd>
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
                  <pre translate="no">{attempt.raw_request_body ?? JSON.stringify(attempt.request_body, null, 2)}</pre>
                  <h4>{t('webhooks.response')}</h4>
                  <pre translate="no">{attempt.response_body ?? t('webhooks.not_recorded')}</pre>
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
