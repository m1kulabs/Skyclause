/** No API origin can be resolved: a deploy's configuration is missing, not a read that failed. */
export class ApiOriginError extends Error {
  constructor() {
    super(
      'API_ORIGIN is not set, so server-side API reads have no origin to call (APP_ORIGIN stands in for it only under HOST_MODE=single)'
    )
    this.name = 'ApiOriginError'
  }
}

/**
 * Where the web server reads the API (spec §4 Hosts): API_ORIGIN, else APP_ORIGIN under HOST_MODE=single, where every
 * surface shares it (as `authSettings` resolves it; an unset HOST_MODE is single). Nothing else: a server with no
 * origin must not send its users' session to another environment's host.
 */
export function serverApiOrigin(env: Record<string, string | undefined> = process.env): string {
  const origin = env.API_ORIGIN || (env.HOST_MODE === 'multi' ? undefined : env.APP_ORIGIN)
  if (!origin) throw new ApiOriginError()
  return origin
}
