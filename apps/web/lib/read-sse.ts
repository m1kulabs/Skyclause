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
      if (!response.ok || !response.body) throw new Error(`SSE request failed with status ${response.status}`)

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
    }

    if (options.signal?.aborted) return
    if (sawEvent) backoffMs = INITIAL_BACKOFF_MS
    await pause(Math.ceil(backoffMs * (0.5 + Math.random() * 0.5)), options.signal)
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
  }
}
