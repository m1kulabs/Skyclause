import type { GroupedBackfillClaim, GroupRecovery, GroupRecoveryResult } from './grouped-backfill'
import type { LatestSlotRecoveryResult } from './slots'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { SourceKind } from '@skyclause/sources'
import { Digest } from './plan'
import { saveSourceResult, decodeObject, encodeObject, hasCode } from './storage'
import type { SourceExecutionResult, SourceObjectStore } from './types'
export const ResultReference = z.strictObject({
  operation_id: z.uuid(),
  kind: SourceKind,
  object_path: z.string(),
  sha256: Digest
})
export type ResultReference = z.infer<typeof ResultReference>
export interface PulledSourceResult {
  ackId: string
  data: unknown
}
export const resultPath = (kind: string, operationId: string) => `control/deliveries/${kind}/${operationId}.json`
export const sha256 = (body: Uint8Array) => createHash('sha256').update(body).digest('hex')
export async function publishSourceResult(
  result: SourceExecutionResult,
  ports: { store: SourceObjectStore; publish: (data: ResultReference) => Promise<void> }
): Promise<void> {
  const path = resultPath(result.kind, result.operationId)
  const body = encodeObject({
    ...result,
    requests: result.requests.map((request) => ({
      ...request,
      body: request.body === null ? null : Buffer.from(request.body).toString('base64')
    }))
  })
  const reference = ResultReference.parse({
    operation_id: result.operationId,
    kind: result.kind,
    object_path: path,
    sha256: sha256(body)
  })
  // Reserve discoverable intent before saving bytes. A crash in either window is visible to repair.
  await pendingResult(ports.store, reference, false)
  await saveSourceResult(ports.store, path, result)
  await ports.publish(reference)
}
export function sourceSubscription(
  project: string,
  subscription: string,
  options: { http?: typeof fetch; headers?: () => Promise<Headers> } = {}
) {
  const http = options.http ?? fetch
  let auth: Promise<import('google-auth-library').GoogleAuth> | undefined
  const headers =
    options.headers ??
    (async () => {
      auth ??= import('google-auth-library').then(
        ({ GoogleAuth }) => new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/pubsub' })
      )
      return (await auth).getRequestHeaders()
    })
  const call = async (method: string, body: unknown) => {
    const h = await headers()
    h.set('content-type', 'application/json')
    const signal = AbortSignal.timeout(method === 'pull' ? 5000 : 20000)
    let response: Response | undefined, text: string
    try {
      response = await http(
        `https://pubsub.googleapis.com/v1/projects/${project}/subscriptions/${subscription}:${method}`,
        { method: 'POST', headers: h, body: JSON.stringify(body), signal }
      )
      text = await response.text()
    } catch (error) {
      if (
        method === 'pull' &&
        signal.aborted &&
        (!response || response.ok) &&
        (error === signal.reason ||
          // Native fetch body reads use AbortError instead of the owned deadline reason.
          (response &&
            signal.reason instanceof DOMException &&
            signal.reason.name === 'TimeoutError' &&
            error instanceof DOMException &&
            error.name === 'AbortError'))
      )
        // No delivery completed within this wait; this does not prove the backlog is empty.
        return {}
      throw error
    }
    if (!response.ok) throw new Error(`Pub/Sub ${method} failed: ${response.status} ${text.slice(0, 200)}`)
    return text ? (JSON.parse(text) as unknown) : {}
  }
  return {
    async pullSourceResults(): Promise<PulledSourceResult[]> {
      const response = z
        .object({
          receivedMessages: z
            .array(z.object({ ackId: z.string().min(1), message: z.object({ data: z.string().optional() }) }))
            .optional()
        })
        .parse(await call('pull', { maxMessages: 100 }))
      return (response.receivedMessages ?? []).map(({ ackId, message }) => {
        // Invalid JSON remains a per-message failure, never preventing other deliveries from draining.
        let data: unknown
        try {
          data = JSON.parse(Buffer.from(message.data ?? '', 'base64').toString('utf8'))
        } catch {
          data = null
        }
        return { ackId, data }
      })
    },
    async ackSourceResults(ackIds: string[]): Promise<void> {
      if (ackIds.length) await call('acknowledge', { ackIds })
    }
  }
}

const pendingPath = 'control/pending-results.json'
export const LatestSlotRecovery = z.strictObject({
  type: z.literal('latest'),
  slotStart: z.number().int().nonnegative(),
  slotSeconds: z.number().int().positive(),
  claimSha256: Digest
})
export type LatestSlotRecovery = z.infer<typeof LatestSlotRecovery>
const Recovery = {
  // Existing source reservations remain readable during the plan/protocol rollout.
  backfill_source_id: z.uuid().optional(),
  recovery: z
    .discriminatedUnion('type', [
      z.strictObject({ type: z.literal('source'), sourceId: z.uuid() }),
      z.strictObject({
        type: z.literal('group'),
        key: Digest,
        anchor: z.iso.datetime(),
        sourceIds: z.array(z.uuid()).min(1),
        step: z.number().int().nonnegative()
      }),
      LatestSlotRecovery
    ])
    .optional()
}
const PendingDelivery = ResultReference.extend(Recovery)
const ResultReservation = ResultReference.omit({ sha256: true }).extend({
  reserved_until: z.iso.datetime(),
  ...Recovery
})
const Pending = z.array(z.union([PendingDelivery, ResultReservation]))
type PendingEntry = z.infer<typeof Pending>[number]
export const MAX_PENDING_RESULTS = 1000
// Longer than the current 600-second Cloud Run source execution limit. Expiry reports a stalled
// reservation unless a validated unfinished group or consumed latest slot can remain pending;
// it never releases capacity,
// creates another operation ID, or refetches captured bytes.
export const SOURCE_RESERVATION_MS = 20 * 60 * 1000
async function updatePending(
  store: SourceObjectStore,
  entries: PendingEntry | PendingEntry[],
  remove: boolean
): Promise<void> {
  for (;;) {
    const saved = await store.read(pendingPath)
    let next = saved ? Pending.parse(decodeObject(saved.body)) : []
    let changed = false
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      const previous = next.find((r) => r.operation_id === entry.operation_id)
      if (
        previous &&
        (previous.kind !== entry.kind ||
          previous.object_path !== entry.object_path ||
          ('sha256' in previous && 'sha256' in entry && previous.sha256 !== entry.sha256) ||
          (previous.recovery &&
            entry.recovery &&
            JSON.stringify(previous.recovery) !== JSON.stringify(entry.recovery)) ||
          (previous.backfill_source_id &&
            entry.backfill_source_id &&
            previous.backfill_source_id !== entry.backfill_source_id))
      )
        throw new Error('Conflicting pending source result')
      if (previous && !remove && 'reserved_until' in entry) continue
      changed = true
      next = next.filter((r) => r.operation_id !== entry.operation_id)
      if (!remove)
        next.push({
          ...entry,
          ...(previous?.backfill_source_id ? { backfill_source_id: previous.backfill_source_id } : {}),
          ...(previous?.recovery ? { recovery: previous.recovery } : {})
        })
    }
    if (!changed) return
    if (next.length > MAX_PENDING_RESULTS)
      throw new Error('Source result outbox is full; ingestion must drain before admission')
    try {
      await store.write(pendingPath, encodeObject(next), saved?.generation ?? '0')
      return
    } catch (error) {
      if (!hasCode(error, 412)) throw error
    }
  }
}
/** Reserve the whole frozen series atomically: no partial capacity leak and no HTTP on rejection. */
export function reserveGroupedSourceResults(
  store: SourceObjectStore,
  claim: GroupedBackfillClaim,
  now: Date
): Promise<void> {
  return updatePending(
    store,
    claim.children.map((child, step) =>
      ResultReservation.parse({
        operation_id: child.operationId,
        kind: claim.group.kind,
        object_path: resultPath(claim.group.kind, child.operationId),
        reserved_until: new Date(now.getTime() + SOURCE_RESERVATION_MS).toISOString(),
        recovery: {
          type: 'group',
          key: claim.group.key,
          anchor: claim.group.anchor,
          sourceIds: claim.group.sourceIds,
          step
        }
      })
    ),
    false
  )
}
/** Generation CAS claims one bounded slot for this operation before any provider HTTP is admitted. */
export function reserveSourceResult(
  store: SourceObjectStore,
  operationId: string,
  kind: SourceExecutionResult['kind'],
  now: Date,
  backfillSourceId?: string
): Promise<void> {
  return updatePending(
    store,
    ResultReservation.parse({
      operation_id: operationId,
      kind,
      object_path: resultPath(kind, operationId),
      reserved_until: new Date(now.getTime() + SOURCE_RESERVATION_MS).toISOString(),
      ...(backfillSourceId
        ? { backfill_source_id: backfillSourceId, recovery: { type: 'source', sourceId: backfillSourceId } }
        : {})
    }),
    false
  )
}
/** Bind this reservation to its original consumed slot, never the current plan or clock bucket. */
export function reserveLatestSlotResult(
  store: SourceObjectStore,
  operationId: string,
  kind: SourceExecutionResult['kind'],
  now: Date,
  recovery: LatestSlotRecovery
): Promise<void> {
  return updatePending(
    store,
    ResultReservation.parse({
      operation_id: operationId,
      kind,
      object_path: resultPath(kind, operationId),
      reserved_until: new Date(now.getTime() + SOURCE_RESERVATION_MS).toISOString(),
      recovery: LatestSlotRecovery.parse(recovery)
    }),
    false
  )
}
/** Finalization reuses the operation's reserved slot even when other producers have filled the outbox. */
export function pendingResult(store: SourceObjectStore, reference: ResultReference, remove: boolean): Promise<void> {
  return updatePending(store, reference, remove)
}
export async function repairSourceResults(ports: {
  store: SourceObjectStore
  publish: (data: ResultReference) => Promise<void>
  now?: () => Date
  recoverLatest?(
    recovery: LatestSlotRecovery,
    operationId: string,
    kind: SourceExecutionResult['kind'],
    now: Date
  ): Promise<LatestSlotRecoveryResult>
  unavailableLatest?(fields: {
    operationId: string
    kind: SourceExecutionResult['kind']
    state: 'running' | 'lost'
  }): void
  recoverGroup?(
    recovery: GroupRecovery,
    operationId: string,
    kind: SourceExecutionResult['kind'],
    now: Date
  ): Promise<GroupRecoveryResult>
  recoverBackfill?(
    sourceId: string,
    operationId: string,
    kind: SourceExecutionResult['kind'],
    now: Date
  ): Promise<SourceExecutionResult | null>
}): Promise<void> {
  const saved = await ports.store.read(pendingPath),
    failures: unknown[] = []
  for (const entry of saved ? Pending.parse(decodeObject(saved.body)) : []) {
    try {
      if (entry.recovery?.type === 'latest') {
        if (entry.backfill_source_id || entry.object_path !== resultPath(entry.kind, entry.operation_id))
          throw new Error('Invalid latest slot recovery identity')
        if (!ports.recoverLatest) throw new Error('Latest slot recovery is not configured')
        const recovered = await ports.recoverLatest(
          entry.recovery,
          entry.operation_id,
          entry.kind,
          ports.now?.() ?? new Date()
        )
        if ('reserved_until' in entry) {
          if (recovered.state === 'captured') await publishSourceResult(recovered.result, ports)
          else ports.unavailableLatest?.({ operationId: entry.operation_id, kind: entry.kind, state: recovered.state })
          // Retain capacity and recovery identity for late durable bytes. Expiry never grants a new GET.
          continue
        }
        if (recovered.state !== 'captured')
          throw new Error(`Pending latest slot capture missing: ${entry.operation_id}`)
      }
      const recover = async () => {
        const recovery =
          entry.recovery ??
          (entry.backfill_source_id ? { type: 'source' as const, sourceId: entry.backfill_source_id } : undefined)
        if (!recovery) return false
        // Latest slots were validated above even when delivery bytes already existed.
        if (recovery.type === 'latest') return false
        let result: GroupRecoveryResult
        if (recovery.type === 'group') {
          if (!ports.recoverGroup) throw new Error('Grouped backfill recovery is not configured')
          result = await ports.recoverGroup(recovery, entry.operation_id, entry.kind, ports.now?.() ?? new Date())
        } else {
          if (entry.backfill_source_id && entry.backfill_source_id !== recovery.sourceId)
            throw new Error('Invalid source recovery identity')
          if (!ports.recoverBackfill) throw new Error('Backfill recovery is not configured')
          result = await ports.recoverBackfill(
            recovery.sourceId,
            entry.operation_id,
            entry.kind,
            ports.now?.() ?? new Date()
          )
        }
        if (!result) return false
        if (result === 'resumable') return result
        await publishSourceResult(result, ports)
        return true
      }
      if ('reserved_until' in entry) {
        if (entry.object_path !== resultPath(entry.kind, entry.operation_id))
          throw new Error('Invalid reserved result path')
        // A validated unfinished group keeps its capacity and stable operations while
        // the scheduled runner resumes its remaining children, even after expiry.
        if ((await recover()) !== false) continue
        // Normal slot execution may save immutable delivery bytes before starting publication.
        if (!entry.backfill_source_id && !entry.recovery) {
          const saved = await ports.store.read(entry.object_path)
          if (saved) {
            const { parseSourceResult } = await import('./ingest')
            const result = parseSourceResult(decodeObject(saved.body))
            if (result.operationId !== entry.operation_id || result.kind !== entry.kind || result.purpose !== 'poll')
              throw new Error('Invalid reserved result identity')
            await publishSourceResult(result, ports)
            continue
          }
        }
        if (Date.parse(entry.reserved_until) > (ports.now?.() ?? new Date()).getTime()) continue
        throw new Error(`Source reservation expired before durable result: ${entry.operation_id}`)
      }
      // Recovery metadata stays private; Pub/Sub still receives exactly its four-field reference.
      const { backfill_source_id: _, recovery: _recovery, ...reference } = entry
      const ref = ResultReference.parse(reference)
      const receipt = await ports.store.read(`control/receipts/${ref.operation_id}.json`)
      if (receipt) {
        const stored = ResultReference.parse(decodeObject(receipt.body))
        if (JSON.stringify(stored) !== JSON.stringify(ref)) throw new Error('Conflicting source receipt')
        await pendingResult(ports.store, ref, true)
      } else {
        if (ref.object_path !== resultPath(ref.kind, ref.operation_id)) throw new Error('Invalid pending result path')
        const result = await ports.store.read(ref.object_path)
        if (!result && (await recover()) === true) continue
        if (!result || sha256(result.body) !== ref.sha256)
          throw new Error(`Pending source result missing or corrupt: ${ref.operation_id}`)
        await ports.publish(ref)
      }
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length)
    throw new AggregateError(failures, `Source publication repair failed: ${failures.map(String).join('; ')}`)
}
