'use client'

import { useEffect, useState } from 'react'
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPreference } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { Switch } from '#ui/switch'
import { apiFetch } from './operations'
import { t, type Locale } from './i18n'
import styles from './alerts.module.css'

export function Preferences({ locale }: { locale: Locale }) {
  const [data, setData] = useState<NotificationPreference[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [states, setStates] = useState<Partial<Record<NotificationKind, 'saving' | 'saved' | 'saveError'>>>({})
  useEffect(() => {
    const controller = new AbortController()
    apiFetch('getMyNotificationPreferences', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result.data)
          setError(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [attempt])

  async function save(kind: NotificationKind, enabled: boolean) {
    setStates((previous) => ({ ...previous, [kind]: 'saving' }))
    try {
      const result = await apiFetch('updateMyNotificationPreferences', { body: { preferences: [{ kind, enabled }] } })
      const saved = result.data.find((preference) => preference.kind === kind)
      if (!saved) throw new Error('Missing saved notification preference')
      setData((previous) => [...(previous ?? []).filter((preference) => preference.kind !== kind), saved])
      setStates((previous) => ({ ...previous, [kind]: 'saved' }))
    } catch {
      setStates((previous) => ({ ...previous, [kind]: 'saveError' }))
    }
  }

  return (
    <section aria-labelledby="alerts-preferences">
      <h3 id="alerts-preferences">{t('alerts.preferences', {}, locale)}</h3>
      <p>{t('alerts.shiftNotice', {}, locale)}</p>
      {error ? (
        <>
          <p role="alert">{t('alerts.preferencesError', {}, locale)}</p>
          <Button variant="outline" className={styles.action} onClick={() => setAttempt((n) => n + 1)}>
            {t('alerts.retry', {}, locale)}
          </Button>
        </>
      ) : data === null ? (
        <p role="status">{t('alerts.loading', {}, locale)}</p>
      ) : (
        <>
          {data.length === 0 && (
            <>
              <p>{t('alerts.emptyPreferences', {}, locale)}</p>
              <Button className={styles.action} variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                {t('alerts.retry', {}, locale)}
              </Button>
            </>
          )}
          <ul>
            {NOTIFICATION_KINDS.map((kind) => {
              const preference = data.find((item) => item.kind === kind)
              const state = states[kind]
              return (
                <li className={styles.row} key={kind}>
                  <div className={styles.details}>
                    <label id={`alerts-label-${kind}`} htmlFor={`alerts-${kind}`}>
                      {t(`alerts.kinds.${kind}`, {}, locale)}
                    </label>
                    <p className={styles.status}>
                      {t(
                        preference ? (preference.enabled ? 'alerts.on' : 'alerts.off') : 'alerts.unavailable',
                        {},
                        locale
                      )}
                    </p>
                    <p id={`alerts-save-${kind}`} role="status">
                      {state && state !== 'saveError' ? t(`alerts.${state}`, {}, locale) : null}
                    </p>
                    {state === 'saveError' && (
                      <p id={`alerts-error-${kind}`} role="alert">
                        {t('alerts.saveError', {}, locale)}
                      </p>
                    )}
                  </div>
                  <Switch
                    id={`alerts-${kind}`}
                    name={kind}
                    aria-labelledby={`alerts-label-${kind}`}
                    aria-describedby={`alerts-save-${kind}${state === 'saveError' ? ` alerts-error-${kind}` : ''}`}
                    checked={preference?.enabled ?? false}
                    disabled={!preference || state === 'saving'}
                    onCheckedChange={(enabled) => void save(kind, enabled)}
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
