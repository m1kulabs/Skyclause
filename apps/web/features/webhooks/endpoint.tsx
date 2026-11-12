'use client'

import { useEffect, useRef, useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { formatDateTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Card, CardContent } from '#ui/card'
import { CodeBlock, CodeBlockContent } from '#ui/code-block'
import { StatusMark } from '../brand/status-mark'
import { ConfirmDialog } from '../settings/set-7/confirm-dialog'
import type { BrandState } from '@skyclause/elements'
import { apiFetch, type Endpoint } from './operations'
import { t } from './catalogue'
import { problemKey } from './form'

type Locale = 'en' | 'ms'

/** The glyph and the short word of an endpoint's state; the full sentence (with its date) sits beside it. */
export function endpointMark(endpoint: Endpoint, locale: Locale = 'en'): { state: BrandState; word: string } {
  if (endpoint.disabled_at) return { state: 'error', word: t('webhooks.state_disabled', {}, locale) }
  if (endpoint.verified_at) return { state: 'fresh', word: t('webhooks.state_verified', {}, locale) }
  return endpoint.status === 'failed'
    ? { state: 'error', word: t('webhooks.state_failed', {}, locale) }
    : { state: 'pending', word: t('webhooks.state_pending', {}, locale) }
}

/** An endpoint's verification state as a sentence, with its date where it has one. */
export function endpointSentence(endpoint: Endpoint, locale: Locale = 'en'): string {
  return endpoint.disabled_at
    ? t('webhooks.disabled', { date: formatDateTime(endpoint.disabled_at, locale) }, locale)
    : endpoint.verified_at
      ? t('webhooks.verified', { date: formatDateTime(endpoint.verified_at, locale) }, locale)
      : t(endpoint.status === 'failed' ? 'webhooks.failed' : 'webhooks.pending', {}, locale)
}

/** Asks the API to verify an endpoint again; one request at a time, its failure as a catalogue key. */
export function useVerify(org: string, update: (value: Endpoint) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inFlight = useRef(false)
  async function verify(endpoint: Endpoint) {
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
  return { verify, busy, error }
}

export function EndpointState({
  endpoint,
  org,
  update,
  locale = 'en'
}: {
  endpoint: Endpoint
  org: string
  update: (value: Endpoint) => void
  locale?: Locale
}) {
  const { verify, busy, error } = useVerify(org, update)
  const mark = endpointMark(endpoint, locale)
  return (
    <div className="webhook-verification">
      <div role="status" className="type-body">
        <StatusMark state={mark.state} variant="plain" label={endpointSentence(endpoint, locale)} locale={locale} />
      </div>
      <Button variant="outline" onClick={() => void verify(endpoint)} disabled={busy} aria-busy={busy}>
        {t(busy ? 'webhooks.verifying' : 'webhooks.verify', {}, locale)}
      </Button>
      {error && (
        <p role="alert" className="type-body w-full font-medium">
          {t(`webhooks.${error}`, {}, locale)}
        </p>
      )}
    </div>
  )
}

/**
 * The signing secret: in memory only, shown once, with a copy control. Never stored, never in the URL. It takes focus
 * when it appears, so it is announced where the focused button used to be, and discarding it asks first: it cannot be
 * shown again.
 */
export function Secret({
  value,
  url,
  dismiss,
  locale = 'en'
}: {
  value: string
  /** The endpoint it signs, named in the confirmation. */
  url: string
  dismiss: () => void
  locale?: Locale
}) {
  const [message, setMessage] = useState<string>()
  const [discarding, setDiscarding] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => card.current?.focus(), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setMessage('copied')
    } catch {
      setMessage('copy_failed')
    }
  }
  return (
    <>
      <Card
        ref={card}
        tabIndex={-1}
        role="region"
        aria-label={t('webhooks.secret', {}, locale)}
        className="webhook-secret"
      >
        <CardContent className="grid min-w-0 gap-3">
          <h3 className="type-card-title">{t('webhooks.secret_once', {}, locale)}</h3>
          <p className="type-body text-muted-foreground">{t('webhooks.secret_help', {}, locale)}</p>
          <CodeBlock>
            <CodeBlockContent wrap translate="no" data-webhook-secret>
              {value}
            </CodeBlockContent>
          </CodeBlock>
          <div className="webhook-actions">
            <Button variant="outline" onClick={() => void copy()}>
              <CopyIcon data-icon="inline-start" />
              {t('webhooks.copy', {}, locale)}
            </Button>
            <Button variant="ghost" onClick={() => setDiscarding(true)}>
              {t('webhooks.dismiss_secret', {}, locale)}
            </Button>
          </div>
          <p role="status" className="type-small text-muted-foreground">
            {message ? t(`webhooks.${message}`, {}, locale) : ''}
          </p>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        objectName={url}
        title={t('webhooks.discard_secret_title', { url }, locale)}
        confirmLabel={t('webhooks.discard_secret_confirm', { url }, locale)}
        description={t('webhooks.discard_secret_description', {}, locale)}
        locale={locale}
        onConfirm={dismiss}
      />
    </>
  )
}
