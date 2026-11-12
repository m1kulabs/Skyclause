import type { Handlers } from '..'
import { productionEvaluatorProviders } from '../../services/evaluator/production'
import {
  getProjectStrip,
  listProjectDays,
  listProjectSources,
  listSourceReadings,
  listSourcePolls
} from '../../services/signals'
import { inTenant } from '../../tenancy'

export const signalHandlers: Handlers = {
  listSourceReadings: {
    handler: async (c) => {
      const { id: sourceId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const access = { can, now: now() }
      const result = await inTenant(c, (ctx) => listSourceReadings(ctx, { sourceId, query }, access))
      // Avoid Hono's recursive JSON type expansion; the service returns Page<Reading>.
      return c.json(result as never, 200)
    }
  },
  listSourcePolls: {
    handler: async (c) => {
      const { id: sourceId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const access = { can, now: now() }
      return c.json(await inTenant(c, (ctx) => listSourcePolls(ctx, { sourceId, query }, access)), 200)
    }
  },
  listProjectSources: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const requestTime = now()
      const result = await inTenant(c, (ctx) =>
        listProjectSources(ctx, { projectId, query }, { can, now: requestTime })
      )
      return c.json(result, 200)
    }
  },
  getProjectStrip: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const { can, now } = c.get('deps')
      const requestTime = now()
      const result = await inTenant(c, (ctx) =>
        getProjectStrip(
          ctx,
          { projectId },
          { can, now: requestTime, snapshots: productionEvaluatorProviders().snapshots }
        )
      )
      return c.json(result, 200)
    }
  },
  listProjectDays: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const requestTime = now()
      const result = await inTenant(c, (ctx) => listProjectDays(ctx, { projectId, query }, { can, now: requestTime }))
      return c.json(result, 200)
    }
  }
}
