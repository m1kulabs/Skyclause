import { requireOrg } from '../../middleware/org'
import { ApiError } from '../../problems'
import { createMyPushSubscription, deleteMyPushSubscription, listMyPushSubscriptions } from '../../services/alerts'
import { inTenant } from '../../tenancy'
import type { Handlers } from '../index'

// #155 (c-approver-alerts): #79 §4's push rows. The routes admit any session; `push_subscription` is a T table, so
// the subscription routes also name their organisation (D2, `Skyclause-Organization`). The VAPID key is global.

export const alertHandlers: Handlers = {
  listPushSubscriptions: {
    middleware: [requireOrg],
    handler: async (c) => {
      const { limit, cursor } = c.req.valid('query')
      return c.json(await inTenant(c, (ctx) => listMyPushSubscriptions(ctx, { limit, cursor })), 200)
    }
  },
  createPushSubscription: {
    middleware: [requireOrg],
    handler: async (c) => {
      const body = c.req.valid('json')
      return c.json(await inTenant(c, (ctx) => createMyPushSubscription(ctx, body)), 201)
    }
  },
  deletePushSubscription: {
    middleware: [requireOrg],
    handler: async (c) => {
      const { id } = c.req.valid('param')
      await inTenant(c, (ctx) => deleteMyPushSubscription(ctx, id))
      return c.body(null, 204)
    }
  },
  getVapidPublicKey: {
    handler: async (c) => {
      const key = c.get('deps').config().vapidPublicKey
      if (!key)
        throw new ApiError(503, 'feature-off', 'Web push is off until the vapid-keys job has made its key pair.')
      return c.json({ public_key: key }, 200)
    }
  }
}
