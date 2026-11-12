'use client'

import { useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Field, FieldLabel, FieldError } from '#ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '#ui/dialog'
import { apiFetch, type Evidence } from '../ledger/operations'
import { t } from '../ledger/i18n'
import { problemMessage } from '../ledger/problem'

export type EvidenceTarget = { call_id?: string; span?: { from: string; to: string } }
const localTime = (instant?: string) =>
  instant ? new Date(Date.parse(instant) + 8 * 3600000).toISOString().slice(0, 16) : ''

export function RequestEvidence({
  projectId,
  target,
  onClose,
  onCreated,
  locale
}: {
  projectId: string
  target: EvidenceTarget | null
  onClose: () => void
  onCreated: (request: Evidence) => void
  locale: 'en' | 'ms'
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="evidence-request" lang={locale}>
        <DialogHeader>
          <DialogTitle>{t('evidence.request', {}, locale)}</DialogTitle>
          <DialogDescription>{t('evidence.description', {}, locale)}</DialogDescription>
        </DialogHeader>
        {target && (
          <RequestForm
            key={JSON.stringify(target)}
            projectId={projectId}
            target={target}
            onCreated={onCreated}
            locale={locale}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One form that reads as the request: evidence for [a time window] from [instant] to [instant], or for [a call]. */
function RequestForm({
  projectId,
  target,
  onCreated,
  locale
}: {
  projectId: string
  target: EvidenceTarget
  onCreated: (request: Evidence) => void
  locale: 'en' | 'ms'
}) {
  const [kind, setKind] = useState(target.call_id ? 'call' : 'span')
  const [callId, setCallId] = useState(target.call_id ?? '')
  const [from, setFrom] = useState(localTime(target.span?.from))
  const [to, setTo] = useState(localTime(target.span?.to))
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const describedBy = error ? 'evidence-request-error' : undefined
  return (
    <form
      ref={form}
      noValidate
      className="evidence-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        const start = from ? new Date(`${from}:00+08:00`) : null
        const end = to ? new Date(`${to}:00+08:00`) : null
        if (
          (kind === 'call' && !callId.trim()) ||
          (kind === 'span' && (!start || !end || !Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start))
        ) {
          setInvalid(true)
          setError(t('evidence.invalid', {}, locale))
          form.current?.querySelector<HTMLInputElement>('input')?.focus()
          return
        }
        setInvalid(false)
        setError('')
        setBusy(true)
        try {
          const request = await apiFetch('createEvidenceRequest', {
            params: { id: projectId },
            body:
              kind === 'call'
                ? { call_id: callId.trim() }
                : { span: { from: start!.toISOString(), to: end!.toISOString() } }
          })
          onCreated(request)
        } catch (error) {
          setError(problemMessage(error, locale))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="evidence-sentence">
        <Field className="evidence-target">
          <FieldLabel htmlFor="evidence-target">{t('evidence.target', {}, locale)}</FieldLabel>
          <select
            id="evidence-target"
            name="target"
            className="native-select"
            autoComplete="off"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="span">{t('evidence.span', {}, locale)}</option>
            <option value="call">{t('evidence.call', {}, locale)}</option>
          </select>
        </Field>
        {kind === 'call' ? (
          <Field data-invalid={invalid} className="evidence-call">
            <FieldLabel htmlFor="evidence-call">{t('evidence.callId', {}, locale)}</FieldLabel>
            <Input
              id="evidence-call"
              name="call_id"
              autoComplete="off"
              spellCheck={false}
              value={callId}
              onChange={(event) => setCallId(event.target.value)}
              aria-invalid={invalid}
              aria-describedby={describedBy}
            />
          </Field>
        ) : (
          (
            [
              ['from', from, setFrom],
              ['to', to, setTo]
            ] as const
          ).map(([key, value, set]) => (
            <Field key={key} data-invalid={invalid}>
              <FieldLabel htmlFor={`evidence-${key}`}>{t(`evidence.${key}`, {}, locale)}</FieldLabel>
              <span className="ledger-field-ring" data-focus-ring>
                <Input
                  id={`evidence-${key}`}
                  name={key}
                  type="datetime-local"
                  autoComplete="off"
                  value={value}
                  onChange={(event) => set(event.target.value)}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                />
              </span>
            </Field>
          ))
        )}
      </div>
      {error && <FieldError id="evidence-request-error">{error}</FieldError>}
      <div className="evidence-submit">
        <Button type="submit" disabled={busy}>
          {t(busy ? 'evidence.saving' : 'evidence.submit', {}, locale)}
        </Button>
      </div>
    </form>
  )
}
