'use client'

import { useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Textarea } from '#ui/textarea'
import { Subscriber } from '@skyclause/contracts'
import { Glyph } from '../brand/glyph'
import { OperationError } from '../subscribe/error'
import { apiFetch } from '../subscribe/operations'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { t } from './catalogue'

/** Add or import: one form, one address per line. Only confirmation emails go out; nothing is sent as a notice. */
export function ImportAddresses({
  projectId,
  locale,
  onImported
}: {
  projectId: string
  locale: 'en' | 'ms'
  onImported: () => void
}) {
  const [addresses, setAddresses] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [invalid, setInvalid] = useState(false)
  const [count, setCount] = useState<number>()
  const inFlight = useRef(false)
  useUnsavedChangesGuard(addresses.length > 0, locale)
  async function submit() {
    if (inFlight.current) return
    const emails = [
      ...new Set(
        addresses
          .split(/\r?\n/)
          .map((email) => email.trim())
          .filter(Boolean)
      )
    ]
    if (!emails.length || emails.some((email) => !Subscriber.shape.email.safeParse(email).success)) {
      setInvalid(true)
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    setInvalid(false)
    setCount(0)
    let sent = 0
    try {
      for (const email of emails) {
        await apiFetch('createSubscriber', {
          params: { id: projectId },
          body: { email, role: '', language: locale, channels: ['email'], window_ids: [] }
        })
        sent += 1
        setCount(sent)
        // Keep only unfinished addresses so a partial failure can be retried without resending successes.
        setAddresses(emails.slice(sent).join('\n'))
      }
    } catch (reason) {
      setError(reason)
    } finally {
      setBusy(false)
      inFlight.current = false
      if (sent) onImported()
    }
  }
  return (
    <section className="grid min-w-0 gap-4 rounded-xl bg-card p-5" aria-labelledby="import-title">
      <div className="grid gap-1">
        <h2 id="import-title" className="type-section">
          {t('subscribers.import_title', {}, locale)}
        </h2>
        <p id="import-notice" className="type-body text-muted-foreground">
          {t('subscribers.import_notice', {}, locale)}
        </p>
      </div>
      <form
        className="grid min-w-0 max-w-2xl gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="type-body grid min-w-0 gap-2 font-medium" htmlFor="subscriber-addresses">
          {t('subscribers.addresses', {}, locale)}
          <Textarea
            id="subscriber-addresses"
            name="addresses"
            autoComplete="off"
            spellCheck={false}
            rows={4}
            required
            value={addresses}
            onChange={(event) => setAddresses(event.target.value)}
            disabled={busy}
            aria-describedby="import-notice"
            aria-invalid={invalid}
          />
        </label>
        {invalid && (
          <p role="alert" className="type-body flex items-start gap-2 font-medium">
            <Glyph state="error" className="mt-1.5" />
            {t('subscribers.invalid_addresses', {}, locale)}
          </p>
        )}
        <OperationError error={error} locale={locale} />
        {count !== undefined && (
          <p role="status" className="type-body">
            {t('subscribers.import_result', { count }, locale)}
          </p>
        )}
        <Button className="justify-self-start" type="submit" disabled={busy || !addresses.trim()}>
          {t(busy ? 'subscribe.saving' : 'subscribers.import', {}, locale)}
        </Button>
      </form>
    </section>
  )
}
