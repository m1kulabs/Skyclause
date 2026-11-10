import { createSdk, SourceError, webhooks } from '../../src/index'
import { OPERATIONS, OPERATION_IDS } from '../../src/generated'

const testVector = {
  secret: 'skw_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', // gitleaks:allow -- test vector: bytes 0 to 31.
  id: '019a43c1-6f80-7000-8000-000000000001',
  timestamp: '1793603100',
  body: '{"id":"019a43c1-6f80-7000-8000-000000000001","type":"source.error"}',
  signature: 'v1=f3bb7f7850e089ec9b9a904651ecae9170a01ed46e3ca44b4cc4cbae173b02c5'
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SDK runtime suite: ${message}`)
}

function same(actual: unknown, expected: unknown, message: string): void {
  check(Object.is(actual, expected), `${message}; expected ${String(expected)}, got ${String(actual)}`)
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(value), { status, headers: responseHeaders })
}

function eventResponse(payload: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload))
      controller.close()
    }
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
}

export async function runSdkRuntimeSuite(): Promise<number> {
  let checks = 0
  const inputSince = '2026-11-10T01:00:00Z'
  const indicators = {
    project_id: 'project-1',
    pack: 'sky',
    t_eval: '2026-11-10T01:05:00Z',
    inputs: [
      {
        state: 'error',
        since: inputSince,
        http_status: 502,
        pending_until: null,
        source_id: 'met-1',
        age_s: null
      }
    ],
    site: {
      rainfall: {
        name: 'rainfall',
        value: null,
        unit: 'mm',
        state: 'error',
        since: inputSince,
        age_s: null,
        source_ids: ['met-1'],
        source_url: null,
        reading_ids: [],
        observed_at: null
      }
    },
    series: {},
    nights: [],
    registry_hash: 'registry-hash',
    hash: 'snapshot-hash'
  }
  let apiKeyHeaders: Headers | undefined
  const apiKeySdk = createSdk({
    baseUrl: 'https://sdk.test/v1',
    token: 'skc_runtime_test',
    organization: 'pilot',
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      same(url.pathname, '/v1/projects/project%20one/indicators', 'path parameters are escaped')
      same(url.searchParams.get('pack'), 'sky', 'query parameters are sent')
      apiKeyHeaders = new Headers(init?.headers)
      return jsonResponse(indicators)
    }
  })
  const result = await apiKeySdk.getProjectIndicators({ params: { id: 'project one' }, query: { pack: 'sky' } })
  const rainfall = result.site.rainfall
  check(rainfall !== undefined, 'an erroring source reading remains present')
  same(rainfall.state, 'error', 'source state remains data')
  same(rainfall.value, null, 'an erroring value remains null data')
  same(rainfall.since, inputSince, 'source state keeps its since time')
  same(rainfall.source_ids[0], 'met-1', 'source state keeps its source ID')
  same(result.inputs[0]?.state, 'error', 'a No call input keeps its source state')
  same(result.inputs[0]?.since, inputSince, 'a No call input keeps its since time')
  same(result.inputs[0]?.source_id, 'met-1', 'a No call input keeps its source ID')
  same(apiKeyHeaders?.get('Authorization'), 'Bearer skc_runtime_test', 'API key auth is bearer auth')
  same(apiKeyHeaders?.get('Skyclause-Organization'), 'pilot', 'organization config is sent')
  check(
    [...(apiKeyHeaders?.keys() ?? [])].every((name) =>
      [
        'accept',
        'authorization',
        'content-type',
        'idempotency-key',
        'last-event-id',
        'skyclause-organization'
      ].includes(name)
    ),
    'only CORS-allowed request headers are set'
  )
  checks += 13

  let oauthAuthorization: string | null | undefined
  const oauthSdk = createSdk({
    token: 'oauth_access_token',
    fetch: async (_input, init) => {
      oauthAuthorization = new Headers(init?.headers).get('Authorization')
      return jsonResponse({ id: 'account-1' })
    }
  })
  await oauthSdk.getMe()
  same(oauthAuthorization, 'Bearer oauth_access_token', 'OAuth auth is bearer auth')
  checks += 1

  const sourceErrorSdk = createSdk({
    fetch: async () =>
      jsonResponse(
        {
          type: 'https://docs.skyclause.m1ku.tech/problems/source-error',
          title: 'Source error',
          status: 503,
          detail: 'The source is unavailable.',
          instance: '/v1/sources/source-1/readings',
          source_id: 'source-1',
          since: inputSince
        },
        503
      )
  })
  let caught: unknown
  try {
    await sourceErrorSdk.listSourceReadings({ params: { id: 'source-1' } })
  } catch (error) {
    caught = error
  }
  check(caught instanceof SourceError, 'source-error problems use SourceError')
  same(caught.sourceId, 'source-1', 'SourceError names the source')
  same(caught.since, inputSince, 'SourceError carries since')
  checks += 3

  const cursors: Array<string | null | undefined> = []
  const rows: string[] = []
  for await (const row of apiKeySdk.paginate(async (cursor) => {
    cursors.push(cursor)
    return cursor ? { data: ['second'], next_cursor: null } : { data: ['first'], next_cursor: 'cursor-2' }
  })) {
    rows.push(row)
  }
  same(rows.join(','), 'first,second', 'pagination yields each page')
  same(cursors.length, 2, 'pagination stops at next_cursor null')
  same(cursors[1], 'cursor-2', 'pagination sends the next cursor')
  checks += 3

  const postHeaders: Array<string | null> = []
  let attempts = 0
  const retrySdk = createSdk({
    fetch: async (_input, init) => {
      attempts += 1
      postHeaders.push(new Headers(init?.headers).get('Idempotency-Key'))
      if (attempts === 1) {
        return jsonResponse(
          {
            type: 'https://docs.skyclause.m1ku.tech/problems/rate-limited',
            title: 'Rate limited',
            status: 429,
            detail: 'Retry this request.',
            instance: '/v1/projects/project-1/subscribe-link'
          },
          429,
          { 'Retry-After': '0' }
        )
      }
      return jsonResponse({ id: 'link-1' }, 201)
    }
  })
  await retrySdk.createSubscribeLink({ params: { id: 'project-1' } })
  same(attempts, 2, 'a keyed POST retries after 429')
  check(Boolean(postHeaders[0]), 'creating POSTs receive an idempotency key')
  same(postHeaders[0], postHeaders[1], 'the key is reused across retries')
  checks += 3

  let getAttempts = 0
  const getRetrySdk = createSdk({
    fetch: async () => {
      getAttempts += 1
      if (getAttempts < 4) {
        return jsonResponse(
          { type: 'https://docs.skyclause.m1ku.tech/problems/internal-error', title: 'Retry', status: 503 },
          503,
          { 'Retry-After': '0' }
        )
      }
      return jsonResponse({ id: 'account-1' })
    }
  })
  await getRetrySdk.getMe()
  same(getAttempts, 4, 'GET retries up to three times after a 5xx response')
  checks += 1

  let deleteAttempts = 0
  const deleteRetrySdk = createSdk({
    fetch: async () => {
      deleteAttempts += 1
      return deleteAttempts === 1
        ? jsonResponse(
            { type: 'https://docs.skyclause.m1ku.tech/problems/internal-error', title: 'Retry', status: 503 },
            503,
            { 'Retry-After': '0' }
          )
        : new Response(null, { status: 204 })
    }
  })
  await deleteRetrySdk.deleteWebhook({ params: { id: 'webhook-1' } })
  same(deleteAttempts, 2, 'DELETE retries after a 5xx response')
  checks += 1

  const unkeyedPost = OPERATION_IDS.find((operationId) => {
    const operation = OPERATIONS[operationId]
    return operation.method === 'POST' && !operation.idempotent
  })
  check(unkeyedPost !== undefined, 'OpenAPI contains a non-idempotent POST for retry policy coverage')
  let unkeyedPostAttempts = 0
  const unkeyedPostSdk = createSdk({
    fetch: async (_input, init) => {
      unkeyedPostAttempts += 1
      same(new Headers(init?.headers).get('Idempotency-Key'), null, 'unkeyed POSTs do not receive a key')
      return jsonResponse(
        { type: 'https://docs.skyclause.m1ku.tech/problems/internal-error', title: 'Do not retry', status: 503 },
        503,
        { 'Retry-After': '0' }
      )
    }
  })
  const unkeyedOperation = OPERATIONS[unkeyedPost!]
  const params = Object.fromEntries(
    [...unkeyedOperation.path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => [name!, 'test'])
  )
  let unkeyedPostFailed = false
  try {
    const call = unkeyedPostSdk[unkeyedPost] as (request: { params?: Record<string, string> }) => Promise<unknown>
    await call({ params })
  } catch {
    unkeyedPostFailed = true
  }
  check(unkeyedPostFailed, 'non-idempotent POST failures remain typed errors')
  same(unkeyedPostAttempts, 1, 'non-idempotent POSTs are not retried')
  checks += 4

  const streamHeaders: Array<Headers> = []
  let streamRequests = 0
  const streamSdk = createSdk({
    fetch: async (_input, init) => {
      streamRequests += 1
      streamHeaders.push(new Headers(init?.headers))
      return streamRequests === 1 ? eventResponse('id: 41\ndata: first\n\n') : eventResponse('id: 42\ndata: second\n\n')
    }
  })
  const events = []
  for await (const event of streamSdk.stream('streamReadings', { params: { id: 'project-1' } })) {
    events.push(event)
    if (events.length === 2) break
  }
  same(events.map((event) => event.data).join(','), 'first,second', 'SSE events are parsed')
  same(streamRequests, 2, 'SSE reconnects after the response ends')
  same(streamHeaders[0]?.get('Last-Event-ID'), null, 'the first stream has no resume ID')
  same(streamHeaders[1]?.get('Last-Event-ID'), '41', 'the reconnect resumes after the last ID')
  checks += 4

  const verified = await webhooks.verify(
    testVector.body,
    {
      'Skyclause-Webhook-Id': testVector.id,
      'Skyclause-Webhook-Timestamp': testVector.timestamp,
      'Skyclause-Signature': testVector.signature
    },
    testVector.secret,
    { now: Number(testVector.timestamp) }
  )
  check(verified, 'the shared webhook HMAC vector verifies')
  const stale = await webhooks.verify(
    testVector.body,
    {
      'Skyclause-Webhook-Id': testVector.id,
      'Skyclause-Webhook-Timestamp': String(Number(testVector.timestamp) + 301),
      'Skyclause-Signature': testVector.signature
    },
    testVector.secret,
    { now: Number(testVector.timestamp) }
  )
  check(!stale, 'webhook timestamps outside tolerance are rejected')
  const changedBody = await webhooks.verify(
    `${testVector.body} `,
    {
      'Skyclause-Webhook-Id': testVector.id,
      'Skyclause-Webhook-Timestamp': testVector.timestamp,
      'Skyclause-Signature': testVector.signature
    },
    testVector.secret,
    { now: Number(testVector.timestamp) }
  )
  check(!changedBody, 'a changed webhook body is rejected')
  const wrongSecret = await webhooks.verify(
    testVector.body,
    {
      'Skyclause-Webhook-Id': testVector.id,
      'Skyclause-Webhook-Timestamp': testVector.timestamp,
      'Skyclause-Signature': testVector.signature
    },
    `${testVector.secret}x`,
    { now: Number(testVector.timestamp) }
  )
  check(!wrongSecret, 'a webhook signed with another secret is rejected')
  checks += 4

  return checks
}
