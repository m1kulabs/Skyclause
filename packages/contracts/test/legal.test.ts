import { expect, test } from 'vitest'
import { consentWriteProblem, PRIVACY_NOTICE_VERSION, TERMS_VERSION } from '../src/legal'

test('allows consent writes after the versioned privacy notice is published', () => {
  expect(PRIVACY_NOTICE_VERSION).toBe('2026-11-10')
  expect(TERMS_VERSION).toBe('2026-11-10')
  expect(consentWriteProblem()).toBeNull()
})
