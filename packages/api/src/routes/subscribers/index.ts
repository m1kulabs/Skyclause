import type { SubscriberTokenPurpose } from '@skyclause/contracts'
import { resolveSubscribeToken, type ResolvedSubscribeToken } from '@skyclause/db'
import type { Context } from 'hono'
import type { ApiEnv } from '../../context'
import { ipHash } from '../../middleware/rate-limit'
import {
  confirmSubscription,
  createSubscribeLink,
  deliverSubscriberEmail,
  getSubscriberCounts,
  getSubscription,
  importSubscriber,
  joinProject,
  LINK_PRINCIPAL,
  linkExpired,
  listSubscribers,
  removeSubscriber,
  unsubscribe,
  updatePreferences,
  type LinkRequest,
  type QueuedEmail
} from '../../services/subscribers'
import { inTenant, type ServiceContext } from '../../tenancy'
import type { Handlers } from '../index'

// #157 (c-subscribers): the subscriber routes of #79 §4, `/v1` for Admins and `/api/subscribe/{token}` for links.

/** Where the subscribe pages live: `APP_ORIGIN`, or this request's origin on a single host (D46). */
const appOrigin = (c: Context<ApiEnv>) => c.get('deps').config().appOrigin ?? new URL(c.req.url).origin

const linkRequest = (c: Context<ApiEnv>): LinkRequest => ({
  now: c.get('deps').now(),
  ipHash: ipHash(c),
  appOrigin: appOrigin(c)
})

type Accepted = 'link' | SubscriberTokenPurpose
/** A subscribe link when the route takes one, a subscriber token when it takes any purpose. */
type Narrowed<A extends Accepted> =
  | ('link' extends A ? Extract<ResolvedSubscribeToken, { kind: 'link' }> : never)
  | ([Exclude<A, 'link'>] extends [never] ? never : Extract<ResolvedSubscribeToken, { kind: 'subscriber' }>)

/**
 * Resolves a link token and, if it is one of the kinds this route takes, runs `fn` in the link's organisation as
 * `LINK_PRINCIPAL`; any other token (expired, used, of another purpose or unknown) answers the same 410.
 */
async function byLink<A extends Accepted, T>(
  c: Context<ApiEnv>,
  token: string,
  accepts: readonly A[],
  fn: (ctx: ServiceContext, found: Narrowed<A>) => Promise<T>
): Promise<T> {
  const found = await resolveSubscribeToken(token)
  const kind = found && (found.kind === 'link' ? 'link' : found.purpose)
  if (!found || !(accepts as readonly Accepted[]).includes(kind!)) throw linkExpired()
  return c
    .get('deps')
    .withTenant({ orgId: found.orgId, principal: LINK_PRINCIPAL }, (tx) =>
      fn({ principal: LINK_PRINCIPAL, tx }, found as Narrowed<A>)
    )
}

/** A link's email goes out after its transaction commits; a public flow answers the same whatever SES says. */
async function sendFromLink(c: Context<ApiEnv>, email: QueuedEmail | null) {
  if (email) await deliverSubscriberEmail(c.get('deps'), LINK_PRINCIPAL, email, { rethrow: false })
}

export const subscriberHandlers: Handlers = {
  listSubscribers: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const { limit, cursor, window_id, channel, status } = c.req.valid('query')
      const result = await inTenant(c, (ctx) =>
        listSubscribers(ctx, { projectId: id, limit, cursor, windowId: window_id, channel, status })
      )
      return c.json(result, 200)
    }
  },
  createSubscriber: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const fields = c.req.valid('json')
      const { view, email } = await inTenant(c, (ctx) =>
        importSubscriber(ctx, { projectId: id, fields, appOrigin: appOrigin(c) })
      )
      if (email) await deliverSubscriberEmail(c.get('deps'), c.get('principal')!, email, { rethrow: true })
      return c.json(view, 201)
    }
  },
  deleteSubscriber: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      await inTenant(c, (ctx) => removeSubscriber(ctx, id))
      return c.body(null, 204)
    }
  },
  createSubscribeLink: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      const link = await inTenant(c, (ctx) => createSubscribeLink(ctx, { projectId: id, appOrigin: appOrigin(c) }))
      return c.json(link, 201)
    }
  },
  getSubscriberCounts: {
    handler: async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await inTenant(c, (ctx) => getSubscriberCounts(ctx, id)), 200)
    }
  },
  getSubscription: {
    handler: async (c) => {
      const page = await byLink(
        c,
        c.req.valid('param').token,
        ['link', 'manage', 'confirm', 'unsubscribe'],
        (ctx, found) =>
          getSubscription(ctx, {
            projectId: found.projectId,
            subscriberId: found.kind === 'subscriber' ? found.subscriberId : null
          })
      )
      return c.json(page, 200)
    }
  },
  createSubscription: {
    handler: async (c) => {
      const { consent: _consent, ...body } = c.req.valid('json')
      const { subscriber, email } = await byLink(c, c.req.valid('param').token, ['link'], (ctx, link) =>
        joinProject(ctx, { ...linkRequest(c), projectId: link.projectId, body })
      )
      await sendFromLink(c, email)
      return c.json(subscriber, 202)
    }
  },
  updateSubscription: {
    handler: async (c) => {
      // The contract's schema drops unknown keys, so read what was sent to refuse them (NTC-14).
      const sent: unknown = await c.req.json()
      const sentKeys = sent && typeof sent === 'object' ? Object.keys(sent) : []
      const patch = c.req.valid('json')
      const subscriber = await byLink(c, c.req.valid('param').token, ['manage'], (ctx, found) =>
        updatePreferences(ctx, { ...linkRequest(c), subscriberId: found.subscriberId, patch, sentKeys })
      )
      return c.json(subscriber, 200)
    }
  },
  confirmSubscription: {
    handler: async (c) => {
      const confirmed = await byLink(c, c.req.valid('param').token, ['confirm'], (ctx, found) =>
        confirmSubscription(ctx, { ...linkRequest(c), subscriberId: found.subscriberId, tokenId: found.tokenId })
      )
      return c.json(confirmed, 200)
    }
  },
  unsubscribeSubscription: {
    // RFC 8058: the body is `List-Unsubscribe=One-Click` from a mail client, or nothing from the preference page.
    handler: async (c) => {
      await byLink(c, c.req.valid('param').token, ['unsubscribe', 'manage'], (ctx, found) =>
        unsubscribe(ctx, { subscriberId: found.subscriberId, now: c.get('deps').now() })
      )
      return c.body(null, 204)
    }
  }
}
