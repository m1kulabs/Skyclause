export interface SseEvent {
  id?: string
  event: string
  data: string
}

export interface ReadSseOptions {
  headers?: HeadersInit
  onEvent: (event: SseEvent) => void | Promise<void>
  signal?: AbortSignal
  lastEventId?: string
  /** Snapshot streams reopen from current state rather than a previous event. */
  resume?: boolean
  onError?: (error: unknown) => void
}

const INITIAL_BACKOFF_MS = 250
const MAX_BACKOFF_MS = 10_000
/** A rate-limited stream that names no time waits this long before asking again. */
const RATE_LIMITED_WAIT_MS = 30_000
/** Refusals that answer the same however often they are asked: signed out, not allowed, gone, not available yet. */
const FINAL_STATUSES = new Set([401, 403, 404, 501])

/** Retry-After as milliseconds from now: whole seconds or an HTTP date; null when absent or unreadable. */
function retryAfterMs(value: string | null): number | null {
  if (!value) return null
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now())
}

/**
 * A stream request the server refused, with its status: 401, 403, 404 and 501 are never retried, and a 429 waits for
 * its Retry-After.
 */
export class SseRequestError extends Error {
  readonly status: number
  /** From a 429's Retry-After: how long to wait before asking again. */
  readonly retryAfterMs: number | null

  constructor(status: number, retryAfter: string | null = null) {
    super(`SSE request failed with status ${status}`)
    this.name = 'SseRequestError'
    this.status = status
    this.retryAfterMs = retryAfterMs(retryAfter)
  }
}

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal?.addEventListener('abort', finish, { once: true })
  })
}

async function dispatchEvent(
  data: string[],
  eventName: string,
  lastEventId: string | undefined,
  onEvent: ReadSseOptions['onEvent']
) {
  if (!data.length) return
  await onEvent({ id: lastEventId, event: eventName || 'message', data: data.join('\n') })
}

/** Read an SSE stream with fetch and resume from its last dispatched event after a disconnect. */
export async function readSse(url: string | URL, options: ReadSseOptions): Promise<void> {
  let lastEventId = options.lastEventId
  let backoffMs = INITIAL_BACKOFF_MS

  while (!options.signal?.aborted) {
    let sawEvent = false
    let rateLimitedMs: number | null = null
    let callbackFailed = false
    let callbackError: unknown
    const notify = async (event: SseEvent) => {
      try {
        await options.onEvent(event)
      } catch (error) {
        callbackFailed = true
        callbackError = error
        throw error
      }
    }

    try {
      const headers = new Headers(options.headers)
      headers.set('Accept', 'text/event-stream')
      if (options.resume !== false && lastEventId !== undefined) headers.set('Last-Event-ID', lastEventId)
      const response = await fetch(url, { headers, signal: options.signal })
      if (!response.ok || !response.body)
        throw new SseRequestError(response.status, response.headers.get('Retry-After'))

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventName = ''
      let data: string[] = []

      const processLine = async (line: string) => {
        if (line === '') {
          await dispatchEvent(data, eventName, lastEventId, notify)
          if (data.length) sawEvent = true
          eventName = ''
          data = []
          return
        }
        if (line.startsWith(':')) return

        const separator = line.indexOf(':')
        const field = separator === -1 ? line : line.slice(0, separator)
        const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '')
        if (field === 'id' && !value.includes('\u0000')) lastEventId = value
        if (field === 'event') eventName = value
        if (field === 'data') data.push(value)
      }

      while (!options.signal?.aborted) {
        const { done, value } = await reader.read()
        if (done) {
          buffer += decoder.decode()
          break
        }

        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline !== -1) {
          let line = buffer.slice(0, newline)
          if (line.endsWith('\r')) line = line.slice(0, -1)
          buffer = buffer.slice(newline + 1)
          await processLine(line)
          newline = buffer.indexOf('\n')
        }
      }

      if (buffer) await processLine(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer)
      if (data.length) {
        await dispatchEvent(data, eventName, lastEventId, notify)
        sawEvent = true
      }
      if (options.signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        return
      }
    } catch (error) {
      if (callbackFailed) throw callbackError
      if (options.signal?.aborted) return
      // A dropped stream or failed request is retried below with the latest event ID.
      options.onError?.(error)
      // A stream refused for good (signed out, not allowed, gone, not available yet) answers the same however often
      // it is asked; a rate-limited one waits for the time it was given, never the fast backoff.
      if (error instanceof SseRequestError && FINAL_STATUSES.has(error.status)) return
      if (error instanceof SseRequestError && error.status === 429) {
        // At least a second, so a Retry-After of 0 or a past date never spins.
        rateLimitedMs = Math.max(1_000, error.retryAfterMs ?? RATE_LIMITED_WAIT_MS)
      }
    }

    if (options.signal?.aborted) return
    if (rateLimitedMs !== null) {
      await pause(rateLimitedMs, options.signal)
      continue
    }
    if (sawEvent) backoffMs = INITIAL_BACKOFF_MS
    await pause(Math.ceil(backoffMs * (0.5 + Math.random() * 0.5)), options.signal)
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
  }
}
