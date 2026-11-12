'use client'

import { formatDateTime } from '@skyclause/i18n/format'
import { useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '#ui/alert-dialog'
import { Button } from '#ui/button'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { overviewApi } from './operations'

type Locale = 'en' | 'ms'

/** How long an ask waits for its bundle before saying none was drafted. */
export const ASK_WAIT_MS = 5 * 60_000

type AskState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'asked' }
  | { kind: 'drafted' }
  | { kind: 'no-draft' }
  // `retry` repeats the same ask; `newKey` when the key itself was refused. `unavailable` takes the control away.
  | { kind: 'failed'; sentence: string; retry: boolean; newKey?: boolean }
  | { kind: 'unavailable' }

/** A refused ask in product words: never the server's `detail`, which may be English, internal or a status. */
function refusal(error: unknown, locale: Locale): Extract<AskState, { kind: 'failed' } | { kind: 'unavailable' }> {
  const failed = (key: string, retry: boolean, params: Record<string, string> = {}) => ({
    kind: 'failed' as const,
    sentence: t(`overview.${key}`, params, locale),
    retry
  })
  if (!(error instanceof ApiProblem)) return failed('ask_call_failed', true)
  const slug = error.body.type?.split('/').pop()
  if (error.status === 501) return { kind: 'unavailable' }
  if (slug === 'budget-exhausted') {
    const resets = (error.body as { resets_at?: unknown }).resets_at
    return typeof resets === 'string' && !Number.isNaN(Date.parse(resets))
      ? failed('ask_call_budget', false, { time: formatDateTime(resets, locale) })
      : failed('ask_call_budget_no_time', false)
  }
  if (slug === 'rate-limited') return failed('ask_call_rate_limited', true)
  if (error.status === 403) return failed('ask_call_forbidden', false)
  if (slug === 'idempotency-mismatch') return { ...failed('ask_call_failed', true), newKey: true }
  if (slug === 'validation-failed') {
    const errors = (error.body as { errors?: Array<{ pointer?: unknown }> }).errors
    if (errors?.some((item) => item.pointer === '/pack')) return failed('ask_call_pack_off', false)
    // A project that isn't open (PRJ-8) is refused without a pointer; only its gate word tells archived from suspended.
    if (!errors?.length) {
      return failed(/suspended/.test(String(error.body.detail)) ? 'ask_call_suspended' : 'ask_call_archived', false)
    }
  }
  return failed('ask_call_failed', true)
}

/**
 * "Ask for a call" (PRD roles table: start a run): a Sky run now, over today's open windows (CAL-1), after a
 * confirmation, since it spends a model run. The run reads the live inputs like a scheduled one; its bundle reaches
 * the overview through the bundle stream, whose `bundle.drafted` count arrives as `drafted`. One ask holds one
 * Idempotency-Key, so Try again never starts a second run.
 */
export function AskForCall({
  org,
  projectId,
  drafted = 0,
  locale
}: {
  org: string
  projectId: string
  /** How many `bundle.drafted` events the overview's stream has seen. */
  drafted?: number
  locale: Locale
}) {
  const [state, setState] = useState<AskState>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const key = useRef<string | null>(null)
  const draftedAtAsk = useRef(drafted)

  async function send() {
    key.current ??= globalThis.crypto.randomUUID()
    setState({ kind: 'asking' })
    try {
      await overviewApi('createRun', {
        org,
        params: { id: projectId },
        body: { pack: 'sky' },
        idempotencyKey: key.current
      })
      setState({ kind: 'asked' })
    } catch (error) {
      const next = refusal(error, locale)
      if (next.kind === 'failed' && next.newKey) key.current = null
      setState(next)
    }
  }

  function confirm() {
    setConfirming(false)
    // A new ask: a new key, and only bundles drafted from here on answer it.
    key.current = null
    draftedAtAsk.current = drafted
    void send()
  }

  useEffect(() => {
    if (state.kind === 'asked' && drafted > draftedAtAsk.current) setState({ kind: 'drafted' })
  }, [drafted, state.kind])

  useEffect(() => {
    if (state.kind !== 'asked') return
    const timer = setTimeout(() => setState({ kind: 'no-draft' }), ASK_WAIT_MS)
    return () => clearTimeout(timer)
  }, [state.kind])

  const busy = state.kind === 'asking' || state.kind === 'asked'
  const label =
    state.kind === 'asking' ? 'overview.ask_call_pending' : state.kind === 'asked' ? 'overview.ask_call_asked' : null
  const sentence =
    state.kind === 'asked'
      ? t('overview.ask_call_done', {}, locale)
      : state.kind === 'drafted'
        ? t('overview.ask_call_drafted', {}, locale)
        : state.kind === 'no-draft'
          ? t('overview.ask_call_no_draft', {}, locale)
          : state.kind === 'failed'
            ? state.sentence
            : state.kind === 'unavailable'
              ? t('overview.ask_call_unavailable', {}, locale)
              : ''

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {state.kind !== 'unavailable' && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={busy} />}>
            {t(label ?? 'overview.ask_call', {}, locale)}
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] break-words sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('overview.ask_call_confirm_title', {}, locale)}</AlertDialogTitle>
              <AlertDialogDescription>{t('overview.ask_call_confirm_body', {}, locale)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11">{t('overview.ask_call_cancel', {}, locale)}</AlertDialogCancel>
              <AlertDialogAction className="min-h-11" onClick={confirm}>
                {t('overview.ask_call_confirm', {}, locale)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <span role="status" className="type-small text-muted-foreground">
        {sentence}
      </span>
      {state.kind === 'failed' && state.retry && (
        <Button type="button" variant="link" onClick={() => void send()}>
          {t('overview.ask_call_retry', {}, locale)}
        </Button>
      )}
    </span>
  )
}
