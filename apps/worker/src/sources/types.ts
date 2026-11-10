import type { PollContext, ReadingInput, SourceKind } from '@skyclause/sources'

export interface SourceObjectStore {
  read(path: string): Promise<{ body: Uint8Array; generation: string } | null>
  /** Generation "0" creates only if absent. Conflicts throw a GCS-style code 412. */
  write(path: string, body: Uint8Array, expectedGeneration: string): Promise<string>
}
export interface SourceClock {
  now(): Date
  monotonic(): number
  /** Cancellation releases the timer; callers check signal.aborted after waking. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>
}
export type SourcePurpose = 'poll' | 'backfill'
export type SourceError = {
  type: 'http' | 'timeout' | 'network' | 'schema' | 'rate_limited' | 'internal'
  message: string
}
export interface RequestCapture {
  requestId: string
  sourceIds: string[]
  url: string | null
  startedAt: string
  httpStatus: number | null
  latencyMs: number
  body: Uint8Array | null
  bodySha256: string | null
  error: SourceError | null
}
export interface SourcePollResult {
  sourceId: string
  requestId: string
  outcome: 'ok' | 'unchanged' | 'error'
  error: SourceError | null
  readings: ReadingInput[]
}
export interface SourceExecutionResult {
  operationId: string
  kind: SourceKind
  purpose: SourcePurpose
  scheduledAt: string | null
  requests: RequestCapture[]
  polls: SourcePollResult[]
}
export interface CapturedPollContext {
  ctx: PollContext
  requests: RequestCapture[]
}
