import { HTTP_PROBLEM_STATUS } from '@skyclause/contracts'
import { call, organization, project, systemPrincipal, withSystem } from '@skyclause/db'
import { eq } from 'drizzle-orm'
import type { Handlers } from '../index'
import { requireHumanSession, principalOf } from '../../middleware/auth'
import { ApiError } from '../../problems'

const unavailable = () =>
  new ApiError(HTTP_PROBLEM_STATUS['not-found'], 'not-found', 'No call is available to this member.')

/** c-call-page-ui: resolve the call's path only after checking this session can view its project. */
export const callHandlers: Handlers = {
  openCall: {
    middleware: [requireHumanSession],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      // T rows are deliberately invisible to `withSystem`. Enumerate project organisations from its permitted
      // global project read, then look for this UUID inside each tenant as a scoped system principal.
      const orgs = await withSystem('call-open', async (tx) =>
        tx
          .selectDistinct({ orgId: organization.id, orgSlug: organization.slug })
          .from(project)
          .innerJoin(organization, eq(project.orgId, organization.id))
      )
      let target: { callId: string; projectId: string; projectSlug: string; orgId: string; orgSlug: string } | undefined
      for (const org of orgs) {
        const [row] = await c
          .get('deps')
          .withTenant({ orgId: org.orgId, principal: systemPrincipal('call-open') }, async (tx) =>
            tx
              .select({ callId: call.id, projectId: project.id, projectSlug: project.slug })
              .from(call)
              .innerJoin(project, eq(call.projectId, project.id))
              .where(eq(call.id, id))
              .limit(1)
          )
        if (row) {
          target = { ...row, ...org }
          break
        }
      }
      if (!target) throw unavailable()

      const session = principalOf(c)
      if (session.kind !== 'session' || session.isGuest) throw unavailable()
      const membership = await c.get('deps').membership.lookup(target.orgId, session.accountId)
      if (!membership?.role) throw unavailable()
      const principal = { ...session, orgId: target.orgId, role: membership.role }
      if (!c.get('deps').can(principal, 'project.view', { projectId: target.projectId })) throw unavailable()

      // Use a relative path so the redirect stays on this host. Rebuilding it drops all incoming query parameters.
      const location = `/${encodeURIComponent(target.orgSlug)}/${encodeURIComponent(target.projectSlug)}/calls/${encodeURIComponent(target.callId)}`
      return c.redirect(location, 303)
    }
  }
}
