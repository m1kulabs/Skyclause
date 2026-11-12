'use client'

import { useCallback, useId, useState } from 'react'
import type { Forecast, Listing, Night } from '@skyclause/contracts'
import { formatDate, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { t } from './catalogue'
import { apiFetch, allPages, type Graded } from './operations'
import { EmptyBlock, Failure, Time } from './presentation'
import { axisTicks, type Locale } from './model'
import { useRead } from './use-read'

const PAGE = 50

function NightLane({
  night,
  listing,
  actual,
  locale
}: {
  night: Night & { forecast: Forecast | null }
  listing?: Listing
  actual: number | null
  locale: Locale
}) {
  const hatch = useId().replaceAll(':', '')
  const [table, setTable] = useState(false)
  const start = Date.parse(night.arrival_start)
  const end = Date.parse(night.exit_end ?? night.arrival_end)
  const position = (value: string) => 10 + ((Date.parse(value) - start) / Math.max(1, end - start)) * 280
  const forecast = night.forecast
  const ticks = axisTicks(Math.max(forecast?.band_high ?? 0, actual ?? 0))
  const x = (value: number) => 10 + (value / ticks.at(-1)!) * 280
  const span = (from: string, to: string) =>
    t('analysis.period', { from: formatTime(from, locale), to: formatTime(to, locale) }, locale)
  // Labels are HTML at 13px under each drawing, placed by share of its width, so they never scale below the floor.
  const label = (x: number, index: number, last: number, text: string) => (
    <span
      key={index}
      data-edge={index === 0 ? 'start' : index === last ? 'end' : undefined}
      style={{ left: `${(x / 300) * 100}%` }}
    >
      {text}
    </span>
  )
  const cells = [
    { key: 'arrival', text: span(night.arrival_start, night.arrival_end) },
    {
      key: 'exit',
      text:
        night.exit_start && night.exit_end
          ? span(night.exit_start, night.exit_end)
          : t('analysis.periodUnknown', {}, locale)
    },
    {
      key: 'forecast',
      text: forecast ? formatNumber(forecast.forecast, locale) : t('analysis.noForecast', {}, locale)
    },
    {
      key: 'band',
      text: forecast
        ? t(
            'analysis.band',
            { low: formatNumber(forecast.band_low, locale), high: formatNumber(forecast.band_high, locale) },
            locale
          )
        : t('analysis.missing', {}, locale)
    },
    { key: 'actual', text: actual === null ? t('analysis.pending', {}, locale) : formatNumber(actual, locale) }
  ]
  return (
    <article className="analysis-night" data-night-lane>
      <div className="analysis-chart-head">
        <h3>{listing?.listing_key ?? t('analysis.nightName', { date: formatDate(night.date, locale) }, locale)}</h3>
        <Button variant="ghost" size="sm" aria-expanded={table} onClick={() => setTable(!table)}>
          {t(table ? 'analysis.view' : 'analysis.table', {}, locale)}
        </Button>
      </div>
      {listing && (
        <a className="analysis-link" href={listing.source_url}>
          {t('analysis.source', { source: listing.source_url }, locale)}
        </a>
      )}
      {forecast && (
        <p className="analysis-muted">
          {t('analysis.source', { source: forecast.method }, locale)}
          <span className="analysis-dot" aria-hidden="true" />
          <Time at={forecast.created_at} locale={locale} />
        </p>
      )}
      {!table && (
        <>
          <div className="analysis-night-drawing">
            <svg viewBox="0 0 300 56" role="img" aria-label={t('analysis.nightSummary', {}, locale)}>
              <defs>
                <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse">
                  <path d="M0 6L6 0" stroke="var(--chart-ink)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect
                x={position(night.arrival_start)}
                y="12"
                width={Math.max(0, position(night.arrival_end) - position(night.arrival_start))}
                height="18"
                rx="9"
                fill="var(--raised)"
              />
              {night.exit_start && night.exit_end && (
                <rect
                  x={position(night.exit_start)}
                  y="34"
                  width={Math.max(0, position(night.exit_end) - position(night.exit_start))}
                  height="18"
                  rx="9"
                  fill={`url(#${hatch})`}
                  stroke="var(--chart-ink)"
                  strokeWidth="1"
                />
              )}
            </svg>
            <p className="analysis-night-axis" aria-hidden="true">
              {[0, 1, 2, 3].map((index) =>
                label(
                  10 + (index * 280) / 3,
                  index,
                  3,
                  formatTime(new Date(start + ((end - start) * index) / 3), locale)
                )
              )}
            </p>
          </div>
          {forecast && (
            <div className="analysis-night-drawing">
              <svg
                viewBox="0 0 300 36"
                role="img"
                aria-label={t(
                  'analysis.band',
                  { low: formatNumber(forecast.band_low, locale), high: formatNumber(forecast.band_high, locale) },
                  locale
                )}
              >
                <line
                  x1={x(forecast.band_low)}
                  y1="18"
                  x2={x(forecast.band_high)}
                  y2="18"
                  stroke="var(--chart-ink)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <line
                  x1={x(forecast.forecast)}
                  y1="10"
                  x2={x(forecast.forecast)}
                  y2="26"
                  stroke="var(--chart-emphasis)"
                  strokeWidth="2"
                />
                {actual !== null && (
                  <line
                    data-actual-tick
                    x1={x(actual)}
                    y1="6"
                    x2={x(actual)}
                    y2="30"
                    stroke="var(--foreground)"
                    strokeWidth="2"
                  />
                )}
              </svg>
              <p className="analysis-night-axis" aria-hidden="true">
                {ticks.map((tick, index) => label(x(tick), index, ticks.length - 1, formatNumber(tick, locale)))}
              </p>
            </div>
          )}
        </>
      )}
      <dl className="analysis-night-facts" data-night-table={table ? '' : undefined}>
        {cells.map((cell) => (
          <div key={cell.key}>
            <dt>{t(`analysis.${cell.key === 'band' ? 'bandLabel' : cell.key}`, {}, locale)}</dt>
            <dd>{cell.text}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export function NightLanes({
  projectId,
  org,
  from,
  to,
  grades,
  locale
}: {
  projectId: string
  org: string
  from: string
  to: string
  grades: Graded[]
  locale: Locale
}) {
  const read = useCallback(
    async (signal: AbortSignal) => {
      const [nights, listings] = await Promise.all([
        allPages((cursor) => apiFetch('listNights', { org, params: { id: projectId }, query: { cursor }, signal })),
        allPages((cursor) =>
          apiFetch('listProjectListings', { org, params: { id: projectId }, query: { cursor }, signal })
        )
      ])
      return { nights, listings }
    },
    [org, projectId]
  )
  const result = useRead(read)
  const [page, setPage] = useState(0)
  if (result.status === 'loading')
    return (
      <p role="status" className="analysis-sub" data-analysis-loading>
        {t('analysis.loading', {}, locale)}
      </p>
    )
  if (result.status === 'error')
    return (
      <Failure
        source={t('analysis.sources.nights', {}, locale)}
        error={result.error}
        at={result.at}
        retry={result.retry}
        locale={locale}
      />
    )
  const nights = result.value.nights.filter((night) => night.date >= from && night.date <= to)
  // Lists never render more than 50 rows: 50 nights to a page.
  const pages = Math.ceil(nights.length / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = nights.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <section aria-labelledby="analysis-night-title" className="analysis-nights">
      <div className="analysis-section-head">
        <h2 id="analysis-night-title">{t('analysis.nightTitle', {}, locale)}</h2>
        <p className="analysis-muted">{t('analysis.nightSummary', {}, locale)}</p>
      </div>
      {!nights.length ? (
        <EmptyBlock message="nightEmpty" locale={locale} />
      ) : (
        shown.map((night) => (
          <NightLane
            key={night.id}
            night={night}
            listing={result.value.listings.find((listing) => listing.night_id === night.id)}
            actual={grades.find((grade) => grade.night_id === night.id)?.actual ?? null}
            locale={locale}
          />
        ))
      )}
      {pages > 1 && (
        <div className="analysis-pager">
          <p role="status" className="analysis-muted" data-numeric>
            {t(
              'analysis.rowsShown',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                n: formatNumber(nights.length, locale)
              },
              locale
            )}
          </p>
          <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t('analysis.previousRows', {}, locale)}
          </Button>
          <Button variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            {t('analysis.nextRows', {}, locale)}
          </Button>
        </div>
      )}
    </section>
  )
}
