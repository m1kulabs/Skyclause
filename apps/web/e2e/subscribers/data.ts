import type { Page } from '@playwright/test'
import type { Principal, Role } from '@skyclause/contracts'
import { subscriberOperations } from '../../features/subscribe/operations'
import { windowsOperations } from '../../features/windows/operations'
import { asPage, stubApi } from '../harness'

// Operation doubles only. These values never ship in application code.
export const registry = subscriberOperations
export const subscriber = {
  id: 'subscriber-id',
  project_id: 'project-id',
  email: 'recipient@example.test',
  role: 'Student',
  window_ids: ['window-id'],
  channels: ['email'],
  language: 'en',
  confirmed_at: '2026-11-06T01:00:00Z'
}
export const windowData = {
  id: 'window-id',
  project_id: 'project-id',
  starts_at: '2026-11-06T01:00:00Z',
  ends_at: '2026-11-06T03:00:00Z',
  title: 'Test window',
  kind: 'class',
  tz: 'Asia/Kuala_Lumpur',
  declared_by: 'test-account',
  guest: false,
  via: 'app',
  expires_at: null,
  series_id: null,
  ics_feed_id: null,
  cancelled_at: null,
  share_link_id: null,
  moderation: 'visible'
}
export const subscription = {
  project: { id: 'project-id', slug: 'test-project', org_slug: 'test-org' },
  project_name: 'Test project',
  windows: [windowData],
  subscriber: null,
  privacy_notice_version: '2026-11-06'
}
export const row = {
  ...subscriber,
  status: 'confirmed',
  suppressed: false,
  last_notice_at: '2026-11-06T02:00:00Z',
  consent: { at: '2026-11-06T00:00:00Z', form: 'subscribe_link', notice_version: '2026-11-06', language: 'en' }
}
export const counts = {
  total: 1,
  confirmed: 1,
  unconfirmed: 0,
  suppressed: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  by_window: [{ window_id: 'window-id', count: 1 }],
  by_channel: [{ channel: 'email', count: 1 }]
}
export const projectPath = '/test-org/test-project/subscribers'
export const channelsPath = '/test-org/test-project/settings/channels'
export function principal(role: Role = 'admin'): Extract<Principal, { kind: 'session' }> {
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
    isGuest: false,
    staff: false
  }
}
export async function setupProject(page: Page, role: Role = 'admin') {
  await asPage(page, principal(role))
  await stubApi(
    page,
    'listProjects',
    {
      data: [
        {
          id: 'project-id',
          org_id: 'test-org',
          name: 'Test project',
          slug: 'test-project',
          time_zone: 'Asia/Kuala_Lumpur',
          public: false,
          semester_ends_on: '2026-12-31',
          site_name: 'Test site',
          site_lat: 3,
          site_lon: 101,
          archived_at: null,
          camera_day_start: '07:00',
          camera_day_end: '19:00',
          warning_area_terms: [],
          packs: []
        }
      ],
      next_cursor: null
    },
    { registry }
  )
  // The window names the counts are grouped by.
  await stubApi(
    page,
    'listWindows',
    { data: [{ ...windowData, latest_calls: { sky: null, crowd: null } }], next_cursor: null },
    { registry: windowsOperations }
  )
  await stubApi(page, 'getSubscriberCounts', counts, { registry })
  await stubApi(page, 'listSubscribers', { data: [row], next_cursor: null }, { registry })
  await stubApi(
    page,
    'listChannels',
    {
      data: [
        { channel: 'email', enabled: true },
        { channel: 'ics', enabled: false }
      ],
      next_cursor: null
    },
    { registry }
  )
}
export async function failOperation(
  page: Page,
  path: string,
  method = 'GET',
  status = 503,
  type = 'operation-unavailable'
) {
  await page.route(path, async (route) => {
    if (route.request().method() !== method) return route.fallback()
    await route.fulfill({ status, contentType: 'application/problem+json', json: { status, type, title: type } })
  })
}
