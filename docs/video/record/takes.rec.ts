import { expect, test, type Locator, type Page } from '@playwright/test'
import { RECORD_SHOTS, hasStorageState, type Shot } from './contract'
import { recordTake, type TakeApi } from './take'

const varsFor = (shot: Shot) => {
  if (shot.id === 'D1') return ['SKYCLAUSE_FORM_URL', 'SKYCLAUSE_SHEET_URL']
  if (shot.id === 'D2' || shot.id === 'D5') return ['SKYCLAUSE_SHEET_URL']
  if (shot.id === 'D6') return ['SKYCLAUSE_GMAIL_URL']
  return []
}

const rowFor = (page: Page, pattern: RegExp) => page.getByRole('row').filter({ hasText: pattern }).first()
const cueAfter = async (take: TakeApi, id: string, locator: Locator) => {
  await expect(locator).toBeVisible()
  await take.cue(id, locator)
}

async function recordWindow(page: Page, take: TakeApi): Promise<void> {
  await page.goto(process.env.SKYCLAUSE_FORM_URL!)
  // verify on the dev pilot
  const title = page.getByRole('textbox', { name: /title/i }).first()
  const kind = page.getByRole('combobox', { name: /kind/i }).first()
  const date = page.getByLabel(/date/i).first()
  const start = page.getByLabel(/start/i).first()
  const end = page.getByLabel(/end/i).first()
  const formTitle = page.getByRole('heading').first()
  await cueAfter(take, 'form-title', formTitle)
  await title.fill('Club window')
  await kind.selectOption('event')
  await date.fill('2026-11-09')
  await start.fill('15:00')
  await end.fill('16:00')
  const consent = page.getByRole('checkbox', { name: /consent/i })
  await consent.check()
  await cueAfter(take, 'consent-ticked', consent)
  await take.mask(page.getByText(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/))
  await page.getByRole('button', { name: /submit|declare window/i }).click()
  // verify on the dev pilot
  const submitted = page.getByRole('status').first()
  await cueAfter(take, 'submitted', submitted)
  await take.hold(600)

  await page.goto(process.env.SKYCLAUSE_SHEET_URL!)
  // verify on the dev pilot
  await page.getByRole('tab', { name: /windows/i }).click()
  const createdRow = rowFor(page, /Club window/)
  // verify on the dev pilot
  await take.mask(page.getByText(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/))
  await cueAfter(take, 'windows-row', createdRow)
  await take.hold(1000)
}

async function recordReadings(page: Page, take: TakeApi): Promise<void> {
  await page.goto(process.env.SKYCLAUSE_SHEET_URL!)
  // verify on the dev pilot
  const readingsTab = page.getByRole('tab', { name: /readings/i })
  await readingsTab.click()
  await cueAfter(take, 'readings-tab', readingsTab)
  // verify on the dev pilot
  const jps = rowFor(page, /JPS/i)
  await cueAfter(take, 'jps-row', jps)
  // verify on the dev pilot
  const apims = rowFor(page, /APIMS/i)
  await cueAfter(take, 'apims-row', apims)
  // verify on the dev pilot
  const met = rowFor(page, /MET/i)
  await cueAfter(take, 'met-row', met)
  // verify on the dev pilot
  const age = page.getByRole('columnheader', { name: /age/i }).first()
  await cueAfter(take, 'age-column', age)
  await take.hold(1400)
}

async function recordLedger(page: Page, take: TakeApi): Promise<void> {
  await page.goto(process.env.SKYCLAUSE_SHEET_URL!)
  // verify on the dev pilot
  await page.getByRole('tab', { name: /ledger/i }).click()
  // verify on the dev pilot
  const ledgerRow = page.getByRole('row').last()
  await cueAfter(take, 'ledger-row', ledgerRow)
  // verify on the dev pilot
  const hashCell = page
    .getByRole('gridcell')
    .filter({ hasText: /^[a-f\d]{64}$/i })
    .last()
  await cueAfter(take, 'hash-cell', hashCell)
  // verify on the dev pilot
  const changedCell = page.getByRole('gridcell').nth(1)
  await changedCell.dblclick()
  await page.keyboard.press('End')
  await page.keyboard.type('x')
  await cueAfter(take, 'edited-cell', changedCell)
  await take.hold(400)

  // verify on the dev pilot
  await page.getByRole('button', { name: /extensions/i }).click()
  const script = page.getByRole('menuitem', { name: /apps script/i })
  const scriptPagePromise = page.context().waitForEvent('page')
  await script.click()
  const scriptPage = await scriptPagePromise
  const scriptUrl = scriptPage.url()
  await scriptPage.close()
  await page.goto(scriptUrl)
  // verify on the dev pilot
  await page.waitForLoadState('domcontentloaded')
  const functionPicker = page.getByRole('combobox', { name: /function/i })
  await functionPicker.selectOption({ label: 'verifyLedger' })
  const runButton = page.getByRole('button', { name: /^run$/i })
  await runButton.click()
  await take.hold(1200)
  // verify on the dev pilot
  const executionLog = page.getByText(/execution log|broken row/i).last()
  await cueAfter(take, 'verify-run', executionLog)
  const brokenRow = page.getByText(/broken row/i).last()
  await cueAfter(take, 'broken-row-named', brokenRow)
  await page.goBack()
  await page.getByRole('tab', { name: /ledger/i }).click()
  await page.keyboard.press('Control+z')
}

async function recordEvidence(page: Page, take: TakeApi): Promise<void> {
  await page.goto(process.env.SKYCLAUSE_GMAIL_URL!)
  // verify on the dev pilot
  const search = page.getByRole('textbox', { name: /search mail/i })
  await search.fill('"evidence for 2 Nov 14:00–16:30"')
  await search.press('Enter')
  const request = page
    .getByRole('main')
    .getByText(/evidence for 2 Nov 14:00–16:30/i)
    .first()
  // verify on the dev pilot
  await take.mask(page.getByText(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/))
  await cueAfter(take, 'request-sent', request)
  const replyRow = page
    .getByRole('row')
    .filter({ hasText: /evidence for 2 Nov 14:00–16:30/i })
    .last()
  await expect(replyRow).toBeVisible({ timeout: 60_000 })
  await replyRow.click()
  const message = page.getByRole('main')
  await take.mask(page.getByText(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/))
  await cueAfter(take, 'reply-arrived', message.getByText(/readings/i).first())
  const readings = message.getByText(/readings/i).first()
  await cueAfter(take, 'pack-readings', readings)
  const sources = message.getByText(/sources/i).first()
  await cueAfter(take, 'pack-sources', sources)
  await take.hold(1200)
}

for (const shot of RECORD_SHOTS) {
  test(`${shot.id} · ${shot.on_camera.slice(0, 64)}`, async ({ page }) => {
    if (shot.needs === 'ge') test.skip(true, 'Needs the Gemini Enterprise licence. Never record a stand-in.')
    if (!hasStorageState())
      test.skip(true, 'Save a signed-in Google storage state by hand at record/.state/google.json.')
    const missing = varsFor(shot).filter((name) => !process.env[name])
    if (missing.length) test.skip(true, `Set ${missing.join(' and ')} for this shot.`)

    await recordTake(page, shot.id, async (take) => {
      if (shot.id === 'D1') await recordWindow(page, take)
      else if (shot.id === 'D2') await recordReadings(page, take)
      else if (shot.id === 'D5') await recordLedger(page, take)
      else if (shot.id === 'D6') await recordEvidence(page, take)
    })
  })
}
