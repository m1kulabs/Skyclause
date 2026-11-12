// The sign-in page is served on the app host, while the landing and the legal pages are served only on the marketing
// host (lib/hosts.ts). Under HOST_MODE=multi a relative link from here would end on the app host's not-found page, so
// these are absolute to MARKETING_ORIGIN; on one host (HOST_MODE=single, the e2e server) they stay relative.

type Env = Record<string, string | undefined>

/** A marketing page's href as seen from the app host: absolute under HOST_MODE=multi, relative on one host. */
export function marketingHref(path: string, env: Env = process.env): string {
  const origin = env.HOST_MODE === 'multi' ? env.MARKETING_ORIGIN : undefined
  return origin ? new URL(path, origin).toString() : path
}

export interface SignInLinks {
  /** The wordmark: the landing. */
  home: string
  /** The PDPA privacy notice, in the page's language where one exists. */
  privacy: string
  terms: string
  /** The landing footer's picture credits, where the room's photograph is credited in full. */
  credits: string
}

export function signInLinks(locale: 'en' | 'ms', env: Env = process.env): SignInLinks {
  return {
    home: marketingHref('/', env),
    privacy: marketingHref(locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy', env),
    terms: marketingHref('/legal/terms', env),
    credits: marketingHref('/#picture-credits', env)
  }
}
