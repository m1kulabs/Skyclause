import { SpanKind, type Histogram, type Meter } from '@opentelemetry/api'
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'

// OTel HTTP semantic conventions' server duration, which #116's API p95 dashboard reads.
const NAME = 'http.server.request.duration'
// Semconv's advised boundaries, plus NFR-9's 300 ms read and 800 ms write targets as bucket edges.
const BOUNDARIES = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.3, 0.5, 0.75, 0.8, 1, 2.5, 5, 7.5, 10]
/** A catch-all segment, as in Next's `/v1/[[...route]]`: the router mounted there records its own routes. */
const CATCH_ALL = /\[\[?\.\.\./

let histogram: Histogram | undefined

export function startHttpServerDuration(meter: Meter) {
  histogram = meter.createHistogram(NAME, {
    unit: 's',
    description: 'Duration of HTTP server requests.',
    advice: { explicitBucketBoundaries: BOUNDARIES }
  })
}

export function stopHttpServerDuration() {
  histogram = undefined
}

export interface HttpServerRequest {
  method: string
  /** The route template, such as `/v1/projects/:id`, never the raw path. */
  route: string
  status?: number
}

/**
 * Records one `http.server.request.duration`. Server spans that carry `http.route` record themselves, so only a
 * router inside a catch-all calls this: f-api's (#93) Hono middleware, with `routePath(c, -1)` as the full route
 * from `/` and the elapsed seconds.
 */
export function recordHttpServerDuration(request: HttpServerRequest, seconds: number) {
  histogram?.record(seconds, {
    'http.request.method': request.method,
    'http.route': request.route,
    ...(request.status !== undefined && { 'http.response.status_code': request.status })
  })
}

/** Records the duration of each ended server span that names its route: Next's requests and the worker's. */
export class HttpServerDurationProcessor implements SpanProcessor {
  onStart() {}

  onEnd(span: ReadableSpan) {
    if (span.kind !== SpanKind.SERVER) return
    const { attributes } = span
    const route = attributes['http.route']
    // Next.js still sets the older `http.method` and `http.status_code`.
    const method = attributes['http.request.method'] ?? attributes['http.method']
    if (typeof route !== 'string' || CATCH_ALL.test(route) || typeof method !== 'string') return
    const status = Number(attributes['http.response.status_code'] ?? attributes['http.status_code'])
    recordHttpServerDuration(
      { method, route, status: Number.isFinite(status) ? status : undefined },
      span.duration[0] + span.duration[1] / 1e9
    )
  }

  async forceFlush() {}

  async shutdown() {}
}
