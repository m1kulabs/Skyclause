import { ApiError, listProjects } from '@skyclause/api'
import { log } from '@skyclause/config'
import type { Principal } from '@skyclause/contracts'
import { withTenant } from '@skyclause/db'

/**
 * Whether a member's session sees a project with this slug in the organisation, read on the server through the
 * service `/v1/projects` serves. A mistyped or foreign slug is not visible. A read that fails for another reason lets
 * the page render, where the overview's own read names the failure and offers Retry.
 */
export async function projectVisible(principal: Principal, orgId: string, slug: string): Promise<boolean> {
  try {
    return await withTenant({ orgId, principal }, async (tx) => {
      const projects = await listProjects({ principal, tx }, { slug, limit: 1 })
      return projects.data.some((project) => project.slug === slug)
    })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return false
    log.warn('project overview server read failed', { slug, error: String(error) })
    return true
  }
}
