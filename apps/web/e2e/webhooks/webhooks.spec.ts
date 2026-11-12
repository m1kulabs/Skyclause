import { WEBHOOK_EVENT_TYPES } from '@skyclause/contracts'
import { test, expect } from '../fixtures'
import {
  setup,
  endpoint,
  verified,
  secret,
  delivery,
  event,
  project,
  t,
  stubAction,
  tabTo,
  openDeleteDialog
} from './fixtures'
import { stubApi, expectZonedTimes } from '../harness'
import { webhookOperations } from '../../features/webhooks/operations'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

const inspector = '/developers/webhooks'

test('registration uses exactly WEBHOOK_EVENT_TYPES and a labelled HTTPS URL', async ({ page }) => {
  await setup(page, [])
  await page.goto(inspector)
  await expect(page.getByRole('heading', { name: t('webhooks.title'), exact: true })).toBeVisible()
  const picker = page.locator('[data-webhook-events]')
  await expect(picker).toBeVisible()
  expect(
    await picker.locator('input[type=checkbox]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')))
  ).toEqual([...WEBHOOK_EVENT_TYPES])
  const url = page.getByRole('textbox', { name: t('webhooks.url'), exact: true })
  await expect(url).toHaveAttribute('type', 'url')
  await expect(url).toHaveAttribute('spellcheck', 'false')
  await expect(page.getByText(t('webhooks.empty_inspector'), { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /test event|synthetic/i })).toHaveCount(0)
})

test('settings replaces its placeholder inside the app shell', async ({ page }) => {
  await setup(page)
  await page.goto('/test-org/settings/webhooks')
  await expect(page.locator('[data-settings-panel] [data-unbuilt]')).toHaveCount(0)
  await expect(page.locator('#shell-content [data-settings-frame]')).toBeVisible()
  await expect(page.getByText(endpoint.url, { exact: true })).toHaveAttribute('translate', 'no')
  await expect(
    page.getByRole('link', { name: t('webhooks.open_named', { url: endpoint.url }), exact: true })
  ).toHaveAttribute('href', `${inspector}?webhook=${endpoint.id}`)
})

for (const role of ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest'] as const) {
  test(`role gate: ${role} gets only authorised controls`, async ({ page }) => {
    const privileged = role === 'owner' || role === 'admin'
    let reads = 0
    await setup(page, [], role, role === 'guest')
    page.on('request', (request) => {
      if (request.url().includes('/v1/webhooks')) reads++
    })
    await page.goto(inspector)
    if (privileged) await expect(page.getByRole('button', { name: t('webhooks.save'), exact: true })).toBeVisible()
    else {
      await expect(
        page.getByText(t(role === 'guest' ? 'webhooks.guest' : 'webhooks.member'), { exact: true })
      ).toBeVisible()
      await expect(page.locator('[data-webhooks] input, [data-webhooks] button')).toHaveCount(0)
      expect(reads).toBe(0)
    }
  })
}

test('signed-out inspector explains sign-up without making webhook requests', async ({ page }) => {
  await page.context().addCookies([
    {
      name: 'skyclause_test_principal',
      value: encodeURIComponent('null'),
      url: process.env.E2E_BASE_URL ?? 'http://localhost:3100'
    }
  ])
  await page.goto(inspector)
  await expect(page.getByText(t('webhooks.guest'), { exact: true })).toBeVisible()
  await expect(page.locator('[data-webhooks]')).toHaveCount(0)
})

async function fillRegistration(page: import('@playwright/test').Page) {
  await page.getByRole('textbox', { name: t('webhooks.url'), exact: true }).fill(endpoint.url)
  await page.getByRole('checkbox', { name: t('webhooks.event_type', { type: 'call.sent' }), exact: true }).check()
}

test('create shows secret only in memory; reload and revisit never restore it', async ({ page }) => {
  await setup(page, [])
  const requests = await stubAction(page, 'createWebhook', { ...endpoint, secret })
  await page.goto(inspector)
  await fillRegistration(page)
  await page.getByLabel(t('webhooks.chosen_projects'), { exact: true }).check()
  await page.getByRole('checkbox', { name: project.name, exact: true }).check()
  await page.getByRole('button', { name: t('webhooks.save'), exact: true }).click()
  await expect(page.locator('[data-webhook-secret]')).toHaveText(secret)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    org: 'test-org',
    body: { url: endpoint.url, events: ['call.sent'], project_ids: [project.id] }
  })
  expect(requests[0]?.idempotency).toBeTruthy()
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
        url: location.href,
        history: history.state
      })
    )
  ).not.toContain(secret)
  await expect(page).toHaveURL(/webhook=endpoint-1/)
  await page.reload()
  await expect(page.getByRole('button', { name: t('webhooks.save'), exact: true })).toBeVisible()
  await expect(page.locator('[data-webhook-secret]')).toHaveCount(0)
  await page.goto('/test-org/settings/webhooks')
  await page.goto(`${inspector}?webhook=${endpoint.id}`)
  await expect(page.getByRole('button', { name: t('webhooks.verify'), exact: true })).toBeVisible()
  await expect(page.locator('[data-webhook-secret]')).toHaveCount(0)
})

for (const status of ['pending', 'verified', 'failed', 'disabled'] as const) {
  test(`verification renders ${status} and Verify again calls the operation`, async ({ page }) => {
    const hook = {
      ...endpoint,
      status,
      verified_at: status === 'verified' ? verified.verified_at : null,
      disabled_at: status === 'disabled' ? '2026-11-06T01:00:00Z' : null
    }
    await setup(page, [hook])
    const requests = await stubAction(page, 'verifyWebhook', verified)
    await page.goto(`${inspector}?webhook=${endpoint.id}`)
    const text =
      status === 'verified'
        ? 'Verified 6 November 2026, 09:00 MYT'
        : status === 'disabled'
          ? 'Disabled 6 November 2026, 09:00 MYT after 24 hours of failures'
          : t(`webhooks.${status}`)
    await expect(page.getByText(text, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: t('webhooks.verify'), exact: true }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0]?.body).toBeNull()
    await expect(page.getByText('Verified 6 November 2026, 09:00 MYT', { exact: true })).toBeVisible()
  })
}

test('deliveries are table rows, retries together under the newest event, with evidence and URL selection kept', async ({
  page
}) => {
  await setup(page, [verified])
  const older = {
    ...delivery,
    id: 'older',
    event_id: 'older-event',
    request_body: { ...event, created_at: '2026-11-05T01:00:00Z' },
    attempted_at: '2026-11-05T01:00:00Z'
  }
  const retry = { ...delivery, id: 'delivery-2', attempt: 2, attempted_at: '2026-11-06T01:01:00Z' }
  await stubApi(
    page,
    'listWebhookDeliveries',
    { data: [older, delivery, retry], next_cursor: null },
    { registry: webhookOperations }
  )
  await page.goto(`${inspector}?webhook=${endpoint.id}&delivery=delivery-2`)
  const rows = page.locator('[data-webhook-log] tbody tr[data-delivery-id]')
  await expect(rows).toHaveCount(3)
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-delivery-id')))).toEqual([
    'delivery-2',
    'delivery-1',
    'older'
  ])
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-event-id')))).toEqual([
    event.id,
    event.id,
    'older-event'
  ])
  const row = page.locator('[data-delivery-id=delivery-2]')
  const attempt = page.locator('[data-delivery-detail=delivery-2]')
  await expect(row.getByRole('button', { expanded: true })).toBeVisible()
  for (const value of [
    'Skyclause-Webhook-Id',
    'Skyclause-Webhook-Timestamp',
    'Skyclause-Signature',
    'v1=test-signature',
    'Receiver unavailable',
    'receiver-unavailable',
    '6 November 2026, 09:05 MYT'
  ])
    await expect(attempt.getByText(value, { exact: true })).toBeVisible()
  await expect(attempt.locator('pre').first()).toHaveText(delivery.raw_request_body)
  // The record reads time first, then the event, the outcome as a mark with its word and the status code, then the duration.
  await expect(row.locator('time').first()).toHaveAttribute('datetime', retry.attempted_at)
  await expect(row).toContainText('503')
  await expect(row).toContainText(t('webhooks.failed_attempt'))
  await expect(row).toContainText('120 ms')
  // The event ID is cut to its last 8 characters; the control copies the whole of it.
  await expect(row.getByRole('button', { name: t('webhooks.copy_id') })).toBeVisible()
  await expect(row).not.toContainText(event.id)
  await expect(attempt.locator('dt[translate=no]')).toHaveCount(3)
  await page
    .locator('[data-delivery-id=delivery-1]')
    .getByRole('button', { name: /Details/ })
    .click()
  await expect(page).toHaveURL(/delivery=delivery-1/)
  await page.reload()
  await expect(page.locator('[data-delivery-id=delivery-1]').getByRole('button', { expanded: true })).toBeVisible()
  await expectZonedTimes(page)
})

test('redelivery calls newest-real-event operation and no-event-yet explains n=0', async ({ page }) => {
  await setup(page, [verified])
  const requests = await stubAction(
    page,
    'redeliverWebhook',
    { type: 'https://skyclause.m1ku.tech/problems/no-event-yet', title: 'No event', status: 409 },
    409
  )
  await page.goto(`${inspector}?webhook=${endpoint.id}`)
  await page.getByRole('button', { name: t('webhooks.redeliver'), exact: true }).click()
  expect(requests).toHaveLength(1)
  expect(requests[0]?.body).toBeNull()
  await expect(page.getByRole('status').filter({ hasText: t('webhooks.no_event') })).toBeVisible()
})

for (const problem of ['unsafe-url', 'validation-failed'] as const) {
  test(`${problem} stays beside the URL field and returns focus`, async ({ page }) => {
    await setup(page, [])
    await stubAction(
      page,
      'createWebhook',
      { type: `https://skyclause.m1ku.tech/problems/${problem}`, title: problem, status: 422 },
      422
    )
    await page.goto(inspector)
    await fillRegistration(page)
    await page.getByRole('button', { name: t('webhooks.save'), exact: true }).click()
    const url = page.getByRole('textbox', { name: t('webhooks.url'), exact: true })
    await expect(url).toBeFocused()
    await expect(url).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('[data-slot=field]').filter({ has: url }).getByRole('alert')).toContainText(
      t(problem === 'unsafe-url' ? 'webhooks.unsafe_url' : 'webhooks.validation_failed')
    )
  })
}

test('API wait renders loading only, then failure with retry; no fabricated endpoints', async ({ page }) => {
  await setup(page)
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/v1/webhooks?*', async (route) => {
    await waiting
    await route.fulfill({ status: 503, json: { title: 'Unavailable', status: 503 } })
  })
  await page.goto(inspector)
  await expect(page.getByText(t('webhooks.loading'), { exact: true })).toBeVisible()
  await expect(page.locator('[data-webhooks]')).toHaveCount(0)
  release()
  await expect(page.locator('[data-source-error="503"]')).toBeVisible()
  await expect(page.locator('[data-webhook-secret]')).toHaveCount(0)
})

test('keyboard register, copy, verify, redeliver, and typed delete', async ({ page }) => {
  await setup(page, [])
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await stubAction(page, 'createWebhook', { ...endpoint, secret })
  const verifies = await stubAction(page, 'verifyWebhook', verified)
  const redeliveries = await stubAction(page, 'redeliverWebhook', {
    dispatch_id: 'dispatch-2',
    event_id: event.id,
    state: 'queued'
  })
  await page.goto(inspector)
  await tabTo(page, page.getByRole('textbox', { name: t('webhooks.url'), exact: true }))
  await page.keyboard.type(endpoint.url)
  await tabTo(page, page.getByRole('checkbox', { name: t('webhooks.event_type', { type: 'call.sent' }), exact: true }))
  await page.keyboard.press('Space')
  await tabTo(page, page.getByRole('button', { name: t('webhooks.save'), exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-webhook-secret]')).toHaveText(secret)
  await tabTo(page, page.getByRole('button', { name: t('webhooks.copy'), exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.getByText(t('webhooks.copied'), { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secret)
  await tabTo(page, page.getByRole('button', { name: t('webhooks.verify'), exact: true }))
  await page.keyboard.press('Enter')
  await expect.poll(() => verifies.length).toBe(1)
  await tabTo(page, page.getByRole('button', { name: t('webhooks.redeliver'), exact: true }))
  await page.keyboard.press('Enter')
  await expect.poll(() => redeliveries.length).toBe(1)
  await expect(page.getByText(t('webhooks.redelivered'), { exact: true })).toBeVisible()
  await setup(page)
  const deletions = await stubAction(page, 'deleteWebhook', undefined)
  await page.goto('/test-org/settings/webhooks')
  await tabTo(page, page.getByRole('button', { name: t('webhooks.more_actions', { url: endpoint.url }), exact: true }))
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: t('webhooks.delete'), exact: true }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading')).toHaveText(t('webhooks.delete_title', { url: endpoint.url }))
  const confirm = dialog.getByRole('button', { name: t('webhooks.delete_confirm', { url: endpoint.url }), exact: true })
  await expect(confirm).toBeDisabled()
  await tabTo(page, dialog.getByRole('textbox'))
  await page.keyboard.type(endpoint.url)
  await tabTo(page, confirm)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  expect(deletions).toHaveLength(1)
  await expect(page.getByText(t('webhooks.empty'), { exact: true })).toBeVisible()
})

for (const theme of ['light', 'dark', 'high-contrast'] as const) {
  for (const route of [inspector, '/test-org/settings/webhooks']) {
    test(`webhooks axe and wrapping: ${route} ${theme}`, async ({ page, baseURL, expectAxeClean }, testInfo) => {
      await setup(page, [verified])
      await stubApi(
        page,
        'listWebhookDeliveries',
        { data: [delivery], next_cursor: null },
        { registry: webhookOperations }
      )
      await page.context().addCookies([
        {
          url: baseURL!,
          name: 'skyclause-test-appearance',
          value: JSON.stringify({
            theme: theme === 'light' ? 'light' : 'dark',
            contrast: theme === 'high-contrast' ? 'more' : 'standard'
          })
        }
      ])
      await page.goto(route)
      await expect(page.locator('[data-webhooks]')).toBeVisible()
      for (const width of [1440, 375, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate(() => document.fonts.ready)
        await expectAxeClean(page)
        await expectUnclippedText(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`webhooks-${width}.png`), fullPage: true })
      }
      if (route.includes('settings')) {
        await page.getByRole('button', { name: t('webhooks.add'), exact: true }).click()
        await expect(page.getByRole('form')).toBeVisible()
        await expectAxeClean(page)
        await openDeleteDialog(page)
        await expect(page.getByRole('alertdialog')).toBeVisible()
        await expectAxeClean(page)
        await expectUnclippedText(page)
      }
    })
  }
}
