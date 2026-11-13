import type { MiddlewareHandler } from 'hono'
import type { ApiEnv } from '../context'
import { openProject } from '../services/windows/shared'
import { inTenant } from '../tenancy'

/** Check current member and project authorization before a declaration replay can return its stored response. */
export const authorizeWindowProject: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const projectId = c.req.param('id') ?? ''
  const { can } = c.get('deps')
  await inTenant(c, (ctx) => openProject(ctx, projectId, 'window.declare', { can }))
  await next()
}
