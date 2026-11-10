import type { Handlers } from '..'
import { evaluateWhatIf, getOrganisationAnalysis, getProjectAnalysis } from '../../services/analysis'
import { ledgerProjectFor } from '../../services/ledger'
import { inTenant } from '../../tenancy'

// #162 c-analysis-api: GET /v1/projects/{id}/analysis, GET /v1/analysis and POST /v1/projects/{id}/analysis/what-if
// (`ledger.view`). A project outside the principal's reach answers 404, as another organisation's does; the roll-up
// leaves such projects out.

export const analysisHandlers: Handlers = {
  getProjectAnalysis: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, async (ctx) => {
        await ledgerProjectFor(ctx, id, (projectId) => can(ctx.principal, 'ledger.view', { projectId }))
        return getProjectAnalysis(ctx, { projectId: id, orgId: c.get('orgId')!, query, now: now() })
      })
      return c.json(body, 200)
    }
  },
  getOrganisationAnalysis: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const body = await inTenant(c, (ctx) =>
        getOrganisationAnalysis(ctx, {
          orgId: c.get('orgId')!,
          query,
          now: now(),
          canView: (projectId) => can(ctx.principal, 'ledger.view', { projectId })
        })
      )
      return c.json(body, 200)
    }
  },
  evaluateWhatIf: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can } = c.get('deps')
      const result = await inTenant(c, async (ctx) => {
        await ledgerProjectFor(ctx, id, (projectId) => can(ctx.principal, 'ledger.view', { projectId }))
        return evaluateWhatIf(ctx, { projectId: id, orgId: c.get('orgId')!, body })
      })
      return c.json(result, 200)
    }
  }
}
