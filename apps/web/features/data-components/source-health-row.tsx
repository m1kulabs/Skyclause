'use client'

import type { ReactNode } from 'react'
import type { Reading, Source, SourceState } from '@skyclause/contracts'
import { attribution } from '@skyclause/elements'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { t } from './catalogue'
import { SignalHealthRow } from './signal-health-row'

export interface SourceHealthRowProps {
  source: Source
  latest?: (Pick<Reading, 'value' | 'observed_at'> & { unit?: string }) | null
  state?: SourceState | null
  ageS?: number | null
  /** The last polls, newest last: only real polls (none passed draws no strip, never a strip of received polls). */
  ticks?: ReadonlyArray<'received' | 'missed' | 'error'>
  latestLabel?: string
  stateLabel?: string
  children?: ReactNode
  locale?: 'en' | 'ms'
}

const link = 'inline-flex min-h-6 items-center underline underline-offset-3 hover:decoration-2'

/**
 * A source's health from the API's own source, state and latest reading: the shared `SignalHealthRow` with the value
 * read from the latest reading and the cadence, licence and source link under the ID. Put it in
 * `<Table><SignalHealthHead />…`.
 */
export function SourceHealthRow({
  source,
  latest = null,
  state = null,
  ageS = null,
  ticks = [],
  latestLabel,
  stateLabel,
  children,
  locale = 'en'
}: SourceHealthRowProps) {
  const current = state?.state ?? 'pending'
  const observed = latest?.observed_at ?? state?.since ?? null
  const cadenceMin = Math.max(1, Math.round(source.cadence_s / 60))
  const cadence = t('data.source.cadence', { value: t('data.source.minute', { value: cadenceMin }, locale) }, locale)
  const licence = attribution[source.kind]
  const licenceLabel = source.licence_label || t('data.source.licence_derived', {}, locale)
  const valueText =
    latestLabel ??
    (current === 'error' || latest?.value === null || latest?.value === undefined
      ? null
      : t('data.source.value', { value: formatNumber(latest.value, locale), unit: latest.unit ?? '' }, locale))
  const figure = !latestLabel && latest?.value !== null && latest?.value !== undefined && current !== 'error'
  const error =
    current === 'error' && state
      ? t(
          'data.source.error_since',
          {
            source: source.name,
            time: formatTime(state.since, locale),
            status: state.http_status === null ? t('data.source.unknown_status', {}, locale) : state.http_status
          },
          locale
        )
      : null
  const received = ticks.filter((tick) => tick === 'received').length
  const missed = ticks.filter((tick) => tick === 'missed').length
  const failed = ticks.length - received - missed

  return (
    <SignalHealthRow
      source={source}
      state={current}
      stateLabel={stateLabel}
      value={
        valueText
          ? figure
            ? { figure: formatNumber(latest!.value as number, locale), rest: latest!.unit ?? '' }
            : { figure: null, rest: valueText }
          : null
      }
      observedAt={observed}
      ageS={ageS}
      meta={
        <>
          <span>{cadence}</span>
          {licence?.licence_url ? (
            <a href={licence.licence_url} target="_blank" rel="noreferrer" className={link}>
              {licenceLabel}
              <span className="sr-only"> {t('data.source.new_tab', {}, locale)}</span>
            </a>
          ) : (
            <span>{licenceLabel}</span>
          )}
          <a href={source.url} target="_blank" rel="noreferrer" className={link}>
            {t('data.source.open_source', {}, locale)}
            <span className="sr-only"> {t('data.source.new_tab', {}, locale)}</span>
          </a>
        </>
      }
      detail={children}
      problem={
        <>
          {error ? (
            <p className="mt-1 flex items-center gap-1.5 type-small text-foreground">
              <Glyph state="error" />
              <span>{error}</span>
            </p>
          ) : null}
          {ticks.length ? (
            <span
              role="img"
              aria-label={
                t('data.source.ticks_label', { count: ticks.length }, locale) +
                ': ' +
                t('data.strip.ticks_received', { received, missed, errors: failed }, locale)
              }
              className="mt-1 flex w-fit gap-[2px]"
            >
              {ticks.slice(0, 48).map((tick, i) => (
                <span
                  key={i}
                  title={t(`data.source.tick_${tick}`, {}, locale)}
                  className={
                    tick === 'received'
                      ? 'inline-block h-3 w-1 rounded-full bg-foreground'
                      : tick === 'missed'
                        ? 'inline-block h-3 w-1 rounded-full bg-overlay'
                        : 'inline-block h-1 w-1 self-end rounded-full bg-foreground'
                  }
                />
              ))}
            </span>
          ) : null}
        </>
      }
      locale={locale}
    />
  )
}
