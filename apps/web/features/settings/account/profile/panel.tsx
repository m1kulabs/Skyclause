'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Skeleton } from '#ui/skeleton'
import { authClient } from '@skyclause/auth/client'
import { t } from '@skyclause/i18n'
import { authRequest } from '../../../account/auth-api'
import { useUnsavedChangesGuard } from '../../set-7'
import {
  SettingsAside,
  SettingsField,
  SettingsLoading,
  SettingsParts,
  SettingsReadError,
  SettingsStatus,
  SettingsSummaryLine
} from '../../parts'
import '../../catalogue'

interface AccountSession {
  user: { id: string; name: string; email: string }
}

const NAME_LIMIT = 100

export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' }) {
  const copy = (key: string, vars: Record<string, string | number> = {}) =>
    t(`account-settings.profile.${key}`, vars, locale)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saved, setSavedName] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailure, setLoadFailure] = useState<{ error: unknown; at: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [unchanged, setUnchanged] = useState(false)
  useUnsavedChangesGuard(!loading && !loadFailure && name.trim() !== saved, locale)

  const load = useCallback(async (isCurrent: () => boolean) => {
    setLoading(true)
    setLoadFailure(null)
    try {
      const current = await authRequest<AccountSession | null>('/get-session')
      if (!isCurrent()) return
      if (!current) throw new Error('expired')
      setName(current.user.name)
      setSavedName(current.user.name)
      setEmail(current.user.email)
    } catch (failure) {
      if (isCurrent()) setLoadFailure({ error: failure, at: new Date().toISOString() })
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void load(() => active)
    return () => {
      active = false
    }
  }, [load])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setDone(false)
    setUnchanged(false)
    if (!name.trim()) {
      setError(copy('nameRequired'))
      return
    }
    if (name.trim() === saved) {
      setError(null)
      setUnchanged(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await authClient.updateUser({ name: name.trim() })
      if (result.error) throw new Error('update-user-failed')
      setName(name.trim())
      setSavedName(name.trim())
      setDone(true)
    } catch {
      // The server's own message is in English and says nothing the person can act on.
      setError(copy('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loadFailure)
    return (
      <div data-account-panel="profile">
        <SettingsReadError
          source={copy('source')}
          error={loadFailure.error}
          at={loadFailure.at}
          locale={locale}
          onRetry={() => void load(() => true)}
        />
      </div>
    )

  return (
    <div data-account-panel="profile" aria-busy={loading || saving}>
      {!loading && (
        <SettingsAside>
          <SettingsSummaryLine label={copy('summaryName')}>{saved}</SettingsSummaryLine>
          <SettingsSummaryLine label={copy('summaryEmail')}>{email}</SettingsSummaryLine>
        </SettingsAside>
      )}
      <form onSubmit={save} aria-label={copy('title')} noValidate>
        <SettingsParts className="gap-6">
          <div className="grid gap-5">
            <SettingsField label={copy('name')} hint={copy('nameHint', { limit: NAME_LIMIT })} error={error}>
              {(aria) =>
                loading ? (
                  <SettingsLoading locale={locale}>
                    <Skeleton className="h-10 w-full rounded-md" />
                  </SettingsLoading>
                ) : (
                  <Input
                    {...aria}
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={NAME_LIMIT}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setDone(false)
                      setUnchanged(false)
                      setError(null)
                    }}
                    disabled={saving}
                    required
                  />
                )
              }
            </SettingsField>
            <SettingsField label={copy('email')} hint={copy('emailReadonly')}>
              {(aria) =>
                loading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : (
                  <Input
                    {...aria}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    readOnly
                  />
                )
              }
            </SettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="transition-none" disabled={loading || saving} aria-busy={saving}>
              {saving ? copy('saving') : copy('save')}
            </Button>
            {done ? <SettingsStatus>{copy('saved')}</SettingsStatus> : null}
            {unchanged ? <SettingsStatus>{copy('unchanged')}</SettingsStatus> : null}
          </div>
        </SettingsParts>
      </form>
    </div>
  )
}
