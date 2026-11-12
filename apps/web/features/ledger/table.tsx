'use client'

import { memo, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import type { LedgerKind } from '@skyclause/contracts'
import { formatClock, formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import {
  CalendarXIcon,
  CheckIcon,
  FileSearchIcon,
  HourglassIcon,
  ListPlusIcon,
  ListRestartIcon,
  ListXIcon,
  type LucideIcon,
  MailCheckIcon,
  MessageSquareReplyIcon,
  MoonIcon,
  PencilIcon,
  ScaleIcon,
  ScrollTextIcon,
  SendIcon,
  Undo2Icon,
  XIcon
} from 'lucide-react'
import { Button } from '#ui/button'
import { ModeBadge } from '../brand/mode-badge'
import { actorOf, matchesKind, measuredWindow, minutesBetween, rowOffsets, type KindGroup } from './model'
import type { LedgerRow } from './operations'
import { t } from './i18n'

type Locale = 'en' | 'ms'
type Target = { call_id?: string; span?: { from: string; to: string } }

const KIND_GLYPHS: Record<LedgerKind, LucideIcon> = {
  call_approved: CheckIcon,
  call_edited: PencilIcon,
  call_rejected: XIcon,
  call_expired: HourglassIcon,
  call_sent: SendIcon,
  grade: ScaleIcon,
  night_graded: MoonIcon,
  listing_listed: ListPlusIcon,
  listing_changed: ListRestartIcon,
  listing_cancelled: ListXIcon,
  clause_version: ScrollTextIcon,
  window_cancelled: CalendarXIcon,
  evidence_replied: MailCheckIcon,
  crowd_reply: MessageSquareReplyIcon,
  correction: Undo2Icon
}

/** The kind of entry as a status mark: its glyph and its word, in the ink; never a colour. */
export function EntryMark({ kind, locale }: { kind: LedgerKind; locale: Locale }) {
  const Glyph = KIND_GLYPHS[kind]
  return (
    <span className="ledger-kind" data-kind={kind}>
      <Glyph aria-hidden="true" focusable="false" />
      <span>{t(`ledger.entryKinds.${kind}`, {}, locale)}</span>
    </span>
  )
}

/** A missing value: a quiet dash on screen, the words for a screen reader. */
export function Missing({ locale }: { locale: Locale }) {
  return (
    <span className="ledger-missing">
      <span aria-hidden="true">{t('ledger.dash', {}, locale)}</span>
      <span className="sr-only">{t('ledger.noValue', {}, locale)}</span>
    </span>
  )
}

/**
 * A span in MYT: one date and two times when it stays within a day, both instants when it does not. Beside an entry
 * on the same day (`day`), the date is already printed, so only the times are.
 */
export function SpanTimes({ from, to, day, locale }: { from: string; to: string; day?: string; locale: Locale }) {
  const sameDay = formatDate(from, locale) === formatDate(to, locale)
  const at = (value: string, clock: string) =>
    t('format.dateTime', { date: formatDate(value, locale), time: clock }, locale)
  const start = sameDay ? formatClock(from, locale) : formatTime(from, locale)
  return (
    <span className="ledger-span">
      <time dateTime={from}>{sameDay && day === formatDate(from, locale) ? start : at(from, start)}</time>
      <span aria-hidden="true">{t('ledger.rangeDash', {}, locale)}</span>
      <span className="sr-only">{t('ledger.rangeTo', {}, locale)}</span>
      <time dateTime={to}>{sameDay ? formatTime(to, locale) : at(to, formatTime(to, locale))}</time>
    </span>
  )
}

const COLUMNS = [
  { key: 'time' },
  { key: 'entry' },
  { key: 'concerns' },
  { key: 'actor', wide: true },
  { key: 'detail' },
  { key: 'toApproval', wide: true, figure: true },
  { key: 'toNotice', wide: true, figure: true },
  { key: 'seq', wide: true, figure: true },
  { key: 'evidence', hidden: true }
] as const

/** The shell's sticky bar height, which the header sticks under and a jump to an entry clears. */
function barHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-bar-height')) || 0
}

export function LedgerTable({
  rows,
  total,
  offset,
  locale,
  onRequest,
  correctionHref,
  selectedEntry,
  kindGroup,
  busy
}: {
  rows: LedgerRow[]
  total: number
  offset: number
  locale: Locale
  onRequest: (target: Target) => void
  correctionHref: (id: string) => string
  selectedEntry: string | null
  kindGroup: KindGroup | null
  busy: boolean
}) {
  const body = useRef<HTMLTableSectionElement>(null)
  const head = useRef<HTMLTableSectionElement>(null)
  const scrolledEntry = useRef<string | null>(null)
  // The page scrolls, so the header can stick under the shell bar; the window follows the rows' place in it.
  const [view, setView] = useState({ top: 0, height: 900 })
  const [heights, setHeights] = useState(new Map<number, number>())
  const offsets = useMemo(() => rowOffsets(rows.length, heights), [rows.length, heights])
  // A page of 50 renders whole (readable, searchable); only a longer run, such as a jump to an older entry, windows.
  const windowed = rows.length > 50
  const window_ = windowed
    ? measuredWindow(offsets, view.top, view.height)
    : { start: 0, end: rows.length, before: 0, after: 0 }
  useEffect(() => {
    if (!windowed) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = body.current?.getBoundingClientRect()
      if (!box) return
      const next = { top: Math.max(0, -box.top), height: window.innerHeight }
      startTransition(() =>
        setView((previous) => (previous.top === next.top && previous.height === next.height ? previous : next))
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [windowed])
  useEffect(() => {
    if (!windowed) return
    const observer = new ResizeObserver((entries) => {
      setHeights((previous) => {
        const next = new Map(previous)
        let changed = false
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index)
          const height = entry.target.getBoundingClientRect().height
          if (Math.abs((next.get(index) ?? 0) - height) > 1) {
            next.set(index, height)
            changed = true
          }
        }
        return changed ? next : previous
      })
    })
    body.current?.querySelectorAll('tr[data-index]').forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [windowed, window_.start, window_.end])
  useEffect(() => {
    if (!selectedEntry || scrolledEntry.current === selectedEntry) return
    const index = rows.findIndex((row) => row.id === selectedEntry)
    if (index < 0 || !body.current) return
    const header = head.current?.getBoundingClientRect().height ?? 0
    // A rendered row is measured where it is; a windowed one is reached by its estimated offset.
    const rendered = document.getElementById(`ledger-${selectedEntry}`)
    const top = rendered
      ? rendered.getBoundingClientRect().top
      : body.current.getBoundingClientRect().top + offsets[index]!
    window.scrollTo({ top: window.scrollY + top - barHeight() - header })
    scrolledEntry.current = selectedEntry
  }, [selectedEntry, rows, offsets])
  return (
    <div
      className="ledger-table-frame"
      data-ledger-frame
      data-filtering={kindGroup ? '' : undefined}
      role="region"
      aria-label={t('ledger.frame', {}, locale)}
      aria-busy={busy}
    >
      <table data-ledger-table aria-rowcount={total + 1}>
        <caption className="sr-only">{t('ledger.title', {}, locale)}</caption>
        <thead ref={head}>
          <tr aria-rowindex={1}>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`ledger-col-${column.key}`}
                data-wide={'wide' in column ? '' : undefined}
                data-figure={'figure' in column ? '' : undefined}
              >
                {'hidden' in column ? (
                  <span className="sr-only">{t(`ledger.columns.${column.key}`, {}, locale)}</span>
                ) : (
                  t(`ledger.columns.${column.key}`, {}, locale)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body}>
          {window_.before > 0 && (
            <tr aria-hidden="true" className="ledger-spacer">
              <td colSpan={COLUMNS.length} style={{ height: window_.before }} />
            </tr>
          )}
          {rows.slice(window_.start, window_.end).map((row, index) => (
            <EntryRow
              key={row.id}
              row={row}
              index={window_.start + index}
              offset={offset}
              locale={locale}
              onRequest={onRequest}
              correctionHref={correctionHref}
              dimmed={!matchesKind(row.kind, kindGroup)}
              selected={row.id === selectedEntry}
            />
          ))}
          {window_.after > 0 && (
            <tr aria-hidden="true" className="ledger-spacer">
              <td colSpan={COLUMNS.length} style={{ height: window_.after }} />
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
  correctionHref,
  dimmed,
  selected
}: {
  row: LedgerRow
  index: number
  offset: number
  locale: Locale
  onRequest: (target: Target) => void
  correctionHref: (id: string) => string
  dimmed: boolean
  selected: boolean
}) {
  const call = row.call
  const target = call?.id ?? row.refs.call_id
  const actor = actorOf(row)
  const actorText = actor
    ? 'role' in actor
      ? t(`ledger.roles.${actor.role}`, {}, locale)
      : t('ledger.platform', {}, locale)
    : null
  const toApproval = minutesBetween(call?.triggered_at, call?.approved_at)
  const toNotice = minutesBetween(call?.approved_at, call?.sent_at)
  const minutes = (value: number | null) =>
    value === null ? <Missing locale={locale} /> : t('ledger.minutes', { value: formatNumber(value, locale) }, locale)
  const outcome = row.grade?.outcome
  return (
    <tr
      id={`ledger-${row.id}`}
      data-index={index}
      aria-rowindex={offset + index + 2}
      data-dimmed={dimmed ? '' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <td className="ledger-col-time">
        <time dateTime={row.at}>
          <span className="ledger-clock" data-numeric>
            {formatTime(row.at, locale)}
          </span>
          <span className="ledger-sub">{formatDate(row.at, locale)}</span>
        </time>
      </td>
      <td className="ledger-col-entry">
        <EntryMark kind={row.kind} locale={locale} />
        {row.corrects && (
          <a className="ledger-sub" href={correctionHref(row.corrects)}>
            {t('ledger.corrects', { id: row.corrects }, locale)}
          </a>
        )}
        <span className="ledger-sub ledger-compact" data-numeric>
          {t('ledger.seq', { n: formatNumber(row.seq, locale) }, locale)}
        </span>
      </td>
      <td className="ledger-col-concerns">
        {row.window ? (
          <>
            <span className="ledger-concerns-title">{row.window.title}</span>
            <span className="ledger-sub">
              <SpanTimes
                from={row.window.starts_at}
                to={row.window.ends_at}
                day={formatDate(row.at, locale)}
                locale={locale}
              />
            </span>
          </>
        ) : target ? (
          <span translate="no">{t('ledger.callRef', { id: target }, locale)}</span>
        ) : (
          <Missing locale={locale} />
        )}
        {actorText && (
          <span className="ledger-sub ledger-compact">{t('ledger.decidedBy', { actor: actorText }, locale)}</span>
        )}
      </td>
      <td className="ledger-col-actor" data-wide="">
        {actorText ?? <Missing locale={locale} />}
      </td>
      <td className="ledger-col-detail">
        {call?.mode || outcome ? (
          <span className="ledger-detail">
            {call?.mode && <ModeBadge mode={call.mode} pack={row.pack ?? undefined} locale={locale} />}
            {outcome && (
              <span>
                {outcome in OUTCOMES ? t(`ledger.outcomes.${outcome}`, {}, locale) : outcome.replaceAll('_', ' ')}
              </span>
            )}
          </span>
        ) : (
          <Missing locale={locale} />
        )}
        {toApproval !== null && (
          <span className="ledger-sub ledger-compact" data-numeric>
            {t('ledger.toApproval', { value: formatNumber(toApproval, locale) }, locale)}
          </span>
        )}
        {toNotice !== null && (
          <span className="ledger-sub ledger-compact" data-numeric>
            {t('ledger.toNotice', { value: formatNumber(toNotice, locale) }, locale)}
          </span>
        )}
      </td>
      <td className="ledger-col-toApproval" data-wide="" data-figure="" data-numeric>
        {minutes(toApproval)}
      </td>
      <td className="ledger-col-toNotice" data-wide="" data-figure="" data-numeric>
        {minutes(toNotice)}
      </td>
      <td className="ledger-col-seq" data-wide="" data-figure="" data-numeric>
        {formatNumber(row.seq, locale)}
      </td>
      <td className="ledger-col-evidence">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('evidence.request', {}, locale)}
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
          <FileSearchIcon aria-hidden="true" />
        </Button>
      </td>
    </tr>
  )
})

const OUTCOMES = {
  hit: true,
  miss: true,
  false_alarm: true,
  correct_normal: true,
  in_band: true,
  out_of_band: true,
  unlisted_surge: true,
  no_call: true,
  pending: true
}
