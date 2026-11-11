import { desc, sql } from 'drizzle-orm'
import { bigint, foreignKey, index, jsonb, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, orgKey, sameOrg, tenantTable } from './columns'
import { auditActor, principalClient } from './enums'
import { project } from './project'

// The §1 shared writes' tables: `recordAudit`, `track`, `emitEvent` and `handleOnce` (#79 §1, §3, §5).

/** TRD's audit log (`recordAudit`); append-only, no personal data. T. */
export const auditEvent = tenantTable(
  'audit_event',
  {
    id: id(),
    projectId: uuid('project_id'),
    actorType: auditActor('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    client: principalClient('client').notNull(),
    clientName: text('client_name'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    // New writes use the wire timestamp precision; cursors preserve historical microseconds separately.
    at: instant('at')
      .notNull()
      .default(sql`date_trunc('milliseconds', now())`)
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    sameOrg('audit_event_project', self, self.projectId, project, true),
    // NFR-9: the list reads newest first, so the leading index is (org_id, at DESC); one composite index per
    // filter column keeps the filtered list on an index scan.
    index('audit_event_org_id_at_idx').on(self.orgId, desc(self.at)),
    index('audit_event_org_action_at_idx').on(self.orgId, self.action, desc(self.at)),
    index('audit_event_org_actor_at_idx').on(self.orgId, self.actorId, desc(self.at)),
    index('audit_event_org_target_at_idx').on(self.orgId, self.targetType, self.targetId, desc(self.at)),
    index('audit_event_org_project_at_idx').on(self.orgId, self.projectId, desc(self.at))
  ]
)

/**
 * PRD analytics events (`track`); append-only, S. `org_id` is null for events outside an organisation. `app` reaches it
 * only through the SECURITY DEFINER `track_event()`.
 */
export const analyticsEvent = pgTable(
  'analytics_event',
  {
    id: id(),
    orgId: uuid('org_id'),
    projectId: uuid('project_id'),
    name: text('name').notNull(),
    props: jsonb('props').notNull(),
    at: instant('at').notNull().defaultNow()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    foreignKey({
      name: 'analytics_event_project_fk',
      columns: [self.orgId, self.projectId],
      foreignColumns: [project.orgId, project.id]
    }).onDelete('cascade'),
    index('analytics_event_name_at_idx').on(self.name, self.at)
  ]
)

/**
 * The domain event outbox (#79 §5, `emitEvent`): `seq` per project in commit order; only `published_at` may change.
 * T; `system` also reads it across organisations, for the dispatcher and the republish.
 */
export const domainEvent = tenantTable(
  'domain_event',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    type: text('type').notNull(),
    data: jsonb('data').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    publishedAt: instant('published_at')
  },
  (self) => [
    orgKey('domain_event', self),
    sameOrg('domain_event_project', self, self.projectId, project, true),
    unique('domain_event_project_id_seq_key').on(self.projectId, self.seq),
    index('domain_event_unpublished_idx')
      .on(self.createdAt)
      .where(sql`${self.publishedAt} IS NULL`)
  ]
)

/** The last `seq` handed out per project; S, written only by the SECURITY DEFINER `next_event_seq()`. */
export const eventCounter = pgTable('event_counter', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => project.id, { onDelete: 'cascade' }),
  lastSeq: bigint('last_seq', { mode: 'number' }).notNull()
})

/** Which consumer has handled which event (`handleOnce`), so a redelivery runs nothing. S. */
export const handledEvent = pgTable(
  'handled_event',
  {
    consumer: text('consumer').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => domainEvent.id, { onDelete: 'cascade' }),
    handledAt: instant('handled_at').notNull().defaultNow()
  },
  (self) => [primaryKey({ columns: [self.consumer, self.eventId] })]
)

/**
 * Which consumer has handled which external message (a Resend received-email ID; `handleOnce`), so a redelivery runs
 * nothing. S.
 */
export const handledMessage = pgTable(
  'handled_message',
  {
    consumer: text('consumer').notNull(),
    messageId: text('message_id').notNull(),
    handledAt: instant('handled_at').notNull().defaultNow()
  },
  (self) => [primaryKey({ columns: [self.consumer, self.messageId] })]
)
