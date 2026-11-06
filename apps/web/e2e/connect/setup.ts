import type { Page } from '@playwright/test'
import type { Principal } from '@skyclause/contracts'
import { asPage } from '../harness/as-page'
import { stubApi } from '../harness/stub-api'
import { connectOperations } from '../../features/connect/operations'

export const orgId = '019a34d0-0000-7000-8000-000000000001'
export const member: Extract<Principal, { kind: 'session' }> = {
  kind: 'session',
  via: 'cookie',
  accountId: 'account-test',
  sessionId: 'session-test',
  isGuest: false,
  staff: false,
  orgId,
  role: 'admin',
  authenticatedAt: new Date('2026-11-06T01:00:00Z'),
  client: 'app',
  clientName: null
}
export const configText =
  '  {\n  "mcpServers": {"skyclause": {"url": "https://mcp.skyclause.m1ku.tech/mcp", "auth": "oauth"}}\n}\r\n'
export const tools = [
  { name: 'inspect_sensor_certificate', description: 'Inspect a test certificate', scopes: ['read'] },
  { name: 'propose_weather_review', description: 'Propose a test review', scopes: ['draft', 'read'] }
]
export const records = [
  {
    id: 'verification-1',
    target: 'claude_ai',
    client_version: 'test',
    tested_at: '2020-01-01T20:00:00Z',
    result: 'verified',
    tested_by: 'test',
    notes: ''
  },
  {
    id: 'verification-2',
    target: 'gemini_enterprise',
    client_version: 'test',
    tested_at: '2026-11-06T00:00:00Z',
    result: 'reverify_due',
    tested_by: 'test',
    notes: ''
  }
]
export const memberships = [
  {
    id: 'membership-1',
    org_id: orgId,
    account_id: 'account-test',
    org_name: 'Test organisation',
    org_slug: 'test-organisation',
    role: 'admin',
    reads_malay: false
  }
]

export async function prepare(page: Page, principal: Principal = member) {
  await asPage(page, principal)
  await stubApi(page, 'listConnectVerifications', { data: records, next_cursor: null }, { registry: connectOperations })
  await stubApi(page, 'listConnectActivity', { data: [], next_cursor: null }, { registry: connectOperations })
  await stubApi(page, 'listMyMemberships', { data: memberships, next_cursor: null }, { registry: connectOperations })
  await page.route('**/api/connect/config?*', async (route) => {
    const query = new URL(route.request().url()).searchParams
    await route.fulfill({
      json: connectOperations.getConnectConfig.response.parse({
        target: query.get('target'),
        transport: query.get('transport'),
        config: configText,
        tools: [{ name: 'ignored_config_tool', description: 'Not the live list', scopes: ['read'] }]
      })
    })
  })
  await page.route('**/mcp/tools.json', (route) => route.fulfill({ json: { tools } }))
}
