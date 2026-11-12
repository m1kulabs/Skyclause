// Spec §4 Hosts for what a page links to and names as its own. Server code only: the origins are the configured
// `*_ORIGIN` variables, never a request header. No `next/server` here, so a component shared with the client may use it.

type Env = Record<string, string | undefined>

const ORIGIN_VAR = { marketing: 'MARKETING_ORIGIN', app: 'APP_ORIGIN' } as const

/**
 * The absolute origin `surface` serves from: its own under HOST_MODE=multi; on one host, that host's (APP_ORIGIN,
 * which Better Auth needs anyway). Undefined when none is configured.
 */
export function originOf(surface: 'marketing' | 'app', env: Env = process.env): string | undefined {
  const value = env.HOST_MODE === 'multi' ? env[ORIGIN_VAR[surface]] : (env.APP_ORIGIN ?? env.MARKETING_ORIGIN)
  return value ? new URL(value).origin : undefined
}

/**
 * A link to `path` on `surface`: absolute under HOST_MODE=multi, so a link from one host to the other never depends on
 * a redirect; the path itself on one host.
 */
export function hrefOn(surface: 'marketing' | 'app', path: string, env: Env = process.env): string {
  const origin = env.HOST_MODE === 'multi' ? originOf(surface, env) : undefined
  return origin ? new URL(path, origin).toString() : path
}
