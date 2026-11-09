import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import type { ApiEnv } from './context'

// Spec §4 "Beyond TRD API conventions".

/** `*` without credentials: `/v1/public/*`, and the `/oembed` and `/e` owners' routes. */
export const publicCors: MiddlewareHandler = cors({ origin: '*' })

/** The same rule for a plain Route Handler's response. */
export function withPublicCors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}

export const APP_CORS_HEADERS = [
  'Authorization',
  'Content-Type',
  'Idempotency-Key',
  'Last-Event-ID',
  'Skyclause-Organization'
] as const
export const EXPOSED_HEADERS = ['Retry-After', 'Deprecation', 'Sunset', 'Link'] as const

/** `APP_ORIGIN` only, never cookies: every other `/v1` route, and `/mcp` for the inspector. */
export function appCors(appOrigin: () => string | undefined): MiddlewareHandler {
  return cors({
    origin: (origin) => {
      const allowed = appOrigin()
      return allowed && origin === new URL(allowed).origin ? origin : null
    },
    allowHeaders: [...APP_CORS_HEADERS],
    exposeHeaders: [...EXPOSED_HEADERS],
    credentials: false
  })
}

export function v1Cors(): MiddlewareHandler<ApiEnv> {
  let app: MiddlewareHandler | undefined
  return (c, next) => {
    if (c.req.path.startsWith('/v1/public/')) return publicCors(c, next)
    app ??= appCors(() => c.get('deps').config().appOrigin)
    return app(c, next)
  }
}
