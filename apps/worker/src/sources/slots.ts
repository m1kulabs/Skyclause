import { z } from 'zod'
import { SchemaError, type Source, type SourceAdapter } from '@skyclause/sources'
import { executeAdapter, type SourceContextFactory } from './execute'
import { parseSourceResult, receiptPath } from './ingest'
import { reserveSourceResult, ResultReference, resultPath, sha256 } from './pubsub'
import { decodeObject, encodeObject, hasCode, saveSourceResult } from './storage'
import type { SourceClock, SourceExecutionResult, SourceObjectStore } from './types'

const Claim = z.strictObject({
  operationId: z.uuid(),
  scheduledAt: z.iso.datetime().nullable()
})
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
  if (
    request.transportStartedAt !== null &&
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
  let claim: z.infer<typeof Claim>,
    won = false
  const existing = await ports.store.read(slot.path)
  if (existing) claim = Claim.parse(decodeObject(existing.body))
  else {
    claim = { operationId: ports.id(), scheduledAt: ports.scheduledAt }
    try {
      await ports.store.write(slot.path, encodeObject(claim), '0')
      won = true
    } catch (error) {
      if (!hasCode(error, 412)) throw error
      const saved = await ports.store.read(slot.path)
      if (!saved) throw new Error('Source slot claim disappeared')
      claim = Claim.parse(decodeObject(saved.body))
    }
  }
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
  return won ? saved.result.requests.filter((r) => r.transportStartedAt !== null).length : 0
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
