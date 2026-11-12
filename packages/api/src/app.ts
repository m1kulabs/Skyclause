import { HTTP_PROBLEM_STATUS } from '@skyclause/contracts'
import { OpenAPIHono } from '@hono/zod-openapi'
import { log } from '@skyclause/config'
import { API_ROUTES, NotBuiltError, V1_ROUTES, type RouteMetadata, type SkyclauseRoute } from '@skyclause/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'
import type { ZodType } from 'zod'
import type { ApiDeps, ApiEnv, Surface } from './context'
import { v1Cors } from './cors'
import {
  requireDevice,
  requirePermission,
  requirePrincipal,
  requireSession,
  requireStaff,
  takePrincipal
} from './middleware/auth'
import { requireIdempotency } from './middleware/idempotency'
import { recordDuration } from './middleware/metrics'
import { requireOrg } from './middleware/org'
import { rateLimit } from './middleware/rate-limit'
import { apiSurfaceGate, auditToolCall } from './middleware/surface'
import { ApiError, problemResponse, toApiError, validationFailed } from './problems'
import { readResponseBody } from './response-body'
import { HANDLERS, type AnyHandlerEntry } from './routes'
import { mountAuditWriteGuards } from './routes/audit'

type Middleware = MiddlewareHandler<ApiEnv>

export interface Registry {
  v1: readonly SkyclauseRoute[]
  api: readonly SkyclauseRoute[]
  handlers: Partial<Record<string, AnyHandlerEntry>>
}

const REGISTRY: Registry = {
  v1: V1_ROUTES as readonly SkyclauseRoute[],
  api: API_ROUTES as readonly SkyclauseRoute[],
  handlers: HANDLERS as Registry['handlers']
}

/** The `/v1` and `/api` apps over #88's registry; each Route Handler and the in-process MCP call (D5) use these. */
export function createApi(deps: ApiDeps, registry: Registry = REGISTRY) {
  return {
    v1: surfaceApp('v1', registry.v1, registry.handlers, deps),
    api: surfaceApp('api', registry.api, registry.handlers, deps),
    // #737: the `/v1` operations as the app host serves them at `/api/v1`, where the browser's host-only session
    // cookie goes. `/api`'s rule applies (sessions only; a cookie write from APP_ORIGIN) and there is no CORS.
    v1Bridge: surfaceApp('v1', registry.v1, registry.handlers, deps, { bridge: true })
  }
}

export type ApiApp = ReturnType<typeof createApi>['v1']

function surfaceApp(
  surface: Surface,
  routes: readonly SkyclauseRoute[],
  handlers: Registry['handlers'],
  deps: ApiDeps,
  { bridge = false }: { bridge?: boolean } = {}
) {
  const app = new OpenAPIHono<ApiEnv>({
    defaultHook: (result) => {
      if (!result.success) throw validationFailed(result.target, result.error)
    }
  })
  app.use(recordDuration)
  app.use(async (c, next) => {
    c.set('deps', deps)
    c.set('surface', surface)
    c.set('principal', null)
    c.set('orgId', null)
    await next()
  })
  if (surface === 'v1' && !bridge) app.use('/v1/*', v1Cors())
  app.onError((error, c) => {
    const problem = toApiError(error)
    if (problem.status >= 500 && problem.slug !== 'not-built') {
      // The route template, never the path: a path can carry a link token (subscribe and share links).
      log.error('api request failed', { route: routePath(c, -1), error: error.stack ?? String(error) })
    }
    return problemResponse(c, problem)
  })
  app.notFound((c) =>
    problemResponse(
      c,
      new ApiError(HTTP_PROBLEM_STATUS['not-found'], 'not-found', 'No operation answers this method and path.')
    )
  )
  for (const route of routes) mount(app, surface, route, handlers[route.operationId], surface === 'api' || bridge)
  if (surface === 'api') mountAuditWriteGuards(app)
  return app
}

/** The middleware a route's `x-skyclause.statement` asks for (spec §1, §4). */
function gate(statement: RouteMetadata['statement']): Middleware[] {
  switch (statement) {
    case 'public':
    case 'token':
      return []
    // A guest route admits any principal; its handler decides which.
    case 'any':
    case 'guest':
      return [requirePrincipal]
    case 'session':
    case 'labeller':
      return [requireSession]
    case 'staff':
      return [requireStaff]
    case 'device':
      return [requireDevice]
    case 'rota.manage':
      return [
        requireOrg,
        async (c, next) => {
          const principal = c.get('principal')
          const accountId =
            principal?.kind === 'session' || principal?.kind === 'api_key' || principal?.kind === 'oauth'
              ? principal.accountId
              : undefined
          if (!principal || !accountId || !c.get('deps').can(principal, 'rota.manage', { accountId })) {
            throw new ApiError(403, 'insufficient-scope', 'This operation needs rota.manage for this account.')
          }
          await next()
        }
      ]
    default:
      return [requireOrg, requirePermission(statement)]
  }
}

function mount(
  app: OpenAPIHono<ApiEnv>,
  surface: Surface,
  route: SkyclauseRoute,
  entry: AnyHandlerEntry | undefined,
  firstParty: boolean
) {
  const x = route['x-skyclause']
  const chain: Middleware[] = [
    async (c, next) => {
      c.set('operation', route)
      await next()
    },
    // Public reads resolve no principal; `/api` still does, so a key or token gets its 403.
    takePrincipal(!(surface === 'v1' && x.statement === 'public')),
    rateLimit,
    ...(firstParty ? [apiSurfaceGate] : []),
    ...gate(x.statement),
    auditToolCall,
    ...(entry?.middleware ?? []),
    ...(x.idempotent ? [requireIdempotency] : [])
  ]
  if (entry) {
    app.openapi({ ...route, middleware: chain }, checkResponse(route, entry.handler) as never)
    return
  }
  // Not built: in the document, behind the same middleware, answering 501 without validating input.
  app.openAPIRegistry.registerPath(route)
  app.on(route.method.toUpperCase(), route.path.replaceAll(/\/{(.+?)}/g, '/:$1'), ...chain, () => {
    throw new NotBuiltError(x.owner)
  })
}

const isZod = (value: unknown): value is ZodType =>
  typeof value === 'object' && value !== null && typeof (value as ZodType).safeParse === 'function'

/** Ticket decision: outside production a response must match its registry schema, or the request fails. */
function checkResponse(route: SkyclauseRoute, handler: AnyHandlerEntry['handler']) {
  return async (c: Context<ApiEnv, string, never>) => {
    const response = await handler(c)
    if (c.get('deps').config().appEnv === 'production') return response
    const declared = (route.responses as Record<string, { content?: Record<string, { schema?: unknown }> }>)[
      String(response.status)
    ]
    if (!declared) throw new Error(`${route.operationId} answered ${response.status}, which its route doesn't declare`)
    const type = response.headers.get('Content-Type')?.split(';')[0]?.trim()
    const schema = type ? declared.content?.[type]?.schema : undefined
    if (type?.endsWith('json') && isZod(schema)) {
      const inspected = await readResponseBody(response)
      const result = schema.safeParse(JSON.parse(new TextDecoder().decode(inspected.bytes)))
      if (!result.success) {
        throw new Error(`${route.operationId} ${response.status} doesn't match its schema: ${result.error.message}`)
      }
      return inspected.response
    }
    return response
  }
}
