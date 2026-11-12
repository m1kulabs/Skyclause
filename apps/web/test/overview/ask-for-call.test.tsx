// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { AskForCall } from '../../features/overview/ask-for-call'
import { overviewApi, overviewOperations } from '../../features/overview/operations'

vi.mock('../../features/overview/operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/overview/operations')>()
  return { ...actual, overviewApi: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.mocked(overviewApi).mockReset()
})

test('createRun is idempotent, so the browser sends an Idempotency-Key', () => {
  expect(overviewOperations.createRun).toMatchObject({
    method: 'POST',
    path: '/v1/projects/{id}/runs',
    idempotent: true
  })
})

test('asks for a Sky run over today’s windows and says the bundle follows', async () => {
  vi.mocked(overviewApi).mockResolvedValue({} as never)
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask for a call' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('Asked. The bundle shows here once it is drafted.')
  )
  expect(overviewApi).toHaveBeenCalledWith('createRun', {
    org: 'pilot',
    params: { id: 'project-id' },
    body: { pack: 'sky' }
  })
})

test('a refused run shows the server’s reason, and the button stays usable', async () => {
  vi.mocked(overviewApi).mockRejectedValue(
    new ApiProblem(422, { status: 422, detail: 'The sky pack is not enabled for this project' })
  )
  render(<AskForCall org="pilot" projectId="project-id" locale="en" />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask for a call' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('The sky pack is not enabled for this project')
  )
  expect(screen.getByRole('button', { name: 'Ask for a call' })).toHaveProperty('disabled', false)
})
