'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { authClient } from '@skyclause/auth/client'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { accountPath, continuePath, type AuthState } from './model'
import { t } from './i18n'
import './sign-in.css'

type Mode = 'sign-in' | 'sign-up'

function urlStateAlert(state: AuthState): string | null {
  if (state.kind === 'link-pending') return 'link_pending'
  if (state.kind === 'google-failed') return 'google_failed'
  return null
}

export function SignInPanel({ mode, next, state }: { mode: Mode; next: string | null; state: AuthState }) {
  const emailRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const expiredRef = useRef<HTMLParagraphElement>(null)
  const conditionalStarted = useRef(false)
  const [email, setEmail] = useState('')
  const [sentEmail, setSentEmail] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [actionAlert, setActionAlert] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [forceEmailForm, setForceEmailForm] = useState(false)
  const [stepUpConfirmed, setStepUpConfirmed] = useState(false)

  const continueHref = continuePath(next)
  const expiredStepUp = state.kind === 'expired' && state.stepUp
  const resendOnly = state.kind === 'expired' && Boolean(state.resend) && !forceEmailForm
  const showOptions = state.kind !== 'confirm' && !expiredStepUp && !resendOnly
  const showEmailForm = showOptions && !sentEmail && !(resendSent && !forceEmailForm)
  const visibleAlert = actionAlert ?? urlStateAlert(state)
  const expiredCopy = state.kind === 'expired' ? (state.stepUp ? 'link_expired_step_up' : 'link_expired') : null

  useEffect(() => {
    if (fieldError || (state.kind === 'expired' && !state.resend && !state.stepUp)) {
      emailRef.current?.focus()
      return
    }
    if (visibleAlert) {
      alertRef.current?.focus()
      return
    }
    if (expiredCopy) expiredRef.current?.focus()
  }, [expiredCopy, fieldError, state, visibleAlert])

  useEffect(() => {
    if (forceEmailForm) emailRef.current?.focus()
  }, [forceEmailForm])

  const completePasskeySignIn = useCallback(
    async (autoFill = false) => {
      try {
        const result = await authClient.signIn.passkey(autoFill ? { autoFill: true } : undefined)
        if (result.error || !result.data) {
          if (!autoFill) setActionAlert('passkey_failed')
          return
        }
        window.location.assign(continueHref)
      } catch {
        if (!autoFill) setActionAlert('passkey_failed')
      }
    },
    [continueHref]
  )

  const startPasskeySignIn = async () => {
    if (busy) return
    setBusy(true)
    setFieldError(null)
    setActionAlert(null)
    try {
      await completePasskeySignIn()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (
      mode !== 'sign-in' ||
      !showOptions ||
      !window.PublicKeyCredential ||
      typeof window.PublicKeyCredential.isConditionalMediationAvailable !== 'function'
    ) {
      return
    }
    let active = true
    void window.PublicKeyCredential.isConditionalMediationAvailable()
      .then((available) => {
        if (active && available && !conditionalStarted.current) {
          conditionalStarted.current = true
          void completePasskeySignIn(true)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [completePasskeySignIn, mode, showOptions])

  const sendEmailLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!address) {
      setFieldError('send_failed')
      emailRef.current?.focus()
      return
    }

    setBusy(true)
    setFieldError(null)
    setActionAlert(null)
    setStatus('')
    try {
      const result = await authClient.signIn.magicLink({
        email: address,
        callbackURL: continueHref
      })
      if (result.error) {
        setFieldError(result.error.status === 429 ? 'send_rate_limited' : 'send_failed')
        return
      }
      setEmail(address)
      setSentEmail(address)
    } catch {
      setFieldError('send_failed')
    } finally {
      setBusy(false)
    }
  }

  const startGoogleSignIn = async () => {
    if (busy) return
    setBusy(true)
    setFieldError(null)
    setActionAlert(null)
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: continueHref })
      if (result.error) setActionAlert('google_start_failed')
    } catch {
      setActionAlert('google_start_failed')
    } finally {
      setBusy(false)
    }
  }

  const confirmLink = async () => {
    if (state.kind !== 'confirm' || busy || stepUpConfirmed) return
    setBusy(true)
    setActionAlert(null)
    setStatus('')
    try {
      const response = await fetch(
        state.stepUp ? '/api/auth/step-up/magic-link/confirm' : '/api/auth/magic-link/confirm',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ link: state.link })
        }
      )
      if (response.redirected) {
        const destination = new URL(response.url, window.location.origin)
        if (destination.origin !== window.location.origin) throw new Error('Unexpected auth redirect')
        if (destination.pathname === '/sign-in' && destination.searchParams.get('state') === 'link-expired') {
          window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`)
          return
        }
        if (!state.stepUp) {
          window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`)
          return
        }
      }
      if (!response.ok) throw new Error('Link confirmation failed')
      if (state.stepUp) {
        setStepUpConfirmed(true)
        setStatus(t('sign-in.confirm_done'))
      } else {
        window.location.assign(continueHref)
      }
    } catch {
      setActionAlert('confirm_failed')
    } finally {
      setBusy(false)
    }
  }

  const resendLink = async () => {
    if (state.kind !== 'expired' || !state.resend || busy || resendSent) return
    setBusy(true)
    setActionAlert(null)
    setStatus('')
    try {
      const response = await fetch('/api/auth/magic-link/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resend: state.resend })
      })
      if (!response.ok) throw new Error('Resend failed')
      setResendSent(true)
      setStatus(t('sign-in.sent_resend'))
    } catch {
      setActionAlert('resend_failed')
    } finally {
      setBusy(false)
    }
  }

  const useDifferentEmail = () => {
    setEmail('')
    setSentEmail(null)
    setResendSent(false)
    setFieldError(null)
    setActionAlert(null)
    setStatus('')
    setForceEmailForm(true)
  }

  return (
    <main className="sign-in-page" data-auth-page>
      <section className="sign-in-primary" aria-labelledby="sign-in-title">
        <header className="sign-in-header">
          <Link className="sign-in-brand" href="/" aria-label={t('sign-in.brand')}>
            <Image src="/icon.svg" alt="" width={32} height={32} priority />
            <span translate="no">{t('sign-in.brand')}</span>
          </Link>
          <h1 id="sign-in-title">{t(mode === 'sign-in' ? 'sign-in.title' : 'sign-in.sign_up_title')}</h1>
        </header>

        {visibleAlert && (
          <p className="sign-in-alert" role="alert" tabIndex={-1} ref={alertRef}>
            {t(`sign-in.${visibleAlert}`)}
          </p>
        )}

        {expiredCopy && (
          <p className="sign-in-alert" role="alert" tabIndex={-1} ref={expiredRef}>
            {t(`sign-in.${expiredCopy}`)}
          </p>
        )}

        {state.kind === 'confirm' && (
          <div className="sign-in-actions">
            {stepUpConfirmed ? (
              <p className="sign-in-status" role="status" aria-live="polite">
                {status}
              </p>
            ) : (
              <Button className="sign-in-action" onClick={() => void confirmLink()} disabled={busy}>
                {busy ? t('sign-in.confirming') : t(state.stepUp ? 'sign-in.confirm_step_up' : 'sign-in.confirm')}
              </Button>
            )}
          </div>
        )}

        {resendOnly && (
          <div className="sign-in-actions">
            {resendSent ? (
              <>
                <p className="sign-in-status" role="status" aria-live="polite">
                  {status}
                </p>
                <Button variant="outline" className="sign-in-action" onClick={useDifferentEmail}>
                  {t('sign-in.use_different_email')}
                </Button>
              </>
            ) : (
              <Button className="sign-in-action" onClick={() => void resendLink()} disabled={busy}>
                {busy ? t('sign-in.sending') : t('sign-in.resend')}
              </Button>
            )}
          </div>
        )}

        {showOptions && (
          <div className="sign-in-actions">
            {mode === 'sign-in' && !sentEmail && (
              <Button
                variant="outline"
                className="sign-in-action"
                onClick={() => void startPasskeySignIn()}
                disabled={busy}
              >
                {t('sign-in.passkey')}
              </Button>
            )}

            {sentEmail ? (
              <div className="sign-in-sent">
                <p className="sign-in-status" role="status" aria-live="polite">
                  {t('sign-in.sent', { email: sentEmail })}
                </p>
                <Button variant="outline" className="sign-in-action" onClick={useDifferentEmail}>
                  {t('sign-in.use_different_email')}
                </Button>
              </div>
            ) : showEmailForm ? (
              <form className="sign-in-email-form" onSubmit={(event) => void sendEmailLink(event)}>
                <div className="sign-in-field">
                  <Label htmlFor="sign-in-email">{t('sign-in.email_label')}</Label>
                  <Input
                    ref={emailRef}
                    id="sign-in-email"
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="username webauthn"
                    spellCheck={false}
                    autoCapitalize="none"
                    required
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (fieldError) setFieldError(null)
                    }}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? 'sign-in-email-error' : undefined}
                  />
                  {fieldError && (
                    <p className="sign-in-field-error" id="sign-in-email-error" role="alert">
                      {t(`sign-in.${fieldError}`)}
                    </p>
                  )}
                </div>
                {busy && (
                  <p className="sign-in-visually-hidden" role="status" aria-live="polite">
                    {t('sign-in.sending')}
                  </p>
                )}
                <Button className="sign-in-action" type="submit" disabled={busy}>
                  {busy ? t('sign-in.sending') : t('sign-in.email_submit')}
                </Button>
              </form>
            ) : null}

            {!sentEmail && (
              <Button
                variant="outline"
                className="sign-in-action"
                onClick={() => void startGoogleSignIn()}
                disabled={busy}
              >
                {t('sign-in.google')}
              </Button>
            )}
          </div>
        )}

        {mode === 'sign-up' && (
          <p className="sign-in-switch">
            <Link href={accountPath('/sign-in', next)}>{t('sign-in.sign_in_instead')}</Link>
          </p>
        )}
      </section>

      <section className="sign-in-guest" aria-labelledby="sign-in-guest-title">
        <h2 id="sign-in-guest-title">
          <Link href="/guest">{t('sign-in.guest_title')}</Link>
        </h2>
        <p>{t('sign-in.guest_copy')}</p>
      </section>

      <footer className="sign-in-footer">
        <Link href="/legal/privacy">{t('sign-in.privacy')}</Link>
      </footer>
    </main>
  )
}
