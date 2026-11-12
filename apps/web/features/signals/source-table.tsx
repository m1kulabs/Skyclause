'use client'

import Link from 'next/link'
import { attribution } from '@skyclause/elements'
import { formatAge, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { latestParts, lastSourceError, stateDetail } from './source-display'
import type { EvaluatedSource, ProjectStrip } from './operations'
import { t } from './catalogue'

type Locale = 'en' | 'ms'

const link = 'inline-flex min-h-6 items-center underline underline-offset-3 hover:decoration-2'

/** The error a source is showing, and since when: its failing state, else its newest error of the last day. */
function SourceProblem({ source, now, locale }: { source: EvaluatedSource; now: number; locale: Locale }) {
  const { state } = source
  if (state.state === 'error') {
    return (
      <p className="flex items-center gap-1.5 type-small text-foreground">
        <Glyph state="error" />
        <time dateTime={state.since} data-numeric>
          {state.http_status === null
            ? t('signals.failing_since_no_status', { time: formatTime(state.since, locale) }, locale)
            : t('signals.failing_since', { time: formatTime(state.since, locale), status: state.http_status }, locale)}
        </time>
      </p>
    )
  }
  const error = lastSourceError(source, now)
  if (!error) return null
  return (
    <p className="type-small text-muted-foreground">
      <time dateTime={error.started_at} data-numeric>
        {error.http_status === null
          ? t('signals.last_error_no_status', { time: formatTime(error.started_at, locale) }, locale)
          : t('signals.last_error', { status: error.http_status, time: formatTime(error.started_at, locale) }, locale)}
      </time>
    </p>
  )
}

/**
 * Each bound source as a row that measures: what it is and reads, its newest value as a figure with its unit, its age
 * in words, its health as a status mark, and a failing source with its error and since when. The name opens its
 * readings.
 */
export function SourceTable({
  sources,
  strip,
  now,
  root,
  selected,
  locale
}: {
  sources: EvaluatedSource[]
  strip: ProjectStrip
  now: number
  root: string
  selected: string | null
  locale: Locale
}) {
  return (
    <table className="w-full text-left type-body max-md:block">
      <caption className="sr-only">{t('signals.sources_caption', {}, locale)}</caption>
      <thead className="max-md:sr-only">
        <tr className="type-small text-muted-foreground">
          <th scope="col" className="px-3 pb-2 font-normal">
            {t('signals.col_source', {}, locale)}
          </th>
          <th scope="col" className="w-[15rem] px-3 pb-2 text-right font-normal">
            {t('signals.col_value', {}, locale)}
          </th>
          <th scope="col" className="w-[9rem] px-3 pb-2 text-right font-normal">
            {t('signals.col_age', {}, locale)}
          </th>
          <th scope="col" className="w-[16rem] px-3 pb-2 font-normal">
            {t('signals.col_health', {}, locale)}
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block">
        {sources.map((source) => {
          const latest = source.latest_reading
          const value = latestParts(source, strip, locale)
          const detail = stateDetail(source, locale)
          const licence = attribution[source.kind]
          const open = selected === source.external_id
          const observed = latest?.observed_at ?? null
          return (
            <tr
              key={source.id}
              data-source={source.id}
              data-state={source.state.state}
              className="align-top max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:py-4"
            >
              <td className="px-3 py-3 max-md:col-span-2 max-md:p-0">
                <Link
                  href={`?source=${encodeURIComponent(source.external_id)}`}
                  scroll={false}
                  replace
                  aria-current={open ? 'true' : undefined}
                  className="relative inline-flex min-h-6 max-w-full items-center gap-2 pb-1 font-medium break-words current-mark hover:underline"
                >
                  <Glyph state={source.state.state} />
                  <span>{source.name}</span>
                </Link>
                <p className="flex flex-wrap gap-x-3 type-small text-muted-foreground">
                  <span translate="no" data-numeric className="break-all text-foreground">
                    {source.external_id}
                  </span>
                  <span>{t(`signals.kind_${source.kind}`, {}, locale)}</span>
                </p>
                <p className="flex flex-wrap items-center gap-x-3 type-small text-muted-foreground">
                  {licence?.licence_url ? (
                    <a href={licence.licence_url} target="_blank" rel="noreferrer" className={link}>
                      {source.licence_label || t('signals.licence_derived', {}, locale)}
                    </a>
                  ) : (
                    <span>{source.licence_label || t('signals.licence_derived', {}, locale)}</span>
                  )}
                  <a href={source.url} target="_blank" rel="noreferrer" className={link}>
                    {t('signals.open_source', {}, locale)}
                  </a>
                </p>
              </td>
              <td className="px-3 py-3 text-right max-md:col-start-1 max-md:p-0 max-md:text-left">
                {value ? (
                  <span data-numeric={value.figure ? true : undefined} className="block">
                    {value.figure && <span className="type-figure">{value.figure}</span>}
                    {value.figure && value.rest ? ' ' : null}
                    <span className={value.figure ? 'text-muted-foreground' : undefined}>{value.rest}</span>
                  </span>
                ) : (
                  <span className="type-small text-muted-foreground">{t('signals.no_value', {}, locale)}</span>
                )}
              </td>
              <td className="px-3 py-3 text-right max-md:col-start-2 max-md:row-start-2 max-md:p-0">
                {source.age_s === null ? null : (
                  <span data-numeric className="block">
                    {formatAge(new Date(now - source.age_s * 1000), locale)}
                  </span>
                )}
                {observed && (
                  <time dateTime={observed} data-numeric className="type-small text-muted-foreground">
                    {formatTime(observed, locale)}
                  </time>
                )}
              </td>
              <td className="px-3 py-3 max-md:col-span-2 max-md:p-0 max-md:pt-2">
                <StatusMark state={source.state.state} locale={locale} />
                {detail && <p className="mt-1 type-small text-muted-foreground">{detail}</p>}
                <SourceProblem source={source} now={now} locale={locale} />
                {source.kind === 'camera' && source.state.state === 'probation' && (
                  <p className="type-small">
                    <a href={`${root}/signals/probation/${encodeURIComponent(source.id)}`} className={link}>
                      {t('signals.label_frames', {}, locale)}
                    </a>
                  </p>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
