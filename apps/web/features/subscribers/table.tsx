'use client'

import { useState } from 'react'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'
import { RemoveSubscriber } from './remove-subscriber'
import type { Rows } from './index'

type Locale = 'en' | 'ms'
type Row = Rows['data'][number]

const filters = ['all', 'confirmed', 'unconfirmed', 'stopped'] as const
type Filter = (typeof filters)[number]

const stopped = new Set(['bounced', 'complained', 'unsubscribed'])
const markFor = {
  confirmed: 'fresh',
  unconfirmed: 'pending',
  bounced: 'error',
  complained: 'error',
  unsubscribed: 'off_hours'
} as const

function matches(row: Row, filter: Filter) {
  if (filter === 'all') return true
  if (filter === 'stopped') return stopped.has(row.status) || row.suppressed
  return row.status === filter && !row.suppressed
}

/**
 * The list that measures: one row per subscriber on a 64px pitch, the windows as a right-aligned figure, the times in
 * MYT. A filter dims the rows that do not match and never removes them, so nothing jumps. At most one page of 50 rows
 * is ever rendered; pages replace each other.
 */
export function SubscriberTable({
  rows,
  from,
  total,
  hasPrevious,
  hasNext,
  busy,
  onPrevious,
  onNext,
  onRemoved,
  locale
}: {
  rows: Row[]
  from: number
  total: number | undefined
  hasPrevious: boolean
  hasNext: boolean
  busy: boolean
  onPrevious: () => void
  onNext: () => void
  onRemoved: () => void
  locale: Locale
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = rows.slice(0, 50)
  const shown = visible.filter((row) => matches(row, filter)).length
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="subscriber-list-title">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id="subscriber-list-title" className="type-section">
          {t('subscribers.list_title', {}, locale)}
        </h2>
        <ToggleGroup
          aria-label={t('subscribers.filter', {}, locale)}
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0] as Filter | undefined
            if (next) setFilter(next)
          }}
        >
          {filters.map((item) => (
            <ToggleGroupItem key={item} value={item} className="pointer-coarse:h-11">
              {t(
                item === 'all' || item === 'stopped' ? `subscribers.filter_${item}` : `subscribers.status_${item}`,
                {},
                locale
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p role="status" className="type-small text-muted-foreground" data-numeric>
        {t('subscribers.filter_result', { shown, count: visible.length }, locale)}
      </p>
      <div
        className="subscribers-frame"
        role="region"
        aria-label={t('subscribers.title', {}, locale)}
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable requires the scroll container to be keyboard-focusable. */
        tabIndex={0}
      >
        <table className="subscribers-table type-body">
          <caption className="sr-only">{t('subscribers.title', {}, locale)}</caption>
          <thead>
            <tr>
              <th scope="col">{t('subscribe.email', {}, locale)}</th>
              <th scope="col">{t('subscribe.role', {}, locale)}</th>
              <th scope="col" data-numeric className="text-right">
                {t('subscribe.windows', {}, locale)}
              </th>
              <th scope="col">{t('subscribe.language', {}, locale)}</th>
              <th scope="col">{t('subscribers.since', {}, locale)}</th>
              <th scope="col">{t('subscribers.status', {}, locale)}</th>
              <th scope="col">
                <span className="sr-only">{t('subscribers.actions', {}, locale)}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} data-dimmed={matches(row, filter) ? undefined : ''}>
                <td data-cell="email">
                  <span className="subscribers-email">{row.email}</span>
                  <span className="type-small subscribers-sub">
                    {row.consent
                      ? t(
                          'subscribers.consent_detail',
                          {
                            form: row.consent.form,
                            version: row.consent.notice_version,
                            language: t(
                              row.consent.language === 'ms' ? 'subscribe.malay' : 'subscribe.english',
                              {},
                              locale
                            )
                          },
                          locale
                        )
                      : t('subscribers.no_consent', {}, locale)}
                  </span>
                </td>
                <td data-cell="role" data-label={t('subscribe.role', {}, locale)}>
                  {row.role || (
                    <span aria-label={t('subscribers.no_role', {}, locale)}>
                      {t('subscribers.missing', {}, locale)}
                    </span>
                  )}
                </td>
                <td
                  data-cell="windows"
                  data-label={t('subscribe.windows', {}, locale)}
                  data-numeric
                  className="text-right"
                >
                  {formatNumber(row.window_ids.length, locale)}
                  <span className="type-small subscribers-sub">
                    {row.channels.length
                      ? row.channels.map((channel) => t(`subscribe.${channel}_channel`, {}, locale)).join(', ')
                      : t('subscribers.no_channels', {}, locale)}
                  </span>
                </td>
                <td data-cell="language" data-label={t('subscribe.language', {}, locale)}>
                  {t(row.language === 'ms' ? 'subscribe.malay' : 'subscribe.english', {}, locale)}
                </td>
                <td data-cell="since" data-label={t('subscribers.since', {}, locale)}>
                  {row.confirmed_at ? (
                    <time dateTime={row.confirmed_at}>{formatDateTime(row.confirmed_at, locale)}</time>
                  ) : (
                    t('subscribers.not_confirmed', {}, locale)
                  )}
                </td>
                <td data-cell="state">
                  <StatusMark
                    state={markFor[row.status as keyof typeof markFor] ?? 'pending'}
                    variant="plain"
                    label={t(`subscribers.status_${row.status}`, {}, locale)}
                    locale={locale}
                  />
                  {row.suppressed && (
                    <span className="type-small subscribers-sub">{t('subscribers.suppressed_yes', {}, locale)}</span>
                  )}
                  <span className="type-small subscribers-sub">
                    {row.last_notice_at ? (
                      <>
                        {t('subscribers.last_notice', {}, locale)}
                        <time dateTime={row.last_notice_at}>{formatDateTime(row.last_notice_at, locale)}</time>
                      </>
                    ) : (
                      t('subscribers.no_notice', {}, locale)
                    )}
                  </span>
                </td>
                <td data-cell="actions">
                  <RemoveSubscriber id={row.id} email={row.email} locale={locale} onRemoved={onRemoved} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body text-muted-foreground" data-numeric>
          {total === undefined
            ? t(
                'subscribers.range_open',
                { from: formatNumber(from, locale), to: formatNumber(from + visible.length - 1, locale) },
                locale
              )
            : t(
                'subscribers.range',
                {
                  from: formatNumber(from, locale),
                  to: formatNumber(from + visible.length - 1, locale),
                  total: formatNumber(total, locale)
                },
                locale
              )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!hasPrevious || busy} onClick={onPrevious}>
            {t('subscribers.previous', {}, locale)}
          </Button>
          <Button variant="outline" disabled={!hasNext || busy} onClick={onNext}>
            {t('subscribers.next', {}, locale)}
          </Button>
        </div>
      </div>
    </section>
  )
}
