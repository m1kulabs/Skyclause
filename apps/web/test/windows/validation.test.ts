import { expect, test } from 'vitest'
import { problemFields } from '../../features/windows/validation'

test('422 WIN-8 codes map to date, start and end and retain the evidence recovery', () => {
  expect(problemFields([{ path: ['body', 'starts_at'], code: 'too_far' }])).toEqual({ date: 'too_far' })
  expect(problemFields([{ field: 'starts_at', code: 'past' }])).toEqual({ start: 'past' })
  expect(problemFields([{ pointer: '/ends_at', code: 'too_long' }])).toEqual({ end: 'too_long' })
  expect(problemFields([{ path: 'ends_at', code: 'end_before_start' }])).toEqual({ end: 'end_before_start' })
})

test('422 maps recurrence pointers and server messages without discarding their cause', () => {
  expect(problemFields({ title: ['The title is required.'], 'recurrence.days_of_week': 'Choose days.' })).toEqual({
    title: 'server:The title is required.',
    days: 'server:Choose days.'
  })
  expect(problemFields([{ path: ['body', 'recurrence', 'until'], code: 'until_invalid' }])).toEqual({
    until: 'until_invalid'
  })
  expect(problemFields(null)).toEqual({})
})
