import {
  NotBuiltError,
  SCOPE_STATEMENTS,
  type Can,
  type Principal,
  type ResolvePrincipal,
  type Role,
  type Scope,
  type SetPermissionCheck,
  type SetPrincipalResolver,
  type Statement
} from '@skyclause/contracts'
import type { Context, MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { ApiError } from '../problems'
import { auditIn } from '../tenancy'

// Spec §1: f-auth (#94) registers `resolvePrincipal` and `can` at the composition root; packages/api never
// imports packages/auth. Until then both fail as not built by f-auth.
let registeredResolver: ResolvePrincipal | undefined
let registeredCan: Can | undefined

export const setPrincipalResolver: SetPrincipalResolver = (fn) => {
  registeredResolver = fn
}
export const setPermissionCheck: SetPermissionCheck = (fn) => {
  registeredCan = fn
}
export const registeredPrincipal: ResolvePrincipal = (req, o) => {
  if (!registeredResolver) throw new NotBuiltError('f-auth')
  return registeredResolver(req, o)
}
export const registeredPermission: Can = (p, s, t) => {
  if (!registeredCan) throw new NotBuiltError('f-auth')
  return registeredCan(p, s, t)
}

type Middleware = MiddlewareHandler<ApiEnv>

const insufficient = (detail: string) => new ApiError(403, 'insufficient-scope', detail)

export function principalOf(c: Context<ApiEnv>): Principal {
  const principal = c.get('principal')
  if (!principal) throw new ApiError(401, 'unauthenticated', 'Sign in, or send an API key or token.')
  return principal
}

/**
 * Takes an in-process principal as is (D5); otherwise resolves one from the request when `resolve` is set (public
 * `/v1` reads don't). Leaves null when there is none.
 */
export function takePrincipal(resolve: boolean): Middleware {
  return async (c, next) => {
    const given = c.env?.principal
    const resolved =
      !given && resolve ? await c.get('deps').resolvePrincipal(c.req.raw, { surface: c.get('surface') }) : null
    c.set('principal', given ?? resolved)
    await next()
  }
}

export const requirePrincipal: Middleware = async (c, next) => {
  principalOf(c)
  await next()
}

export const requireSession: Middleware = async (c, next) => {
  if (principalOf(c).kind !== 'session') throw insufficient('This operation needs a signed-in session.')
  await next()
}

export const requireDevice: Middleware = async (c, next) => {
  if (principalOf(c).kind !== 'device') throw insufficient('This operation needs a device token.')
  await next()
}

/** A signed-in person, never a guest, key or token (GST-7, NFR-10). */
export const requireHumanSession: Middleware = async (c, next) => {
  const principal = principalOf(c)
  if (principal.kind !== 'session' || principal.isGuest) throw insufficient('This operation needs a signed-in member.')
  await next()
}

/** ACC-8: a session authenticated within `hours`, else 401 `reauth-required`. */
export function requireRecentAuth(hours = 12): Middleware {
  return async (c, next) => {
    const principal = principalOf(c)
    if (principal.kind !== 'session') throw insufficient('This operation needs a signed-in session.')
    const age = c.get('deps').now().getTime() - principal.authenticatedAt.getTime()
    if (age > hours * 3_600_000) {
      throw new ApiError(401, 'reauth-required', `Sign in again: this needs a sign-in within ${hours} hours.`)
    }
    await next()
  }
}

/** D30: staff by `SKYCLAUSE_STAFF_EMAILS`, no role; each use is audited in `commons` as `staff:{accountId}`. */
export const requireStaff: Middleware = async (c, next) => {
  const principal = principalOf(c)
  if (principal.kind !== 'session' || !principal.staff) throw insufficient('This operation is for staff.')
  const commons = await c.get('deps').membership.organisation('commons')
  if (!commons) throw new Error('requireStaff audits in the commons organisation, which does not exist')
  const job: Principal = {
    kind: 'system',
    job: `staff:${principal.accountId}`,
    client: principal.client,
    clientName: null
  }
  await auditIn(
    c,
    { orgId: commons.id, principal: job },
    {
      action: 'staff.action',
      target: { type: 'operation', id: c.get('operation').operationId }
    }
  )
  await next()
}

const roleOf = (principal: Principal): Role | null =>
  principal.kind === 'session' || principal.kind === 'api_key' || principal.kind === 'oauth' ? principal.role : null

/** After `requireOrg`, which fills a session's role. */
export function requireRole(...roles: Role[]): Middleware {
  return async (c, next) => {
    const role = roleOf(principalOf(c))
    if (!role || !roles.includes(role)) throw insufficient(`This operation needs the role ${roles.join(' or ')}.`)
    await next()
  }
}

const scopesOf = (principal: Principal): readonly Scope[] | null =>
  principal.kind === 'api_key' || principal.kind === 'oauth' || principal.kind === 'guest_token'
    ? principal.scopes
    : null

/** Keys and tokens must carry `scope`; sessions pass. */
export function requireScope(scope: Scope): Middleware {
  return async (c, next) => {
    const scopes = scopesOf(principalOf(c))
    if (scopes && !scopes.includes(scope)) throw insufficient(`This operation needs the ${scope} scope.`)
    await next()
  }
}

// `/api/bundles/{id}/approve` → bundle, `/v1/review-items/{id}` → review_item.
const targetType = (path: string) =>
  /\/([a-z-]+)\/\{id\}/.exec(path)?.[1]?.replace(/s$/, '').replaceAll('-', '_') ?? 'operation'

/**
 * Caps a key or token at the statements its scopes map to (spec §1), then asks the registered `can`. A denied
 * `bundle.approve` is audited as `bundle.approve_denied` (GST-7) before the 403.
 */
export function requirePermission(statement: Statement): Middleware {
  return async (c, next) => {
    const principal = principalOf(c)
    const { can } = c.get('deps')
    const scopes = scopesOf(principal)
    const scoped = !scopes || scopes.some((scope) => SCOPE_STATEMENTS[scope].includes(statement))
    if (!scoped || !can(principal, statement)) {
      const orgId = c.get('orgId')
      if (statement === 'bundle.approve' && orgId) {
        await auditIn(
          c,
          { orgId, principal },
          {
            action: 'bundle.approve_denied',
            target: { type: targetType(c.get('operation').path), id: c.req.param('id') ?? '' }
          }
        )
      }
      throw insufficient(`This operation needs ${statement}.`)
    }
    await next()
  }
}
