'use client'

import { DEFAULT_PREFERENCES, Preferences, type Preferences as PreferenceValues } from '@skyclause/contracts'
import { t } from '@skyclause/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiProblem } from '../../lib/api-fetch'
import { applyAccountPreferences } from './presentation'
import { accountApi } from './operations'
import '../settings/catalogue'

export function useAccountPreferences(initial = DEFAULT_PREFERENCES) {
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

  const save = useCallback(async (update: Partial<PreferenceValues>) => {
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
    } catch (failure) {
      current.current = previous
      setPreferences(previous)
      applyAccountPreferences(previous)
      setError(
        failure instanceof ApiProblem
          ? (failure.body.detail ?? t('account-settings.appearance.saveFailed'))
          : t('account-settings.appearance.saveFailed')
      )
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }, [])

  return { preferences, save, saving, saved, error }
}
