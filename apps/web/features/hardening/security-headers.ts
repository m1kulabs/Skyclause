// a-hardening (#115): NFR-10's response headers. `proxy.ts` answers every
// request with `securityHeaders(request)`; the nonce is per request and the
// headers are chosen by host. The built app proves the behaviour in
// e2e/hardening.spec.ts; test/hardening.test.ts pins the header contract.
import { NextResponse, type NextRequest } from 'next/server'
import { hostConfig, proxyResponse, routeRequest, type HostConfig, type Surface } from '../../lib/hosts'

let shared: HostConfig | undefined

// lib/theme.ts's APPEARANCE_SCRIPT, hashed once as a pinned allowance alongside
// the per-request nonce. The script is a plain string literal (bundler-stable,
// never `fn.toString()`), and test/hardening.test.ts recomputes the hash.
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

export function securityHeaders(
  request: NextRequest,
  config?: HostConfig,
  o: { notFound?: boolean } = {}
): NextResponse {
  const hosts = config ?? (shared ??= hostConfig(process.env))
  const nonce = randomNonce()
  const host = request.headers.get('host') ?? request.nextUrl.host
  const route = routeRequest({ ...hosts, host, pathname: request.nextUrl.pathname })
  const surface = route ? (SURFACE_OF[route.group] ?? surfaceOfHost(hosts, host)) : null
  const policy = { surface, camera: isCameraRoute(request.nextUrl.pathname), nonce }
  const downstream = new Headers(request.headers)
  downstream.set('x-nonce', nonce)
  // Next reads the nonce from the incoming CSP header and applies it to its scripts.
  downstream.set('Content-Security-Policy', contentSecurityPolicy(policy))
  const init = { request: { headers: downstream } }
  // #176's proxy answers an unknown `/{org}` with the not-found page.
  const response = o.notFound
    ? NextResponse.rewrite(new URL('/_not-found', request.url), init)
    : proxyResponse(request, hosts, init)
  applySecurityHeaders(response, policy)
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
  response.headers.set('Content-Security-Policy', contentSecurityPolicy(o))
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubdomains')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (o.surface !== 'embed') response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set(
    'Permissions-Policy',
    o.camera ? 'camera=(self), microphone=(), geolocation=()' : 'camera=(), microphone=(), geolocation=()'
  )
}

function contentSecurityPolicy(o: { surface: Surface | null; camera: boolean; nonce: string }): string {
  const embed = o.surface === 'embed'
  const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? process.env.API_ORIGIN
  const mcpOrigin = process.env.MCP_ORIGIN ?? 'https://mcp.skyclause.m1ku.tech'
  // Probation fetches each frame's signed URL (`signFrameUrl`'s path-style V4 read) and shows it as a blob: only
  // that bucket's path, never the whole storage host.
  const framesBucket = process.env.FRAMES_BUCKET
  const frames = framesBucket ? `https://storage.googleapis.com/${framesBucket}/` : undefined
  const app = o.surface === 'app'
  const connectOrigins = [apiOrigin, app ? mcpOrigin : undefined, app ? frames : undefined].filter(
    (origin): origin is string => Boolean(origin) && origin !== 'self'
  )
  const connect = `connect-src 'self'${connectOrigins.map((origin) => ` ${origin}`).join('')}`
  // The nonce authorizes request-rendered Next scripts; the appearance hash
  // pins the reviewed theme bootstrap. style-src keeps 'unsafe-inline' for
  // the app's inline style attributes (see the control map).
  return [
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
}
