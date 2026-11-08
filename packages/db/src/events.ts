import { log } from '@skyclause/config'
import { DOMAIN_EVENT_SCHEMAS, type EmitEvent, type EventEnvelope, type EventType } from '@skyclause/contracts'
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { afterCommit, withSystem, type InSameContext, type SystemPrincipal, type Tx } from './client'
import { domainEvent, handledEvent } from './schema'

// #79 §5 "Write": the domain event outbox. emitEvent writes in the caller's transaction; the Pub/Sub publish happens
// only after commit, through the injected publisher; the 15-minute batch republishes what that missed (D45).

/** Publishes one `{event_id}` message to Pub/Sub `domain-events`; the composition root injects the real one. */
export type EventPublisher = (message: { event_id: string }) => Promise<void>

let publisher: EventPublisher | null = null

/** Sets the publisher emitEvent and the republish use; `null` unsets it (tests). */
export function setEventPublisher(next: EventPublisher | null) {
  publisher = next
}

const pending = new WeakMap<object, string[]>()

/** After commit: publish each event, then mark the published ones in a new transaction in the same context. */
async function publishCommitted(ids: string[], inSameContext: InSameContext) {
  if (!publisher) return
  const published: string[] = []
  for (const id of ids) {
    try {
      await publisher({ event_id: id })
      published.push(id)
    } catch (error) {
      log.warn('domain event publish failed; the batch republishes it', { event_id: id, error: String(error) })
    }
  }
  if (published.length) {
    await inSameContext((tx) =>
      tx
        .update(domainEvent)
        .set({ publishedAt: sql`now()` })
        .where(inArray(domainEvent.id, published))
    )
  }
}

/**
 * Validates `data` against its f-contracts schema, takes the project's next `seq` under a row lock on `event_counter`
 * (held to commit, so commit order is `seq` order), inserts `domain_event` and calls `pg_notify('skyclause_events',
 * …)` in the caller's transaction; Postgres delivers the notification only on commit. Needs `withTenant`.
 */
export const emitEvent: EmitEvent = async (handle, { projectId, type, data }) => {
  const tx = handle as Tx
  if (!tx.orgId) throw new Error('emitEvent needs a withTenant transaction')
  const parsed: unknown = DOMAIN_EVENT_SCHEMAS[type].shape.data.parse(data)
  const { rows } = await tx.execute<{ seq: string }>(sql`SELECT next_event_seq(${projectId}) AS seq`)
  const seq = Number(rows[0]!.seq)
  const [row] = await tx
    .insert(domainEvent)
    .values({ orgId: tx.orgId, projectId, seq, type, data: parsed })
    .returning({ id: domainEvent.id })
  const id = row!.id
  const payload = JSON.stringify({ id, org_id: tx.orgId, project_id: projectId, seq, type })
  await tx.execute(sql`SELECT pg_notify('skyclause_events', ${payload})`)
  let ids = pending.get(tx)
  if (!ids) {
    ids = []
    pending.set(tx, ids)
    const committed = ids
    afterCommit(tx, (inSameContext) => publishCommitted(committed, inSameContext))
  }
  ids.push(id)
  return { id, seq }
}

/**
 * The batch's republish (#79 §5, D45): publishes every event still unpublished 30 s before `now`, oldest first, and
 * marks them. Throws without a publisher, so a missing one fails the batch instead of passing silently (D9).
 */
export async function republishEvents(now: Date): Promise<number> {
  const publish = publisher
  if (!publish) throw new Error('no event publisher: the composition root must call setEventPublisher')
  return withSystem('domain-events-republish', async (tx) => {
    const due = await tx
      .select({ id: domainEvent.id })
      .from(domainEvent)
      .where(and(isNull(domainEvent.publishedAt), lt(domainEvent.createdAt, new Date(now.getTime() - 30_000))))
      .orderBy(asc(domainEvent.createdAt))
      .limit(500)
      .for('update', { skipLocked: true })
    for (const { id } of due) await publish({ event_id: id })
    const ids = due.map(({ id }) => id)
    if (ids.length) await tx.update(domainEvent).set({ publishedAt: now }).where(inArray(domainEvent.id, ids))
    return ids.length
  })
}

/** The envelope (TRD webhook event catalogue) of one event, read across organisations; null if it's gone. */
export async function loadEvent(
  tx: Tx<SystemPrincipal>,
  eventId: string
): Promise<(EventEnvelope & { type: EventType; seq: number }) | null> {
  const [row] = await tx.select().from(domainEvent).where(eq(domainEvent.id, eventId))
  if (!row) return null
  return {
    id: row.id,
    type: row.type as EventType,
    created_at: row.createdAt.toISOString(),
    org_id: row.orgId,
    project_id: row.projectId,
    seq: row.seq,
    data: row.data as Record<string, unknown>
  }
}

/**
 * Runs `fn` unless `consumer` already handled `eventId`, recording it in the same transaction, so a redelivery is a
 * no-op and a failed `fn` leaves no record. Returns whether `fn` ran. Needs a system principal (handled_event is S).
 */
export async function handleOnce(
  tx: Tx,
  consumer: string,
  eventId: string,
  fn: (tx: Tx) => Promise<void>
): Promise<boolean> {
  const claimed = await tx
    .insert(handledEvent)
    .values({ consumer, eventId })
    .onConflictDoNothing()
    .returning({ eventId: handledEvent.eventId })
  if (!claimed.length) return false
  await fn(tx)
  return true
}
