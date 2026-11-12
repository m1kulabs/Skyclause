// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Subscriber } from '@skyclause/contracts'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'

const apiFetch = vi.fn()
vi.mock('../../features/subscribe/operations', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const { SubscriptionForm } = await import('../../features/subscribe/subscription-form')
const { operationError } = await import('../../features/subscribe/error')
const { t } = await import('../../features/subscribe/catalogue')

const subscriber: Subscriber = {
  id: 'subscriber-id',
  project_id: 'project-id',
  email: 'reader@example.test',
  role: 'Commuter',
  window_ids: ['window-id'],
  channels: ['email'],
  language: 'en',
  confirmed_at: '2026-11-01T01:00:00Z'
} as Subscriber
const page = (withSubscriber: boolean) => ({
  project: { id: 'project-id', slug: 'bukit-jalil', org_slug: 'commons' },
  project_name: 'Bukit Jalil',
  windows: [
    {
      id: 'window-id',
      title: 'Release wave',
      starts_at: '2026-11-10T01:00:00Z',
      ends_at: '2026-11-10T02:00:00Z',
      kind: 'class',
      tz: 'Asia/Kuala_Lumpur'
    }
  ],
  subscriber: withSubscriber ? subscriber : null,
  privacy_notice_version: '2026-11-06'
})

beforeEach(() => {
  apiFetch.mockReset()
})
afterEach(cleanup)

test('a preference save keeps every field enabled and focus on the control that was changed', async () => {
  let release: (value: Subscriber) => void = () => undefined
  apiFetch.mockImplementation((operation: string) =>
    operation === 'getSubscription'
      ? Promise.resolve(page(true))
      : new Promise<Subscriber>((resolve) => {
          release = resolve
        })
  )
  render(<SubscriptionForm token="token" locale="en" />)
  const ics = await screen.findByRole('checkbox', { name: t('subscribe.ics_channel', {}, 'en') })
  ics.focus()
  fireEvent.click(ics)
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('updateSubscription', expect.anything()))
  expect(document.querySelector('fieldset:disabled')).toBeNull()
  expect(ics).not.toBeDisabled()
  expect(document.activeElement).toBe(ics)
  await act(async () => release({ ...subscriber, channels: ['email', 'ics'] }))
  expect(document.activeElement).toBe(ics)
})

test('an empty or malformed email is not saved and says why beside the field', async () => {
  apiFetch.mockImplementation(() => Promise.resolve(page(true)))
  render(<SubscriptionForm token="token" locale="en" />)
  const email = await screen.findByRole('textbox', { name: t('subscribe.email', {}, 'en') })
  fireEvent.change(email, { target: { value: 'not-an-address' } })
  fireEvent.blur(email)
  const message = t('subscribe.email_invalid', {}, 'en')
  expect(await screen.findByText(message)).toBeTruthy()
  expect(email).toHaveAttribute('aria-invalid', 'true')
  const described = email.getAttribute('aria-describedby')!
  expect(document.getElementById(described)?.textContent).toBe(message)
  expect(document.getElementById(described)).toHaveAttribute('role', 'alert')

  fireEvent.change(email, { target: { value: '' } })
  fireEvent.blur(email)
  expect(await screen.findByText(t('subscribe.email_required', {}, 'en'))).toBeTruthy()
  expect(apiFetch).not.toHaveBeenCalledWith('updateSubscription', expect.anything())

  const role = screen.getByRole('textbox', { name: t('subscribe.role', {}, 'en') })
  fireEvent.change(role, { target: { value: '  ' } })
  fireEvent.blur(role)
  expect(await screen.findByText(t('subscribe.role_required', {}, 'en'))).toBeTruthy()
  expect(role).toHaveAttribute('aria-invalid', 'true')
  expect(apiFetch).not.toHaveBeenCalledWith('updateSubscription', expect.anything())
})

test('join stays pressable before consent and then names the missing box', async () => {
  apiFetch.mockImplementation(() => Promise.resolve(page(false)))
  render(<SubscriptionForm token="token" locale="ms" />)
  const submit = await screen.findByRole('button', { name: t('subscribe.subscribe', {}, 'ms') })
  expect(submit).not.toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: t('subscribe.email', {}, 'ms') }), {
    target: { value: 'reader@example.test' }
  })
  fireEvent.change(screen.getByRole('textbox', { name: t('subscribe.role', {}, 'ms') }), {
    target: { value: 'Pelajar' }
  })
  fireEvent.click(submit)
  const consent = screen.getByRole('checkbox', { name: t('subscribe.consent', {}, 'ms') })
  expect(await screen.findByText(t('subscribe.consent_required', {}, 'ms'))).toBeTruthy()
  expect(consent).toHaveAttribute('aria-invalid', 'true')
  expect(apiFetch).not.toHaveBeenCalledWith('createSubscription', expect.anything())
})

test('after unsubscribing, focus lands on the result and the way back is said in words', async () => {
  apiFetch.mockImplementation((operation: string) =>
    operation === 'getSubscription' ? Promise.resolve(page(true)) : Promise.resolve(undefined)
  )
  render(<SubscriptionForm token="token" locale="en" />)
  fireEvent.click(await screen.findByRole('button', { name: t('subscribe.unsubscribe', {}, 'en') }))
  const result = (await screen.findByText(t('subscribe.unsubscribed', {}, 'en'))).closest('[role="status"]')!
  await waitFor(() => expect(document.activeElement).toBe(result))
  expect(screen.getByText(t('subscribe.resubscribe', {}, 'en'))).toBeTruthy()
})

test('public subscribers never see an HTTP status, a problem slug or the server’s English title', () => {
  for (const locale of ['en', 'ms'] as const) {
    const unpublished = operationError(new ApiProblem(503, { type: 'privacy-notice-unpublished' }), locale)
    expect(unpublished).not.toMatch(/503|privacy-notice-unpublished/)
    expect(unpublished).toBe(t('subscribe.unpublished', {}, locale))
    const failed = operationError(new ApiProblem(500, { title: 'Internal Server Error', type: 'internal' }), locale)
    expect(failed).toBe(t('subscribe.failed', {}, locale))
    expect(failed).not.toMatch(/500|Internal/)
    expect(operationError(new ApiProblem(410, { type: 'token-expired' }), locale)).toBe(
      t('subscribe.link_expired', {}, locale)
    )
    expect(operationError(new TypeError('fetch failed'), locale)).toBe(t('subscribe.unavailable', {}, locale))
  }
})
