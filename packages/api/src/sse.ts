// Spec §5 and TRD "API conventions": `text/event-stream` with `id: <seq>` for `Last-Event-ID` resumption, a comment
// heartbeat every 15 seconds, and an end after 5 minutes so clients reconnect.
export const SSE_HEARTBEAT_MS = 15_000
export const SSE_LIFETIME_MS = 5 * 60_000

export interface SseMessage {
  /** The per-project sequence; snapshot and state events have none and don't resume. */
  seq?: number
  event?: string
  data: unknown
}

export interface SseOptions {
  /** The request's `Last-Event-ID`; anything but a whole number starts without replay. */
  lastEventId?: string | null
  /** Loads the events after `afterSeq`, oldest first. */
  replay?: (afterSeq: number) => Promise<Iterable<SseMessage>>
  /** Subscribes to live events and returns the unsubscribe; events during the replay wait until it ends. */
  listen: (send: (message: SseMessage) => void) => () => void
  /** The request's signal: the stream stops when the client goes away. */
  signal?: AbortSignal
}

const format = ({ seq, event, data }: SseMessage) =>
  `${seq === undefined ? '' : `id: ${seq}\n`}${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`

export function sseResponse(o: SseOptions): Response {
  const encoder = new TextEncoder()
  let stop = () => {}
  let waiting: SseMessage[] | null = []
  let emit: (message: SseMessage) => void = () => {}
  // Subscribed before the stream exists: a listener that refuses (the hub isn't built, say) throws from here, so the
  // route answers with a problem. Thrown inside `start`, it would break a response already sent as 200.
  const unlisten = o.listen((message) => (waiting ? waiting.push(message) : emit(message)))
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let lastSeq = -Infinity
      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      emit = (message) => {
        if (message.seq !== undefined) {
          if (message.seq <= lastSeq) return
          lastSeq = message.seq
        }
        write(format(message))
      }
      const finish = () => {
        closed = true
        clearTimeout(lifetime)
        clearInterval(heartbeat)
        unlisten()
        o.signal?.removeEventListener('abort', stop)
      }
      stop = () => {
        if (closed) return
        finish()
        controller.close()
      }
      // The lifetime is set first, so at 5 minutes the stream ends before a 20th heartbeat.
      const lifetime = setTimeout(stop, SSE_LIFETIME_MS)
      const heartbeat = setInterval(() => write(': heartbeat\n\n'), SSE_HEARTBEAT_MS)
      o.signal?.addEventListener('abort', stop, { once: true })
      if (o.signal?.aborted) return stop()

      const after = o.lastEventId && /^\d+$/.test(o.lastEventId) ? Number(o.lastEventId) : null
      try {
        if (after !== null && o.replay) for (const message of await o.replay(after)) emit(message)
      } catch (error) {
        finish()
        controller.error(error)
        return
      }
      const pending = waiting ?? []
      waiting = null
      for (const message of pending) emit(message)
    },
    cancel() {
      stop()
    }
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' }
  })
}
