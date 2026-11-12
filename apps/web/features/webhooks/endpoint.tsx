'use client'

import { useRef, useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { StatusMark } from '../brand/status-mark'
import type { BrandState } from '@skyclause/elements'
import { apiFetch, type Endpoint } from './operations'
import { t } from './catalogue'
import { problemKey } from './form'

/** The glyph and the short word of an endpoint's state; the full sentence (with its date) sits beside it. */
export function endpointMark(endpoint: Endpoint): { state: BrandState; word: string } {
  if (endpoint.disabled_at) return { state: 'error', word: t('webhooks.state_disabled') }
  if (endpoint.verified_at) return { state: 'fresh', word: t('webhooks.state_verified') }
  return endpoint.status === 'failed'
    ? { state: 'error', word: t('webhooks.state_failed') }
    : { state: 'pending', word: t('webhooks.state_pending') }
}

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
  const mark = endpointMark(endpoint)
  const sentence = endpoint.disabled_at
    ? t('webhooks.disabled', { date: formatDateTime(endpoint.disabled_at, 'en') })
    : endpoint.verified_at
      ? t('webhooks.verified', { date: formatDateTime(endpoint.verified_at, 'en') })
      : t(endpoint.status === 'failed' ? 'webhooks.failed' : 'webhooks.pending')
  return (
    <div className="webhook-verification">
      <div role="status" className="type-body">
        <StatusMark state={mark.state} variant="plain" label={sentence} />
      </div>
      <Button variant="outline" onClick={() => void verify()} disabled={busy} aria-busy={busy}>
        {t(busy ? 'webhooks.verifying' : 'webhooks.verify')}
      </Button>
      {error && (
        <p role="alert" className="type-body w-full font-medium">
          {t(`webhooks.${error}`)}
        </p>
      )}
    </div>
  )
}

/** The signing secret: in memory only, shown once, with a copy control. Never stored, never in the URL. */
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
    <Card role="region" aria-label={t('webhooks.secret')} className="webhook-secret">
      <CardContent className="grid min-w-0 gap-3">
        <h3 className="type-card-title">{t('webhooks.secret_once')}</h3>
        <p className="type-body text-muted-foreground">{t('webhooks.secret_help')}</p>
        <CodeBlock>
          <CodeBlockContent wrap translate="no" data-webhook-secret>
            {value}
          </CodeBlockContent>
        </CodeBlock>
        <div className="webhook-actions">
          <Button variant="outline" onClick={() => void copy()}>
            <CopyIcon data-icon="inline-start" />
            {t('webhooks.copy')}
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            {t('webhooks.dismiss_secret')}
          </Button>
        </div>
        <p role="status" className="type-small text-muted-foreground">
          {message ? t(`webhooks.${message}`) : ''}
        </p>
      </CardContent>
    </Card>
  )
}
