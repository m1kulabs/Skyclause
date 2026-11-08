import { sql } from 'drizzle-orm'
import { foreignKey, integer, text, unique, uuid } from 'drizzle-orm/pg-core'
import { domainEvent } from './audit'
import { organization } from './auth'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'

// TRD entities and #79 §3 rows for `e-webhooks`. All T.

/** A signed webhook endpoint (D38); deliveries start only after `verified_at`. The secret is sealed (D39). */
export const webhook = tenantTable(
  'webhook',
  {
    id: id(),
    url: text('url').notNull(),
    events: text('events')
      .array()
      .notNull()
      .default(sql`'{}'`),
    projectIds: uuid('project_ids').array(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    secretWrappedDek: text('secret_wrapped_dek').notNull(),
    secretKekVersion: text('secret_kek_version').notNull(),
    verifiedAt: instant('verified_at'),
    disabledAt: instant('disabled_at'),
    ...timestamps()
  },
  (self) => [
    orgKey('webhook', self),
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade')
  ]
)

/** One event bound for one webhook; mutable while its retries run. */
export const webhookDispatch = tenantTable(
  'webhook_dispatch',
  {
    id: id(),
    webhookId: uuid('webhook_id').notNull(),
    eventId: uuid('event_id').notNull(),
    attempt: integer('attempt').notNull().default(0),
    state: text('state').notNull().default('pending'),
    ...timestamps()
  },
  (self) => [
    orgKey('webhook_dispatch', self),
    sameOrg('webhook_dispatch_webhook', self, self.webhookId, webhook, true),
    sameOrg('webhook_dispatch_event', self, self.eventId, domainEvent),
    unique('webhook_dispatch_webhook_id_event_id_key').on(self.webhookId, self.eventId)
  ]
)

/** One delivery attempt (TRD); append-only. */
export const webhookDelivery = tenantTable(
  'webhook_delivery',
  {
    id: id(),
    dispatchId: uuid('dispatch_id').notNull(),
    eventId: uuid('event_id').notNull(),
    attempt: integer('attempt').notNull(),
    statusCode: integer('status_code'),
    latencyMs: integer('latency_ms'),
    excerpt: text('excerpt'),
    error: text('error'),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('webhook_delivery_dispatch', self, self.dispatchId, webhookDispatch, true),
    sameOrg('webhook_delivery_event', self, self.eventId, domainEvent)
  ]
)
