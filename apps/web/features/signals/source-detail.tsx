'use client'

import { useMemo } from 'react'
import type { EvaluatedSource, Project, ProjectStrip, SourcePoll, SourceReading } from './operations'
import type { StripInput } from '@skyclause/elements'
import { formatDate, formatDateTime, formatLocalDateKey, formatNumber, formatTime } from '@skyclause/i18n/format'
import { WindowStrip } from '../data-components/window-strip'
import { SignalsChart, type SignalChartPoint } from './signals-chart'
import { Button } from '#ui/button'
import { ReadingsTable } from './readings-table'
import { t } from './catalogue'
import { NotBuiltError } from '@skyclause/contracts'
import { baseline as forecastBaseline, type DailyExits } from '@skyclause/forecast'

const DAY_MS = 24 * 60 * 60 * 1000

function asLocalDate(value: string, timeZone: string): string {
  return formatLocalDateKey(value, timeZone)
}

function last24h(readings: readonly SourceReading[], now: number): SourceReading[] {
  const start = now - DAY_MS
  return readings.filter(({ observed_at }) => {
    const at = Date.parse(observed_at)
    return at >= start && at <= now
  })
}

function rainfallStrip(readings: readonly SourceReading[], now: number): StripInput {
  const fromMs = now - DAY_MS
  const byTime = new Map(
    last24h(readings, now)
      .filter((reading) => reading.metric === 'rain_5m_mm')
      .map((reading) => [Date.parse(reading.observed_at), reading])
  )
  const firstBucket = Math.ceil(fromMs / 300_000) * 300_000
  const rain5: StripInput['rain5'][number][] = []
  const rain60: StripInput['rain60'][number][] = []
  for (let at = firstBucket; at <= now; at += 300_000) {
    const record = byTime.get(at)
    rain5.push({ at: new Date(at).toISOString(), value: record?.value ?? null, state: record ? 'received' : 'missed' })
    const past = Array.from({ length: 12 }, (_, index) => byTime.get(at - index * 300_000))
    const total = past.every((item) => item?.value !== null && item?.value !== undefined)
      ? past.reduce((sum, item) => sum + item!.value!, 0)
      : null
    rain60.push({ at: new Date(at).toISOString(), value: total })
  }
  return {
    from: new Date(firstBucket).toISOString(),
    to: new Date(now).toISOString(),
    now: new Date(now).toISOString(),
    window: null,
    rain5,
    rain60
  }
}

function cadenceWindow(
  points: readonly SignalChartPoint[],
  cadenceS: number,
  fromMs: number,
  toMs: number
): SignalChartPoint[] {
  const interval = cadenceS * 1000
  const byBucket = new Map<number, SignalChartPoint>()
  for (const point of points) byBucket.set(Math.floor(Date.parse(point.at) / interval) * interval, point)
  const start = Math.floor(fromMs / interval) * interval
  const end = Math.floor(toMs / interval) * interval
  const result: SignalChartPoint[] = []
  for (let at = start; at <= end; at += interval) {
    result.push(byBucket.get(at) ?? { at: new Date(at).toISOString(), value: null })
  }
  return result
}

function hourlyPoints(readings: readonly SourceReading[], now: number): SignalChartPoint[] {
  const values = last24h(readings, now)
    .filter((reading) => reading.metric === 'api')
    .map((reading) => ({
      at: reading.observed_at,
      value: reading.value,
      record:
        typeof reading.value_json === 'object' &&
        reading.value_json &&
        !Array.isArray(reading.value_json) &&
        typeof reading.value_json.class === 'string'
          ? reading.value_json.class
          : undefined
    }))
  return cadenceWindow(values, 3600, now - DAY_MS, now)
}

function dailyExits(readings: readonly SourceReading[], timeZone: string): DailyExits[] {
  return readings
    .filter((reading) => reading.metric === 'exits_daily' && reading.value !== null)
    .map((reading) => ({
      date: reading.item_key?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? asLocalDate(reading.observed_at, timeZone),
      value: reading.value!,
      readingId: reading.id
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
}

function dailyWindow(exits: readonly DailyExits[], targetDate: string): SignalChartPoint[] {
  const byDate = new Map(exits.map(({ date, value }) => [date, value]))
  const [year, month, day] = targetDate.split('-').map(Number)
  const target = Date.UTC(year!, month! - 1, day!)
  const result: SignalChartPoint[] = []
  for (let offset = -56; offset <= 0; offset += 1) {
    const date = new Date(target + offset * DAY_MS).toISOString().slice(0, 10)
    const value = byDate.get(date)
    result.push({
      at: `${date}T12:00:00.000Z`,
      value: value ?? null
    })
  }
  return result
}

function latestErrorAt(polls: readonly SourcePoll[]): string | null {
  return (
    [...polls]
      .filter((poll) => poll.outcome === 'error')
      .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))[0]?.started_at ?? null
  )
}

export interface SourceDetailProps {
  project: Project
  source: EvaluatedSource
  strip: ProjectStrip
  readings: readonly SourceReading[]
  polls: readonly SourcePoll[]
  locale: 'en' | 'ms'
  onClose: () => void
}

export function SourceDetail({ project, source, strip, readings, polls, locale, onClose }: SourceDetailProps) {
  const now = Date.now()
  const readingRows = useMemo(() => last24h(readings, now), [readings, now])
  const errors = polls
    .filter((poll) => poll.outcome === 'error')
    .filter((poll) => {
      const at = Date.parse(poll.started_at)
      return at >= now - DAY_MS && at <= now
    })
    .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))
  const latestObserved = readingRows.at(-1)?.observed_at ?? source.latest_reading?.observed_at ?? null

  let body: React.ReactNode
  if (source.kind === 'jps_rain') {
    const input = rainfallStrip(readings, now)
    const readingCount = input.rain5.filter((point) => point.value !== null).length
    const sixtyMinuteInput = strip.inputs.find(
      (value) => value.source_ids.includes(source.id) && value.name.includes('rain_60m_mm')
    )
    const sixtyMinuteSeries = strip.series['site.rain_60m_mm']?.at(-1)?.[1]
    const sixtyMinuteValue = typeof sixtyMinuteInput?.value === 'number' ? sixtyMinuteInput.value : sixtyMinuteSeries
    const at = source.latest_reading?.observed_at ?? new Date(now).toISOString()
    body = (
      <section aria-labelledby="signals-gauge-title" className="flex flex-col gap-3">
        <h3 id="signals-gauge-title" className="type-card-title">
          {t('signals.no_window', {}, locale)}
        </h3>
        {sixtyMinuteValue !== null && sixtyMinuteValue !== undefined && (
          <p data-numeric className="type-text">
            {t(
              'signals.rain_value_time',
              { value: formatNumber(sixtyMinuteValue, locale), time: formatTime(at, locale) },
              locale
            )}
          </p>
        )}
        <p className="type-small text-muted-foreground">
          {t(
            readingCount === 1 ? 'signals.gauge_summary_one' : 'signals.gauge_summary',
            { count: formatNumber(readingCount, locale) },
            locale
          )}
        </p>
        <WindowStrip windows={[]} strip={input} locale={locale} />
      </section>
    )
  } else if (source.kind === 'apims') {
    const points = hourlyPoints(readingRows, now)
    const from = new Date(now - DAY_MS).toISOString()
    const to = new Date(now).toISOString()
    body = (
      <SignalsChart
        title={t('signals.api_title', {}, locale)}
        summary={t(
          'signals.api_summary',
          { from: formatDateTime(from, locale), to: formatDateTime(to, locale) },
          locale
        )}
        points={points}
        locale={locale}
        station={source.external_id}
        references={[
          { value: 100, label: t('signals.api_100', {}, locale) },
          { value: 150, label: t('signals.api_150', {}, locale) },
          { value: 180, label: t('signals.api_180', {}, locale) }
        ]}
        yDomain={[0, 200]}
      />
    )
  } else if (source.kind === 'rapidrail_od') {
    const exits = dailyExits(readings, project.time_zone)
    const targetDate = exits.at(-1)?.date ?? asLocalDate(new Date(now).toISOString(), project.time_zone)
    const points = dailyWindow(exits, targetDate)
    let baselineValue: number | null = null
    let baselineUnavailable = false
    let baselineNoCall = false
    try {
      const result = forecastBaseline(exits, targetDate, latestErrorAt(polls))
      if ('noCall' in result) baselineNoCall = true
      else baselineValue = result.value
    } catch (error) {
      if (error instanceof NotBuiltError && error.owner === 'b-forecast') baselineUnavailable = true
      else throw error
    }
    const from = points[0] ? asLocalDate(points[0].at, project.time_zone) : targetDate
    body = (
      <section className="flex flex-col gap-3">
        {baselineValue !== null && (
          <p data-numeric className="type-body">
            {t('signals.rail_baseline', { value: formatNumber(baselineValue, locale) }, locale)}
          </p>
        )}
        {baselineUnavailable && (
          <p className="type-small text-muted-foreground">{t('signals.baseline_unavailable', {}, locale)}</p>
        )}
        {baselineNoCall && (
          <p className="type-small text-muted-foreground">{t('signals.baseline_no_call', {}, locale)}</p>
        )}
        <SignalsChart
          title={t('signals.rail_title', {}, locale)}
          summary={t(
            'signals.rail_summary',
            {
              from: formatDate(`${from}T12:00:00.000Z`, locale),
              to: formatDate(`${targetDate}T12:00:00.000Z`, locale)
            },
            locale
          )}
          points={points}
          locale={locale}
          dateAxis
          baseline={
            baselineValue === null ? undefined : { value: baselineValue, label: t('signals.baseline', {}, locale) }
          }
        />
      </section>
    )
  } else {
    const warningTime = source.latest_reading?.observed_at ?? source.state.since
    body = (
      <section className="flex flex-col gap-3">
        {source.latest_reading?.value_text && <p className="type-section">{source.latest_reading.value_text}</p>}
        <p className="type-small text-muted-foreground">
          {t('signals.warning_summary', { time: formatTime(warningTime, locale) }, locale)}
        </p>
        {source.latest_reading?.value_json && (
          <pre
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable requires the scroll container to be keyboard-focusable.
            tabIndex={0}
            role="region"
            aria-label={t('signals.warning_data', {}, locale)}
            className="overflow-auto rounded-md bg-raised p-3 type-code"
          >
            {JSON.stringify(source.latest_reading.value_json, null, 2)}
          </pre>
        )}
      </section>
    )
  }

  return (
    <section
      data-source-detail
      aria-labelledby="signals-detail-title"
      className="flex flex-col gap-5 rounded-xl bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="signals-detail-title" className="type-section" translate="no">
            {t('signals.detail_source', { source: source.external_id }, locale)}
          </h2>
          <p className="mt-1 flex flex-wrap gap-x-4 type-small text-muted-foreground">
            {latestObserved && (
              <span data-numeric>
                {t('signals.source_time_value', { time: formatDateTime(latestObserved, locale) }, locale)}
              </span>
            )}
            {source.latest_reading?.received_at && (
              <span data-numeric>
                {t(
                  'signals.received_time_value',
                  { time: formatDateTime(source.latest_reading.received_at, locale) },
                  locale
                )}
              </span>
            )}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('signals.close_detail', {}, locale)}
        </Button>
      </div>
      {body}
      <ReadingsTable readings={readingRows} locale={locale} />
      <section aria-labelledby="signals-detail-errors-title" className="flex flex-col gap-2">
        <h3 id="signals-detail-errors-title" className="type-card-title">
          {t('signals.recent_errors', {}, locale)}
        </h3>
        {errors.length ? (
          <ul className="flex flex-col type-body">
            {errors.map((poll) => (
              <li key={poll.id} data-numeric className="min-h-11 py-2">
                {poll.http_status === null
                  ? t('signals.error_no_status', { time: formatDateTime(poll.started_at, locale) }, locale)
                  : t(
                      'signals.error_status',
                      { status: poll.http_status, time: formatDateTime(poll.started_at, locale) },
                      locale
                    )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-muted-foreground">{t('signals.no_errors', {}, locale)}</p>
        )}
      </section>
    </section>
  )
}
