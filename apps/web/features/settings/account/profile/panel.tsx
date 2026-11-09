'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { authClient } from '@skyclause/auth/client'
import { t } from '@skyclause/i18n'
import { authRequest } from '../../../account/auth-api'
import styles from '../../../account/account-settings.module.css'
import '../../catalogue'

interface AccountSession {
  user: { id: string; name: string; email: string }
}

export default function Panel() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    void authRequest<AccountSession | null>('/get-session')
      .then((current) => {
        if (!active) return
        if (!current) throw new Error(t('account-settings.profile.expired'))
        setName(current.user.name)
        setEmail(current.user.email)
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : t('account-settings.profile.loadFailed'))
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const result = await authClient.updateUser({ name: name.trim() })
      if (result.error) throw new Error(result.error.message ?? t('account-settings.profile.saveFailed'))
      setName(name.trim())
      setSaved(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('account-settings.profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.panel} data-account-panel="profile">
      <form className={styles.section} onSubmit={save} aria-label={t('account-settings.profile.title')}>
        <div>
          <h3 className={styles.sectionTitle}>{t('account-settings.profile.title')}</h3>
          <p className={styles.description}>{t('account-settings.profile.description')}</p>
        </div>
        {error && (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className={styles.status} role="status">
            {t('account-settings.profile.saved')}
          </p>
        )}
        <div className="grid gap-2">
          <Label htmlFor="account-name">{t('account-settings.profile.name')}</Label>
          <Input
            id="account-name"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSaved(false)
            }}
            disabled={loading || saving}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="account-email">{t('account-settings.profile.email')}</Label>
          <Input id="account-email" type="email" autoComplete="email" value={email} readOnly disabled={loading} />
          <p className={styles.help}>{t('account-settings.profile.emailReadonly')}</p>
        </div>
        <div>
          <Button type="submit" disabled={loading || saving || !name.trim()} aria-busy={saving}>
            {saving ? t('account-settings.profile.saving') : t('account-settings.profile.save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
