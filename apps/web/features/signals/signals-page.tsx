'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InputState, InputValue, SourceState } from '@skyclause/contracts'
import { formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '#ui/button'
import { InputAgeChip } from '../data-components/input-age-chip'
import { SourceHealthRow } from '../data-components/source-health-row'
import { readSse } from '../../lib/read-sse'
import {
  apiFetch,
  readProjectSources,
  readProjects,
  readSourcePolls,
  readSourceReadings,
  signalsOperations,
  type Project,
  type ProjectSource,
  type ProjectStrip,
  type SourcePoll,
  type SourceReading
} from './operations'
import {
  ageAt,
  errorsWithinLastDay,
  findingLine,
  markEventSeen,
  orderSources,
  tailCommand,
  wilsonInterval
} from './model'
import { SourceDetail } from './source-detail'
import { t } from './catalogue'

type Locale = 'en' | 'ms'
type PageData = { project: Project; sources: ProjectSource[]; strip: ProjectStrip; readAt: number }
type DetailState =
  | { status: 'loading'; sourceId: string }
  | { status: 'error'; sourceId: string }
  | { status: 'ready'; sourceId: string; readings: SourceReading[]; polls: SourcePoll[] }
type PendingSourceEvent = { sourceId: string; state: InputState; since: string; httpStatus: number; announce: boolean }

function inputFor(source: ProjectSource): InputValue {
  const latest = source.latest_reading
  return {
    name: source.name,
    value: latest?.value ?? latest?.value_text ?? null,
    unit: latest?.unit ?? '',
    state: source.state.state,
    since: source.state.since,
    age_s: source.age_s,
    source_ids: [source.id],
    source_url: source.url,
    reading_ids: latest ? [latest.id] : [],
    observed_at: latest?.observed_at ?? null
  }
}

function stateLabel(source: ProjectSource, locale: Locale): string {
  if (source.state.state === 'pending' && source.state.pending_until) {
    return t('signals.pending_until', { time: formatTime(source.state.pending_until, locale) }, locale)
  }
  if (source.kind === 'pi' && (source.state.state === 'stale' || source.state.state === 'error')) {
    return t('signals.pi_offline', { time: formatTime(source.state.since, locale) }, locale)
  }
  if (source.kind === 'camera' && source.state.state === 'probation' && source.probation?.probation) {
    const { n, agreement } = source.probation
    if (agreement === null) return t('signals.probation_unknown', { n }, locale)
    const interval = wilsonInterval(Math.round(n * agreement), n)
    if (!interval) return t('signals.probation_unknown', { n }, locale)
    const percent = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 1 })
    return t(
      'signals.probation',
      {
        n,
        agreement: percent(agreement * 100),
        low: percent(interval.low * 100),
        high: percent(interval.high * 100)
      },
      locale
    )
  }
  return t(`brand.states.${source.state.state}`, {}, locale)
}

function latestLabel(source: ProjectSource, strip: ProjectStrip, locale: Locale): string | undefined {
  const reading = source.latest_reading
  if (source.kind === 'jps_rain') {
    const input = strip.inputs.find(
      (value) => value.source_ids.includes(source.id) && value.name.includes('rain_60m_mm')
    )
    const series = strip.series['site.rain_60m_mm']
    const seriesValue = series?.at(-1)?.[1]
    const value = typeof input?.value === 'number' ? input.value : seriesValue
    if (value !== null && value !== undefined)
      return t('signals.rain_latest', { value: formatNumber(value, locale) }, locale)
  }
  if (!reading) return undefined
  if (source.kind === 'met_warning') return reading.value_text ?? undefined
  const value = reading.value === null ? null : formatNumber(reading.value, locale)
  if (value === null) return reading.value_text ?? undefined
  const unit = reading.unit ?? ''
  const classification =
    typeof reading.value_json === 'object' &&
    reading.value_json !== null &&
    !Array.isArray(reading.value_json) &&
    typeof reading.value_json.class === 'string'
      ? reading.value_json.class
      : null
  return classification
    ? t('signals.latest_value_class', { value, unit, class: classification }, locale)
    : t('signals.latest_value', { value, unit }, locale)
}

function lastSourceError(source: ProjectSource, now: number): ProjectSource['recent_errors'][number] | undefined {
  return errorsWithinLastDay(source.recent_errors, now).at(0)
}

export function SignalsPage({ org, project: projectSlug, locale }: { org: string; project: string; locale: Locale }) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const selectedExternalId = search.get('source')
  const [project, setProject] = useState<Project | null>(null)
  const [data, setData] = useState<PageData | null>(null)
  const [pageError, setPageError] = useState(false)
  const [detailState, setDetailState] = useState<DetailState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [refresh, setRefresh] = useState(0)
  const [resolveAttempt, setResolveAttempt] = useState(0)
  const seenEventIds = useRef(new Set<string>())
  const latestSources = useRef<ProjectSource[]>([])
  const pendingSourceEvents = useRef(new Map<string, PendingSourceEvent>())

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setProject(null)
    setPageError(false)
    void readProjects(org, projectSlug, controller.signal)
      .then((projects) => {
        const found = projects.find((item) => item.slug === projectSlug)
        if (!found) throw new Error('Project unavailable')
        if (!controller.signal.aborted) setProject(found)
      })
      .catch(() => {
        if (!controller.signal.aborted) setPageError(true)
      })
    return () => controller.abort()
  }, [org, projectSlug, resolveAttempt])

  const reloadProjectData = useCallback(
    async (signal: AbortSignal) => {
      if (!project) return
      const [sources, strip] = await Promise.all([
        readProjectSources(org, project.id, signal),
        apiFetch('getProjectStrip', { org, params: { id: project.id }, signal })
      ])
      if (!signal.aborted) setData({ project, sources, strip, readAt: Date.now() })
    },
    [org, project]
  )

  useEffect(() => {
    if (!project) return
    const controller = new AbortController()
    void reloadProjectData(controller.signal).catch(() => {
      if (!controller.signal.aborted) setPageError(true)
    })
    return () => controller.abort()
  }, [project, refresh, reloadProjectData])

  const selectedSource = useMemo(
    () => data?.sources.find((source) => source.external_id === selectedExternalId) ?? null,
    [data?.sources, selectedExternalId]
  )

  useEffect(() => {
    latestSources.current = data?.sources ?? []
    if (!data || pendingSourceEvents.current.size === 0) return
    let changed = false
    const sources = data.sources.map((source) => {
      const pending = pendingSourceEvents.current.get(source.id)
      if (!pending) return source
      pendingSourceEvents.current.delete(source.id)
      changed = true
      if (pending.announce) {
        setAnnouncement(
          t('signals.announcement_error', { source: source.external_id, status: pending.httpStatus }, locale)
        )
      }
      return {
        ...source,
        state: { ...source.state, state: pending.state, since: pending.since, http_status: pending.httpStatus }
      }
    })
    if (changed) setData((previous) => (previous ? { ...previous, sources } : previous))
  }, [data, locale])

  useEffect(() => {
    if (!selectedSource) {
      setDetailState(null)
      return
    }
    const controller = new AbortController()
    setDetailState({ status: 'loading', sourceId: selectedSource.id })
    void Promise.all([
      readSourceReadings(org, selectedSource.id, controller.signal, selectedSource.kind === 'rapidrail_od' ? 64 : 1),
      readSourcePolls(org, selectedSource.id, controller.signal)
    ]).then(
      ([readings, polls]) => {
        if (!controller.signal.aborted)
          setDetailState({ status: 'ready', sourceId: selectedSource.id, readings, polls })
      },
      () => {
        if (!controller.signal.aborted) setDetailState({ status: 'error', sourceId: selectedSource.id })
      }
    )
    return () => controller.abort()
  }, [org, selectedSource])

  useEffect(() => {
    if (!project) return
    const controller = new AbortController()
    seenEventIds.current.clear()
    const path = signalsOperations.streamReadings.path.replace('{id}', encodeURIComponent(project.id))
    const streamUrl = process.env.NEXT_PUBLIC_API_ORIGIN ? new URL(path, process.env.NEXT_PUBLIC_API_ORIGIN) : path
    void readSse(streamUrl, {
      resume: false,
      signal: controller.signal,
      headers: { 'Skyclause-Organization': org },
      onEvent(event) {
        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          return
        }
        const parsed = signalsOperations.streamReadings.response.safeParse(raw)
        if (!parsed.success || !markEventSeen(seenEventIds.current, parsed.data.id)) return
        const item = parsed.data
        if (item.type === 'source.error' || item.type === 'source.stale' || item.type === 'source.recovered') {
          const sourceName = latestSources.current.find((source) => source.id === item.data.source_id)?.external_id
          if (!sourceName) {
            pendingSourceEvents.current.set(item.data.source_id, {
              sourceId: item.data.source_id,
              state: item.data.state,
              since: item.data.since,
              httpStatus: item.data.http_status,
              announce: item.type === 'source.error'
            })
          }
          setData((previous) => {
            if (!previous) return previous
            return {
              ...previous,
              sources: previous.sources.map((source) =>
                source.id === item.data.source_id
                  ? {
                      ...source,
                      state: {
                        ...source.state,
                        state: item.data.state,
                        since: item.data.since,
                        http_status: item.data.http_status
                      } satisfies SourceState
                    }
                  : source
              )
            }
          })
          if (item.type === 'source.error') {
            if (sourceName)
              setAnnouncement(
                t('signals.announcement_error', { source: sourceName, status: item.data.http_status }, locale)
              )
          }
        } else if (item.type === 'poll.recorded') {
          setRefresh((value) => value + 1)
        }
      }
    })
    return () => controller.abort()
  }, [locale, org, project])

  async function copyTailCommand() {
    if (!project) return
    try {
      await navigator.clipboard.writeText(tailCommand(org, project.slug))
      setCopyStatus(t('signals.copied', {}, locale))
    } catch {
      setCopyStatus('')
    }
  }

  function closeDetail() {
    const params = new URLSearchParams(search.toString())
    params.delete('source')
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false })
  }

  const agedSources = useMemo(
    () =>
      (data?.sources ?? []).map((source) => ({
        ...source,
        age_s: ageAt(source.age_s, data?.readAt ?? clockNow, clockNow)
      })),
    [clockNow, data]
  )
  const orderedSources = useMemo(() => orderSources(agedSources), [agedSources])
  const errors = useMemo(() => {
    if (!data) return []
    const byId = new Map(data.sources.map((source) => [source.id, source]))
    const polls = data.sources.flatMap((source) => source.recent_errors)
    const unique = new Map(errorsWithinLastDay(polls, clockNow).map((poll) => [poll.id, poll]))
    return [...unique.values()].map((poll) => ({ poll, source: byId.get(poll.source_id) }))
  }, [clockNow, data])

  return (
    <main data-signals-page className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('signals.title', {}, locale)}</h1>
        {data && <p className="text-sm text-muted-foreground tabular-nums">{findingLine(agedSources, locale)}</p>}
      </header>

      {pageError && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-4">
          <p>{t('signals.load_error', {}, locale)}</p>
          <Button
            variant="outline"
            onClick={() => {
              setPageError(false)
              if (!project) setResolveAttempt((n) => n + 1)
              else setRefresh((n) => n + 1)
            }}
          >
            {t('signals.retry', {}, locale)}
          </Button>
        </div>
      )}
      {!pageError && !data && (
        <p role="status">{project ? t('signals.loading', {}, locale) : t('signals.loading', {}, locale)}</p>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{data.project.name}</p>
            <Button type="button" variant="outline" onClick={() => void copyTailCommand()}>
              {t('signals.copy_tail', {}, locale)}
            </Button>
          </div>

          {data.sources.length ? (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="mb-2 text-left text-muted-foreground">
                  {t('signals.sources_caption', {}, locale)}
                </caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t('signals.source_name', {}, locale)}</th>
                    <th scope="col">{t('signals.health', {}, locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedSources.map((source) => {
                    const error = lastSourceError(source, clockNow)
                    const latest = source.latest_reading
                    return (
                      <SourceHealthRow
                        key={source.id}
                        source={source}
                        latest={
                          latest
                            ? { value: latest.value, observed_at: latest.observed_at, unit: latest.unit ?? undefined }
                            : null
                        }
                        latestLabel={latestLabel(source, data.strip, locale)}
                        state={source.state}
                        stateLabel={stateLabel(source, locale)}
                        ageS={source.age_s}
                        ageChip={
                          <InputAgeChip
                            input={inputFor(source)}
                            receiptAt={latest?.received_at ?? null}
                            locale={locale}
                          />
                        }
                      >
                        {error && (
                          <span className="text-muted-foreground">
                            {t(
                              'signals.last_error',
                              { status: error.http_status ?? 0, time: formatTime(error.started_at, locale) },
                              locale
                            )}
                          </span>
                        )}
                      </SourceHealthRow>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              {t('signals.empty', {}, locale)}
            </p>
          )}

          <section data-signal-errors aria-labelledby="signals-errors-title" className="space-y-2">
            <h2 id="signals-errors-title" className="font-semibold">
              {t('signals.recent_errors', {}, locale)}
            </h2>
            {errors.length ? (
              <ul className="space-y-2 text-sm tabular-nums">
                {errors.map(({ poll, source }) => (
                  <li key={poll.id} className="flex flex-wrap gap-x-1 rounded-md border border-border p-3">
                    <span translate="no">{source?.external_id ?? poll.source_id}</span>
                    {t(
                      'signals.error_status',
                      { status: poll.http_status ?? 0, time: formatDateTime(poll.started_at, locale) },
                      locale
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('signals.no_errors', {}, locale)}</p>
            )}
          </section>

          {selectedSource && (
            <>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={closeDetail}>
                  {t('signals.close_detail', {}, locale)}
                </Button>
              </div>
              {!detailState || detailState.sourceId !== selectedSource.id || detailState.status === 'loading' ? (
                <p role="status">{t('signals.detail_loading', {}, locale)}</p>
              ) : detailState.status === 'error' ? (
                <p role="alert">{t('signals.detail_error', {}, locale)}</p>
              ) : (
                <SourceDetail
                  project={data.project}
                  source={selectedSource}
                  strip={data.strip}
                  readings={detailState.readings}
                  polls={detailState.polls}
                  locale={locale}
                />
              )}
            </>
          )}
        </>
      )}

      <p data-signal-announcement role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {copyStatus}
      </p>
    </main>
  )
}
