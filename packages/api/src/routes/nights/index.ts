import type { Handlers } from '..'
import { listNights } from '../../services/nights'
import { inTenant } from '../../tenancy'

export const nightHandlers: Handlers = {
  listNights: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can } = c.get('deps')
      // Avoid Hono's recursive JSON type expansion; the service returns Page<NightView>.
      return c.json((await inTenant(c, (ctx) => listNights(ctx, { projectId, query }, { can }))) as never, 200)
    }
  }
}
