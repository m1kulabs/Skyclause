import { pseudo } from '@skyclause/i18n'
import { test, expect } from '../fixtures'
import { stubApi, expectZonedTimes } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { bundleOperations } from '../../features/bundles/operations'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import {
  ids,
  path,
  prepare,
  open,
  callDouble,
  bundleDouble,
  gauge,
  rain60,
  problem,
  t,
  rawT,
  stubReads
} from './doubles'
import { seedReview } from './seed'

const approve = (page: import('@playwright/test').Page, count = 2) =>
  page
    .locator('.bundle-approval-bar')
    .getByRole('button', { name: t(count === 1 ? 'approve_one' : 'approve', { count }), exact: false })

test('CAL-13 GET-safe links, tabs and reads never submit decisions', async ({ page }) => {
  await prepare(page)
  const writes: string[] = []
  page.on('request', (request) => {
    if (/\/(api|v1)\//.test(request.url()) && request.method() !== 'GET') writes.push(request.url())
  })
  await open(page)
  await expect(page.locator('.bundle-detail')).toContainText('Replay · 2 November 2026')
  // P2-4: a bundle under review is a batch of calls, so the bar marks Calls current.
  const calls = process.env.I18N_PSEUDO === '1' ? pseudo('Calls') : 'Calls'
  await expect(page.locator('.shell-destinations [aria-current="page"]')).toHaveText(calls)
  for (const trigger of await page.locator('.bundle-detail [data-slot="trace-collapsible-trigger"]').all()) {
    await trigger.press('Enter')
  }
  const links = await page
    .locator('.bundle-detail a, .shell-destinations a')
    .evaluateAll((items) => items.map((item) => (item as HTMLAnchorElement).href))
  for (const href of links) {
    await page.route(href, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<main>Read-only link target</main>' })
    )
    await page.goto(href)
  }
  expect(writes).toEqual([])
})

test('CAL-13 reading order, CAL-4 choices and rejection count work by keyboard', async ({ page }) => {
  await prepare(page)
  await open(page)
  const detail = page.locator('.bundle-detail')
  const rows = page.locator('.bundle-call-list > li')
  await expect(rows.first()).toHaveAttribute('data-call-id', ids.second)
  await expect(approve(page)).toBeDisabled()
  const choice = detail.getByRole('radio', { name: t('agent', { mode: t('modes.commute_disruption') }) })
  await choice.focus()
  await page.keyboard.press('Space')
  await expect(approve(page)).toBeEnabled()
  const readingOrder = await detail.evaluate((element) => {
    const nodes = ['.bundle-disagreements', '.bundle-call-list', '.bundle-trace', '.bundle-approval-bar'].map(
      (selector) => element.querySelector(selector)!
    )
    return nodes.every(
      (node, index) => !index || !!(nodes[index - 1]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
    )
  })
  expect(readingOrder).toBe(true)
  await rows.last().focus()
  await page.keyboard.press('r')
  await expect(approve(page, 1)).toBeEnabled()
  const request = page.waitForRequest((request) => request.url().endsWith('/approve'))
  await approve(page, 1).press('Enter')
  expect((await request).postDataJSON()).toEqual({
    review_hash: 'test-review-one',
    reconfirm: false,
    calls: [
      { call_id: ids.first, action: 'reject' },
      { call_id: ids.second, action: 'approve', chosen: 'agent' }
    ]
  })
})

test('CAL-9 inputs-changed waits for a second confirm and uses the new review hash', async ({ page }) => {
  const bundle = await prepare(page, bundleDouble([callDouble()]))
  let writes = 0
  await page.route('**/api/bundles/*/approve', async (route) => {
    writes++
    if (writes === 1)
      await route.fulfill({
        status: 409,
        json: problem('inputs-changed', 409, {
          review_hash: 'test-review-two',
          changed_inputs: [{ call_id: ids.first, before: gauge, after: { ...gauge, value: 44.5, age_s: 60 } }],
          changed_verdicts: []
        })
      })
    else {
      expect(route.request().postDataJSON().review_hash).toBe('test-review-two')
      expect(route.request().postDataJSON().reconfirm).toBe(true)
      await route.fulfill({ json: { ...bundle, state: 'approved' } })
    }
  })
  await open(page)
  await approve(page, 1).press('Enter')
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(t('changed'))
  await expect(dialog).toContainText('39')
  await expect(dialog).toContainText('44.5')
  await expect(dialog).toContainText(t('age_minutes', { count: 5 }))
  await expect(dialog).toContainText(t('age_minutes', { count: 1 }))
  expect(writes).toBe(1)
  await dialog.getByRole('button', { name: t('confirm'), exact: true }).press('Enter')
  await expect(dialog).toBeHidden()
  expect(writes).toBe(2)
})

test('CAL-9 cancelling a re-check sends no second request', async ({ page }) => {
  await prepare(page, bundleDouble([callDouble()]))
  let writes = 0
  await page.route('**/api/bundles/*/approve', async (route) => {
    writes++
    await route.fulfill({
      status: 409,
      json: problem('inputs-changed', 409, { review_hash: 'test-review-two', changed_inputs: [] })
    })
  })
  await open(page)
  await approve(page, 1).press('Enter')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: t('cancel'), exact: true })
    .press('Enter')
  expect(writes).toBe(1)
  await expect(approve(page, 1)).toBeEnabled()
})

test('CAL-15 editing wording and recipients stays local and a template teaching line blocks approval', async ({
  page
}) => {
  const hybrid = callDouble(ids.first, {
    mode: 'hybrid_recommended',
    notices: [{ language: 'en', subject: 'Test hybrid draft', body: 'Teaching update in a test double' }]
  })
  await prepare(page, bundleDouble([hybrid]))
  let writes = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/approve')) writes++
  })
  await open(page)
  const row = page.locator('.bundle-call-list > li')
  await row.focus()
  await page.keyboard.press('e')
  const dialog = page.getByRole('dialog')
  const body = dialog.getByRole('textbox', { name: t('body', { language: t('language.en') }), exact: true })
  await body.fill('Teaching line removed in a test double')
  await dialog.getByRole('checkbox').last().uncheck()
  await dialog.getByRole('button', { name: t('save'), exact: true }).press('Enter')
  await expect(approve(page, 1)).toBeEnabled()
  await expect(row).not.toContainText(t('teaching_forbidden'))
  expect(writes).toBe(0)
  await row.focus()
  await page.keyboard.press('e')
  await body.fill(rawT('bundles.teaching'))
  await dialog.getByRole('button', { name: t('save'), exact: true }).press('Enter')
  await expect(approve(page, 1)).toBeDisabled()
  await expect(row).toContainText(t('teaching_forbidden'))
  expect(writes).toBe(0)
})

test('P2-5 approving says what was sent, moves focus there and links the ledger and the next bundle', async ({
  page
}) => {
  const waiting = bundleDouble([], { id: 'next-bundle', sla_due_at: '2026-11-02T07:20:00Z' })
  const bundle = await prepare(page, bundleDouble([callDouble()]), { list: [bundleDouble([callDouble()]), waiting] })
  await page.route('**/api/bundles/*/approve', (route) =>
    route.fulfill({
      json: {
        ...bundle,
        state: 'approved',
        calls: bundle.calls.map((call) => ({ ...call, state: 'sending', approved_at: '2026-11-02T07:08:00Z' }))
      }
    })
  )
  await open(page)
  await expect(page.locator('.bundle-approval-bar')).toContainText(
    t('consequence', { notices: t('notices_one'), recipients: t('recipient_count', { count: 2 }) })
  )
  await approve(page, 1).press('Enter')
  const summary = page.locator('[data-approved]')
  await expect(summary).toBeFocused()
  await expect(summary).toContainText(t('approved_at', { time: '15:08 MYT' }))
  await expect(summary).toContainText(
    t('approved_sending', { notices: t('notices_one'), recipients: t('recipient_count', { count: 2 }) })
  )
  await expect(summary.getByRole('link', { name: t('ledger_link') })).toHaveAttribute(
    'href',
    `/test-org/test-project/ledger?call=${ids.first}`
  )
  await expect(summary.getByRole('link', { name: t('next_bundle') })).toHaveAttribute(
    'href',
    '/test-org/test-project/bundles/next-bundle'
  )
})

test('unsaved wording asks before the edit dialog closes', async ({ page }) => {
  await prepare(page, bundleDouble([callDouble()]))
  await open(page)
  await page.locator('.bundle-call-list > li').focus()
  await page.keyboard.press('e')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: t('body', { language: t('language.en') }), exact: true }).fill('Edited')
  page.once('dialog', (question) => void question.dismiss())
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  page.once('dialog', (question) => void question.accept())
  await dialog.getByRole('button', { name: t('cancel'), exact: true }).press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.bundle-call-list > li')).toContainText(t('fate.included'))
})

test('LOC-4 and LOC-5 show recipient languages, Malay quotes and English fallback', async ({ page }) => {
  const call = callDouble()
  call.warnings = [
    {
      reading_id: 'test-warning',
      text: 'Amaran Ribut Petir',
      gloss: 'Thunderstorms Warning',
      valid_from: '2026-11-02T06:00:00Z',
      valid_to: '2026-11-02T08:00:00Z'
    }
  ]
  await prepare(page, bundleDouble([call]))
  await open(page)
  await expect(page.locator('.bundle-sends')).toContainText(t('language_group_one', { language: t('language.en') }))
  await expect(page.locator('blockquote[lang="ms"]')).toHaveText('Amaran Ribut Petir')
  await expect(page.locator('.bundle-notice[lang="ms"]')).toContainText('Ulangan')
  await expectZonedTimes(page)
  await prepare(page, bundleDouble([callDouble(ids.first, { notices: [call.notices[0]!] })]))
  await open(page)
  await expect(page.locator('.bundle-detail')).toContainText(t('english_only'))
})

for (const role of ['viewer', 'editor', 'approver'] as const) {
  test(`role gate hides approve for ${role === 'approver' ? 'guests' : role}`, async ({ page }) => {
    const guest = role === 'approver'
    await prepare(page, bundleDouble([callDouble()], { draft_only: guest }), { role, guest })
    await open(page)
    await expect(page.locator('.bundle-approval-bar')).toHaveCount(0)
    await expect(page.locator('.bundle-call-actions')).toHaveCount(0)
    if (guest) await expect(page.locator('.bundle-detail')).toContainText(t('draft_only'))
  })
}

test('all-Normal shows only the trace, five fresh inputs and no approval', async ({ page }) => {
  const inputs = Array.from({ length: 5 }, (_, index) => ({ ...gauge, name: index ? `test-input-${index}` : 'gauge' }))
  await prepare(
    page,
    bundleDouble([callDouble(ids.first, { mode: 'normal', inputs, fired: [], notices: [] })], { state: 'closed' })
  )
  await open(page)
  await expect(page.locator('.bundle-trace')).toContainText(t('normal', { count: 5 }))
  await expect(page.locator('.bundle-call-list')).toHaveCount(0)
  await expect(page.locator('.bundle-approval-bar')).toHaveCount(0)
  // Each input's age at drafting, in words.
  await expect(page.locator('.bundle-trace')).toContainText('gauge 5 min old')
})

test('No call names the failing input and since when; expired calls cannot be submitted', async ({ page }) => {
  await prepare(
    page,
    bundleDouble([
      callDouble(ids.first, {
        mode: null,
        no_call: ['gauge'],
        inputs: [{ ...gauge, state: 'error', value: null, since: '2026-11-02T06:40:00Z' }]
      }),
      callDouble(ids.second, { state: 'expired', expires_at: '2026-11-02T07:00:00Z' })
    ])
  )
  await open(page)
  await expect(page.locator('.bundle-call-list')).toContainText('14:40 MYT')
  await expect(page.locator('.bundle-call-list')).toContainText(t('expired'))
  await expect(page.locator('.bundle-call-actions')).toHaveCount(0)
  await expect(approve(page, 0)).toHaveCount(0)
})

test('CAL-7 superseded bundle links to its successor and has no approve', async ({ page }) => {
  await prepare(page, bundleDouble([callDouble()], { state: 'superseded', superseded_by: 'newer-bundle' }))
  await open(page)
  await expect(page.locator('.bundle-detail')).toContainText(t('superseded'))
  await expect(page.getByRole('link', { name: t('successor'), exact: true })).toHaveAttribute(
    'href',
    '/test-org/test-project/bundles/newer-bundle'
  )
  await expect(page.locator('.bundle-approval-bar')).toHaveCount(0)
})

for (const code of [
  'validation-failed',
  'malay-reader-required',
  'redraft-required',
  'call-expired',
  'bundle-superseded'
]) {
  test(`approval handles ${code} without an automatic second write`, async ({ page }) => {
    await prepare(page, bundleDouble([callDouble()]))
    let writes = 0
    await page.route('**/api/bundles/*/approve', async (route) => {
      writes++
      const status = code === 'reauth-required' ? 401 : ['call-expired', 'bundle-superseded'].includes(code) ? 409 : 422
      await route.fulfill({
        status,
        json: problem(code, status, { call_id: ids.first, superseded_by_call_id: ids.second })
      })
    })
    await open(page)
    await approve(page, 1).press('Enter')
    const expected = code === 'bundle-superseded' ? 'superseded' : code
    await expect(page.locator('.bundle-detail')).toContainText(t(expected))
    expect(writes).toBe(1)
    if (code === 'bundle-superseded')
      await expect(page.getByRole('link', { name: t('successor_call'), exact: true }).first()).toHaveAttribute(
        'href',
        `/test-org/test-project/calls/${ids.second}`
      )
  })
}

test('ACC-8 opens step-up before approval and retries with the same idempotency key', async ({ page }) => {
  const bundle = await prepare(page, bundleDouble([callDouble()]))
  let writes = 0
  let confirmed = false
  const keys: string[] = []
  await page.route('**/api/bundles/*/approve', async (route) => {
    writes += 1
    keys.push(route.request().headers()['idempotency-key'] ?? '')
    if (writes === 1) {
      await route.fulfill({ status: 401, json: problem('reauth-required', 401) })
    } else {
      await route.fulfill({ json: { ...bundle, state: 'approved' } })
    }
  })
  await page.route('**/api/auth/step-up', (route) =>
    route.fulfill({
      json: {
        fresh_until: confirmed ? '2099-01-01T00:00:00.000Z' : '2000-01-01T00:00:00.000Z',
        passkey: false
      }
    })
  )
  await page.route('**/api/auth/step-up/magic-link', (route) => route.fulfill({ json: { sent: true } }))
  await page.route('**/api/auth/step-up/magic-link/confirm', (route) => {
    confirmed = true
    return route.fulfill({ json: { confirmed: true } })
  })
  await open(page)
  await approve(page, 1).press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Confirm it’s you' })
  await expect(dialog).toBeVisible()
  expect(writes).toBe(1)
  await dialog.getByRole('button', { name: 'Send me a sign-in link' }).press('Enter')
  await expect(dialog.getByText('Check your email, then press Continue')).toBeVisible()
  await page.evaluate(async () => {
    await fetch('/api/auth/step-up/magic-link/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'test-link-token' })
    })
  })
  await dialog.getByRole('button', { name: 'Continue' }).press('Enter')

  await expect(dialog).toBeHidden()
  expect(writes).toBe(2)
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
})

test('shortcuts stay inside the focused call and honour the preference', async ({ page }) => {
  await prepare(page, bundleDouble([callDouble()]), { shortcuts: false })
  await open(page)
  await page.locator('.bundle-call-list > li').focus()
  await page.keyboard.press('r')
  await page.keyboard.press('e')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(approve(page, 1)).toBeEnabled()
  await expect(page.locator('.bundle-detail kbd')).toHaveCount(0)
  await prepare(page, bundleDouble([callDouble()]))
  await open(page)
  await page.locator('.bundle-detail h1').click()
  await page.keyboard.press('r')
  await page.keyboard.press('e')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(approve(page, 1)).toBeEnabled()
})

test('failed reads show an error and Retry, without substituting data', async ({ page }) => {
  await prepare(page)
  await page.route('**/v1/bundles/*', (route) => route.fulfill({ status: 503, json: problem('unavailable', 503) }))
  await page.goto(path)
  await expect(page.locator('.bundle-detail')).toContainText(t('load_error'))
  await expect(page.locator('.bundle-call-list')).toHaveCount(0)
  await page.unroute('**/v1/bundles/*')
  await stubApi(page, 'getBundle', bundleDouble(), { registry: bundleOperations })
  await page
    .locator('.bundle-detail')
    .getByRole('button', { name: t('retry'), exact: true })
    .press('Enter')
  await expect(page.locator('.bundle-call-list > li')).toHaveCount(2)
})

test('on a phone the open bundle shows first; Bundles shows the list and its open row returns', async ({ page }) => {
  await prepare(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  const list = page.getByRole('region', { name: t('region_list') })
  const item = page.getByRole('region', { name: t('region_item') })
  await expect(item).toBeVisible()
  await expect(list).toBeHidden()
  await expect(page.locator('.bundle-approval-bar')).toBeVisible()
  await item.getByRole('button', { name: t('back_to_list'), exact: true }).click()
  await expect(list).toBeVisible()
  await expect(item).toBeHidden()
  await expect(page.locator('.bundle-approval-bar')).toBeHidden()
  const current = list.locator('[aria-current="true"]')
  await expect(current).toHaveAttribute('href', path)
  await current.click()
  await expect(item).toBeVisible()
  await expect(page).toHaveURL(path)
})

test('NFR-15 measured replay is derived from the named committed capture', () => {
  expect(rain60).toBe(39)
})

for (const state of ['superseded', 'expired', 'approved'] as const) {
  test(`SSE ${state} updates in place, resumes its event ID and disables approval`, async ({ page }) => {
    const bundle = await prepare(page, bundleDouble([callDouble()]))
    let streams = 0
    const makeEvent = (type: string, eventState: string) => ({
      id: ids.run,
      type,
      created_at: '2026-11-02T07:08:00Z',
      org_id: ids.project,
      project_id: ids.project,
      data: {
        bundle_id: ids.bundle,
        pack: 'sky',
        state: eventState,
        call_ids: [ids.first],
        sla_due_at: bundle.sla_due_at,
        sending_call_ids: [ids.first],
        rejected_call_ids: []
      }
    })
    await page.route('**/v1/projects/*/bundles/stream', async (route) => {
      streams++
      expect(route.request().headers()['skyclause-organization']).toBe('test-org')
      if (streams > 1) expect(route.request().headers()['last-event-id']).toBe('7')
      const event =
        streams === 1 ? makeEvent('bundle.needs_review', 'needs_review') : makeEvent(`bundle.${state}`, state)
      await route.fulfill({ contentType: 'text/event-stream', body: `id: 7\ndata: ${JSON.stringify(event)}\n\n` })
    })
    await open(page)
    await expect.poll(() => streams).toBeGreaterThanOrEqual(2)
    await expect(page.locator('.bundle-approval-bar')).toHaveCount(0)
    await expect(page.locator('.bundle-detail')).toContainText(t(state))
  })
}

test('partial expiry excludes the expired call from the approval request', async ({ page }) => {
  await prepare(page, bundleDouble([callDouble(), callDouble(ids.second, { state: 'expired' })]))
  await open(page)
  const request = page.waitForRequest((request) => request.url().endsWith('/approve'))
  await approve(page, 1).press('Enter')
  expect((await request).postDataJSON().calls).toEqual([{ call_id: ids.first, action: 'approve' }])
})

test('expiry while reviewing disables approval without a write', async ({ page }) => {
  await prepare(page, bundleDouble([callDouble()]))
  await open(page)
  await expect(approve(page, 1)).toBeEnabled()
  await page.clock.setFixedTime(new Date('2026-11-02T07:46:00Z'))
  await expect(page.locator('.bundle-call-list')).toContainText(t('expired'))
  await expect(page.locator('.bundle-approval-bar .bundle-approve')).toBeDisabled()
})

test('worst-case recipient identifiers and multilingual window titles wrap at 320px', async ({ page }) => {
  const call = callDouble()
  call.window!.title =
    '吉隆坡社区教育与文化交流协会 · Persatuan Kebajikan dan Pendidikan Komuniti Wilayah Persekutuan Kuala Lumpur dan Selangor'
  call.recipients = ['operations-notifications-shared-organisation-production-read-access-key@example.test']
  call.deliveries = []
  await prepare(page, bundleDouble([call]))
  await page.setViewportSize({ width: 320, height: 900 })
  await open(page)
  await expectUnclippedText(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.locator('.bundle-call-list > li').focus()
  await page.keyboard.press('e')
  await expectUnclippedText(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

for (const theme of ['dark', 'light', 'high-contrast']) {
  test(`NFR-4/5 bundle, edit and re-check are axe-clean and unclipped in ${theme}`, async ({
    page,
    baseURL,
    expectAxeClean
  }, testInfo) => {
    await prepare(page, bundleDouble([callDouble()]))
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
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await open(page)
      await expectAxeClean(page)
      await expectUnclippedText(page)
      await expectZonedTimes(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.locator('.bundle-call-list > li').focus()
      await page.keyboard.press('e')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAxeClean(page)
      await expectUnclippedText(page)
      await page
        .getByRole('dialog')
        .getByRole('button', { name: t('cancel'), exact: true })
        .press('Enter')
      if (width < 641) {
        // P2-6: the phone approves as the desktop does, with the same words and no drawer.
        const button = approve(page, 1)
        await expect(button).toBeVisible()
        await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0)
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 375, height: 900 })
    await page.route('**/api/bundles/*/approve', (route) =>
      route.fulfill({
        status: 409,
        json: problem('inputs-changed', 409, {
          review_hash: 'test-review-two',
          changed_inputs: [{ call_id: ids.first, before: gauge, after: { ...gauge, value: 44.5, age_s: 60 } }]
        })
      })
    )
    await approve(page, 1).press('Enter')
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
  })
}

test('#372 a signed-in approver’s bundle arrives rendered by the server and hydrates without a mismatch', async ({
  browser,
  page
}) => {
  const org = await makeOrg()
  const review = await seedReview(org, bundleDouble([callDouble(ids.first, { expires_at: '2099-11-02T07:45:00Z' })]))
  const title = review.calls[0]!.window!.title
  // Without JavaScript, only the server's render can show the review.
  const scriptless = await browser.newContext({ javaScriptEnabled: false })
  const plain = await scriptless.newPage()
  await signInAs(plain, 'approver', org)
  await plain.goto(review.path)
  await expect(plain.locator('.bundle-call-list')).toContainText(title)
  await expect(plain.locator('.bundle-approval-bar')).toBeVisible()
  const rendered = await plain.locator('.bundle-call-list').innerText()
  await scriptless.close()

  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await signInAs(page, 'approver', org)
  await stubReads(page, review.bundle, review.calls, { org })
  // Pause the client refresh so the full call list can be compared at hydration, before #404 adds the readings.
  let releaseStrip!: () => void
  const stripPaused = new Promise<void>((resolve) => {
    releaseStrip = resolve
  })
  await page.route('**/v1/projects/*/strip', async (route) => {
    await stripPaused
    await route.fallback()
  })
  const stripRequested = page.waitForRequest('**/v1/projects/*/strip')
  try {
    await open(page, review.path)
    // This read starts in an effect, so hydration has committed while the refresh is still paused.
    await stripRequested
    expect(await page.locator('.bundle-call-list').innerText()).toBe(rendered)
  } finally {
    releaseStrip()
  }
  // The run and strip arrive in the client refresh; new readings must replace the server's empty strip. The run line
  // prints the ID's last eight characters and keeps the whole of it in its title.
  await expect(page.locator('.bundle-trace p[title]')).toHaveAttribute('title', review.bundle.run_id)
  await expect(page.locator('.bundle-trace')).toContainText(`…${review.bundle.run_id.slice(-8)}`)
  // The readings chart, under the window's capsule (whose glyph is an svg too).
  await expect(page.locator('.bundle-call-list figure svg[data-strip-plot]')).toBeVisible()
  await expect(page.locator('.bundle-call-list figure figcaption')).toContainText('50')
  expect(errors.filter((error) => /hydrat|Minified React error #(418|419|421|422|423|425)\b/i.test(error))).toEqual([])
})
