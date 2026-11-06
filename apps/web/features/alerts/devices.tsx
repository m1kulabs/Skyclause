'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PushSubscription } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { apiFetch } from './operations'
import { t, type Locale } from './i18n'
import styles from './alerts.module.css'

export function Devices({
  accountId,
  locale,
  version,
  onRemoved
}: {
  accountId: string
  locale: Locale
  version: number
  onRemoved: () => void
}) {
  const router = useRouter()
  const search = useSearchParams()
  const pageCursor = search.get('devices_cursor') ?? undefined
  const [data, setData] = useState<PushSubscription[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setCursor(null)
    setError(false)
    apiFetch('listPushSubscriptions', { query: { limit: 50, cursor: pageCursor }, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result.data.filter((item) => item.account_id === accountId))
          setCursor(result.next_cursor)
          setError(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(null)
          setError(true)
        }
      })
    return () => controller.abort()
  }, [accountId, version, attempt, pageCursor])

  function navigate(nextCursor?: string) {
    const params = new URLSearchParams(search)
    if (nextCursor) params.set('devices_cursor', nextCursor)
    else params.delete('devices_cursor')
    router.replace(`/account/notifications${params.size ? `?${params}` : ''}`)
  }

  async function remove(device: PushSubscription) {
    setPending(device.id)
    setFailed(null)
    try {
      await apiFetch('deletePushSubscription', { params: { id: device.id } })
      setData((previous) => previous?.filter((item) => item.id !== device.id) ?? null)
      // The server is authoritative. The browser may keep a subscription used by a different account.
      onRemoved()
    } catch {
      setFailed(device.id)
    } finally {
      setPending(null)
    }
  }

  return (
    <section aria-labelledby="alerts-devices">
      <h3 id="alerts-devices">{t('alerts.devices', {}, locale)}</h3>
      {error && (
        <>
          <p role="alert">{t('alerts.devicesError', {}, locale)}</p>
          <Button variant="outline" className={styles.action} onClick={() => setAttempt((n) => n + 1)}>
            {t('alerts.retry', {}, locale)}
          </Button>
        </>
      )}
      {!error && data === null && <p role="status">{t('alerts.loading', {}, locale)}</p>}
      {data?.length === 0 && <p>{t(pageCursor ? 'alerts.emptyDevicePage' : 'alerts.emptyDevices', {}, locale)}</p>}
      <ul>
        {data?.map((device) => {
          const label = device.user_agent || t('alerts.unknownDevice', {}, locale)
          return (
            <li key={device.id} className={styles.row}>
              <div className={styles.details}>
                <p>{label}</p>
                <p>{t('alerts.addedUnknown', {}, locale)}</p>
                {failed === device.id && <p role="alert">{t('alerts.removeError', {}, locale)}</p>}
              </div>
              <Button
                variant="outline"
                className={styles.action}
                aria-label={t(
                  pending === device.id ? 'alerts.saving' : 'alerts.remove',
                  { label, action: t('alerts.removeDevice', {}, locale) },
                  locale
                )}
                disabled={pending !== null}
                onClick={() => void remove(device)}
              >
                {t(pending === device.id ? 'alerts.saving' : 'alerts.removeDevice', {}, locale)}
              </Button>
            </li>
          )
        })}
      </ul>
      {pageCursor && (
        <Button variant="outline" className={styles.action} onClick={() => navigate()}>
          {t('alerts.previousDevices', {}, locale)}
        </Button>
      )}
      {cursor && (
        <Button className={styles.action} variant="outline" disabled={data === null} onClick={() => navigate(cursor)}>
          {t('alerts.loadDevices', {}, locale)}
        </Button>
      )}
    </section>
  )
}
