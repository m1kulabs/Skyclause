import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { withTrace, type Telemetry } from '@skyclause/config'
import type { Registry } from './server'

/**
 * A server span per request, continuing its `traceparent` (Cloud Tasks headers, or Cloud Run's own), and a
 * flush before the answer: Cloud Run throttles the CPU once the response is sent.
 */
export function traceRequests<A extends unknown[]>(
  fetch: (request: Request, ...rest: A) => Response | Promise<Response>,
  telemetry: Pick<Telemetry, 'flush'>
) {
  return async (request: Request, ...rest: A) => {
    const { pathname } = new URL(request.url)
    try {
      return await withTrace(
        Object.fromEntries(request.headers),
        `${request.method} ${pathname}`,
        async () => {
          const response = await fetch(request, ...rest)
          const span = trace.getActiveSpan()
          span?.setAttribute('http.response.status_code', response.status)
          if (response.status >= 500) span?.setStatus({ code: SpanStatusCode.ERROR })
          return response
        },
        SpanKind.SERVER
      )
    } finally {
      await telemetry.flush()
    }
  }
}

/** Runs each topic handler in the trace its publisher put on the message's `traceparent` attribute. */
export function tracePushes(registry: Registry): Registry {
  return {
    ...registry,
    topics: Object.fromEntries(
      Object.entries(registry.topics).map(([topic, handler]) => [
        topic,
        (message) => withTrace(message.attributes, `pubsub ${topic}`, () => handler(message))
      ])
    )
  }
}
