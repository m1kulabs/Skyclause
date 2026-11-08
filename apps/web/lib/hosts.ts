import { NextResponse, type NextRequest } from 'next/server'

// Spec §4 Hosts and PRD "Information architecture": which host serves which route group under HOST_MODE=multi.
// HOST_MODE=single (production before the domain mappings, D46) serves everything on one origin, with the embed
// frames and the docs export under /embed/ and /docs/.

export type Surface = 'marketing' | 'app' | 'api' | 'mcp' | 'embed' | 'docs'

export interface HostConfig {
  mode: 'single' | 'multi'
  /** Each surface's `*_ORIGIN` host, such as `app.skyclause.m1ku.tech`. */
  hosts: Partial<Record<Surface, string>>
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
  for (const [surface, name] of Object.entries(ORIGIN_VARS) as Array<[Surface, string]>) {
    const origin = env[name]
    if (origin) hosts[surface] = new URL(origin).host
  }
  return { mode: env.HOST_MODE === 'multi' ? 'multi' : 'single', hosts }
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
      under('/icons', '/_next')(path)
  },
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
  { group: '/e', surface: 'marketing', match: exact('/e') },
  { group: '/skills', surface: 'marketing', match: under('/skills') },
  { group: '/elements', surface: 'embed', match: under('/elements') },
  { group: '(embed)', surface: 'embed', match: under('/embed') },
  { group: 'docs', surface: 'docs', match: under('/docs') },
  { group: '(marketing)', surface: 'marketing', match: (path) => path === '/' || under('/ms', '/legal')(path) },
  { group: '(public)', surface: 'marketing', match: under('/status', '/p', '/c') },
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
 * `proxy.ts` only maps hosts to route groups (TRD "Sign-in and sessions"); routes check auth themselves. A 404 renders
 * the global not-found page. It never sets a cookie and rewrites only on the request's own host, so session cookies
 * stay host-only on APP_ORIGIN.
 */
export function proxyResponse(request: NextRequest, config: HostConfig): NextResponse {
  const { pathname, search } = request.nextUrl
  const target = routeRequest({ ...config, host: request.headers.get('host') ?? request.nextUrl.host, pathname })
  if (!target) return NextResponse.rewrite(new URL('/_not-found', request.url))
  if (target.pathname !== pathname) return NextResponse.rewrite(new URL(`${target.pathname}${search}`, request.url))
  return NextResponse.next()
}
