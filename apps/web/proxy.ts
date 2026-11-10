import { pagePrincipal } from '@skyclause/auth'
import { NextResponse, type NextRequest } from 'next/server'
import { hostConfig, proxyResponse, routeRequest, type HostConfig } from './lib/hosts'

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
    if (!org) return NextResponse.rewrite(new URL('/_not-found', request.url))
  }

  return proxyResponse(request, hosts)
}
