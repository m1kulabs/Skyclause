import { test, expect } from '../fixtures'
import { stubApi } from '../harness'
import { windowsOperations } from '../../features/windows/operations'
import { prepareWindows, replayWindow, route, windowId } from './replay'
import { w } from './messages'
import { controls } from './controls'

const NO_REPEAT = 'createWindow refuses a recurrence until a series is built'
const NO_EDIT = 'updateWindow has no handler: an existing window opens as its details'
const NO_CANCEL = 'cancelWindow has no handler: Cancel window is not offered'
const NO_IMPORT = 'createIcsFeed has no handler: the ICS import is not offered'

async function openForm(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  await page.goto(`${route}&declare=window`)
  await expect(page.getByRole('dialog').getByLabel(w('field_title'), { exact: true })).toBeVisible()
}

async function fillWindow(
  page: import('@playwright/test').Page,
  overrides: Partial<Record<'title' | 'date' | 'start' | 'end', string>> = {}
) {
  const values = { title: replayWindow.title, date: '2026-11-02', start: '15:30', end: '16:00', ...overrides }
  for (const [name, value] of Object.entries(values)) await page.locator(`[name="${name}"]`).fill(value)
}

for (const violation of [
  { name: 'end before start', values: { end: '15:00' }, field: 'end', error: 'end_before_start' },
  {
    name: 'longer than 12 hours',
    values: { date: '2026-11-03', start: '01:00', end: '14:00' },
    field: 'end',
    error: 'too_long'
  },
  { name: 'more than 90 days ahead', values: { date: '2027-02-01' }, field: 'date', error: 'too_far' },
  { name: 'past start points to Request evidence', values: { start: '08:00' }, field: 'start', error: 'past' }
]) {
  test(`WIN-8 ${violation.name} shows inline and focuses the field`, async ({ page }) => {
    await openForm(page)
    await fillWindow(page, violation.values)
    await page.getByRole('button', { name: w('save'), exact: true }).click()
    const field = page.locator(`[name="${violation.field}"]`)
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('aria-describedby', new RegExp(`window-${violation.field}-error$`))
    await expect(page.locator(`#window-${violation.field}-error`)).toContainText(w(violation.error))
    if (violation.error === 'past')
      await expect(page.getByRole('link', { name: w('evidence'), exact: true })).toHaveAttribute(
        'href',
        '/replay/bukit-jalil/ledger?tab=evidence'
      )
  })
}

test('WIN-8 saving is announced while in flight and 422 errors focus the matching field', async ({ page }) => {
  await openForm(page)
  await fillWindow(page)
  let release: (() => void) | undefined
  await page.route('**/v1/projects/*/windows', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({
      status: 422,
      json: {
        type: 'validation-failed',
        status: 422,
        errors: [{ path: ['ends_at'], message: 'Replay validation failed' }]
      }
    })
  })
  await page.getByRole('button', { name: w('save'), exact: true }).click()
  await expect(page.getByRole('button', { name: w('saving'), exact: true })).toBeDisabled()
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(page.locator('[name="end"]')).toBeFocused()
  await expect(page.locator('#window-end-error')).toContainText('Replay validation failed')
  await expect(page.getByRole('button', { name: w('save'), exact: true })).toBeEnabled()
})

for (const violation of [
  { code: 'end_before_start', path: 'ends_at', field: 'end' },
  { code: 'too_long', path: 'ends_at', field: 'end' },
  { code: 'too_far', path: 'starts_at', field: 'date' },
  { code: 'past', path: 'starts_at', field: 'start' }
]) {
  test(`WIN-8 server 422 ${violation.code} is inline, announced and focused`, async ({ page }) => {
    await openForm(page)
    await fillWindow(page)
    let release: (() => void) | undefined
    await page.route('**/v1/projects/*/windows', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await route.fulfill({
        status: 422,
        json: { status: 422, errors: [{ field: violation.path, code: violation.code }] }
      })
    })
    await page.getByRole('button', { name: w('save'), exact: true }).click()
    await expect(page.getByRole('button', { name: w('saving'), exact: true })).toBeDisabled()
    await expect.poll(() => !!release).toBe(true)
    release!()
    await expect(page.locator(`[name="${violation.field}"]`)).toBeFocused()
    await expect(page.locator(`#window-${violation.field}-error`)).toContainText(w(violation.code))
    if (violation.code === 'past')
      await expect(page.getByRole('link', { name: w('evidence'), exact: true })).toBeVisible()
  })
}

test('D13 zero-length commute wave saves through createWindow with MYT converted to UTC', async ({ page }) => {
  await openForm(page)
  await fillWindow(page, { end: '15:30' })
  await page.getByLabel(w('kind'), { exact: true }).selectOption('commute_wave')
  await stubApi(
    page,
    'createWindow',
    { ...replayWindow, ends_at: replayWindow.starts_at },
    { registry: windowsOperations }
  )
  const request = page.waitForRequest((request) => request.url().includes('/windows') && request.method() === 'POST')
  await page.getByRole('button', { name: w('save'), exact: true }).click()
  const sent = await request
  expect(sent.postDataJSON()).toMatchObject({
    kind: 'commute_wave',
    starts_at: '2026-11-02T07:30:00.000Z',
    ends_at: '2026-11-02T07:30:00.000Z',
    tz: 'Asia/Kuala_Lumpur'
  })
  expect(sent.headers()['idempotency-key']).toBeTruthy()
  expect(sent.headers()['skyclause-organization']).toBe('replay')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('WIN-3 Monday and Wednesday for six weeks and one skip previews 11 before saving', async ({ page }) => {
  test.skip(!controls.repeat, NO_REPEAT)
  await openForm(page)
  await fillWindow(page)
  await page.getByRole('checkbox', { name: w('weekly'), exact: true }).check()
  await page.getByRole('checkbox', { name: w('monday'), exact: true }).check()
  await page.getByRole('checkbox', { name: w('wednesday'), exact: true }).check()
  await page.getByLabel(w('until'), { exact: true }).fill('2026-12-13')
  await page.getByLabel(w('skips'), { exact: true }).fill('2026-11-04')
  await expect(page.getByText(w('preview', { count: 11 }), { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').locator('ol li')).toHaveCount(11)
  await stubApi(page, 'createWindow', replayWindow, { registry: windowsOperations })
  const request = page.waitForRequest((request) => request.url().includes('/windows') && request.method() === 'POST')
  await page.getByRole('button', { name: w('save'), exact: true }).click()
  expect((await request).postDataJSON().recurrence).toEqual({
    frequency: 'weekly',
    days_of_week: ['monday', 'wednesday'],
    until: '2026-12-13',
    skip_dates: ['2026-11-04']
  })
})

test('edit loads the selected occurrence and PATCHes its own id', async ({ page }) => {
  test.skip(!controls.edit, NO_EDIT)
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  await stubApi(page, 'updateWindow', replayWindow, { registry: windowsOperations })
  await page.goto(`${route}&edit=${windowId}`)
  await expect(page.getByLabel(w('field_title'), { exact: true })).toHaveValue(replayWindow.title)
  await page.getByLabel(w('end'), { exact: true }).fill('16:30')
  const request = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().endsWith(`/windows/${windowId}`)
  )
  await page.getByRole('button', { name: w('save'), exact: true }).press('Enter')
  expect((await request).postDataJSON().ends_at).toBe('2026-11-02T08:30:00.000Z')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('ICS URL import calls createIcsFeed and preserves server errors', async ({ page }) => {
  test.skip(!controls.importIcs, NO_IMPORT)
  await openForm(page)
  await page.getByRole('button', { name: w('import'), exact: true }).click()
  await page.getByLabel(w('import_url'), { exact: true }).fill('https://calendar.example.org/replay.ics')
  await stubApi(
    page,
    'createIcsFeed',
    { id: windowId, project_id: replayWindow.project_id, url: 'https://calendar.example.org/replay.ics' },
    { registry: windowsOperations }
  )
  const request = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/ics-feeds'))
  await page.getByRole('button', { name: w('import_save'), exact: true }).click()
  expect((await request).postDataJSON()).toEqual({ url: 'https://calendar.example.org/replay.ics' })
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('ICS file upload sends original replay bytes through createIcsFeed', async ({ page }) => {
  test.skip(!controls.importIcs, NO_IMPORT)
  await openForm(page)
  await page.getByRole('button', { name: w('import'), exact: true }).click()
  const content =
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:2-november-replay\r\nSUMMARY:2 November replay\r\nDTSTART:20261102T073000Z\r\nDTEND:20261102T080000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
  await page
    .getByLabel(w('import_file'), { exact: true })
    .setInputFiles({ name: '2-november-replay.ics', mimeType: 'text/calendar', buffer: Buffer.from(content) })
  await stubApi(
    page,
    'createIcsFeed',
    { id: windowId, project_id: replayWindow.project_id, url: null, filename: '2-november-replay.ics' },
    { registry: windowsOperations }
  )
  const request = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/ics-feeds'))
  await page.getByRole('button', { name: w('import_save'), exact: true }).click()
  expect((await request).postDataJSON()).toEqual({ file: { name: '2-november-replay.ics', content } })
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('whole-series edit uses scope=series and previews the saved recurrence', async ({ page }) => {
  test.skip(!controls.edit || !controls.repeat, !controls.edit ? NO_EDIT : NO_REPEAT)
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  const occurrence = {
    ...replayWindow,
    series_id: '2-november-replay-series',
    recurrence: {
      frequency: 'weekly' as const,
      days_of_week: ['monday', 'wednesday'] as ('monday' | 'wednesday')[],
      until: '2026-12-13',
      skip_dates: ['2026-11-04']
    }
  }
  await prepareWindows(page, [occurrence])
  await stubApi(page, 'updateWindow', occurrence, { registry: windowsOperations })
  await page.goto(`${route}&edit=${windowId}`)
  await page.getByLabel(w('scope'), { exact: true }).selectOption('series')
  await expect(page.getByText(w('preview', { count: 11 }), { exact: true })).toBeVisible()
  await page.getByLabel(w('end'), { exact: true }).fill('16:30')
  const request = page.waitForRequest((request) => request.method() === 'PATCH')
  await page.getByRole('button', { name: w('save'), exact: true }).click()
  const sent = await request
  expect(new URL(sent.url()).searchParams.get('scope')).toBe('series')
  expect(sent.postDataJSON().recurrence.days_of_week).toEqual(['monday', 'wednesday'])
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('whole-series cancellation sends exactly one DELETE after 10 seconds', async ({ page }) => {
  test.skip(!controls.edit || !controls.cancel, !controls.edit ? NO_EDIT : NO_CANCEL)
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page, [{ ...replayWindow, series_id: '2-november-replay-series' }])
  await stubApi(
    page,
    'cancelWindow',
    { ...replayWindow, cancelled_at: '2026-11-02T01:01:10Z' },
    { registry: windowsOperations }
  )
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'DELETE') writes++
  })
  await page.goto(`${route}&edit=${windowId}`)
  await page.getByLabel(w('scope'), { exact: true }).selectOption('series')
  await page.clock.pauseAt(new Date('2026-11-02T01:01:00Z'))
  await page.getByRole('button', { name: w('cancel'), exact: true }).click()
  await page.clock.runFor(9_999)
  expect(writes).toBe(0)
  const request = page.waitForRequest((request) => request.method() === 'DELETE')
  await page.clock.runFor(1)
  const sent = await request
  expect(new URL(sent.url()).searchParams.get('scope')).toBe('series')
  expect(sent.headers()['skyclause-organization']).toBe('replay')
  await page.clock.runFor(20_000)
  expect(writes).toBe(1)
})

test('an existing window opens as its details while it cannot be changed, and Declare a window opens the form', async ({
  page
}) => {
  test.skip(controls.edit, 'updateWindow has a handler: the editor is tested above')
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  await page.goto(`${route}&edit=${windowId}`)
  const dialog = page.getByRole('dialog', { name: w('details_title') })
  await expect(dialog.getByText(replayWindow.title, { exact: true })).toBeVisible()
  await expect(dialog.getByText(w('read_only'), { exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: w('save'), exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: w('cancel'), exact: true })).toHaveCount(controls.cancel ? 1 : 0)
  await dialog.getByRole('button', { name: w('declare'), exact: true }).click()
  await expect(page).toHaveURL(/declare=window/)
  await expect(page.getByRole('dialog').getByLabel(w('field_title'), { exact: true })).toHaveValue('')
})

test('declaring offers no Repeat and no ICS import while they cannot work', async ({ page }) => {
  test.skip(controls.repeat && controls.importIcs, 'Repeat and Import both work: they are tested above')
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  // An old link to the import still opens the one form that works.
  await page.goto(`${route}&declare=window&import=ics`)
  const dialog = page.getByRole('dialog', { name: w('declare') })
  await expect(dialog.getByLabel(w('field_title'), { exact: true })).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: w('weekly'), exact: true })).toHaveCount(controls.repeat ? 1 : 0)
  await expect(dialog.getByRole('button', { name: w('import'), exact: true })).toHaveCount(controls.importIcs ? 1 : 0)
  await expect(dialog.getByLabel(w('import_url'), { exact: true })).toHaveCount(controls.importIcs ? 1 : 0)
})

test('keyboard-only user declares a window', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  await stubApi(page, 'createWindow', replayWindow, { registry: windowsOperations })
  const request = page.waitForRequest((request) => request.url().includes('/windows') && request.method() === 'POST')
  await page.goto(route)
  await tabTo(page, '[data-declare-window]')
  await page.keyboard.press('Enter')
  await expect(page.locator('#window-title')).toBeVisible()
  await tabTo(page, '#window-title')
  await page.keyboard.type('2 November replay · keyboard declaration')
  await tabTo(page, '#window-start')
  await page.keyboard.type('0330')
  await page.keyboard.press('p')
  await expect(page.locator('#window-start')).toHaveValue('15:30')
  await tabTo(page, '#window-end')
  await page.keyboard.type('0400')
  await page.keyboard.press('p')
  await expect(page.locator('#window-end')).toHaveValue('16:00')
  await tabTo(page, '[data-window-form] button[type="submit"]')
  await page.keyboard.press('Enter')
  expect((await request).postDataJSON()).not.toHaveProperty('recurrence')
  await expect(page.getByRole('dialog')).toBeHidden()
})

async function tabTo(page: import('@playwright/test').Page, selector: string) {
  for (let index = 0; index < 100; index++) {
    if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab could not reach ${selector}`)
}

test('keyboard-only user declares, edits and cancels a window', async ({ page }) => {
  test.skip(!controls.edit || !controls.cancel, !controls.edit ? NO_EDIT : NO_CANCEL)
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  await stubApi(page, 'createWindow', replayWindow, { registry: windowsOperations })
  await stubApi(page, 'updateWindow', replayWindow, { registry: windowsOperations })
  await page.goto(route)
  async function tabTo(selector: string) {
    for (let index = 0; index < 100; index++) {
      if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return
      await page.keyboard.press('Tab')
    }
    throw new Error(`Tab could not reach ${selector}`)
  }
  await tabTo('[data-declare-window]')
  await page.keyboard.press('Enter')
  await expect(page.locator('#window-title')).toBeVisible()
  await tabTo('#window-title')
  await page.keyboard.type('2 November replay · keyboard declaration')
  await tabTo('#window-start')
  await page.keyboard.type('0330')
  await page.keyboard.press('p')
  await expect(page.locator('#window-start')).toHaveValue('15:30')
  await tabTo('#window-end')
  await page.keyboard.type('0400')
  await page.keyboard.press('p')
  await expect(page.locator('#window-end')).toHaveValue('16:00')
  await tabTo('[data-window-form] button[type="submit"]')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeHidden()
  await tabTo('[data-window-edit]')
  await page.keyboard.press('Enter')
  await tabTo('#window-title')
  await page.keyboard.press('End')
  await page.keyboard.type(' · edited by keyboard')
  await tabTo('[data-window-form] button[type="submit"]')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeHidden()
  await tabTo('[data-window-edit]')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await tabTo('[data-window-cancel]')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: w('undo'), exact: true })).toBeVisible()
  await tabTo('[data-window-undo]')
  await page.keyboard.press('Enter')
  await expect(page.getByText(w('undone'), { exact: true })).toBeVisible()
})
