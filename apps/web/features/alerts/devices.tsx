'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PushSubscription } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { ConfirmDialog } from '../settings/set-7'
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
  const [target, setTarget] = useState<PushSubscription | null>(null)
  const [removed, setRemoved] = useState('')
  const focusHeading = useRef(false)
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

  // A failure propagates to the confirmation, which stays open and says so; only a removal that landed closes it.
  async function remove(device: PushSubscription) {
    await apiFetch('deletePushSubscription', { params: { id: device.id } })
    setData((previous) => previous?.filter((item) => item.id !== device.id) ?? null)
    setRemoved(t('alerts.removed', { label: deviceLabel(device) }, locale))
    focusHeading.current = true
    // The server is authoritative. The browser may keep a subscription used by a different account.
    onRemoved()
  }

  function deviceLabel(device: PushSubscription) {
    return device.user_agent || t('alerts.unknownDevice', {}, locale)
  }

  // The row and the button that opened the confirmation are gone: the section heading takes focus once it has closed.
  useEffect(() => {
    if (target !== null || !focusHeading.current) return
    focusHeading.current = false
    const frame = requestAnimationFrame(() => document.getElementById('alerts-devices')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [target])

  return (
    <section aria-labelledby="alerts-devices">
      <h3 id="alerts-devices" tabIndex={-1}>
        {t('alerts.devices', {}, locale)}
      </h3>
      <p role="status">{removed}</p>
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
          const label = deviceLabel(device)
          return (
            <li key={device.id} className={styles.row}>
              <div className={styles.details}>
                <p>{label}</p>
              </div>
              <Button
                variant="outline"
                className={styles.action}
                aria-label={t('alerts.remove', { label, action: t('alerts.removeDevice', {}, locale) }, locale)}
                onClick={() => setTarget(device)}
              >
                {t('alerts.removeDevice', {}, locale)}
              </Button>
            </li>
          )
        })}
      </ul>
      {target && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setTarget(null)}
          objectName={deviceLabel(target)}
          title={t('alerts.removeTitle', { label: `“${deviceLabel(target)}”` }, locale)}
          description={t('alerts.removeDescription', {}, locale)}
          confirmLabel={t('alerts.removeTitle', { label: `“${deviceLabel(target)}”` }, locale)}
          locale={locale}
          onConfirm={() => remove(target)}
        />
      )}
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
