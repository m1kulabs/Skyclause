import type { Handlers } from '..'
import { listCatalogueSources } from '../../services/sources'
import { inTenant } from '../../tenancy'

export const sourceHandlers: Handlers = {
  listCatalogueSources: {
    handler: async (c) => {
      const query = c.req.valid('query')
      const { can, now } = c.get('deps')
      const result = await inTenant(c, (ctx) => listCatalogueSources(ctx, query, { can, now: now() }))
      return c.json(result, 200)
    }
  }
}
