'use client'

import { useEffect, useState } from 'react'
import { Button } from '#ui/button'
import { apiFetch } from './operations'
import { t, type Locale } from './i18n'
import styles from './alerts.module.css'

type State = 'loading' | 'on' | 'off' | 'blocked' | 'iosHelp' | 'unsupported' | 'stateError'

export function DeviceAlerts({
  locale,
  endpointVersion = 0,
  embedded = false
}: {
  locale: Locale
  endpointVersion?: number
  embedded?: boolean
}) {
  const Heading = embedded ? 'h3' : 'h2'
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function check() {
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && navigator.standalone === true)
      if (ios && !standalone) {
        setState('iosHelp')
        return
      }
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setState('blocked')
        return
      }
      if (Notification.permission !== 'granted') {
        setState('off')
        return
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const subscription = await registration?.pushManager.getSubscription()
        if (!subscription) {
          if (!controller.signal.aborted) setState('off')
          return
        }
        // A browser subscription alone does not mean this account has registered this device.
        let cursor: string | undefined
        let registered = false
        do {
          const result = await apiFetch('listPushSubscriptions', { query: { cursor }, signal: controller.signal })
          registered = result.data.some((device) => device.endpoint === subscription.endpoint)
          cursor = result.next_cursor ?? undefined
        } while (!registered && cursor)
        if (!controller.signal.aborted) setState(registered ? 'on' : 'off')
      } catch {
        if (!controller.signal.aborted) setState('stateError')
      }
    }
    void check()
    return () => controller.abort()
  }, [endpointVersion, attempt])

  async function enable() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      // Call synchronously from the press: Safari requires the permission request's user gesture.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      const { public_key } = await apiFetch('getVapidPublicKey', {})
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const registration = await navigator.serviceWorker.ready
      const key = Uint8Array.from(atob(public_key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }))
      const json = subscription.toJSON()
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error('Missing push subscription keys')
      await apiFetch('createPushSubscription', {
        body: {
          endpoint: subscription.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent
        }
      })
      setState('on')
      window.dispatchEvent(new Event('skyclause:push-registered'))
    } catch {
      setFailed(true)
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.device} data-alerts-card aria-label={t('alerts.device', {}, locale)}>
      <Heading>{t('alerts.cardTitle', {}, locale)}</Heading>
      <p>{t('alerts.cardBody', {}, locale)}</p>
      <p role="status">{t(`alerts.${state}`, {}, locale)}</p>
      {state === 'blocked' && <p>{t('alerts.blockedHelp', {}, locale)}</p>}
      {failed && <p role="alert">{t('alerts.pushError', {}, locale)}</p>}
      {(state === 'off' || state === 'stateError') && (
        <Button className={styles.action} disabled={busy} onClick={() => void enable()}>
          {t(busy ? 'alerts.saving' : 'alerts.enable', {}, locale)}
        </Button>
      )}
      {(state === 'blocked' || state === 'stateError') && (
        <Button variant="outline" className={styles.action} onClick={() => setAttempt((a) => a + 1)}>
          {t('alerts.retry', {}, locale)}
        </Button>
      )}
    </section>
  )
}
