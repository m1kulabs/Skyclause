import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { hostConfig, proxyResponse, routeRequest, type HostConfig } from '../lib/hosts'

const ORIGINS = {
  MARKETING_ORIGIN: 'https://skyclause.m1ku.tech',
  APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
  API_ORIGIN: 'https://api.skyclause.m1ku.tech',
  MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech',
  EMBED_ORIGIN: 'https://embed.skyclause.m1ku.tech',
  DOCS_ORIGIN: 'https://docs.skyclause.m1ku.tech'
}
const multi = hostConfig({ HOST_MODE: 'multi', ...ORIGINS })
const single = hostConfig({ HOST_MODE: 'single' })
const RUN_APP = 'web-413187272599.asia-southeast1.run.app'

// Spec §4 Hosts: [host, path, route group (with the path it is served as) or null for 404].
const MULTI: Array<[string, string, [string, string] | null]> = [
  ['skyclause.m1ku.tech', '/', ['(marketing)', '/']],
  ['skyclause.m1ku.tech', '/ms', ['(marketing)', '/ms']],
  ['skyclause.m1ku.tech', '/legal/privacy', ['(public)', '/legal/privacy']],
  ['skyclause.m1ku.tech', '/legal/terms', ['(public)', '/legal/terms']],
  ['skyclause.m1ku.tech', '/ms/legal/privacy', ['(public)', '/ms/legal/privacy']],
  ['skyclause.m1ku.tech', '/status', ['(public)', '/status']],
  ['skyclause.m1ku.tech', '/p/apu/bukit-jalil/ledger', ['(public)', '/p/apu/bukit-jalil/ledger']],
  ['skyclause.m1ku.tech', '/c/0192f0e4/og.png', ['(public)', '/c/0192f0e4/og.png']],
  ['skyclause.m1ku.tech', '/oembed', ['/oembed', '/oembed']],
  ['skyclause.m1ku.tech', '/openapi.json', ['/openapi.json', '/openapi.json']],
  ['skyclause.m1ku.tech', '/skills', ['/skills', '/skills']],
  ['skyclause.m1ku.tech', '/e', ['/e', '/e']],
  ['skyclause.m1ku.tech', '/apu', null],
  ['skyclause.m1ku.tech', '/aaa/bbb', null],
  ['skyclause.m1ku.tech', '/sign-in', null],
  ['skyclause.m1ku.tech', '/v1/projects', null],
  ['skyclause.m1ku.tech', '/api/me/memberships', null],
  ['app.skyclause.m1ku.tech', '/sign-in', ['(auth)', '/sign-in']],
  ['app.skyclause.m1ku.tech', '/device', ['(auth)', '/device']],
  ['app.skyclause.m1ku.tech', '/invite/tok', ['(auth)', '/invite/tok']],
  ['app.skyclause.m1ku.tech', '/apu/bukit-jalil/windows', ['(app)', '/apu/bukit-jalil/windows']],
  ['app.skyclause.m1ku.tech', '/account/security', ['(app)', '/account/security']],
  ['app.skyclause.m1ku.tech', '/api/me/memberships', ['/api', '/api/me/memberships']],
  ['app.skyclause.m1ku.tech', '/api/auth/session', ['/api', '/api/auth/session']],
  ['app.skyclause.m1ku.tech', '/sw.js', ['/sw.js', '/sw.js']],
  [
    'app.skyclause.m1ku.tech',
    '/.well-known/oauth-authorization-server',
    ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server']
  ],
  ['app.skyclause.m1ku.tech', '/', null],
  ['app.skyclause.m1ku.tech', '/status', null],
  ['app.skyclause.m1ku.tech', '/v1/projects', null],
  ['app.skyclause.m1ku.tech', '/openapi.json', null],
  ['api.skyclause.m1ku.tech', '/v1/projects', ['/v1', '/v1/projects']],
  ['api.skyclause.m1ku.tech', '/v1', ['/v1', '/v1']],
  ['api.skyclause.m1ku.tech', '/', null],
  ['api.skyclause.m1ku.tech', '/api/me/memberships', null],
  ['mcp.skyclause.m1ku.tech', '/mcp', ['/mcp', '/mcp']],
  [
    'mcp.skyclause.m1ku.tech',
    '/.well-known/oauth-protected-resource/mcp',
    ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']
  ],
  ['mcp.skyclause.m1ku.tech', '/v1/projects', null],
  ['embed.skyclause.m1ku.tech', '/apu/bukit-jalil', ['(embed)', '/embed/apu/bukit-jalil']],
  ['embed.skyclause.m1ku.tech', '/elements/v1.js', ['/elements', '/elements/v1.js']],
  ['docs.skyclause.m1ku.tech', '/guides/quickstart', ['docs', '/docs/guides/quickstart']],
  // WEB-1's icons and manifest, /health and Next's assets answer on every host, the run.app URL included.
  [RUN_APP, '/health', ['shared', '/health']],
  ['api.skyclause.m1ku.tech', '/health', ['shared', '/health']],
  ['embed.skyclause.m1ku.tech', '/favicon.ico', ['shared', '/favicon.ico']],
  ['docs.skyclause.m1ku.tech', '/manifest.webmanifest', ['shared', '/manifest.webmanifest']],
  ['mcp.skyclause.m1ku.tech', '/icons/icon-192.png', ['shared', '/icons/icon-192.png']],
  ['app.skyclause.m1ku.tech', '/_next/static/chunks/app.js', ['shared', '/_next/static/chunks/app.js']],
  [RUN_APP, '/', null],
  [RUN_APP, '/v1/projects', null],
  ['skyclause.m1ku.tech.evil.example', '/', null]
]

describe('HOST_MODE=multi', () => {
  it.each(MULTI)('%s%s → %j', (host, pathname, expected) => {
    const target = routeRequest({ ...multi, host, pathname })
    expect(target && [target.group, target.pathname]).toEqual(expected)
  })

  it('matches the host case-insensitively and with its port', () => {
    const local = hostConfig({ HOST_MODE: 'multi', ...ORIGINS, API_ORIGIN: 'http://localhost:3101' })
    expect(routeRequest({ ...local, host: 'LOCALHOST:3101', pathname: '/v1/me' })?.group).toBe('/v1')
    expect(routeRequest({ ...local, host: 'localhost:3102', pathname: '/v1/me' })).toBeNull()
  })
})

// Test builds (PLANTED_ROUTES=1) serve the planted pages on the marketing host; production serves none, and deploy's
// @smoke run expects 404. A path the proxy lets through is matched by the app's `/[org]/[project]` page whichever host
// asked, and its notFound() answers 200 (#610), so without the flag the prefixes are no route on any host: the proxy
// rewrites them to the not-found page.
describe('test-only routes', () => {
  const PLANTED = ['/_test/tokens', '/_test/nothing-here', '/quality-planted/motion', '/quality-planted/vitals']
  const HOSTS = [...Object.values(ORIGINS).map((origin) => new URL(origin).host), RUN_APP]
  const planted = hostConfig({ HOST_MODE: 'multi', PLANTED_ROUTES: '1', ...ORIGINS })

  it.each(PLANTED)(
    'PLANTED_ROUTES=1 serves %s on the marketing host, not on the app, api, mcp or run.app hosts',
    (pathname) => {
      expect(routeRequest({ ...planted, host: 'skyclause.m1ku.tech', pathname })).toEqual({
        group: 'planted',
        pathname
      })
      for (const host of ['app.skyclause.m1ku.tech', 'api.skyclause.m1ku.tech', 'mcp.skyclause.m1ku.tech', RUN_APP]) {
        expect(routeRequest({ ...planted, host, pathname }), host).toBeNull()
      }
    }
  )

  it('are no route on any host, in either mode, without PLANTED_ROUTES', () => {
    for (const config of [multi, single]) {
      for (const host of HOSTS) {
        for (const pathname of PLANTED) {
          expect(routeRequest({ ...config, host, pathname }), `${config.mode} ${host}${pathname}`).toBeNull()
        }
      }
    }
  })

  it('are rewritten to the not-found page without PLANTED_ROUTES', () => {
    for (const [config, host] of [
      [multi, 'skyclause.m1ku.tech'],
      [single, 'skyclause.m1ku.tech']
    ] as const) {
      for (const pathname of PLANTED) {
        const response = proxyResponse(new NextRequest(`https://${host}${pathname}`), config)
        expect(response.headers.get('x-middleware-rewrite'), `${config.mode} ${pathname}`).toBe(
          `https://${host}/_not-found`
        )
        expect(response.headers.get('x-middleware-next')).toBeNull()
      }
    }
  })
})

describe('HOST_MODE=single', () => {
  it.each<[string, string]>([
    ['/', '(marketing)'],
    ['/status', '(public)'],
    ['/sign-in', '(auth)'],
    ['/apu/bukit-jalil', '(app)'],
    ['/embed/apu/bukit-jalil', '(embed)'],
    ['/docs/guides/quickstart', 'docs'],
    ['/v1/projects', '/v1'],
    ['/api/me/memberships', '/api'],
    ['/mcp', '/mcp'],
    ['/health', 'shared']
  ])('serves %s as %s on one origin, any host', (pathname, group) => {
    expect(routeRequest({ ...single, host: RUN_APP, pathname })).toEqual({ group, pathname })
  })

  it('is the default when HOST_MODE is unset', () => {
    expect(hostConfig({}).mode).toBe('single')
  })
})

// Every page and route handler under app/, by the route group it sits in, is served on that group's host.
function routes(dir: string, root = dir): Array<{ path: string; group: string | null }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    // `_name` folders are private and `page.plant.tsx` routes exist only in test builds.
    if (entry.isDirectory()) return entry.name.startsWith('_') ? [] : routes(full, root)
    if (!/^(page\.tsx|route\.ts)$/.test(entry.name)) return []
    const segments = relative(root, dir).split(sep).filter(Boolean)
    const group = segments.find((segment) => /^\(.+\)$/.test(segment)) ?? null
    const path = `/${segments
      .filter((segment) => !/^\(.+\)$/.test(segment))
      .map((segment) =>
        decodeURIComponent(segment)
          .replace(/^\[\[?\.\.\.[^\]]+\]\]?$/, 'any')
          .replace(/^\[[^\]]+\]$/, 'x')
      )
      .join('/')}`
    return [{ path, group }]
  })
}

const HOST_OF: Record<string, string> = {
  '(marketing)': 'skyclause.m1ku.tech',
  '(public)': 'skyclause.m1ku.tech',
  '(auth)': 'app.skyclause.m1ku.tech',
  '(app)': 'app.skyclause.m1ku.tech',
  '(camera)': 'app.skyclause.m1ku.tech'
}

it('serves every built page in its route group on that group’s host in multi mode', () => {
  const found = routes(join(import.meta.dirname, '../app'))
  expect(found.length).toBeGreaterThan(20)
  for (const { path, group } of found.filter((route) => route.group)) {
    const host = HOST_OF[group!]
    expect(host, `no host for ${group}`).toBeDefined()
    expect(routeRequest({ ...multi, host: host!, pathname: path }), `${group} ${path}`).not.toBeNull()
  }
})

describe('proxy.ts', () => {
  const run = (url: string, config: HostConfig = multi) => {
    const request = new NextRequest(url)
    return proxyResponse(request, config)
  }

  it('rewrites a host to its route group, answers 404 elsewhere, and sets no cookie', () => {
    const embed = run('https://embed.skyclause.m1ku.tech/apu/bukit-jalil?theme=dark')
    expect(embed.headers.get('x-middleware-rewrite')).toBe(
      'https://embed.skyclause.m1ku.tech/embed/apu/bukit-jalil?theme=dark'
    )

    const unknown = run(`https://${RUN_APP}/`)
    expect(unknown.headers.get('x-middleware-rewrite')).toBe(`https://${RUN_APP}/_not-found`)

    const passed = run('https://api.skyclause.m1ku.tech/v1/projects')
    expect(passed.headers.get('x-middleware-next')).toBe('1')
    expect(passed.headers.get('x-middleware-rewrite')).toBeNull()

    const malay = run('https://skyclause.m1ku.tech/ms/legal/privacy')
    expect(malay.headers.get('x-middleware-request-x-skyclause-locale')).toBe('ms')

    const terms = run('https://skyclause.m1ku.tech/legal/terms')
    expect(terms.headers.get('x-middleware-request-x-skyclause-public-path')).toBe('/legal/terms')

    // The public locale is added to the downstream headers `securityHeaders` passes, never in place of its nonce.
    const nonced = proxyResponse(new NextRequest('https://skyclause.m1ku.tech/legal/privacy'), multi, {
      request: { headers: new Headers({ 'x-nonce': 'abc', 'content-security-policy': "script-src 'nonce-abc'" }) }
    })
    expect(nonced.headers.get('x-middleware-request-x-nonce')).toBe('abc')
    expect(nonced.headers.get('x-middleware-request-content-security-policy')).toBe("script-src 'nonce-abc'")
    expect(nonced.headers.get('x-middleware-request-x-skyclause-locale')).toBe('en')

    // Cookies stay host-only: the proxy never writes one, and every rewrite stays on the request's own host.
    for (const response of [embed, unknown, passed]) expect(response.headers.get('set-cookie')).toBeNull()
    for (const response of [embed, unknown]) {
      expect(new URL(response.headers.get('x-middleware-rewrite')!).host).toBe(
        new URL(response === embed ? 'https://embed.skyclause.m1ku.tech' : `https://${RUN_APP}`).host
      )
    }
  })
})
