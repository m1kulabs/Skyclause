import { verifySubscriberToken } from '@skyclause/db'
import { answerFeedback, REPLY_PRINCIPAL, refuseExtraFields, replyToCall } from '../../services/replies'
import { linkExpired } from '../../services/subscribers'
import type { Handlers } from '../index'

// #163 (c-recipient-replies): #79 §4's `/api/subscribe/{token}/{reply,feedback}`. Every bad token answers the same 410
// as #157's routes: unknown, expired, used, of another purpose or naming no window.

export const replyHandlers: Handlers = {
  createSubscriberReply: {
    handler: async (c) => {
      const reply = c.req.valid('json')
      refuseExtraFields(await c.req.json(), reply.kind === 'shift' ? ['kind', 'shift_to'] : ['kind'])
      const found = await verifySubscriberToken(c.req.valid('param').token, 'reply')
      if (!found?.callId || !found.windowId) throw linkExpired()
      const target = { ...found, callId: found.callId, windowId: found.windowId }
      const deps = c.get('deps')
      const body = await deps.withTenant({ orgId: found.orgId, principal: REPLY_PRINCIPAL }, (tx) =>
        replyToCall({ principal: REPLY_PRINCIPAL, tx }, { target, reply, now: deps.now() })
      )
      return c.json(body, 201)
    }
  },
  createSubscriberFeedback: {
    handler: async (c) => {
      const { answer } = c.req.valid('json')
      refuseExtraFields(await c.req.json(), ['answer'])
      const found = await verifySubscriberToken(c.req.valid('param').token, 'feedback')
      if (!found?.windowId) throw linkExpired()
      const target = { ...found, windowId: found.windowId }
      const body = await c
        .get('deps')
        .withTenant({ orgId: found.orgId, principal: REPLY_PRINCIPAL }, (tx) =>
          answerFeedback({ principal: REPLY_PRINCIPAL, tx }, { target, answer })
        )
      return c.json(body, 201)
    }
  }
}
