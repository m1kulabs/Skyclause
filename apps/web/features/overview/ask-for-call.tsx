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

/** How long an ask waits for an outcome before saying the bundle is still being drafted. */
export const ASK_WAIT_MS = 5 * 60_000
const RUN_POLL_FIRST_MS = 1_000
const RUN_POLL_INTERVAL_MS = 2_000
const RUN_POLL_ERROR_MIN_MS = 5_000

type AskState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'asked'; runId: string | null }
  | { kind: 'drafted' }
  | { kind: 'no-draft-budget' }
  | { kind: 'no-draft-validation' }
  | { kind: 'no-draft-other' }
  | { kind: 'run-failed' }
  | { kind: 'still-drafting' }
  // `retry` repeats the same ask; `newKey` when the key itself was refused. `unavailable` takes the control away.
  | { kind: 'failed'; sentence: string; retry: boolean; newKey?: boolean }
  | { kind: 'unavailable' }

const STATE_SENTENCE_KEY = {
  asked: 'overview.ask_call_done',
  drafted: 'overview.ask_call_drafted',
  'no-draft-budget': 'overview.ask_call_budget_no_time',
  'no-draft-validation': 'overview.ask_call_no_draft_validation',
  'no-draft-other': 'overview.ask_call_no_draft_other',
  'run-failed': 'overview.ask_call_run_failed',
  'still-drafting': 'overview.ask_call_still_drafting',
  unavailable: 'overview.ask_call_unavailable'
} as const

const NO_DRAFT_REASON_STATE = {
  budget: 'no-draft-budget',
  validation: 'no-draft-validation'
} as const

function runOutcomeState(status: 'drafted' | 'no_draft' | 'failed', reason: string | null): AskState {
  if (status === 'drafted') return { kind: 'drafted' }
  if (status === 'failed') return { kind: 'run-failed' }
  if (reason === 'budget' || reason === 'validation') {
    return { kind: NO_DRAFT_REASON_STATE[reason] }
  }
  return { kind: 'no-draft-other' }
}

function statusSentence(state: AskState, locale: Locale): string {
  if (state.kind === 'failed') return state.sentence
  if (state.kind === 'idle' || state.kind === 'asking') return ''
  return t(STATE_SENTENCE_KEY[state.kind], {}, locale)
}

function isQuietPollStop(error: unknown): boolean {
  return error instanceof ApiProblem && (error.status === 401 || error.status === 403 || error.status === 404)
}

function pollErrorDelayMs(error: unknown): number {
  if (!(error instanceof ApiProblem) || !error.retryAt) return RUN_POLL_ERROR_MIN_MS
  const retryAfterMs = Date.parse(error.retryAt) - Date.now()
  return Number.isFinite(retryAfterMs) ? Math.max(RUN_POLL_ERROR_MIN_MS, retryAfterMs) : RUN_POLL_ERROR_MIN_MS
}

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
 * confirmation, since it spends a model run. The run reads the live inputs like a scheduled one; the control polls
 * `getRun` until it ends and also watches the bundle stream's `bundle.drafted` count (`drafted`), whichever confirms
 * first. One ask holds one Idempotency-Key, so Try again never starts a second run.
 */
export function AskForCall({
  org,
  projectId,
  drafted = 0,
  onDrafted,
  locale
}: {
  org: string
  projectId: string
  /** How many `bundle.drafted` events the overview's stream has seen. */
  drafted?: number
  /** Called once when the asked run finishes with a drafted bundle. */
  onDrafted?: () => void
  locale: Locale
}) {
  const [state, setState] = useState<AskState>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const key = useRef<string | null>(null)
  const draftedAtAsk = useRef(drafted)
  const mounted = useRef(true)
  const outcomeResolved = useRef(false)
  const pollNowRef = useRef<(() => void) | null>(null)
  const pollStoppedRef = useRef(false)
  const onDraftedRef = useRef(onDrafted)

  useEffect(() => {
    onDraftedRef.current = onDrafted
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function send() {
    key.current ??= globalThis.crypto.randomUUID()
    setState({ kind: 'asking' })
    try {
      const run = await overviewApi('createRun', {
        org,
        params: { id: projectId },
        body: { pack: 'sky' },
        idempotencyKey: key.current
      })
      if (!mounted.current) return
      outcomeResolved.current = false
      pollStoppedRef.current = false
      setState({ kind: 'asked', runId: typeof run?.id === 'string' && run.id ? run.id : null })
    } catch (error) {
      if (!mounted.current) return
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

  const runId = state.kind === 'asked' ? state.runId : null

  useEffect(() => {
    if (state.kind !== 'asked') return
    const timer = setTimeout(() => {
      outcomeResolved.current = true
      setState({ kind: 'still-drafting' })
    }, ASK_WAIT_MS)
    return () => clearTimeout(timer)
  }, [state.kind])

  useEffect(() => {
    if (state.kind !== 'asked' || !runId) {
      pollNowRef.current = null
      return
    }
    let active = true
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let inFlight = false
    let repollQueued = false

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    }

    const schedule = (delayMs: number) => {
      if (!active) return
      clearTimer()
      timer = setTimeout(() => {
        timer = undefined
        void poll()
      }, delayMs)
    }

    async function poll() {
      if (!active || outcomeResolved.current) return
      inFlight = true
      try {
        const run = await overviewApi('getRun', {
          org,
          params: { id: runId! },
          signal: controller.signal
        })
        inFlight = false
        if (!active || outcomeResolved.current) return
        if (run.status === 'drafted' || run.status === 'no_draft' || run.status === 'failed') {
          outcomeResolved.current = true
          active = false
          pollNowRef.current = null
          setState(runOutcomeState(run.status, run.reason))
          if (run.status === 'drafted') onDraftedRef.current?.()
          return
        }
        if (repollQueued) {
          repollQueued = false
          void poll()
          return
        }
        schedule(RUN_POLL_INTERVAL_MS)
      } catch (error) {
        inFlight = false
        if (!active || controller.signal.aborted || outcomeResolved.current) return
        if (isQuietPollStop(error)) {
          active = false
          pollStoppedRef.current = true
          pollNowRef.current = null
          return
        }
        repollQueued = false
        schedule(pollErrorDelayMs(error))
      }
    }

    pollNowRef.current = () => {
      if (!active || outcomeResolved.current) return
      if (inFlight) {
        repollQueued = true
        return
      }
      clearTimer()
      void poll()
    }

    schedule(RUN_POLL_FIRST_MS)
    return () => {
      active = false
      pollNowRef.current = null
      clearTimer()
      controller.abort()
    }
  }, [state.kind, runId, org])

  // Two AskForCall controls share `drafted`: a control with a known runId polls its own run instead of assuming success.
  useEffect(() => {
    if (state.kind !== 'asked' || drafted <= draftedAtAsk.current) return
    draftedAtAsk.current = drafted
    if (!runId || pollStoppedRef.current) {
      outcomeResolved.current = true
      setState({ kind: 'drafted' })
      return
    }
    pollNowRef.current?.()
  }, [drafted, state.kind, runId])

  const busy = state.kind === 'asking' || state.kind === 'asked'
  const label =
    state.kind === 'asking' ? 'overview.ask_call_pending' : state.kind === 'asked' ? 'overview.ask_call_asked' : null
  const sentence = statusSentence(state, locale)

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
