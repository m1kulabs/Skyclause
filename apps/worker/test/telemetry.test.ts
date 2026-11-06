import { trace } from '@opentelemetry/api'
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { log, startTelemetry, traceContext, type Telemetry } from '@skyclause/config'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { createServer, defineRegistry, type WorkerPart } from '../src/server'
import { tracePushes, traceRequests } from '../src/telemetry'

const audience = 'https://worker-413187272599.asia-southeast1.run.app'
const invoker = 'skyclause-invoker@skyclause.iam.gserviceaccount.com'

let bearer: string
let jwks: ReturnType<typeof createLocalJWKSet>
let telemetry: Telemetry
let lines: string[]
let spans: InMemorySpanExporter
let metrics: InMemoryMetricExporter

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' }] })
  bearer = await new SignJWT({ email: invoker, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://accounts.google.com')
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
})

beforeEach(() => {
  lines = []
  // A shut-down exporter refuses later exports, so each test gets its own.
  spans = new InMemorySpanExporter()
  metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  telemetry = startTelemetry('worker', {
    env: { APP_ENV: 'production', GCP_PROJECT: 'skyclause', WORKER_URL: audience, WORKER_INVOKER_SA: invoker },
    traceExporter: spans,
    metricExporter: metrics,
    write: (line) => void lines.push(line)
  })
})

afterEach(() => telemetry.shutdown())

function worker(...parts: WorkerPart[]) {
  const app = createServer({
    registry: tracePushes(defineRegistry(parts)),
    audience,
    invoker,
    jwks,
    heartbeat: telemetry.heartbeat
  })
  return traceRequests(app.fetch, telemetry)
}

function post(path: string, body: string, headers: Record<string, string> = {}) {
  return new Request(`${audience}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', ...headers },
    body
  })
}

function push(data: unknown, attributes: Record<string, string>) {
  return JSON.stringify({
    message: {
      data: Buffer.from(JSON.stringify(data)).toString('base64'),
      attributes,
      messageId: '1',
      publishTime: '2026-11-06T00:00:00Z'
    },
    subscription: 'projects/skyclause/subscriptions/readings-updated-worker'
  })
}

test('one trace crosses a Pub/Sub push and a Cloud Tasks call, and the log lines carry it', async () => {
  let taskHeaders: Record<string, string> = {}
  const fetch = worker({
    owner: 'test',
    topics: {
      'readings-updated': async () => {
        log.info('evaluating')
        taskHeaders = traceContext()
      }
    },
    queues: { 'bundle-timers': async () => log.info('sla timer fired') }
  })

  const { traceId, attributes } = trace.getTracer('test').startActiveSpan('poll', (span) => {
    const result = { traceId: span.spanContext().traceId, attributes: traceContext() }
    span.end()
    return result
  })

  // Cloud Run puts its own trace on the push request; the handler follows the message's.
  const pushed = await fetch(
    post('/pubsub/readings-updated', push({ source_id: 'jps-3117070' }, attributes), {
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
    })
  )
  expect(pushed.status).toBe(204)
  expect((await fetch(post('/tasks/bundle-timers', '{}', taskHeaders))).status).toBe(204)

  const logged = lines.map((line) => JSON.parse(line))
  expect(logged.map((line) => [line.message, line['logging.googleapis.com/trace']])).toEqual([
    ['evaluating', `projects/skyclause/traces/${traceId}`],
    ['sla timer fired', `projects/skyclause/traces/${traceId}`]
  ])
  const names = spans
    .getFinishedSpans()
    .filter((span) => span.spanContext().traceId === traceId)
    .map((span) => span.name)
  expect(names.sort()).toEqual(['POST /tasks/bundle-timers', 'poll', 'pubsub readings-updated'])
  // The push request's own span stays in Cloud Run's trace, linked from the handler's.
  const handler = spans.getFinishedSpans().find((span) => span.name === 'pubsub readings-updated')
  expect(handler?.links.map((link) => link.context.traceId)).toEqual(['0af7651916cd43dd8448eb211c80319c'])
})

test('the answer waits for the flush, so a throttled instance still exports the request', async () => {
  const fetch = worker({ owner: 'test', ticks: { evaluator: async () => {} } })
  expect((await fetch(post('/ticks/minute', '{}'))).status).toBe(204)
  expect(spans.getFinishedSpans().map((span) => span.name)).toContain('POST /ticks/minute')
  const beats = metrics
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
    .filter((metric) => metric.descriptor.name === 'skyclause.heartbeat')
    .flatMap((metric) => metric.dataPoints.map((point) => point.attributes))
  expect(beats).toEqual([{ name: 'minute_tick' }])
})

test('a failing handler marks its request span as an error', async () => {
  const fetch = worker({ owner: 'test', queues: { exports: () => Promise.reject(new Error('bucket missing')) } })
  expect((await fetch(post('/tasks/exports', '{}'))).status).toBe(500)
  const [span] = spans.getFinishedSpans()
  expect(span?.attributes['http.response.status_code']).toBe(500)
  expect(span?.status.code).toBe(2)
})

test('each request records http.server.request.duration under its route template', async () => {
  const fetch = worker({ owner: 'test', queues: { 'bundle-timers': async () => {} } })
  expect((await fetch(post('/tasks/bundle-timers', '{}'))).status).toBe(204)
  expect((await fetch(post('/tasks/bundle-timers', '{}', { authorization: 'Bearer nope' }))).status).toBe(401)
  // An unrouted path has no template, so it records nothing rather than a raw path.
  expect((await fetch(post('/no-such-path', '{}'))).status).toBe(404)
  const recorded = metrics
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
    .filter((metric) => metric.descriptor.name === 'http.server.request.duration')
    .at(-1)
    ?.dataPoints.map((point) => [point.attributes, (point.value as { count: number }).count])
  expect(recorded).toEqual([
    [{ 'http.request.method': 'POST', 'http.route': '/tasks/:queue', 'http.response.status_code': 204 }, 1],
    [{ 'http.request.method': 'POST', 'http.route': '/tasks/:queue', 'http.response.status_code': 401 }, 1]
  ])
})
