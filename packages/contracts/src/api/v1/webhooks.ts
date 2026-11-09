import { listWebhooks } from './webhooks/listWebhooks'
import { createWebhook } from './webhooks/createWebhook'
import { getWebhook } from './webhooks/getWebhook'
import { updateWebhook } from './webhooks/updateWebhook'
import { deleteWebhook } from './webhooks/deleteWebhook'
import { verifyWebhook } from './webhooks/verifyWebhook'
import { redeliverWebhook } from './webhooks/redeliverWebhook'
import { listWebhookDeliveries } from './webhooks/listWebhookDeliveries'

export { listWebhooks } from './webhooks/listWebhooks'
export { createWebhook } from './webhooks/createWebhook'
export { getWebhook } from './webhooks/getWebhook'
export { updateWebhook } from './webhooks/updateWebhook'
export { deleteWebhook } from './webhooks/deleteWebhook'
export { verifyWebhook } from './webhooks/verifyWebhook'
export { redeliverWebhook } from './webhooks/redeliverWebhook'
export { listWebhookDeliveries } from './webhooks/listWebhookDeliveries'

export const routes = [
  listWebhooks,
  createWebhook,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  verifyWebhook,
  redeliverWebhook,
  listWebhookDeliveries
] as const
