'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CircleAlertIcon } from 'lucide-react'
import { authClient } from '@skyclause/auth/client'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { AuthHeader, AuthMessage } from '../public-chrome/auth'
import { accountPath, continuePath, type AuthState } from './model'
import { t, type Locale } from './i18n'

type Mode = 'sign-in' | 'sign-up'

function urlStateAlert(state: AuthState): string | null {
  if (state.kind === 'link-pending') return 'link_pending'
  if (state.kind === 'google-failed') return 'google_failed'
  return null
}

export function SignInPanel({
  mode,
  next,
  state,
  locale = 'en'
}: {
  mode: Mode
  next: string | null
  state: AuthState
  locale?: Locale
}) {
  const text = (key: string, vars: Record<string, string> = {}) => t(key, vars, locale)
  const emailRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const expiredRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
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

  // The control that was pressed is gone once a link is sent or confirmed; focus moves to the result that replaced it.
  useEffect(() => {
    if (sentEmail || resendSent || stepUpConfirmed) resultRef.current?.focus()
  }, [sentEmail, resendSent, stepUpConfirmed])

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
          body: JSON.stringify({ link: state.link, ...(!state.stepUp && state.resend ? { resend: state.resend } : {}) })
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
        setStatus(text('sign-in.confirm_done'))
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
      setStatus(text('sign-in.sent_resend'))
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
    <main className="auth-page" lang={locale} data-auth-page>
      <section className="auth-page" aria-labelledby="sign-in-title">
        <AuthHeader
          title={text(mode === 'sign-in' ? 'sign-in.title' : 'sign-in.sign_up_title')}
          titleId="sign-in-title"
          locale={locale}
        />

        {visibleAlert && (
          <AuthMessage tabIndex={-1} ref={alertRef}>
            {text(`sign-in.${visibleAlert}`)}
          </AuthMessage>
        )}

        {expiredCopy && (
          <AuthMessage tabIndex={-1} ref={expiredRef}>
            {text(`sign-in.${expiredCopy}`)}
          </AuthMessage>
        )}

        {state.kind === 'confirm' && (
          <div className="auth-stack">
            {stepUpConfirmed ? (
              <AuthMessage tone="result" tabIndex={-1} ref={resultRef}>
                {status}
              </AuthMessage>
            ) : (
              <Button size="lg" className="w-full" onClick={() => void confirmLink()} disabled={busy}>
                {busy ? text('sign-in.confirming') : text(state.stepUp ? 'sign-in.confirm_step_up' : 'sign-in.confirm')}
              </Button>
            )}
          </div>
        )}

        {resendOnly && (
          <div className="auth-stack">
            {resendSent ? (
              <>
                <AuthMessage tone="result" tabIndex={-1} ref={resultRef}>
                  {status}
                </AuthMessage>
                <Button variant="outline" size="lg" className="w-full" onClick={useDifferentEmail}>
                  {text('sign-in.use_different_email')}
                </Button>
              </>
            ) : (
              <Button size="lg" className="w-full" onClick={() => void resendLink()} disabled={busy}>
                {busy ? text('sign-in.sending') : text('sign-in.resend')}
              </Button>
            )}
          </div>
        )}

        {showOptions && (
          <div className="auth-stack">
            {mode === 'sign-in' && !sentEmail && (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => void startPasskeySignIn()}
                disabled={busy}
              >
                {text('sign-in.passkey')}
              </Button>
            )}

            {sentEmail ? (
              <div className="auth-stack">
                <AuthMessage tone="result" tabIndex={-1} ref={resultRef}>
                  {text('sign-in.sent', { email: sentEmail })}
                </AuthMessage>
                <Button variant="outline" size="lg" className="w-full" onClick={useDifferentEmail}>
                  {text('sign-in.use_different_email')}
                </Button>
              </div>
            ) : showEmailForm ? (
              <form className="auth-form" onSubmit={(event) => void sendEmailLink(event)}>
                <div className="auth-field">
                  <Label htmlFor="sign-in-email" className="text-base">
                    {text('sign-in.email_label')}
                  </Label>
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
                    className="h-12 text-base md:text-base"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (fieldError) setFieldError(null)
                    }}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? 'sign-in-email-error' : undefined}
                  />
                  {fieldError && (
                    <p className="auth-error" id="sign-in-email-error" role="alert">
                      <CircleAlertIcon aria-hidden="true" />
                      {text(`sign-in.${fieldError}`)}
                    </p>
                  )}
                </div>
                {busy && (
                  <p className="sr-only" role="status" aria-live="polite">
                    {text('sign-in.sending')}
                  </p>
                )}
                <Button size="lg" className="w-full" type="submit" disabled={busy}>
                  {busy ? text('sign-in.sending') : text('sign-in.email_submit')}
                </Button>
              </form>
            ) : null}

            {!sentEmail && (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => void startGoogleSignIn()}
                disabled={busy}
              >
                {text('sign-in.google')}
              </Button>
            )}
          </div>
        )}

        {mode === 'sign-up' && (
          <p className="m-0">
            <Link className="auth-link" href={accountPath('/sign-in', next)}>
              {text('sign-in.sign_in_instead')}
            </Link>
          </p>
        )}
      </section>

      <footer className="auth-footer">
        <Link className="auth-link" href="/legal/privacy">
          {text('sign-in.privacy')}
        </Link>
      </footer>
    </main>
  )
}
