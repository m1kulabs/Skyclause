import { eraseSubscriber, verifySubscriberToken } from '@skyclause/db'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { ipHash } from '../../middleware/rate-limit'
import { ApiError } from '../../problems'
import { LINK_PRINCIPAL, linkExpired, deliverSubscriberEmail } from '../../services/subscribers'
import { getSubscriberData, updateSubscriberData as updateData } from '../../services/subscriber-rights'
import type { ServiceContext } from '../../tenancy'
import type { Handlers } from '../index'

const appOrigin = (c: Context<ApiEnv>) => c.get('deps').config().appOrigin ?? new URL(c.req.url).origin

type ManageOwner = NonNullable<Awaited<ReturnType<typeof verifySubscriberToken>>>

async function withManage<T>(c: Context<ApiEnv>, fn: (ctx: ServiceContext, owner: ManageOwner) => Promise<T>) {
  const found = await verifySubscriberToken(c.req.param('token') ?? '', 'manage')
  if (!found) throw linkExpired()
  return c
    .get('deps')
    .withTenant({ orgId: found.orgId, principal: LINK_PRINCIPAL }, (tx) => fn({ principal: LINK_PRINCIPAL, tx }, found))
}

function unexpectedKeys(sent: unknown): string[] {
  if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return []
  return Object.keys(sent).filter((key) => key !== 'email' && key !== 'role')
}

export const subscriberRightsHandlers: Handlers = {
  getSubscriberData: {
    handler: async (c) => {
      const data = await withManage(c, (ctx, owner) =>
        getSubscriberData(ctx, {
          projectId: owner.projectId,
          subscriberId: owner.subscriberId,
          marketingOrigin: c.get('deps').config().marketingOrigin
        })
      )
      return c.json(data, 200)
    }
  },
  updateSubscriberData: {
    handler: async (c) => {
      const sent: unknown = await c.req.json()
      const extra = unexpectedKeys(sent)
      if (extra.length) {
        throw new ApiError(422, 'validation-failed', 'Only the address and role can be corrected here.', {
          errors: extra.map((key) => ({
            in: 'body',
            pointer: `/${key}`,
            detail: 'Change this on the preferences page'
          }))
        })
      }
      const patch = c.req.valid('json')
      const result = await withManage(c, (ctx, owner) =>
        updateData(ctx, {
          projectId: owner.projectId,
          subscriberId: owner.subscriberId,
          now: c.get('deps').now(),
          ipHash: ipHash(c),
          appOrigin: appOrigin(c),
          marketingOrigin: c.get('deps').config().marketingOrigin,
          patch
        })
      )
      if (result.email) await deliverSubscriberEmail(c.get('deps'), LINK_PRINCIPAL, result.email, { rethrow: true })
      return c.json({ ...result.data, address_confirmation_sent: !!result.email }, 200)
    }
  },
  eraseSubscriberData: {
    handler: async (c) => {
      await withManage(c, (ctx, owner) => eraseSubscriber(ctx.tx, owner.subscriberId))
      return c.body(null, 204)
    }
  },
  exportSubscriberData: {
    handler: async (c) => {
      const data = await withManage(c, (ctx, owner) =>
        getSubscriberData(ctx, {
          projectId: owner.projectId,
          subscriberId: owner.subscriberId,
          marketingOrigin: c.get('deps').config().marketingOrigin
        })
      )
      return c.json(data, 200, { 'Content-Disposition': 'attachment; filename="skyclause-subscriber-data.json"' })
    }
  }
}
