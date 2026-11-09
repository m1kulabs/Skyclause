import type { Handlers } from '..'
import { ledgerProjectFor } from '../../services/ledger'
import { explainProjectReviewItem, listProjectGrades, listProjectReviewItems } from '../../services/grades'
import { inTenant } from '../../tenancy'

// #161 c-grades: GET /v1/projects/{id}/{grades,review-items} (`ledger.view`), PATCH /v1/review-items/{id}
// (`bundle.approve`, audited). A project outside the principal's reach answers 404, as another organisation's does.

export const gradesHandlers: Handlers = {
  listGrades: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, async (ctx) => {
        await ledgerProjectFor(ctx, id, (projectId) => can(ctx.principal, 'ledger.view', { projectId }))
        return listProjectGrades(ctx, { projectId: id, orgId: c.get('orgId')!, query, now: now() })
      })
      return c.json(body, 200)
    }
  },
  listReviewItems: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { state, reason, limit, cursor } = c.req.valid('query')
      const { can } = c.get('deps')
      const body = await inTenant(c, async (ctx) => {
        await ledgerProjectFor(ctx, id, (projectId) => can(ctx.principal, 'ledger.view', { projectId }))
        return listProjectReviewItems(ctx, { projectId: id, state, reason, limit, cursor })
      })
      return c.json(body, 200)
    }
  },
  updateReviewItem: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can, now, recordAudit } = c.get('deps')
      const item = await inTenant(c, (ctx) =>
        explainProjectReviewItem(
          ctx,
          { id, body, now: now() },
          (projectId) => can(ctx.principal, 'bundle.approve', { projectId }),
          recordAudit
        )
      )
      return c.json(item, 200)
    }
  }
}
