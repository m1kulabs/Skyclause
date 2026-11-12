import type { Handlers } from '..'
import { listIcsFeeds } from '../../services/ics-feeds'
import { inTenant } from '../../tenancy'

export const icsFeedHandlers: Handlers = {
  listIcsFeeds: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can } = c.get('deps')
      return c.json(await inTenant(c, (ctx) => listIcsFeeds(ctx, { projectId, query }, { can })), 200)
    }
  }
}
