'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InputState, SourceState } from '@skyclause/contracts'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonVariants } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { SourceError } from '../data-components'
import { ApiProblem, browserPath } from '../../lib/api-fetch'
import { readSse } from '../../lib/read-sse'
import {
  apiFetch,
  readProjectSources,
  readProjects,
  readSourcePolls,
  readSourceReadings,
  signalsOperations,
  type Project,
  type EvaluatedSource,
  type ProjectSource,
  type ProjectStrip,
  type SourcePoll,
  type SourceReading
} from './operations'
import { ageAt, errorsWithinLastDay, findingLine, markEventSeen, orderSources, tailCommand } from './model'
import { SourceDetail } from './source-detail'
import { SourceTable } from './source-table'
import { t } from './catalogue'

type Locale = 'en' | 'ms'
/** A table never draws more than this many rows (NFR-9). */
const ERROR_ROWS = 50
type PageData = { project: Project; sources: ProjectSource[]; strip: ProjectStrip; readAt: number }
type DetailState =
  | { status: 'loading'; sourceId: string }
  | { status: 'error'; sourceId: string }
  | { status: 'ready'; sourceId: string; readings: SourceReading[]; polls: SourcePoll[] }
/** A failed read: the HTTP status it answered (null when it did not answer) and when. */
const failure = (error: unknown) => ({
  status: error instanceof ApiProblem ? error.status : null,
  at: new Date().toISOString()
})
// A timeout has no HTTP status; say so instead of printing "HTTP null".
const errorAnnouncement = (source: string, status: number | null, locale: Parameters<typeof t>[2]) =>
  status === null
    ? t('signals.announcement_error_no_status', { source }, locale)
    : t('signals.announcement_error', { source, status }, locale)

type PendingSourceEvent = {
  sourceId: string
  state: InputState
  since: string
  httpStatus: number | null
  announce: boolean
}

export function SignalsPage({
  org,
  project: projectSlug,
  locale,
  canBind = false
}: {
  org: string
  project: string
  locale: Locale
  /** Owners and admins can bind sources in the project's settings; others are not offered the link. */
  canBind?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const selectedExternalId = search.get('source')
  const [project, setProject] = useState<Project | null>(null)
  const [data, setData] = useState<PageData | null>(null)
  const [pageError, setPageError] = useState<{ status: number | null; at: string } | null>(null)
  const [detailState, setDetailState] = useState<DetailState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null)
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
    setPageError(null)
    void readProjects(org, projectSlug, controller.signal)
      .then((projects) => {
        const found = projects.find((item) => item.slug === projectSlug)
        if (!found) throw new Error('Project unavailable')
        if (!controller.signal.aborted) setProject(found)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPageError(failure(error))
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
    void reloadProjectData(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) setPageError(failure(error))
    })
    return () => controller.abort()
  }, [project, refresh, reloadProjectData])

  const selectedSource = useMemo(
    () =>
      data?.sources.find(
        (source): source is EvaluatedSource => source.external_id === selectedExternalId && source.state !== null
      ) ?? null,
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
        setAnnouncement(errorAnnouncement(source.external_id, pending.httpStatus, locale))
      }
      return {
        ...source,
        state: {
          pending_until: source.state?.pending_until ?? null,
          state: pending.state,
          since: pending.since,
          http_status: pending.httpStatus
        }
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
    // A data refresh (every poll.recorded) re-reads the open source; keep its history on screen meanwhile.
    setDetailState((current) =>
      current?.status === 'ready' && current.sourceId === selectedSource.id
        ? current
        : { status: 'loading', sourceId: selectedSource.id }
    )
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
    void readSse(browserPath(path), {
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
                        pending_until: source.state?.pending_until ?? null,
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
            if (sourceName) setAnnouncement(errorAnnouncement(sourceName, item.data.http_status, locale))
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
    // Clear the last result first, so copying twice announces twice.
    setCopyStatus(null)
    try {
      await navigator.clipboard.writeText(tailCommand(org, project.slug))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }
  // The visible "Copied" goes after a few seconds, so the button offers copying again.
  useEffect(() => {
    if (copyStatus !== 'copied') return
    const timer = window.setTimeout(() => setCopyStatus(null), 4000)
    return () => window.clearTimeout(timer)
  }, [copyStatus])

  // Opening a source brings its detail into view and puts focus on its heading; closing it returns focus to the row
  // that opened it, which would otherwise be lost with the detail that held it.
  const openedFor = useRef<string | null>(null)
  const detailReady = !!selectedSource && detailState?.status === 'ready' && detailState.sourceId === selectedSource.id
  useEffect(() => {
    if (!detailReady || openedFor.current === selectedExternalId) return
    openedFor.current = selectedExternalId
    document.querySelector<HTMLElement>('[data-source-detail] h2')?.focus()
  }, [detailReady, selectedExternalId])
  function closeDetail() {
    const row = selectedSource?.id
    const params = new URLSearchParams(search.toString())
    params.delete('source')
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false })
    openedFor.current = null
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-source="${row}"] a`)?.focus())
  }

  const agedSources = useMemo(
    () =>
      (data?.sources ?? [])
        .filter((source): source is EvaluatedSource => source.state !== null)
        .map((source) => ({
          ...source,
          age_s: ageAt(source.age_s, data?.readAt ?? clockNow, clockNow)
        })),
    [clockNow, data]
  )
  const orderedSources = useMemo(() => orderSources(agedSources), [agedSources])
  const unevaluated = useMemo(() => (data?.sources ?? []).filter((source) => source.state === null), [data])
  const errors = useMemo(() => {
    if (!data) return []
    const byId = new Map(data.sources.map((source) => [source.id, source]))
    const polls = data.sources.flatMap((source) => source.recent_errors)
    const unique = new Map(errorsWithinLastDay(polls, clockNow).map((poll) => [poll.id, poll]))
    return [...unique.values()].map((poll) => ({ poll, source: byId.get(poll.source_id) }))
  }, [clockNow, data])

  const root = `/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}`
  const retry = (
    <Button
      variant="outline"
      onClick={() => {
        setPageError(null)
        if (!project) setResolveAttempt((n) => n + 1)
        else setRefresh((n) => n + 1)
      }}
    >
      {t('signals.retry', {}, locale)}
    </Button>
  )

  return (
    <section data-signals-page className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-title">{t('signals.title', {}, locale)}</h1>
        {data && (
          <Button type="button" variant="outline" onClick={() => void copyTailCommand()}>
            {t(copyStatus === 'copied' ? 'signals.copied' : 'signals.copy_tail', {}, locale)}
          </Button>
        )}
      </div>

      {data && (
        <div>
          <p data-numeric className="type-section">
            {findingLine(agedSources, locale)}
          </p>
          <p className="type-small text-muted-foreground">{data.project.name}</p>
        </div>
      )}

      {pageError && (
        <SourceError
          source={t('signals.source_sources', {}, locale)}
          status={pageError.status}
          at={pageError.at}
          // A 501 is "not built": reading again cannot change the answer.
          retry={pageError.status === 501 ? undefined : retry}
          locale={locale}
        />
      )}
      {!pageError && !data && (
        <div aria-hidden="true" data-signals-skeleton className="flex flex-col gap-3 rounded-xl bg-card p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-6 w-1/3 rounded-full" />
              <Skeleton className="ml-auto h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
          ))}
        </div>
      )}
      {!pageError && !data && (
        <p role="status" className="sr-only">
          {t('signals.loading', {}, locale)}
        </p>
      )}

      {data && (
        <>
          {data.sources.length ? (
            <div className="min-w-0 rounded-xl bg-card px-2 py-4 md:p-5">
              <SourceTable
                sources={orderedSources}
                strip={data.strip}
                now={clockNow}
                root={root}
                selected={selectedExternalId}
                locale={locale}
              />
              {unevaluated.length > 0 && (
                <p className="mt-3 px-3 type-small text-muted-foreground">
                  {t(
                    'signals.not_evaluated',
                    {
                      sources: new Intl.ListFormat(locale === 'ms' ? 'ms-MY' : 'en-MY', {
                        style: 'long',
                        type: 'conjunction'
                      }).format(unevaluated.map((source) => source.name))
                    },
                    locale
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-5">
              <p className="type-text">{t('signals.empty', {}, locale)}</p>
              {canBind && (
                <a href={`${root}/settings/packs`} className={buttonVariants({ variant: 'default' })}>
                  {t('signals.bind_sources', {}, locale)}
                </a>
              )}
            </div>
          )}

          {selectedSource && (
            <>
              {!detailState || detailState.sourceId !== selectedSource.id || detailState.status === 'loading' ? (
                <div aria-busy="true" className="flex flex-col gap-3 rounded-xl bg-card p-5">
                  <p role="status" className="sr-only">
                    {t('signals.detail_loading', {}, locale)}
                  </p>
                  <Skeleton className="h-7 w-1/3 rounded-full" />
                  <Skeleton className="h-64 w-full rounded-xl bg-raised" />
                </div>
              ) : detailState.status === 'error' ? (
                <SourceError
                  source={t('signals.source_readings', { source: selectedSource.external_id }, locale)}
                  at={new Date(clockNow).toISOString()}
                  locale={locale}
                  retry={
                    <Button type="button" variant="outline" onClick={closeDetail}>
                      {t('signals.close_detail', {}, locale)}
                    </Button>
                  }
                />
              ) : (
                <SourceDetail
                  project={data.project}
                  source={selectedSource}
                  strip={data.strip}
                  readings={detailState.readings}
                  polls={detailState.polls}
                  locale={locale}
                  onClose={closeDetail}
                />
              )}
            </>
          )}

          {data.sources.length > 0 && (
            <section data-signal-errors aria-labelledby="signals-errors-title" className="flex flex-col gap-2">
              <h2 id="signals-errors-title" className="type-section">
                {t('signals.recent_errors', {}, locale)}
              </h2>
              {errors.length ? (
                <>
                  <Table compact>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('signals.col_source', {}, locale)}</TableHead>
                        <TableHead numeric>{t('signals.errors_status', {}, locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.slice(0, ERROR_ROWS).map(({ poll, source }) => (
                        <TableRow key={poll.id}>
                          <TableCell
                            phone="primary"
                            translate={source ? 'no' : undefined}
                            className="font-medium whitespace-normal [overflow-wrap:anywhere]"
                          >
                            {source?.external_id ?? t('signals.source_unknown', {}, locale)}
                          </TableCell>
                          <TableCell data-numeric phone="end" className="whitespace-normal">
                            {poll.http_status === null
                              ? t('signals.error_no_status', { time: formatDateTime(poll.started_at, locale) }, locale)
                              : t(
                                  'signals.error_status',
                                  { status: poll.http_status, time: formatDateTime(poll.started_at, locale) },
                                  locale
                                )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {errors.length > ERROR_ROWS ? (
                    <p className="type-small text-muted-foreground" data-numeric>
                      {t(
                        'signals.sources_capped',
                        { shown: formatNumber(ERROR_ROWS, locale), total: formatNumber(errors.length, locale) },
                        locale
                      )}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="type-body text-muted-foreground">{t('signals.no_errors', {}, locale)}</p>
              )}
            </section>
          )}
        </>
      )}

      <p data-signal-announcement role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p role="status" aria-live="polite" className={copyStatus === 'failed' ? 'type-small' : 'sr-only'}>
        {copyStatus === 'copied' ? t('signals.copied', {}, locale) : null}
        {copyStatus === 'failed' ? t('signals.copy_failed', {}, locale) : null}
      </p>
    </section>
  )
}
