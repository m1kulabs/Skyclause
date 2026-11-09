import { ROLES, type Role } from '@skyclause/contracts'
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, sql, type SQL } from 'drizzle-orm'
import { track } from '../analytics'
import { recordAudit } from '../audit'
import type { SystemPrincipal, Tx } from '../client'
import { emitEvent } from '../events'
import {
  approval,
  bundle,
  bundleAlert,
  call,
  member,
  night,
  notice,
  organization,
  project,
  pushSubscription,
  shadowState,
  shiftReminder,
  user,
  window
} from '../schema'

// #155 (c-approver-alerts): the outbox rows, reads and writes behind approver alerts, escalation and shift reminders.
// Every function runs in the caller's `withTenant` transaction. A `notice` holds no content, so its idempotency key
// names what it is about and the sender renders it from there, on first send and on a resend alike.

export type AlertLevel = 'on_duty' | 'next_approver' | 'admins'
export type AlertChannel = 'push' | 'email'
export type AlertSubject = { kind: 'alert'; bundleId: string; level: AlertLevel } | { kind: 'no_draft'; runId: string }

/** `approval.actor_id` for an escalation, which the system makes (the column is a non-null account UUID). */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

export function alertKey(s: AlertSubject, accountId: string, channel: AlertChannel): string {
  switch (s.kind) {
    case 'alert':
      return `alert:${s.bundleId}:${s.level}:${accountId}:${channel}`
    case 'no_draft':
      return `no_draft:${s.runId}:${accountId}:${channel}`
  }
}

export function parseAlertKey(key: string): AlertSubject | null {
  const [kind, id, level] = key.split(':')
  if (kind === 'alert' && id && (level === 'on_duty' || level === 'next_approver' || level === 'admins')) {
    return { kind, bundleId: id, level }
  }
  if (kind === 'no_draft' && id) return { kind, runId: id }
  return null
}

/**
 * Writes one `queued` `approver_alert` notice per item (a redelivery writes none) and returns the IDs of every item's
 * notice still `queued`, so a retry after a crash posts what the first attempt didn't.
 */
export async function queueAlerts(
  tx: Tx,
  projectId: string,
  subject: AlertSubject,
  items: Array<{ accountId: string; channel: AlertChannel }>
): Promise<string[]> {
  if (!items.length) return []
  const keys = items.map((item) => alertKey(subject, item.accountId, item.channel))
  await tx
    .insert(notice)
    .values(
      items.map((item, i) => ({
        orgId: tx.orgId!,
        projectId,
        kind: 'approver_alert' as const,
        channel: item.channel,
        idempotencyKey: keys[i]!,
        accountId: item.accountId,
        // P1's app is English; approver alerts follow it.
        language: 'en'
      }))
    )
    .onConflictDoNothing()
  const rows = await tx
    .select({ id: notice.id })
    .from(notice)
    .where(and(inArray(notice.idempotencyKey, keys), eq(notice.status, 'queued')))
  return rows.map((row) => row.id)
}

export async function alertNotices(tx: Tx, ids: string[]) {
  if (!ids.length) return []
  return tx
    .select({
      id: notice.id,
      projectId: notice.projectId,
      channel: notice.channel,
      accountId: notice.accountId,
      key: notice.idempotencyKey,
      createdAt: notice.createdAt
    })
    .from(notice)
    .where(and(inArray(notice.id, ids), eq(notice.kind, 'approver_alert'), eq(notice.status, 'queued')))
}

/** `approver_alert` notices still queued and created before `before`, for the resend sweep. */
export async function staleAlertNotices(tx: Tx, before: Date) {
  return tx
    .select({ id: notice.id, createdAt: notice.createdAt })
    .from(notice)
    .where(and(eq(notice.kind, 'approver_alert'), eq(notice.status, 'queued'), lt(notice.createdAt, before)))
    .orderBy(asc(notice.id))
}

export async function settleNotice(
  tx: Tx,
  id: string,
  o: { status: 'sent' | 'failed' | 'expired'; providerMessageId?: string | null; acceptedAt?: Date; now: Date }
) {
  await tx
    .update(notice)
    .set({
      status: o.status,
      providerMessageId: o.providerMessageId ?? null,
      acceptedAt: o.acceptedAt ?? null,
      updatedAt: o.now
    })
    .where(and(eq(notice.id, id), eq(notice.status, 'queued')))
}

/** CAL-10: true when this account, channel and level had no row for the bundle yet. */
export async function insertBundleAlert(
  tx: Tx,
  row: { bundleId: string; accountId: string; channel: 'web_push' | 'email'; level: AlertLevel; acceptedAt: Date }
): Promise<boolean> {
  const inserted = await tx
    .insert(bundleAlert)
    .values({ orgId: tx.orgId!, ...row })
    .onConflictDoNothing()
    .returning({ id: bundleAlert.id })
  return inserted.length > 0
}

/** The bundle row, locked for the caller's transaction. */
export async function lockBundle(tx: Tx, bundleId: string) {
  const [row] = await tx.select().from(bundle).where(eq(bundle.id, bundleId)).for('update')
  return row
}

/** What an alert about a bundle prints: its project, organisation slug and the calls still waiting on review. */
export async function bundleForAlert(tx: Tx, bundleId: string) {
  const [row] = await tx
    .select({ bundle, project: { id: project.id, slug: project.slug, name: project.name }, orgSlug: organization.slug })
    .from(bundle)
    .innerJoin(project, eq(project.id, bundle.projectId))
    .innerJoin(organization, eq(organization.id, bundle.orgId))
    .where(eq(bundle.id, bundleId))
  if (!row) return undefined
  const calls = await tx
    .select({
      mode: call.mode,
      shadow: call.shadow,
      startsAt: sql<Date | null>`coalesce(${window.startsAt}, ${night.arrivalStart})`.mapWith(window.startsAt),
      endsAt: sql<Date | null>`coalesce(${window.endsAt}, ${night.exitEnd})`.mapWith(window.endsAt)
    })
    .from(call)
    .leftJoin(window, eq(window.id, call.windowId))
    .leftJoin(night, eq(night.id, call.nightId))
    .where(and(eq(call.bundleId, bundleId), eq(call.state, 'drafted')))
    .orderBy(asc(call.id))
  return { ...row, calls }
}

export async function orgSlug(tx: Tx): Promise<string> {
  const [row] = await tx.select({ slug: organization.slug }).from(organization).where(eq(organization.id, tx.orgId!))
  return row!.slug
}

export async function projectForAlert(tx: Tx, projectId: string) {
  const [row] = await tx
    .select({ id: project.id, slug: project.slug, name: project.name, timeZone: project.timeZone })
    .from(project)
    .where(eq(project.id, projectId))
  return row
}

/** The organisation's Admins and Owners (CAL-11's second step, D24). */
export async function adminAccounts(tx: Tx): Promise<string[]> {
  const rows = await tx
    .select({ id: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, tx.orgId!), inArray(member.role, ['admin', 'owner'])))
    .orderBy(asc(member.userId))
  return rows.map((row) => row.id)
}

/** Each account's address, leaving out deleted accounts. */
export async function accountEmails(tx: Tx, accountIds: string[]): Promise<Map<string, string>> {
  if (!accountIds.length) return new Map()
  const rows = await tx
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(inArray(user.id, accountIds), isNull(user.deletedAt)))
  return new Map(rows.map((row) => [row.id, row.email]))
}

export async function pushTargets(tx: Tx, accountIds: string[]) {
  if (!accountIds.length) return []
  return tx
    .select({
      id: pushSubscription.id,
      accountId: pushSubscription.accountId,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth
    })
    .from(pushSubscription)
    .where(inArray(pushSubscription.accountId, accountIds))
    .orderBy(asc(pushSubscription.id))
}

/** A push service's 404 or 410 deletes the subscription (§1); a 2xx stamps `last_ok_at`. */
export async function settlePushSubscriptions(tx: Tx, o: { gone: string[]; ok: string[]; now: Date }) {
  if (o.gone.length) await tx.delete(pushSubscription).where(inArray(pushSubscription.id, o.gone))
  if (o.ok.length) {
    await tx
      .update(pushSubscription)
      .set({ lastOkAt: o.now, updatedAt: o.now })
      .where(inArray(pushSubscription.id, o.ok))
  }
}

/**
 * CAL-11: one escalation step, if the bundle is still in Needs review below `level`: the level, an `escalate`
 * approval by the system, the audit event, `bundle.escalated` and `bundle_escalated`. False when it already moved.
 */
export async function logEscalation(
  tx: Tx,
  bundleId: string,
  o: { level: 'next_approver' | 'admins'; accountIds: string[]; now: Date }
): Promise<boolean> {
  const n = o.level === 'next_approver' ? 1 : 2
  const [moved] = await tx
    .update(bundle)
    .set({ escalationLevel: n, updatedAt: o.now })
    .where(and(eq(bundle.id, bundleId), eq(bundle.state, 'needs_review'), lt(bundle.escalationLevel, n)))
    .returning()
  if (!moved) return false
  await tx.insert(approval).values({
    orgId: tx.orgId!,
    projectId: moved.projectId,
    bundleId,
    actorId: SYSTEM_ACTOR_ID,
    action: 'escalate',
    diff: { level: o.level, account_ids: o.accountIds },
    createdAt: o.now
  })
  await recordAudit(tx, {
    action: 'bundle.escalated',
    target: { type: 'bundle', id: bundleId },
    projectId: moved.projectId,
    after: { level: o.level, escalation_level: n, accounts: o.accountIds.length }
  })
  const callIds = await tx.select({ id: call.id }).from(call).where(eq(call.bundleId, bundleId)).orderBy(asc(call.id))
  await emitEvent(tx, {
    projectId: moved.projectId,
    type: 'bundle.escalated',
    // The bundle stays in Needs review; `escalated` is the state this event's contract names for the step.
    data: {
      bundle_id: bundleId,
      pack: moved.pack,
      state: 'escalated',
      call_ids: callIds.map((c) => c.id),
      sla_due_at: moved.slaDueAt?.toISOString() ?? null,
      level: o.level
    }
  })
  await track(tx, 'bundle_escalated', { pack: moved.pack, level: o.level }, { projectId: moved.projectId })
  return true
}

/** D24: the non-Normal modes the clause engine holds for a project's pack, worst first by name. */
export async function shadowModes(tx: Tx, projectId: string, pack: 'sky' | 'crowd'): Promise<string[]> {
  const mode = sql<string>`${shadowState.verdict}->>'mode'`
  const rows = await tx
    .selectDistinct({ mode })
    .from(shadowState)
    .where(and(eq(shadowState.projectId, projectId), eq(shadowState.pack, pack), sql`${mode} <> 'normal'`))
    .orderBy(mode)
  return rows.map((row) => row.mode)
}

/** Needs-review bundles due by `until` (the auditor's "nearing its SLA"). */
export async function bundlesDueBy(tx: Tx, until: Date) {
  return tx
    .select({ id: bundle.id, projectId: bundle.projectId })
    .from(bundle)
    .where(and(eq(bundle.state, 'needs_review'), isNotNull(bundle.slaDueAt), lte(bundle.slaDueAt, until)))
    .orderBy(asc(bundle.id))
}

export interface ShiftOccurrence {
  shiftId: string
  accountId: string
  projectId: string | null
  condition: 'storm_afternoon' | 'surge_night' | null
  template: 'storm_afternoon' | 'surge_night' | 'custom'
  /** `YYYY-MM-DD` in the shift's zone: the project's, or MYT for the organisation rota. */
  localDate: string
  startsAt: Date
  endsAt: Date
  /** Reminder kinds already sent for this shift and date. */
  sent: Array<'before_shift' | 'switched_on'>
}

/**
 * Rota shift occurrences on `dates` (a set-returning SQL fragment over `s.tz`), with `rota_shift.days` as ISO
 * weekdays (1 Monday to 7 Sunday) and an end at or before the start on the next day.
 */
async function occurrences(tx: Tx, dates: SQL, where: SQL): Promise<ShiftOccurrence[]> {
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    WITH s AS (
      SELECT rs.*, coalesce(p.time_zone, 'Asia/Kuala_Lumpur') AS tz
      FROM rota_shift rs LEFT JOIN project p ON p.id = rs.project_id
    ), o AS (
      SELECT s.id, s.account_id, s.project_id, s.condition, s.template, d.day::date AS local_date,
        (d.day::date + s.local_start) AT TIME ZONE s.tz AS starts_at,
        (d.day::date + s.local_end + CASE WHEN s.local_end <= s.local_start THEN interval '1 day' ELSE interval '0' END)
          AT TIME ZONE s.tz AS ends_at
      FROM s CROSS JOIN LATERAL ${dates} AS d(day)
      WHERE extract(isodow FROM d.day)::int = ANY (s.days)
    )
    SELECT o.id AS shift_id, o.account_id, o.project_id, o.condition, o.template,
      to_char(o.local_date, 'YYYY-MM-DD') AS local_date, o.starts_at, o.ends_at,
      coalesce((SELECT array_agg(r.kind::text) FROM shift_reminder r
        WHERE r.rota_shift_id = o.id AND r.local_date = o.local_date), '{}') AS sent
    FROM o WHERE ${where} ORDER BY o.starts_at, o.id`)
  return rows.map((row) => ({
    shiftId: row.shift_id as string,
    accountId: row.account_id as string,
    projectId: row.project_id as string | null,
    condition: row.condition as ShiftOccurrence['condition'],
    template: row.template as ShiftOccurrence['template'],
    localDate: row.local_date as string,
    startsAt: new Date(row.starts_at as string),
    endsAt: new Date(row.ends_at as string),
    sent: row.sent as ShiftOccurrence['sent']
  }))
}

/** CAL-19's planning: every shift occurrence starting in `(from, to]`. */
export function shiftsStarting(tx: Tx, from: Date, to: Date) {
  const dates = sql`generate_series((${from}::timestamptz AT TIME ZONE s.tz)::date,
    (${to}::timestamptz AT TIME ZONE s.tz)::date, interval '1 day')`
  return occurrences(tx, dates, sql`o.starts_at > ${from}::timestamptz AND o.starts_at <= ${to}::timestamptz`)
}

/** One shift's occurrence on a local date; none if the shift is gone or no longer runs that weekday. */
export async function shiftOn(tx: Tx, shiftId: string, localDate: string): Promise<ShiftOccurrence | undefined> {
  return (await occurrences(tx, sql`(SELECT ${localDate}::date)`, sql`o.id = ${shiftId}`))[0]
}

export async function projectIds(tx: Tx): Promise<string[]> {
  const rows = await tx.select({ id: project.id }).from(project).orderBy(asc(project.id))
  return rows.map((row) => row.id)
}

/** CAL-19: the reminder's row, once per shift, date and kind; null when it was already sent. */
export async function insertShiftReminder(
  tx: Tx,
  r: { rotaShiftId: string; accountId: string; localDate: string; kind: 'before_shift' | 'switched_on'; dueAt: Date }
): Promise<string | null> {
  const [row] = await tx
    .insert(shiftReminder)
    .values({ orgId: tx.orgId!, ...r })
    .onConflictDoNothing()
    .returning({ id: shiftReminder.id })
  return row?.id ?? null
}

/** The caller's push subscriptions in this organisation, by ID. */
export async function listPushSubscriptions(tx: Tx, accountId: string) {
  return tx
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.accountId, accountId))
    .orderBy(asc(pushSubscription.id))
}

/**
 * Registers a browser for the caller in this organisation, taking the endpoint over if another account here held it
 * (the browser has changed hands). One row per browser and organisation.
 */
export async function registerPushSubscription(
  tx: Tx,
  s: { accountId: string; endpoint: string; p256dh: string; auth: string; userAgent: string }
) {
  const [row] = await tx
    .insert(pushSubscription)
    .values({ orgId: tx.orgId!, ...s })
    .onConflictDoUpdate({
      target: [pushSubscription.orgId, pushSubscription.endpoint],
      set: { accountId: s.accountId, p256dh: s.p256dh, auth: s.auth, userAgent: s.userAgent, updatedAt: new Date() }
    })
    .returning()
  return row!
}

/** The endpoint of the caller's own subscription `id` here; null for an unknown ID or another account's. */
export async function ownPushEndpoint(tx: Tx, o: { accountId: string; id: string }): Promise<string | null> {
  const [row] = await tx
    .select({ endpoint: pushSubscription.endpoint })
    .from(pushSubscription)
    .where(and(eq(pushSubscription.id, o.id), eq(pushSubscription.accountId, o.accountId)))
  return row?.endpoint ?? null
}

/** Deletes the caller's own subscriptions here matching `id` or `endpoint`; false when none matched. */
export async function removePushSubscription(
  tx: Tx,
  o: { accountId: string } & ({ id: string } | { endpoint: string })
): Promise<boolean> {
  const which = 'id' in o ? eq(pushSubscription.id, o.id) : eq(pushSubscription.endpoint, o.endpoint)
  const removed = await tx
    .delete(pushSubscription)
    .where(and(which, eq(pushSubscription.accountId, o.accountId)))
    .returning({ id: pushSubscription.id })
  return removed.length > 0
}

const isRole = (role: string): role is Role => (ROLES as readonly string[]).includes(role)

/** The organisations an account is a member of, with its role in each, read across organisations as `system`. */
export async function accountOrganisations(
  tx: Tx<SystemPrincipal>,
  accountId: string
): Promise<Array<{ orgId: string; role: Role }>> {
  const rows = await tx
    .select({ orgId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, accountId))
    .orderBy(asc(member.organizationId))
  const orgs = new Map<string, Role>()
  for (const row of rows) if (isRole(row.role) && !orgs.has(row.orgId)) orgs.set(row.orgId, row.role)
  return [...orgs].map(([orgId, role]) => ({ orgId, role }))
}
