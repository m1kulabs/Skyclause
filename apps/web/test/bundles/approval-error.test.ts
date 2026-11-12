import { expect, test } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { approvalErrorMessage } from '../../features/bundles/use-bundle-review'

const refused = (type: string, status: number, detail: string) =>
  new ApiProblem(status, {
    type: `https://docs.skyclause.m1ku.tech/problems/${type}`,
    title: 'Refused',
    status,
    detail
  })

test('a refused approval says what happened in a catalogue sentence, never the API’s detail', () => {
  const message = approvalErrorMessage(
    refused(
      'validation-failed',
      422,
      'Call 019a45b0-0000-7000-8000-000000000004 is expired; only a drafted call is decided.'
    ),
    'en'
  )
  expect(message).toBe('This call did not pass validation. Edit it before retrying.')
  expect(approvalErrorMessage(refused('redraft-required', 422, 'The engine’s call for w1 changed'), 'ms')).toBe(
    'Keputusan ini memerlukan draf baharu. Buka projek untuk meminta larian.'
  )
  expect(approvalErrorMessage(refused('something-new', 500, 'internal detail'), 'en')).not.toContain('internal detail')
})

test('a missing call that expired at approval names its time in MYT, never the ID or an ISO instant', () => {
  const detail =
    'The call for 019a45b0-0000-7000-8000-000000000004 expired at 2026-11-02T07:00:00.000Z; dismiss it instead.'
  expect(approvalErrorMessage(refused('validation-failed', 422, detail), 'en')).toBe(
    'This call expired at 15:00 MYT. Dismiss it instead.'
  )
  const malay = approvalErrorMessage(refused('validation-failed', 422, detail), 'ms')
  expect(malay).toContain('15:00')
  expect(malay).not.toMatch(/019a45b0|2026-11-02T/)
})
