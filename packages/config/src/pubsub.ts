import { GoogleAuth } from 'google-auth-library'
import { traceContext } from './telemetry'

const PUBSUB_API = 'https://pubsub.googleapis.com/v1'

function serviceHeaders() {
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/pubsub' })
  return () => auth.getRequestHeaders()
}

export interface PubSubOptions {
  /** Doubles for tests. */
  fetch?: typeof fetch
  /** Request headers carrying a token; by default the service's own account (ADC; the metadata server on Cloud Run). */
  headers?: () => Promise<Headers>
}

/**
 * A publisher of JSON messages to one Pub/Sub topic, over the REST API (`topics.publish`): one awaited request per
 * call, so nothing is queued and nothing needs flushing at SIGTERM, and a publish made while answering a request
 * finishes before the response, while Cloud Run still gives the instance CPU. The client library instead batches in
 * memory (up to 100 messages, 1 MiB or 10 ms) and needs `flush()` before `close()`. Each message carries the active
 * trace context as attributes, which the worker's push handler continues. Throws on a non-2xx answer or after 10 s.
 */
export function pubsubPublisher(project: string, topic: string, options: PubSubOptions = {}) {
  const send = options.fetch ?? fetch
  const headers = options.headers ?? serviceHeaders()
  const url = `${PUBSUB_API}/projects/${project}/topics/${topic}:publish`
  return async (data: unknown): Promise<void> => {
    const message = { data: Buffer.from(JSON.stringify(data)).toString('base64'), attributes: traceContext() }
    const requestHeaders = await headers()
    requestHeaders.set('content-type', 'application/json')
    const response = await send(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ messages: [message] }),
      signal: AbortSignal.timeout(10_000)
    })
    // Read either way, which frees the connection.
    const said = await response.text()
    if (!response.ok) throw new Error(`Pub/Sub publish to ${topic} failed: ${response.status} ${said.slice(0, 200)}`)
  }
}
