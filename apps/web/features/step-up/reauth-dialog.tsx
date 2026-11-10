'use client'

import { startAuthentication } from '@simplewebauthn/browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '#ui/button'
import { prefersMalay } from '../../lib/preferred-language'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#ui/dialog'
import { cancelStepUp, completeStepUp } from './flow'
import { t } from './i18n'

interface StepUpStatus {
  fresh_until: string
  passkey: boolean
}

async function authRequest<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/auth/step-up${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const result = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(`Step-up request failed (${response.status})`)
  return result as T
}

export interface ReauthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReauthDialog({ open, onOpenChange }: ReauthDialogProps) {
  const onOpenChangeRef = useRef(onOpenChange)
  const [status, setStatus] = useState<StepUpStatus>()
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string>()
  const locale = typeof navigator !== 'undefined' && prefersMalay(navigator.languages.join(',')) ? 'ms' : 'en'

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  const finish = useCallback(() => {
    completeStepUp()
    onOpenChangeRef.current(false)
  }, [])

  const refreshStatus = useCallback(async () => {
    const current = await authRequest<StepUpStatus>('')
    setStatus(current)
    return current
  }, [])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError(undefined)
    void authRequest<StepUpStatus>('')
      .then((current) => {
        if (!active) return
        setStatus(current)
        if (Date.parse(current.fresh_until) > Date.now()) finish()
      })
      .catch(() => {
        if (active) setError(t('step-up.error', {}, locale))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [finish, locale, open])

  async function usePasskey() {
    setVerifying(true)
    setError(undefined)
    try {
      const { options } = await authRequest<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
        '/passkey/options',
        'POST',
        {}
      )
      const response = await startAuthentication({ optionsJSON: options })
      await authRequest('/passkey/verify', 'POST', { response })
      finish()
    } catch {
      setError(t('step-up.passkey_error', {}, locale))
    } finally {
      setVerifying(false)
    }
  }

  async function sendMagicLink() {
    setSending(true)
    setError(undefined)
    try {
      await authRequest('/magic-link', 'POST', {})
      setEmailSent(true)
    } catch {
      setError(t('step-up.error', {}, locale))
    } finally {
      setSending(false)
    }
  }

  async function continueAfterEmail() {
    setLoading(true)
    setError(undefined)
    try {
      const current = await refreshStatus()
      if (Date.parse(current.fresh_until) > Date.now()) finish()
      else setError(t('step-up.not_fresh', {}, locale))
    } catch {
      setError(t('step-up.error', {}, locale))
    } finally {
      setLoading(false)
    }
  }

  function changeOpen(next: boolean) {
    if (!next && (sending || verifying)) return
    if (!next) cancelStepUp()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-describedby="step-up-description" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('step-up.title', {}, locale)}</DialogTitle>
          <DialogDescription id="step-up-description">{t('step-up.description', {}, locale)}</DialogDescription>
        </DialogHeader>
        {loading && !status ? <p role="status">{t('step-up.loading', {}, locale)}</p> : null}
        {emailSent ? (
          <div>
            <p role="status">{t('step-up.check_email', {}, locale)}</p>
            {error && <p role="alert">{error}</p>}
            <DialogFooter className="flex-col sm:flex-row">
              <Button variant="outline" disabled={loading} onClick={() => void continueAfterEmail()}>
                {t('step-up.continue', {}, locale)}
              </Button>
              <Button variant="ghost" disabled={sending || verifying} onClick={() => changeOpen(false)}>
                {t('step-up.cancel', {}, locale)}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {error && <p role="alert">{error}</p>}
            <DialogFooter className="flex-col sm:flex-row">
              {status?.passkey && (
                <Button disabled={loading || sending || verifying} onClick={() => void usePasskey()}>
                  {verifying ? t('step-up.verifying', {}, locale) : t('step-up.passkey', {}, locale)}
                </Button>
              )}
              <Button
                variant={status?.passkey ? 'outline' : 'default'}
                disabled={loading || sending || verifying}
                onClick={() => void sendMagicLink()}
              >
                {sending
                  ? t('step-up.sending', {}, locale)
                  : status?.passkey
                    ? t('step-up.email', {}, locale)
                    : t('step-up.send_email', {}, locale)}
              </Button>
              <Button variant="ghost" disabled={sending || verifying} onClick={() => changeOpen(false)}>
                {t('step-up.cancel', {}, locale)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
