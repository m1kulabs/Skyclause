'use client'

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The overflow region needs keyboard focus for native arrow and PageDown scrolling. */

import { memo, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { ModeBadge } from '../brand/mode-badge'
import { measuredWindow, rowOffsets } from './model'
import type { LedgerRow } from './operations'
import { t } from './i18n'

export function LedgerTable({
  rows,
  total,
  offset,
  locale,
  onRequest,
  correctionHref,
  selectedEntry,
  busy
}: {
  rows: LedgerRow[]
  total: number
  offset: number
  locale: 'en' | 'ms'
  onRequest: (target: { call_id?: string; span?: { from: string; to: string } }) => void
  correctionHref: (id: string) => string
  selectedEntry: string | null
  busy: boolean
}) {
  const frame = useRef<HTMLDivElement>(null)
  const scrolledEntry = useRef<string | null>(null)
  const [scroll, setScroll] = useState(0)
  const [heights, setHeights] = useState(new Map<number, number>())
  const offsets = useMemo(() => rowOffsets(rows.length, heights), [rows.length, heights])
  const window = measuredWindow(offsets, scroll, 600)
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setHeights((previous) => {
        const next = new Map(previous)
        let changed = false
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index)
          const height = entry.target.getBoundingClientRect().height
          if (Math.abs((next.get(index) ?? 144) - height) > 1) {
            next.set(index, height)
            changed = true
          }
        }
        return changed ? next : previous
      })
    })
    frame.current?.querySelectorAll('tr[data-index]').forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [window.start, window.end])
  useEffect(() => {
    if (!selectedEntry || scrolledEntry.current === selectedEntry) return
    const index = rows.findIndex((row) => row.id === selectedEntry)
    if (index >= 0 && frame.current) {
      frame.current.scrollTop = window.offsets[index]!
      scrolledEntry.current = selectedEntry
    }
  }, [selectedEntry, rows, window.offsets])
  return (
    <div
      ref={frame}
      className="ledger-table-frame"
      data-ledger-frame
      tabIndex={0}
      role="region"
      aria-label={t('ledger.frame', {}, locale)}
      aria-busy={busy}
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop
        startTransition(() => setScroll(top))
      }}
    >
      <table data-ledger-table aria-rowcount={total + 1}>
        <caption className="sr-only">{t('ledger.title', {}, locale)}</caption>
        <thead>
          <tr aria-rowindex={1}>
            {['date', 'window', 'mode', 'role', 'delay', 'grade', 'actions'].map((key) => (
              <th key={key} scope="col">
                {t(`ledger.${key}`, {}, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {window.before > 0 && (
            <tr aria-hidden="true">
              <td colSpan={7} style={{ height: window.before, padding: 0, border: 0 }} />
            </tr>
          )}
          {rows.slice(window.start, window.end).map((row, index) => (
            <EntryRow
              key={row.id}
              row={row}
              index={window.start + index}
              offset={offset}
              locale={locale}
              onRequest={onRequest}
              correctionHref={correctionHref}
            />
          ))}
          {window.after > 0 && (
            <tr aria-hidden="true">
              <td colSpan={7} style={{ height: window.after, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Keep unchanged rows out of scroll renders, including their Intl date/number work.
const EntryRow = memo(function EntryRow({
  row,
  index,
  offset,
  locale,
  onRequest,
  correctionHref
}: {
  row: LedgerRow
  index: number
  offset: number
  locale: 'en' | 'ms'
  onRequest: (target: { call_id?: string; span?: { from: string; to: string } }) => void
  correctionHref: (id: string) => string
}) {
  const call = row.call
  const mode = call?.mode
  const target = call?.id ?? row.refs.call_id
  const missing = t('ledger.noValue', {}, locale)
  const minutes = (from?: string | null, to?: string | null) =>
    from && to
      ? t(
          'ledger.minutes',
          { value: formatNumber(Math.round((Date.parse(to) - Date.parse(from)) / 60000), locale) },
          locale
        )
      : missing
  return (
    <tr id={`ledger-${row.id}`} data-index={index} aria-rowindex={offset + index + 2}>
      <td>
        <time dateTime={row.at}>{formatDateTime(row.at, locale)}</time>
        <span className="ledger-entry-id" translate="no">
          {t('ledger.entry', { id: row.id }, locale)}
        </span>
        {row.corrects && (
          <a href={correctionHref(row.corrects)}>{t('ledger.corrects', { id: row.corrects }, locale)}</a>
        )}
      </td>
      <td>
        {row.window ? (
          <>
            <span>{row.window.title}</span>
            <time dateTime={row.window.starts_at}>{formatTime(row.window.starts_at, locale)}</time>
            <time dateTime={row.window.ends_at}>{formatTime(row.window.ends_at, locale)}</time>
          </>
        ) : (
          missing
        )}
      </td>
      <td>
        {mode ? (
          <>
            <ModeBadge mode={mode} pack={row.pack ?? undefined} />
            <span>{t(`ledger.modes.${mode}`, {}, locale)}</span>
          </>
        ) : (
          missing
        )}
      </td>
      <td>{row.approver_role ? t(`ledger.roles.${row.approver_role}`, {}, locale) : missing}</td>
      <td>
        {t(
          'ledger.delays',
          {
            approved: minutes(call?.triggered_at, call?.approved_at),
            sent: minutes(call?.approved_at, call?.sent_at)
          },
          locale
        )}
      </td>
      <td>{row.grade?.outcome ?? missing}</td>
      <td>
        <Button
          variant="outline"
          onClick={() =>
            onRequest(
              target
                ? { call_id: target }
                : row.window
                  ? { span: { from: row.window.starts_at, to: row.window.ends_at } }
                  : {}
            )
          }
        >
          {t('evidence.request', {}, locale)}
        </Button>
      </td>
    </tr>
  )
})
