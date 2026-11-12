import { t } from './messages'
import type { Page } from '@playwright/test'
import type { Principal } from '@skyclause/contracts'
import { asPage, stubApi } from '../harness'
import { alertsOperations } from '../../features/alerts/operations'

export function principal(accountId = 'alerts-account', isGuest = false): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId,
    sessionId: `session-${accountId}`,
    authenticatedAt: new Date('2026-11-06T00:00:00Z'),
    orgId: 'alerts-org',
    role: isGuest ? 'guest' : 'viewer',
    isGuest,
    staff: false
  }
}

export async function browserPush(page: Page, permission: NotificationPermission = 'default', ios = false) {
  await page.addInitScript(
    ({ permission, ios }) => {
      let requests = 0
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission })
      Notification.requestPermission = async () => {
        requests++
        document.documentElement.dataset.permissionRequests = String(requests)
        return 'denied'
      }
      if (ios) Object.defineProperty(navigator, 'userAgent', { get: () => 'iPhone OS 16_4 like Mac OS X' })
    },
    { permission, ios }
  )
}

export async function emptyApi(page: Page) {
  await stubApi(page, 'listNotifications', { data: [], next_cursor: null }, { registry: alertsOperations })
  await stubApi(page, 'listPushSubscriptions', { data: [], next_cursor: null }, { registry: alertsOperations })
  await stubApi(
    page,
    'getMyNotificationPreferences',
    {
      data: ['needs_review', 'escalated', 'source_error', 'review_item', 'auditor'].map((kind) => ({
        kind,
        enabled: true
      }))
    },
    { registry: alertsOperations }
  )
  await page.route('**/api/notifications/stream', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' })
  )
}

export const testDevice = {
  id: 'device-1',
  account_id: 'alerts-account',
  endpoint: 'https://push.example.test/device-1',
  p256dh: 'public-key',
  auth: 'auth-key',
  user_agent: 'Firefox on Linux',
  last_ok_at: null
}

export async function removeDeviceScenario(page: Page) {
  const { expect } = await import('@playwright/test')
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'listPushSubscriptions',
    { data: [testDevice], next_cursor: null },
    { registry: alertsOperations }
  )
  await stubApi(page, 'deletePushSubscription', undefined, { registry: alertsOperations })
  await page.goto('/account/notifications')
  await expect(page.getByText(testDevice.user_agent, { exact: true })).toBeVisible()
  await stubApi(page, 'listPushSubscriptions', { data: [], next_cursor: null }, { registry: alertsOperations })
  const button = page.getByRole('button', {
    name: t('remove', { label: testDevice.user_agent, action: t('removeDevice') })
  })
  await button.focus()
  await page.keyboard.press('Enter')
  // Removing a device asks first, in a dialog that names it; the confirmation removes it.
  const dialog = page.getByRole('alertdialog')
  const title = t('removeTitle', { label: `“${testDevice.user_agent}”` })
  await expect(dialog.getByRole('heading')).toHaveText(title)
  await dialog.getByRole('button', { name: title, exact: true }).click()
  await expect(page.getByText(testDevice.user_agent, { exact: true })).toHaveCount(0)
  await expect(page.getByText(t('emptyDevices'))).toBeVisible()
  // The row and its button are gone: the section heading holds focus and the removal is announced.
  await expect(page.getByRole('heading', { name: t('devices') })).toBeFocused()
}
