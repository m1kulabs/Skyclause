import { sql } from 'drizzle-orm'
import { date, foreignKey, integer, text, time, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import { alertChannel, alertLevel, rotaTemplate, shiftReminderKind } from './enums'
import { project } from './project'
import { bundle } from './runs'

// #79 §3 rows for `a-members-api` and `c-approver-alerts`, and TRD's rota_shift. All T.

/** A pending hand-over of the Owner role to another member. */
export const ownershipTransfer = tenantTable(
  'ownership_transfer',
  {
    id: id(),
    // Composite (org_id, member) foreign keys into auth.member are in migration 0004, beside the UNIQUE
    // (organization_id, id) they need, which the generated Better Auth schema can't carry.
    fromMemberId: uuid('from_member_id').notNull(),
    toMemberId: uuid('to_member_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').notNull().default('pending'),
    expiresAt: instant('expires_at').notNull(),
    ...timestamps()
  },
  (self) => [foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade')]
)

/** An approver shift (TRD); `project_id` null is the organisation rota, `order` ranks next approvers (D22). */
export const rotaShift = tenantTable(
  'rota_shift',
  {
    id: id(),
    accountId: uuid('account_id').notNull(),
    projectId: uuid('project_id'),
    days: integer('days')
      .array()
      .notNull()
      .default(sql`'{}'`),
    localStart: time('local_start').notNull(),
    localEnd: time('local_end').notNull(),
    condition: text('condition'),
    order: integer('order').notNull().default(0),
    template: rotaTemplate('template').notNull().default('custom'),
    ...timestamps()
  },
  (self) => [
    orgKey('rota_shift', self),
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    sameOrg('rota_shift_project', self, self.projectId, project, true)
  ]
)

/**
 * A reminder sent before a shift or on its conditional switch-on (D22); append-only, one per shift, local date and
 * kind (#155). `due_at` is when it was due: the shift's start less 30 minutes, or when the switch-on was seen.
 */
export const shiftReminder = tenantTable(
  'shift_reminder',
  {
    id: id(),
    rotaShiftId: uuid('rota_shift_id').notNull(),
    accountId: uuid('account_id').notNull(),
    localDate: date('local_date').notNull(),
    kind: shiftReminderKind('kind').notNull(),
    dueAt: instant('due_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('shift_reminder_rota_shift', self, self.rotaShiftId, rotaShift, true),
    unique('shift_reminder_rota_shift_id_local_date_kind_key').on(self.rotaShiftId, self.localDate, self.kind)
  ]
)

/** An approver alert, inserted on the provider's answer (`accepted_at`); append-only. */
export const bundleAlert = tenantTable(
  'bundle_alert',
  {
    id: id(),
    bundleId: uuid('bundle_id').notNull(),
    accountId: uuid('account_id').notNull(),
    channel: alertChannel('channel').notNull(),
    level: alertLevel('level').notNull(),
    acceptedAt: instant('accepted_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('bundle_alert_bundle', self, self.bundleId, bundle, true),
    // CAL-10: one row per account, channel and level, however often the provider answers.
    unique('bundle_alert_bundle_id_account_id_channel_level_key').on(
      self.bundleId,
      self.accountId,
      self.channel,
      self.level
    )
  ]
)
