'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiProblem } from '../../lib/api-fetch'
import { readSse } from '../../lib/read-sse'
import {
  apiFetch,
  approvalConflict,
  bundleStream,
  type ApprovalBody,
  type BundleView,
  type CallDetail,
  type Conflict,
  type RunDetail,
  type StripDetail
} from './operations'
import { approves, canReviewCall, decisionsFor, teachingLineIncluded, type Decisions } from './model'
import { t, type Locale } from './i18n'
import { useReauth } from '../reauth'
import { cancelStepUp, ReauthCancelledError } from '../step-up/flow'
import type { BundleList } from './use-project-bundles'

export interface ReviewData {
  bundle: BundleView
  calls: CallDetail[]
  run?: RunDetail
  strip?: StripDetail
  shortcuts: boolean
  canApprove: boolean
  errors: string[]
}

/** The page's server read of the review (#372) and the instant it rendered, so hydration renders the same markup. */
export interface InitialReview {
  data: ReviewData
  now: number
  /** The project's bundles as the server read them, for the list beside the review. */
  list?: BundleList
}

export function useBundleReview(
  bundleId: string,
  org: string,
  initial?: InitialReview,
  /** Called on every bundle event of the project, this bundle's or another's, so the list can read again. */
  onProjectEvent?: () => void,
  locale: Locale = 'en'
) {
  const projectEvent = useRef(onProjectEvent)
  useEffect(() => {
    projectEvent.current = onProjectEvent
  })
  const [data, setData] = useState(initial?.data)
  const [loadError, setLoadError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [decisions, setDecisions] = useState<Decisions>({})
  const [pending, setPending] = useState(false)
  const [conflict, setConflict] = useState<Conflict>()
  const [error, setError] = useState<{ message: string; callIds: string[] }>()
  const [reauth, setReauth] = useState<ApprovalBody>()
  const [now, setNow] = useState(() => initial?.now ?? Date.now())
  const { withReauth } = useReauth()
  const clearReauth = useCallback(() => {
    setReauth(undefined)
    cancelStepUp()
  }, [])
  const locked = useRef(false)
  const terminal = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    terminal.current = false
    locked.current = false
    // The server's read of this bundle stays on screen while the client reads it again (#372); a retry starts blank.
    setData((current) => (revision === 0 && current?.bundle.id === bundleId ? current : undefined))
    setLoadError(false)
    setDecisions({})
    setConflict(undefined)
    setError(undefined)
    clearReauth()
    setPending(false)
    const signal = controller.signal
    async function load() {
      try {
        const bundle = await apiFetch('getBundle', { params: { id: bundleId }, signal })
        const errors: string[] = []
        async function read<T>(operation: string, task: Promise<T>): Promise<T | undefined> {
          try {
            return await task
          } catch {
            errors.push(
              t('bundles.read_error', { operation: t(`bundles.operations.${operation}`, {}, locale) }, locale)
            )
          }
        }
        async function readRole() {
          let cursor: string | undefined
          const seen = new Set<string>()
          do {
            const page = await apiFetch('listMyMemberships', { query: { cursor }, signal })
            const membership = page.data.find((item) => item.org_slug === org)
            if (membership) return approves(membership.role)
            cursor = page.next_cursor ?? undefined
            if (cursor && seen.has(cursor)) throw new Error('Repeated membership cursor')
            if (cursor) seen.add(cursor)
          } while (cursor)
          return false
        }
        const [run, strip, preferences, canApprove, calls] = await Promise.all([
          read('getRun', apiFetch('getRun', { params: { id: bundle.run_id }, signal })),
          read('getProjectStrip', apiFetch('getProjectStrip', { params: { id: bundle.project_id }, signal })),
          read('getMyPreferences', apiFetch('getMyPreferences', { signal })),
          read('listMyMemberships', readRole()),
          Promise.all(
            bundle.calls.map(async (item) => {
              const [call, explanation] = await Promise.all([
                read('getCall', apiFetch('getCall', { params: { id: item.id }, signal })),
                read('getCallExplanation', apiFetch('getCallExplanation', { params: { id: item.id }, signal }))
              ])
              return call && explanation ? { ...call, ...explanation } : undefined
            })
          )
        ])
        if (!signal.aborted)
          setData({
            bundle,
            run,
            strip,
            shortcuts: preferences?.shortcuts ?? true,
            canApprove: canApprove === true,
            calls: calls.filter((call): call is CallDetail => !!call),
            errors
          })
      } catch {
        if (!signal.aborted) {
          setData(undefined)
          setLoadError(true)
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [bundleId, org, revision, clearReauth, locale])

  const projectId = data?.bundle.project_id
  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    const path = bundleStream.path.replace('{id}', encodeURIComponent(projectId))
    const url = process.env.NEXT_PUBLIC_API_ORIGIN ? new URL(path, process.env.NEXT_PUBLIC_API_ORIGIN) : path
    void readSse(url, {
      signal: controller.signal,
      headers: { 'Skyclause-Organization': org },
      onEvent(event) {
        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          return
        }
        const parsed = bundleStream.responses[200].content['text/event-stream'].schema.safeParse(raw)
        if (parsed.success) projectEvent.current?.()
        if (!parsed.success || parsed.data.data.bundle_id !== bundleId) return
        const bundleEvent = parsed.data
        if (!['bundle.superseded', 'bundle.expired', 'bundle.approved'].includes(bundleEvent.type)) return
        terminal.current = true
        setConflict(undefined)
        clearReauth()
        setData((current) => {
          if (!current) return current
          const state =
            bundleEvent.type === 'bundle.superseded'
              ? 'superseded'
              : bundleEvent.type === 'bundle.expired'
                ? 'expired'
                : 'approved'
          return {
            ...current,
            bundle: { ...current.bundle, state },
            calls: current.calls.map((call) => ({ ...call, state }))
          }
        })
        // The thin event has no successor ID. Read it after disabling actions immediately.
        if (bundleEvent.type === 'bundle.superseded') {
          void apiFetch('getBundle', { params: { id: bundleId }, signal: controller.signal })
            .then((bundle) => {
              if (!controller.signal.aborted)
                setData((current) => (current ? { ...current, bundle: { ...bundle, state: 'superseded' } } : current))
            })
            .catch(() => undefined)
        }
        // Nor which calls were sent or when: read the bundle again so the page says what approving did.
        if (bundleEvent.type === 'bundle.approved') {
          void apiFetch('getBundle', { params: { id: bundleId }, signal: controller.signal })
            .then((bundle) => {
              if (!controller.signal.aborted)
                setData((current) =>
                  current
                    ? {
                        ...current,
                        bundle: { ...current.bundle, ...bundle },
                        calls: current.calls.map((call) => ({
                          ...call,
                          ...bundle.calls.find((item) => item.id === call.id)
                        }))
                      }
                    : current
                )
            })
            .catch(() => undefined)
        }
      }
    })
    return () => controller.abort()
  }, [projectId, bundleId, org, revision, clearReauth])

  const visible = data?.bundle.id === bundleId ? data : undefined
  const editable =
    !!visible &&
    visible.canApprove &&
    !visible.bundle.draft_only &&
    ['needs_review', 'reconfirm'].includes(visible.bundle.state) &&
    !terminal.current
  const reviewable = visible?.calls.filter((call) => canReviewCall(call, now)) ?? []
  const missingChoice = reviewable.some(
    (call) => !call.agrees && decisions[call.id]?.action !== 'reject' && !decisions[call.id]?.chosen
  )
  const includesTeachingLine = reviewable.some((call) => teachingLineIncluded(call, decisions[call.id] ?? {}))
  const blocked = !editable || !reviewable.length || !!visible?.errors.length || missingChoice || includesTeachingLine

  async function send(body: ApprovalBody) {
    if (locked.current || terminal.current || blocked) return
    locked.current = true
    const currentGeneration = generation.current
    setPending(true)
    setError(undefined)
    try {
      const result = await withReauth(
        (idempotencyKey) =>
          apiFetch('approveBundle', {
            params: { id: bundleId },
            body,
            headers: { 'Idempotency-Key': idempotencyKey }
          }),
        () => setReauth(body)
      )
      if (currentGeneration !== generation.current || terminal.current) return
      terminal.current = true
      setData((current) =>
        current
          ? {
              ...current,
              bundle: { ...current.bundle, ...result },
              calls: current.calls.map((call) => ({ ...call, ...result.calls.find((item) => item.id === call.id) }))
            }
          : current
      )
      setConflict(undefined)
      clearReauth()
    } catch (failure) {
      if (currentGeneration !== generation.current || terminal.current) return
      if (failure instanceof ReauthCancelledError) {
        clearReauth()
        return
      }
      const problem = failure instanceof ApiProblem ? failure : undefined
      const code = problem?.body.type?.split('/').pop()
      if (problem?.status === 409 && code === 'inputs-changed') {
        const parsed = approvalConflict.safeParse(problem.body)
        if (parsed.success && parsed.data.review_hash) {
          setConflict(parsed.data)
          return
        }
      }
      if (problem?.status === 409 && code === 'bundle-superseded') {
        terminal.current = true
        const successor = problem.body.superseded_by_call_id
        setData((current) =>
          current
            ? {
                ...current,
                bundle: { ...current.bundle, state: 'superseded' },
                calls: current.calls.map((call) => ({
                  ...call,
                  superseded_by_call_id: typeof successor === 'string' ? successor : call.superseded_by_call_id
                }))
              }
            : current
        )
        setConflict(undefined)
        return
      }
      const recognized = ['validation-failed', 'malay-reader-required', 'redraft-required', 'call-expired'].includes(
        code ?? ''
      )
      const message = recognized ? t(`bundles.${code}`, {}, locale) : t('bundles.write_error', {}, locale)
      const callId = problem?.body.call_id
      setError({
        message: problem?.body.detail ? `${message} ${problem.body.detail}` : message,
        callIds: typeof callId === 'string' ? [callId] : body.calls.map((call) => call.call_id)
      })
      if (code === 'call-expired') {
        setConflict(undefined)
        terminal.current = true
      }
    } finally {
      if (currentGeneration === generation.current) {
        locked.current = false
        setPending(false)
      }
    }
  }

  async function approve(reconfirm = false) {
    if (!visible || blocked || pending || (conflict && !reconfirm)) return
    const calls = decisionsFor(visible.calls, decisions, Date.now())
    if (!calls.length) return
    await send({
      review_hash: reconfirm && conflict?.review_hash ? conflict.review_hash : visible.bundle.review_hash,
      reconfirm,
      calls
    })
  }

  return {
    data: visible,
    loadError,
    decisions,
    setDecisions,
    pending,
    conflict,
    setConflict,
    error,
    reauth,
    setReauth: clearReauth,
    now,
    editable,
    blocked,
    missingChoice,
    includesTeachingLine,
    approve,
    retry: () => setRevision((value) => value + 1)
  }
}
