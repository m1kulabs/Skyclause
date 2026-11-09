import type { Principal } from '@skyclause/contracts'

/** The consent page admits only a signed-up member session. */
export function oauthConsentRedirect(principal: Principal | null): '/sign-up' | '/sign-in' | null {
  if (principal?.kind === 'session') return principal.isGuest ? '/sign-up' : null
  return '/sign-in'
}
