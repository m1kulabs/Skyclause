// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { ASK_WAIT_MS, AskForCall } from '../../features/overview/ask-for-call'
import { overviewApi, overviewOperations } from '../../features/overview/operations'

vi.mock('../../features/overview/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/overview/operations')>()
  return { ...actual, overviewApi: vi.fn() }
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.mocked(overviewApi).mockReset()
  vi.useRealTimers()
})

const status = () => screen.getByRole('status').textContent

/** Fires a click and flushes pending microtasks, 0ms timers, and passive effects. */
async function clickAndFlush(target: HTMLElement) {
  await act(async () => {
    fireEvent.click(target)
    await vi.advanceTimersByTimeAsync(0)
  })
}

/** Opens the confirmation, presses Ask, and flushes the request and passive effects. */
async function ask() {
  fireEvent.click(screen.getByRole('button', { name: 'Ask for a call' }))
  const dialog = screen.getByRole('alertdialog')
  await clickAndFlush(within(dialog).getByRole('button', { name: 'Ask' }))
}

function within(element: HTMLElement) {
  return {
    getByRole: (role: string, options: { name: string }) =>
      [...element.querySelectorAll<HTMLElement>(role === 'button' ? 'button' : `[role="${role}"]`)].find(
        (node) => node.textContent === options.name
      )!
  }
}

const keyOf = (call: number) =>
  (vi.mocked(overviewApi).mock.calls[call]![1] as { idempotencyKey?: string }).idempotencyKey

test('createRun is idempotent, so the browser sends an Idempotency-Key', () => {
  expect(overviewOperations.createRun).toMatchObject({
    method: 'POST',
    path: '/v1/projects/{id}/runs',
    idempotent: true
  })
})

test('the status line is mounted before anything happens, so each change is announced', () => {
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  expect(screen.getByRole('status').textContent).toBe('')
})

test('asking first confirms what it starts; Cancel starts nothing', async () => {
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask for a call' }))
  const dialog = screen.getByRole('alertdialog')
  expect(dialog.textContent).toContain('Ask for a call now?')
  expect(dialog.textContent).toContain('Skyclause drafts a bundle for the approver to review.')
  await clickAndFlush(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(overviewApi).not.toHaveBeenCalled()
})

test('a confirmed ask starts one Sky run and holds the control at Asked… until a bundle drafts', async () => {
  vi.mocked(overviewApi).mockResolvedValue({} as never)
  const { rerender } = render(<AskForCall org="pilot" projectId="project-id" drafted={0} locale="en" />)
  await ask()
  expect(status()).toBe('Asked. The bundle shows here once it is drafted.')
  expect(overviewApi).toHaveBeenCalledWith('createRun', {
    org: 'pilot',
    params: { id: 'project-id' },
    body: { pack: 'sky' },
    idempotencyKey: expect.any(String)
  })
  const held = screen.getByRole('button', { name: 'Asked…' })
  expect(held).toHaveProperty('disabled', true)
  fireEvent.click(held)
  expect(overviewApi).toHaveBeenCalledTimes(1)

  // The overview's bundle stream saw bundle.drafted.
  rerender(<AskForCall org="pilot" projectId="project-id" drafted={1} locale="en" />)
  expect(status()).toBe('Drafted. The new bundle is in the list below.')
  expect(screen.getByRole('button', { name: 'Ask for a call' })).toHaveProperty('disabled', false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ASK_WAIT_MS)
  })
  expect(status()).toBe('Drafted. The new bundle is in the list below.')
})

test('with no bundle in time, the status says so and the control is offered again with a new ask', async () => {
  vi.mocked(overviewApi).mockResolvedValue({} as never)
  render(<AskForCall org="pilot" projectId="project-id" drafted={0} locale="en" />)
  await ask()
  expect(screen.getByRole('button', { name: 'Asked…' })).toBeTruthy()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ASK_WAIT_MS - 1)
  })
  expect(status()).toBe('Asked. The bundle shows here once it is drafted.')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(status()).toBe("No bundle was drafted. Check the pack's sources, then ask again.")
  await ask()
  expect(overviewApi).toHaveBeenCalledTimes(2)
  expect(keyOf(1)).not.toBe(keyOf(0))
})

test('Try again repeats the same ask with the same key, so a lost answer never starts a second run', async () => {
  vi.mocked(overviewApi)
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce({} as never)
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  await ask()
  expect(status()).toBe('Couldn’t ask for a call just now.')
  await clickAndFlush(screen.getByRole('button', { name: 'Try again' }))
  expect(status()).toBe('Asked. The bundle shows here once it is drafted.')
  expect(overviewApi).toHaveBeenCalledTimes(2)
  expect(keyOf(1)).toBe(keyOf(0))
})

const problem = (status: number, slug: string, extra: Record<string, unknown> = {}) =>
  new ApiProblem(status, {
    type: `https://docs.skyclause.m1ku.tech/problems/${slug}`,
    title: slug,
    status,
    ...extra
  })

test.each([
  [
    'the pack is off',
    problem(422, 'validation-failed', {
      detail: 'The request is invalid.',
      errors: [{ in: 'body', pointer: '/pack', detail: 'The sky pack is not enabled for this project' }]
    }),
    'The Sky pack is off for this project. Turn it on in Packs and sources.',
    false
  ],
  [
    'the project is archived',
    problem(422, 'validation-failed', { detail: 'The project is archived, so it starts no runs.' }),
    'This project is archived, so no call can be asked for.',
    false
  ],
  [
    'the project is suspended',
    problem(422, 'validation-failed', { detail: 'The project is suspended, so it starts no runs.' }),
    'This project is suspended, so no call can be asked for.',
    false
  ],
  [
    'today’s runs are spent',
    problem(429, 'budget-exhausted', {
      detail: 'No runs are left today. The budget resets at 14 Nov 2026, 00:00 MYT.',
      resets_at: '2026-11-13T16:00:00.000Z'
    }),
    'No more calls can be asked for today. Asking opens again at 14 November 2026, 00:00 MYT.',
    false
  ],
  [
    'too many asks',
    problem(429, 'rate-limited', { detail: 'Too many requests.' }),
    'Too many asks just now. Try again in a minute.',
    true
  ],
  [
    'the role can’t',
    problem(403, 'insufficient-scope', { detail: 'needs runs:write' }),
    'Your role can’t ask for a call in this project.',
    false
  ],
  [
    'a key another run holds',
    problem(422, 'idempotency-mismatch', { detail: 'This Idempotency-Key is already in use; send a new one.' }),
    'Couldn’t ask for a call just now.',
    true
  ],
  [
    'a server fault',
    problem(500, 'internal-error', { detail: 'The server failed.' }),
    'Couldn’t ask for a call just now.',
    true
  ]
])('%s reads in product words, never the server’s detail', async (_, error, sentence, retry) => {
  vi.mocked(overviewApi).mockRejectedValue(error)
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  await ask()
  expect(status()).toBe(sentence)
  expect(document.body.textContent).not.toContain(String(error.body.detail))
  expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(retry)
})

test('a 501 says asking is not available yet, offers no Retry, and takes the control away', async () => {
  vi.mocked(overviewApi).mockRejectedValue(
    problem(501, 'not-built', { detail: 'not built: owned by d-guest-rules', owner: 'd-guest-rules' })
  )
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  await ask()
  expect(status()).toBe('Asking for a call is not available yet.')
  expect(document.body.textContent).not.toMatch(/not built|d-guest-rules|501/)
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ask for a call' })).toBeNull()
})

test('in Malay every sentence is Malay', async () => {
  vi.mocked(overviewApi).mockRejectedValue(
    problem(422, 'validation-failed', { detail: 'The project is archived, so it starts no runs.' })
  )
  render(<AskForCall org="pilot" projectId="project-id" locale="ms" />)
  fireEvent.click(screen.getByRole('button', { name: 'Minta keputusan' }))
  const dialog = screen.getByRole('alertdialog')
  expect(dialog.textContent).toContain('Minta keputusan sekarang?')
  await clickAndFlush(within(dialog).getByRole('button', { name: 'Minta' }))
  expect(status()).toBe('Projek ini diarkibkan, jadi keputusan tidak boleh diminta.')
  expect(document.body.textContent).not.toContain('archived')
})
