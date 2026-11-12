'use client'

import { attribution } from '@skyclause/elements'
import { formatTime } from '@skyclause/i18n/format'
import { formatNumber } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { Table, TableBody } from '#ui/table'
import { SignalHealthHead, SignalHealthRow } from '../data-components'
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
        <time dateTime={state.since} data-numeric data-http-status={state.http_status ?? undefined}>
          {state.http_status === null
            ? t('signals.failing_since_no_status', { time: formatTime(state.since, locale) }, locale)
            : t('signals.failing_since', { time: formatTime(state.since, locale) }, locale)}
        </time>
      </p>
    )
  }
  const error = lastSourceError(source, now)
  if (!error) return null
  return (
    <p className="type-small text-muted-foreground">
      <time dateTime={error.started_at} data-numeric data-http-status={error.http_status ?? undefined}>
        {error.http_status === null
          ? t('signals.last_error_no_status', { time: formatTime(error.started_at, locale) }, locale)
          : t('signals.last_error', { time: formatTime(error.started_at, locale) }, locale)}
      </time>
    </p>
  )
}

/** A table never draws more than this many rows (NFR-9). */
export const SOURCE_ROWS = 50

/**
 * Each bound source as the shared signal-health row: what it is and reads, its newest value as a figure with its unit,
 * its age in words, its health as a status mark, and a failing source with its error and since when. The name opens
 * its readings. At most fifty rows, the worst first, and the table says when it is showing fewer than the sources.
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
    <>
      <Table aria-label={t('signals.sources_caption', {}, locale)}>
        <SignalHealthHead locale={locale} />
        <TableBody>
          {sources.slice(0, SOURCE_ROWS).map((source) => {
            const licence = attribution[source.kind]
            const licenceLabel = source.licence_label || t('signals.licence_derived', {}, locale)
            return (
              <SignalHealthRow
                key={source.id}
                source={source}
                kindLabel={t(`signals.kind_${source.kind}`, {}, locale)}
                state={source.state.state}
                value={latestParts(source, strip, locale)}
                observedAt={source.latest_reading?.observed_at ?? null}
                ageS={source.age_s}
                href={`?source=${encodeURIComponent(source.external_id)}`}
                selected={selected === source.external_id}
                meta={
                  <>
                    {licence?.licence_url ? (
                      <a href={licence.licence_url} target="_blank" rel="noreferrer" className={link}>
                        {licenceLabel}
                      </a>
                    ) : (
                      <span>{licenceLabel}</span>
                    )}
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('signals.open_source_named', { source: source.name }, locale)}
                      className={link}
                    >
                      {t('signals.open_source', {}, locale)}
                    </a>
                  </>
                }
                detail={stateDetail(source, locale)}
                problem={
                  <>
                    <SourceProblem source={source} now={now} locale={locale} />
                    {source.kind === 'camera' && source.state.state === 'probation' && (
                      <p className="type-small">
                        <a href={`${root}/signals/probation/${encodeURIComponent(source.id)}`} className={link}>
                          {t('signals.label_frames', {}, locale)}
                        </a>
                      </p>
                    )}
                  </>
                }
                locale={locale}
              />
            )
          })}
        </TableBody>
      </Table>
      {sources.length > SOURCE_ROWS ? (
        <p className="mt-3 px-3 type-small text-muted-foreground" data-numeric>
          {t(
            'signals.sources_capped',
            { shown: formatNumber(SOURCE_ROWS, locale), total: formatNumber(sources.length, locale) },
            locale
          )}
        </p>
      ) : null}
    </>
  )
}
