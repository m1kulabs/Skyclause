// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ReadingFields } from '../../features/signals/source-detail'

afterEach(cleanup)

test('a warning reads as labelled values, with the publisher’s whole reading kept under a closed disclosure', () => {
  const value = {
    warning_issue: 'Thunderstorms',
    valid_to: '2026-11-05T21:00:00+08:00',
    level: 2,
    area: { state: 'KL' }
  }
  render(<ReadingFields value={value} locale="en" />)
  const fields = document.querySelector('[data-reading-fields] dl')!
  expect(fields.textContent).toContain('Warning issue')
  expect(fields.textContent).toContain('Thunderstorms')
  expect(fields.textContent).toContain('Valid to')
  expect(fields.textContent).toContain('2')
  // A nested object is not flattened into labels: it stays in the raw reading.
  expect(fields.textContent).not.toContain('KL')
  const disclosure = document.querySelector('details')!
  expect(disclosure.open).toBe(false)
  expect(screen.getByText('Raw reading').tagName).toBe('SUMMARY')
  expect(disclosure.querySelector('pre code')!.textContent).toBe(JSON.stringify(value, null, 2))
})

test('the disclosure is named in Malay too', () => {
  render(<ReadingFields value={{ title: 'Ribut petir' }} locale="ms" />)
  expect(screen.getByText('Bacaan mentah')).toBeTruthy()
})
