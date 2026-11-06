import type { Notification as Item } from '@skyclause/contracts'
import { test, expect } from '../fixtures'
import { asPage, stubApi, expectZonedTimes } from '../harness'
import { alertsOperations } from '../../features/alerts/operations'
import { principal, emptyApi, browserPush } from './support'
import { t } from './messages'

const project = { id: 'project-a', org_slug: 'org-a', slug: 'project-a' }
export function item(id: string, kind: Item['kind'] = 'needs_review', refType = 'bundle', recovered = false): Item {
  return {
    id,
    kind,
    ref: { type: refType, id: `ref-${id}` },
    project,
    recovered,
    created_at: `2026-11-06T0${id === 'older' ? '1' : '2'}:00:00Z`,
    read_at: null
  }
}

test('inbox sorts newest first, marks read by keyboard and receives a live item within 10 seconds', async ({
  page
}) => {
  await asPage(page, principal())
  await emptyApi(page)
  const older = { ...item('older'), created_at: '2026-11-06T02:00:00Z' },
    newer = { ...item('newer'), created_at: '2026-11-06T02:00:00.500Z' }
  await stubApi(page, 'listNotifications', { data: [older, newer], next_cursor: null }, { registry: alertsOperations })
  await stubApi(
    page,
    'markNotificationRead',
    { ...newer, read_at: '2026-11-06T03:00:00Z' },
    { registry: alertsOperations }
  )
  await page.goto('/account/notifications')
  await expect(page.locator('[data-notification]').first()).toHaveAttribute('data-notification', 'newer')
  await expect(page.getByText(t('unreadCount', { count: 2 }), { exact: true })).toBeVisible()
  const row = page.locator('[data-notification="newer"]')
  await row.getByRole('button', { name: t('markRead') }).focus()
  await page.keyboard.press('Enter')
  await expect(row.getByText(t('read'), { exact: true })).toBeVisible()
  await expect(page.getByText(t('unreadCount', { count: 1 }), { exact: true })).toBeVisible()
  const live = { ...item('live', 'escalated'), created_at: '2026-11-06T04:00:00Z' }
  await stubApi(page, 'streamNotifications', live, {
    registry: alertsOperations,
    stream: { event: 'notification', id: '42' }
  })
  const start = Date.now()
  await expect(page.locator('[data-notification="live"]')).toBeVisible({ timeout: 10_000 })
  expect(Date.now() - start).toBeLessThan(10_000)
  await expect(page.locator('[data-alerts-panel] [aria-live="polite"]')).toHaveText(
    t('newItem', { kind: t('kinds.escalated'), ref: 'ref-live' })
  )
  await expectZonedTimes(page)
})

test('recovered auditor copy and project/reference destinations match the inbox item', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'listNotifications',
    {
      data: [item('bundle'), item('review', 'review_item', 'review_item'), item('source', 'auditor', 'source', true)],
      next_cursor: null
    },
    { registry: alertsOperations }
  )
  await page.goto('/account/notifications')
  await expect(page.locator('[data-notification="source"] a')).toHaveText(
    t('item', { kind: t('recovery', { kind: t('kinds.auditor') }), ref: 'ref-source' })
  )
  for (const [id, href] of [
    ['bundle', '/org-a/project-a/bundles/ref-bundle'],
    ['review', '/org-a/project-a/analysis?review_item=ref-review'],
    ['source', '/org-a/project-a/signals/ref-source']
  ]) {
    await expect(page.locator(`[data-notification="${id}"] a`)).toHaveAttribute('href', href!)
  }
})

test('changing accounts starts a fresh inbox and stream with no previous account items', async ({ page }) => {
  await asPage(page, principal('account-a'))
  await emptyApi(page)
  await stubApi(
    page,
    'listNotifications',
    { data: [item('account-a-only')], next_cursor: null },
    { registry: alertsOperations }
  )
  await page.goto('/account/notifications')
  await expect(page.locator('[data-notification]')).toHaveCount(1)
  await asPage(page, principal('account-b'))
  await stubApi(page, 'listNotifications', { data: [], next_cursor: null }, { registry: alertsOperations })
  await page.reload()
  await expect(page.locator('[data-notification]')).toHaveCount(0)
  await expect(page.getByText(t('emptyInbox'))).toBeVisible()
})

test('source error switch saves only that kind and displays its saved state', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'updateMyNotificationPreferences',
    { data: [{ kind: 'source_error', enabled: false }] },
    { registry: alertsOperations }
  )
  await page.goto('/account/notifications')
  const toggle = page.getByRole('switch', { name: t('kinds.source_error') })
  await expect(toggle).toBeChecked()
  await toggle.focus()
  const request = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith('/api/me/notification-preferences')
  )
  await page.keyboard.press('Space')
  expect((await request).postDataJSON()).toEqual({ preferences: [{ kind: 'source_error', enabled: false }] })
  await expect(toggle).not.toBeChecked()
  await expect(page.getByText(t('saved'), { exact: true })).toBeVisible()
  for (const kind of ['needs_review', 'escalated', 'review_item', 'auditor'])
    await expect(page.getByRole('switch', { name: t(`kinds.${kind}`) })).toBeChecked()
  await expect(page.getByText(t('shiftNotice'))).toBeVisible()
})

test('failed reads and saves keep their current state and expose retry instructions', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'listNotifications',
    { data: [item('unread')], next_cursor: null },
    { registry: alertsOperations }
  )
  await page.route('**/api/notifications/*/read', (route) => route.fulfill({ status: 503 }))
  await page.route('**/api/me/notification-preferences', (route) =>
    route.request().method() === 'PATCH' ? route.fulfill({ status: 503 }) : route.fallback()
  )
  await page.goto('/account/notifications')
  await page.getByRole('button', { name: t('markRead') }).click()
  await expect(page.getByText(t('readError'))).toBeVisible()
  await expect(page.getByText(t('unread'), { exact: true })).toBeVisible()
  const toggle = page.getByRole('switch', { name: t('kinds.source_error') })
  await toggle.click()
  await expect(page.getByText(t('saveError'))).toBeVisible()
  await expect(toggle).toBeChecked()
})

test('operation failures show errors and never manufacture an empty inbox or devices', async ({ page }) => {
  await asPage(page, principal())
  await browserPush(page)
  await page.route('**/api/**', (route) => route.fulfill({ status: 503 }))
  await page.goto('/account/notifications')
  await expect(page.getByText(t('inboxError'))).toBeVisible()
  await expect(page.getByText(t('devicesError'))).toBeVisible()
  await expect(page.getByText(t('preferencesError'))).toBeVisible()
  await expect(page.getByText(t('emptyInbox'))).toHaveCount(0)
  await expect(page.getByText(t('emptyDevices'))).toHaveCount(0)
  await stubApi(page, 'listNotifications', { data: [], next_cursor: null }, { registry: alertsOperations })
  await page
    .locator('section[aria-labelledby=alerts-inbox]')
    .getByRole('button', { name: t('retry') })
    .focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(t('emptyInbox'))).toBeVisible()
})

test('unread total spans cursor pages and pagination keeps its cursor in the URL', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'listNotifications',
    { data: [item('page-one')], next_cursor: 'older-page' },
    { registry: alertsOperations, query: { cursor: null } }
  )
  await stubApi(
    page,
    'listNotifications',
    { data: [item('page-two')], next_cursor: null },
    { registry: alertsOperations, query: { cursor: 'older-page' } }
  )
  await page.goto('/account/notifications')
  await expect(page.getByText(t('unreadCount', { count: 2 }), { exact: true })).toBeVisible()
  await expect(page.locator('[data-notification="page-one"]')).toBeVisible()
  await page.getByRole('button', { name: t('next') }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/cursor=older-page/)
  await expect(page.locator('[data-notification="page-two"]')).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-notification="page-two"]')).toBeVisible()
  await page.getByRole('button', { name: t('previous') }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/account/notifications')
})

test('a reconnect snapshot reconciles missed notifications without resuming an event ID', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'listNotifications',
    { data: [item('before')], next_cursor: null },
    { registry: alertsOperations }
  )
  await page.goto('/account/notifications')
  await expect(page.locator('[data-notification="before"]')).toBeVisible()
  await stubApi(page, 'listNotifications', { data: [item('after')], next_cursor: null }, { registry: alertsOperations })
  await stubApi(page, 'streamNotifications', item('after'), {
    registry: alertsOperations,
    stream: { event: 'snapshot', id: '77' }
  })
  await expect(page.locator('[data-notification="after"]')).toBeVisible({ timeout: 10_000 })
  const request = await page.waitForRequest((request) => request.url().endsWith('/api/notifications/stream'))
  expect(request.headers()['last-event-id']).toBeUndefined()
  await expect(page.locator('[data-notification="before"]')).toHaveCount(0)
})
