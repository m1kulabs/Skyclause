'use client'

import { useEffect, useRef, useState } from 'react'
import type { Subscriber } from '@skyclause/contracts'
import { Button } from '#ui/button'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { apiFetch } from './operations'
import { Fields, actionClass, type SubscriberFields } from './fields'
import { OperationError } from './error'

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
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [saved, setSaved] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const inFlight = useRef(false)
  const current = useRef<Subscriber | null>(null)
  const preferences = !!data?.subscriber
  const dirty = preferences && !!current.current && JSON.stringify(value) !== JSON.stringify(fieldsOf(current.current))
  useUnsavedChangesGuard(dirty, locale)

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

  async function save(patch: Partial<SubscriberFields>) {
    const field = Object.keys(patch)[0] as keyof SubscriberFields
    if (!current.current || inFlight.current || JSON.stringify(patch[field]) === JSON.stringify(current.current[field]))
      return
    inFlight.current = true
    setBusy(true)
    setSaved('')
    setError(null)
    try {
      const subscriber = await apiFetch('updateSubscription', { params: { token }, body: patch })
      current.current = subscriber
      setValue(fieldsOf(subscriber))
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
      setValue(fieldsOf(current.current))
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  async function join() {
    if (!consent || !data?.privacy_notice_version || inFlight.current) return
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

  async function unsubscribe() {
    if (inFlight.current) return
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

  return (
    <>
      <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">
        {data
          ? preferences
            ? t('subscribe.preferences_title', {}, locale)
            : t('subscribe.join_title', { name: data.project_name }, locale)
          : t('subscribe.loading', {}, locale)}
      </h1>
      {data && <p className="text-muted-foreground">{t('subscribe.intro', {}, locale)}</p>}
      <OperationError error={error} locale={locale} />
      {!data && error && (
        <Button className={actionClass} onClick={() => setAttempt((n) => n + 1)}>
          {t('subscribe.retry', {}, locale)}
        </Button>
      )}
      {sent ? (
        <p role="status">{preferences ? saved : t('subscribe.check_email', {}, locale)}</p>
      ) : (
        data &&
        !blocked && (
          <>
            <form
              className="grid min-w-0 gap-5"
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
                disabled={busy}
                onChange={(patch) => {
                  setSaved('')
                  setValue((previous) => ({ ...previous, ...patch }))
                }}
                onCommit={preferences ? (patch) => void save(patch) : undefined}
              />
              {!preferences && (
                <>
                  <a className="underline" href={`/legal/privacy${locale === 'ms' ? '?lang=ms' : ''}`}>
                    {t('subscribe.privacy', {}, locale)}
                  </a>
                  <p className="text-sm text-muted-foreground">
                    {t('subscribe.notice_version', { version: data.privacy_notice_version! }, locale)}
                  </p>
                  <label className="flex min-h-11 items-start gap-3 py-2">
                    <input
                      className="mt-1 size-5 shrink-0 accent-primary"
                      type="checkbox"
                      name="consent"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      disabled={busy}
                    />
                    <span>{t('subscribe.consent', {}, locale)}</span>
                  </label>
                  <Button type="submit" className={actionClass} disabled={!consent || busy}>
                    {t(busy ? 'subscribe.saving' : 'subscribe.subscribe', {}, locale)}
                  </Button>
                </>
              )}
            </form>
            {preferences && (
              <>
                <p role="status">{busy ? t('subscribe.saving', {}, locale) : saved}</p>
                <Button
                  className={actionClass}
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void unsubscribe()}
                >
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
