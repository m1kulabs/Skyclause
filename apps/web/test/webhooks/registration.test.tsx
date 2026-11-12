// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { t } from '../../features/webhooks/catalogue'
import { WEBHOOK_EVENT_TYPES } from '@skyclause/contracts'
import { ApiProblem } from '../../lib/api-fetch'
import { RegisterForm, problemKey } from '../../features/webhooks/form'

// jsdom has no PointerEvent, which the checkbox primitive constructs when it is toggled.
Object.assign(window, { PointerEvent: window.PointerEvent ?? MouseEvent })

afterEach(cleanup)

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

test('the URL field offers no autofill and the form is written in the request language', () => {
  render(<RegisterForm org="test-org" projects={[]} onCreated={() => {}} locale="ms" />)
  const url = screen.getByRole('textbox', { name: 'URL titik akhir HTTPS' })
  expect(url.getAttribute('autocomplete')).toBe('off')
  expect(screen.getByRole('button', { name: 'Daftar webhook' })).toBeDefined()
})

test('a failed submit says how to fix it with no machine slug, and the project that is missing takes focus', () => {
  const projects = [{ id: 'project-1', name: 'Bukit Jalil campus' }] as never
  render(<RegisterForm org="test-org" projects={projects} onCreated={() => {}} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'HTTPS endpoint URL' }), {
    target: { value: 'https://receiver.example.test/hooks' }
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'call.sent' }))
  fireEvent.click(screen.getByLabelText('Choose projects'))
  fireEvent.submit(screen.getByRole('form', { name: 'Register a webhook' }))
  expect(screen.getByRole('alert').textContent).toBe('Choose at least 1 project or select all projects.')
  expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Bukit Jalil campus' }))
  expect(screen.getByRole('group', { name: 'Projects' }).getAttribute('aria-describedby')).toBe(
    screen.getByRole('alert').id
  )
})

test('chosen projects are paged at 50 rows', () => {
  const projects = Array.from({ length: 60 }, (_, index) => ({ id: `project-${index}`, name: `Project ${index}` }))
  render(<RegisterForm org="test-org" projects={projects as never} onCreated={() => {}} />)
  fireEvent.click(screen.getByLabelText('Choose projects'))
  expect(document.querySelectorAll('input[name="webhook-projects"], [name="webhook-projects"]')).toHaveLength(50)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByRole('checkbox', { name: 'Project 59' })).toBeDefined()
  expect(screen.queryByRole('checkbox', { name: 'Project 0' })).toBeNull()
})

test.each(['en', 'ms'] as const)('no %s webhook message begins with a machine slug', (locale) => {
  for (const key of ['unsafe_url', 'validation_failed', 'unverified']) {
    expect(t(`webhooks.${key}`, {}, locale)).not.toMatch(/^[a-z]+(?:-[a-z]+)+:/)
  }
})
