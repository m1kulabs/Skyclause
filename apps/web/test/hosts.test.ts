import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { LANGUAGE_COOKIE as AUTH_LANGUAGE_COOKIE } from '@skyclause/auth'
import {
  APP_PATH_HEADER,
  hostConfig,
  organisationToCheck,
  pageElsewhere,
  pagesOf,
  proxyResponse,
  routeRequest,
  type HostConfig
} from '../lib/hosts'
import { LANGUAGE_COOKIE } from '../lib/preferred-language'

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
  ['skyclause.m1ku.tech', '/landing/stadium-night.jpg', ['shared', '/landing/stadium-night.jpg']],
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
function routes(dir: string, root = dir): Array<{ path: string; group: string | null; kind: 'page' | 'route' }> {
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
    return [{ path, group, kind: entry.name === 'page.tsx' ? ('page' as const) : ('route' as const) }]
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

// Fix X: a page path asked of the wrong host of the pair is a link that crossed hosts. It is redirected to the
// configured origin of the host that builds it, path and query kept; anything else stays the not-found page.
describe('a page on the wrong host', () => {
  const answer = (url: string, o: { config?: HostConfig; method?: string; headers?: Record<string, string> } = {}) => {
    const response = proxyResponse(
      new NextRequest(url, { method: o.method ?? 'GET', headers: o.headers }),
      o.config ?? multi
    )
    const location = response.headers.get('location')
    return location
      ? `${response.status} ${location}`
      : response.headers.get('x-middleware-rewrite')?.endsWith('/_not-found')
        ? '404'
        : 'served'
  }
  const MARKETING = 'https://skyclause.m1ku.tech'
  const APP = 'https://app.skyclause.m1ku.tech'

  it.each<[string, string]>([
    // The app host's home is sign-in's continue: a member's organisation, or sign-in.
    [`${APP}/`, `307 ${APP}/api/auth/continue`],
    [`${APP}/?utm_source=deck`, `307 ${APP}/api/auth/continue`],
    [`${APP}/legal/privacy`, `307 ${MARKETING}/legal/privacy`],
    [`${APP}/legal/terms?from=sign-in#retention`, `307 ${MARKETING}/legal/terms?from=sign-in`],
    [`${APP}/ms/legal/privacy`, `307 ${MARKETING}/ms/legal/privacy`],
    [`${MARKETING}/sign-in`, `307 ${APP}/sign-in`],
    [`${MARKETING}/sign-in?next=%2Facme`, `307 ${APP}/sign-in?next=%2Facme`],
    [`${MARKETING}/sign-up`, `307 ${APP}/sign-up`],
    [`${MARKETING}/new`, `307 ${APP}/new`],
    [`${MARKETING}/connect?target=cursor`, `307 ${APP}/connect?target=cursor`],
    [`${MARKETING}/account/profile`, `307 ${APP}/account/profile`],
    [`${MARKETING}/developers/webhooks`, `307 ${APP}/developers/webhooks`],
    [`${MARKETING}/device`, `307 ${APP}/device`],
    [`${MARKETING}/oauth/consent`, `307 ${APP}/oauth/consent`],
    [`${MARKETING}/invite/tok`, `307 ${APP}/invite/tok`],
    [`${MARKETING}/subscribe/tok/unsubscribe`, `307 ${APP}/subscribe/tok/unsubscribe`],
    // An organisation's pages are never sent across: whether one exists is no question the marketing host answers.
    [`${MARKETING}/apu`, '404'],
    [`${MARKETING}/apu/bukit-jalil/windows`, '404'],
    [`${MARKETING}/apu/bukit-jalil/calls/c-1`, '404'],
    [`${MARKETING}/commons/bukit-jalil`, '404'],
    // Never the API, the bridge, assets or an unknown path: those stay the not-found page where they were asked.
    [`${MARKETING}/v1/projects`, '404'],
    [`${MARKETING}/api/me/memberships`, '404'],
    [`${APP}/v1/projects`, '404'],
    [`${APP}/openapi.json`, '404'],
    [`${APP}/status`, '404'],
    [`${APP}/legal/nothing-here`, '404'],
    [`${APP}/ms`, '404'],
    [`${MARKETING}/aaa/bbb/ccc/ddd`, '404'],
    [`${MARKETING}/apu/bukit-jalil/nothing-here`, '404'],
    // Only between the marketing and app hosts.
    ['https://api.skyclause.m1ku.tech/', '404'],
    ['https://api.skyclause.m1ku.tech/sign-in', '404'],
    ['https://mcp.skyclause.m1ku.tech/legal/privacy', '404'],
    [`https://${RUN_APP}/sign-in`, '404'],
    // Each host's own pages are served there.
    [`${MARKETING}/legal/privacy`, 'served'],
    [`${APP}/sign-in`, 'served']
  ])('GET %s → %s', (url, expected) => {
    expect(answer(url)).toBe(expected)
  })

  it('sends only the fixed app and auth pages across from the marketing host, never an organisation’s', () => {
    const at = (pathname: string) =>
      pageElsewhere({ ...multi, host: 'skyclause.m1ku.tech', pathname, search: '', method: 'GET' })
    for (const pathname of [
      '/sign-in',
      '/sign-up',
      '/new',
      '/connect',
      '/account/security',
      '/device',
      '/oauth/consent',
      '/invite/tok',
      '/subscribe/tok/data',
      '/developers/webhooks'
    ])
      expect(at(pathname)?.url.href, pathname).toBe(`https://app.skyclause.m1ku.tech${pathname}`)
    // No lookup and no redirect for an organisation's page: an existing one and an unknown one are the same not-found.
    for (const pathname of ['/apu', '/apu/bukit-jalil', '/commons/bukit-jalil', '/account/nothing-here', '/guest'])
      expect(at(pathname), pathname).toBeNull()
    for (const pathname of ['/Apu', '/a.b', '/_x/site', '/-x']) expect(at(pathname)).toBeNull()
  })

  it('marks every redirect uncacheable, so no browser or shared cache keeps one', () => {
    const cacheOf = (url: string, headers: Record<string, string> = {}) => {
      const response = proxyResponse(new NextRequest(url, { headers }), multi)
      expect(response.headers.get('location'), url).not.toBeNull()
      return `${response.status} ${response.headers.get('cache-control')}`
    }
    expect(cacheOf(`${MARKETING}/sign-in`)).toBe('307 no-store')
    expect(cacheOf(`${APP}/legal/privacy`)).toBe('307 no-store')
    expect(cacheOf(`${APP}/`)).toBe('307 no-store')
    expect(cacheOf(`${APP}/apu/site/windows`)).toBe('307 no-store')
  })

  it('redirects only reads: a form post to the wrong host stays the not-found page', () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect(answer(`${MARKETING}/sign-in`, { method }), method).toBe('404')
      expect(answer(`${APP}/`, { method }), method).toBe('404')
    }
    expect(answer(`${MARKETING}/sign-in`, { method: 'HEAD' })).toBe(`307 ${APP}/sign-in`)
  })

  it('sends only to the configured origins: a forged Host or X-Forwarded-Host never steers the redirect', () => {
    const forged = { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http', forwarded: 'host=evil.example' }
    expect(answer(`${MARKETING}/sign-in`, { headers: forged })).toBe(`307 ${APP}/sign-in`)
    expect(answer(`${APP}/legal/privacy`, { headers: forged })).toBe(`307 ${MARKETING}/legal/privacy`)
    // The Host header picks the host asked, never the destination; an unknown one is the not-found page.
    expect(answer('https://evil.example/sign-in')).toBe('404')
    expect(answer('https://skyclause.m1ku.tech.evil.example/sign-in')).toBe('404')
    expect(answer('https://evil.example/', { headers: { 'x-forwarded-host': 'app.skyclause.m1ku.tech' } })).toBe('404')
    // A path that looks like another origin is still a path on the configured one, or no page at all.
    expect(answer(`${APP}//evil.example/legal/privacy`)).not.toMatch(/^30/)
    const doubled = pageElsewhere({
      ...multi,
      host: 'app.skyclause.m1ku.tech',
      pathname: '//evil.example',
      search: '',
      method: 'GET'
    })
    expect(doubled).toBeNull()
    for (const pathname of ['/legal/privacy', '/', '/sign-in']) {
      for (const host of ['skyclause.m1ku.tech', 'app.skyclause.m1ku.tech']) {
        const target = pageElsewhere({ ...multi, host, pathname, search: '?x=//evil.example', method: 'GET' })
        if (target) expect([MARKETING, APP], `${host}${pathname}`).toContain(target.url.origin)
      }
    }
  })

  it('answers the router’s payload fetch with nothing to read, so it loads the page as a document instead', () => {
    for (const url of [`${MARKETING}/sign-in`, `${APP}/legal/privacy`, `${APP}/`]) {
      const fetches: Array<Record<string, string>> = [
        { 'next-url': '/sign-in' },
        { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' },
        { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'same-origin' }
      ]
      for (const headers of fetches) {
        const response = proxyResponse(new NextRequest(url, { headers }), multi)
        expect(
          `${response.status} ${response.headers.get('content-type')} ${response.headers.get('location')}`,
          url
        ).toBe('200 text/plain null')
      }
    }
    // A payload fetch of the host's own page, or of an unknown path, is served or the not-found page as before.
    expect(answer(`${APP}/sign-in`, { headers: { 'sec-fetch-dest': 'empty' } })).toBe('served')
    expect(answer(`${APP}/status`, { headers: { 'sec-fetch-dest': 'empty' } })).toBe('404')
    // A browser's own navigation, and a client that names no destination (a crawler, curl), get the redirect.
    expect(
      answer(`${MARKETING}/sign-in`, { headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' } })
    ).toBe(`307 ${APP}/sign-in`)
  })

  it('answers a marketing or public path that only an app page would match with the not-found page (#610)', () => {
    for (const config of [multi, single]) {
      for (const pathname of ['/legal/nothing-here', '/status', '/ms', '/ms/nothing-here', '/c/abc', '/p/apu']) {
        const response = proxyResponse(new NextRequest(`${MARKETING}${pathname}`), config)
        expect(response.headers.get('x-middleware-rewrite'), `${config.mode} ${pathname}`).toBe(
          `${MARKETING}/_not-found`
        )
      }
      // The pages and the public images are served as before.
      for (const pathname of ['/', '/legal/privacy', '/ms/legal/privacy', '/p/apu/site/og.png', '/c/abc/og.png'])
        expect(answer(`${MARKETING}${pathname}`, { config }), `${config.mode} ${pathname}`).toBe('served')
    }
    const malay = proxyResponse(new NextRequest(`${MARKETING}/ms/nothing-here`), multi)
    expect(malay.headers.get('x-middleware-request-x-skyclause-locale')).toBe('ms')
  })

  it('never redirects on one host (HOST_MODE=single)', () => {
    // Signed in, so only a host could send anyone elsewhere.
    const headers = { cookie: 'better-auth.session_token=abc' }
    for (const url of [`${APP}/`, `${APP}/legal/privacy`, `${MARKETING}/sign-in`, `${MARKETING}/apu/site`])
      expect(answer(url, { config: single, headers }), url).toBe('served')
  })

  it('lists exactly the pages app/ builds, by the host that serves each', () => {
    const found = routes(join(import.meta.dirname, '../app')).filter((route) => route.group)
    const pattern = (path: string) => path.replace(/\/x(?=\/|$)/g, '/:x')
    const built = (groups: string[]) =>
      found
        .filter((route) => groups.includes(route.group!) && !/\.(?:png|ics|svg|js|webmanifest)$/.test(route.path))
        .filter((route) => route.kind === 'page')
        .map((route) => pattern(route.path))
        .sort()
    const listed = (surface: 'marketing' | 'app') =>
      pagesOf(surface)
        .map((page) => page.replace(/:\w+/g, ':x'))
        .sort()
    expect(listed('marketing')).toEqual(built(['(marketing)', '(public)']))
    expect(listed('app')).toEqual(built(['(auth)', '(app)', '(camera)']))
  })
})

describe('what the proxy adds for the route', () => {
  const forwarded = (url: string, headers: Record<string, string> = {}) => {
    const response = proxyResponse(new NextRequest(url, { headers }), multi)
    return (name: string) => response.headers.get(`x-middleware-request-${name}`)
  }

  it('puts the saved language in place of Accept-Language (LOC-1)', () => {
    const malay = forwarded('https://app.skyclause.m1ku.tech/account/appearance', {
      cookie: `__Secure-better-auth.session_token=abc; ${LANGUAGE_COOKIE}=ms`,
      'accept-language': 'en-GB,en;q=0.9'
    })
    expect(malay('accept-language')).toBe('ms')
    const english = forwarded('https://app.skyclause.m1ku.tech/sign-in', {
      cookie: `other=1; ${LANGUAGE_COOKIE}=en`,
      'accept-language': 'ms-MY'
    })
    expect(english('accept-language')).toBe('en')
    // No saved language, or one Skyclause doesn't write: the browser's own stands.
    for (const cookie of ['', `${LANGUAGE_COOKIE}=fr`]) {
      const browser = forwarded('https://app.skyclause.m1ku.tech/sign-in', { cookie, 'accept-language': 'ms-MY' })
      expect(browser('accept-language'), cookie).toBeNull()
    }
  })

  it('keeps the saved language off public and marketing routes, whose answers a shared cache may keep', () => {
    // A share card varies by Accept-Language only: the cookie must not change what that header says.
    for (const url of [
      'https://skyclause.m1ku.tech/c/abc/og.png',
      'https://skyclause.m1ku.tech/p/apu/site/og.png',
      'https://skyclause.m1ku.tech/legal/privacy',
      'https://skyclause.m1ku.tech/og.png?page=landing&lang=en',
      'https://skyclause.m1ku.tech/'
    ]) {
      const card = forwarded(url, { cookie: `${LANGUAGE_COOKIE}=ms`, 'accept-language': 'en-GB' })
      // Untouched, or passed on as the browser sent it with the route's other headers: never the cookie's.
      expect(card('accept-language') ?? 'en-GB', url).toBe('en-GB')
    }
  })

  it('writes the cookie name sign-in sets', () => {
    expect(LANGUAGE_COOKIE).toBe(AUTH_LANGUAGE_COOKIE)
  })

  it('tells an (app) page its own path and query for sign-in’s return path, which a request cannot set', () => {
    const own = forwarded('https://app.skyclause.m1ku.tech/apu/site/windows?view=month&_rsc=abc', {
      [APP_PATH_HEADER]: '//evil.example',
      cookie: '__Secure-better-auth.session_token=abc'
    })
    expect(own(APP_PATH_HEADER)).toBe('/apu/site/windows?view=month')
    expect(forwarded('https://app.skyclause.m1ku.tech/sign-in')(APP_PATH_HEADER)).toBeNull()
  })

  it('sends a visit with no credential at all to sign in first, with its page as the return path', () => {
    const visit = (path: string, headers: Record<string, string> = {}, method = 'GET') => {
      const response = proxyResponse(
        new NextRequest(`https://app.skyclause.m1ku.tech${path}`, { headers, method }),
        multi
      )
      return response.headers.get('location') ? `${response.status} ${response.headers.get('location')}` : 'served'
    }
    expect(visit('/apu')).toBe('307 https://app.skyclause.m1ku.tech/sign-in?next=%2Fapu')
    expect(visit('/apu/site/ledger?tab=evidence')).toBe(
      '307 https://app.skyclause.m1ku.tech/sign-in?next=%2Fapu%2Fsite%2Fledger%3Ftab%3Devidence'
    )
    for (const path of ['/account/profile', '/connect', '/new', '/developers/webhooks', '/apu/settings/members'])
      expect(visit(path), path).toMatch(/^307 https:\/\/app\.skyclause\.m1ku\.tech\/sign-in\?next=/)
    // Any credential is the page's to judge: a session (even an expired one), a share link, a bearer, a test principal.
    const credentials: Array<Record<string, string>> = [
      { cookie: 'better-auth.session_token=abc' },
      { cookie: 'theme=x; __Secure-better-auth.session_token=abc' },
      { cookie: 'sc_share=tok' },
      { cookie: 'skyclause_test_principal=null' },
      { authorization: 'Bearer abc' }
    ]
    for (const headers of credentials)
      expect(visit('/apu/site/ledger', headers), JSON.stringify(headers)).toBe('served')
    // Sign-in itself, the camera's own page, an unknown path and a post are not this redirect.
    for (const path of ['/sign-in', '/apu/site/camera/source-1', '/aaa/bbb/ccc/ddd', '/api/me/memberships'])
      expect(visit(path), path).toBe('served')
    expect(visit('/apu/site', {}, 'POST')).toBe('served')
    // A language cookie is no credential.
    expect(visit('/apu', { cookie: 'skyclause-language=ms' })).toBe(
      '307 https://app.skyclause.m1ku.tech/sign-in?next=%2Fapu'
    )
  })

  it('answers a signed-out visit to any organisation alike, with no organisation looked up', () => {
    const signedOut = (path: string) => {
      const request = new NextRequest(`https://app.skyclause.m1ku.tech${path}`)
      const response = proxyResponse(request, multi)
      return {
        lookup: organisationToCheck(request, multi),
        answer: `${response.status} ${response.headers.get('cache-control')}`,
        location: response.headers.get('location')?.replace(encodeURIComponent(path), '{path}')
      }
    }
    const existing = signedOut('/apu')
    expect(existing).toEqual({
      lookup: null,
      answer: '307 no-store',
      location: 'https://app.skyclause.m1ku.tech/sign-in?next={path}'
    })
    expect(signedOut('/no-such-organisation')).toEqual(existing)
    // With a credential, proxy.ts looks up a one-segment organisation, so an unknown one is a real 404 (#610).
    const credential = { cookie: '__Secure-better-auth.session_token=abc' }
    const lookup = (path: string) =>
      organisationToCheck(new NextRequest(`https://app.skyclause.m1ku.tech${path}`, { headers: credential }), multi)
    expect(lookup('/apu')).toBe('apu')
    for (const path of ['/new', '/connect', '/account', '/apu/site', '/sign-in', '/legal/privacy'])
      expect(lookup(path), path).toBeNull()
    expect(
      organisationToCheck(new NextRequest('https://skyclause.m1ku.tech/apu', { headers: credential }), multi)
    ).toBeNull()
  })

  it('serves the beacon on every host, so a page posts to its own origin', () => {
    for (const host of [...Object.values(ORIGINS).map((origin) => new URL(origin).host), RUN_APP]) {
      expect(routeRequest({ ...multi, host, pathname: '/e' }), host).toEqual({ group: '/e', pathname: '/e' })
    }
  })

  it('serves the share cards on the marketing host', () => {
    expect(routeRequest({ ...multi, host: 'skyclause.m1ku.tech', pathname: '/og.png' })?.group).toBe('/og.png')
    expect(routeRequest({ ...multi, host: 'app.skyclause.m1ku.tech', pathname: '/og.png' })).toBeNull()
  })

  it('answers robots.txt on every host and the sitemap on the marketing host', () => {
    for (const host of [...Object.values(ORIGINS).map((origin) => new URL(origin).host), RUN_APP]) {
      expect(routeRequest({ ...multi, host, pathname: '/robots.txt' })?.group, host).toBe('/robots.txt')
    }
    expect(routeRequest({ ...multi, host: 'skyclause.m1ku.tech', pathname: '/sitemap.xml' })?.group).toBe(
      '/sitemap.xml'
    )
    expect(routeRequest({ ...multi, host: 'app.skyclause.m1ku.tech', pathname: '/sitemap.xml' })).toBeNull()
  })
})
