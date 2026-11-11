// #112 (a-retention): the nightly sweepers. Each returns `{ deleted, pseudonymised }`; deletes run in batches of at
// most 1,000 rows and are idempotent, so a second run the same night deletes 0. Every comparison is strict: a row
// exactly on its boundary stays until the next run. `now` is injected, and the subscriber erasure and the buckets come
// through `SweepDeps`, so tests run on doubles; `eraseSubscriber` is #110's (tests use a double).

import type { EraseSubscriber } from '@skyclause/contracts'
import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { withSystem, type SystemPrincipal, type Tx } from '../client'
import {
  domainEvent,
  exportJob,
  handledEvent,
  handledMessage,
  idempotencyKey,
  organization,
  rateLimit,
  subscriber
} from '../schema'
import type { RetentionBuckets } from './buckets'
import { sweepEvaluatorCoordination } from '../evaluator/transitions'

const DAY_MS = 24 * 60 * 60 * 1_000
/** NFR-14's subscriber grace, camera frame ceiling and domain event window; handled message marks use one day. */
const SUBSCRIBER_GRACE_MS = 30 * DAY_MS
const FRAME_CEILING_MS = 183 * DAY_MS
const DOMAIN_EVENT_WINDOW_MS = 30 * DAY_MS
/** Deletes run in batches of at most 1,000 rows. */
const BATCH = 1_000

/** What one sweeper did: rows deleted, rows kept under a pseudonymous ID. */
export interface SweepCounts {
  deleted: number
  pseudonymised: number
}

export interface SweepDeps {
  eraseSubscriber: EraseSubscriber
  buckets: RetentionBuckets
}

export interface Sweeper {
  name: string
  /** `org` sweepers run once per organisation; `global` ones run once, with `orgId` null. */
  scope: 'org' | 'global'
  /** `export-files` also runs once with `orgId` null, for account-scope rows with no organisation. */
  unscoped?: true
  run(tx: Tx<SystemPrincipal>, q: { orgId: string | null; now: Date }, deps: SweepDeps): Promise<SweepCounts>
}

const none = (): SweepCounts => ({ deleted: 0, pseudonymised: 0 })

/** Subscribers unsubscribed more than 30 days ago, erased through #110's `eraseSubscriber`. */
export async function sweepSubscribers(
  tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date },
  deps: SweepDeps
): Promise<SweepCounts> {
  const counts = none()
  const cutoff = new Date(q.now.getTime() - SUBSCRIBER_GRACE_MS)
  for (;;) {
    const due = await tx
      .select({ id: subscriber.id })
      .from(subscriber)
      .where(
        and(
          eq(subscriber.orgId, q.orgId!),
          lt(subscriber.unsubscribedAt, cutoff),
          // #110's completed tombstone stays erased even after another grace period passes.
          or(isNotNull(subscriber.emailHash), ne(subscriber.email, sql`${subscriber.id} || '@deleted.invalid'`))
        )
      )
      .orderBy(asc(subscriber.id))
      .limit(BATCH)
    if (!due.length) return counts
    for (const { id } of due) {
      // #110's erasure deletes the row or leaves a tombstone excluded from every later batch and run.
      await deps.eraseSubscriber(tx, id)
      const [left] = await tx.select({ id: subscriber.id }).from(subscriber).where(eq(subscriber.id, id))
      if (left) counts.pseudonymised += 1
      else counts.deleted += 1
    }
    if (due.length < BATCH) return counts
  }
}

const RFC_3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/

/** When the frame was captured: its `captured-at` metadata (#128 writes it), else when it was uploaded. */
function capturedAtOf(object: { metadata: Record<string, string>; timeCreated: Date }): Date {
  const raw = object.metadata['captured-at'] ?? ''
  if (RFC_3339.test(raw)) {
    const at = Date.parse(raw)
    if (!Number.isNaN(at)) return new Date(at)
  }
  return object.timeCreated
}

/**
 * Camera frames past the project's semester end or 183 days after capture, whichever comes first. The uploader stamps
 * the semester end as the object's custom time (storage.tf); objects without one keep only the 183-day ceiling.
 * Contrast rows are readings, not objects, so they stay.
 */
export async function sweepFrames(
  _tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date },
  deps: SweepDeps
): Promise<SweepCounts> {
  const counts = none()
  const objects = (await deps.buckets.frames.list(`orgs/${q.orgId}/`)).filter(({ name }) => !name.endsWith('/'))
  for (const object of objects) {
    const ends = [capturedAtOf(object).getTime() + FRAME_CEILING_MS]
    if (object.customTime) ends.push(object.customTime.getTime())
    if (q.now.getTime() > Math.min(...ends)) {
      await deps.buckets.frames.delete(object.name)
      counts.deleted += 1
    }
  }
  return counts
}

/** Export files whose `export_job.expires_at` has passed, deleted from EXPORTS_BUCKET by `object_path`. The job row stays
(for #109), so a row whose object is already gone is skipped: a second run the same night deletes 0. */
export async function sweepExportFiles(
  tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date },
  deps: SweepDeps
): Promise<SweepCounts> {
  const counts = none()
  const scope = q.orgId === null ? isNull(exportJob.orgId) : eq(exportJob.orgId, q.orgId)
  for (;;) {
    const due = await tx
      .select({ id: exportJob.id, objectPath: exportJob.objectPath })
      .from(exportJob)
      .where(and(scope, isNotNull(exportJob.objectPath), lt(exportJob.expiresAt, q.now)))
      .orderBy(asc(exportJob.id))
      .limit(BATCH)
    if (!due.length) return counts
    for (const { objectPath } of due) {
      const [found] = await deps.buckets.exports.list(objectPath!)
      if (!found || found.name !== objectPath) continue
      await deps.buckets.exports.delete(objectPath!)
      counts.deleted += 1
    }
    if (due.length < BATCH) return counts
  }
}

/** `idempotency_key` rows whose own `expiresAt` has passed (kept 24 hours, like the store's own cleanup). A row
expiring exactly at `now` stays until the next run. */
export async function sweepIdempotencyKeys(
  tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date }
): Promise<SweepCounts> {
  void q.orgId
  const counts = none()
  for (;;) {
    const due = await tx
      .select({ id: idempotencyKey.id })
      .from(idempotencyKey)
      .where(lt(idempotencyKey.expiresAt, q.now))
      .orderBy(asc(idempotencyKey.id))
      .limit(BATCH)
    if (!due.length) return counts
    const gone = await tx
      .delete(idempotencyKey)
      .where(
        inArray(
          idempotencyKey.id,
          due.map(({ id }) => id)
        )
      )
      .returning({ id: idempotencyKey.id })
    counts.deleted += gone.length
    if (due.length < BATCH) return counts
  }
}

/** Expired `rate_limit` windows. */
export async function sweepRateLimits(
  tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date }
): Promise<SweepCounts> {
  void q.orgId
  const counts = none()
  for (;;) {
    const due = await tx
      .select({ bucket: rateLimit.bucket })
      .from(rateLimit)
      .where(lt(rateLimit.resetAt, q.now))
      .orderBy(asc(rateLimit.bucket))
      .limit(BATCH)
    if (!due.length) return counts
    const gone = await tx
      .delete(rateLimit)
      .where(
        inArray(
          rateLimit.bucket,
          due.map(({ bucket }) => bucket)
        )
      )
      .returning({ bucket: rateLimit.bucket })
    counts.deleted += gone.length
    if (due.length < BATCH) return counts
  }
}

/**
 * `domain_event` rows published more than 30 days ago, and their `handled_event` rows. Unpublished rows stay.
 * `handled_event.event_id` cascades, so deleting the events deletes their marks; the explicit delete first keeps the
 * count honest when a mark outlives its event.
 */
export async function sweepDomainEvents(
  tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date }
): Promise<SweepCounts> {
  void q.orgId
  const counts = none()
  const cutoff = new Date(q.now.getTime() - DOMAIN_EVENT_WINDOW_MS)
  for (;;) {
    const due = await tx
      .select({ id: domainEvent.id })
      .from(domainEvent)
      .where(lt(domainEvent.publishedAt, cutoff))
      .orderBy(asc(domainEvent.id))
      .limit(BATCH)
    if (!due.length) return counts
    const ids = due.map(({ id }) => id)
    await tx.delete(handledEvent).where(inArray(handledEvent.eventId, ids))
    const gone = await tx.delete(domainEvent).where(inArray(domainEvent.id, ids)).returning({ id: domainEvent.id })
    counts.deleted += gone.length
    if (due.length < BATCH) return counts
  }
}

/**
 * `handled_message` marks (Resend received-email IDs, and the sources' request and poll keys) more than one day old.
 * Inbound mail relies on that day: `packages/delivery/src/inbound.ts` acknowledges unread any email received over 23
 * hours ago.
 */
export async function sweepHandledMessages(
  tx: Tx<SystemPrincipal>,
  q: { orgId: string | null; now: Date }
): Promise<SweepCounts> {
  void q.orgId
  const counts = none()
  const cutoff = new Date(q.now.getTime() - DAY_MS)
  for (;;) {
    const due = await tx
      .select({ consumer: handledMessage.consumer, messageId: handledMessage.messageId })
      .from(handledMessage)
      .where(lt(handledMessage.handledAt, cutoff))
      .orderBy(asc(handledMessage.consumer), asc(handledMessage.messageId))
      .limit(BATCH)
    if (!due.length) return counts
    const gone = await tx
      .delete(handledMessage)
      .where(
        or(
          ...due.map(({ consumer, messageId }) =>
            and(eq(handledMessage.consumer, consumer), eq(handledMessage.messageId, messageId))
          )
        )
      )
      .returning({ messageId: handledMessage.messageId })
    counts.deleted += gone.length
    if (due.length < BATCH) return counts
  }
}

/** Every sweeper this job owns; other owners keep their own jobs. `audit_finding` (#132) has its table (migration 0025); #549 adds its sweep. */
export const SWEEPERS: Sweeper[] = [
  { name: 'evaluator-coordination', scope: 'global', run: (tx, q) => sweepEvaluatorCoordination(tx, q.now) },
  { name: 'subscribers', scope: 'org', run: sweepSubscribers },
  { name: 'frames', scope: 'org', run: sweepFrames },
  { name: 'export-files', scope: 'org', unscoped: true, run: sweepExportFiles },
  { name: 'idempotency-keys', scope: 'global', run: sweepIdempotencyKeys },
  { name: 'rate-limits', scope: 'global', run: sweepRateLimits },
  { name: 'domain-events', scope: 'global', run: sweepDomainEvents },
  { name: 'handled-messages', scope: 'global', run: sweepHandledMessages }
]

export const JOB = 'retention'

/** The organisations to sweep: read as `system`, which may read auth.organization where `retention` may not. */
export async function listOrganizationIds(): Promise<string[]> {
  const rows = await withSystem(JOB, (tx) =>
    tx.select({ id: organization.id }).from(organization).orderBy(asc(organization.id))
  )
  return rows.map(({ id }) => id)
}
