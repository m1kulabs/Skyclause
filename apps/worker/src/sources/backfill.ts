import { z } from 'zod'
import type { Source, SourceAdapter } from '@skyclause/sources'
import { executeAdapter, type SourceContextFactory } from './execute'
import { decodeObject, encodeObject, hasCode, loadSourceResult, saveSourceResult } from './storage'
import type { SourceClock, SourceExecutionResult, SourceObjectStore } from './types'

export interface BackfillClaim {
  state: 'running' | 'complete'
  operationId: string
  owner: string
  leaseExpiresAt: number
  resultPath: string
  scheduledAt: string | null
}
export interface BackfillPorts {
  store: SourceObjectStore
  clock: SourceClock
  /** UUIDv7 for operations, owners and requests. */
  id(): string
  contextFactory: SourceContextFactory
  publish(result: SourceExecutionResult): Promise<void>
  /** Runtime reserves durable outbox capacity for the winning operation before HTTP. */
  admit?(operationId: string): Promise<void>
  /** Poll-plan/ingest receipt check. Without a receipt, redelivery safely republishes stable IDs. */
  acknowledged?(operationId: string): Promise<boolean>
  /** Private runner handoff of the actual durable capture, including acknowledged results. */
  completed?(result: SourceExecutionResult): void
  scheduledAt?: string | null
  previousDigest?(sourceId: string, purpose: 'poll' | 'backfill'): string | null
}
async function publishCompleted(claim: BackfillClaim, ports: BackfillPorts): Promise<'complete'> {
  const acknowledged = await ports.acknowledged?.(claim.operationId)
  if (acknowledged && !ports.completed) return 'complete'
  const result = await loadSourceResult(ports.store, claim.resultPath)
  if (!result || result.operationId !== claim.operationId)
    throw new Error('Backfill claim has no matching durable result')
  if (!acknowledged) await ports.publish(result)
  ports.completed?.(result)
  return 'complete'
}
/** One committed backfill, not exactly-once external GET: death before saving bytes can repeat the GET. */
export async function runBackfillOnce<Raw>(
  adapter: SourceAdapter<Raw>,
  source: Source,
  ports: BackfillPorts
): Promise<'running' | 'complete' | 'unsupported'> {
  if (!adapter.backfill) return 'unsupported'
  const { store, clock } = ports
  const path = `control/backfills/${encodeURIComponent(source.id)}.json`
  let claim: BackfillClaim, generation: string
  for (;;) {
    const saved = await store.read(path)
    const previous = saved ? decodeObject<BackfillClaim>(saved.body) : null
    if (previous?.state === 'complete') return publishCompleted(previous, ports)
    if (previous && previous.leaseExpiresAt > clock.now().getTime()) return 'running'
    if (previous && (await loadSourceResult(store, previous.resultPath))) {
      // Recovery after saving the result but dying before the complete CAS; never invent another result.
      const complete: BackfillClaim = { ...previous, state: 'complete' }
      try {
        await store.write(path, encodeObject(complete), saved!.generation)
      } catch (error) {
        if (hasCode(error, 412)) continue
        throw error
      }
      return publishCompleted(complete, ports)
    }
    const operationId = previous?.operationId ?? ports.id(),
      owner = ports.id()
    claim = {
      state: 'running',
      operationId,
      owner,
      leaseExpiresAt: clock.now().getTime() + 60000,
      resultPath: `control/results/backfills/${encodeURIComponent(source.id)}/${encodeURIComponent(operationId)}/${encodeURIComponent(owner)}.json`,
      scheduledAt: previous ? previous.scheduledAt : (ports.scheduledAt ?? null)
    }
    try {
      generation = await store.write(path, encodeObject(claim), saved?.generation ?? '0')
      break
    } catch (error) {
      if (!hasCode(error, 412)) throw error
    }
  }
  const stop = new AbortController()
  let lost = false,
    renewalError: unknown
  const heartbeat = (async () => {
    let nextRenewal = clock.monotonic() + 20000
    try {
      while (!stop.signal.aborted) {
        await clock.sleep(Math.max(0, nextRenewal - clock.monotonic()), stop.signal)
        if (stop.signal.aborted) return
        if (claim.leaseExpiresAt <= clock.now().getTime()) {
          lost = true
          return
        }
        const renewed = { ...claim, leaseExpiresAt: clock.now().getTime() + 60000 }
        generation = await store.write(path, encodeObject(renewed), generation)
        claim = renewed
        nextRenewal += 20000
      }
    } catch (error) {
      lost = true
      if (!hasCode(error, 412)) renewalError = error
    }
  })()
  try {
    await ports.admit?.(claim.operationId)
    if (renewalError) throw renewalError
    if (lost || claim.leaseExpiresAt <= clock.now().getTime()) return 'running'
    const result = await executeAdapter(adapter, [source], ports.contextFactory, {
      operationId: claim.operationId,
      purpose: 'backfill',
      scheduledAt: claim.scheduledAt,
      clock,
      requestId: ports.id,
      previousDigest: ports.previousDigest
    })
    if (renewalError) throw renewalError
    if (lost || claim.leaseExpiresAt <= clock.now().getTime()) return 'running'
    await saveSourceResult(store, claim.resultPath, result)
    // Join any in-flight renewal before using its latest generation to commit.
    stop.abort()
    await heartbeat
    if (renewalError) throw renewalError
    if (lost || claim.leaseExpiresAt <= clock.now().getTime()) return 'running'
    const complete: BackfillClaim = { ...claim, state: 'complete' }
    try {
      await store.write(path, encodeObject(complete), generation)
    } catch (error) {
      if (hasCode(error, 412)) return 'running'
      throw error
    }
    return publishCompleted(complete, ports)
  } finally {
    stop.abort()
    await heartbeat
  }
}

/** Recover only already-saved bytes, fencing running-claim completion without admitting HTTP. */
export async function recoverSavedBackfill(options: {
  store: SourceObjectStore
  sourceId: string
  operationId: string
  kind: SourceExecutionResult['kind']
  now: Date
  validate(value: unknown): unknown
}): Promise<SourceExecutionResult | null> {
  const path = `control/backfills/${options.sourceId}.json`
  for (;;) {
    const saved = await options.store.read(path)
    if (!saved) return null
    const claim = z
      .strictObject({
        state: z.enum(['running', 'complete']),
        operationId: z.uuid(),
        owner: z.uuid(),
        leaseExpiresAt: z.number().finite(),
        resultPath: z.string(),
        scheduledAt: z.iso.datetime().nullable()
      })
      .parse(decodeObject(saved.body))
    if (
      claim.operationId !== options.operationId ||
      claim.resultPath !== `control/results/backfills/${options.sourceId}/${claim.operationId}/${claim.owner}.json`
    )
      throw new Error('Invalid backfill recovery identity')
    if (claim.state === 'running' && claim.leaseExpiresAt > options.now.getTime()) return null
    const result = await loadSourceResult(options.store, claim.resultPath, options.validate)
    if (!result) return null
    if (
      result.operationId !== claim.operationId ||
      result.kind !== options.kind ||
      result.purpose !== 'backfill' ||
      result.scheduledAt !== claim.scheduledAt ||
      !result.polls.length ||
      result.polls.some((p) => p.sourceId !== options.sourceId) ||
      result.requests.some((r) => r.sourceIds.length !== 1 || r.sourceIds[0] !== options.sourceId)
    )
      throw new Error('Invalid saved backfill result')
    if (claim.state === 'running') {
      try {
        await options.store.write(path, encodeObject({ ...claim, state: 'complete' }), saved.generation)
      } catch (error) {
        if (hasCode(error, 412)) continue
        throw error
      }
    }
    return result
  }
}
