'use client'

import { useEffect, useState } from 'react'
import { formatDateTime, formatList, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { StatusMark } from '../brand/status-mark'
import { SettingsRowMenu, SettingsRowMenuItem } from '../settings/parts'
import { t } from './catalogue'
import type { Rows } from './index'

type Locale = 'en' | 'ms'
type Row = Rows['data'][number]

/** The consent forms the API records, each said in words; anything else is never printed as its key. */
const consentForms = new Set(['subscribe_link', 'import', 'confirm', 'preferences'])
const consentForm = (form: string, locale: Locale) =>
  t(consentForms.has(form) ? `subscribers.form_${form}` : 'subscribers.form_other', {}, locale)

const filters = ['all', 'confirmed', 'unconfirmed', 'suppressed'] as const
type Filter = (typeof filters)[number]

/** A subscriber who will receive no notice: a stopped status, or suppressed by a bounce or a complaint. */
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
  if (filter === 'suppressed') return stopped.has(row.status) || row.suppressed
  return row.status === filter && !row.suppressed
}

function filterFromUrl(): Filter {
  const value = new URLSearchParams(window.location.search).get('status')
  return (filters as readonly string[]).includes(value ?? '') ? (value as Filter) : 'all'
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="type-small text-muted-foreground">{label}</dt>
      <dd className="m-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** What the row leaves out, on demand: the consent record, the channels and when a notice last went. */
function SubscriberDetails({ row, onClose, locale }: { row: Row; onClose: () => void; locale: Locale }) {
  const language = (value: string) => t(value === 'ms' ? 'subscribe.malay' : 'subscribe.english', {}, locale)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">{row.email}</DialogTitle>
          <DialogDescription>{t('subscribers.details_description', {}, locale)}</DialogDescription>
        </DialogHeader>
        <dl className="m-0 grid min-w-0 gap-3">
          <Detail label={t('subscribers.status', {}, locale)}>
            <StatusMark
              state={markFor[row.status as keyof typeof markFor] ?? 'pending'}
              variant="plain"
              label={t(`subscribers.status_${row.status}`, {}, locale)}
              locale={locale}
            />
            {row.suppressed ? ` · ${t('subscribers.suppressed_yes', {}, locale)}` : null}
          </Detail>
          <Detail label={t('subscribe.role', {}, locale)}>{row.role || t('subscribers.no_role', {}, locale)}</Detail>
          <Detail label={t('subscribe.language', {}, locale)}>{language(row.language)}</Detail>
          <Detail label={t('subscribers.since', {}, locale)}>
            {row.confirmed_at ? (
              <time dateTime={row.confirmed_at}>{formatDateTime(row.confirmed_at, locale)}</time>
            ) : (
              t('subscribers.not_confirmed', {}, locale)
            )}
          </Detail>
          <Detail label={t('subscribers.channels', {}, locale)}>
            {row.channels.length
              ? formatList(
                  row.channels.map((channel) => t(`subscribe.${channel}_channel`, {}, locale)),
                  locale
                )
              : t('subscribers.no_channels', {}, locale)}
          </Detail>
          <Detail label={t('subscribers.windows_count', {}, locale)}>
            {formatNumber(row.window_ids.length, locale)}
          </Detail>
          <Detail label={t('subscribers.consent', {}, locale)}>
            {row.consent
              ? t(
                  'subscribers.consent_detail',
                  {
                    form: consentForm(row.consent.form, locale),
                    version: row.consent.notice_version,
                    language: language(row.consent.language)
                  },
                  locale
                )
              : t('subscribers.no_consent', {}, locale)}
          </Detail>
          <Detail label={t('subscribers.last_notice', {}, locale)}>
            {row.last_notice_at ? (
              <time dateTime={row.last_notice_at}>{formatDateTime(row.last_notice_at, locale)}</time>
            ) : (
              t('subscribers.no_notice', {}, locale)
            )}
          </Detail>
        </dl>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The list as the one table: a subscriber a row on the 44px pitch, the windows as a right-aligned figure, the times in
 * MYT, the email the control that opens everything else. A filter dims the rows that do not match and never removes
 * them, so nothing jumps. At most one page of 50 rows is ever rendered; pages replace each other, and a page control
 * that has nowhere to go is not drawn.
 */
export function SubscriberTable({
  rows,
  from,
  total,
  hasPrevious,
  hasNext,
  busy,
  removing,
  onPrevious,
  onNext,
  onRemove,
  locale
}: {
  rows: Row[]
  from: number
  total: number | undefined
  hasPrevious: boolean
  hasNext: boolean
  busy: boolean
  /** A removal is waiting or being sent; another cannot be queued. */
  removing: boolean
  onPrevious: () => void
  onNext: () => void
  onRemove: (row: Row) => void
  locale: Locale
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Row | null>(null)
  const visible = rows.slice(0, 50)
  const shown = visible.filter((row) => matches(row, filter)).length
  const to = from + visible.length - 1

  useEffect(() => setFilter(filterFromUrl()), [])

  const choose = (next: Filter) => {
    const params = new URLSearchParams(window.location.search)
    if (next === 'all') params.delete('status')
    else params.set('status', next)
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    setFilter(next)
  }

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="subscriber-list-title">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id="subscriber-list-title" tabIndex={-1} className="type-section">
          {t('subscribers.list_title', {}, locale)}
        </h2>
        {/* One row of four down to 360px; below it (a small phone, or 200% zoom) two rows of two, inside the page. */}
        <ToggleGroup
          className="max-[420px]:flex-nowrap max-[360px]:grid max-[360px]:grid-cols-2 max-[360px]:rounded-3xl"
          aria-label={t('subscribers.filter', {}, locale)}
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0] as Filter | undefined
            if (next) choose(next)
          }}
        >
          {filters.map((item) => (
            <ToggleGroupItem key={item} value={item} className="pointer-coarse:h-11 max-[420px]:px-1.5">
              {t(
                item === 'all' || item === 'suppressed' ? `subscribers.filter_${item}` : `subscribers.status_${item}`,
                {},
                locale
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <p role="status" className="type-small text-muted-foreground" data-numeric>
        {t(
          'subscribers.filter_result',
          { shown: formatNumber(shown, locale), count: formatNumber(visible.length, locale) },
          locale
        )}
      </p>
      <div
        role="region"
        className="min-w-0"
        aria-label={t('subscribers.title', {}, locale)}
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable requires the scroll container to be keyboard-focusable. */
        tabIndex={0}
      >
        <Table>
          <caption className="sr-only">{t('subscribers.title', {}, locale)}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('subscribe.email', {}, locale)}</TableHead>
              <TableHead className="lg:w-36">{t('subscribe.role', {}, locale)}</TableHead>
              <TableHead numeric className="lg:w-24">
                {t('subscribe.windows', {}, locale)}
              </TableHead>
              <TableHead className="lg:w-28 max-lg:hidden">{t('subscribe.language', {}, locale)}</TableHead>
              <TableHead className="max-lg:hidden">{t('subscribers.since', {}, locale)}</TableHead>
              <TableHead className="lg:w-48">{t('subscribers.status', {}, locale)}</TableHead>
              <TableHead className="lg:w-14">
                <span className="sr-only">{t('subscribers.actions', {}, locale)}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id} data-subscriber-row dimmed={!matches(row, filter)}>
                <TableCell phone="primary" truncate="40ch" title={row.email}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-haspopup="dialog"
                    className="-ml-3 block max-w-full truncate"
                    onClick={() => setOpen(row)}
                  >
                    {row.email}
                  </Button>
                </TableCell>
                <TableCell
                  truncate="18ch"
                  phone="meta"
                  label={t('subscribe.role', {}, locale)}
                  title={row.role || undefined}
                >
                  {row.role || <span className="text-muted-foreground">{t('subscribers.no_role', {}, locale)}</span>}
                </TableCell>
                <TableCell numeric phone="meta" label={t('subscribe.windows', {}, locale)}>
                  {formatNumber(row.window_ids.length, locale)}
                </TableCell>
                <TableCell phone="hide" className="max-lg:hidden">
                  {t(row.language === 'ms' ? 'subscribe.malay' : 'subscribe.english', {}, locale)}
                </TableCell>
                <TableCell phone="meta" label={t('subscribers.since', {}, locale)} className="max-lg:hidden">
                  {row.confirmed_at ? (
                    <time dateTime={row.confirmed_at}>{formatDateTime(row.confirmed_at, locale)}</time>
                  ) : (
                    t('subscribers.not_confirmed', {}, locale)
                  )}
                </TableCell>
                <TableCell phone="end">
                  <StatusMark
                    state={markFor[row.status as keyof typeof markFor] ?? 'pending'}
                    variant="plain"
                    label={
                      row.suppressed
                        ? `${t(`subscribers.status_${row.status}`, {}, locale)} · ${t('subscribers.suppressed_yes', {}, locale)}`
                        : t(`subscribers.status_${row.status}`, {}, locale)
                    }
                    locale={locale}
                  />
                </TableCell>
                <TableCell phone="hide" className="text-right">
                  <SettingsRowMenu label={t('subscribers.more_actions', { email: row.email }, locale)}>
                    <SettingsRowMenuItem destructive disabled={removing} onSelect={() => onRemove(row)}>
                      {t('subscribers.remove_item', {}, locale)}
                    </SettingsRowMenuItem>
                  </SettingsRowMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body text-muted-foreground" data-numeric>
          {total === undefined
            ? t('subscribers.range_open', { from: formatNumber(from, locale), to: formatNumber(to, locale) }, locale)
            : t(
                'subscribers.range',
                { from: formatNumber(from, locale), to: formatNumber(to, locale), total: formatNumber(total, locale) },
                locale
              )}
        </p>
        {hasPrevious || hasNext ? (
          <div className="flex gap-2">
            {hasPrevious ? (
              <Button variant="outline" disabled={busy} onClick={onPrevious}>
                {t('subscribers.previous', {}, locale)}
              </Button>
            ) : null}
            {hasNext ? (
              <Button variant="outline" disabled={busy} onClick={onNext}>
                {t('subscribers.next', {}, locale)}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {open ? <SubscriberDetails row={open} onClose={() => setOpen(null)} locale={locale} /> : null}
    </section>
  )
}
