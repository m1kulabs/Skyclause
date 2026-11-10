// a-hardening (#115): every response carries the NFR-10 security headers, with a
// nonce per request and headers chosen by host. The built app proves behaviour in
// e2e/hardening.spec.ts; this suite pins the header contract per route group.
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { securityHeaders } from '../features/hardening/security-headers'
import { hostConfig, type HostConfig } from '../lib/hosts'
import { APPEARANCE_SCRIPT } from '../lib/theme'

const ORIGINS = {
  HOST_MODE: 'multi',
  MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
  APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
  API_ORIGIN: 'https://api.skyclause.m1ku.tech',
  MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
  EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
  DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech'
} as const

const multi = hostConfig(ORIGINS)
const single = hostConfig({ HOST_MODE: 'single' })

const nonceOf = (csp: string) => {
  const match = /script-src[^;]*'nonce-([^']+)'/.exec(csp)
  expect(match, 'CSP carries a script nonce').not.toBeNull()
  return match![1]!
}

// [path, host] per route group, in HOST_MODE=multi.
const MULTI: Array<[string, string]> = [
  ['/health', 'skyclause.m1ku.tech'],
  ['/v1/projects', 'api.skyclause.m1ku.tech'],
  ['/api/me/memberships', 'app.skyclause.m1ku.tech'],
  ['/mcp', 'mcp.skyclause.m1ku.tech'],
  ['/.well-known/oauth-protected-resource', 'mcp.skyclause.m1ku.tech'],
  ['/.well-known/oauth-authorization-server', 'app.skyclause.m1ku.tech'],
  ['/sw.js', 'app.skyclause.m1ku.tech'],
  ['/openapi.json', 'skyclause.m1ku.tech'],
  ['/oembed', 'skyclause.m1ku.tech'],
  ['/e', 'skyclause.m1ku.tech'],
  ['/skills', 'skyclause.m1ku.tech'],
  ['/apu/bukit-jalil/ledger', 'embed.skyclause.m1ku.tech'],
  ['/docs/guides', 'docs.skyclause.m1ku.tech'],
  ['/quality-planted/vitals', 'skyclause.m1ku.tech'],
  ['/', 'skyclause.m1ku.tech'],
  ['/status', 'skyclause.m1ku.tech'],
  ['/sign-in', 'app.skyclause.m1ku.tech'],
  ['/apu/bukit-jalil', 'app.skyclause.m1ku.tech'],
  ['/apu/bukit-jalil/camera/source-1', 'app.skyclause.m1ku.tech']
]

// [path] in HOST_MODE=single, all on one origin.
const SINGLE = [
  '/health',
  '/v1/projects',
  '/api/me/memberships',
  '/mcp',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/sw.js',
  '/openapi.json',
  '/oembed',
  '/e',
  '/skills',
  '/embed/apu/bukit-jalil',
  '/docs/guides',
  '/quality-planted/vitals',
  '/',
  '/status',
  '/sign-in',
  '/apu/bukit-jalil',
  '/apu/bukit-jalil/camera/source-1'
]

const run = (url: string, config: HostConfig) => securityHeaders(new NextRequest(url), config)
const csp = (url: string, config: HostConfig) => run(url, config).headers.get('Content-Security-Policy') ?? ''

afterEach(() => vi.unstubAllEnvs())

describe('securityHeaders', () => {
  it('sends HSTS without preload, nosniff and strict-origin-when-cross-origin on every route in both modes', () => {
    for (const [path, host] of MULTI) {
      const headers = run(`https://${host}${path}`, multi).headers
      expect(headers.get('Strict-Transport-Security'), path).toBe('max-age=63072000; includeSubdomains')
      expect(headers.get('Strict-Transport-Security'), path).not.toContain('preload')
      expect(headers.get('X-Content-Type-Options'), path).toBe('nosniff')
      expect(headers.get('Referrer-Policy'), path).toBe('strict-origin-when-cross-origin')
    }
    for (const path of SINGLE) {
      const headers = run(`https://app.skyclause.m1ku.tech${path}`, single).headers
      expect(headers.get('Strict-Transport-Security'), path).toBe('max-age=63072000; includeSubdomains')
      expect(headers.get('X-Content-Type-Options'), path).toBe('nosniff')
      expect(headers.get('Referrer-Policy'), path).toBe('strict-origin-when-cross-origin')
    }
  })

  it('sends the ticket CSP with a fresh nonce per request', () => {
    const first = csp('https://app.skyclause.m1ku.tech/apu/bukit-jalil', multi)
    const second = csp('https://app.skyclause.m1ku.tech/apu/bukit-jalil', multi)
    expect(nonceOf(first)).not.toBe(nonceOf(second))
    for (const directive of [
      "default-src 'self'",
      "'strict-dynamic'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'"
    ]) {
      expect(first, directive).toContain(directive)
    }
  })

  it('allows Connect to fetch tools from the MCP origin on app routes only', () => {
    vi.stubEnv('MCP_ORIGIN', ORIGINS.MCP_ORIGIN)
    const app = csp('https://app.skyclause.m1ku.tech/connect', multi)
    const marketing = csp('https://skyclause.m1ku.tech/', multi)

    expect(app).toContain(ORIGINS.MCP_ORIGIN)
    expect(marketing).not.toContain(ORIGINS.MCP_ORIGIN)
  })

  it('lets probation fetch its signed frames from the frames bucket alone, on app routes only', () => {
    vi.stubEnv('FRAMES_BUCKET', 'skyclause-production-frames')
    const app = csp('https://app.skyclause.m1ku.tech/apu/bukit-jalil/signals/probation/camera-1', multi)
    const marketing = csp('https://skyclause.m1ku.tech/', multi)

    expect(app).toMatch(/connect-src [^;]* https:\/\/storage\.googleapis\.com\/skyclause-production-frames\/(;|$)/)
    expect(app).not.toMatch(/https:\/\/storage\.googleapis\.com(;| )/)
    expect(marketing).not.toContain('storage.googleapis.com')
  })

  it('allow-lists the static appearance script by hash beside the nonce', () => {
    const hash = `'sha256-${createHash('sha256').update(APPEARANCE_SCRIPT).digest('base64')}'`
    for (const [url, config] of [
      ['https://skyclause.m1ku.tech/', multi],
      ['https://app.skyclause.m1ku.tech/sign-in', multi]
    ] as const) {
      const header = csp(url, config)
      expect(header).toContain(`script-src 'nonce-${nonceOf(header)}' 'strict-dynamic' ${hash}`)
    }
  })

  it('frames nothing outside embeds, and drops COOP there for the resize postMessage', () => {
    for (const [path, host] of MULTI) {
      const headers = run(`https://${host}${path}`, multi).headers
      const embed = host === 'embed.skyclause.m1ku.tech'
      expect(headers.get('Content-Security-Policy'), path).toContain(
        embed ? 'frame-ancestors *' : "frame-ancestors 'none'"
      )
      expect(headers.get('Cross-Origin-Opener-Policy'), path).toBe(embed ? null : 'same-origin')
    }
    const embed = run('https://app.skyclause.m1ku.tech/embed/apu/bukit-jalil', single).headers
    expect(embed.get('Content-Security-Policy')).toContain('frame-ancestors *')
    expect(embed.get('Cross-Origin-Opener-Policy')).toBeNull()
    expect(
      run('https://app.skyclause.m1ku.tech/apu/bukit-jalil', single).headers.get('Cross-Origin-Opener-Policy')
    ).toBe('same-origin')
  })

  it('denies camera, microphone and geolocation except camera=(self) on the camera route', () => {
    const plain = run('https://app.skyclause.m1ku.tech/apu/bukit-jalil', multi).headers.get('Permissions-Policy')
    expect(plain).toBe('camera=(), microphone=(), geolocation=()')
    const camera = run('https://app.skyclause.m1ku.tech/apu/bukit-jalil/camera/source-1', multi).headers.get(
      'Permissions-Policy'
    )
    expect(camera).toBe('camera=(self), microphone=(), geolocation=()')
  })

  it('keeps the headers on the 404 page for unknown hosts and cross-surface paths', () => {
    const unknown = run('https://web-413187272599.asia-southeast1.run.app/', multi)
    expect(unknown.headers.get('x-middleware-rewrite')).toContain('/_not-found')
    expect(unknown.headers.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubdomains')
    expect(unknown.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    const cross = run('https://skyclause.m1ku.tech/sign-in', multi)
    expect(cross.headers.get('x-middleware-rewrite')).toContain('/_not-found')
    expect(cross.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
  })

  it('sets no cookie', () => {
    for (const [path, host] of MULTI) {
      expect(run(`https://${host}${path}`, multi).headers.get('set-cookie'), path).toBeNull()
    }
  })
})
