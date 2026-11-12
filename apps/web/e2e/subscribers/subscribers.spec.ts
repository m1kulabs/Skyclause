import { test, expect } from '../fixtures'
import { stubApi, asPage } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { setupProject, registry, counts, row, projectPath, principal, failOperation } from './data'
import { t } from './messages'
import { subscriberRemoval } from './removal'

test('NTC-13 Admin sees consent, suppression and bounce records and can copy a real subscribe link', async ({
  page
}) => {
  await setupProject(page)
  await stubApi(
    page,
    'listSubscribers',
    {
      data: [
        row,
        { ...row, id: 'bounced-id', email: 'bounced@example.test', status: 'bounced', suppressed: true, consent: null }
      ],
      next_cursor: null
    },
    { registry }
  )
  await stubApi(
    page,
    'createSubscribeLink',
    { id: 'link-id', project_id: 'project-id', url: 'https://app.skyclause.m1ku.tech/subscribe/generated-token' },
    { registry }
  )
  await page.goto(projectPath)
  const table = page.getByRole('table')
  await expect(table).toContainText(row.email)
  await expect(table).toContainText(t('subscribers.status_bounced'))
  await expect(table.locator('time').first()).toContainText('MYT')
  // One line a subscriber: the consent record waits behind the email, on demand.
  await expect(table).not.toContainText(t('subscribers.consent'))
  await table.getByRole('button', { name: row.email, exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    t('subscribers.consent_detail', { form: 'subscribe', version: '2026-11-06', language: t('subscribe.english') })
  )
  await page.keyboard.press('Escape')
  await table.getByRole('button', { name: 'bounced@example.test', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(t('subscribers.no_consent'))
  await page.keyboard.press('Escape')
  // Counts by window carry the window's name and time, never a fragment of its identifier.
  const byWindow = page.getByRole('region', { name: t('subscribers.by_window') })
  await expect(byWindow).toContainText('Test window')
  await expect(byWindow).not.toContainText('window-id')
  const copy = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/subscribe-link')
  )
  await page.getByRole('button', { name: t('subscribers.copy') }).focus()
  await page.keyboard.press('Enter')
  await copy
  await expect(page.getByLabel(t('subscribers.link'), { exact: true })).toHaveValue(
    'https://app.skyclause.m1ku.tech/subscribe/generated-token'
  )
  await expectZonedTimes(page)
})

test('Approver reads subscriber-counts only, without any subscriber table or admin operation', async ({ page }) => {
  await setupProject(page, 'approver')
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/(subscribers|subscriber-counts|subscribe-link)(\?|$)/.test(request.url()))
      requests.push(new URL(request.url()).pathname)
  })
  await page.goto(projectPath)
  for (const status of ['confirmed', 'unconfirmed', 'suppressed'] as const)
    await expect(page.locator(`[data-subscriber-count="${status}"]`)).toHaveText(String(counts[status]))
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByText(row.email)).toHaveCount(0)
  await expect(page.getByRole('button', { name: t('subscribers.copy') })).toHaveCount(0)
  expect(requests.filter((path) => path.startsWith('/v1/'))).toEqual(['/v1/projects/project-id/subscriber-counts'])
})

test('NTC-13 import validates addresses and requests confirmations only', async ({ page }) => {
  await setupProject(page)
  await stubApi(
    page,
    'createSubscriber',
    { ...row, confirmed_at: null, status: 'unconfirmed', consent: null },
    { registry }
  )
  await page.goto(projectPath)
  await expect(page.getByText(t('subscribers.import_notice'))).toBeVisible()
  const addresses = page.getByLabel(t('subscribers.addresses'))
  await addresses.fill('invalid')
  await page.getByRole('button', { name: t('subscribers.import'), exact: true }).click()
  await expect(page.locator('main').getByRole('alert')).toHaveText(
    t('subscribers.invalid_address', { address: 'invalid' })
  )
  await expect(addresses).toBeFocused()
  await addresses.fill('recipient@example.test\nrecipient@example.test')
  const request = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/subscribers')
  )
  await page.getByRole('button', { name: t('subscribers.import'), exact: true }).focus()
  await page.keyboard.press('Enter')
  expect((await request).postDataJSON()).toEqual({
    email: row.email,
    role: '',
    language: 'en',
    channels: ['email'],
    window_ids: []
  })
  await expect(
    page
      .locator('main')
      .getByRole('status')
      .filter({ hasText: t('subscribers.import_result_one') })
  ).toBeVisible()
})

test('SET-7 subscriber removal requires exact typed email and permits Undo before the deferred DELETE', async ({
  page
}) => subscriberRemoval(page))

test('subscriber pagination uses the returned cursor and preserves earlier consent records', async ({ page }) => {
  await setupProject(page)
  await page.route('**/v1/projects/project-id/subscribers*', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    await route.fulfill({
      json: {
        data: [cursor ? { ...row, id: 'next-id', email: 'next@example.test' } : row],
        next_cursor: cursor ? null : 'next-cursor'
      }
    })
  })
  await page.goto(projectPath)
  await page.getByRole('button', { name: t('subscribers.next') }).click()
  // Pages replace each other, so at most 50 rows are ever rendered; the earlier page comes back from memory.
  await expect(page.getByRole('table')).toContainText('next@example.test')
  await expect(page.getByRole('table')).not.toContainText(row.email)
  // The last page draws no Next: a control that cannot go anywhere is not offered.
  await expect(page.getByRole('button', { name: t('subscribers.next') })).toHaveCount(0)
  await page.getByRole('button', { name: t('subscribers.previous') }).click()
  await expect(page.getByRole('table')).toContainText(row.email)
  await page.getByRole('table').getByRole('button', { name: row.email, exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    t('subscribers.consent_detail', { form: 'subscribe', version: '2026-11-06', language: t('subscribe.english') })
  )
})

test('empty subscriber data says there are none, with the next action', async ({ page }) => {
  await setupProject(page)
  await stubApi(
    page,
    'getSubscriberCounts',
    { ...counts, total: 0, confirmed: 0, by_window: [], by_channel: [] },
    { registry }
  )
  await stubApi(page, 'listSubscribers', { data: [], next_cursor: null }, { registry })
  await page.goto(projectPath)
  await expect(page.getByText(t('subscribers.empty'))).toBeVisible()
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(0)
})

test('subscriber read failure names the failed read and its answer without invented rows', async ({ page }) => {
  await setupProject(page)
  await failOperation(page, '**/v1/projects/project-id/subscribers*', 'GET', 403, 'permission-denied')
  await page.goto(projectPath)
  await expect(page.locator('main [data-source-error="403"]')).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('subscriber page denies other organisations, lower roles and signed-out requests', async ({ page }) => {
  for (const role of ['editor', 'viewer', 'guest'] as const) {
    await asPage(page, principal(role))
    await page.goto(projectPath)
    await expect(page.getByRole('heading', { name: /^Page not found/ })).toBeVisible()
  }
  await asPage(page, { ...principal(), orgId: 'another-org' })
  await page.goto(projectPath)
  await expect(page.getByRole('heading', { name: /^Page not found/ })).toBeVisible()
  await page.context().addCookies([
    {
      name: 'skyclause_test_principal',
      value: 'null',
      url: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      httpOnly: true,
      sameSite: 'Lax'
    }
  ])
  await page.goto(projectPath)
  await expect(page.getByRole('heading', { name: /^Page not found/ })).toBeVisible()
})

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`subscribers table is axe-clean and unclipped in ${theme}`, async ({ page, baseURL, expectAxeClean }) => {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        }),
        url: baseURL!
      }
    ])
    await page.setViewportSize({ width: 375, height: 812 })
    await setupProject(page)
    await page.goto(projectPath)
    await expect(page.getByRole('table')).toContainText(row.email)
    await expectAxeClean(page)
    await expectUnclippedText(page)
  })
}
