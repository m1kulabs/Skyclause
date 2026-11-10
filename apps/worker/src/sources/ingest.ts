import {
  boundSources,
  emitSourcePoll,
  loadStoredRequest,
  recordSourceRequest,
  systemPrincipal,
  withSystem,
  withTenant,
  type StoredSourcePoll
} from '@skyclause/db'
import {
  SOURCE_METRICS,
  SourceKind,
  type SourceAdapter,
  type ReadingInput,
  type ReadingsUpdated
} from '@skyclause/sources'
import { z } from 'zod'
import { Digest, sourceSnapshot } from './plan'
import { ResultReference, resultPath, sha256, pendingResult, type PulledSourceResult } from './pubsub'
import { decodeObject, encodeObject, hasCode } from './storage'
import type { SourceExecutionResult, SourceObjectStore } from './types'
const ErrorSchema = z.strictObject({
  type: z.enum(['http', 'timeout', 'network', 'schema', 'rate_limited']),
  message: z.string()
})
const ReadingSchema = z.strictObject({
  sourceId: z.uuid(),
  metric: z.string(),
  observedAt: z.iso.datetime(),
  value: z.number().finite().nullable(),
  valueText: z.string().nullable().optional(),
  valueJson: z.json(),
  unit: z.string().nullable(),
  itemKey: z.string().optional()
})
const ResultSchema = z.strictObject({
  operationId: z.uuid(),
  kind: SourceKind,
  purpose: z.enum(['poll', 'backfill']),
  scheduledAt: z.iso.datetime().nullable(),
  requests: z.array(
    z.strictObject({
      requestId: z.uuid(),
      sourceIds: z.array(z.uuid()).min(1),
      url: z.url().nullable(),
      startedAt: z.iso.datetime(),
      admissionStartedAt: z.iso.datetime().optional(),
      admissionMs: z.number().int().nonnegative().optional(),
      transportStartedAt: z.iso.datetime().nullable().optional(),
      httpStatus: z.number().int().min(100).max(599).nullable(),
      latencyMs: z.number().int().nonnegative(),
      body: z.string().nullable(),
      bodySha256: Digest.nullable(),
      error: ErrorSchema.nullable()
    })
  ),
  polls: z.array(
    z.strictObject({
      sourceId: z.uuid(),
      requestId: z.uuid(),
      outcome: z.enum(['ok', 'unchanged', 'error']),
      error: ErrorSchema.nullable(),
      readings: z.array(ReadingSchema)
    })
  )
})
/** Treat the durable object as untrusted input, even when its reference hash matches. */
export function parseSourceResult(value: unknown): SourceExecutionResult {
  const parsed = ResultSchema.parse(value),
    seen = new Set<string>()
  const requests = new Map(parsed.requests.map((request) => [request.requestId, request]))
  if (requests.size !== parsed.requests.length) throw new Error('Duplicate source request')
  const metrics: Record<string, { unit: string | null; value_json: z.ZodType }> = SOURCE_METRICS[parsed.kind]
  for (const request of parsed.requests) {
    if (request.transportStartedAt !== undefined) {
      if (
        request.transportStartedAt !== null &&
        (request.startedAt !== request.transportStartedAt ||
          (request.admissionStartedAt !== undefined &&
            Date.parse(request.admissionStartedAt) > Date.parse(request.transportStartedAt)))
      )
        throw new Error('Invalid source transport timing')
      if (request.httpStatus !== null && request.transportStartedAt === null)
        throw new Error('HTTP status without transport start')
    }
    if (new Set(request.sourceIds).size !== request.sourceIds.length) throw new Error('Duplicate request source')
    if (request.body !== null) {
      const bytes = Buffer.from(request.body, 'base64')
      if (bytes.toString('base64') !== request.body || sha256(bytes) !== request.bodySha256)
        throw new Error('Invalid source body hash')
      if (request.httpStatus === null || request.httpStatus < 200 || request.httpStatus >= 300)
        throw new Error('Body without successful HTTP response')
    } else if (request.bodySha256 !== null) throw new Error('Digest without source body')
    if (request.httpStatus !== null && request.url === null) throw new Error('HTTP response without URL')
  }
  for (const poll of parsed.polls) {
    const request = requests.get(poll.requestId),
      key = `${poll.requestId}:${poll.sourceId}`
    if (!request || !request.sourceIds.includes(poll.sourceId) || seen.has(key))
      throw new Error('Invalid source/request association')
    seen.add(key)
    if (poll.outcome === 'error') {
      if (!poll.error || poll.readings.length) throw new Error('Invalid error poll')
    } else if (
      poll.error ||
      request.error ||
      request.httpStatus === null ||
      request.httpStatus < 200 ||
      request.httpStatus >= 300 ||
      request.body === null
    )
      throw new Error('Invalid successful HTTP metadata')
    if (poll.outcome === 'unchanged' && poll.readings.length) throw new Error('Unchanged poll carries readings')
    for (const row of poll.readings) {
      const metric = Object.hasOwn(metrics, row.metric) ? metrics[row.metric] : undefined
      if (
        row.sourceId !== poll.sourceId ||
        !metric ||
        metric.unit !== row.unit ||
        !metric.value_json.safeParse(row.valueJson).success
      )
        throw new Error('Invalid source metric')
    }
  }
  if (seen.size !== parsed.requests.reduce((sum, r) => sum + r.sourceIds.length, 0))
    throw new Error('Missing source poll')
  return {
    ...parsed,
    requests: parsed.requests.map((request) => ({
      ...request,
      body: request.body === null ? null : Buffer.from(request.body, 'base64')
    })),
    polls: parsed.polls.map((poll) => ({ ...poll, readings: poll.readings as ReadingInput[] }))
  }
}
export interface IngestPorts {
  store: SourceObjectStore
  persist(result: SourceExecutionResult): Promise<StoredSourcePoll[]>
  fanout(polls: StoredSourcePoll[]): Promise<void>
  publish(data: ReadingsUpdated): Promise<void>
}
export const receiptPath = (operationId: string) => `control/receipts/${operationId}.json`
export async function ingestSourceResult(message: unknown, ports: IngestPorts): Promise<void> {
  const ref = ResultReference.parse(message)
  if (ref.object_path !== resultPath(ref.kind, ref.operation_id)) throw new Error('Invalid source result path')
  const saved = await ports.store.read(ref.object_path)
  if (!saved) throw new Error('Source result is missing')
  if (sha256(saved.body) !== ref.sha256) throw new Error('Source result hash mismatch')
  const result = parseSourceResult(decodeObject(saved.body))
  if (result.operationId !== ref.operation_id || result.kind !== ref.kind)
    throw new Error('Source result identity mismatch')
  const stored = await ports.persist(result)
  await ports.fanout(stored)
  for (const poll of stored)
    if (poll.newRows > 0)
      await ports.publish({ source_id: poll.sourceId, kind: poll.kind, poll_id: poll.id, new_rows: poll.newRows })
  const body = encodeObject(ref)
  try {
    await ports.store.write(receiptPath(result.operationId), body, '0')
  } catch (error) {
    if (!hasCode(error, 412)) throw error
    const previous = await ports.store.read(receiptPath(result.operationId))
    if (!previous || !Buffer.from(previous.body).equals(Buffer.from(body)))
      throw new Error('Conflicting source receipt')
  }
  await pendingResult(ports.store, ref, true)
}
export async function drainSourceResults(ports: {
  pull: () => Promise<PulledSourceResult[]>
  ack: (ids: string[]) => Promise<void>
  ingest: (data: unknown) => Promise<void>
}): Promise<void> {
  const failures: unknown[] = []
  // Bound one batch to the outbox capacity; a short pull has drained the currently available delivery set.
  for (let page = 0; page < 10; page++) {
    const messages = await ports.pull()
    for (const message of messages) {
      try {
        await ports.ingest(message.data)
        await ports.ack([message.ackId])
      } catch (error) {
        failures.push(error)
      }
    }
    if (messages.length < 100) break
  }
  if (failures.length) throw new AggregateError(failures, `Source ingestion failed: ${failures.map(String).join('; ')}`)
}
export function sourceIngestionDatabase(
  adapters: readonly SourceAdapter<unknown>[],
  now = () => new Date()
): Pick<IngestPorts, 'persist' | 'fanout'> {
  return {
    async persist(result) {
      const adapter = adapters.find((a) => a.kind === result.kind)
      if (!adapter) throw new Error(`unregistered source adapter: ${result.kind}`)
      const current = await sourceSnapshot(now())
      const allowed = new Set(current.sources.filter((s) => s.source.kind === result.kind).map((s) => s.source.id))
      const stored: StoredSourcePoll[] = []
      for (const request of result.requests) {
        const sources = result.polls.filter((p) => p.requestId === request.requestId && allowed.has(p.sourceId))
        const rows = await withSystem('sources:ingest', async (tx) => {
          // Replay must preserve original insertion counts even if all bindings have since disappeared.
          const previous = await loadStoredRequest(tx, request.requestId)
          if (previous.length) return previous
          if (!sources.length) return []
          const receivedAt = now()
          return recordSourceRequest(tx, {
            requestId: request.requestId,
            startedAt: new Date(request.startedAt),
            purpose: result.purpose,
            family: adapter.apiFamily ?? null,
            httpStatus: request.httpStatus,
            latencyMs: request.latencyMs,
            sources: sources.map((p) => ({
              sourceId: p.sourceId,
              outcome: p.outcome === 'error' ? 'error' : 'ok',
              bodySha256:
                result.requests.filter((r) => r.sourceIds.includes(p.sourceId)).length === 1
                  ? request.bodySha256
                  : null,
              errorCode: p.error?.type ?? null,
              message: p.error?.message ?? null,
              readings: p.readings.map((r) => ({
                ...r,
                valueJson: z.json().parse(r.valueJson),
                observedAt: new Date(r.observedAt),
                receivedAt
              }))
            }))
          })
        })
        if (rows.some((p) => p.kind !== result.kind || !request.sourceIds.includes(p.sourceId)))
          throw new Error('Stored request identity mismatch')
        stored.push(...rows)
      }
      return stored
    },
    async fanout(polls) {
      const current = await sourceSnapshot(now())
      const orgs = [...new Set(current.sources.flatMap((s) => s.bindings.map((b) => b.orgId)))]
      for (const orgId of orgs)
        await withTenant({ orgId, principal: systemPrincipal('sources:fanout') }, async (tx) => {
          for (const kind of new Set(polls.map((p) => p.kind))) {
            const bindings = await boundSources(tx, kind)
            for (const poll of polls.filter((p) => p.kind === kind)) {
              const source = bindings.find((s) => s.id === poll.sourceId && s.ownerOrgId === null)
              for (const binding of source?.bindings ?? []) await emitSourcePoll(tx, binding.projectId, poll)
            }
          }
        })
    }
  }
}
