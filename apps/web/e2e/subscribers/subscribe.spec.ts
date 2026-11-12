import { test, expect } from '../fixtures'
import { stubApi } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { t } from './messages'
import { subscription, subscriber, registry, failOperation } from './data'

test('NTC-8 join requires PDPA consent and requests email confirmation by keyboard', async ({ page }) => {
  await stubApi(page, 'getSubscription', subscription, { registry })
  await stubApi(page, 'createSubscription', { ...subscriber, confirmed_at: null }, { registry })
  await page.goto('/subscribe/test-token')
  const submit = page.getByRole('button', { name: t('subscribe.subscribe'), exact: true })
  // The button stays pressable and names the missing consent instead of greying out with no reason.
  await expect(submit).toBeEnabled()
  await page.getByLabel(t('subscribe.email'), { exact: true }).fill(subscriber.email)
  await page.getByLabel(t('subscribe.role'), { exact: true }).fill(subscriber.role)
  await page.getByRole('combobox').selectOption('ms')
  await expect(page.locator('option[value=ms]')).toHaveText(t('subscribe.malay'))
  await page.getByRole('checkbox', { name: t('subscribe.consent') }).focus()
  await page.keyboard.press('Space')
  const request = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/api/subscribe/')
  )
  await page.keyboard.press('Tab')
  await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')
  expect((await request).postDataJSON()).toMatchObject({
    email: subscriber.email,
    role: subscriber.role,
    consent: true,
    notice_version: '2026-11-06',
    language: 'ms'
  })
  await expect(page.locator('main').getByRole('status')).toHaveText(t('subscribe.check_email'))
  await expectZonedTimes(page)
})

test('NTC-14 exactly five preference fields autosave and announce each saved state', async ({ page }) => {
  await stubApi(page, 'getSubscription', { ...subscription, subscriber }, { registry })
  let current = { ...subscriber }
  const patches: unknown[] = []
  await page.route('**/api/subscribe/test-token', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    const patch = route.request().postDataJSON()
    patches.push(patch)
    current = { ...current, ...patch }
    registry.updateSubscription.response.parse(current)
    await route.fulfill({ json: current })
  })
  await page.goto('/subscribe/test-token')
  await expect(page.getByRole('combobox')).toBeVisible()
  expect(
    await page
      .locator('form [name]')
      .evaluateAll((elements) => [...new Set(elements.map((element) => element.getAttribute('name')))].sort())
  ).toEqual(['channels', 'email', 'language', 'role', 'window_ids'])
  const saved = async (field: string) =>
    expect(page.locator('main').getByRole('status')).toHaveText(
      t('subscribe.saved', { field: t(`subscribe.${field}`) })
    )
  await page.getByRole('combobox').selectOption('ms')
  await saved('language')
  for (const [field, value] of [
    ['email', 'updated@example.test'],
    ['role', 'Lecturer']
  ] as const) {
    await page.getByRole('textbox', { name: t(`subscribe.${field}`), exact: true }).fill(value)
    await page.keyboard.press('Tab')
    await saved(field)
  }
  await page.getByRole('checkbox', { name: /Test window/ }).uncheck()
  await saved('windows')
  await page.getByRole('checkbox', { name: t('subscribe.ics_channel'), exact: true }).check()
  await saved('channels')
  expect(patches).toEqual([
    { language: 'ms' },
    { email: 'updated@example.test' },
    { role: 'Lecturer' },
    { window_ids: [] },
    { channels: ['email', 'ics'] }
  ])
  await stubApi(page, 'unsubscribeSubscription', undefined, { registry })
  await page.getByRole('button', { name: t('subscribe.unsubscribe'), exact: true }).click()
  await expect(page.locator('main').getByRole('status')).toHaveText(t('subscribe.unsubscribed'))
  await expect(page.getByRole('link', { name: t('subscribe.data') })).toHaveAttribute(
    'href',
    '/subscribe/test-token/data'
  )
})

for (const preferences of [false, true]) {
  test(`unpublished notice blocks ${preferences ? 'preferences' : 'join'} with no form fallback`, async ({ page }) => {
    await stubApi(
      page,
      'getSubscription',
      { ...subscription, privacy_notice_version: null, subscriber: preferences ? subscriber : null },
      { registry }
    )
    await page.goto('/subscribe/test-token')
    await expect(page.locator('main').getByRole('alert')).toHaveText(t('subscribe.unpublished'))
    await expect(page.locator('form')).toHaveCount(0)
  })
}

test('consent write 503 replaces the form with privacy-notice-unpublished', async ({ page }) => {
  await stubApi(page, 'getSubscription', subscription, { registry })
  await failOperation(page, '**/api/subscribe/test-token', 'POST', 503, 'privacy-notice-unpublished')
  await page.goto('/subscribe/test-token')
  await page.getByLabel(t('subscribe.email'), { exact: true }).fill(subscriber.email)
  await page.getByLabel(t('subscribe.role'), { exact: true }).fill(subscriber.role)
  await page.getByRole('checkbox', { name: t('subscribe.consent') }).check()
  await page.getByRole('button', { name: t('subscribe.subscribe'), exact: true }).click()
  await expect(page.locator('main').getByRole('alert')).toHaveText(t('subscribe.unpublished'))
  await expect(page.locator('form')).toHaveCount(0)
})

test('failed subscription read shows the operation error and Retry', async ({ page }) => {
  await failOperation(page, '**/api/subscribe/test-token', 'GET', 410, 'token-expired')
  await page.goto('/subscribe/test-token')
  await expect(page.locator('main').getByRole('alert')).toHaveText(t('subscribe.link_expired'))
  await expect(page.locator('form')).toHaveCount(0)
  await expect(page.getByRole('button', { name: t('subscribe.retry') })).toBeVisible()
})

for (const kind of ['confirm', 'unsubscribe', 'reply', 'feedback'] as const) {
  test(`D25 ${kind} GET is safe and only keyboard submit writes`, async ({ page }) => {
    const writes: string[] = []
    page.on('request', (request) => {
      // Only operation calls count: the vitals beacon posts to /e on every load.
      if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(request.method())
    })
    await stubApi(page, 'confirmSubscription', subscriber, { registry })
    await stubApi(page, 'unsubscribeSubscription', undefined, { registry })
    await stubApi(
      page,
      'createSubscriberReply',
      { id: 'reply-id', window_id: 'window-id', reply: { kind: 'keep' }, at: '2026-11-06T00:00:00Z' },
      { registry }
    )
    await stubApi(page, 'createSubscriberFeedback', { window_id: 'window-id', answer: true, count: 1 }, { registry })
    await page.goto(`/subscribe/test-token/${kind}?answer=yes`)
    await expect(page.getByRole('heading', { name: t(`subscribe.${kind}_title`) })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(writes).toEqual([])
    const key = kind === 'reply' ? 'send_reply' : kind === 'feedback' ? 'send_feedback' : kind
    await page.getByRole('button', { name: t(`subscribe.${key}`), exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('main').getByRole('status')).toBeVisible()
    expect(writes).toEqual(['POST'])
    await expect(page.getByText(t('subscribe.safety'), { exact: true })).toBeVisible()
  })
}

for (const reply of ['keep', 'shift', 'shuttle'] as const) {
  test(`reply ${reply} posts only the contracted fields`, async ({ page }) => {
    const expected = reply === 'shift' ? { kind: 'shift', shift_to: '14:30' } : { kind: reply }
    await stubApi(
      page,
      'createSubscriberReply',
      { id: 'reply-id', window_id: 'window-id', reply: expected, at: '2026-11-06T00:00:00Z' },
      { registry }
    )
    await page.goto('/subscribe/test-token/reply')
    await page.getByRole('radio', { name: t(`subscribe.${reply}`), exact: true }).check()
    if (reply === 'shift') await page.getByLabel(t('subscribe.shift_to')).fill('14:30')
    const write = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/reply'))
    await page.getByRole('button', { name: t('subscribe.send_reply') }).click()
    expect((await write).postDataJSON()).toEqual(expected)
    await expect(page.locator('main').getByRole('status')).toHaveText(t('subscribe.reply_saved'))
  })
}

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`subscribe pages are axe-clean and unclipped in ${theme}`, async ({ page, baseURL, expectAxeClean }) => {
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
    await stubApi(page, 'getSubscription', subscription, { registry })
    await page.goto('/subscribe/test-token')
    await expect(page.getByRole('button', { name: t('subscribe.subscribe'), exact: true })).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
    await stubApi(page, 'getSubscription', { ...subscription, subscriber }, { registry })
    await page.goto('/subscribe/test-token')
    await expect(page.getByRole('combobox')).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
    await page.goto('/subscribe/test-token/confirm')
    await expect(page.getByRole('button', { name: t('subscribe.confirm'), exact: true })).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
    await stubApi(
      page,
      'createSubscriberReply',
      { id: 'reply-id', window_id: 'window-id', reply: { kind: 'keep' }, at: '2026-11-06T00:00:00Z' },
      { registry }
    )
    await page.goto('/subscribe/test-token/reply')
    await expect(page.getByRole('button', { name: t('subscribe.send_reply'), exact: true })).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
  })
}
