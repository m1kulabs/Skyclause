'use client'

import { useMemo, useState } from 'react'
import type { Window } from '@skyclause/contracts'
import { layoutStrip, type StripInput, type StripWindow } from '@skyclause/elements'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { ReplayMark } from '../brand/replay-mark'
import { t } from './catalogue'
import { indicatorName } from './indicator-names'
import { DayStrip } from './day-strip'
import { ReadingsChart } from './readings-chart'
import { readingRows } from './readings-table'

export interface WindowStripProps {
  windows: readonly Window[]
  strip?: StripInput
  /**
   * List the windows under the day row with their times and calls. Defaults to listing them when the strip carries its
   * own `windows`; pass false when the page already names the window, its times and its mode.
   */
  list?: boolean
  locale?: 'en' | 'ms'
}

function emptyStrip(windows: readonly Window[]): StripInput {
  const now = new Date().toISOString()
  return {
    from: now,
    to: now,
    now,
    window: windows[0] ? { from: windows[0].starts_at, to: windows[0].ends_at } : null,
    rain5: [],
    rain60: []
  }
}

const HOUR = 3_600_000
const hourFloor = (at: number) => Math.floor(at / HOUR) * HOUR

export function WindowStrip({ windows, strip, list, locale = 'en' }: WindowStripProps) {
  const [showTable, setShowTable] = useState(false)
  const input = useMemo(() => strip ?? emptyStrip(windows), [strip, windows])
  // The day row: the strip's own windows with their calls, else the windows passed in (their calls unknown here).
  const dayWindows = useMemo<StripWindow[]>(
    () =>
      input.windows
        ? [...input.windows]
        : windows.map((w) => ({ id: w.id, from: w.starts_at, to: w.ends_at, state: null, title: w.title })),
    [input.windows, windows]
  )
  // Readings keep the strip's span; with none, the day row spans its windows with an hour either side.
  const daySpan = useMemo(() => {
    if (input.from !== input.to || !dayWindows.length) return { from: input.from, to: input.to }
    const starts = dayWindows.map((w) => Date.parse(w.from))
    const ends = dayWindows.map((w) => Date.parse(w.to))
    return {
      from: new Date(hourFloor(Math.min(...starts)) - HOUR).toISOString(),
      to: new Date(hourFloor(Math.max(...ends)) + 2 * HOUR).toISOString()
    }
  }, [input.from, input.to, dayWindows])
  // The readings under the day row: the window's span stays as a tone band, its capsule is the row above. Lanes sit
  // 30 apart so each holds its 13px title above it and clears the y label of the lane over it; the header band holds
  // the now label and the first lane's title (20 more).
  const layout = useMemo(() => {
    const at = Date.parse(input.now)
    const nowInSpan = at >= Date.parse(input.from) && at <= Date.parse(input.to)
    return layoutStrip({ ...input, windows: [], locale }, { header: (nowInSpan ? 28 : 8) + 20, laneGap: 46 })
  }, [input, locale])
  const dayRow = dayWindows.length ? (
    <DayStrip
      from={daySpan.from}
      to={daySpan.to}
      now={input.now}
      windows={dayWindows}
      list={list ?? Boolean(input.windows)}
      embedded
      locale={locale}
    />
  ) : null

  const count = input.rain5.length + input.rain60.length
  const table = useMemo(() => readingRows(input.rain5, input.rain60), [input.rain5, input.rain60])
  const firstCrossing = layout.crossings[0]
  const crossingText = firstCrossing
    ? t(
        'data.strip.crossing',
        {
          time: formatTime(firstCrossing.at, locale),
          value: formatNumber(firstCrossing.value, locale, { maximumFractionDigits: 1 })
        },
        locale
      )
    : t('data.strip.no_crossing', {}, locale)
  const summary = input.replay
    ? t(
        'data.strip.summary_replay',
        {
          source: input.replay.source,
          captured: formatTime(input.replay.capturedAt, locale),
          crossing: crossingText,
          count
        },
        locale
      )
    : t('data.strip.summary_live', { to: formatTime(input.to, locale), crossing: crossingText, count }, locale)

  const win = windows[0]
  const toggleLabel = showTable ? t('data.strip.hide_table', {}, locale) : t('data.strip.show_table', {}, locale)

  if (count === 0) {
    return (
      <div className="flex w-full flex-col gap-3">
        {dayRow}
        <figure className="w-full">
          {input.replay ? <ReplayMark locale={locale} /> : null}
          <figcaption className="type-small text-muted-foreground">
            {input.replay ? summary : t('data.strip.empty', {}, locale)}
          </figcaption>
        </figure>
      </div>
    )
  }

  return (
    <figure className="flex w-full flex-col gap-2">
      {dayRow}
      <div className="flex flex-wrap items-center gap-2">
        {layout.isReplay ? <ReplayMark locale={locale} /> : null}
        {win ? (
          <span className="inline-flex flex-wrap items-center gap-1 type-small text-muted-foreground">
            <span>{t('data.strip.window', {}, locale)}</span>
            <time dateTime={win.starts_at}>{formatTime(win.starts_at, locale)}</time>
          </span>
        ) : null}
      </div>
      <ReadingsChart layout={layout} locale={locale} />
      <figcaption className="type-small text-muted-foreground">{summary}</figcaption>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="min-h-[34px] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px]"
        >
          {toggleLabel}
        </Button>
        {showTable ? (
          <div className="mt-2">
            <Table compact>
              <TableCaption className="mt-0 mb-2 text-left">
                {t('data.strip.table_caption', {}, locale)}
                {table.bucketMinutes ? (
                  <span className="block">
                    {t('data.strip.table_peaks', { minutes: table.bucketMinutes, count }, locale)}
                  </span>
                ) : null}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('data.strip.table_time', {}, locale)}</TableHead>
                  <TableHead numeric>{t('data.strip.table_rain5', {}, locale)}</TableHead>
                  <TableHead numeric>{t('data.strip.table_rain60', {}, locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row) => (
                  <TableRow key={row.at}>
                    <TableCell>
                      <time dateTime={row.at}>{formatTime(row.at, locale)}</time>
                    </TableCell>
                    <TableCell numeric phone="meta" label={t('data.strip.table_rain5', {}, locale)}>
                      {row.rain5 === null
                        ? t('data.strip.missing', {}, locale)
                        : formatNumber(row.rain5, locale, { maximumFractionDigits: 1 })}
                    </TableCell>
                    <TableCell numeric phone="meta" label={t('data.strip.table_rain60', {}, locale)}>
                      {row.rain60 === null
                        ? t('data.strip.missing', {}, locale)
                        : formatNumber(row.rain60, locale, { maximumFractionDigits: 1 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
      {input.ages && input.ages.length ? (
        <div className="md:hidden">
          <p className="type-small font-medium">{t('data.strip.ages_title', {}, locale)}</p>
          <ul className="mt-1 flex flex-col gap-1 type-small tabular-nums">
            {input.ages.map((age) => (
              <li key={age.name} className="flex flex-wrap items-center gap-1">
                <span>{indicatorName(age.name, locale)}</span>
                <span>{age.observedAt ? formatTime(age.observedAt, locale) : t('data.strip.missing', {}, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </figure>
  )
}
