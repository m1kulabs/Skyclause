'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Notification, type Notification as Item } from '@skyclause/contracts'
import { formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { browserPath } from '../../lib/api-fetch'
import { readSse } from '../../lib/read-sse'
import { apiFetch, notificationStreamPath } from './operations'
import { notificationHref } from './notification-link'
import { newestNotifications } from './notification-order'
import { t, type Locale } from './i18n'
import styles from './alerts.module.css'

/** What a notification is about, in words: its kind and the project it concerns, never an internal identifier. */
function describe(item: Item, locale: Locale): string {
  const kind = t(
    item.recovered ? 'alerts.recovery' : `alerts.kinds.${item.kind}`,
    { kind: t(`alerts.kinds.${item.kind}`, {}, locale) },
    locale
  )
  return item.project
    ? t('alerts.item', { kind, project: item.project.slug }, locale)
    : t('alerts.itemNoProject', { kind }, locale)
}

export function Inbox({ locale }: { locale: Locale }) {
  const router = useRouter()
  const search = useSearchParams()
  const cursor = search.get('cursor') ?? undefined
  const [data, setData] = useState<Item[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [unread, setUnread] = useState<Set<string> | null>(null)
  const [error, setError] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const focusRow = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const seen = new Set<string>()
    let fullPage = false
    setData(null)
    setUnread(null)
    async function load() {
      // The contracts expose cursor pages but no unread total. Count every page, render at most 50.
      const page = await apiFetch('listNotifications', { query: { limit: 50, cursor }, signal: controller.signal })
      if (controller.signal.aborted) return
      setData(newestNotifications(page.data))
      setNext(page.next_cursor)
      fullPage = page.data.length >= 50
      const unreadIds = new Set<string>()
      let result = cursor
        ? await apiFetch('listNotifications', { query: { limit: 50 }, signal: controller.signal })
        : page
      while (!controller.signal.aborted) {
        for (const item of result.data) {
          seen.add(item.id)
          if (!item.read_at) unreadIds.add(item.id)
        }
        if (!result.next_cursor) break
        result = await apiFetch('listNotifications', {
          query: { limit: 50, cursor: result.next_cursor },
          signal: controller.signal
        })
      }
      if (!controller.signal.aborted) {
        setUnread(unreadIds)
        setError(false)
      }
    }
    async function start() {
      try {
        await load()
      } catch {
        if (!controller.signal.aborted) {
          setError(true)
          setData(null)
          setUnread(null)
        }
        return
      }
      if (controller.signal.aborted) return
      await readSse(browserPath(notificationStreamPath), {
        resume: false,
        signal: controller.signal,
        onError() {
          if (!controller.signal.aborted) setStreamError(true)
        },
        async onEvent(event) {
          if (controller.signal.aborted) return
          setStreamError(false)
          let raw: unknown
          try {
            raw = JSON.parse(event.data)
          } catch {
            setStreamError(true)
            return
          }
          const parsed = Notification.safeParse(raw)
          if (event.event === 'snapshot') {
            // Reconcile missed creations/read changes after reconnect; snapshots do not resume.
            try {
              await load()
            } catch {
              if (!controller.signal.aborted) setStreamError(true)
            }
            return
          }
          if (!parsed.success) {
            setStreamError(true)
            return
          }
          const item = parsed.data
          const isNew = !seen.has(item.id)
          seen.add(item.id)
          setUnread((previous) => {
            const ids = new Set(previous ?? [])
            if (item.read_at) ids.delete(item.id)
            else ids.add(item.id)
            return ids
          })
          if (!cursor)
            setData((previous) =>
              newestNotifications([item, ...(previous ?? []).filter((old) => old.id !== item.id)]).slice(0, 50)
            )
          else setData((previous) => previous?.map((old) => (old.id === item.id ? item : old)) ?? null)
          if (fullPage && isNew) {
            try {
              await load()
            } catch {
              if (!controller.signal.aborted) setStreamError(true)
            }
          }
          if (isNew) setAnnouncement(t('alerts.newItem', { label: describe(item, locale) }, locale))
        }
      })
    }
    void start()
    return () => controller.abort()
  }, [cursor, attempt, locale])

  async function markRead(item: Item) {
    setPending(item.id)
    setReadError(null)
    try {
      const result = await apiFetch('markNotificationRead', { params: { id: item.id } })
      setData((previous) => previous?.map((old) => (old.id === result.id ? result : old)) ?? null)
      setUnread((previous) => {
        const ids = new Set(previous ?? [])
        if (result.read_at) ids.delete(result.id)
        return ids
      })
      // The button that was pressed is gone with the unread state: the row itself takes focus and says what happened.
      focusRow.current = item.id
      setAnnouncement(t('alerts.markedRead', { label: describe(item, locale) }, locale))
    } catch {
      setReadError(item.id)
    } finally {
      setPending(null)
    }
  }

  useEffect(() => {
    if (!focusRow.current) return
    const id = focusRow.current
    focusRow.current = null
    Array.from(document.querySelectorAll<HTMLElement>('[data-notification]'))
      .find((row) => row.dataset.notification === id)
      ?.focus()
  }, [data])

  function navigate(value?: string) {
    const params = new URLSearchParams(search)
    if (value) params.set('cursor', value)
    else params.delete('cursor')
    router.replace(`/account/notifications${params.size ? `?${params}` : ''}`)
  }

  return (
    <section aria-labelledby="alerts-inbox">
      <h3 id="alerts-inbox">{t('alerts.inbox', {}, locale)}</h3>
      <p role="status" aria-live="polite">
        {announcement}
      </p>
      {unread !== null && <p>{t('alerts.unreadCount', { count: formatNumber(unread.size, locale) }, locale)}</p>}
      {(error || streamError) && (
        <>
          <p role="alert">{t(error ? 'alerts.inboxError' : 'alerts.streamError', {}, locale)}</p>
          <Button className={styles.action} variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            {t('alerts.retry', {}, locale)}
          </Button>
        </>
      )}
      {!error && data === null && <p role="status">{t('alerts.loading', {}, locale)}</p>}
      {!error && data?.length === 0 && <p>{t('alerts.emptyInbox', {}, locale)}</p>}
      <ul>
        {data?.map((item) => {
          const href = notificationHref(item)
          const label = describe(item, locale)
          return (
            <li key={item.id} className={styles.row} data-notification={item.id} tabIndex={-1}>
              <div className={styles.details}>
                {href ? <a href={href}>{label}</a> : <p>{label}</p>}
                <time dateTime={item.created_at}>{formatDateTime(item.created_at, locale)}</time>
                <p className={styles.status}>{t(item.read_at ? 'alerts.read' : 'alerts.unread', {}, locale)}</p>
                {readError === item.id && <p role="alert">{t('alerts.readError', {}, locale)}</p>}
              </div>
              {!item.read_at && (
                <Button
                  variant="outline"
                  className={styles.action}
                  disabled={pending !== null}
                  aria-label={t('alerts.markReadNamed', { label }, locale)}
                  onClick={() => void markRead(item)}
                >
                  {t(pending === item.id ? 'alerts.saving' : 'alerts.markRead', {}, locale)}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <div className={styles.controls}>
        {cursor && (
          <Button variant="outline" className={styles.action} onClick={() => navigate()}>
            {t('alerts.previous', {}, locale)}
          </Button>
        )}
        {next && (
          <Button variant="outline" className={styles.action} onClick={() => navigate(next)}>
            {t('alerts.next', {}, locale)}
          </Button>
        )}
      </div>
    </section>
  )
}
