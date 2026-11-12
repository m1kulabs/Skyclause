// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import axe from 'axe-core'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DeviceApproval } from '../../features/device/device-approval'
import { normalizeDeviceCode, parseCliUserAgent } from '../../features/device/model'

const request = vi.hoisted(() => vi.fn())

beforeEach(() => {
  request.mockReset()
  vi.stubGlobal('fetch', request)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const response = (body: unknown, ok = true) => ({ ok, json: async () => body })

test('the D36 user agent gives the device name and mapped OS; missing and malformed values stay unknown', () => {
  expect(parseCliUserAgent('skyclause-cli/1.0.0 (darwin; Work laptop)')).toEqual({ name: 'Work laptop', os: 'macos' })
  expect(parseCliUserAgent('skyclause-cli/1.0.0 (linux; Build host)')).toEqual({ name: 'Build host', os: 'linux' })
  expect(parseCliUserAgent('skyclause-cli/1.0.0 (win32; Desk PC)')).toEqual({ name: 'Desk PC', os: 'windows' })
  expect(parseCliUserAgent(null)).toEqual({ name: 'Unknown device', os: 'unknown' })
  expect(parseCliUserAgent('curl/8.0')).toEqual({ name: 'Unknown device', os: 'unknown' })
  expect(normalizeDeviceCode('ab-cd 2345')).toBe('ABCD2345')
})

test('the code field supports paste and the approval actions have equal weight and useful focus order', async () => {
  request.mockResolvedValue(response({ status: 'pending', client_id: 'skyclause-cli', scope: '' }))
  const { container } = render(
    <DeviceApproval
      code="ABCD2345"
      initialState="ready"
      device={{ name: 'Work laptop', os: 'macos' }}
      memberships={[{ organization: 'Northstar', role: 'admin' }]}
    />
  )
  const code = screen.getByRole('textbox', { name: 'Device code' })
  expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  expect(code).toHaveAttribute('spellcheck', 'false')
  expect(code).toHaveAttribute('name', 'user_code')
  expect(screen.queryByLabelText(/password/i)).toBeNull()
  fireEvent.paste(code, { clipboardData: { getData: () => 'abcd-2345' } })
  fireEvent.change(code, { target: { value: 'abcd-2345' } })

  expect(await screen.findByText('Work laptop')).toBeInTheDocument()
  expect(screen.getByText('macOS')).toBeInTheDocument()
  expect(screen.getByText('Signs in as you, with your roles in each organisation')).toBeInTheDocument()
  expect(screen.getByText('Northstar')).toBeInTheDocument()
  expect(screen.getByText('admin')).toBeInTheDocument()
  const confirm = screen.getByRole('button', { name: 'Confirm' })
  const deny = screen.getByRole('button', { name: 'Deny' })
  expect(confirm.className).toBe(deny.className)
  expect(
    [...container.querySelectorAll('input, button')].map(
      (control) => control.getAttribute('name') ?? control.textContent
    )
  ).toEqual(['user_code', 'Continue', 'Confirm', 'Deny'])

  const result = await axe.run(container)
  expect(result.violations).toEqual([])
})

test('the approval page labels a missing device user agent as unknown', async () => {
  request.mockResolvedValue(response({ status: 'pending', client_id: 'skyclause-cli', scope: '' }))
  render(<DeviceApproval code="ABCD2345" initialState="ready" device={parseCliUserAgent(null)} memberships={[]} />)
  expect(await screen.findByText('Unknown device')).toBeInTheDocument()
  expect(screen.getByText('Unknown', { selector: 'dd' })).toBeInTheDocument()
})

test('confirmation and denial each produce their named terminal state', async () => {
  request
    .mockResolvedValueOnce(response({ status: 'pending', client_id: 'skyclause-cli', scope: '' }))
    .mockResolvedValueOnce(response({ success: true }))
  const { unmount } = render(
    <DeviceApproval
      code="ABCD2345"
      initialState="ready"
      device={{ name: 'Unknown device', os: 'unknown' }}
      memberships={[]}
    />
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Device connected. You can close this page.')
  )
  expect(request).toHaveBeenLastCalledWith('/api/auth/device/approve', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: 'ABCD2345' })
  })
  unmount()

  request
    .mockResolvedValueOnce(response({ status: 'pending', client_id: 'skyclause-cli', scope: '' }))
    .mockResolvedValueOnce(response({ success: true }))
  render(
    <DeviceApproval
      code="ZXCV2345"
      initialState="ready"
      device={{ name: 'Unknown device', os: 'unknown' }}
      memberships={[]}
    />
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Deny' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Device denied.'))
  expect(request).toHaveBeenLastCalledWith('/api/auth/device/deny', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: 'ZXCV2345' })
  })
})

test('expired and unknown code messages match the login recovery instructions', () => {
  const expired = render(
    <DeviceApproval
      code="ABCD2345"
      initialState="expired"
      device={{ name: 'Unknown device', os: 'unknown' }}
      memberships={[]}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('This code has expired. Run `skyclause login` again.')
  expired.unmount()
  render(
    <DeviceApproval
      code="ABCD2345"
      initialState="unknown"
      device={{ name: 'Unknown device', os: 'unknown' }}
      memberships={[]}
    />
  )
  expect(screen.getByRole('status')).toHaveTextContent('This code is not recognised. Check it and try again.')
})

test('the approval says what is granted and to whom before it asks, in the visitor’s language', async () => {
  request.mockResolvedValue(response({ status: 'pending', client_id: 'skyclause-cli', scope: '' }))
  render(
    <DeviceApproval
      code="ABCD2345"
      initialState="ready"
      device={{ name: 'Work laptop', os: 'linux' }}
      memberships={[{ organization: 'Northstar', role: 'approver' }]}
      locale="ms"
    />
  )

  expect(await screen.findByRole('heading', { level: 1, name: 'Sambungkan Skyclause CLI' })).toBeInTheDocument()
  const grant = screen.getByRole('region', {
    name: 'Log masuk sebagai anda, dengan peranan anda dalam setiap organisasi'
  })
  expect(grant).toHaveTextContent('Work laptop')
  expect(grant).toHaveTextContent('Linux')
  expect(grant).toHaveTextContent('Northstarapprover')
  expect(grant).toHaveTextContent('Sahkan hanya jika anda baru sahaja menjalankan skyclause login')
  expect(document.querySelector('main')).toHaveAttribute('lang', 'ms')
})
