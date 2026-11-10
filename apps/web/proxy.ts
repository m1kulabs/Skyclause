import { pagePrincipal } from '@skyclause/auth'
import type { NextRequest } from 'next/server'
import { securityHeaders } from './features/hardening/security-headers'
import { hostConfig, routeRequest, type HostConfig } from './lib/hosts'

let hosts: HostConfig | undefined
// One-segment app routes that are not organisations. Add new ones here (#102 adds /new).
const staticAppRoots = new Set(['_not-found', 'account', 'connect', 'new'])

// Spec §4 Hosts. Reads HOST_MODE and the six origins, which `loadEnv('web')` checked as the server started.
export async function proxy(request: NextRequest) {
  hosts ??= hostConfig(process.env)

  const pathname = request.nextUrl.pathname
  const segments = pathname.split('/').filter(Boolean)
  const route = routeRequest({
    ...hosts,
    host: request.headers.get('host') ?? request.nextUrl.host,
    pathname
  })
  if (
    route?.group === '(app)' &&
    segments.length === 1 &&
    !staticAppRoots.has(segments[0]!) &&
    !(process.env.APP_ENV === 'test' && request.cookies.has('skyclause_test_principal'))
  ) {
    const { org } = await pagePrincipal(new Headers(request.headers), { org: segments[0]! })
    // #115's headers cover the not-found page too.
    if (!org) return securityHeaders(request, hosts, { notFound: true })
  }

  return securityHeaders(request, hosts)
}
