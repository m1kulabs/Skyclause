// Spec §2: the published privacy notice is versioned by its publication date.
export const PRIVACY_NOTICE_VERSION: string | null = '2026-11-10'
export const TERMS_VERSION = '2026-11-10'

export type ConsentWriteProblem = {
  slug: 'privacy-notice-unpublished'
  status: 503
}

export function consentWriteProblem(): ConsentWriteProblem | null {
  return PRIVACY_NOTICE_VERSION === null ? { slug: 'privacy-notice-unpublished', status: 503 } : null
}
