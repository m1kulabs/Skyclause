'use client'

/* eslint-disable @next/next/no-img-element -- Self-hosted, pre-sized pictures (CSP img-src 'self'), as the landing's room. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Loader2Icon } from 'lucide-react'
import type { SignInMethods } from '@skyclause/auth'
import { authClient } from '@skyclause/auth/client'
import { formatClock } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { photo, srcSetOf } from '../landing/photos'
import { AuthMessage } from '../public-chrome/auth'
import '../public-chrome/catalogue'
import type { SignInLinks } from './links'
import { accountPath, continuePath, isEmailAddress, LINK_LIFETIME_MS, type AuthState } from './model'
import { SignInStrip, withParts } from './strip'
import { t, type Locale } from './i18n'
import './sign-in.css'

type Mode = 'sign-in' | 'sign-up'
type FieldProblem = 'email_empty' | 'email_invalid'
type SendProblem = { key: 'send_failed' | 'send_unreachable' } | { key: 'send_limited'; retryAt: number | null }
/** A link out: to whom (unknown when the no-script form sent it), until when, and whether it was a second send. */
interface SentLink {
  email: string | null
  until: number
  again?: boolean
  resent?: boolean
}

/** The room's photograph: the landing's first, the LRT station under the afternoon sky it reads. */
const ROOM = photo('lrtDay')
/** Hidden while script is off: what only a script can do (a passkey). */
const NO_SCRIPT_STYLE = '<style>[data-sign-in-script]{display:none!important}</style>'
/** WebAuthn's own refusals: the person closed the prompt, or the browser had no passkey to offer. Silent. */
const PASSKEY_CANCELLED = new Set(['ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', 'ERROR_CEREMONY_ABORTED'])

function urlAlert(state: AuthState): string | null {
  if (state.kind === 'link-pending') return 'link_pending'
  if (state.kind === 'google-failed') return 'google_failed'
  if (state.kind === 'send-failed') return 'send_failed'
  return null
}

function otherWays(passkey: boolean, google: boolean): string {
  if (passkey && google) return 'passkey_google'
  if (passkey) return 'passkey'
  if (google) return 'google'
  return 'none'
}

export function SignInPanel({
  mode,
  next,
  state,
  links,
  methods = { email: true, google: true },
  now = new Date().toISOString(),
  locale = 'en'
}: {
  mode: Mode
  next: string | null
  state: AuthState
  /** The marketing host's pages, absolute under HOST_MODE=multi (links.ts). */
  links: SignInLinks
  /** The ways in the server can serve (methods.ts). */
  methods?: SignInMethods
  /** The server's clock at render, for the strip's first paint and a sent link's state. */
  now?: string
  locale?: Locale
}) {
  const text = (key: string, vars: Record<string, string | number> = {}) => t(key, vars, locale)
  const clock = (value: number) => <time dateTime={new Date(value).toISOString()}>{formatClock(value, locale)}</time>
  const emailRef = useRef<HTMLInputElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const expiredRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const sentHeadingRef = useRef<HTMLHeadingElement>(null)
  const conditionalStarted = useRef(false)
  const renderedAt = Date.parse(now)
  const urlUntil = state.kind === 'link-sent' ? Date.parse(state.until) : null
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<SentLink | null>(() =>
    urlUntil !== null && urlUntil > renderedAt ? { email: null, until: urlUntil } : null
  )
  const [expiredAt, setExpiredAt] = useState<number | null>(() =>
    urlUntil !== null && urlUntil <= renderedAt ? urlUntil : null
  )
  const [fieldError, setFieldError] = useState<FieldProblem | null>(() =>
    state.kind === 'email-invalid' ? 'email_invalid' : null
  )
  const [sendProblem, setSendProblem] = useState<SendProblem | null>(() =>
    state.kind === 'send-limited'
      ? { key: 'send_limited', retryAt: state.retryAt ? Date.parse(state.retryAt) : null }
      : null
  )
  const [actionAlert, setActionAlert] = useState<string | null>(null)
  const [passkeyNote, setPasskeyNote] = useState<'passkey_unsupported' | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [forceEmailForm, setForceEmailForm] = useState(false)
  /** Bumped when the form comes back (a different address, an expired link): focus returns to the field. */
  const [formReturned, setFormReturned] = useState(0)
  const [stepUpConfirmed, setStepUpConfirmed] = useState(false)

  const continueHref = continuePath(next)
  const expiredStepUp = state.kind === 'expired' && state.stepUp
  const resendOnly = state.kind === 'expired' && Boolean(state.resend) && !forceEmailForm
  const showOptions = state.kind !== 'confirm' && !expiredStepUp && !resendOnly
  const showSent = showOptions && sent !== null
  /** "Check your email" replaces the form, and the lead, so it is the first thing under the title. */
  const sentView = sent !== null && (showSent || (resendOnly && resendSent))
  const showForm = showOptions && !showSent
  const offerPasskey = mode === 'sign-in'
  const visibleAlert = actionAlert ?? urlAlert(state)
  const expiredCopy = state.kind === 'expired' ? (state.stepUp ? 'link_expired_step_up' : 'link_expired') : null
  const reason =
    next && showForm && !visibleAlert && !expiredCopy && expiredAt === null && !sendProblem ? 'next_reason' : null

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

  // The email field takes focus on load where a keyboard is at hand; on touch it would raise the keyboard over the page.
  useEffect(() => {
    if (document.activeElement !== document.body && document.activeElement !== null) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    emailRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (formReturned) emailRef.current?.focus()
  }, [formReturned])

  // The pressed control is gone once a link is sent or confirmed; focus moves to the heading or result that replaced it.
  useEffect(() => {
    if (sent && !sent.again) sentHeadingRef.current?.focus()
  }, [sent])
  useEffect(() => {
    if (stepUpConfirmed) resultRef.current?.focus()
  }, [stepUpConfirmed])

  // The link's window closes: the form returns with the address in it and one line saying when the link expired.
  useEffect(() => {
    if (!sent) return
    const timer = window.setTimeout(
      () => {
        setExpiredAt(sent.until)
        setEmail(sent.email ?? '')
        setSent(null)
        setResendSent(false)
        setForceEmailForm(true)
        setFormReturned((count) => count + 1)
      },
      Math.max(0, sent.until - Date.now())
    )
    return () => window.clearTimeout(timer)
  }, [sent])

  useEffect(() => {
    if (offerPasskey && typeof window.PublicKeyCredential !== 'function') setPasskeyNote('passkey_unsupported')
  }, [offerPasskey])

  const completePasskeySignIn = useCallback(
    async (autoFill = false) => {
      try {
        const result = await authClient.signIn.passkey(autoFill ? { autoFill: true } : undefined)
        if (result.error || !result.data) {
          const code = (result.error as { code?: string } | null)?.code ?? ''
          if (autoFill || PASSKEY_CANCELLED.has(code)) return
          setActionAlert(code === 'PASSKEY_NOT_FOUND' ? 'passkey_unknown' : 'passkey_failed')
          return
        }
        window.location.assign(continueHref)
      } catch {
        if (!autoFill) setActionAlert('passkey_failed')
      }
    },
    [continueHref]
  )

  const clearProblems = () => {
    setFieldError(null)
    setSendProblem(null)
    setActionAlert(null)
    setExpiredAt(null)
  }

  const startPasskeySignIn = async () => {
    if (busy) return
    setBusy(true)
    clearProblems()
    try {
      await completePasskeySignIn()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (
      !offerPasskey ||
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
  }, [completePasskeySignIn, offerPasskey, showOptions])

  /** Sends a link to `address`; on success the form gives way to "Check your email" and the strip draws its window. */
  const send = async (address: string, again: boolean) => {
    setBusy(true)
    clearProblems()
    setStatus('')
    // Taken before the request, so the end drawn is never later than the server's own.
    const startedAt = Date.now()
    let retryAfter: string | null = null
    try {
      const result = await authClient.signIn.magicLink(
        { email: address, callbackURL: continueHref },
        {
          onError: (context: { response: Response }) => {
            retryAfter = context.response.headers.get('Retry-After')
          }
        }
      )
      if (result.error) {
        if (result.error.status === 400) {
          setSent(null)
          setFieldError('email_invalid')
          return
        }
        const seconds = Number(retryAfter)
        setSendProblem(
          result.error.status === 429
            ? { key: 'send_limited', retryAt: seconds > 0 ? startedAt + seconds * 1000 : null }
            : { key: 'send_failed' }
        )
        if (!again) emailRef.current?.focus()
        return
      }
      setEmail(address)
      setSent({ email: address, until: startedAt + LINK_LIFETIME_MS, again })
    } catch {
      setSendProblem({ key: 'send_unreachable' })
      if (!again) emailRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const sendEmailLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const address = email.trim()
    const problem = !address ? 'email_empty' : !isEmailAddress(address) ? 'email_invalid' : null
    if (problem) {
      setSendProblem(null)
      setFieldError(problem)
      emailRef.current?.focus()
      return
    }
    await send(address, false)
  }

  const startGoogleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    clearProblems()
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
    const startedAt = Date.now()
    try {
      const response = await fetch('/api/auth/magic-link/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resend: state.resend })
      })
      if (!response.ok) throw new Error('Resend failed')
      setResendSent(true)
      setSent({ email: null, until: startedAt + LINK_LIFETIME_MS, resent: true })
    } catch {
      setActionAlert('resend_failed')
    } finally {
      setBusy(false)
    }
  }

  const useDifferentEmail = () => {
    setEmail('')
    setSent(null)
    setResendSent(false)
    clearProblems()
    setStatus('')
    setForceEmailForm(true)
    setFormReturned((count) => count + 1)
  }

  const sendProblemText = (problem: SendProblem) =>
    problem.key !== 'send_limited'
      ? text(`sign-in.${problem.key}`)
      : problem.retryAt
        ? withParts(text('sign-in.send_rate_limited_until'), { time: clock(problem.retryAt) })
        : text('sign-in.send_rate_limited')

  const legal = withParts(text('sign-in.legal'), {
    terms: <a href={links.terms}>{text('sign-in.terms')}</a>,
    privacy: <a href={links.privacy}>{text('sign-in.privacy')}</a>
  })

  return (
    <main className="sign-in" lang={locale} data-auth-page data-sign-in-page>
      <noscript dangerouslySetInnerHTML={{ __html: NO_SCRIPT_STYLE }} />
      <section className="sign-in-column" aria-labelledby="sign-in-title">
        <div className="sign-in-stack">
          <a className="sign-in-brand" href={links.home} aria-label={text('legal.frame.home')}>
            <img src="/icon.svg" width={28} height={28} alt="" />
            <span translate="no">{text('brand.name')}</span>
          </a>

          <header className="sign-in-head">
            <h1 className="sign-in-title" id="sign-in-title" data-long={mode === 'sign-up' || undefined}>
              {text(mode === 'sign-in' ? 'sign-in.heading' : 'sign-in.heading_sign_up')}
            </h1>
            {sentView ? null : (
              <p className="sign-in-lead">{text(mode === 'sign-in' ? 'sign-in.lead' : 'sign-in.lead_sign_up')}</p>
            )}
          </header>

          {reason && <p className="sign-in-reason">{text(`sign-in.${reason}`)}</p>}

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

          {expiredAt !== null && showForm && (
            <AuthMessage tone="result">
              {withParts(text('sign-in.link_expired_local'), { time: clock(expiredAt) })}
            </AuthMessage>
          )}

          {state.kind === 'confirm' && (
            <div className="sign-in-actions">
              {stepUpConfirmed ? (
                <AuthMessage tone="result" tabIndex={-1} ref={resultRef}>
                  {status}
                </AuthMessage>
              ) : (
                <Button size="lg" className="w-full" onClick={() => void confirmLink()} disabled={busy}>
                  {busy
                    ? text('sign-in.confirming')
                    : text(state.stepUp ? 'sign-in.confirm_step_up' : 'sign-in.confirm')}
                </Button>
              )}
            </div>
          )}

          {resendOnly && !resendSent && (
            <div className="sign-in-actions">
              <Button size="lg" className="w-full" onClick={() => void resendLink()} disabled={busy}>
                {busy ? text('sign-in.sending') : text('sign-in.resend')}
              </Button>
            </div>
          )}

          {sentView && sent && (
            <div className="sign-in-sent" role="status">
              <h2 className="sign-in-sent-title" tabIndex={-1} ref={sentHeadingRef}>
                {text('sign-in.sent_heading')}
              </h2>
              <p className="sign-in-sent-to">
                {sent.resent
                  ? text('sign-in.sent_resend')
                  : sent.email
                    ? withParts(text('sign-in.sent'), { email: <strong>{sent.email}</strong> })
                    : text('sign-in.sent_unknown')}
              </p>
              <p className="sign-in-sent-to">{withParts(text('sign-in.sent_until'), { time: clock(sent.until) })}</p>
              {sent.again && <p className="sign-in-sent-again">{text('sign-in.resent')}</p>}
              {sendProblem && <AuthMessage>{sendProblemText(sendProblem)}</AuthMessage>}
              <div className="sign-in-actions">
                {sent.email && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => void send(sent.email!, true)}
                    disabled={busy}
                  >
                    {busy ? <Loader2Icon data-icon="inline-start" aria-hidden="true" className="animate-spin" /> : null}
                    {busy ? text('sign-in.sending') : text('sign-in.resend_again')}
                  </Button>
                )}
                <Button variant="outline" size="lg" className="w-full" onClick={useDifferentEmail}>
                  {text('sign-in.use_different_email')}
                </Button>
              </div>
            </div>
          )}

          {showForm && (
            <>
              {methods.email ? (
                <form
                  className="sign-in-form"
                  method="post"
                  action="/sign-in/link"
                  noValidate
                  onSubmit={(event) => void sendEmailLink(event)}
                >
                  {next ? <input type="hidden" name="next" value={next} /> : null}
                  <FieldGroup className="gap-4">
                    <Field data-invalid={fieldError ? true : undefined}>
                      <FieldLabel htmlFor="sign-in-email" className="sign-in-label">
                        {text('sign-in.email_label')}
                      </FieldLabel>
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
                        readOnly={busy}
                        className="h-12 text-base md:text-base"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value)
                          if (fieldError) setFieldError(null)
                        }}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={
                          fieldError ? 'sign-in-email-error' : mode === 'sign-in' ? 'sign-in-email-hint' : undefined
                        }
                      />
                      {fieldError ? (
                        <FieldError id="sign-in-email-error" className="sign-in-field-error">
                          {text(`sign-in.${fieldError}`)}
                        </FieldError>
                      ) : null}
                    </Field>
                    {sendProblem && <AuthMessage>{sendProblemText(sendProblem)}</AuthMessage>}
                    {busy && (
                      <p className="sr-only" role="status" aria-live="polite">
                        {text('sign-in.sending')}
                      </p>
                    )}
                    <Button size="lg" className="w-full" type="submit" disabled={busy}>
                      {busy ? (
                        <Loader2Icon data-icon="inline-start" aria-hidden="true" className="animate-spin" />
                      ) : null}
                      {busy ? text('sign-in.sending') : text('sign-in.email_submit')}
                    </Button>
                    {mode === 'sign-in' ? (
                      <FieldDescription id="sign-in-email-hint" className="sign-in-hint">
                        {text('sign-in.email_hint')}
                      </FieldDescription>
                    ) : null}
                  </FieldGroup>
                </form>
              ) : (
                <p className="sign-in-unavailable">
                  {`${text('sign-in.email_unavailable')} ${text(`sign-in.use_other.${otherWays(offerPasskey && passkeyNote === null, methods.google)}`)}`}
                </p>
              )}

              {(offerPasskey || methods.google) && (
                <div className="sign-in-others">
                  {methods.email && (
                    <p className="sign-in-or" data-sign-in-script={methods.google ? undefined : ''}>
                      {text('sign-in.or')}
                    </p>
                  )}
                  {offerPasskey &&
                    (passkeyNote ? (
                      <p className="sign-in-note">{text(`sign-in.${passkeyNote}`)}</p>
                    ) : (
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full"
                        data-sign-in-script=""
                        onClick={() => void startPasskeySignIn()}
                        disabled={busy}
                      >
                        {text('sign-in.passkey')}
                      </Button>
                    ))}
                  {methods.google && (
                    <form method="post" action="/sign-in/google" onSubmit={(event) => void startGoogleSignIn(event)}>
                      {next ? <input type="hidden" name="next" value={next} /> : null}
                      <Button variant="outline" size="lg" className="w-full" type="submit" disabled={busy}>
                        {text('sign-in.google')}
                      </Button>
                    </form>
                  )}
                </div>
              )}

              {mode === 'sign-up' && (
                <p className="sign-in-switch">
                  <Link className="sign-in-link" href={accountPath('/sign-in', next)}>
                    {text('sign-in.sign_in_instead')}
                  </Link>
                </p>
              )}
            </>
          )}

          <p className="sign-in-legal">{legal}</p>
        </div>
      </section>

      <div className="sign-in-room">
        <div className="sign-in-photo">
          <div className="sign-in-capsule">
            <img
              src={ROOM.src}
              srcSet={srcSetOf(ROOM)}
              sizes="(min-width: 1024px) 60vw, 100vw"
              width={ROOM.width}
              height={ROOM.height}
              alt={ROOM.alt}
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </div>
        <SignInStrip initialNow={now} until={sent?.until ?? null} locale={locale} />
        <p className="sign-in-credit">
          <a href={links.credits}>
            {text('sign-in.photo_credit', { title: ROOM.title, creator: ROOM.creator, licence: ROOM.licence })}
          </a>
        </p>
      </div>
    </main>
  )
}
