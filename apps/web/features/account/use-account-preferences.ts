'use client'

import { DEFAULT_PREFERENCES, Preferences, type Preferences as PreferenceValues } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { rememberLanguage } from '../../lib/preferred-language'
import { applyAccountPreferences } from './presentation'
import { accountApi } from './operations'
import '../settings/catalogue'

export function useAccountPreferences(initial = DEFAULT_PREFERENCES, locale: 'en' | 'ms' = 'en') {
  const [preferences, setPreferences] = useState<PreferenceValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // What the person sees: what the server last stored, with every change made since laid over it.
  const current = useRef(initial)
  const confirmed = useRef(initial)
  // Changes made since the last request went out. They wait for the request on its way, then go out as one.
  const queued = useRef<Partial<PreferenceValues>>({})
  const inFlight = useRef(false)
  const running = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    void accountApi('getMyPreferences', {})
      .then((saved) => {
        if (!active || inFlight.current) return
        current.current = saved
        confirmed.current = saved
        setPreferences(saved)
        applyAccountPreferences(saved)
      })
      .catch(() => {
        // The root document already carries the server preference. Keep the control usable on a transient read error.
      })
    return () => {
      active = false
    }
  }, [])

  const show = useCallback((next: PreferenceValues) => {
    current.current = next
    setPreferences(next)
    applyAccountPreferences(next)
  }, [])

  const send = useCallback(async () => {
    let failed = false
    let languageStored = false
    try {
      while (Object.keys(queued.current).length > 0) {
        const body = queued.current
        queued.current = {}
        try {
          const stored = await accountApi('updateMyPreferences', { body })
          confirmed.current = stored
          // A change made while this one was on its way is already on screen: its own answer settles it.
          show(Preferences.parse({ ...stored, ...queued.current }))
          if ('language' in body) {
            // The server renders every page's words: a language choice is remembered for every request.
            rememberLanguage(stored.language)
            languageStored = true
          }
        } catch {
          failed = true
          // Only this change goes back; the ones made after it stay and are still sent.
          show(Preferences.parse({ ...confirmed.current, ...queued.current }))
          // The server's own detail is English and says nothing the person can act on: the panel's sentence is shown.
          setError(t('account-settings.appearance.saveFailed', {}, locale))
        }
      }
      setSaved(!failed)
      // This page loads again in the saved language unless it is already in it, once nothing is left to send.
      if (languageStored && document.documentElement.lang !== confirmed.current.language) window.location.reload()
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }, [locale, show])

  const save = useCallback(
    (update: Partial<PreferenceValues>) => {
      show(Preferences.parse({ ...current.current, ...update }))
      queued.current = { ...queued.current, ...update }
      setError(null)
      setSaved(false)
      if (!inFlight.current) {
        inFlight.current = true
        setSaving(true)
        running.current = send()
      }
      return running.current
    },
    [send, show]
  )

  return { preferences, save, saving, saved, error }
}
