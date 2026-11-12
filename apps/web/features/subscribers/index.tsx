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
import { resolveProject } from './project'
import { ImportAddresses } from './import-addresses'
import { Figures, Reach } from './counts'
import { SubscriberTable } from './table'
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
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setNotFound(false)
    setCountsFailed(undefined)
    setRowsFailed(undefined)
    setPages([])
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
            (value) => setCounts(value),
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
            {counts && <Reach counts={counts} locale={locale} />}
          </section>
        )
      )}
      {manage && projectId && loading && !page && !rowsFailed && (
        <div className="grid gap-2" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-16 w-full rounded-xl" />
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
        <SubscriberTable
          rows={page.data}
          from={from}
          total={counts?.total}
          hasPrevious={pageIndex > 0}
          hasNext={!!pages[pageIndex + 1] || !!page.next_cursor}
          busy={busy}
          onPrevious={() => setPageIndex(Math.max(0, pageIndex - 1))}
          onNext={() => void next()}
          onRemoved={refresh}
          locale={locale}
        />
      )}
      {manage && projectId && <ImportAddresses projectId={projectId} locale={locale} onImported={refresh} />}
    </div>
  )
}
