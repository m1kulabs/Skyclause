// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WEBHOOK_EVENT_TYPES } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import { RegisterForm, problemKey } from '../../features/webhooks/form'

function problem(type: string) {
  return new ApiProblem(422, { type: `https://skyclause.m1ku.tech/problems/${type}`, title: type, status: 422 })
}

test.each([
  ['unsafe-url', 'unsafe_url'],
  ['validation-failed', 'validation_failed'],
  ['webhook-unverified', 'unverified'],
  ['no-event-yet', 'no_event']
] as const)('problem %s maps to %s', (type, key) => {
  expect(problemKey(problem(type))).toBe(key)
})

test('unknown and non-problem failures map to action_failed', () => {
  expect(problemKey(problem('something-else'))).toBe('action_failed')
  expect(problemKey(new Error('boom'))).toBe('action_failed')
})

test('event picker lists exactly WEBHOOK_EVENT_TYPES and no synthetic control', () => {
  const { container } = render(<RegisterForm org="test-org" projects={[]} onCreated={() => {}} />)
  const values = [...container.querySelectorAll('[data-webhook-events] input[type=checkbox]')].map((node) =>
    node.getAttribute('value')
  )
  expect(values).toEqual([...WEBHOOK_EVENT_TYPES])
  expect(screen.queryByRole('button', { name: /test event|synthetic/i })).toBeNull()
  expect(screen.queryByText(/synthetic/i)).toBeNull()

  const url = screen.getByRole('textbox', { name: 'HTTPS endpoint URL' })
  expect(url.getAttribute('type')).toBe('url')
  expect(url.getAttribute('spellcheck')).toBe('false')
})
