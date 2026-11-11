import { z } from 'zod'
import { SchemaError, SourceKind, type Source, type SourceAdapter } from '@skyclause/sources'
import { executeAdapter, executeSourceStep, type SourceContextFactory } from './execute'
import { sourceError } from './http'
import { parseSourceResult, receiptPath } from './ingest'
import { reserveSourceResult, ResultReference, resultPath, sha256 } from './pubsub'
import { decodeObject, encodeObject, hasCode, saveSourceResult } from './storage'
import type { RequestCapture, SourceClock, SourceExecutionResult, SourceObjectStore } from './types'

const Claim = z.strictObject({
  operationId: z.uuid(),
  scheduledAt: z.iso.datetime().nullable()
})
/** Both source and feed slots use permanent, create-only admission. No lease takeover may fetch. */
async function admitSlot<T>(store: SourceObjectStore, path: string, create: () => T, parse: (body: Uint8Array) => T) {
  let saved = await store.read(path)
  if (!saved) {
    const body = encodeObject(create())
    try {
      const generation = await store.write(path, body, '0')
      return { claim: parse(body), generation, won: true }
    } catch (error) {
      if (!hasCode(error, 412)) throw error
      saved = await store.read(path)
    }
  }
  if (!saved) throw new Error('Source slot claim disappeared')
  return { claim: parse(saved.body), generation: saved.generation, won: false }
}
function slotFor(adapter: SourceAdapter<unknown>, source: Source, now: Date) {
  const seconds = adapter.latestSlot?.seconds
  if (adapter.batch !== 'per_source' || !seconds || !Number.isSafeInteger(seconds) || seconds <= 0)
    throw new SchemaError('Source slots require a positive per-source interval')
  const sourceId = z.uuid().parse(source.id).toLowerCase()
  const start = Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000
  return {
    start,
    end: start + seconds * 1000,
    sourceId,
    path: `control/slots/${adapter.kind}/${sourceId}/${start}.json`
  }
}
type Slot = ReturnType<typeof slotFor>
async function savedResult(
  store: SourceObjectStore,
  adapter: SourceAdapter<unknown>,
  slot: Slot,
  claim: z.infer<typeof Claim>
) {
  const saved = await store.read(resultPath(adapter.kind, claim.operationId))
  if (!saved) return null
  const result = parseSourceResult(decodeObject(saved.body))
  if (
    result.operationId !== claim.operationId ||
    result.kind !== adapter.kind ||
    result.purpose !== 'poll' ||
    result.scheduledAt !== claim.scheduledAt ||
    result.requests.length !== 1 ||
    result.polls.length !== 1 ||
    result.polls[0]!.sourceId.toLowerCase() !== slot.sourceId ||
    result.requests[0]!.sourceIds.length !== 1 ||
    result.requests[0]!.sourceIds[0]!.toLowerCase() !== slot.sourceId
  )
    throw new Error('Invalid source slot result identity')
  const request = result.requests[0]!
  // The existing synthetic pre-HTTP error may omit the optional transport timestamp.
  const noTransport =
    request.transportStartedAt == null &&
    request.httpStatus === null &&
    request.body === null &&
    request.bodySha256 === null &&
    request.error !== null &&
    (request.transportStartedAt === null || request.url === null)
  if (
    !noTransport &&
    (!request.transportStartedAt ||
      Date.parse(request.transportStartedAt) < slot.start ||
      Date.parse(request.transportStartedAt) >= slot.end)
  )
    throw new Error('Invalid source slot transport time')
  return { result, hash: sha256(saved.body) }
}

/** A claim is permanently consumed, including ambiguous crashes before saving bytes. */
export async function runSourceSlot(
  adapter: SourceAdapter<unknown>,
  source: Source,
  ports: {
    store: SourceObjectStore
    clock: SourceClock
    id(): string
    scheduledAt: string | null
    contextFactory(window: { start: number; end: number }): SourceContextFactory
    publish(result: SourceExecutionResult): Promise<void>
    log(message: string, fields: Record<string, string>): void
  }
): Promise<number> {
  const slot = slotFor(adapter, source, ports.clock.now())
  const { claim, won } = await admitSlot(
    ports.store,
    slot.path,
    () => ({ operationId: ports.id(), scheduledAt: ports.scheduledAt }),
    (body) => Claim.parse(decodeObject(body))
  )
  if (won) {
    await reserveSourceResult(ports.store, claim.operationId, adapter.kind, ports.clock.now())
    const result = await executeAdapter(adapter, [source], ports.contextFactory(slot), {
      operationId: claim.operationId,
      purpose: 'poll',
      scheduledAt: claim.scheduledAt,
      clock: ports.clock,
      requestId: ports.id
    })
    // Save at the existing delivery path so outbox repair can recover even before publication starts.
    await saveSourceResult(ports.store, resultPath(adapter.kind, claim.operationId), result)
  }
  const saved = await savedResult(ports.store, adapter, slot, claim)
  if (
    !saved ||
    (saved.result.requests[0]!.transportStartedAt &&
      Date.parse(saved.result.requests[0]!.transportStartedAt!) > ports.clock.now().getTime())
  ) {
    ports.log('source.slot.unavailable', {
      adapter: adapter.kind,
      source_id: slot.sourceId,
      operation_id: claim.operationId,
      state: ports.clock.now().getTime() >= slot.end ? 'lost' : 'running'
    })
    return 0
  }
  const receipt = await ports.store.read(receiptPath(claim.operationId))
  if (receipt) {
    const ref = ResultReference.parse(decodeObject(receipt.body))
    if (
      ref.operation_id !== claim.operationId ||
      ref.kind !== adapter.kind ||
      ref.object_path !== resultPath(adapter.kind, claim.operationId) ||
      ref.sha256 !== saved.hash
    )
      throw new Error('Invalid source slot receipt')
  } else await ports.publish(saved.result)
  return won ? saved.result.requests.filter((r) => r.transportStartedAt != null).length : 0
}

/** Read-only probe input: no admission, publication, fallback to an old slot or provider request. */
export async function currentSlotBody(
  adapter: SourceAdapter<unknown>,
  source: Source,
  store: SourceObjectStore,
  clock: SourceClock
): Promise<Uint8Array> {
  const slot = slotFor(adapter, source, clock.now())
  const existing = await store.read(slot.path)
  const saved = existing ? await savedResult(store, adapter, slot, Claim.parse(decodeObject(existing.body))) : null
  let result = saved?.result
  if (!existing) {
    // First-bind handoff keeps its original backfill purpose and uses no probe writes.
    const backfill = await store.read(`control/backfills/${source.id}.json`)
    if (backfill) {
      const claim = z
        .strictObject({
          state: z.enum(['running', 'complete']),
          operationId: z.uuid(),
          owner: z.uuid(),
          leaseExpiresAt: z.number().finite(),
          resultPath: z.string(),
          scheduledAt: z.iso.datetime().nullable()
        })
        .parse(decodeObject(backfill.body))
      if (claim.resultPath !== `control/results/backfills/${source.id}/${claim.operationId}/${claim.owner}.json`)
        throw new Error('Invalid backfill probe path')
      const capture = claim.state === 'complete' ? await store.read(claim.resultPath) : null
      if (capture) {
        result = parseSourceResult(decodeObject(capture.body))
        if (
          result.operationId !== claim.operationId ||
          result.kind !== adapter.kind ||
          result.purpose !== 'backfill' ||
          result.scheduledAt !== claim.scheduledAt ||
          result.requests.length !== 1 ||
          result.polls.length !== 1 ||
          result.polls[0]!.sourceId !== source.id ||
          result.requests[0]!.sourceIds.length !== 1 ||
          result.requests[0]!.sourceIds[0] !== source.id
        )
          throw new Error('Invalid backfill probe identity')
      }
    }
  }
  const request = result?.requests[0]
  const now = clock.now().getTime()
  if (
    !request?.body ||
    request.error ||
    result!.polls.some((p) => p.outcome === 'error') ||
    !request.transportStartedAt ||
    Date.parse(request.transportStartedAt) < slot.start ||
    Date.parse(request.transportStartedAt) >= slot.end ||
    Date.parse(request.transportStartedAt) > now ||
    now < slot.start ||
    now >= slot.end
  )
    throw new SchemaError('Contract probe unavailable: no successful current-slot capture')
  return request.body
}

export type SlotCapture =
  { purpose: 'poll'; result: SourceExecutionResult } | { purpose: 'discovery'; request: RequestCapture }
export type LatestSlotResult =
  | { state: 'complete'; capture: SlotCapture }
  | { state: 'not-covered'; sourceIds: string[] }
  | { state: 'running' | 'lost' }
export interface LatestSlotPorts {
  store: SourceObjectStore
  clock: SourceClock
  id(): string
  scheduledAt: string | null
  contextFactory(window: { start: number; end: number }): SourceContextFactory
  publish(result: SourceExecutionResult): Promise<void>
  reserve(operationId: string): Promise<void>
}
const LatestClaim = Claim.extend({
  purpose: z.enum(['poll', 'discovery']),
  sourceIds: z.array(z.uuid()),
  captureDeadline: z.number().finite(),
  lost: z.boolean()
})
type LatestClaim = z.infer<typeof LatestClaim>
const DiscoveryCapture = z.strictObject({
  operationId: z.uuid(),
  kind: SourceKind,
  purpose: z.literal('discovery'),
  request: z.strictObject({
    requestId: z.uuid(),
    sourceIds: z.array(z.uuid()).length(0),
    url: z.url().nullable(),
    startedAt: z.iso.datetime(),
    admissionStartedAt: z.iso.datetime(),
    admissionMs: z.number().int().nonnegative(),
    transportStartedAt: z.iso.datetime().nullable(),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    latencyMs: z.number().int().nonnegative(),
    body: z.string().nullable(),
    bodySha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    error: z
      .strictObject({ type: z.enum(['http', 'timeout', 'network', 'schema', 'rate_limited']), message: z.string() })
      .nullable()
  })
})
function latestSlotFor(kind: SourceKind, seconds: number, now: Date) {
  SourceKind.parse(kind)
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isFinite(now.getTime()))
    throw new SchemaError('Source slots require a positive interval and valid clock')
  const start = Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000
  return { start, end: start + seconds * 1000, path: `control/latest-slots/${kind}/${start}.json` }
}
function parseLatestClaim(body: Uint8Array): LatestClaim {
  const claim = LatestClaim.parse(decodeObject(body))
  if (
    new Set(claim.sourceIds).size !== claim.sourceIds.length ||
    claim.sourceIds.some((id) => id !== id.toLowerCase()) ||
    (claim.purpose === 'poll') !== claim.sourceIds.length > 0
  )
    throw new Error('Invalid latest slot cohort')
  return claim
}
const discoveryPath = (kind: SourceKind, operationId: string) =>
  `control/discovery-captures/${kind}/${operationId}.json`
async function savedLatestCapture(
  store: SourceObjectStore,
  kind: SourceKind,
  slot: ReturnType<typeof latestSlotFor>,
  claim: LatestClaim
): Promise<SlotCapture | null> {
  let capture: SlotCapture
  if (claim.purpose === 'poll') {
    const saved = await store.read(resultPath(kind, claim.operationId))
    if (!saved) return null
    const result = parseSourceResult(decodeObject(saved.body))
    if (
      result.operationId !== claim.operationId ||
      result.kind !== kind ||
      result.purpose !== 'poll' ||
      result.scheduledAt !== claim.scheduledAt ||
      result.requests.length !== 1 ||
      result.polls.length !== claim.sourceIds.length ||
      JSON.stringify(result.requests[0]!.sourceIds) !== JSON.stringify(claim.sourceIds)
    )
      throw new Error('Invalid latest slot result identity')
    const receipt = await store.read(receiptPath(claim.operationId))
    if (receipt) {
      const ref = ResultReference.parse(decodeObject(receipt.body))
      if (
        ref.operation_id !== claim.operationId ||
        ref.kind !== kind ||
        ref.object_path !== resultPath(kind, claim.operationId) ||
        ref.sha256 !== sha256(saved.body)
      )
        throw new Error('Invalid latest slot receipt')
    }
    capture = { purpose: 'poll', result }
  } else {
    const saved = await store.read(discoveryPath(kind, claim.operationId))
    if (!saved) return null
    const value = DiscoveryCapture.parse(decodeObject(saved.body))
    if (value.operationId !== claim.operationId || value.kind !== kind)
      throw new Error('Invalid discovery capture identity')
    const request = value.request,
      body = request.body === null ? null : Buffer.from(request.body, 'base64')
    if (
      body
        ? body.toString('base64') !== request.body ||
          sha256(body) !== request.bodySha256 ||
          request.httpStatus === null ||
          request.httpStatus < 200 ||
          request.httpStatus >= 300
        : request.bodySha256 !== null
    )
      throw new Error('Invalid discovery body hash or status')
    if (request.httpStatus !== null && (request.url === null || request.transportStartedAt === null))
      throw new Error('Invalid discovery HTTP metadata')
    capture = { purpose: 'discovery', request: { ...request, body } }
  }
  const request = capture.purpose === 'poll' ? capture.result.requests[0]! : capture.request
  if (request.transportStartedAt) {
    if (
      request.startedAt !== request.transportStartedAt ||
      Date.parse(request.transportStartedAt) < slot.start ||
      Date.parse(request.transportStartedAt) >= slot.end ||
      (request.admissionStartedAt && Date.parse(request.admissionStartedAt) > Date.parse(request.transportStartedAt))
    )
      throw new Error('Invalid latest slot transport time')
  } else if (request.httpStatus !== null || request.body !== null || request.error === null)
    throw new Error('Invalid latest slot transport metadata')
  return capture
}

/** One create-only admission owns the frozen feed cohort, including discovery and ambiguous death. */
export async function runLatestSlot<Raw>(
  adapter: SourceAdapter<Raw>,
  sources: Source[],
  ports: LatestSlotPorts
): Promise<LatestSlotResult> {
  if (adapter.batch !== 'all_bound' || !adapter.latestSlot)
    throw new SchemaError('Latest slots require an all-bound capability')
  const members = [...new Map(sources.map((source) => [z.uuid().parse(source.id).toLowerCase(), source])).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, source]) => ({ ...structuredClone(source), id }))
  if (members.some((source) => source.kind !== adapter.kind)) throw new SchemaError('Source kind differs from adapter')
  const slot = latestSlotFor(adapter.kind, adapter.latestSlot.seconds, ports.clock.now())
  const { claim, won, generation } = await admitSlot(
    ports.store,
    slot.path,
    (): LatestClaim =>
      LatestClaim.parse({
        operationId: ports.id(),
        scheduledAt: ports.scheduledAt,
        purpose: members.length ? 'poll' : 'discovery',
        sourceIds: members.map((s) => s.id),
        captureDeadline: ports.clock.now().getTime() + 60000,
        lost: false
      }),
    parseLatestClaim
  )
  const uncovered = members.filter((s) => !claim.sourceIds.includes(s.id)).map((s) => s.id)
  if (uncovered.length) return { state: 'not-covered', sourceIds: uncovered }
  if (won) {
    try {
      const options = {
        operationId: claim.operationId,
        purpose: 'poll' as const,
        scheduledAt: claim.scheduledAt,
        clock: ports.clock,
        requestId: ports.id
      }
      if (claim.purpose === 'poll') {
        await ports.reserve(claim.operationId)
        const result = await executeSourceStep(
          adapter,
          members,
          { key: 'latest', fetch: (ctx) => adapter.fetch(members, ctx) },
          ports.contextFactory(slot),
          options
        )
        await saveSourceResult(ports.store, resultPath(adapter.kind, claim.operationId), result)
      } else {
        const capture = ports.contextFactory(slot)([], options)
        let failure: unknown
        try {
          await adapter.fetch([], capture.ctx)
        } catch (error) {
          failure = error
        } finally {
          await capture.closeAndDrain()
        }
        if (failure && sourceError(failure).type === 'internal') throw failure
        if (capture.requests.length !== 1) throw new SchemaError('Discovery requires exactly one physical request')
        const request = structuredClone(capture.requests[0]!)
        if (failure) request.error ??= sourceError(failure)
        await ports.store.write(
          discoveryPath(adapter.kind, claim.operationId),
          encodeObject({
            operationId: claim.operationId,
            kind: adapter.kind,
            purpose: 'discovery',
            request: { ...request, body: request.body === null ? null : Buffer.from(request.body).toString('base64') }
          }),
          '0'
        )
      }
    } catch (error) {
      // A failed save may be ambiguous. Neither a lost marker nor expiry ever authorizes another GET.
      await ports.store.write(slot.path, encodeObject({ ...claim, lost: true }), generation)
      throw error
    }
  }
  const capture = await savedLatestCapture(ports.store, adapter.kind, slot, claim)
  if (!capture)
    return { state: claim.lost || ports.clock.now().getTime() >= claim.captureDeadline ? 'lost' : 'running' }
  const request = capture.purpose === 'poll' ? capture.result.requests[0]! : capture.request
  if (request.transportStartedAt && Date.parse(request.transportStartedAt) > ports.clock.now().getTime())
    return { state: 'running' }
  // An empty cohort requests catalogue capture only, even if this slot originally polled bindings.
  if (capture.purpose === 'poll' && members.length) await ports.publish(capture.result)
  return { state: 'complete', capture }
}

/** Successful physical bytes in this clock slot only; never creates admission or domain results. */
export async function readCurrentSlotCapture(
  store: SourceObjectStore,
  kind: SourceKind,
  slotSeconds: number,
  now: Date
): Promise<RequestCapture | null> {
  const slot = latestSlotFor(kind, slotSeconds, now),
    existing = await store.read(slot.path)
  if (!existing) return null
  const capture = await savedLatestCapture(store, kind, slot, parseLatestClaim(existing.body))
  const request = capture?.purpose === 'poll' ? capture.result.requests[0] : capture?.request
  if (
    !request?.body ||
    request.error ||
    !request.transportStartedAt ||
    Date.parse(request.transportStartedAt) > now.getTime() ||
    request.httpStatus === null ||
    request.httpStatus < 200 ||
    request.httpStatus >= 300
  )
    return null
  return request
}
