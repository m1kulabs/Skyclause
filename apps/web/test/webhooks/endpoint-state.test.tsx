// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { formatDateTime } from '@skyclause/i18n/format'
import type { WebhookEventType } from '@skyclause/contracts'
import { EndpointState } from '../../features/webhooks/endpoint'

const base = {
  id: 'endpoint-1',
  url: 'https://receiver.example.test/hooks',
  events: ['call.sent' as WebhookEventType],
  project_ids: [] as string[],
  last_delivery_at: null
}

const apiFetchMock = vi.hoisted(() =>
  vi.fn(async () => ({ ...base, status: 'verified', verified_at: '2026-11-06T01:00:00Z' }))
)

vi.mock('../../features/webhooks/operations', async (original) => {
  const actual = await original<typeof import('../../features/webhooks/operations')>()
  return { ...actual, apiFetch: apiFetchMock }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test.each([
  [
    'pending',
    { ...base, status: 'pending', verified_at: null, disabled_at: null },
    'Waiting for your endpoint to echo the challenge…'
  ],
  [
    'failed',
    { ...base, status: 'failed', verified_at: null, disabled_at: null },
    'Your endpoint must answer 200 with the challenge in the body within 10 seconds'
  ],
  [
    'verified',
    { ...base, status: 'verified', verified_at: '2026-11-06T01:00:00Z', disabled_at: null },
    `Verified ${formatDateTime('2026-11-06T01:00:00Z', 'en')}`
  ],
  [
    'disabled',
    { ...base, status: 'disabled', verified_at: null, disabled_at: '2026-11-06T01:00:00Z' },
    `Disabled ${formatDateTime('2026-11-06T01:00:00Z', 'en')} after 24 hours of failures`
  ]
] as const)('%s renders its copy with Verify again', async (_status, endpoint, copy) => {
  const update = vi.fn()
  render(<EndpointState endpoint={endpoint} org="test-org" update={update} />)
  expect(screen.getByText(copy, { exact: true })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Verify again' }))
  await waitFor(() =>
    expect(apiFetchMock).toHaveBeenCalledWith('verifyWebhook', { org: 'test-org', params: { id: 'endpoint-1' } })
  )
  await waitFor(() => expect(update).toHaveBeenCalled())
})
