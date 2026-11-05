import { expect, test } from 'bun:test'
import { toMytIso } from './time.ts'

test('toMytIso writes MYT with an explicit +08:00 offset', () => {
  expect(toMytIso(new Date('2026-11-02T07:05:00Z'))).toBe('2026-11-02T15:05:00+08:00')
  expect(toMytIso(new Date('2026-11-05T16:30:00.750Z'))).toBe('2026-11-06T00:30:00+08:00')
})
