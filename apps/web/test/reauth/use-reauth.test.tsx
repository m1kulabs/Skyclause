// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { ReauthDialog } from '../../features/reauth/reauth-dialog'
import { useReauth } from '../../features/reauth/use-reauth'

const startAuthentication = vi.hoisted(() => vi.fn())
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  startAuthentication.mockReset()
})

function Harness({ request }: { request: (key: string) => Promise<unknown> }) {
  const { withReauth } = useReauth()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState('')

  async function run() {
    try {
      await withReauth(request, () => setOpen(true))
      setResult('completed')
    } catch (error) {
      setResult(error instanceof Error ? error.name : 'failed')
    }
  }

  return (
    <>
      <button aria-label="Run protected write" onClick={() => void run()} />
      <output>{result}</output>
      <ReauthDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function protectedWrite() {
  return async (idempotencyKey: string) => {
    const response = await fetch('/protected-write', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey }
    })
    if (!response.ok) throw new ApiProblem(response.status, await response.json())
    return response.json()
  }
}

test('a reauth-required write waits for passkey verification and retries with the same idempotency key', async () => {
  const writeKeys: string[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/protected-write') {
      writeKeys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '')
      return writeKeys.length === 1
        ? Response.json({ type: 'https://skyclause.m1ku.tech/problems/reauth-required' }, { status: 401 })
        : Response.json({ ok: true })
    }
    if (url.endsWith('/step-up')) return Response.json({ fresh_until: '2000-01-01T00:00:00.000Z', passkey: true })
    if (url.endsWith('/passkey/options')) return Response.json({ options: { challenge: 'test' } })
    if (url.endsWith('/passkey/verify')) return Response.json({ fresh_until: '2099-01-01T00:00:00.000Z' })
    throw new Error(`Unexpected request ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  startAuthentication.mockResolvedValue({ id: 'test-credential' })

  render(<Harness request={protectedWrite()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Run protected write' }))

  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(writeKeys).toHaveLength(1)
  fireEvent.click(await screen.findByRole('button', { name: 'Use passkey' }))

  expect(await screen.findByText('completed')).toBeVisible()
  expect(writeKeys).toHaveLength(2)
  expect(writeKeys[1]).toBe(writeKeys[0])
})

test('cancel returns focus and does not retry the protected write', async () => {
  let writes = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/protected-write') {
      writes += 1
      return Response.json({ type: 'reauth-required' }, { status: 401 })
    }
    if (url.endsWith('/step-up')) return Response.json({ fresh_until: '2000-01-01T00:00:00.000Z', passkey: false })
    throw new Error(`Unexpected request ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  render(<Harness request={protectedWrite()} />)
  const trigger = screen.getByRole('button', { name: 'Run protected write' })
  trigger.focus()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)

  expect(await screen.findByRole('dialog')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(await screen.findByText('ReauthCancelledError')).toBeVisible()
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(writes).toBe(1)
})
