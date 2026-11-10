// The Pub/Sub REST publisher, against a fetch double: no request reaches Google.
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, expect, test } from 'vitest'
import { pubsubPublisher, startTelemetry, withTrace, type Telemetry } from '@skyclause/config'

interface Sent {
  url: string
  method: string | undefined
  headers: Record<string, string>
  body: { messages: Array<{ data: string; attributes?: Record<string, string> }> }
  signal: AbortSignal | null | undefined
}

function double(status = 200, reply: unknown = { messageIds: ['18171614813123'] }) {
  const sent: Sent[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body)),
      signal: init?.signal
    })
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status })
  }
  return { sent, fetch: fetch as typeof globalThis.fetch }
}

const headers = async () => new Headers({ authorization: 'Bearer test-token' })
const decode = (data: string) => JSON.parse(Buffer.from(data, 'base64').toString('utf8'))

let telemetry: Telemetry | undefined
afterEach(async () => {
  await telemetry?.shutdown()
  telemetry = undefined
})

test('publishes one JSON message to the topic’s REST endpoint with the service’s credentials', async () => {
  const { sent, fetch } = double()
  const publish = pubsubPublisher('skyclause', 'domain-events', { fetch, headers })
  await publish({ event_id: '019a6a5e-7c4b-7d3e-9f00-0123456789ab' })
  expect(sent).toHaveLength(1)
  const [request] = sent
  expect(request!.url).toBe('https://pubsub.googleapis.com/v1/projects/skyclause/topics/domain-events:publish')
  expect(request!.method).toBe('POST')
  expect(request!.headers).toMatchObject({ authorization: 'Bearer test-token', 'content-type': 'application/json' })
  expect(request!.body.messages).toHaveLength(1)
  expect(decode(request!.body.messages[0]!.data)).toEqual({ event_id: '019a6a5e-7c4b-7d3e-9f00-0123456789ab' })
  expect(request!.signal).toBeInstanceOf(AbortSignal)
})

test('carries the active trace as message attributes, which the worker’s push handler continues', async () => {
  telemetry = startTelemetry('job', {
    env: { APP_ENV: 'dev' },
    traceExporter: new InMemorySpanExporter(),
    metricExporter: undefined,
    write: () => {}
  })
  const { sent, fetch } = double()
  const publish = pubsubPublisher('skyclause', 'domain-events', { fetch, headers })
  await withTrace({}, 'emit', () => publish({ event_id: 'x' }))
  expect(sent[0]!.body.messages[0]!.attributes?.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)
})

test('a refused publish throws, naming the topic, the status and what Pub/Sub said', async () => {
  const { fetch } = double(403, '{"error":{"code":403,"message":"User not authorized to perform this action."}}')
  const publish = pubsubPublisher('skyclause', 'domain-events', { fetch, headers })
  await expect(publish({ event_id: 'x' })).rejects.toThrow(
    /Pub\/Sub publish to domain-events failed: 403 .*not authorized/
  )
})
