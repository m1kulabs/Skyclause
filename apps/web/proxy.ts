import { pagePrincipal } from '@skyclause/auth'
import type { NextRequest } from 'next/server'
import { securityHeaders } from './features/hardening/security-headers'
import { hostConfig, pageElsewhere, routeRequest, type HostConfig } from './lib/hosts'

let hosts: HostConfig | undefined
// One-segment app routes that are not organisations. Add new ones here (#102 adds /new).
const staticAppRoots = new Set(['_not-found', 'account', 'connect', 'new'])

/** Whether an organisation answers to this slug or ID. No credential is read: only that it exists. */
const organisationExists = async (org: string) => (await pagePrincipal(new Headers(), { org })).org !== null

// Spec §4 Hosts. Reads HOST_MODE and the six origins, which `loadEnv('web')` checked as the server started.
export async function proxy(request: NextRequest) {
  hosts ??= hostConfig(process.env)

  const pathname = request.nextUrl.pathname
  const segments = pathname.split('/').filter(Boolean)
  const host = request.headers.get('host') ?? request.nextUrl.host
  const route = routeRequest({ ...hosts, host, pathname })
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
  if (!route) {
    // An organisation's page asked of the marketing host goes to the app host only if that organisation exists: any
    // other path stays the not-found page where it was asked.
    const elsewhere = pageElsewhere({
      ...hosts,
      host,
      pathname,
      search: request.nextUrl.search,
      method: request.method
    })
    if (elsewhere?.org && !(await organisationExists(elsewhere.org)))
      return securityHeaders(request, hosts, { notFound: true })
  }

  return securityHeaders(request, hosts)
}
