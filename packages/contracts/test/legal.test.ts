import { expect, test } from 'vitest'
import { consentWriteProblem, PRIVACY_NOTICE_VERSION } from '../src/legal'

test('refuses a consent write while the privacy notice is unpublished', () => {
  expect(PRIVACY_NOTICE_VERSION).toBeNull()
  expect(consentWriteProblem()).toEqual({ slug: 'privacy-notice-unpublished', status: 503 })
})
