import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { SystemPrincipal, Tx } from '../client'
import { emitEvent, handleOnce } from '../events'
import { projectSource, source, sourceObservationHead } from '../schema'
import { poll, reading } from '../schema/partitioned'
import { previousSourceDigest } from './queries'
import type { SourceReadingWrite, SourceRequestWrite, StoredSourcePoll } from './types'

const requestSchema = z
  .object({
    requestId: z.uuid().transform((id) => id.toLowerCase()),
    startedAt: z.date(),
    purpose: z.enum(['poll', 'backfill']),
    family: z.string().nullable(),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    latencyMs: z.number().int().nonnegative(),
    sources: z
      .array(
        z.object({
          sourceId: z.uuid().transform((id) => id.toLowerCase()),
          outcome: z.enum(['ok', 'error']),
          bodySha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .nullable(),
          errorCode: z.string().nullable().optional(),
          message: z.string().nullable().optional(),
          readings: z.array(
            z.object({
              metric: z.string().min(1),
              observedAt: z.date(),
              receivedAt: z.date(),
              value: z.number().nullable(),
              unit: z.string().nullable(),
              valueText: z.string().nullable().optional(),
              valueJson: z.json().optional(),
              itemKey: z.string().optional(),
              deviceTime: z.date().nullable().optional()
            })
          )
        })
      )
      .min(1)
  })
  .superRefine((input, ctx) => {
    if (new Set(input.sources.map(({ sourceId }) => sourceId)).size !== input.sources.length)
      ctx.addIssue({ code: 'custom', message: 'duplicate source' })
    for (const entry of input.sources) {
      if (entry.outcome === 'ok' && input.httpStatus === null)
        ctx.addIssue({ code: 'custom', message: 'success requires HTTP status' })
      if (entry.outcome === 'error' && entry.readings.length)
        ctx.addIssue({ code: 'custom', message: 'error cannot carry readings' })
    }
  })

async function appendReading(
  tx: Tx,
  sourceId: string,
  pollId: string,
  startedAt: Date,
  input: SourceReadingWrite,
  sameBody: boolean
): Promise<number> {
  const itemKey = input.itemKey ?? ''
  const key = { sourceId, metric: input.metric, observedAt: input.observedAt, itemKey }
  const [head] = await tx
    .select({ capturedAt: sourceObservationHead.capturedAt })
    .from(sourceObservationHead)
    .where(
      and(
        eq(sourceObservationHead.sourceId, sourceId),
        eq(sourceObservationHead.metric, input.metric),
        eq(sourceObservationHead.observedAt, input.observedAt),
        eq(sourceObservationHead.itemKey, itemKey)
      )
    )
  if (head && head.capturedAt > startedAt) return 0
  const [latest] = await tx
    .select()
    .from(reading)
    .where(
      and(
        eq(reading.sourceId, sourceId),
        eq(reading.metric, input.metric),
        eq(reading.observedAt, input.observedAt),
        sql`coalesce(${reading.itemKey}, '') = ${itemKey}`
      )
    )
    .orderBy(desc(reading.revision))
    .limit(1)
  if (latest) {
    if (latest.pollId) {
      const [capture] = await tx
        .select({ startedAt: poll.startedAt })
        .from(poll)
        .where(eq(poll.id, latest.pollId))
        .limit(1)
      if (capture && capture.startedAt > startedAt) return 0
    }
  }
  // Even an unchanged value proves this exact key was seen by the newer successful capture.
  // No source-wide clock: omitted keys and unseen historical observations remain eligible.
  await tx
    .insert(sourceObservationHead)
    .values({ ...key, capturedAt: startedAt })
    .onConflictDoUpdate({
      target: [
        sourceObservationHead.sourceId,
        sourceObservationHead.metric,
        sourceObservationHead.observedAt,
        sourceObservationHead.itemKey
      ],
      set: { capturedAt: sql`greatest(${sourceObservationHead.capturedAt}, ${startedAt})` }
    })
  if (sameBody) return 0
  if (latest) {
    const { rows } = await tx.execute<{ equal: boolean }>(sql`SELECT
      ${latest.value}::double precision IS NOT DISTINCT FROM ${input.value}::double precision
      AND ${latest.valueText}::text IS NOT DISTINCT FROM ${input.valueText ?? null}::text
      AND ${latest.unit}::text IS NOT DISTINCT FROM ${input.unit}::text
      AND ${JSON.stringify(latest.valueJson)}::jsonb IS NOT DISTINCT FROM ${JSON.stringify(input.valueJson ?? null)}::jsonb AS equal`)
    if (rows[0]!.equal) return 0
  }
  await tx.insert(reading).values({ ...input, sourceId, pollId, itemKey, revision: latest ? latest.revision + 1 : 1 })
  return 1
}

/** Replay reads stable IDs and derives original insertion counts from immutable reading rows. */
export async function loadStoredRequest(tx: Tx<SystemPrincipal>, requestId: string): Promise<StoredSourcePoll[]> {
  return tx
    .select({
      id: poll.id,
      sourceId: poll.sourceId,
      kind: source.kind,
      outcome: sql<StoredSourcePoll['outcome']>`${poll.outcome}`,
      httpStatus: poll.httpStatus,
      newRows: sql<number>`(SELECT count(*) FROM reading WHERE reading.poll_id = ${poll.id})`.mapWith(Number),
      purpose: sql<StoredSourcePoll['purpose']>`${poll.purpose}`,
      startedAt: poll.startedAt,
      receivedAt: poll.receivedAt
    })
    .from(poll)
    .innerJoin(source, eq(source.id, poll.sourceId))
    .where(eq(poll.requestId, requestId))
    .orderBy(asc(poll.sourceId))
}

/** All metadata and readings are validated before receipt/poll insertion; locks live only until commit. */
export async function recordSourceRequest(
  tx: Tx<SystemPrincipal>,
  input: SourceRequestWrite,
  // Private trusted DB clock seam for labelled tests; request payloads cannot set poll availability.
  now: () => Date = () => new Date()
): Promise<StoredSourcePoll[]> {
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) throw new Error('invalid source request', { cause: parsed.error })
  const request = parsed.data
  const receivedAt = now()
  if (!Number.isFinite(receivedAt.getTime())) throw new Error('invalid source receipt clock')
  await handleOnce(tx, 'sources:request', { messageId: request.requestId }, async () => {
    const entries = [...request.sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId))
    for (const { sourceId } of entries)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'sources:' + sourceId}, 0))`)
    for (const entry of entries) {
      const [exists] = await tx.select({ id: source.id }).from(source).where(eq(source.id, entry.sourceId))
      if (!exists) throw new Error(`source ${entry.sourceId} does not exist`)
    }
    for (const entry of entries) {
      const previousDigest = await previousSourceDigest(tx, entry.sourceId, request.purpose)
      const {
        rows: [identity]
      } = await tx.execute<{ id: string }>(sql`SELECT uuidv7() AS id`)
      let newRows = 0
      if (entry.outcome === 'ok') {
        const sameBody = entry.bodySha256 !== null && entry.bodySha256 === previousDigest
        for (const value of entry.readings)
          newRows += await appendReading(tx, entry.sourceId, identity!.id, request.startedAt, value, sameBody)
      }
      // Both tables are append-only; insert the poll once its actual reading count is known.
      await tx.insert(poll).values({
        id: identity!.id,
        sourceId: entry.sourceId,
        requestId: request.requestId,
        startedAt: request.startedAt,
        receivedAt,
        httpStatus: request.httpStatus,
        latencyMs: request.latencyMs,
        outcome: entry.outcome === 'error' ? 'error' : newRows ? 'ok' : 'unchanged',
        errorCode: entry.errorCode,
        message: entry.message,
        purpose: request.purpose,
        bodySha256: entry.bodySha256,
        apiFamily: request.family
      })
    }
  })
  return loadStoredRequest(tx, request.requestId)
}

/** A global receipt includes project identity, so fan-out in another tenant is still delivered. */
export async function emitSourcePoll(tx: Tx, projectId: string, stored: StoredSourcePoll): Promise<void> {
  if (!tx.orgId) throw new Error('emitSourcePoll needs a withTenant transaction')
  const [binding] = await tx
    .select({ id: projectSource.id })
    .from(projectSource)
    .where(and(eq(projectSource.projectId, projectId), eq(projectSource.sourceId, stored.sourceId)))
    .limit(1)
  if (!binding) throw new Error('source is not bound to this project')
  await handleOnce(tx, 'sources:poll-events', { messageId: `${stored.id}:${projectId}` }, async () => {
    await emitEvent(tx, {
      projectId,
      type: 'poll.recorded',
      data: {
        source_id: stored.sourceId,
        poll_id: stored.id,
        outcome: stored.outcome,
        http_status: stored.httpStatus,
        new_rows: stored.newRows
      }
    })
  })
}
