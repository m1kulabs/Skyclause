import { expect, test } from 'vitest'
import { clauseName } from '../../features/bundles/clause-name'

test('a catalogued clause reads by its name in the interface’s language, never by its key', () => {
  expect(clauseName('storm_confirmed', 'en')).toBe('Storm confirmed')
  expect(clauseName('storm_confirmed', 'ms')).toBe('Ribut disahkan')
  expect(clauseName('after_last_shuttle', 'ms')).toBe('Selepas bas ulang-alik terakhir')
})

test('a project’s own clause, which no catalogue names, reads as words', () => {
  expect(clauseName('gate_queue_long', 'en')).toBe('Gate queue long')
})
