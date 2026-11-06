// Spec §2: set to YYYY-MM-DD when the published privacy notice is ready.
export const PRIVACY_NOTICE_VERSION: string | null = null

export type ConsentWriteProblem = {
  slug: 'privacy-notice-unpublished'
  status: 503
}

export function consentWriteProblem(): ConsentWriteProblem | null {
  return PRIVACY_NOTICE_VERSION === null ? { slug: 'privacy-notice-unpublished', status: 503 } : null
}
