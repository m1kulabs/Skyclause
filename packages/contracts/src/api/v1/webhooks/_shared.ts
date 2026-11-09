import { z } from '@hono/zod-openapi'
import { Instant, Webhook, WebhookDelivery } from '../../shared'
import { DomainEventSchema, WEBHOOK_EVENT_TYPES } from '../../../events'

// D38: only catalogue events may be subscribed to; a saved secret is never returned again.
export const WebhookInput = Webhook.pick({ url: true, project_ids: true }).extend({
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1)
})

export const WebhookView = Webhook.extend({ events: WebhookInput.shape.events })

export const WebhookDeliveryView = WebhookDelivery.extend({
  state: z.string(),
  attempted_at: Instant,
  request_headers: z.record(z.string(), z.string()),
  request_body: DomainEventSchema,
  response_headers: z.record(z.string(), z.string()),
  response_body: z.string().nullable()
})

export const WebhookDispatch = z.object({ dispatch_id: z.string(), event_id: z.string(), state: z.string() })
