'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { InputState } from '@skyclause/contracts'
import { formatAge, formatTime } from '@skyclause/i18n/format'
import { TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'

type Locale = 'en' | 'ms'

export interface SignalHealthRowProps {
  /** The source's name and its ID (the ID is copyable text, never translated). */
  source: { id: string; name: string; external_id: string }
  /** The source's kind in words ("Rainfall gauge, JPS"), under the ID. */
  kindLabel?: string
  /** The input state: its glyph and word are always printed. */
  state: InputState
  /** Replaces the state's own word ("Fresh · Moderate"). */
  stateLabel?: string
  /** The newest value, its figure set apart from the rest (unit, class); null when there is none yet. */
  value?: { figure: string | null; rest: string } | null
  /** When the newest reading was taken. */
  observedAt?: string | null
  /** Seconds since it was taken, as the API measured. */
  ageS?: number | null
  /** Makes the name a link (the page that opens the source's readings); `selected` marks the open one. */
  href?: string
  selected?: boolean
  /** Under the ID: the licence and source links. */
  meta?: ReactNode
  /** Under the health mark: what the state adds (a pending input starts at, a probation's agreement). */
  detail?: ReactNode
  /** Under the health mark: the error a failing source is showing, and since when. */
  problem?: ReactNode
  locale?: Locale
}

/** The column heads of a signal-health table; pair with `SignalHealthRow` inside `<Table>`. */
export function SignalHealthHead({ locale = 'en' }: { locale?: Locale }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>{t('data.signal.source', {}, locale)}</TableHead>
        <TableHead numeric>{t('data.signal.value', {}, locale)}</TableHead>
        <TableHead numeric>{t('data.signal.age', {}, locale)}</TableHead>
        <TableHead>{t('data.signal.health', {}, locale)}</TableHead>
      </TableRow>
    </TableHeader>
  )
}

/**
 * One source's health as a table row, the same on the dashboard, the overview and the Signals page: what it is and
 * reads (name over its ID), its newest value as a figure, its age in words over the time it was read, and its health as
 * a status mark with what the state adds. Put it in `<Table><SignalHealthHead /><TableBody>…`; on a phone the name and
 * the health are line one and the value and age line two.
 */
export function SignalHealthRow({
  source,
  kindLabel,
  state,
  stateLabel,
  value = null,
  observedAt = null,
  ageS = null,
  href,
  selected = false,
  meta,
  detail,
  problem,
  locale = 'en'
}: SignalHealthRowProps) {
  const name = (
    <>
      <Glyph state={state} />
      <span>{source.name}</span>
    </>
  )
  const textValue = value && !value.figure && value.rest ? value.rest : undefined
  return (
    <TableRow selected={selected} data-source={source.id} data-phone-row className="align-top">
      <TableCell className="min-w-60 py-2 whitespace-normal">
        {href ? (
          <Link
            href={href}
            scroll={false}
            replace
            aria-current={selected ? 'true' : undefined}
            className="inline-flex min-h-6 max-w-full items-center gap-2 font-medium break-words hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="inline-flex min-h-6 max-w-full items-center gap-2 font-medium break-words">{name}</span>
        )}
        <p className="flex flex-wrap gap-x-3 type-small text-muted-foreground">
          <span translate="no" data-numeric className="break-all text-foreground">
            {source.external_id}
          </span>
          {kindLabel ? <span>{kindLabel}</span> : null}
        </p>
        {meta ? <p className="flex flex-wrap items-center gap-x-3 type-small text-muted-foreground">{meta}</p> : null}
      </TableCell>
      <TableCell
        numeric
        phone="meta"
        label={t('data.signal.value', {}, locale)}
        title={textValue}
        className="py-2 whitespace-normal"
      >
        {value ? (
          <span className={value.figure ? 'block' : 'line-clamp-2 max-w-[26rem] sm:ml-auto'}>
            {value.figure ? <span className="type-figure">{value.figure}</span> : null}
            {value.figure && value.rest ? ' ' : null}
            <span className={value.figure ? 'text-muted-foreground' : undefined}>{value.rest}</span>
          </span>
        ) : (
          <span className="type-small text-muted-foreground">{t('data.signal.no_value', {}, locale)}</span>
        )}
      </TableCell>
      <TableCell numeric phone="meta" label={t('data.signal.age', {}, locale)} className="py-2 whitespace-nowrap">
        {ageS === null || ageS === undefined ? null : (
          <span className="block">{formatAge(new Date(Date.now() - ageS * 1000), locale)}</span>
        )}
        {observedAt ? (
          <time dateTime={observedAt} className="type-small text-muted-foreground">
            {formatTime(observedAt, locale)}
          </time>
        ) : null}
      </TableCell>
      <TableCell phone="end" className="py-2 whitespace-nowrap">
        <StatusMark state={state} label={stateLabel} locale={locale} />
        {detail ? <p className="mt-1 type-small whitespace-normal text-muted-foreground">{detail}</p> : null}
        {problem ? <div className="whitespace-normal">{problem}</div> : null}
      </TableCell>
    </TableRow>
  )
}
