// TRD "API conventions" and Spec §4 problem slugs.
export const PROBLEM_SLUGS = [
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
] as const

export type ProblemSlug = (typeof PROBLEM_SLUGS)[number]

// Slugs that mean one status wherever they are raised: no credential, no such row or route, a key still being
// processed, a write the resource's state no longer allows, and a server fault.
export const HTTP_PROBLEM_STATUS = {
  unauthenticated: 401,
  'not-found': 404,
  'idempotency-in-progress': 409,
  conflict: 409,
  'internal-error': 500
} as const satisfies Partial<Record<ProblemSlug, number>>
