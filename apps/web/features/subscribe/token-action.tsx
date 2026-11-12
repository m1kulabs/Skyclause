'use client'

import { useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { AuthHeader, AuthMessage } from '../public-chrome/auth'
import { t } from './catalogue'
import { apiFetch } from './operations'
import { operationError } from './error'

export type TokenActionKind = 'confirm' | 'unsubscribe' | 'reply' | 'feedback'
export function TokenAction({
  token,
  kind,
  initial,
  locale
}: {
  token: string
  kind: TokenActionKind
  initial?: string
  locale: 'en' | 'ms'
}) {
  const [reply, setReply] = useState(initial === 'shift' || initial === 'shuttle' ? initial : 'keep')
  const [shiftTo, setShiftTo] = useState('')
  const [answer, setAnswer] = useState(
    initial === 'yes' || initial === 'true' ? 'yes' : initial === 'no' || initial === 'false' ? 'no' : ''
  )
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const inFlight = useRef(false)
  const button = kind === 'reply' ? 'send_reply' : kind === 'feedback' ? 'send_feedback' : kind
  const success = kind === 'confirm' ? 'confirmed' : kind === 'unsubscribe' ? 'unsubscribed' : `${kind}_saved`
  async function submit() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const params = { token }
      if (kind === 'confirm') await apiFetch('confirmSubscription', { params })
      else if (kind === 'unsubscribe') await apiFetch('unsubscribeSubscription', { params })
      else if (kind === 'feedback')
        await apiFetch('createSubscriberFeedback', { params, body: { answer: answer === 'yes' } })
      else
        await apiFetch('createSubscriberReply', {
          params,
          body:
            reply === 'shift'
              ? { kind: 'shift', shift_to: shiftTo }
              : { kind: reply === 'shuttle' ? 'shuttle' : 'keep' }
        })
      setDone(true)
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }
  return (
    <>
      <AuthHeader title={t(`subscribe.${kind}_title`, {}, locale)} locale={locale} />
      {error ? <AuthMessage>{operationError(error, locale)}</AuthMessage> : null}
      {done ? (
        <AuthMessage tone="result">{t(`subscribe.${success}`, {}, locale)}</AuthMessage>
      ) : (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {kind === 'reply' && (
            <fieldset disabled={busy} className="auth-fieldset">
              <legend className="sr-only">{t('subscribe.reply_title', {}, locale)}</legend>
              {(['keep', 'shift', 'shuttle'] as const).map((option) => (
                <label key={option} className="auth-check">
                  <input
                    className="native-check"
                    type="radio"
                    name="reply"
                    value={option}
                    checked={reply === option}
                    onChange={() => setReply(option)}
                  />
                  <span>{t(`subscribe.${option}`, {}, locale)}</span>
                </label>
              ))}
              {reply === 'shift' && (
                <div className="auth-field">
                  <label htmlFor="shift-to">{t('subscribe.shift_to', {}, locale)}</label>
                  <Input
                    id="shift-to"
                    type="time"
                    name="shift_to"
                    autoComplete="off"
                    required
                    className="h-12 text-base md:text-base"
                    value={shiftTo}
                    onChange={(event) => setShiftTo(event.target.value)}
                  />
                </div>
              )}
            </fieldset>
          )}
          {kind === 'feedback' && (
            <fieldset disabled={busy} className="auth-fieldset">
              <legend className="sr-only">{t('subscribe.feedback_title', {}, locale)}</legend>
              {(['yes', 'no'] as const).map((option) => (
                <label key={option} className="auth-check">
                  <input
                    className="native-check"
                    type="radio"
                    name="answer"
                    value={option}
                    checked={answer === option}
                    onChange={() => setAnswer(option)}
                  />
                  <span>{t(`subscribe.${option}`, {}, locale)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            variant={kind === 'unsubscribe' ? 'destructive' : 'default'}
            disabled={
              busy ||
              (kind === 'feedback' && !answer) ||
              (kind === 'reply' && reply === 'shift' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftTo))
            }
          >
            {t(`subscribe.${busy ? 'saving' : button}`, {}, locale)}
          </Button>
        </form>
      )}
    </>
  )
}
