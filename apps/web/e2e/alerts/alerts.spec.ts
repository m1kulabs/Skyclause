import { alertsOperations } from '../../features/alerts/operations'
import { expect, test } from '../fixtures'
import { asPage, stubApi } from '../harness'
import { t } from './messages'

import { principal, browserPush, emptyApi, testDevice } from './support'

test('permission is requested only by the card button; denial explains browser settings', async ({ page }) => {
  await asPage(page, principal())
  await browserPush(page)
  await emptyApi(page)
  await page.goto('/_test/alerts')
  await expect(page.getByRole('button', { name: t('enable') })).toBeEnabled()
  expect(await page.locator('html').getAttribute('data-permission-requests')).toBeNull()
  await page.getByRole('button', { name: t('enable') }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-permission-requests', '1')
  await expect(page.getByText(t('blockedHelp'))).toBeVisible()
})

test('iOS outside Home Screen explains iOS 16.4 and never prompts', async ({ page }) => {
  await asPage(page, principal())
  await browserPush(page, 'default', true)
  await page.goto('/_test/alerts')
  await expect(page.getByText(t('iosHelp'))).toBeVisible()
  await expect(page.getByRole('button', { name: t('enable') })).toHaveCount(0)
  expect(await page.locator('html').getAttribute('data-permission-requests')).toBeNull()
})

test('guests see neither card nor notifications panel', async ({ page }) => {
  await asPage(page, principal('guest-account', true))
  await page.goto('/_test/alerts')
  await expect(page.locator('[data-alerts-card]')).toHaveCount(0)
  await page.goto('/account/notifications')
  await expect(page.locator('[data-alerts-panel]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('granted permission registers the worker, subscribes with VAPID and posts the real browser subscription', async ({
  page
}) => {
  await asPage(page, principal())
  await emptyApi(page)
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default'
    Object.defineProperty(Notification, 'permission', { get: () => permission })
    Notification.requestPermission = async () => {
      permission = 'granted'
      return permission
    }
    const subscription = {
      endpoint: 'https://push.example.test/device-1',
      toJSON: () => ({ keys: { p256dh: 'public-key', auth: 'auth-key' } })
    }
    const registration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async (options: PushSubscriptionOptionsInit) => {
          document.documentElement.dataset.subscribeKey = Array.from(
            new Uint8Array(options.applicationServerKey as ArrayBuffer)
          ).join(',')
          document.documentElement.dataset.userVisible = String(options.userVisibleOnly)
          return subscription
        }
      }
    }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => undefined,
        register: async (url: string) => {
          document.documentElement.dataset.worker = url
          return registration
        },
        ready: Promise.resolve(registration)
      }
    })
  })
  await stubApi(page, 'getVapidPublicKey', { public_key: 'AQIDBA' }, { registry: alertsOperations })
  await stubApi(page, 'createPushSubscription', testDevice, { registry: alertsOperations })
  await page.goto('/_test/alerts')
  const request = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/push-subscriptions')
  )
  await page.getByRole('button', { name: t('enable') }).click()
  const post = await request
  expect(post.postDataJSON()).toEqual({
    endpoint: testDevice.endpoint,
    p256dh: testDevice.p256dh,
    auth: testDevice.auth,
    user_agent: expect.any(String)
  })
  expect(post.headers()['idempotency-key']).toBeTruthy()
  await expect(page.locator('html')).toHaveAttribute('data-worker', '/sw.js')
  await expect(page.locator('html')).toHaveAttribute('data-subscribe-key', '1,2,3,4')
  await expect(page.locator('html')).toHaveAttribute('data-user-visible', 'true')
  await expect(page.locator('[data-alerts-card]').getByRole('status')).toHaveText(t('on'))
})
