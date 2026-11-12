'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CircleAlertIcon } from 'lucide-react'
import type { Subscriber } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { ApiProblem } from '../../lib/api-fetch'
import { AuthHeader, AuthMessage } from '../public-chrome/auth'
import { t } from './catalogue'
import { apiFetch } from './operations'
import { Fields, type SubscriberFields } from './fields'
import { operationError } from './error'

type Subscription = Awaited<ReturnType<typeof readSubscription>>
const readSubscription = (token: string, signal: AbortSignal) =>
  apiFetch('getSubscription', { params: { token }, signal })

export function SubscriptionForm({ token, locale }: { token: string; locale: 'en' | 'ms' }) {
  const [data, setData] = useState<Subscription>()
  const [value, setValue] = useState<SubscriberFields>({
    email: '',
    role: '',
    window_ids: [],
    channels: ['email'],
    language: locale
  })
  const [error, setError] = useState<unknown>(null)
  const [consent, setConsent] = useState(false)
  const [consentMissing, setConsentMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [saved, setSaved] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  // Preference saves run one after another, so a change made while one saves waits instead of being dropped.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const current = useRef<Subscriber | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const consentErrorId = useId()
  const preferences = !!data?.subscriber
  const dirty =
    sent || blocked
      ? false
      : preferences
        ? !!current.current && JSON.stringify(value) !== JSON.stringify(fieldsOf(current.current))
        : !!(value.email || value.role || value.window_ids.length)
  // The join form is guarded too, so following the privacy notice link never drops what was typed.
  useUnsavedChangesGuard(dirty, locale)

  // The form a result replaces held focus; it moves to the result, which says what happened.
  useEffect(() => {
    if (sent) resultRef.current?.focus()
  }, [sent])

  useEffect(() => {
    const controller = new AbortController()
    readSubscription(token, controller.signal)
      .then((response) => {
        setData(response)
        setError(null)
        current.current = response.subscriber
        if (response.subscriber) setValue(fieldsOf(response.subscriber))
        if (response.privacy_notice_version === null) {
          setBlocked(true)
          setError(new ApiProblem(503, { type: 'privacy-notice-unpublished' }))
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason)
      })
    return () => controller.abort()
  }, [token, attempt])

  function save(patch: Partial<SubscriberFields>) {
    queue.current = queue.current.then(() => saveNow(patch))
  }

  async function saveNow(patch: Partial<SubscriberFields>) {
    const field = Object.keys(patch)[0] as keyof SubscriberFields
    if (!current.current || JSON.stringify(patch[field]) === JSON.stringify(current.current[field])) return
    inFlight.current = true
    setBusy(true)
    setSaved('')
    setError(null)
    try {
      const subscriber = await apiFetch('updateSubscription', { params: { token }, body: patch })
      current.current = subscriber
      // Only the saved field takes the server's answer: another field may hold an edit made while this one saved.
      setValue((previous) => ({ ...previous, [field]: fieldsOf(subscriber)[field] }))
      setSaved(
        t(
          'subscribe.saved',
          { field: t(`subscribe.${field === 'window_ids' ? 'windows' : field}`, {}, locale) },
          locale
        )
      )
    } catch (reason) {
      setError(reason)
      if (
        reason instanceof ApiProblem &&
        reason.status === 503 &&
        JSON.stringify(reason.body).includes('privacy-notice-unpublished')
      )
        setBlocked(true)
      const kept = fieldsOf(current.current!)
      setValue((previous) => ({ ...previous, [field]: kept[field] }))
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  async function join() {
    if (!consent) {
      setConsentMissing(true)
      consentRef.current?.focus()
      return
    }
    if (!data?.privacy_notice_version || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await apiFetch('createSubscription', {
        params: { token },
        body: { ...value, consent: true, notice_version: data.privacy_notice_version }
      })
      setSent(true)
    } catch (reason) {
      setError(reason)
      if (
        reason instanceof ApiProblem &&
        reason.status === 503 &&
        JSON.stringify(reason.body).includes('privacy-notice-unpublished')
      )
        setBlocked(true)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  // Unsubscribing waits for any preference still saving, so the press is never dropped.
  function unsubscribe() {
    queue.current = queue.current.then(unsubscribeNow)
  }

  async function unsubscribeNow() {
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await apiFetch('unsubscribeSubscription', { params: { token } })
      setSaved(t('subscribe.unsubscribed', {}, locale))
      setSent(true)
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  const title = data
    ? preferences
      ? t('subscribe.preferences_title', {}, locale)
      : t('subscribe.join_title', { name: data.project_name }, locale)
    : t(error ? 'subscribe.error_title' : 'subscribe.loading', {}, locale)

  return (
    <>
      <AuthHeader title={title} lead={data ? t('subscribe.intro', {}, locale) : undefined} locale={locale} />
      {error ? <AuthMessage>{operationError(error, locale)}</AuthMessage> : null}
      {!data && error && (
        <Button size="lg" className="w-full" onClick={() => setAttempt((n) => n + 1)}>
          {t('subscribe.retry', {}, locale)}
        </Button>
      )}
      {sent ? (
        <>
          <AuthMessage tone="result" ref={resultRef} tabIndex={-1}>
            {preferences ? saved : t('subscribe.check_email', {}, locale)}
          </AuthMessage>
          {/* No operation re-joins from this token: the way back is the project's subscribe link and a new opt-in. */}
          {preferences ? <p className="auth-hint">{t('subscribe.resubscribe', {}, locale)}</p> : null}
        </>
      ) : (
        data &&
        !blocked && (
          <>
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (!preferences) void join()
              }}
            >
              <Fields
                value={value}
                windows={data.windows}
                preferences={preferences}
                locale={locale}
                onChange={(patch) => {
                  setSaved('')
                  setValue((previous) => ({ ...previous, ...patch }))
                }}
                onCommit={preferences ? (patch) => void save(patch) : undefined}
              />
              {!preferences && (
                <>
                  <div className="auth-stack">
                    <a className="auth-link" href={locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy'}>
                      {t('subscribe.privacy', {}, locale)}
                    </a>
                    <p className="auth-hint m-0">
                      {t('subscribe.notice_version', { version: data.privacy_notice_version! }, locale)}
                    </p>
                    <label className="auth-check">
                      <input
                        className="native-check"
                        type="checkbox"
                        name="consent"
                        ref={consentRef}
                        checked={consent}
                        aria-invalid={consentMissing || undefined}
                        aria-describedby={consentMissing ? consentErrorId : undefined}
                        onChange={(event) => {
                          setConsent(event.target.checked)
                          if (event.target.checked) setConsentMissing(false)
                        }}
                      />
                      <span>{t('subscribe.consent', {}, locale)}</span>
                    </label>
                    {consentMissing ? (
                      <p className="auth-error" id={consentErrorId} role="alert">
                        <CircleAlertIcon aria-hidden="true" />
                        {t('subscribe.consent_required', {}, locale)}
                      </p>
                    ) : null}
                  </div>
                  <Button type="submit" size="lg" className="w-full" aria-busy={busy || undefined}>
                    {t(busy ? 'subscribe.saving' : 'subscribe.subscribe', {}, locale)}
                  </Button>
                </>
              )}
            </form>
            {preferences && (
              <>
                <p role="status" className="auth-hint m-0">
                  {busy ? t('subscribe.saving', {}, locale) : saved}
                </p>
                <Button size="lg" className="w-full" variant="destructive" onClick={unsubscribe}>
                  {t('subscribe.unsubscribe', {}, locale)}
                </Button>
              </>
            )}
          </>
        )
      )}
    </>
  )
}

function fieldsOf(subscriber: Subscriber): SubscriberFields {
  return {
    email: subscriber.email,
    role: subscriber.role,
    window_ids: subscriber.window_ids,
    channels: subscriber.channels,
    language: subscriber.language
  }
}
