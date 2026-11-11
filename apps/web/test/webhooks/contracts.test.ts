import { expect, test } from 'vitest'
import { REGISTRY } from '@skyclause/contracts'

test('webhook reads preserve receiver evidence and retry times without manufacturing values', () => {
  const route = REGISTRY.find((route) => route.operationId === 'listWebhookDeliveries')!
  const body = {
    id: 'delivery-1',
    event_id: 'event-1',
    dispatch_id: 'dispatch-1',
    attempt: 2,
    status_code: 503,
    latency_ms: 120,
    state: 'failed',
    attempted_at: '2026-11-06T01:00:00Z',
    request_headers: { 'Skyclause-Signature': 'v1=captured' },
    request_body: {
      id: '019a55b0-0000-7000-8000-000000000001',
      type: 'call.sent',
      created_at: '2026-11-06T01:00:00Z',
      org_id: '019a55b0-0000-7000-8000-000000000002',
      project_id: '019a55b0-0000-7000-8000-000000000003',
      data: { call_id: '019a55b0-0000-7000-8000-000000000004', mode: 'normal', outcome: 'sent' }
    },
    response_headers: {},
    response_body: 'Unavailable',
    error: 'receiver-unavailable',
    next_retry_at: '2026-11-06T01:05:00Z',
    raw_request_body: '{ "preserved": true }'
  }
  const schema = route.responses[200].content['application/json'].schema
  const result = schema.parse({ data: [body], next_cursor: null })
  expect(result.data[0]).toMatchObject({
    error: body.error,
    next_retry_at: body.next_retry_at,
    raw_request_body: body.raw_request_body
  })
})
