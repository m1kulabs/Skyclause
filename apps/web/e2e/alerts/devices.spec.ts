import { test, expect } from '../fixtures'
import { asPage, stubApi } from '../harness'
import { alertsOperations } from '../../features/alerts/operations'
import { principal, emptyApi, testDevice } from './support'
import { t } from './messages'

test('device pagination replaces its page and keeps the cursor in the URL', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(
    page,
    'listPushSubscriptions',
    { data: [testDevice], next_cursor: 'next-device' },
    { registry: alertsOperations, query: { cursor: null } }
  )
  await stubApi(
    page,
    'listPushSubscriptions',
    { data: [{ ...testDevice, id: 'device-2', user_agent: 'Second browser' }], next_cursor: null },
    { registry: alertsOperations, query: { cursor: 'next-device' } }
  )
  await page.goto('/account/notifications')
  await expect(page.getByText(testDevice.user_agent, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: t('loadDevices') }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/devices_cursor=next-device/)
  await expect(page.getByText('Second browser', { exact: true })).toBeVisible()
  await expect(page.getByText(testDevice.user_agent, { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Second browser', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: t('previousDevices') }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(testDevice.user_agent, { exact: true })).toBeVisible()
})

test('empty preferences say so and offer a keyboard retry without invented defaults', async ({ page }) => {
  await asPage(page, principal())
  await emptyApi(page)
  await stubApi(page, 'getMyNotificationPreferences', { data: [] }, { registry: alertsOperations })
  await page.goto('/account/notifications')
  await expect(page.getByText(t('emptyPreferences'))).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(5)
  for (const toggle of await page.getByRole('switch').all()) await expect(toggle).toBeDisabled()
  await emptyApi(page)
  const retry = page.locator('section[aria-labelledby=alerts-preferences]').getByRole('button', { name: t('retry') })
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('switch', { name: t('kinds.auditor') })).toBeChecked()
})
