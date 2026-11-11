// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createApiFetch } from '../../lib/api-fetch'
import { apiFetch, bundleOperations } from '../../features/bundles/operations'
import { useBundleReview } from '../../features/bundles/use-bundle-review'
import { completeStepUp } from '../../features/step-up/flow'

vi.mock('../../lib/read-sse', () => ({ readSse: vi.fn() }))
vi.mock('../../features/bundles/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/bundles/operations')>()
  return { ...actual, apiFetch: vi.fn() }
})

const call = {
  id: 'call',
  bundle_id: 'bundle',
  window_id: 'window',
  night_id: null,
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  fired: [],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: '',
  state: 'drafted',
  shadow: {
    scope: { kind: 'window', id: 'window' },
    pack: 'sky',
    mode: 'normal',
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null
  },
  chosen: 'agent',
  agrees: true,
  decision: null,
  expires_at: '2099-11-02T07:30:00Z',
  triggered_at: '2026-11-02T07:05:00Z',
  drafted_at: '2026-11-02T07:06:00Z',
  approved_at: null,
  sent_at: null,
  superseded_by_call_id: null,
  ics_uid: 'call',
  ics_sequence: 0
} as const

const bundle = {
  id: 'bundle',
  project_id: 'project',
  run_id: 'run',
  pack: 'sky',
  state: 'needs_review',
  superseded_by: null,
  review_hash: 'initial-review',
  sla_due_at: null,
  needs_review_at: null,
  approved_by: null,
  escalation_level: 0,
  draft_only: false,
  calls: [call]
} as const

afterEach(() => vi.unstubAllGlobals())

test('approval sends a fresh idempotency key and reuses it after re-auth', async () => {
  const requests: RequestInit[] = []
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {})
    if (requests.length === 1)
      return Response.json(
        {
          type: 'https://api.example.test/problems/reauth-required',
          title: 'Recent authentication required',
          status: 401,
          detail: 'Authenticate again.',
          instance: '/api/bundles/bundle/approve'
        },
        { status: 401 }
      )
    if (requests.length === 2)
      return Response.json(
        {
          type: 'https://api.example.test/problems/inputs-changed',
          title: 'Inputs changed',
          status: 409,
          detail: 'Review the changed inputs.',
          instance: '/api/bundles/bundle/approve',
          review_hash: 'updated-review'
        },
        { status: 409 }
      )
    return Response.json({ ...bundle, state: 'approved', calls: [{ ...call, state: 'approved' }] })
  })
  vi.stubGlobal('fetch', fetchMock)
  let nextKey = 0
  vi.stubGlobal('crypto', { randomUUID: () => `approval-attempt-${++nextKey}` })

  const responses: Record<string, unknown> = {
    getBundle: bundle,
    getCall: call,
    getCallExplanation: {},
    getRun: {},
    getProjectStrip: {},
    getMyPreferences: { shortcuts: true },
    listMyMemberships: { data: [{ org_slug: 'org', role: 'approver' }], next_cursor: null }
  }
  const approvalTransport = createApiFetch(bundleOperations)
  const appFetch = vi.mocked(apiFetch)
  const stubApiFetch: typeof apiFetch = async (operation, options) => {
    if (operation === 'approveBundle') return approvalTransport(operation, options)
    return responses[operation] as never
  }
  appFetch.mockImplementation(stubApiFetch)

  const { result, unmount } = renderHook(() => useBundleReview('bundle', 'org'))
  await waitFor(() => expect(result.current.data?.bundle.id).toBe('bundle'))

  let approval: Promise<void> | undefined
  await act(async () => {
    approval = result.current.approve()
  })
  await waitFor(() => expect(result.current.reauth).toBeDefined())

  await act(async () => {
    completeStepUp()
    await approval
  })
  expect(result.current.conflict?.review_hash).toBe('updated-review')

  await act(async () => result.current.approve(true))
  expect(result.current.data?.bundle.state).toBe('approved')

  expect(requests.map((request) => new Headers(request.headers).get('Idempotency-Key'))).toEqual([
    'approval-attempt-1',
    'approval-attempt-1',
    'approval-attempt-2'
  ])
  unmount()
})
