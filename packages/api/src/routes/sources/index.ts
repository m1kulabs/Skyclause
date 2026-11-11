import type { Handlers } from '..'
import { bindSource, listCatalogueSources, unbindSource } from '../../services/sources'
import { inTenant } from '../../tenancy'

export const sourceHandlers: Handlers = {
  bindSource: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const { source_id: sourceId } = c.req.valid('json')
      const { can, now } = c.get('deps')
      const result = await inTenant(c, (ctx) => bindSource(ctx, { projectId, sourceId }, { can, now: now() }))
      return c.json(result, 201)
    }
  },
  unbindSource: {
    handler: async (c) => {
      const { id: projectId, sourceId } = c.req.valid('param')
      const { can, now } = c.get('deps')
      await inTenant(c, (ctx) => unbindSource(ctx, { projectId, sourceId }, { can, now: now() }))
      return c.body(null, 204)
    }
  },
  listCatalogueSources: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const result = await inTenant(c, (ctx) => listCatalogueSources(ctx, query, { can, now: now() }))
      return c.json(result, 200)
    }
  }
}
