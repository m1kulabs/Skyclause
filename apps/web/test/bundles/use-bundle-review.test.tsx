// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { BundleView } from '../../features/bundles/operations'
import { apiFetch } from '../../features/bundles/operations'
import { useBundleReview, type ReviewData } from '../../features/bundles/use-bundle-review'

vi.mock('../../lib/read-sse', () => ({ readSse: () => new Promise(() => {}) }))
vi.mock('../../features/bundles/operations', async (original) => ({
  ...(await original<typeof import('../../features/bundles/operations')>()),
  apiFetch: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
})

// HTTP test doubles of getBundle's answer, never application data.
const bundle: BundleView = {
  id: 'test-bundle',
  project_id: 'test-project',
  run_id: 'test-run',
  pack: 'sky',
  state: 'needs_review',
  superseded_by: null,
  review_hash: 'test-review-one',
  sla_due_at: '2026-11-02T07:15:00Z',
  needs_review_at: '2026-11-02T07:06:00Z',
  approved_by: null,
  escalation_level: 0,
  draft_only: false,
  calls: [],
  trigger: 'crossing',
  triggered_at: '2026-11-02T07:05:00Z',
  sheet_version_id: 'test-sheet',
  alerts: []
}
const server: ReviewData = { bundle, calls: [], shortcuts: true, canApprove: true, errors: [] }
const initial = { data: server, now: Date.parse('2026-11-02T07:07:00Z') }

/** Answers each read like the API, holding getBundle until the test lets it go. */
function answer(getBundle: Promise<BundleView>) {
  vi.mocked(apiFetch).mockImplementation(((operation: string) => {
    if (operation === 'getBundle') return getBundle
    if (operation === 'listMyMemberships')
      return Promise.resolve({
        data: [
          {
            id: 'test-membership',
            org_id: 'test-org-id',
            account_id: 'test-account',
            role: 'approver',
            reads_malay: true,
            org_name: 'Test organisation',
            org_slug: 'test-org'
          }
        ],
        next_cursor: null
      })
    return Promise.reject(new Error(`no ${operation} double`))
  }) as typeof apiFetch)
}

test('#372 the server’s read stays on screen while the client reads the bundle again, then the client’s read shows', async () => {
  let release!: (value: BundleView) => void
  answer(new Promise((resolve) => (release = resolve)))
  const { result } = renderHook(() => useBundleReview('test-bundle', 'test-org', initial))
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('getBundle', expect.anything()))
  expect(result.current.data).toBe(server)
  expect(result.current.now).toBe(initial.now)
  await act(async () => release({ ...bundle, review_hash: 'test-review-two' }))
  await waitFor(() => expect(result.current.data?.bundle.review_hash).toBe('test-review-two'))
  expect(result.current.loadError).toBe(false)
})

test('#372 a failed client read shows the load error, not the server’s copy', async () => {
  answer(Promise.reject(new Error('Test network failure')))
  const { result } = renderHook(() => useBundleReview('test-bundle', 'test-org', initial))
  await waitFor(() => expect(result.current.loadError).toBe(true))
  expect(result.current.data).toBeUndefined()
})
