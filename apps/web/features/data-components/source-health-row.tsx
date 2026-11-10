'use client'

import { useMemo } from 'react'
import type { Reading, Source, SourceState } from '@skyclause/contracts'
import { attribution } from '@skyclause/elements'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { InputAgeChip } from './input-age-chip'
import { t } from './catalogue'

export interface SourceHealthRowProps {
  source: Source
  latest?: (Pick<Reading, 'value' | 'observed_at'> & { unit?: string }) | null
  state?: SourceState | null
  ageS?: number | null
  ticks?: ReadonlyArray<'received' | 'missed' | 'error'>
  locale?: 'en' | 'ms'
}

export function SourceHealthRow({
  source,
  latest = null,
  state = null,
  ageS = null,
  ticks = [],
  locale = 'en'
}: SourceHealthRowProps) {
  const current = state?.state ?? 'pending'
  const ageInput = useMemo(
    () => ({
      name: source.name,
      value: latest?.value ?? null,
      unit: latest?.unit ?? '',
      state: current,
      since: state?.since ?? null,
      age_s: ageS,
      source_ids: [source.id],
      source_url: source.url,
      reading_ids: [],
      observed_at:
        latest?.observed_at ??
        (ageS !== null && ageS !== undefined ? new Date(Date.now() - ageS * 1000).toISOString() : null)
    }),
    [ageS, current, latest?.observed_at, latest?.unit, latest?.value, source.id, source.name, source.url, state?.since]
  )
  const cadenceMin = Math.max(1, Math.round(source.cadence_s / 60))
  const cadence = t('data.source.cadence', { value: t('data.source.minute', { value: cadenceMin }, locale) }, locale)
  const licence = attribution[source.kind]
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
  const valueText =
    current === 'error'
      ? null
      : latest?.value === null || latest?.value === undefined
        ? t('data.source.latest_empty', {}, locale)
        : t('data.source.value', { value: formatNumber(latest.value, locale), unit: latest.unit ?? '' }, locale)

  return (
    <tr data-source={source.id} className="block border-b md:table-row">
      <td className="block p-2 md:table-cell">
        <span className="flex min-h-[34px] flex-wrap items-center gap-2 [@media(pointer:coarse)]:min-h-[44px]">
          <Glyph state={current} />
          <span className="font-medium">{source.name}</span>
          <span translate="no" className="text-xs text-muted-foreground tabular-nums">
            {source.external_id}
          </span>
          {valueText && <span className="text-xs text-muted-foreground tabular-nums">{valueText}</span>}
          {current !== 'error' && (latest?.observed_at || ageS !== null) ? (
            <InputAgeChip input={ageInput} locale={locale} />
          ) : null}
        </span>
        {error && <span className="mt-1 block text-xs text-destructive tabular-nums">{error}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums md:hidden">
          <span>{cadence}</span>
          <span>{t(`brand.states.${current}`, {}, locale)}</span>
        </span>
      </td>
      <td className="block p-2 text-xs tabular-nums md:table-cell">
        <span className="hidden flex-wrap items-center gap-3 text-muted-foreground md:flex">
          <span>{cadence}</span>
          <span className="inline-flex items-center gap-1">
            <Glyph state={current} />
            <span>{t(`brand.states.${current}`, {}, locale)}</span>
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          {ticks.length ? (
            <span
              role="img"
              aria-label={t('data.source.ticks_label', { count: ticks.length }, locale)}
              className="inline-flex gap-[2px]"
            >
              {ticks.slice(0, 48).map((tick, i) => (
                <span
                  key={i}
                  title={t(`data.source.tick_${tick}`, {}, locale)}
                  className={
                    tick === 'received'
                      ? 'inline-block h-3 w-1 bg-foreground/70'
                      : tick === 'missed'
                        ? 'inline-block h-3 w-1 bg-foreground/20'
                        : 'inline-block h-3 w-1 bg-destructive'
                  }
                />
              ))}
            </span>
          ) : null}
          {licence?.licence_url ? (
            <a
              href={licence.licence_url}
              target="_blank"
              rel="noreferrer"
              className="min-h-[34px] inline-flex items-center underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px]"
            >
              {t('data.source.licence', {}, locale)}
            </a>
          ) : (
            <span className="text-muted-foreground">{t('data.source.licence_derived', {}, locale)}</span>
          )}
        </span>
      </td>
    </tr>
  )
}
