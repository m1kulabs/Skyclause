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
  const current = useRef(initial)
  const inFlight = useRef(false)

  useEffect(() => {
    let active = true
    void accountApi('getMyPreferences', {})
      .then((saved) => {
        if (!active || inFlight.current) return
        current.current = saved
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

  const save = useCallback(
    async (update: Partial<PreferenceValues>) => {
      if (inFlight.current) return
      inFlight.current = true
      const previous = current.current
      const next = Preferences.parse({ ...previous, ...update })
      current.current = next
      setPreferences(next)
      applyAccountPreferences(next)
      setSaving(true)
      setError(null)
      setSaved(false)
      try {
        const stored = await accountApi('updateMyPreferences', { body: update })
        current.current = stored
        setPreferences(stored)
        applyAccountPreferences(stored)
        setSaved(true)
        // The server renders every page's words: a language choice is remembered for every request, and this page
        // loads again in it unless it is already in that language.
        if ('language' in update) {
          rememberLanguage(stored.language)
          if (document.documentElement.lang !== stored.language) window.location.reload()
        }
      } catch {
        current.current = previous
        setPreferences(previous)
        applyAccountPreferences(previous)
        // The server's own detail is English and says nothing the person can act on: the panel's sentence is shown.
        setError(t('account-settings.appearance.saveFailed', {}, locale))
      } finally {
        inFlight.current = false
        setSaving(false)
      }
    },
    [locale]
  )

  return { preferences, save, saving, saved, error }
}
