'use client'

import { useRef, useState } from 'react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { apiFetch, type Endpoint } from './operations'
import { t } from './catalogue'
import { problemKey } from './form'

export function EndpointState({
  endpoint,
  org,
  update
}: {
  endpoint: Endpoint
  org: string
  update: (value: Endpoint) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inFlight = useRef(false)
  async function verify() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    try {
      update(await apiFetch('verifyWebhook', { org, params: { id: endpoint.id } }))
    } catch (caught) {
      setError(problemKey(caught))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <div className="webhook-verification">
      <div role="status">
        {endpoint.disabled_at ? (
          <p>{t('webhooks.disabled', { date: formatDateTime(endpoint.disabled_at, 'en') })}</p>
        ) : endpoint.verified_at ? (
          <p>{t('webhooks.verified', { date: formatDateTime(endpoint.verified_at, 'en') })}</p>
        ) : (
          <p>{t(endpoint.status === 'failed' ? 'webhooks.failed' : 'webhooks.pending')}</p>
        )}
      </div>
      <Button variant="outline" onClick={() => void verify()} disabled={busy} aria-busy={busy}>
        {t(busy ? 'webhooks.verifying' : 'webhooks.verify')}
      </Button>
      {error && <p role="alert">{t(`webhooks.${error}`)}</p>}
    </div>
  )
}

export function Secret({ value, dismiss }: { value: string; dismiss: () => void }) {
  const [message, setMessage] = useState<string>()
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setMessage('copied')
    } catch {
      setMessage('copy_failed')
    }
  }
  return (
    <section className="webhook-secret" aria-label={t('webhooks.secret')}>
      <h3>{t('webhooks.secret_once')}</h3>
      <p>{t('webhooks.secret_help')}</p>
      <pre translate="no" data-webhook-secret>
        {value}
      </pre>
      <div className="webhook-actions">
        <Button variant="outline" onClick={() => void copy()}>
          {t('webhooks.copy')}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          {t('webhooks.dismiss_secret')}
        </Button>
      </div>
      <p role="status">{message ? t(`webhooks.${message}`) : ''}</p>
    </section>
  )
}
