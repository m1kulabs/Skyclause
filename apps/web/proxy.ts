import { pagePrincipal } from '@skyclause/auth'
import type { NextRequest } from 'next/server'
import { securityHeaders } from './features/hardening/security-headers'
import { hostConfig, organisationToCheck, type HostConfig } from './lib/hosts'

let hosts: HostConfig | undefined

// Spec §4 Hosts. Reads HOST_MODE and the six origins, which `loadEnv('web')` checked as the server started.
export async function proxy(request: NextRequest) {
  hosts ??= hostConfig(process.env)

  // Only a request that carries a credential costs a lookup: a signed-out one is sent to sign in by `securityHeaders`'
  // `proxyResponse` whether the organisation exists or not. A credential that resolves to no one is the layout's to
  // send to sign in, so an unknown organisation is a 404 only for someone signed in.
  const org = organisationToCheck(request, hosts)
  if (org && !(process.env.APP_ENV === 'test' && request.cookies.has('skyclause_test_principal'))) {
    const found = await pagePrincipal(new Headers(request.headers), { org })
    // #115's headers cover the not-found page too.
    if (found.principal && !found.org) return securityHeaders(request, hosts, { notFound: true })
  }

  return securityHeaders(request, hosts)
}
