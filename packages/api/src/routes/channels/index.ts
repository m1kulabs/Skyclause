import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { channelProjectFor, listChannels, previewChannels, updateChannel } from '../../services/channels'
import { inTenant, type ServiceContext } from '../../tenancy'
import type { Handlers } from '../index'

// #152 c-notice-templates: /v1/projects/{id}/channels[/preview,/{channel}] (#79 §4, `channels.manage`).

/** The project behind `id`, checked against the principal's project scope (OAuth grants, share links). */
const projectIn = (c: Context<ApiEnv>, ctx: ServiceContext, projectId: string) =>
  channelProjectFor(ctx, projectId, (id) => c.get('deps').can(ctx.principal, 'channels.manage', { projectId: id }))

/** Where permalinks live: `MARKETING_ORIGIN` under HOST_MODE=multi, else this request's origin (one host, D46). */
const permalinkOrigin = (c: Context<ApiEnv>) => c.get('deps').config().marketingOrigin ?? new URL(c.req.url).origin

export const channelHandlers: Handlers = {
  listChannels: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const body = await inTenant(c, async (ctx) => {
        await projectIn(c, ctx, id)
        return listChannels(ctx, { projectId: id })
      })
      return c.json(body, 200)
    }
  },
  previewChannels: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const query = c.req.valid('query')
      const body = await inTenant(c, async (ctx) =>
        previewChannels(ctx, { ...query, project: await projectIn(c, ctx, id), origin: permalinkOrigin(c) })
      )
      return c.json(body, 200)
    }
  },
  updateChannel: {
    handler: async (c) => {
      const { id, channel } = c.req.valid('param')
      const { enabled } = c.req.valid('json')
      const body = await inTenant(c, async (ctx) => {
        await projectIn(c, ctx, id)
        return updateChannel(ctx, { projectId: id, channel, enabled })
      })
      return c.json(body, 200)
    }
  }
}
