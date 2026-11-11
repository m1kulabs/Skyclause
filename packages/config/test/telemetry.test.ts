import { diag, SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import { ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core'
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  type PushMetricExporter
} from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  log,
  recordHttpServerDuration,
  startTelemetry,
  traceContext,
  withTrace,
  type Telemetry
} from '@skyclause/config'

const env = { APP_ENV: 'production', GCP_PROJECT: 'skyclause', GCP_REGION: 'asia-southeast1' }

let telemetry: Telemetry | undefined
let lines: string[]
let spans: InMemorySpanExporter
let metrics: InMemoryMetricExporter

function start(extra: Record<string, string> = {}) {
  lines = []
  spans = new InMemorySpanExporter()
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  telemetry = startTelemetry('worker', {
    env: {
      ...env,
      WORKER_URL: 'https://worker-413187272599.asia-southeast1.run.app',
      WORKER_INVOKER_SA: 'skyclause-invoker@skyclause.iam.gserviceaccount.com',
      EMAIL_HASH_KEY: 'e'.repeat(48),
      ...extra
    },
    traceExporter: spans,
    metricExporter: metrics,
    write: (line) => void lines.push(line)
  })
  return telemetry
}

afterEach(async () => {
  await telemetry?.shutdown()
  telemetry = undefined
})

describe('structured logs', () => {
  test('a line is one JSON object Cloud Logging reads, with the active trace', () => {
    start()
    trace.getTracer('test').startActiveSpan('poll', (span) => {
      log.info('poll failed', { source_id: 'jps-3117070', status: 503 })
      const { traceId, spanId } = span.spanContext()
      expect(lines.map((line) => JSON.parse(line))).toEqual([
        {
          severity: 'INFO',
          message: 'poll failed',
          source_id: 'jps-3117070',
          status: 503,
          'logging.googleapis.com/trace': `projects/skyclause/traces/${traceId}`,
          'logging.googleapis.com/spanId': spanId,
          'logging.googleapis.com/trace_sampled': true
        }
      ])
      span.end()
    })
  })

  test('outside a span a line carries no trace, and fields never replace severity or message', () => {
    start()
    log.warn('slow', { severity: 'DEBUG', message: 'other' })
    expect(JSON.parse(lines[0] ?? '')).toEqual({ severity: 'WARNING', message: 'slow' })
  })

  test('without LOG_LEVEL, debug lines are dropped', () => {
    start()
    log.debug('d')
    log.info('i')
    expect(lines.map((line) => JSON.parse(line).message)).toEqual(['i'])
  })

  test('LOG_LEVEL drops lines below it', () => {
    start({ LOG_LEVEL: 'warn' })
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(lines.map((line) => JSON.parse(line).severity)).toEqual(['WARNING', 'ERROR'])
  })

  test('an error field keeps its name, message and stack', () => {
    start()
    log.error('handler failed', { error: new TypeError('bad body') })
    const { error } = JSON.parse(lines[0] ?? '')
    expect(error).toMatchObject({ name: 'TypeError', message: 'bad body' })
    expect(error.stack).toMatch(/TypeError: bad body/)
  })
})

describe('traces', () => {
  test('spans reach the exporter on flush, under the service name', async () => {
    start({ OTEL_SERVICE_NAME: 'worker' })
    trace.getTracer('test').startSpan('tick').end()
    await telemetry?.flush()
    const [span] = spans.getFinishedSpans()
    expect(span?.name).toBe('tick')
    expect(span?.resource.attributes).toMatchObject({
      'service.name': 'worker',
      'cloud.region': 'asia-southeast1',
      'gcp.project_id': 'skyclause'
    })
  })

  test('traceContext and withTrace carry one trace across a hop', async () => {
    start()
    const tracer = trace.getTracer('test')
    const { traceId, carrier } = tracer.startActiveSpan('publish', (span) => {
      const result = { traceId: span.spanContext().traceId, carrier: traceContext() }
      span.end()
      return result
    })
    expect(carrier.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`))
    const seen = await withTrace(carrier, 'consume', async () => trace.getActiveSpan()?.spanContext().traceId)
    expect(seen).toBe(traceId)
  })

  test('withTrace without a carrier starts a new trace', async () => {
    start()
    const seen = await withTrace({}, 'consume', async () => trace.getActiveSpan()?.spanContext().traceId)
    expect(seen).toMatch(/^[0-9a-f]{32}$/)
  })

  test('withTrace ends its span with an error status when the work throws', async () => {
    start()
    await expect(
      withTrace({}, 'consume', async () => {
        throw new Error('database down')
      })
    ).rejects.toThrow('database down')
    await telemetry?.flush()
    expect(spans.getFinishedSpans()[0]?.status.code).toBe(SpanStatusCode.ERROR)
  })
})

describe('heartbeat', () => {
  test('records skyclause.heartbeat{name} once per beat, never re-exporting an old beat', async () => {
    start()
    telemetry?.heartbeat('minute_tick')
    await telemetry?.flush()
    await telemetry?.flush()
    const points = metrics
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
      .filter((metric) => metric.descriptor.name === 'skyclause.heartbeat')
    expect(points).toHaveLength(1)
    expect(points[0]?.dataPointType).toBe(DataPointType.GAUGE)
    expect(points[0]?.dataPoints.map((point) => [point.attributes, point.value])).toEqual([
      [{ name: 'minute_tick' }, 1]
    ])
  })
})

describe('http.server.request.duration', () => {
  /** The latest cumulative point per attribute set, as `[attributes, count, boundaries]`. */
  async function durations() {
    await telemetry?.flush()
    const exported = metrics
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
      .filter((metric) => metric.descriptor.name === 'http.server.request.duration')
    const latest = exported.at(-1)
    if (!latest) return { unit: undefined, points: [] }
    return {
      unit: latest.descriptor.unit,
      points: latest.dataPoints.map((point) => {
        const value = point.value as { count: number; buckets: { boundaries: number[] } }
        return [point.attributes, value.count, value.buckets.boundaries]
      })
    }
  }

  test('each server span that names its route records one duration, in seconds, with semconv attributes', async () => {
    start()
    const tracer = trace.getTracer('test')
    // Next.js's own request span still uses the older attribute names.
    tracer
      .startSpan('GET /health', {
        kind: SpanKind.SERVER,
        attributes: { 'http.method': 'GET', 'http.route': '/health', 'http.status_code': 200 }
      })
      .end()
    tracer
      .startSpan('POST /tasks/exports', {
        kind: SpanKind.SERVER,
        attributes: { 'http.request.method': 'POST', 'http.route': '/tasks/:queue', 'http.response.status_code': 500 }
      })
      .end()
    const { unit, points } = await durations()
    expect(unit).toBe('s')
    expect(points.map(([attributes, count]) => [attributes, count])).toEqual([
      [{ 'http.request.method': 'GET', 'http.route': '/health', 'http.response.status_code': 200 }, 1],
      [{ 'http.request.method': 'POST', 'http.route': '/tasks/:queue', 'http.response.status_code': 500 }, 1]
    ])
    // NFR-9's 300 ms read and 800 ms write targets are bucket edges.
    expect(points[0]?.[2]).toEqual(expect.arrayContaining([0.3, 0.8]))
  })

  test('no duration for a span without a route, a catch-all route or a non-server span', async () => {
    start()
    const tracer = trace.getTracer('test')
    tracer.startSpan('GET /unknown', { kind: SpanKind.SERVER, attributes: { 'http.method': 'GET' } }).end()
    // The router mounted inside a catch-all (f-api's Hono app) records its own route instead.
    tracer
      .startSpan('GET /v1/[[...route]]', {
        kind: SpanKind.SERVER,
        attributes: { 'http.method': 'GET', 'http.route': '/v1/[[...route]]', 'http.status_code': 200 }
      })
      .end()
    tracer.startSpan('pubsub readings-updated', { kind: SpanKind.CONSUMER, attributes: { 'http.route': '/x' } }).end()
    expect((await durations()).points).toEqual([])
  })

  test('recordHttpServerDuration records a route a router resolved itself', async () => {
    start()
    recordHttpServerDuration({ method: 'GET', route: '/v1/projects/:id', status: 200 }, 0.042)
    expect((await durations()).points.map(([attributes, count]) => [attributes, count])).toEqual([
      [{ 'http.request.method': 'GET', 'http.route': '/v1/projects/:id', 'http.response.status_code': 200 }, 1]
    ])
  })
})

interface PartialSuccess {
  rejectedDataPoints?: number
  rejectedSpans?: number
  rejectedLogRecords?: number
  errorMessage?: string
}

/** A 200 `partialSuccess` answer the way `@opentelemetry/otlp-exporter-base`'s `logging-response-handler` reports it. */
function reportPartialSuccess(partialSuccess?: PartialSuccess) {
  if (partialSuccess && Object.keys(partialSuccess).length > 0) {
    diag.warn('Received Partial Success response:', JSON.stringify(partialSuccess))
  }
}

/**
 * The Telemetry API's write rule, a double: Cloud Monitoring "requires that the end times of points written to a time
 * series be at least 5 seconds apart" (https://docs.cloud.google.com/monitoring/quotas), and answers a request that
 * breaks it with 400 (https://docs.cloud.google.com/monitoring/api/troubleshooting). One series is one scope, metric
 * name and attribute set; the resource is the process's own.
 */
function cloudMonitoring(refusal?: Error, partialSuccess?: PartialSuccess) {
  const ended = new Map<string, number>()
  const written: Array<{ name: string; attributes: Attributes; value: unknown }> = []
  let refused = 0
  let exports = 0
  let flushes = 0
  const exporter: PushMetricExporter = {
    export: (data, done) => {
      exports++
      const points = data.scopeMetrics.flatMap((scope) =>
        scope.metrics.flatMap((metric) =>
          metric.dataPoints.map((point) => ({
            key: JSON.stringify([scope.scope.name, metric.descriptor.name, point.attributes]),
            end: hrTimeToMilliseconds(point.endTime),
            name: metric.descriptor.name,
            attributes: point.attributes,
            value: point.value
          }))
        )
      )
      if (refusal || points.some((point) => point.end - (ended.get(point.key) ?? -Infinity) < 5000)) {
        refused++
        return done({ code: ExportResultCode.FAILED, error: refusal ?? answered(400, 'points written too often') })
      }
      for (const { key, end, ...point } of points) {
        ended.set(key, end)
        written.push(point)
      }
      reportPartialSuccess(partialSuccess)
      done({ code: ExportResultCode.SUCCESS })
    },
    forceFlush: async () => void flushes++,
    shutdown: async () => {}
  }
  return { exporter, written, refused: () => refused, exports: () => exports, flushes: () => flushes }
}

/** An HTTP answer the way the SDK's OTLPExporterError carries it: the status text, the code and the body as text. */
const answered = (code: number, body: string) =>
  Object.assign(new Error('Bad Request'), { name: 'OTLPExporterError', code, data: body })

describe('metric export to Cloud Monitoring', () => {
  function startAgainst(api: ReturnType<typeof cloudMonitoring>) {
    lines = []
    telemetry = startTelemetry('job', {
      env,
      traceExporter: new InMemorySpanExporter(),
      metricExporter: api.exporter,
      write: (line) => void lines.push(line)
    })
    return telemetry
  }
  const request = (status: number) => recordHttpServerDuration({ method: 'POST', route: '/ticks/:name', status }, 0.01)
  const failures = () => lines.filter((line) => line.includes('metrics export failed'))

  afterEach(() => vi.useRealTimers())

  test('flushes less than 5 seconds apart, as two requests at once, write each series once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-11-11T01:00:00.800Z'))
    const api = cloudMonitoring()
    const t = startAgainst(api)
    // The batch and the minute tick both start at 01:00; each flushes before answering.
    request(500)
    await t.flush()
    vi.setSystemTime(Date.parse('2026-11-11T01:00:01.100Z'))
    request(204)
    t.heartbeat('minute_tick')
    await t.flush()
    expect(api.refused()).toBe(0)
    expect(failures()).toEqual([])
    // A flush 5 seconds after each series' last point writes it again, the 500 with its count so far.
    vi.setSystemTime(Date.parse('2026-11-11T01:00:06.200Z'))
    request(500)
    await t.flush()
    expect(api.refused()).toBe(0)
    const counts = api.written
      .filter((point) => point.name === 'http.server.request.duration')
      .map((point) => [point.attributes['http.response.status_code'], (point.value as { count: number }).count])
    expect(counts).toEqual([
      [500, 1],
      [204, 1],
      [500, 2],
      [204, 1]
    ])
    expect(api.written.filter((point) => point.name === 'skyclause.heartbeat')).toHaveLength(1)
  })

  test('shutting down just after a flush, as on SIGTERM, writes nothing twice', async () => {
    const api = cloudMonitoring()
    const t = startAgainst(api)
    request(204)
    await t.flush()
    await t.shutdown()
    telemetry = undefined
    expect(api.refused()).toBe(0)
    expect(failures()).toEqual([])
  })

  test('shutting down collects and exports the metrics once', async () => {
    const api = cloudMonitoring()
    const t = startAgainst(api)
    request(204)
    await t.shutdown()
    telemetry = undefined
    expect([api.exports(), api.flushes()]).toEqual([1, 1])
  })

  test('a failed span export on shutdown is logged, so a job still ends cleanly', async () => {
    lines = []
    const t = startTelemetry('job', {
      env,
      traceExporter: {
        export: (_spans, done) => done({ code: ExportResultCode.FAILED, error: new Error('Service Unavailable') }),
        shutdown: async () => {}
      },
      metricExporter: cloudMonitoring().exporter,
      write: (line) => void lines.push(line)
    })
    trace.getTracer('test').startSpan('job vapid-keys').end()
    await expect(t.shutdown()).resolves.toBeUndefined()
    expect(lines.map((line) => JSON.parse(line).message)).toContain('telemetry flush failed')
  })

  /** The line the exporter logs for a failed export, which the SDK's own line leaves without its answer. */
  async function failedWith(refusal: Error) {
    const t = startAgainst(cloudMonitoring(refusal))
    request(204)
    await t.flush()
    return lines.map((line) => JSON.parse(line)).filter((line) => line.message === 'telemetry: metrics export failed')
  }

  test('a refused export logs its status and the answer the API sent as text', async () => {
    const body = '{"error":{"code":400,"message":"Points must be written in order."}}'
    expect(await failedWith(answered(400, body))).toEqual([
      {
        severity: 'ERROR',
        message: 'telemetry: metrics export failed',
        error: 'Bad Request',
        status: 400,
        answer: body
      }
    ])
  })

  test('a protobuf answer logs its length and readable text, never its bytes', async () => {
    // A google.rpc.Status: code 9 (FAILED_PRECONDITION), then the message, decoded as text the way the SDK does.
    const message = 'One or more points were written more frequently than the maximum sampling period'
    const body = Buffer.concat([Buffer.from([0x08, 0x09, 0x12, message.length]), Buffer.from(message)]).toString()
    expect(await failedWith(answered(400, body))).toEqual([
      {
        severity: 'ERROR',
        message: 'telemetry: metrics export failed',
        error: 'Bad Request',
        status: 400,
        answer_length: body.length,
        // Printable runs, so a framing byte that happens to be printable (the length, 80, is "P") can lead it.
        answer_text: expect.stringContaining(message)
      }
    ])
  })

  test('a timeout logs what went wrong, with no status or answer', async () => {
    expect(await failedWith(new Error('Request timed out'))).toEqual([
      { severity: 'ERROR', message: 'telemetry: metrics export failed', error: 'Request timed out' }
    ])
  })

  test('a 200 partialSuccess on metrics logs one redacted warning naming the signal, count and message, while a full success logs nothing', async () => {
    const full = startAgainst(cloudMonitoring(undefined, { rejectedDataPoints: 0, errorMessage: '' }))
    request(204)
    await full.flush()
    expect(lines).toEqual([])
    await full.shutdown()

    const partial = startAgainst(
      cloudMonitoring(undefined, {
        rejectedDataPoints: 2,
        errorMessage: 'Invalid label on series for skc_live_secret_token_123456'
      })
    )
    request(204)
    await partial.flush()
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        severity: 'WARNING',
        message: 'telemetry: metrics export partially rejected',
        signal: 'metrics',
        rejected: 2,
        error: 'Invalid label on series for [redacted]'
      }
    ])
  })

  test('partial rejections of traces and logs are logged while other SDK diag warnings stay silent', async () => {
    lines = []
    telemetry = startTelemetry('job', {
      env,
      traceExporter: {
        export: (_spans, done) => {
          reportPartialSuccess({
            rejectedSpans: 1,
            errorMessage: 'Span attribute value too long for ops@skyclause.example.com'
          })
          done({ code: ExportResultCode.SUCCESS })
        },
        shutdown: async () => {}
      },
      metricExporter: cloudMonitoring().exporter,
      write: (line) => void lines.push(line)
    })
    diag.warn('Dropping extra attributes.')
    trace.getTracer('test').startSpan('tick').end()
    await telemetry.flush()
    reportPartialSuccess({ rejectedLogRecords: 3, errorMessage: 'Log record too large' })

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        severity: 'WARNING',
        message: 'telemetry: traces export partially rejected',
        signal: 'traces',
        rejected: 1,
        error: 'Span attribute value too long for [redacted]'
      },
      {
        severity: 'WARNING',
        message: 'telemetry: logs export partially rejected',
        signal: 'logs',
        rejected: 3,
        error: 'Log record too large'
      }
    ])
  })
})
