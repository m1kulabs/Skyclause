'use client'

import { useRef, useState } from 'react'
import { Button } from '#ui/button'
import { Subscriber } from '@skyclause/contracts'
import { actionClass, controlClass } from '../subscribe/fields'
import { OperationError } from '../subscribe/error'
import { apiFetch } from '../subscribe/operations'
import { useUnsavedChangesGuard } from '../settings/set-7/use-unsaved-changes-guard'
import { t } from './catalogue'

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
    <section className="grid min-w-0 gap-4 border-t border-border pt-6" aria-labelledby="import-title">
      <h2 id="import-title" className="text-lg font-medium">
        {t('subscribers.import_title', {}, locale)}
      </h2>
      <p id="import-notice" className="text-muted-foreground">
        {t('subscribers.import_notice', {}, locale)}
      </p>
      <form
        className="grid min-w-0 gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="grid min-w-0 gap-2" htmlFor="subscriber-addresses">
          {t('subscribers.addresses', {}, locale)}
          <textarea
            id="subscriber-addresses"
            className={controlClass}
            name="addresses"
            rows={4}
            required
            value={addresses}
            onChange={(event) => setAddresses(event.target.value)}
            disabled={busy}
            aria-describedby="import-notice"
            aria-invalid={invalid}
          />
        </label>
        {invalid && <p role="alert">{t('subscribers.invalid_addresses', {}, locale)}</p>}
        <OperationError error={error} locale={locale} />
        {count !== undefined && <p role="status">{t('subscribers.import_result', { count }, locale)}</p>}
        <Button className={actionClass} type="submit" disabled={busy || !addresses.trim()}>
          {t(busy ? 'subscribe.saving' : 'subscribers.import', {}, locale)}
        </Button>
      </form>
    </section>
  )
}
