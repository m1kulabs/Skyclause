// a-hardening (#115): NFR-10's response headers. `proxy.ts` calls
// `securityHeaders(request)` in one line; the nonce is per request and the
// headers are chosen by host. The built app proves the behaviour in
// e2e/hardening.spec.ts; test/hardening.test.ts pins the header contract.
import { NextResponse, type NextRequest } from 'next/server'
import { hostConfig, proxyResponse, routeRequest, type HostConfig, type Surface } from '../../lib/hosts'

let shared: HostConfig | undefined

// lib/theme.ts's APPEARANCE_SCRIPT, hashed once. The static shells (marketing)
// cannot see the per-request nonce, so this hash lets that one inline script
// run; the script is a plain string literal (bundler-stable, never
// `fn.toString()`) and test/hardening.test.ts recomputes the hash and fails
// when the script changes.
export const APPEARANCE_HASH = 'sha256-HRaBKcF3NonJpCn+ZC9rV9veu2iZQtO2AZS9TOso27M='

const randomNonce = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

// Route group to the surface whose policy it answers under. `shared` serves on
// every host, so it takes the requesting host's surface instead.
const SURFACE_OF: Record<string, Surface | null> = {
  shared: null,
  '/v1': 'api',
  '/api': 'app',
  '/mcp': 'mcp',
  '/.well-known/oauth-protected-resource': 'mcp',
  '/.well-known/oauth-authorization-server': 'app',
  '/sw.js': 'app',
  '/openapi.json': 'marketing',
  '/oembed': 'marketing',
  '/e': 'marketing',
  '/skills': 'marketing',
  '/elements': 'embed',
  '(embed)': 'embed',
  docs: 'docs',
  planted: 'marketing',
  '(marketing)': 'marketing',
  '(public)': 'marketing',
  '(auth)': 'app',
  '(app)': 'app'
}

const isCameraRoute = (pathname: string) => /(^|\/)camera(\/|$)/.test(pathname)

export function securityHeaders(request: NextRequest, config?: HostConfig): NextResponse {
  const hosts = config ?? (shared ??= hostConfig(process.env))
  const nonce = randomNonce()
  // The app reads the nonce back through `headers()` (RequestRootLayout) for
  // its dynamic shells; static shells run on the appearance hash instead.
  const downstream = new Headers(request.headers)
  downstream.set('x-nonce', nonce)
  const response = proxyResponse(request, hosts, { request: { headers: downstream } })
  const host = request.headers.get('host') ?? request.nextUrl.host
  const route = routeRequest({ ...hosts, host, pathname: request.nextUrl.pathname })
  const surface = route ? (SURFACE_OF[route.group] ?? surfaceOfHost(hosts, host)) : null
  applySecurityHeaders(response, { surface, camera: isCameraRoute(request.nextUrl.pathname), nonce })
  return response
}

function surfaceOfHost(config: HostConfig, host: string): Surface | null {
  const match = (Object.entries(config.hosts) as Array<[Surface, string]>).find(
    ([, value]) => value.toLowerCase() === host.toLowerCase()
  )?.[0]
  return match ?? null
}

export function applySecurityHeaders(
  response: NextResponse,
  o: { surface: Surface | null; camera: boolean; nonce: string }
): void {
  const embed = o.surface === 'embed'
  const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? process.env.API_ORIGIN
  const connect = apiOrigin && apiOrigin !== 'self' ? `connect-src 'self' ${apiOrigin}` : "connect-src 'self'"
  // script-src: the nonce for dynamic shells and the appearance hash for
  // static shells, `strict-dynamic` for the rest; style-src keeps
  // 'unsafe-inline' for the app's inline style attributes (see the control map).
  const csp = [
    "default-src 'self'",
    `script-src 'nonce-${o.nonce}' 'strict-dynamic' '${APPEARANCE_HASH}'`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    embed ? 'frame-ancestors *' : "frame-ancestors 'none'",
    connect,
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'"
  ].join('; ')
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubdomains')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (!embed) response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set(
    'Permissions-Policy',
    o.camera ? 'camera=(self), microphone=(), geolocation=()' : 'camera=(), microphone=(), geolocation=()'
  )
}
