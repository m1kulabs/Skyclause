import { NextResponse, type NextRequest } from 'next/server'

// Spec §4 Hosts and PRD "Information architecture": which host serves which route group under HOST_MODE=multi.
// HOST_MODE=single (production before the domain mappings, D46) serves everything on one origin, with the embed
// frames and the docs export under /embed/ and /docs/.

export type Surface = 'marketing' | 'app' | 'api' | 'mcp' | 'embed' | 'docs'

export interface HostConfig {
  mode: 'single' | 'multi'
  /** Each surface's `*_ORIGIN` host, such as `app.skyclause.m1ku.tech`. */
  hosts: Partial<Record<Surface, string>>
  /** Each surface's `*_ORIGIN` origin, such as `https://app.skyclause.m1ku.tech`: where a redirect may go. */
  origins: Partial<Record<Surface, string>>
  /** PLANTED_ROUTES=1: the test build serves its `planted` pages. Production has none, so those paths are no route. */
  planted: boolean
}

const ORIGIN_VARS: Record<Surface, string> = {
  marketing: 'MARKETING_ORIGIN',
  app: 'APP_ORIGIN',
  api: 'API_ORIGIN',
  mcp: 'MCP_ORIGIN',
  embed: 'EMBED_ORIGIN',
  docs: 'DOCS_ORIGIN'
}

/** From the web env, which `loadEnv('web')` checked at start: multi has all six origins. */
export function hostConfig(env: Record<string, string | undefined>): HostConfig {
  const hosts: HostConfig['hosts'] = {}
  const origins: HostConfig['origins'] = {}
  for (const [surface, name] of Object.entries(ORIGIN_VARS) as Array<[Surface, string]>) {
    const origin = env[name]
    if (origin) {
      hosts[surface] = new URL(origin).host
      origins[surface] = new URL(origin).origin
    }
  }
  return { mode: env.HOST_MODE === 'multi' ? 'multi' : 'single', hosts, origins, planted: env.PLANTED_ROUTES === '1' }
}

const exact =
  (...paths: string[]) =>
  (path: string) =>
    paths.includes(path)
const under =
  (...prefixes: string[]) =>
  (path: string) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

// First match wins; a null surface answers on every host. `(app)` takes whatever is left, as its `/{org}` does.
const ROUTES: Array<{ group: string; surface: Surface | null; match: (path: string) => boolean }> = [
  {
    group: 'shared',
    surface: null,
    match: (path) =>
      exact('/favicon.ico', '/icon.svg', '/apple-touch-icon.png', '/manifest.webmanifest', '/health')(path) ||
      under('/icons', '/landing', '/_next')(path)
  },
  // Every page beacons its vitals to its own origin (D40), so each host's CSP `connect-src 'self'` covers it; each host
  // answers its own robots.txt. Neither can be an organisation: a slug has no dot and is at least two characters.
  { group: '/e', surface: null, match: exact('/e') },
  { group: '/robots.txt', surface: null, match: exact('/robots.txt') },
  { group: '/v1', surface: 'api', match: under('/v1') },
  { group: '/api', surface: 'app', match: under('/api') },
  { group: '/mcp', surface: 'mcp', match: under('/mcp') },
  {
    group: '/.well-known/oauth-protected-resource',
    surface: 'mcp',
    match: under('/.well-known/oauth-protected-resource')
  },
  {
    group: '/.well-known/oauth-authorization-server',
    surface: 'app',
    match: under('/.well-known/oauth-authorization-server')
  },
  { group: '/sw.js', surface: 'app', match: exact('/sw.js') },
  { group: '/openapi.json', surface: 'marketing', match: exact('/openapi.json') },
  { group: '/oembed', surface: 'marketing', match: exact('/oembed') },
  { group: '/sitemap.xml', surface: 'marketing', match: exact('/sitemap.xml') },
  { group: '/og.png', surface: 'marketing', match: exact('/og.png') },
  { group: '/skills', surface: 'marketing', match: under('/skills') },
  { group: '/elements', surface: 'embed', match: under('/elements') },
  { group: '(embed)', surface: 'embed', match: under('/embed') },
  { group: 'docs', surface: 'docs', match: under('/docs') },
  // Test builds only (PLANTED_ROUTES=1); on the marketing host, where deploy's @smoke run checks production has none.
  // `routeRequest` answers null for it unless `planted`: with no page of its own, Next would match `/_test/x` to the
  // app's `/[org]/[project]`, whose notFound() answers 200 once the shell streams (#610). Null is the 404.
  { group: 'planted', surface: 'marketing', match: under('/_test', '/quality-planted') },
  {
    group: '(marketing)',
    surface: 'marketing',
    match: (path) => path === '/' || (under('/ms')(path) && !under('/ms/legal')(path))
  },
  { group: '(public)', surface: 'marketing', match: under('/status', '/p', '/c', '/legal', '/ms/legal') },
  {
    group: '(auth)',
    surface: 'app',
    match: under('/sign-in', '/sign-up', '/guest', '/device', '/oauth', '/invite', '/share', '/subscribe')
  },
  { group: '(app)', surface: 'app', match: () => true }
]

const classify = (pathname: string) => ROUTES.find((route) => route.match(pathname))!

/** The route group and the path to serve for a request, or null for 404. */
export function routeRequest(o: HostConfig & { host: string; pathname: string }): {
  group: string
  pathname: string
} | null {
  const route = classify(o.pathname)
  if (route.group === 'planted' && !o.planted) return null
  if (o.mode === 'single' || route.surface === null) return { group: route.group, pathname: o.pathname }
  const host = o.host.toLowerCase()
  const surface = (Object.entries(o.hosts) as Array<[Surface, string]>).find(([, value]) => value === host)?.[0]
  if (!surface) return null
  if (route.surface === surface) return { group: route.group, pathname: o.pathname }
  // embed.… and docs.… serve their trees from the root, held under /embed/ and /docs/.
  if (surface === 'embed' || surface === 'docs') {
    const pathname = `/${surface}${o.pathname}`
    const inner = classify(pathname)
    if (inner.surface === surface) return { group: inner.group, pathname }
  }
  return null
}

/**
 * The pages each host builds, as app/ lays them out (`:name` is a parameter; test/hosts.test.ts holds this list to the
 * app/ tree). A page of one host asked of the other is a link that crossed hosts, so it is sent there.
 */
const PAGES: Record<'marketing' | 'app', string[]> = {
  marketing: ['/', '/legal/privacy', '/legal/terms', '/ms/legal/privacy'],
  app: [
    // (auth)
    '/sign-in',
    '/sign-up',
    '/device',
    '/oauth/consent',
    '/invite/:token',
    '/subscribe/:token',
    '/subscribe/:token/confirm',
    '/subscribe/:token/data',
    '/subscribe/:token/feedback',
    '/subscribe/:token/reply',
    '/subscribe/:token/unsubscribe',
    // (app) outside an organisation
    '/new',
    '/connect',
    '/developers/webhooks',
    ...['ai-keys', 'api-keys', 'appearance', 'data', 'notifications', 'profile', 'security'].map(
      (section) => `/account/${section}`
    ),
    // (app) in an organisation
    '/:org',
    '/:org/new',
    '/:org/projects',
    '/:org/analysis',
    ...[
      'ai-keys',
      'api-keys',
      'audit',
      'billing',
      'data',
      'general',
      'integrations',
      'members',
      'rota',
      'webhooks'
    ].map((section) => `/:org/settings/${section}`),
    '/:org/:project',
    '/:org/:project/analysis',
    '/:org/:project/bundles/:id',
    '/:org/:project/calls',
    '/:org/:project/calls/:id',
    '/:org/:project/ledger',
    '/:org/:project/settings',
    ...['channels', 'packs', 'public', 'rota', 'share'].map((section) => `/:org/:project/settings/${section}`),
    '/:org/:project/signals',
    '/:org/:project/signals/probation/:sourceId',
    '/:org/:project/subscribers',
    '/:org/:project/windows',
    // (camera), a device's own page
    '/:org/:project/camera/:sourceId'
  ]
}
/** The `(app)` group's pages, whose layout needs a credential: everything from `/new` up to the camera's. */
const APP_GROUP_PAGES = PAGES.app.slice(PAGES.app.indexOf('/new'), PAGES.app.indexOf('/:org/:project/camera/:sourceId'))

/** For the test that holds PAGES to app/. */
export const pagesOf = (surface: 'marketing' | 'app') => [...PAGES[surface]]

/**
 * Slug-shaped: lower-case letters, digits and hyphens, as every organisation's slug or ID is (the Commons' reserved
 * `commons` included), so other paths never cost `proxy.ts` a lookup.
 */
const ORG_SHAPED = /^[a-z0-9][a-z0-9-]*$/

/**
 * A segment matches its pattern's literal, any segment for a parameter, and only a slug-shaped one for `:org` unless
 * `anyOrg` (how Next itself matches `[org]`).
 */
function matchPage(pattern: string, segments: string[], anyOrg = false): boolean {
  const parts = pattern.split('/').slice(1)
  return (
    parts.length === segments.length &&
    parts.every((part, i) => {
      const segment = segments[i]!
      if (!part.startsWith(':')) return part === segment
      return part === ':org' && !anyOrg ? ORG_SHAPED.test(segment) : segment !== ''
    })
  )
}

/**
 * A marketing or public path that no page of theirs builds, such as `/legal/nothing` or `/status`, but that Next would
 * match to the app's `/[org]` pages, whose layout then answers for it (#610). It is the not-found page instead.
 */
function strayIntoApp(pathname: string): boolean {
  const segments = pathname.split('/').slice(1)
  return (
    !PAGES.marketing.some((pattern) => matchPage(pattern, segments)) &&
    PAGES.app.some((pattern) => pattern.startsWith('/:org') && matchPage(pattern, segments, true))
  )
}

/**
 * Where a page path asked of the wrong host belongs, under HOST_MODE=multi only: the app host's `/` goes to sign-in's
 * continue (a member's organisation, or sign-in), a marketing page on the app host goes to the marketing origin, and an
 * app or auth page on the marketing host goes to the app origin, path and query kept. The origin is always the
 * configured one, never one taken from the request. `org` names the organisation an `/:org` page needs, which
 * `proxy.ts` checks exists before sending anyone there. Null for anything else: `/v1`, `/api`, assets and unknown
 * paths stay the not-found page on the host that was asked.
 */
export function pageElsewhere(
  o: HostConfig & { host: string; pathname: string; search: string; method: string }
): { url: URL; status: 307 | 308; org?: string } | null {
  if (o.mode !== 'multi' || (o.method !== 'GET' && o.method !== 'HEAD')) return null
  const host = o.host.toLowerCase()
  const asked = (Object.entries(o.hosts) as Array<[Surface, string]>).find(([, value]) => value === host)?.[0]
  if (asked !== 'marketing' && asked !== 'app') return null
  // Only the other host's page groups: never `/v1`, `/api`, assets or the test-only routes.
  const { group } = classify(o.pathname)
  const theirs = asked === 'app' ? ['(marketing)', '(public)'] : ['(auth)', '(app)']
  if (!theirs.includes(group)) return null
  const segments = o.pathname.split('/').slice(1)
  const at = (surface: 'marketing' | 'app', pathname: string, search: string) => {
    const origin = o.origins[surface]
    if (!origin) return null
    // Setting the path on the configured origin keeps it there: a `//host` path can't name another origin.
    const url = new URL(origin)
    url.pathname = pathname
    url.search = search
    return url
  }
  if (asked === 'app') {
    if (o.pathname === '/') {
      const url = at('app', '/api/auth/continue', '')
      return url && { url, status: 307 }
    }
    if (!PAGES.marketing.some((pattern) => matchPage(pattern, segments))) return null
    const url = at('marketing', o.pathname, o.search)
    return url && { url, status: 308 }
  }
  const matched = PAGES.app.filter((pattern) => matchPage(pattern, segments))
  if (!matched.length) return null
  const url = at('app', o.pathname, o.search)
  if (!url) return null
  // A path that also matches a page of the app's own (`/new`, `/account/…`) needs no organisation.
  return matched.every((pattern) => pattern.startsWith('/:org'))
    ? { url, status: 308, org: segments[0]! }
    : { url, status: 308 }
}

/** The request header that carries an `(app)` page's own path and query, for its sign-in's return path. */
export const APP_PATH_HEADER = 'x-skyclause-app-path'

/** The cookies that can carry a credential: Better Auth's session, a share link, and the test runtime's principal. */
const CREDENTIAL_COOKIE = /^(?:__Secure-)?better-auth\.session_token$|^sc_share$|^skyclause_test_principal$/
const carriesCredential = (request: NextRequest) =>
  request.headers.has('authorization') || request.cookies.getAll().some(({ name }) => CREDENTIAL_COOKIE.test(name))

/**
 * `proxy.ts` only maps hosts to route groups (TRD "Sign-in and sessions"); routes check auth themselves. A 404 renders
 * the global not-found page; a page path asked of the wrong host is redirected to its own (`pageElsewhere`). It never
 * sets a cookie and rewrites only on the request's own host, so session cookies stay host-only on APP_ORIGIN.
 */
export function proxyResponse(
  request: NextRequest,
  config: HostConfig,
  init?: Parameters<typeof NextResponse.next>[0]
): NextResponse {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get('host') ?? request.nextUrl.host
  const target = routeRequest({ ...config, host, pathname })
  if (!target) {
    const elsewhere = pageElsewhere({ ...config, host, pathname, search, method: request.method })
    // Next's router fetches (and prefetches) a page's payload from its own origin, where a redirect to the other host
    // breaks the CSP's connect-src. Next keeps its RSC headers from the proxy, but not `Next-Url`, and the browser says
    // the request is a fetch: a plain empty answer, not a payload, makes the router load the page as a document
    // instead, which the redirect answers.
    const destination = request.headers.get('sec-fetch-dest')
    const fetched = request.headers.has('next-url') || (destination !== null && destination !== 'document')
    if (elsewhere && fetched)
      return new NextResponse('', {
        status: 200,
        headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }
      })
    if (elsewhere) return NextResponse.redirect(elsewhere.url, elsewhere.status)
    return NextResponse.rewrite(new URL('/_not-found', request.url), init)
  }
  // Keep the downstream headers `init` carries (the CSP nonce) and add what the route reads.
  const requestHeaders = new Headers(init?.request?.headers ?? request.headers)
  if ((target.group === '(public)' || target.group === '(marketing)') && strayIntoApp(pathname)) {
    requestHeaders.set('x-skyclause-locale', under('/ms')(pathname) ? 'ms' : 'en')
    return NextResponse.rewrite(new URL('/_not-found', request.url), {
      ...init,
      request: { ...init?.request, headers: requestHeaders }
    })
  }
  let added = false
  if (target.group === '(public)') {
    requestHeaders.set('x-skyclause-locale', pathname.startsWith('/ms/legal') ? 'ms' : 'en')
    requestHeaders.set('x-skyclause-public-path', pathname)
    added = true
  }
  if (target.group === '(app)') {
    const query = new URLSearchParams(search)
    query.delete('_rsc')
    const rest = query.toString()
    const own = `${pathname}${rest ? `?${rest}` : ''}`
    // A visitor with no credential at all signs in first, then comes back: a real redirect, before any of the shell.
    // The layout does the same for a credential that turns out not to be one (an expired session).
    const segments = pathname.split('/').slice(1)
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      !carriesCredential(request) &&
      APP_GROUP_PAGES.some((pattern) => matchPage(pattern, segments, true))
    ) {
      const signIn = new URL('/sign-in', request.url)
      if (!pathname.startsWith('//')) signIn.searchParams.set('next', own)
      return NextResponse.redirect(signIn, 307)
    }
    // Always set here, so a request can't bring its own.
    requestHeaders.set(APP_PATH_HEADER, own)
    added = true
  }
  const forwarded = added ? { ...init, request: { ...init?.request, headers: requestHeaders } } : init
  if (target.pathname !== pathname)
    return NextResponse.rewrite(new URL(`${target.pathname}${search}`, request.url), forwarded)
  return NextResponse.next(forwarded)
}
