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
    const response = await http(
      `https://pubsub.googleapis.com/v1/projects/${project}/subscriptions/${subscription}:${method}`,
      { method: 'POST', headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }
    )
    const text = await response.text()
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
const Pending = z.array(ResultReference)
export const MAX_PENDING_RESULTS = 1000
/** A failed publish remains discoverable to subsequent jobs and batches. */
export async function pendingResult(
  store: SourceObjectStore,
  reference: ResultReference,
  remove: boolean
): Promise<void> {
  for (;;) {
    const saved = await store.read(pendingPath)
    const pending = saved ? Pending.parse(decodeObject(saved.body)) : []
    const previous = pending.find((r) => r.operation_id === reference.operation_id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(reference))
      throw new Error('Conflicting pending source result')
    if (!remove && !previous && pending.length >= MAX_PENDING_RESULTS)
      throw new Error('Source result outbox is full; ingestion must drain before admission')
    const next = pending.filter((r) => r.operation_id !== reference.operation_id)
    if (!remove) next.push(reference)
    try {
      await store.write(pendingPath, encodeObject(next), saved?.generation ?? '0')
      return
    } catch (error) {
      if (!hasCode(error, 412)) throw error
    }
  }
}
export async function assertSourceAdmission(store: SourceObjectStore): Promise<void> {
  const saved = await store.read(pendingPath)
  if (saved && Pending.parse(decodeObject(saved.body)).length >= MAX_PENDING_RESULTS)
    throw new Error('Source result outbox is full; ingestion must drain before admission')
}
export async function repairSourceResults(ports: {
  store: SourceObjectStore
  publish: (data: ResultReference) => Promise<void>
}): Promise<void> {
  const saved = await ports.store.read(pendingPath),
    failures: unknown[] = []
  for (const ref of saved ? Pending.parse(decodeObject(saved.body)) : []) {
    try {
      const receipt = await ports.store.read(`control/receipts/${ref.operation_id}.json`)
      if (receipt) {
        const stored = ResultReference.parse(decodeObject(receipt.body))
        if (JSON.stringify(stored) !== JSON.stringify(ref)) throw new Error('Conflicting source receipt')
        await pendingResult(ports.store, ref, true)
      } else {
        if (ref.object_path !== resultPath(ref.kind, ref.operation_id)) throw new Error('Invalid pending result path')
        const result = await ports.store.read(ref.object_path)
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
