import type { MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { ApiError } from '../problems'
import { principalOf } from './auth'

const notFound = () => new ApiError(404, 'not-found', 'No such organisation, or you are not a member of it.')

/**
 * D2: the organisation is the path's `{org}`, else `Skyclause-Organization` (slug or ID), else the principal's own.
 * A session must name one (400 `organization-required`); an unknown organisation, a non-member or a name that isn't
 * the principal's organisation is 404, never 403 (NFR-10). Fills a session's `orgId` and `role`.
 */
export const requireOrg: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const principal = principalOf(c)
  const { membership } = c.get('deps')
  const ref = c.req.param('org') ?? c.req.header('Skyclause-Organization')

  if (principal.kind === 'session' || principal.kind === 'system') {
    if (!ref) {
      throw new ApiError(400, 'organization-required', 'Send Skyclause-Organization with an organisation slug or ID.')
    }
    const org = await membership.organisation(ref)
    if (!org) throw notFound()
    if (principal.kind === 'session') {
      const role = await membership.role(principal.accountId, org.id)
      if (!role) throw notFound()
      c.set('principal', { ...principal, orgId: org.id, role })
    }
    c.set('orgId', org.id)
  } else {
    if (ref) {
      const org = await membership.organisation(ref)
      if (org?.id !== principal.orgId) throw notFound()
    }
    c.set('orgId', principal.orgId)
  }
  await next()
}
