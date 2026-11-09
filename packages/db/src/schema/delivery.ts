import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, text, unique, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { id, instant, orgKey, sameOrg, tenantTable, timestamps } from './columns'
import {
  consentForm,
  crowdReplyKind,
  noticeChannel,
  noticeKind,
  noticeStatus,
  notificationKind,
  projectChannelKind,
  subscriberTokenPurpose,
  suppressionReason
} from './enums'
import { project } from './project'
import { call } from './runs'
import { window } from './windows'

// TRD entities and #79 §3 rows for `c-notice-templates`, `c-sender-email`, `c-subscribers`, `c-recipient-replies`,
// `c-notifications` and `c-approver-alerts`. All T.

/** A project's delivery channel switch. */
export const projectChannel = tenantTable(
  'project_channel',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    channel: projectChannelKind('channel').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    ...timestamps()
  },
  (self) => [
    sameOrg('project_channel_project', self, self.projectId, project, true),
    unique('project_channel_project_id_channel_key').on(self.projectId, self.channel)
  ]
)

/** A notice recipient; `email` is the only copy of the address, erased with the row (`a-subscriber-rights`). */
export const subscriber = tenantTable(
  'subscriber',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    email: text('email').notNull(),
    role: text('role'),
    language: text('language').notNull().default('en'),
    windowIds: uuid('window_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    channels: text('channels')
      .array()
      .notNull()
      .default(sql`'{email}'`),
    confirmedAt: instant('confirmed_at'),
    /** `emailHash(email)`, kept beside the address so status and sends match `suppression` (c-subscribers). */
    emailHash: text('email_hash'),
    unsubscribedAt: instant('unsubscribed_at'),
    ...timestamps()
  },
  (self) => [
    orgKey('subscriber', self),
    sameOrg('subscriber_project', self, self.projectId, project, true),
    unique('subscriber_project_id_email_key').on(self.projectId, self.email)
  ]
)

/** A hashed, purpose-bound subscriber link token (`issueSubscriberToken`). */
export const subscriberToken = tenantTable(
  'subscriber_token',
  {
    id: id(),
    subscriberId: uuid('subscriber_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: subscriberTokenPurpose('purpose').notNull(),
    callId: uuid('call_id'),
    windowId: uuid('window_id'),
    /** Null: no expiry (`unsubscribe` lives as long as its subscriber). */
    expiresAt: instant('expires_at'),
    /** Set once a single-use token is spent. */
    usedAt: instant('used_at'),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('subscriber_token_subscriber', self, self.subscriberId, subscriber, true),
    sameOrg('subscriber_token_call', self, self.callId, call, true),
    sameOrg('subscriber_token_window', self, self.windowId, window, true)
  ]
)

/** A shareable sign-up link for a project's notices. */
export const subscribeLink = tenantTable(
  'subscribe_link',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [sameOrg('subscribe_link_project', self, self.projectId, project, true)]
)

/** A subscriber's consent to a privacy notice version (`PRIVACY_NOTICE_VERSION`); append-only. */
export const consentRecord = tenantTable(
  'consent_record',
  {
    id: id(),
    subscriberId: uuid('subscriber_id').notNull(),
    form: consentForm('form').notNull(),
    noticeVersion: text('notice_version').notNull(),
    language: text('language').notNull(),
    /** The account that imported the address; null when the subscriber acted. */
    actorId: uuid('actor_id'),
    /** The fields a preference write changed, by name only, so no address outlives an erasure here. */
    changed: text('changed')
      .array()
      .notNull()
      .default(sql`'{}'`),
    ipHash: text('ip_hash'),
    at: instant('at').notNull().defaultNow()
  },
  (self) => [sameOrg('consent_record_subscriber', self, self.subscriberId, subscriber, true)]
)

/** An address never to email again (SES bounces and complaints, unsubscribes), by `emailHash`. */
export const suppression = tenantTable(
  'suppression',
  {
    id: id(),
    emailHash: text('email_hash').notNull(),
    reason: suppressionReason('reason').notNull(),
    at: instant('at').notNull().defaultNow()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    unique('suppression_org_id_email_hash_key').on(self.orgId, self.emailHash)
  ]
)

/** The outbox row for every send (TRD); `idempotency_key` is unique, `accepted_at` set on the provider's answer. */
export const notice = tenantTable(
  'notice',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    kind: noticeKind('kind').notNull(),
    channel: noticeChannel('channel').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    callId: uuid('call_id'),
    accountId: uuid('account_id'),
    subscriberId: uuid('subscriber_id'),
    language: text('language').notNull(),
    status: noticeStatus('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    acceptedAt: instant('accepted_at'),
    traceId: text('trace_id'),
    /** c-sender-email: sends started for a `call` notice; it fails once the retries after the first are spent. */
    attempts: integer('attempts').notNull().default(0),
    /** c-sender-email: the sender's lease while a send is in flight; a crashed send is retried once it lapses. */
    claimedUntil: instant('claimed_until'),
    ...timestamps()
  },
  (self) => [
    sameOrg('notice_project', self, self.projectId, project, true),
    sameOrg('notice_call', self, self.callId, call, true),
    sameOrg('notice_subscriber', self, self.subscriberId, subscriber, true),
    // `/ses/events` maps SES's message ID back to its notice; the sweep finds queued rows.
    index('notice_provider_message_id_idx').on(self.providerMessageId),
    index('notice_queued_idx')
      .on(self.orgId)
      .where(sql`${self.status} = 'queued'`)
  ]
)

/** A Crowd recipient's reply to a call (CAL-17); append-only. */
export const crowdReply = tenantTable(
  'crowd_reply',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    windowId: uuid('window_id').notNull(),
    /** The call whose notice was answered (the `reply` token's). */
    callId: uuid('call_id').notNull(),
    kind: crowdReplyKind('kind').notNull(),
    shiftTo: instant('shift_to'),
    /** When the recipient answered: SES's receipt time for an email, the request's for a link. */
    at: instant('at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('crowd_reply_project', self, self.projectId, project, true),
    sameOrg('crowd_reply_window', self, self.windowId, window, true),
    sameOrg('crowd_reply_call', self, self.callId, call, true)
  ]
)

/**
 * One plan-feedback answer (ANL-7): append-only rows of `count` 1, summed per window on read. Yes or no only, with no
 * text column, and nothing names the subscriber.
 */
export const planFeedback = tenantTable(
  'plan_feedback',
  {
    id: id(),
    projectId: uuid('project_id').notNull(),
    windowId: uuid('window_id').notNull(),
    /** "Did the weather change your plan?": true is yes. */
    answer: boolean('answer').notNull(),
    count: integer('count').notNull().default(1),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    sameOrg('plan_feedback_project', self, self.projectId, project, true),
    sameOrg('plan_feedback_window', self, self.windowId, window, true),
    check('plan_feedback_count_one', sql`${self.count} = 1`)
  ]
)

/** An in-app notification (`notify`, #79 §1); `project_id` null for organisation-wide ones. */
export const notification = tenantTable(
  'notification',
  {
    id: id(),
    accountId: uuid('account_id').notNull(),
    projectId: uuid('project_id'),
    kind: notificationKind('kind').notNull(),
    refType: text('ref_type').notNull(),
    refId: text('ref_id').notNull(),
    recovered: boolean('recovered').notNull().default(false),
    readAt: instant('read_at'),
    createdAt: instant('created_at').notNull().defaultNow()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    sameOrg('notification_project', self, self.projectId, project, true)
  ]
)

/** An account's switch for one notification kind in an organisation. */
export const notificationPreference = tenantTable(
  'notification_preference',
  {
    id: id(),
    accountId: uuid('account_id').notNull(),
    kind: notificationKind('kind').notNull(),
    enabled: boolean('enabled').notNull(),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    unique('notification_preference_org_id_account_id_kind_key').on(self.orgId, self.accountId, self.kind)
  ]
)

/** An approver's web push endpoint (D28), one per browser and organisation (#155); a 404 or 410 deletes it. */
export const pushSubscription = tenantTable(
  'push_subscription',
  {
    id: id(),
    accountId: uuid('account_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    lastOkAt: instant('last_ok_at'),
    ...timestamps()
  },
  (self) => [
    foreignKey({ columns: [self.orgId], foreignColumns: [organization.id] }).onDelete('cascade'),
    unique('push_subscription_org_id_endpoint_key').on(self.orgId, self.endpoint)
  ]
)
