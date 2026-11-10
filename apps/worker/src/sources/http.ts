import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  HttpError,
  NetworkError,
  RateLimitedError,
  SchemaError,
  TimeoutError,
  type ApiFamily,
  type PollContext,
  type Source,
  type SourceKind
} from '@skyclause/sources'
import { takeSourceBudget } from './budget'
import type { CapturedPollContext, RequestCapture, SourceClock, SourceError, SourceObjectStore } from './types'

export const sourceClock: SourceClock = {
  now: () => new Date(),
  monotonic: () => performance.now(),
  async sleep(ms, signal) {
    try {
      await delay(ms, undefined, { signal })
    } catch (error) {
      if (!signal?.aborted) throw error
    }
  }
}
export function sourceError(error: unknown): SourceError {
  const type =
    error instanceof HttpError
      ? 'http'
      : error instanceof TimeoutError
        ? 'timeout'
        : error instanceof NetworkError
          ? 'network'
          : error instanceof RateLimitedError
            ? 'rate_limited'
            : error instanceof SchemaError
              ? 'schema'
              : 'internal'
  return { type, message: error instanceof Error ? error.message : String(error) }
}
export interface PollContextOptions {
  kind: SourceKind
  family?: ApiFamily
  sources: Source[]
  storage: PollContext['storage']
  budget: SourceObjectStore
  http: typeof fetch
  userAgent: string
  periods: PollContext['openCrowdPeriods']
  log: PollContext['log']
  clock: SourceClock
  /** Runtime supplies UUIDv7; a test supplies a deterministic sequence. */
  requestId(): string
}
export function createPollContext(options: PollContextOptions): CapturedPollContext {
  const { clock } = options
  const requests: RequestCapture[] = []
  type Credit = { capture: RequestCapture; started: number; family: ApiFamily; reserved: Promise<void> }
  const credits: Credit[] = []
  const capture = (): RequestCapture => ({
    requestId: options.requestId(),
    sourceIds: options.sources.map((source) => source.id),
    url: null,
    startedAt: clock.now().toISOString(),
    httpStatus: null,
    latencyMs: 0,
    body: null,
    bodySha256: null,
    error: null
  })
  const elapsed = (started: number) => Math.max(0, Math.round(clock.monotonic() - started))
  const ctx: PollContext = {
    now: () => clock.now().toISOString(),
    storage: options.storage,
    openCrowdPeriods: options.periods,
    log: options.log,
    budget: {
      async take(family) {
        if (family !== options.family) throw new SchemaError('Budget family differs from the adapter family')
        const request = capture(),
          started = clock.monotonic()
        const credit: Credit = {
          capture: request,
          started,
          family,
          reserved: takeSourceBudget(options.budget, family, request.requestId, clock)
        }
        credits.push(credit)
        try {
          await credit.reserved
        } catch (error) {
          const index = credits.indexOf(credit)
          if (index >= 0) credits.splice(index, 1)
          request.error = sourceError(error)
          request.latencyMs = elapsed(started)
          if (!requests.includes(request)) requests.push(request)
          throw error
        }
      }
    },
    async http(url, init) {
      const credit = credits.shift()
      const request = credit?.capture ?? capture(),
        started = credit?.started ?? clock.monotonic()
      request.url = url
      requests.push(request)
      const timer = new AbortController(),
        transport = new AbortController()
      let response: Response | undefined
      try {
        if (credit) await credit.reserved
        if (options.family) await takeSourceBudget(options.budget, options.family, request.requestId, clock)
        const headers = new Headers(init?.headers)
        headers.set('User-Agent', options.userAgent)
        const timeout = clock.sleep(20000, timer.signal).then(() => {
          if (!timer.signal.aborted) {
            transport.abort()
            throw new TimeoutError(url)
          }
          return new Promise<never>(() => {})
        })
        const data = (async () => {
          try {
            response = await options.http(url, { headers, redirect: 'manual', signal: transport.signal })
            if (transport.signal.aborted) throw new TimeoutError(url)
            request.httpStatus = response.status
            if (!response.ok) throw new HttpError(response.status, url)
            return new Uint8Array(await response.arrayBuffer())
          } catch (error) {
            if (error instanceof HttpError) throw error
            if (transport.signal.aborted) throw new TimeoutError(url)
            throw new NetworkError(url, error)
          }
        })()
        const body = await Promise.race([data, timeout])
        request.body = body
        request.bodySha256 = createHash('sha256').update(body).digest('hex')
        const text = () => new TextDecoder().decode(body)
        return {
          status: request.httpStatus!,
          headers: response!.headers,
          text: async () => text(),
          arrayBuffer: async () => body.slice().buffer,
          json: async () => {
            try {
              return JSON.parse(text()) as unknown
            } catch (cause) {
              const error = new SchemaError('Invalid JSON response', { cause })
              request.error = sourceError(error)
              throw error
            }
          }
        }
      } catch (error) {
        request.error = sourceError(error)
        throw error
      } finally {
        timer.abort()
        request.latencyMs = elapsed(started)
      }
    }
  }
  return { ctx, requests }
}
