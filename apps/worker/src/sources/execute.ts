import { SchemaError, SOURCE_METRICS, type ReadingInput, type Source, type SourceAdapter } from '@skyclause/sources'
import { z } from 'zod'
import { sourceError } from './http'
import type { CapturedPollContext, SourceClock, SourceError, SourceExecutionResult, SourcePurpose } from './types'

export interface ExecuteOptions {
  operationId: string
  purpose: SourcePurpose
  scheduledAt: string | null
  clock: SourceClock
  requestId(): string
  /** Only the previous successful body for this purpose; callers own the poll-plan snapshot. */
  previousDigest?(sourceId: string, purpose: SourcePurpose): string | null
}
export type SourceContextFactory = (sources: Source[], options: ExecuteOptions) => CapturedPollContext
const Reading = z.strictObject({
  sourceId: z.string(),
  metric: z.string(),
  observedAt: z.iso.datetime(),
  value: z.number().finite().nullable(),
  valueText: z.string().nullable().optional(),
  valueJson: z.json(),
  unit: z.string().nullable(),
  itemKey: z.string().optional()
})
function validateReadings(kind: SourceAdapter<unknown>['kind'], sources: Source[], rows: unknown): ReadingInput[] {
  const parsed = z.array(Reading).safeParse(rows)
  if (!parsed.success) throw new SchemaError('Invalid reading shape', { cause: parsed.error })
  const allowed = new Set(sources.map((source) => source.id))
  const metrics: Record<string, { unit: string | null; value_json: z.ZodType }> = SOURCE_METRICS[kind]
  for (const row of parsed.data) {
    const contract = Object.hasOwn(metrics, row.metric) ? metrics[row.metric] : undefined
    if (
      !allowed.has(row.sourceId) ||
      !contract ||
      row.unit !== contract.unit ||
      !contract.value_json.safeParse(row.valueJson).success
    )
      throw new SchemaError(`Invalid ${kind} reading for ${row.sourceId}/${row.metric}`)
  }
  return parsed.data as ReadingInput[]
}
/** The input is the latest valid plan's active, ownerless bound sources. This module never queries a database. */
export async function executeAdapter<Raw>(
  adapter: SourceAdapter<Raw>,
  sources: Source[],
  contextFactory: SourceContextFactory,
  options: ExecuteOptions
): Promise<SourceExecutionResult> {
  const unique = [...new Map(sources.map((source) => [source.id, source])).values()]
  if (unique.some((source) => source.kind !== adapter.kind)) throw new SchemaError('Source kind differs from adapter')
  const result: SourceExecutionResult = {
    operationId: options.operationId,
    kind: adapter.kind,
    purpose: options.purpose,
    scheduledAt: options.scheduledAt,
    requests: [],
    polls: []
  }
  const groups = adapter.batch === 'all_bound' ? (unique.length ? [unique] : []) : unique.map((source) => [source])
  for (const group of groups) {
    const { ctx, requests, closeAndDrain } = contextFactory(group, options)
    const started = options.clock.monotonic(),
      startedAt = options.clock.now().toISOString()
    let error: SourceError | null = null
    let rows: ReadingInput[] = []
    let unchanged = new Set<string>()
    let fetched: { raw: Raw } | undefined
    try {
      fetched = {
        raw:
          options.purpose === 'backfill'
            ? await (adapter.backfill
                ? adapter.backfill(group[0]!, ctx)
                : Promise.reject(new SchemaError('Adapter does not support backfill')))
            : await adapter.fetch(group, ctx)
      }
    } catch (cause) {
      error = sourceError(cause)
      if (error.type === 'internal') throw cause
    } finally {
      // Promise.all can reject before its siblings settle. Close admission now and join the ledger.
      await closeAndDrain()
    }
    error ??= requests.find((request) => request.error)?.error ?? null
    const internal = requests.find((request) => request.error?.type === 'internal')?.error
    if (internal) throw new Error(internal.message)
    if (!error && fetched) {
      try {
        if (!requests.length) throw new SchemaError('Adapter produced no HTTP request')
        // A final body alone says nothing about preceding responses in an aggregate fetch.
        if (requests.length === 1 && requests[0]!.bodySha256 !== null)
          unchanged = new Set(
            group
              .filter((source) => options.previousDigest?.(source.id, options.purpose) === requests[0]!.bodySha256)
              .map((source) => source.id)
          )
        if (unchanged.size !== group.length)
          rows = validateReadings(adapter.kind, group, adapter.parse(fetched.raw, group)).filter(
            (row) => !unchanged.has(row.sourceId)
          )
      } catch (cause) {
        error = sourceError(cause)
        if (error.type === 'internal') throw cause
        const finalRequest = requests.at(-1)
        if (finalRequest && !finalRequest.error) finalRequest.error = error
      }
    }
    if (!requests.length)
      requests.push({
        requestId: options.requestId(),
        sourceIds: group.map((source) => source.id),
        url: null,
        startedAt,
        httpStatus: null,
        latencyMs: Math.max(0, Math.round(options.clock.monotonic() - started)),
        body: null,
        bodySha256: null,
        error
      })
    if (error) rows = []
    const last = requests.at(-1)!
    for (const request of requests) {
      for (const source of group) {
        const readings = request === last ? rows.filter((row) => row.sourceId === source.id) : []
        const outcome = error ? 'error' : readings.length ? 'ok' : 'unchanged'
        result.polls.push({ sourceId: source.id, requestId: request.requestId, outcome, error, readings })
      }
      ctx.log('source.request', {
        adapter: adapter.kind,
        url: request.url,
        request_id: request.requestId,
        purpose: options.purpose,
        scheduled_at: options.scheduledAt,
        started_at: request.startedAt,
        admission_started_at: request.admissionStartedAt ?? null,
        admission_ms: request.admissionMs ?? null,
        transport_started_at: request.transportStartedAt ?? null,
        lag_ms:
          options.scheduledAt === null
            ? null
            : Math.max(0, Date.parse(request.startedAt) - Date.parse(options.scheduledAt)),
        outcome: error ? 'error' : request === last && rows.length ? 'ok' : 'unchanged',
        http_status: request.httpStatus,
        duration_ms: request.latencyMs
      })
    }
    result.requests.push(...requests)
  }
  // Adapter-held buffers and response readers cannot mutate the published/durable snapshot later.
  return structuredClone(result)
}
