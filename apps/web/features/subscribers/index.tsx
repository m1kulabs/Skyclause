'use client'

import '../subscribe/catalogue'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { Glyph } from '../brand/glyph'
import { SourceError } from '../data-components/states'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { apiFetch } from '../subscribe/operations'
import { OperationError } from '../subscribe/error'
import { windowsApi } from '../windows/operations'
import { resolveProject } from './project'
import { ImportAddresses } from './import-addresses'
import { Figures, Reach } from './counts'
import { useSubscriberRemoval } from './remove-subscriber'
import { SubscriberTable } from './table'
import { readWindowNames, type WindowName } from './window-names'
import './subscribers.css'

export type Counts = Awaited<ReturnType<typeof readCounts>>
export type Rows = Awaited<ReturnType<typeof readRows>>
const readCounts = (id: string, signal?: AbortSignal) => apiFetch('getSubscriberCounts', { params: { id }, signal })
const readRows = (id: string, cursor?: string, signal?: AbortSignal) =>
  apiFetch('listSubscribers', { params: { id }, query: { cursor }, signal })

type Failed = { error: unknown; at: string }
const failed = (error: unknown): Failed => ({ error, at: new Date().toISOString() })
const statusOf = (error: unknown) => (error instanceof ApiProblem ? error.status : null)

export function Subscribers({
  org,
  project,
  manage,
  locale
}: {
  org: string
  project: string
  manage: boolean
  locale: 'en' | 'ms'
}) {
  const [projectId, setProjectId] = useState<string>()
  // Pages replace each other: the 50 rows on screen are one server page, never an accumulation.
  const [pages, setPages] = useState<Rows[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [counts, setCounts] = useState<Counts>()
  const [countsFailed, setCountsFailed] = useState<Failed>()
  const [rowsFailed, setRowsFailed] = useState<Failed>()
  const [error, setError] = useState<unknown>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [windows, setWindows] = useState<ReadonlyMap<string, WindowName>>()
  const [windowsFailed, setWindowsFailed] = useState<Failed>()
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  // A read after a removal or a retry keeps the rows on screen until the answer replaces them.
  const shown = useRef('')
  useEffect(() => {
    const controller = new AbortController()
    const key = `${org}/${project}/${manage}`
    setLoading(true)
    setError(null)
    setNotFound(false)
    setCountsFailed(undefined)
    setRowsFailed(undefined)
    setWindowsFailed(undefined)
    if (shown.current !== key) {
      shown.current = key
      setPages([])
      setCounts(undefined)
      setWindows(undefined)
    }
    setPageIndex(0)
    resolveProject(org, project, controller.signal)
      .then(async (resolved) => {
        if (!resolved) {
          setNotFound(true)
          return
        }
        setProjectId(resolved.id)
        // Counts are the only subscriber operation an Approver ever calls; the list is read beside them.
        await Promise.all([
          readCounts(resolved.id, controller.signal).then(
            (value) => {
              setCounts(value)
              return nameWindows(resolved.id, value, controller.signal)
            },
            (reason: unknown) => {
              if (!controller.signal.aborted) setCountsFailed(failed(reason))
            }
          ),
          manage
            ? readRows(resolved.id, undefined, controller.signal).then(
                (value) => setPages([value]),
                (reason: unknown) => {
                  if (!controller.signal.aborted) setRowsFailed(failed(reason))
                }
              )
            : undefined
        ])
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [org, project, manage, attempt])

  /** The windows the counts are grouped by, named by the project's windows read; a failed read is shown, not hidden. */
  async function nameWindows(projectId: string, value: Counts, signal: AbortSignal) {
    const wanted = new Set(value.by_window.map((item) => item.window_id))
    if (!wanted.size) {
      setWindows(new Map())
      return
    }
    try {
      const names = await readWindowNames(
        (cursor) =>
          windowsApi('listWindows', { org, params: { id: projectId }, query: { limit: 200, cursor }, signal }),
        wanted
      )
      if (!signal.aborted) setWindows(names)
    } catch (reason) {
      if (!signal.aborted) setWindowsFailed(failed(reason))
    }
  }

  async function copyLink() {
    if (!projectId || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setCopied(false)
    setError(null)
    try {
      const result = await apiFetch('createSubscribeLink', { params: { id: projectId } })
      setLink(result.url)
      try {
        await navigator.clipboard.writeText(result.url)
        setCopied(true)
      } catch {
        /* The selectable URL is the clipboard fallback. */
      }
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  async function next() {
    const current = pages[pageIndex]
    if (!projectId || !current || inFlight.current) return
    if (pages[pageIndex + 1]) {
      setPageIndex(pageIndex + 1)
      return
    }
    if (!current.next_cursor) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const page = await readRows(projectId, current.next_cursor)
      setPages([...pages, page])
      setPageIndex(pageIndex + 1)
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  const refresh = () => setAttempt((n) => n + 1)
  const removal = useSubscriberRemoval({
    locale,
    onRemoved: () => {
      refresh()
      document.getElementById('subscriber-list-title')?.focus()
    }
  })
  const page = pages[pageIndex]
  const from = pages.slice(0, pageIndex).reduce((sum, item) => sum + Math.min(item.data.length, 50), 0) + 1
  const retry = (
    <Button variant="outline" onClick={refresh}>
      {t('subscribe.retry', {}, locale)}
    </Button>
  )
  return (
    <div className="grid min-w-0 max-w-full gap-section [overflow-wrap:anywhere]">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="type-title">{t('subscribers.title', {}, locale)}</h1>
        {manage && projectId && (
          <Button disabled={busy} onClick={() => void copyLink()}>
            {t('subscribers.copy', {}, locale)}
          </Button>
        )}
      </header>
      <OperationError error={error} locale={locale} />
      {notFound && (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="type-text flex items-center gap-2 font-medium">
            <Glyph state="error" />
            {t('subscribers.no_project', {}, locale)}
          </p>
          {retry}
        </div>
      )}
      {loading && (
        <p role="status" className="sr-only">
          {t('subscribe.loading', {}, locale)}
        </p>
      )}
      {manage && link && (
        <div className="grid min-w-0 gap-2 rounded-xl bg-card p-5">
          <label className="type-body grid min-w-0 gap-2 font-medium" htmlFor="subscribe-link">
            {t('subscribers.link', {}, locale)}
            <Input
              id="subscribe-link"
              name="subscribe_link"
              autoComplete="off"
              spellCheck={false}
              value={link}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </label>
          <p role="status" className="type-small text-muted-foreground">
            {t(copied ? 'subscribers.copied' : 'subscribers.link_ready', {}, locale)}
          </p>
        </div>
      )}
      {countsFailed ? (
        <SourceError
          source={t('subscribers.source_counts', {}, locale)}
          status={statusOf(countsFailed.error)}
          at={countsFailed.at}
          locale={locale}
          retry={retry}
        />
      ) : (
        !notFound && (
          <section className="grid min-w-0 gap-6" aria-labelledby="subscriber-counts-title">
            <h2 id="subscriber-counts-title" className="sr-only">
              {t('subscribers.counts', {}, locale)}
            </h2>
            <Figures counts={counts} locale={locale} />
            {counts && !counts.total && (
              <p className="type-text">
                {manage ? t('subscribers.empty', {}, locale) : t('subscribers.no_counts', {}, locale)}
              </p>
            )}
            {counts && (
              <Reach
                counts={counts}
                windows={windows}
                windowsError={
                  windowsFailed ? (
                    <SourceError
                      source={t('subscribers.source_windows', {}, locale)}
                      status={statusOf(windowsFailed.error)}
                      at={windowsFailed.at}
                      locale={locale}
                      retry={retry}
                    />
                  ) : undefined
                }
                locale={locale}
              />
            )}
          </section>
        )
      )}
      {manage && projectId && loading && !page && !rowsFailed && (
        <div className="grid gap-2" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-11 w-full rounded-full" />
          ))}
        </div>
      )}
      {manage && rowsFailed && (
        <SourceError
          source={t('subscribers.source_list', {}, locale)}
          status={statusOf(rowsFailed.error)}
          at={rowsFailed.at}
          locale={locale}
          retry={retry}
        />
      )}
      {manage && page && page.data.length > 0 && (
        <>
          {removal.node}
          <SubscriberTable
            rows={page.data}
            from={from}
            total={counts?.total}
            hasPrevious={pageIndex > 0}
            hasNext={!!pages[pageIndex + 1] || !!page.next_cursor}
            busy={busy}
            removing={removal.busy}
            onPrevious={() => setPageIndex(Math.max(0, pageIndex - 1))}
            onNext={() => void next()}
            onRemove={(row) => removal.request({ id: row.id, email: row.email })}
            locale={locale}
          />
        </>
      )}
      {manage && projectId && <ImportAddresses projectId={projectId} locale={locale} onImported={refresh} />}
    </div>
  )
}
