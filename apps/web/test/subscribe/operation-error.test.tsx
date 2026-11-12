// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { OperationError } from '../../features/subscribe/error'

afterEach(cleanup)

const refused = (status: number, type: string) => new ApiProblem(status, { status, type, title: type })

test('an Admin’s failed change is said in words; the status and the problem stay in data attributes', () => {
  const cases: Array<[number, string, string]> = [
    [403, 'permission-denied', 'Your role can’t change this.'],
    [409, 'conflict', 'This changed while you were working. Reload, then try again.'],
    [422, 'validation-failed', 'Some details were not accepted. Check them and try again.'],
    [429, 'rate-limited', 'Too many changes just now. Try again in a minute.'],
    [501, 'not-built', 'This is not available yet.'],
    [503, 'operation-unavailable', 'Something went wrong and nothing was changed. Try again.']
  ]
  for (const [status, type, sentence] of cases) {
    render(<OperationError error={refused(status, type)} locale="en" />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe(sentence)
    expect(alert.dataset.httpStatus).toBe(String(status))
    expect(alert.dataset.problem).toBe(type)
    cleanup()
  }
})

test('in Malay too, with no status code or problem slug in the words', () => {
  render(<OperationError error={refused(403, 'permission-denied')} locale="ms" />)
  const text = screen.getByRole('alert').textContent ?? ''
  expect(text).toBe('Peranan anda tidak boleh mengubah ini.')
  expect(text).not.toMatch(/403|permission/)
})
