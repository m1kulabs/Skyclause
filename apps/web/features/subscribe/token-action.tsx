'use client'

import { useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { t } from './catalogue'
import { apiFetch } from './operations'
import { actionClass } from './fields'
import { OperationError } from './error'

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
      <h1 className="text-2xl font-semibold">{t(`subscribe.${kind}_title`, {}, locale)}</h1>
      <OperationError error={error} locale={locale} />
      {done ? (
        <p role="status">{t(`subscribe.${success}`, {}, locale)}</p>
      ) : (
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {kind === 'reply' && (
            <fieldset disabled={busy} className="grid gap-3">
              <legend className="sr-only">{t('subscribe.reply_title', {}, locale)}</legend>
              {(['keep', 'shift', 'shuttle'] as const).map((option) => (
                <label key={option} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    className="size-5 accent-primary"
                    name="reply"
                    value={option}
                    checked={reply === option}
                    onChange={() => setReply(option)}
                  />
                  <span>{t(`subscribe.${option}`, {}, locale)}</span>
                </label>
              ))}
              {reply === 'shift' && (
                <label className="grid gap-2" htmlFor="shift-to">
                  {t('subscribe.shift_to', {}, locale)}
                  <Input
                    id="shift-to"
                    type="time"
                    name="shift_to"
                    required
                    value={shiftTo}
                    onChange={(event) => setShiftTo(event.target.value)}
                  />
                </label>
              )}
            </fieldset>
          )}
          {kind === 'feedback' && (
            <fieldset disabled={busy} className="grid gap-3">
              <legend className="sr-only">{t('subscribe.feedback_title', {}, locale)}</legend>
              {(['yes', 'no'] as const).map((option) => (
                <label key={option} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    className="size-5 accent-primary"
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
            className={actionClass}
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
