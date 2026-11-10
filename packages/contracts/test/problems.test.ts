import { expect, test } from 'vitest'
import { HTTP_PROBLEM_STATUS, PROBLEM_SLUGS } from '../src/problems'

test('lists the TRD problem slugs and Spec §4 additions', () => {
  expect(PROBLEM_SLUGS).toEqual([
    'validation-failed',
    'insufficient-scope',
    'rate-limited',
    'idempotency-mismatch',
    'source-error',
    'bundle-superseded',
    'call-expired',
    'inputs-changed',
    'budget-exhausted',
    'not-built',
    'organization-required',
    'reauth-required',
    'slug-reserved',
    'slug-taken',
    'last-owner',
    'role-not-grantable',
    'last-sign-in-method',
    'link-expired',
    'invite-withdrawn',
    'sole-owner',
    'key-test-failed',
    'malay-reader-required',
    'export-pending',
    'unsafe-url',
    'pack-prerequisites',
    'preview-stale',
    'not-publishable',
    'redraft-required',
    'no-event-yet',
    'webhook-unverified',
    'feature-off',
    'privacy-notice-unpublished',
    'unauthenticated',
    'not-found',
    'idempotency-in-progress',
    'conflict',
    'internal-error'
  ])
})

test('fixes the status of the credential, lookup, key, state and server slugs', () => {
  expect(HTTP_PROBLEM_STATUS).toEqual({
    unauthenticated: 401,
    'not-found': 404,
    'idempotency-in-progress': 409,
    conflict: 409,
    'internal-error': 500
  })
})
