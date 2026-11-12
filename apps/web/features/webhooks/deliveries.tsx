'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CopyIcon } from 'lucide-react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { StatusMark } from '../brand/status-mark'
import { SourceError } from '../data-components/states'
import { ApiProblem } from '../../lib/api-fetch'
import { apiFetch, type Delivery } from './operations'
import { t } from './catalogue'

type Locale = 'en' | 'ms'

export function ZonedTime({ value, locale = 'en' }: { value: string | null | undefined; locale?: Locale }) {
  return value ? (
    <time dateTime={value}>{formatDateTime(value, locale)}</time>
  ) : (
    <span>{t('webhooks.not_recorded', {}, locale)}</span>
  )
}

/** One attempt's outcome as a mark with its word: delivered on a 2xx, failed on any other answer, none when it did not answer. */
function outcome(attempt: Delivery, locale: Locale) {
  if (attempt.status_code === null) return { state: 'error', word: t('webhooks.no_response', {}, locale) } as const
  return attempt.status_code >= 200 && attempt.status_code < 300
    ? ({ state: 'fresh', word: t('webhooks.delivered', {}, locale) } as const)
    : ({ state: 'error', word: t('webhooks.failed_attempt', {}, locale) } as const)
}

/** The state the delivery service reports, in words; a state this build has no word for is shown as it came. */
function stateWord(state: string, locale: Locale) {
  return ['pending', 'queued', 'retrying', 'delivered', 'failed', 'abandoned'].includes(state)
    ? t(`webhooks.delivery_states.${state}`, {}, locale)
    : state
}

/** An event's ID cut to its last 8 characters, with a control that copies the whole of it. */
function EventId({ value, locale }: { value: string; locale: Locale }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  async function copyId() {
    try {
      await navigator.clipboard.writeText(value)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span translate="no" className="type-small text-muted-foreground" data-numeric>
        {`…${value.slice(-8)}`}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t('webhooks.copy_id', {}, locale)}
        onClick={() => void copyId()}
      >
        <CopyIcon aria-hidden="true" />
      </Button>
      <span role="status" className={copy === 'failed' ? 'type-small' : 'sr-only'} translate="no">
        {copy === 'copied'
          ? t('webhooks.id_copied', {}, locale)
          : copy === 'failed'
            ? t('webhooks.id_copy_failed', { id: value }, locale)
            : ''}
      </span>
    </span>
  )
}

export function DeliveryLog({
  org,
  webhookId,
  selected,
  cursor,
  refresh,
  select,
  paginate,
  locale = 'en'
}: {
  org: string
  webhookId: string
  selected: string | null
  cursor: string | null
  refresh: number
  select: (id: string | null) => void
  paginate: (cursor: string | null) => void
  locale?: Locale
}) {
  const [result, setResult] = useState<{ data: Delivery[]; next_cursor: string | null }>()
  const [failed, setFailed] = useState<{ error: unknown; at: string }>()
  const [reload, setReload] = useState(0)
  // With nothing chosen in the URL the newest attempt is open; closing it keeps it closed.
  const [dismissed, setDismissed] = useState(false)
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
        source={t('webhooks.source_deliveries', {}, locale)}
        status={failed.error instanceof ApiProblem ? failed.error.status : null}
        at={failed.at}
        locale={locale}
        retry={
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            {t('webhooks.retry', {}, locale)}
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
          {t('webhooks.loading_deliveries', {}, locale)}
        </p>
      </div>
    )
  const grouped = new Map<string, Delivery[]>()
  for (const delivery of result.data) {
    const attempts = grouped.get(delivery.event_id) ?? []
    attempts.push(delivery)
    grouped.set(delivery.event_id, attempts)
  }
  // Newest event first; an event's retries stay together, newest attempt first.
  const rows = [...grouped.entries()]
    .sort(([, a], [, b]) => Date.parse(b[0]!.request_body.created_at) - Date.parse(a[0]!.request_body.created_at))
    .flatMap(([, attempts]) => [...attempts].sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at)))

  return (
    <div className="webhook-log" data-webhook-log>
      {!rows.length && (
        <div className="grid gap-1 rounded-md bg-raised p-4">
          <p className="type-card-title">{t('webhooks.no_event', {}, locale)}</p>
          <p className="type-body text-muted-foreground">{t('webhooks.no_event_next', {}, locale)}</p>
        </div>
      )}
      {rows.length > 0 && (
        <Table aria-label={t('webhooks.delivery_log', {}, locale)}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('webhooks.col_time', {}, locale)}</TableHead>
              <TableHead>{t('webhooks.col_event', {}, locale)}</TableHead>
              <TableHead numeric>{t('webhooks.col_attempt', {}, locale)}</TableHead>
              <TableHead>{t('webhooks.col_outcome', {}, locale)}</TableHead>
              <TableHead numeric>{t('webhooks.col_duration', {}, locale)}</TableHead>
              <TableHead>
                <span className="sr-only">{t('webhooks.details', {}, locale)}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((attempt, index) => {
              const open = selected ? selected === attempt.id : index === 0 && !dismissed
              const headers = new Map(
                Object.entries(attempt.request_headers).map(([name, value]) => [name.toLowerCase(), value])
              )
              const mark = outcome(attempt, locale)
              const detailId = `webhook-attempt-${attempt.id}`
              const time = formatDateTime(attempt.attempted_at, locale)
              return (
                <Fragment key={attempt.id}>
                  <TableRow data-delivery-id={attempt.id} data-event-id={attempt.event_id}>
                    <TableCell phone="primary">
                      <time dateTime={attempt.attempted_at}>{time}</time>
                    </TableCell>
                    <TableCell phone="meta" label={t('webhooks.col_event', {}, locale)}>
                      <span className="inline-flex flex-wrap items-center gap-x-2">
                        <span translate="no">{attempt.request_body.type}</span>
                        <EventId value={attempt.event_id} locale={locale} />
                      </span>
                    </TableCell>
                    <TableCell numeric phone="meta" label={t('webhooks.col_attempt', {}, locale)}>
                      {formatNumber(attempt.attempt, locale)}
                    </TableCell>
                    <TableCell phone="end">
                      <span className="webhook-outcome">
                        <StatusMark state={mark.state} variant="plain" label={mark.word} locale={locale} />
                        <span data-numeric>{attempt.status_code ?? t('webhooks.not_available', {}, locale)}</span>
                      </span>
                    </TableCell>
                    <TableCell numeric phone="meta" label={t('webhooks.col_duration', {}, locale)}>
                      {t('webhooks.milliseconds', { value: formatNumber(attempt.latency_ms, locale) }, locale)}
                    </TableCell>
                    <TableCell phone="meta">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={open}
                        aria-controls={open ? detailId : undefined}
                        aria-label={t(
                          'webhooks.details_for',
                          { number: formatNumber(attempt.attempt, locale), time },
                          locale
                        )}
                        onClick={() => {
                          if (open) {
                            setDismissed(true)
                            if (selected) select(null)
                          } else {
                            setDismissed(false)
                            select(attempt.id)
                          }
                        }}
                      >
                        {t('webhooks.details', {}, locale)}
                        {open ? <ChevronUpIcon data-icon="inline-end" /> : <ChevronDownIcon data-icon="inline-end" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow id={detailId} data-delivery-detail={attempt.id}>
                      <TableCell colSpan={6} className="webhook-detail-cell whitespace-normal">
                        <div className="webhook-evidence">
                          <dl>
                            <dt>{t('webhooks.delivery_state', {}, locale)}</dt>
                            <dd>{stateWord(attempt.state, locale)}</dd>
                            <dt>{t('webhooks.next_retry', {}, locale)}</dt>
                            <dd>
                              {attempt.next_retry_at ? (
                                <ZonedTime value={attempt.next_retry_at} locale={locale} />
                              ) : (
                                t(
                                  attempt.next_retry_at === null ? 'webhooks.no_retry' : 'webhooks.not_recorded',
                                  {},
                                  locale
                                )
                              )}
                            </dd>
                            <dt>{t('webhooks.error', {}, locale)}</dt>
                            <dd>{attempt.error ?? t('webhooks.not_recorded', {}, locale)}</dd>
                          </dl>
                          <h4>{t('webhooks.headers', {}, locale)}</h4>
                          <dl>
                            {[
                              ['header_id', 'Skyclause-Webhook-Id'],
                              ['header_timestamp', 'Skyclause-Webhook-Timestamp'],
                              ['header_signature', 'Skyclause-Signature']
                            ].map(([key, name]) => (
                              <div key={key}>
                                <dt translate="no">{t(`webhooks.${key}`, {}, locale)}</dt>
                                <dd translate="no">
                                  {headers.get(name!.toLowerCase()) ?? t('webhooks.not_recorded', {}, locale)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          <h4>
                            {t(
                              attempt.raw_request_body === undefined ? 'webhooks.decoded_body' : 'webhooks.raw_body',
                              {},
                              locale
                            )}
                          </h4>
                          <CodeBlock>
                            <CodeBlockContent wrap translate="no">
                              {attempt.raw_request_body ?? JSON.stringify(attempt.request_body, null, 2)}
                            </CodeBlockContent>
                          </CodeBlock>
                          <h4>{t('webhooks.response', {}, locale)}</h4>
                          <CodeBlock>
                            <CodeBlockContent wrap translate="no">
                              {attempt.response_body ?? t('webhooks.not_recorded', {}, locale)}
                            </CodeBlockContent>
                          </CodeBlock>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}
      <div className="webhook-actions">
        {cursor && (
          <Button variant="outline" onClick={() => paginate(null)}>
            {t('webhooks.first_page', {}, locale)}
          </Button>
        )}
        {result.next_cursor && (
          <Button variant="outline" onClick={() => paginate(result.next_cursor)}>
            {t('webhooks.next', {}, locale)}
          </Button>
        )}
      </div>
    </div>
  )
}
