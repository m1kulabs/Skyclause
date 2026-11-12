import type { Handlers } from '..'
import { listProjectSources } from '../../services/signals'
import { inTenant } from '../../tenancy'

export const signalHandlers: Handlers = {
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
  }
}
