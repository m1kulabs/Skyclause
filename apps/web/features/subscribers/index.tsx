'use client'

import '../subscribe/catalogue'
import { useEffect, useRef, useState } from 'react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { t } from './catalogue'
import { apiFetch } from '../subscribe/operations'
import { actionClass } from '../subscribe/fields'
import { OperationError } from '../subscribe/error'
import { resolveProject } from './project'
import { ImportAddresses } from './import-addresses'
import { RemoveSubscriber } from './remove-subscriber'

type Counts = Awaited<ReturnType<typeof readCounts>>
type Rows = Awaited<ReturnType<typeof readRows>>
const readCounts = (id: string, signal?: AbortSignal) => apiFetch('getSubscriberCounts', { params: { id }, signal })
const readRows = (id: string, cursor?: string, signal?: AbortSignal) =>
  apiFetch('listSubscribers', { params: { id }, query: { cursor }, signal })

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
  const [rows, setRows] = useState<Rows>()
  const [counts, setCounts] = useState<Counts>()
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
    resolveProject(org, project, controller.signal)
      .then(async (resolved) => {
        if (!resolved) {
          setNotFound(true)
          return
        }
        setProjectId(resolved.id)
        // Counts are the only subscriber operation an Approver ever calls.
        const countData = await readCounts(resolved.id, controller.signal)
        setCounts(countData)
        if (manage) setRows(await readRows(resolved.id, undefined, controller.signal))
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
  async function more() {
    if (!projectId || !rows?.next_cursor || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const next = await readRows(projectId, rows.next_cursor)
      setRows({ data: [...rows.data, ...next.data], next_cursor: next.next_cursor })
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  const refresh = () => setAttempt((n) => n + 1)
  return (
    <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]">
      <h1 className="text-2xl font-semibold">{t('subscribers.title', {}, locale)}</h1>
      <OperationError error={error} locale={locale} />
      {notFound && <p role="alert">{t('subscribers.no_project', {}, locale)}</p>}
      {(error || notFound) && (
        <Button className={actionClass} onClick={refresh}>
          {t('subscribe.retry', {}, locale)}
        </Button>
      )}
      {loading && <p role="status">{t('subscribe.loading', {}, locale)}</p>}
      {counts && (
        <section className="grid min-w-0 gap-3" aria-labelledby="subscriber-counts-title">
          <h2 id="subscriber-counts-title" className="text-lg font-medium">
            {t('subscribers.counts', {}, locale)}
          </h2>
          <p>
            {t(
              'subscribers.summary',
              { confirmed: counts.confirmed, unconfirmed: counts.unconfirmed, suppressed: counts.suppressed },
              locale
            )}
          </p>
          <p>{t('subscribers.total', { count: counts.total }, locale)}</p>
          {!counts.total && (
            <p>{manage ? t('subscribers.empty', {}, locale) : t('subscribers.no_counts', {}, locale)}</p>
          )}
          <dl className="grid gap-2">
            {(['bounced', 'complained', 'unsubscribed'] as const).map((status) => (
              <div key={status} className="flex flex-wrap gap-x-3">
                <dt>{t(`subscribers.status_${status}`, {}, locale)}</dt>
                <dd>
                  {t(
                    'subscribers.count_item',
                    { name: t(`subscribers.status_${status}`, {}, locale), count: counts[status] },
                    locale
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <h3 className="font-medium">{t('subscribers.by_window', {}, locale)}</h3>
          {counts.by_window.map((item) => (
            <p key={item.window_id}>
              {t('subscribers.count_item', { name: item.window_id, count: item.count }, locale)}
            </p>
          ))}
          <h3 className="font-medium">{t('subscribers.by_channel', {}, locale)}</h3>
          {counts.by_channel.map((item) => (
            <p key={item.channel}>
              {t(
                'subscribers.count_item',
                { name: t(`subscribe.${item.channel}_channel`, {}, locale), count: item.count },
                locale
              )}
            </p>
          ))}
        </section>
      )}
      {manage && projectId && (
        <>
          <div className="grid min-w-0 gap-3">
            <Button className={actionClass} disabled={busy} onClick={() => void copyLink()}>
              {t('subscribers.copy', {}, locale)}
            </Button>
            {link && (
              <>
                <label className="grid min-w-0 gap-2" htmlFor="subscribe-link">
                  {t('subscribers.link', {}, locale)}
                  <Input id="subscribe-link" value={link} readOnly onFocus={(event) => event.target.select()} />
                </label>
                <p role="status">{t(copied ? 'subscribers.copied' : 'subscribers.link_ready', {}, locale)}</p>
              </>
            )}
          </div>
          {rows && (
            <>
              <div
                className="max-w-full overflow-x-auto"
                role="region"
                aria-label={t('subscribers.title', {}, locale)}
                /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable requires the scroll container to be keyboard-focusable. */
                tabIndex={0}
              >
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">{t('subscribers.title', {}, locale)}</caption>
                  <thead>
                    <tr>
                      {[
                        'subscribe.email',
                        'subscribe.role',
                        'subscribe.windows',
                        'subscribe.channels',
                        'subscribe.language',
                        'subscribers.status',
                        'subscribers.suppression',
                        'subscribers.last_notice',
                        'subscribers.consent',
                        'subscribers.remove_title'
                      ].map((key) => (
                        <th scope="col" key={key} className="border-b border-border p-3 align-top">
                          {t(key, { name: '' }, locale)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.data.map((row) => (
                      <tr key={row.id}>
                        <td className="min-w-48 border-b border-border p-3 align-top">{row.email}</td>
                        <td className="border-b border-border p-3 align-top">{row.role}</td>
                        <td className="border-b border-border p-3 align-top">
                          {row.window_ids.length ? row.window_ids.join(', ') : t('subscribers.no_windows', {}, locale)}
                        </td>
                        <td className="border-b border-border p-3 align-top">
                          {row.channels.length
                            ? row.channels.map((channel) => t(`subscribe.${channel}_channel`, {}, locale)).join(', ')
                            : t('subscribers.no_channels', {}, locale)}
                        </td>
                        <td className="border-b border-border p-3 align-top">
                          {t(row.language === 'ms' ? 'subscribe.malay' : 'subscribe.english', {}, locale)}
                        </td>
                        <td className="border-b border-border p-3 align-top">
                          {t(`subscribers.status_${row.status}`, {}, locale)}
                        </td>
                        <td className="border-b border-border p-3 align-top">
                          {t(row.suppressed ? 'subscribers.suppressed_yes' : 'subscribers.suppressed_no', {}, locale)}
                        </td>
                        <td className="min-w-40 border-b border-border p-3 align-top">
                          {row.last_notice_at ? (
                            <time dateTime={row.last_notice_at}>{formatDateTime(row.last_notice_at, locale)}</time>
                          ) : (
                            t('subscribers.no_notice', {}, locale)
                          )}
                        </td>
                        <td className="min-w-52 border-b border-border p-3 align-top">
                          {row.consent ? (
                            <>
                              <time dateTime={row.consent.at}>{formatDateTime(row.consent.at, locale)}</time>
                              <p>
                                {t(
                                  'subscribers.consent_detail',
                                  {
                                    form: row.consent.form,
                                    version: row.consent.notice_version,
                                    language: t(
                                      row.consent.language === 'ms' ? 'subscribe.malay' : 'subscribe.english',
                                      {},
                                      locale
                                    )
                                  },
                                  locale
                                )}
                              </p>
                            </>
                          ) : (
                            t('subscribers.no_consent', {}, locale)
                          )}
                        </td>
                        <td className="min-w-48 border-b border-border p-3 align-top">
                          <RemoveSubscriber id={row.id} email={row.email} locale={locale} onRemoved={refresh} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.next_cursor && (
                <Button className={actionClass} disabled={busy} onClick={() => void more()}>
                  {t('subscribers.more', {}, locale)}
                </Button>
              )}
            </>
          )}
          <ImportAddresses projectId={projectId} locale={locale} onImported={refresh} />
        </>
      )}
    </div>
  )
}
