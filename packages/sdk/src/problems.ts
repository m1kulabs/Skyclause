export interface Problem {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  [extension: string]: unknown
}

export type ProblemSlug =
  | 'validation-failed'
  | 'insufficient-scope'
  | 'rate-limited'
  | 'idempotency-mismatch'
  | 'source-error'
  | 'bundle-superseded'
  | 'call-expired'
  | 'inputs-changed'
  | 'budget-exhausted'
  | 'not-built'
  | 'organization-required'
  | 'reauth-required'
  | 'slug-reserved'
  | 'slug-taken'
  | 'last-owner'
  | 'role-not-grantable'
  | 'last-sign-in-method'
  | 'link-expired'
  | 'invite-withdrawn'
  | 'sole-owner'
  | 'key-test-failed'
  | 'malay-reader-required'
  | 'export-pending'
  | 'unsafe-url'
  | 'pack-prerequisites'
  | 'preview-stale'
  | 'not-publishable'
  | 'redraft-required'
  | 'no-event-yet'
  | 'webhook-unverified'
  | 'feature-off'
  | 'privacy-notice-unpublished'
  | 'unauthenticated'
  | 'not-found'
  | 'idempotency-in-progress'
  | 'conflict'
  | 'internal-error'

function slugOf(problem: Problem): string {
  return problem.type.split('/').filter(Boolean).at(-1) ?? 'unknown'
}

export class SdkProblemError<Slug extends string = string> extends Error {
  readonly status: number
  readonly slug: Slug

  constructor(
    readonly problem: Problem,
    slug: Slug = slugOf(problem) as Slug
  ) {
    super(problem.detail || problem.title || `HTTP ${problem.status}`)
    this.name = new.target.name
    this.status = problem.status
    this.slug = slug
  }
}

function problemClass<Slug extends ProblemSlug>(slug: Slug) {
  return class extends SdkProblemError<Slug> {
    constructor(problem: Problem) {
      super(problem, slug)
    }
  }
}

export class ValidationFailedError extends problemClass('validation-failed') {}
export class InsufficientScopeError extends problemClass('insufficient-scope') {}
export class RateLimitedError extends problemClass('rate-limited') {}
export class IdempotencyMismatchError extends problemClass('idempotency-mismatch') {}
export class BundleSupersededError extends problemClass('bundle-superseded') {}
export class CallExpiredError extends problemClass('call-expired') {}
export class InputsChangedError extends problemClass('inputs-changed') {}
export class BudgetExhaustedError extends problemClass('budget-exhausted') {}
export class NotBuiltError extends problemClass('not-built') {}
export class OrganizationRequiredError extends problemClass('organization-required') {}
export class ReauthRequiredError extends problemClass('reauth-required') {}
export class SlugReservedError extends problemClass('slug-reserved') {}
export class SlugTakenError extends problemClass('slug-taken') {}
export class LastOwnerError extends problemClass('last-owner') {}
export class RoleNotGrantableError extends problemClass('role-not-grantable') {}
export class LastSignInMethodError extends problemClass('last-sign-in-method') {}
export class LinkExpiredError extends problemClass('link-expired') {}
export class InviteWithdrawnError extends problemClass('invite-withdrawn') {}
export class SoleOwnerError extends problemClass('sole-owner') {}
export class KeyTestFailedError extends problemClass('key-test-failed') {}
export class MalayReaderRequiredError extends problemClass('malay-reader-required') {}
export class ExportPendingError extends problemClass('export-pending') {}
export class UnsafeUrlError extends problemClass('unsafe-url') {}
export class PackPrerequisitesError extends problemClass('pack-prerequisites') {}
export class PreviewStaleError extends problemClass('preview-stale') {}
export class NotPublishableError extends problemClass('not-publishable') {}
export class RedraftRequiredError extends problemClass('redraft-required') {}
export class NoEventYetError extends problemClass('no-event-yet') {}
export class WebhookUnverifiedError extends problemClass('webhook-unverified') {}
export class FeatureOffError extends problemClass('feature-off') {}
export class PrivacyNoticeUnpublishedError extends problemClass('privacy-notice-unpublished') {}
export class UnauthenticatedError extends problemClass('unauthenticated') {}
export class NotFoundError extends problemClass('not-found') {}
export class IdempotencyInProgressError extends problemClass('idempotency-in-progress') {}
export class ConflictError extends problemClass('conflict') {}
export class InternalError extends problemClass('internal-error') {}

export class SourceError extends SdkProblemError<'source-error'> {
  readonly sourceId: string | null
  readonly since: string | null

  constructor(problem: Problem) {
    super(problem, 'source-error')
    const sourceId = problem.source_id ?? problem.sourceId
    this.sourceId = typeof sourceId === 'string' ? sourceId : null
    this.since = typeof problem.since === 'string' ? problem.since : null
  }
}

type ProblemErrorConstructor = new (problem: Problem) => SdkProblemError

export const PROBLEM_ERRORS: Record<string, ProblemErrorConstructor> = {
  'validation-failed': ValidationFailedError,
  'insufficient-scope': InsufficientScopeError,
  'rate-limited': RateLimitedError,
  'idempotency-mismatch': IdempotencyMismatchError,
  'source-error': SourceError,
  'bundle-superseded': BundleSupersededError,
  'call-expired': CallExpiredError,
  'inputs-changed': InputsChangedError,
  'budget-exhausted': BudgetExhaustedError,
  'not-built': NotBuiltError,
  'organization-required': OrganizationRequiredError,
  'reauth-required': ReauthRequiredError,
  'slug-reserved': SlugReservedError,
  'slug-taken': SlugTakenError,
  'last-owner': LastOwnerError,
  'role-not-grantable': RoleNotGrantableError,
  'last-sign-in-method': LastSignInMethodError,
  'link-expired': LinkExpiredError,
  'invite-withdrawn': InviteWithdrawnError,
  'sole-owner': SoleOwnerError,
  'key-test-failed': KeyTestFailedError,
  'malay-reader-required': MalayReaderRequiredError,
  'export-pending': ExportPendingError,
  'unsafe-url': UnsafeUrlError,
  'pack-prerequisites': PackPrerequisitesError,
  'preview-stale': PreviewStaleError,
  'not-publishable': NotPublishableError,
  'redraft-required': RedraftRequiredError,
  'no-event-yet': NoEventYetError,
  'webhook-unverified': WebhookUnverifiedError,
  'feature-off': FeatureOffError,
  'privacy-notice-unpublished': PrivacyNoticeUnpublishedError,
  unauthenticated: UnauthenticatedError,
  'not-found': NotFoundError,
  'idempotency-in-progress': IdempotencyInProgressError,
  conflict: ConflictError,
  'internal-error': InternalError
}

export function createProblemError(problem: Problem): SdkProblemError {
  const slug = slugOf(problem)
  const ErrorClass = PROBLEM_ERRORS[slug]
  return ErrorClass ? new ErrorClass(problem) : new SdkProblemError(problem, slug)
}
