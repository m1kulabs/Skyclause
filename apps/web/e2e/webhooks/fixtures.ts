import type { Page } from '@playwright/test'
import type { Principal, Role } from '@skyclause/contracts'
import { asPage, stubApi } from '../harness'
import { webhookOperations } from '../../features/webhooks/operations'
import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'
const messages = JSON.parse(
  readFileSync(new URL('../../../../packages/i18n/catalogue/en/webhooks.json', import.meta.url), 'utf8')
) as Record<string, string>
export function t(key: string, vars: Record<string, string | number> = {}) {
  const value = messages[key.replace('webhooks.', '')]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(vars[name] ?? `{${name}}`)
  )
  return process.env.I18N_PSEUDO === '1' ? pseudo(value) : value
}

export const endpoint = {
  id: 'endpoint-1',
  url: 'https://receiver.example.test/hooks',
  events: ['call.sent'],
  project_ids: [],
  disabled_at: null,
  verified_at: null,
  status: 'pending',
  last_delivery_at: null
}
export const verified = { ...endpoint, status: 'verified', verified_at: '2026-11-06T01:00:00Z' }
export const secret = 'skw_browser-test-only-secret'
export const project = {
  id: 'project-1',
  org_id: 'test-org',
  name: 'Test project',
  slug: 'test-project',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: '2026-12-31',
  site_name: 'Test site',
  site_lat: 3.05,
  site_lon: 101.69,
  archived_at: null,
  camera_day_start: '08:00',
  camera_day_end: '18:00',
  warning_area_terms: [],
  packs: []
}
export const event = {
  id: '019a55b0-0000-7000-8000-000000000001',
  type: 'call.sent',
  created_at: '2026-11-06T01:00:00Z',
  org_id: '019a55b0-0000-7000-8000-000000000002',
  project_id: '019a55b0-0000-7000-8000-000000000003',
  data: { call_id: '019a55b0-0000-7000-8000-000000000004', mode: 'normal', outcome: 'sent' }
}
export const delivery = {
  id: 'delivery-1',
  event_id: event.id,
  dispatch_id: 'dispatch-1',
  attempt: 1,
  status_code: 503,
  latency_ms: 120,
  state: 'failed',
  attempted_at: '2026-11-06T01:00:00Z',
  request_headers: {
    'Skyclause-Webhook-Id': event.id,
    'Skyclause-Webhook-Timestamp': '1793926800',
    'Skyclause-Signature': 'v1=test-signature'
  },
  request_body: event,
  raw_request_body: JSON.stringify(event),
  response_headers: {},
  response_body: 'Receiver unavailable',
  error: 'receiver-unavailable',
  next_retry_at: '2026-11-06T01:05:00Z'
}
export function principal(role: Role = 'admin', isGuest = false): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date('2026-11-06T00:00:00Z'),
    orgId: 'test-org',
    role,
    isGuest,
    staff: false
  }
}
export async function setup(page: Page, hooks: unknown[] = [endpoint], role: Role = 'admin', isGuest = false) {
  await asPage(page, principal(role, isGuest))
  await stubApi(page, 'listWebhooks', { data: hooks, next_cursor: null }, { registry: webhookOperations })
  await stubApi(page, 'listProjects', { data: [project], next_cursor: null }, { registry: webhookOperations })
  await stubApi(page, 'getWebhook', hooks[0] ?? endpoint, { registry: webhookOperations })
  await stubApi(page, 'listWebhookDeliveries', { data: [], next_cursor: null }, { registry: webhookOperations })
}
export async function tabTo(page: Page, selector: ReturnType<Page['getByRole']>) {
  for (let step = 0; step < 160; step++) {
    if (await selector.evaluate((node) => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Keyboard did not reach the control')
}

export async function stubAction(
  page: Page,
  operationId: 'createWebhook' | 'verifyWebhook' | 'redeliverWebhook' | 'deleteWebhook',
  body: unknown,
  status?: number
) {
  const operation = webhookOperations[operationId]
  if (!status || status < 400) await stubApi(page, operationId, body, { registry: webhookOperations })
  const requests: Array<{ body: unknown; org: string | undefined; idempotency: string | undefined }> = []
  const path = operation.path.replace('{id}', endpoint.id)
  await page.route(`**${path}`, async (route) => {
    if (route.request().method().toLowerCase() !== operation.method.toLowerCase()) return route.fallback()
    const request = route.request()
    requests.push({
      body: request.postData() ? request.postDataJSON() : null,
      org: request.headers()['skyclause-organization'],
      idempotency: request.headers()['idempotency-key']
    })
    if (operationId === 'deleteWebhook' && (!status || status < 400)) await route.fulfill({ status: 204 })
    else if (status && status >= 400)
      await route.fulfill({ status, contentType: 'application/problem+json', json: body })
    else await route.fallback()
  })
  return requests
}
