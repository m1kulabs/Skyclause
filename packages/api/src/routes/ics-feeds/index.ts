import type { Handlers } from '..'
import { createIcsFeed, deleteIcsFeed, getIcsFeed, listIcsFeeds } from '../../services/ics-feeds'
import { inTenant } from '../../tenancy'
import { authorizeWindowProject } from '../../middleware/window-project'
import { ApiError } from '../../problems'

async function safeCalendarRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ApiError) throw error
    // Database and transport errors can embed source identifiers or capability URLs.
    throw new ApiError(500, 'internal-error', 'The calendar request failed.')
  }
}

export const icsFeedHandlers: Handlers = {
  deleteIcsFeed: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { can, now } = c.get('deps')
      return c.json(
        await safeCalendarRequest(() => inTenant(c, (ctx) => deleteIcsFeed(ctx, { id }, { can, now: now() }))),
        200
      )
    }
  },
  getIcsFeed: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { can } = c.get('deps')
      return c.json(await inTenant(c, (ctx) => getIcsFeed(ctx, { id }, { can })), 200)
    }
  },
  createIcsFeed: {
    middleware: [authorizeWindowProject],
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const body = c.req.valid('json')
      const { can, now, calendarTransport } = c.get('deps')
      return c.json(
        await safeCalendarRequest(() =>
          inTenant(c, (ctx) =>
            createIcsFeed(ctx, { projectId, body }, { can, now: now(), transport: calendarTransport })
          )
        ),
        201
      )
    }
  },
  listIcsFeeds: {
    handler: async (c) => {
      const { id: projectId } = c.req.valid('param')
      const query = c.req.valid('query')
      const { can } = c.get('deps')
      return c.json(await inTenant(c, (ctx) => listIcsFeeds(ctx, { projectId, query }, { can })), 200)
    }
  }
}
