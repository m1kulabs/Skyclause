import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { asPage } from '../harness/as-page'
import { stubApi } from '../harness/stub-api'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { wilson } from '../../features/probation/model'
import { probationOperations } from '../../features/probation/operations'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import {
  frameFixture,
  framesBase,
  labellerOne,
  labellerTwo,
  member,
  members,
  orgId,
  prepare,
  probationUrl,
  projectId,
  sourceId,
  statusFixture,
  stubNextSequence
} from './setup'
import { t } from './messages'

/** Alt text and composed date/time lines gain extra `~~~` per nested `t()` in pseudo mode, so match their letter skeleton. */
const frameAltRe = /Masked camera frame, .* MYT/
const verdictPassedRe = /Passed probation on \d+ \w+ \d+/
/** The failed-read states are the shared SourceError: its title names what failed, its detail names the status. */
const nextFrameErrorRe = /Couldn.t read the next frame/
const frameErrorRe = /Couldn.t read the frame captured at .* MYT/

/** Tab from the current focus until the matcher is focused; every action stays keyboard-driven. */
async function tabUntilFocused(page: Page, target: string) {
  const button = page.getByRole('button', { name: target, exact: true })
  for (let i = 0; i < 40; i++) {
    if (await button.evaluate((el) => el === document.activeElement)) return button
    await page.keyboard.press('Tab')
  }
  throw new Error(`never tabbed to ${target}`)
}

async function expectFocusVisible(page: Page) {
  expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false)).toBe(true)
}

async function stubPutStatus(page: Page, status: unknown) {
  const posts: unknown[] = []
  await page.route('**/api/sources/*/probation', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue()
      return
    }
    expect(route.request().headers()['skyclause-organization']).toBe(orgId)
    posts.push(route.request().postDataJSON())
    await route.fulfill({ json: probationOperations.setSourceProbation.response.parse(status) })
  })
  return posts
}

async function pickMember(page: Page, name: string) {
  const chips = page.locator('[data-slot="combobox-chip"]')
  const before = await chips.count()
  const box = page.getByRole('combobox', { name: t('picker_search'), exact: true })
  await box.fill(name)
  // No auto-highlight: ArrowDown highlights the single match, Enter selects it.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(chips).toHaveCount(before + 1)
}

test('Admin saves two labellers, and a third is refused inline', async ({ page }) => {
  await prepare(page)
  const puts = await stubPutStatus(page, statusFixture())
  await page.goto(probationUrl('progress'))
  await pickMember(page, 'Amina')
  await pickMember(page, 'Bala')
  const chips = page.locator('[data-slot="combobox-chip"]')
  await page.getByRole('combobox', { name: t('picker_search'), exact: true }).fill('Citra')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByText(t('picker_limit'), { exact: true })).toBeVisible()
  await expect(chips).toHaveCount(2)
  await page.getByRole('button', { name: t('picker_save'), exact: true }).click()
  await expect(page.getByText(t('picker_saved'), { exact: true })).toBeVisible()
  await expect(
    page.getByText(t('picker_current', { names: 'Amina Labeller, Bala Labeller' }), { exact: true })
  ).toBeVisible()
  expect(puts).toEqual([{ labeller_ids: [labellerOne, labellerTwo] }])
  await expectZonedTimes(page)
})

test('labeller selections support keyboard removal and Escape', async ({ page }) => {
  await prepare(page)
  await page.goto(probationUrl('progress'))
  await pickMember(page, 'Amina')
  await pickMember(page, 'Bala')
  const chips = page.locator('[data-slot="combobox-chip"]')
  const box = page.getByRole('combobox', { name: t('picker_search'), exact: true })
  await box.press('Backspace')
  await expect(chips).toHaveCount(1)
  await pickMember(page, 'Bala')
  await box.fill('Citra')
  await box.press('Escape')
  await expect(box).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(chips).toHaveText(['Amina Labeller', 'Bala Labeller'])
  await expect(box).toBeFocused()
})

test('a Viewer sees no picker; a labeller sees the pair read-only', async ({ page }) => {
  await prepare(page, { ...member, role: 'viewer' })
  await page.goto(probationUrl('progress'))
  await expect(page.getByRole('heading', { name: t('title'), exact: true })).toBeVisible()
  await expect(page.getByText(t('picker_heading'), { exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)

  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  await stubNextSequence(page, [frameFixture('frame-1')])
  await stubApi(
    page,
    'createProbationLabel',
    probationOperations.createProbationLabel.response.parse({
      id: 'label-1',
      labeller_id: labellerOne,
      frame_reading_id: 'frame-1',
      label: 'landmark_visible',
      created_at: '2026-11-06T02:00:00Z',
      probation: statusFixture({ n: 1, obscured_frames: 0, agreement: 1 })
    }),
    { registry: probationOperations }
  )
  await page.goto(probationUrl('label'))
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  await (await tabUntilFocused(page, t('option_visible'))).press('Enter')
  await expect(page.getByText(t('empty_label'), { exact: true })).toBeVisible()
  await page.getByRole('link', { name: t('view_progress'), exact: true }).click()
  await expect(
    page.getByText(t('picker_current', { names: 'Amina Labeller, Bala Labeller' }), { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: t('picker_save'), exact: true })).toHaveCount(0)
})

// #647: the page reads the role from the URL organisation's membership. Through a real session (signInAs, no test
// principal) the role was always null, so Owners and Admins got the read-only picker.
for (const role of ['owner', 'admin'] as const) {
  test(`a real ${role} session names labellers with the editable picker`, async ({ page }) => {
    const org = await makeOrg()
    await signInAs(page, role, org)
    await stubApi(page, 'listMembers', { data: members, next_cursor: null }, { registry: probationOperations })
    await page.goto(`/${org.slug}/${projectId}/signals/probation/${sourceId}?view=progress`)
    await expect(page.getByRole('heading', { name: t('title'), exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: t('picker_search'), exact: true })).toBeVisible()
  })
}

test('a labeller labels three frames by keyboard with visible focus and no shortcuts', async ({ page }) => {
  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  await stubNextSequence(page, [frameFixture('frame-1'), frameFixture('frame-2'), frameFixture('frame-3')])
  const posts: unknown[] = []
  await page.route('**/api/sources/*/probation/labels', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['skyclause-organization']).toBe(orgId)
    expect(route.request().headers()['idempotency-key']).toBeTruthy()
    const body = route.request().postDataJSON() as { frame_reading_id: string; label: string }
    posts.push(body)
    // Hold the post briefly so "Saving…" is observable on every vote.
    await new Promise((resolve) => setTimeout(resolve, 200))
    await route.fulfill({
      status: 201,
      json: probationOperations.createProbationLabel.response.parse({
        id: `label-${posts.length}`,
        labeller_id: labellerOne,
        frame_reading_id: body.frame_reading_id,
        label: body.label,
        created_at: '2026-11-06T02:00:00Z',
        probation: statusFixture({ n: posts.length, obscured_frames: 0, agreement: 1 })
      })
    })
  })
  let images = 0
  page.on('request', (request) => {
    if (request.url().startsWith(framesBase)) images += 1
  })
  await page.goto(probationUrl('label'))
  // A letter key is not a shortcut: nothing posts.
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  await (await tabUntilFocused(page, t('option_visible'))).press('v')
  expect(posts).toHaveLength(0)

  const heading = page.getByRole('heading', { name: t('label_heading'), exact: true })
  for (let i = 0; i < 3; i++) {
    await expect(page.getByAltText(frameAltRe)).toBeVisible()
    // The second frame onward arrives with focus already on its heading.
    if (i > 0) await expect(heading).toBeFocused()
    const vote = await tabUntilFocused(page, t('option_visible'))
    await expectFocusVisible(page)
    await vote.press('Enter')
    await expect(page.getByRole('button', { name: t('saving'), exact: true })).toBeVisible()
  }
  expect(posts).toEqual([
    { frame_reading_id: 'frame-1', label: 'landmark_visible' },
    { frame_reading_id: 'frame-2', label: 'landmark_visible' },
    { frame_reading_id: 'frame-3', label: 'landmark_visible' }
  ])
  expect(images).toBeGreaterThanOrEqual(3)
  await expect(page.getByText(t('empty_label'), { exact: true })).toBeVisible()
  await expectZonedTimes(page)
})

test('labelling is blind: no other label, phone flag or figure in the DOM', async ({ page }) => {
  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  await stubNextSequence(page, [frameFixture('frame-1')])
  await stubApi(
    page,
    'createProbationLabel',
    probationOperations.createProbationLabel.response.parse({
      id: 'label-1',
      labeller_id: labellerOne,
      frame_reading_id: 'frame-1',
      label: 'obscured',
      created_at: '2026-11-06T02:00:00Z',
      probation: statusFixture({ n: 1, obscured_frames: 1, agreement: 0 })
    }),
    { registry: probationOperations }
  )
  await page.goto(probationUrl('label'))
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  const html = await page.content()
  expect(html).not.toContain('phone_obscured')
  expect(html).not.toContain('<figure')
  expect(html).not.toContain('figcaption')
  expect(html).not.toContain('landmark_visible')
  expect(html).not.toContain('"obscured"')
  // The frame keeps its true aspect: a 640x360 source renders 16:9.
  const box = await page.getByAltText(frameAltRe).boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1)
})

test('a labeller records the agreed answer, and progress counts it down', async ({ page }) => {
  await prepare(page, { ...member, role: 'editor', accountId: labellerTwo })
  await stubNextSequence(page, [frameFixture('frame-x')])
  const posts: unknown[] = []
  await page.route('**/api/sources/*/probation/labels', async (route) => {
    const body = route.request().postDataJSON() as { frame_reading_id: string; label: string }
    posts.push(body)
    await route.fulfill({
      status: 201,
      json: probationOperations.createProbationLabel.response.parse({
        id: `label-${posts.length}`,
        labeller_id: labellerTwo,
        frame_reading_id: body.frame_reading_id,
        label: body.label,
        created_at: '2026-11-06T02:00:00Z',
        probation: statusFixture({ n: 1 + posts.length, obscured_frames: 1, agreement: 0.5 })
      })
    })
  })
  await page.goto(probationUrl('label'))
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  await (await tabUntilFocused(page, t('option_visible'))).press('Enter')
  await expect(page.getByText(t('empty_label'), { exact: true })).toBeVisible()
  // A fresh resolve queue: every entry into the view fetches the next frame.
  await stubNextSequence(page, [frameFixture('dispute-1'), frameFixture('dispute-1')])
  await page.getByRole('link', { name: t('view_resolve'), exact: true }).click()
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  await page.getByRole('link', { name: t('view_progress'), exact: true }).click()
  await expect(page.locator('[data-probation-disagreements="1"]')).toBeVisible()
  await page.getByRole('link', { name: t('view_resolve'), exact: true }).click()
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  await (await tabUntilFocused(page, t('option_obscured'))).press('Enter')
  expect(posts).toEqual([
    { frame_reading_id: 'frame-x', label: 'landmark_visible' },
    { frame_reading_id: 'dispute-1', label: 'obscured' }
  ])
  await expect(page.getByText(t('empty_resolve'), { exact: true })).toBeVisible()
  await page.getByRole('link', { name: t('view_progress'), exact: true }).click()
  await expect(page.locator('[data-probation-disagreements="0"]')).toBeVisible()
})

test('reloading ?view=resolve restores the view', async ({ page }) => {
  await prepare(page)
  await stubNextSequence(page, [])
  await page.goto(probationUrl('resolve'))
  await expect(page.getByRole('heading', { name: t('resolve_heading'), exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: t('view_resolve'), exact: true })).toHaveAttribute('aria-current', 'page')
  await page.reload()
  await expect(page.getByRole('heading', { name: t('resolve_heading'), exact: true })).toBeVisible()
  await expect(page).toHaveURL(/view=resolve/)
  await page.goto(probationUrl('label'))
  await expect(page.getByRole('heading', { name: t('label_heading'), exact: true })).toBeVisible()
  // Without ?view= the page labels.
  await page.goto(probationUrl('label').replace('?view=label', ''))
  await expect(page.getByRole('heading', { name: t('label_heading'), exact: true })).toBeVisible()
})

test('a non-labeller gets the not-a-labeller state and no frame loads', async ({ page }) => {
  await prepare(page, { ...member, role: 'editor', accountId: 'account-stranger' })
  let images = 0
  page.on('request', (request) => {
    if (request.url().startsWith(framesBase)) images += 1
  })
  await page.route('**/api/sources/*/probation/next*', (route) =>
    route.fulfill({ status: 403, json: { title: 'Forbidden', status: 403 } })
  )
  await page.goto(probationUrl('label'))
  await expect(page.getByText(t('not_labeller'), { exact: true })).toBeVisible()
  await expect(page.locator('img')).toHaveCount(0)
  expect(images).toBe(0)
})

test('SIG-9 shows n, obscured, agreement with its interval and the verdict', async ({ page }) => {
  await prepare(page)
  const puts = await stubPutStatus(page, statusFixture({ n: 96, obscured_frames: 9, agreement: 0.93, probation: true }))
  await page.goto(probationUrl('progress'))
  await pickMember(page, 'Amina')
  await pickMember(page, 'Bala')
  await page.getByRole('button', { name: t('picker_save'), exact: true }).click()
  const interval = wilson(Math.round(0.93 * 96), 96)!
  const agreement = page.locator('[data-probation-agreement]')
  await expect(agreement).toContainText('0.93')
  await expect(agreement).toContainText(t('measure_needed', { needed: '0.90' }))
  await expect(agreement).toContainText(
    t('progress_interval', { n: '96', low: String(interval.lo), high: String(interval.hi) })
  )
  await expect(agreement.getByText(t('verdict_watching'), { exact: true })).toBeVisible()
  await expect(page.locator('[data-probation-frames="96"]')).toContainText(
    t('measure_of', { value: '96', target: '100' })
  )
  await expect(page.locator('[data-probation-obscured="9"]')).toContainText(
    t('measure_of', { value: '9', target: '10' })
  )
  await expect(page.locator('[data-probation-disagreements="0"]')).toBeVisible()
  expect(puts).toHaveLength(1)

  await stubPutStatus(page, statusFixture({ n: 104, obscured_frames: 12, agreement: 0.95, probation: false }))
  await page.getByRole('button', { name: t('picker_save'), exact: true }).click()
  await expect(page.getByText(verdictPassedRe)).toBeVisible()
  const passed = wilson(99, 104)!
  await expect(agreement).toContainText('0.95')
  await expect(agreement).toContainText(
    t('progress_interval', { n: '104', low: String(passed.lo), high: String(passed.hi) })
  )
  await expect(page.locator('[data-probation-frames="104"]')).toContainText(
    t('measure_of', { value: '104', target: '100' })
  )
})

test('empty and failed states print n=0 and offer the next action', async ({ page }) => {
  await prepare(page)
  await stubNextSequence(page, [])
  await page.goto(probationUrl('label'))
  await expect(page.getByText(t('empty_label'), { exact: true })).toBeVisible()
  await page.goto(probationUrl('resolve'))
  await expect(page.getByText(t('empty_resolve'), { exact: true })).toBeVisible()
  await page.goto(probationUrl('progress'))
  await expect(page.getByText(t('progress_zero'), { exact: true })).toBeVisible()
  await page
    .locator('.probation-progress')
    .getByRole('link', { name: t('progress_cta'), exact: true })
    .click()
  await expect(page.getByRole('heading', { name: t('label_heading'), exact: true })).toBeVisible()

  await page.route('**/api/sources/*/probation/next*', (route) =>
    route.fulfill({ status: 500, json: { title: 'Server error', status: 500 } })
  )
  await page.goto(probationUrl('label'))
  await expect(page.getByText(nextFrameErrorRe)).toBeVisible()
  await expect(page.locator('[data-source-error="500"]')).toBeVisible()
  await stubNextSequence(page, [frameFixture('frame-9')])
  await page
    .locator('.probation-failure')
    .getByRole('button', { name: t('retry'), exact: true })
    .click()
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
})

test('a failed frame names its time and status with Retry', async ({ page }) => {
  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  await stubNextSequence(page, [frameFixture('frame-1')])
  let failImage = true
  await page.route(`${framesBase}*.svg`, (route) => {
    if (failImage) return route.fulfill({ status: 500 })
    return route.fallback()
  })
  await page.goto(probationUrl('label'))
  await expect(page.getByText(frameErrorRe)).toBeVisible()
  await expect(page.locator('[data-source-error="500"]')).toBeVisible()
  await expect(page.locator('img')).toHaveCount(0)
  failImage = false
  await page
    .locator('.probation-failure')
    .getByRole('button', { name: t('retry'), exact: true })
    .click()
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
})

test('a failed label keeps the frame and retries the same post', async ({ page }) => {
  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  await stubNextSequence(page, [frameFixture('frame-1')])
  const posts: unknown[] = []
  let fail = true
  await page.route('**/api/sources/*/probation/labels', async (route) => {
    posts.push(route.request().postDataJSON())
    if (fail) return route.fulfill({ status: 500, json: { title: 'Server error', status: 500 } })
    const body = route.request().postDataJSON() as { frame_reading_id: string; label: string }
    return route.fulfill({
      status: 201,
      json: probationOperations.createProbationLabel.response.parse({
        id: 'label-1',
        labeller_id: labellerOne,
        frame_reading_id: body.frame_reading_id,
        label: body.label,
        created_at: '2026-11-06T02:00:00Z',
        probation: statusFixture({ n: 1, obscured_frames: 1, agreement: 0 })
      })
    })
  })
  await page.goto(probationUrl('label'))
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  await (await tabUntilFocused(page, t('option_obscured'))).press('Enter')
  await expect(page.getByText(t('label_error'), { exact: true })).toBeVisible()
  fail = false
  await page
    .locator('.probation-failure')
    .getByRole('button', { name: t('retry'), exact: true })
    .click()
  expect(posts).toEqual([
    { frame_reading_id: 'frame-1', label: 'obscured' },
    { frame_reading_id: 'frame-1', label: 'obscured' }
  ])
  await expect(page.getByText(t('empty_label'), { exact: true })).toBeVisible()
})

test('NFR-15 shows empty states, never fallback data, until APIs answer', async ({ page }) => {
  await prepare(page)
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/(sources|orgs)\/.*$/, async (route) => {
    await hold
    await route.fallback()
  })
  await page.goto(probationUrl('progress'))
  await expect(page.getByText(t('progress_zero'), { exact: true })).toBeVisible()
  await page.goto(probationUrl('label'))
  await expect(page.getByText(t('loading_frame'), { exact: true })).toBeVisible()
  await expect(page.locator('.probation-labeller button')).toHaveCount(0)
  await expect(page.getByAltText(frameAltRe)).toHaveCount(0)
  release()
})

for (const guest of [false, true]) {
  // A guest converts at sign-up; a visitor with no credential at all signs in first and comes back.
  test(`${guest ? 'guest goes to sign-up' : 'signed-out visitor goes to sign-in and back'}`, async ({ page }) => {
    const base = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
    if (guest) await asPage(page, { ...member, isGuest: true })
    else await page.context().addCookies([{ name: 'skyclause_test_principal', value: 'null', url: base }])
    await page.goto(probationUrl('label'))
    await expect(page).toHaveURL(guest ? /\/sign-up$/ : /\/sign-in\?next=%2F[^&]+probation/)
    await expect(page.locator('.probation-page')).toHaveCount(0)
  })
}

test('touch targets are 44 px', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  await stubNextSequence(page, [frameFixture('frame-1')])
  await page.goto(probationUrl('label'))
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  for (const name of [t('option_visible'), t('option_obscured')]) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await context.close()
})

test('frame answers have full contrast as soon as loading enables them', async ({ page, baseURL, expectAxeClean }) => {
  await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
  const context = page.context()
  await context.addCookies([
    {
      name: 'skyclause-test-appearance',
      value: JSON.stringify({ theme: 'light', contrast: 'standard' }),
      url: baseURL!
    }
  ])
  await page.setViewportSize({ width: 320, height: 812 })
  await stubNextSequence(page, [frameFixture('frame-1')])
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`${framesBase}*.svg`, async (route) => {
    await held
    await route.fallback()
  })
  await page.goto(probationUrl('label'))
  const answers = page.locator('.probation-actions > button')
  await expect(answers.first()).toBeDisabled()
  const enabledOpacities = page.evaluate(() => {
    // Sample the first enabled render, before a fade can conceal low-contrast actionable text.
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.probation-actions > button')]
    buttons.forEach((button) => getComputedStyle(button).opacity)
    return new Promise<number[]>((resolve) => {
      const samples: number[] = []
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const button = record.target as HTMLButtonElement
          if (!button.disabled) samples.push(Number(getComputedStyle(button).opacity))
        }
        if (samples.length === buttons.length) {
          observer.disconnect()
          resolve(samples)
        }
      })
      buttons.forEach((button) => observer.observe(button, { attributes: true, attributeFilter: ['disabled'] }))
    })
  })
  // The evaluation is queued before this round trip, so its observer is installed before release.
  await answers.first().isDisabled()
  release()
  await expect(page.getByAltText(frameAltRe)).toBeVisible()
  expect(await enabledOpacities).toEqual([1, 1])
  await expectAxeClean(page)
})

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`probation is axe-clean and unclipped in ${theme}, at 320 px and 200% text`, async ({
    page,
    expectAxeClean,
    baseURL
  }, testInfo) => {
    await prepare(page, { ...member, role: 'editor', accountId: labellerOne })
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
    await stubNextSequence(page, [frameFixture('frame-1')], frameFixture('frame-1'))
    await stubApi(
      page,
      'createProbationLabel',
      probationOperations.createProbationLabel.response.parse({
        id: 'label-1',
        labeller_id: labellerOne,
        frame_reading_id: 'frame-1',
        label: 'landmark_visible',
        created_at: '2026-11-06T02:00:00Z',
        probation: statusFixture({ n: 96, obscured_frames: 9, agreement: 0.93 })
      }),
      { registry: probationOperations }
    )
    for (const view of ['label', 'resolve', 'progress']) {
      for (const width of [1280, 375, 320]) {
        await page.setViewportSize({ width, height: 812 })
        await page.goto(probationUrl(view))
        if (view !== 'progress') await expect(page.getByAltText(frameAltRe)).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await expectAxeClean(page)
        await expectUnclippedText(page)
        await expectZonedTimes(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
    await page.locator('html').evaluate((root) => {
      root.style.fontSize = '200%'
    })
    await page.goto(probationUrl('progress'))
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expectAxeClean(page)
    await page.screenshot({ path: testInfo.outputPath(`probation-${theme}.png`), fullPage: true })
  })
}
