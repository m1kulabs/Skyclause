import { expect, test } from 'vitest'
import { prefersMalay } from '../../lib/preferred-language'

test.each([
  ['ms-MY,ms;q=0.9', true],
  ['en-GB', false],
  ['ms;q=0.5,en;q=0.9', false],
  ['en;q=0.5,ms;q=0.9', true],
  ['ms,en', false],
  ['ms;q=0', false],
  ['ms;q=2,en;q=0.5', false],
  ['ms;q=invalid', false],
  ['*', false],
  [null, false]
])('Accept-Language %s suggests Malay: %s', (header, expected) => {
  expect(prefersMalay(header)).toBe(expected)
})
