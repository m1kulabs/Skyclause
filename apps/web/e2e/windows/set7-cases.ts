import { expect, test, type Page } from '@playwright/test'
import { stubApi } from '../harness'
import { windowsOperations } from '../../features/windows/operations'
import { prepareWindows, replayWindow, route, windowId } from './replay'
import { w } from './messages'
import { controls } from './controls'

export async function windowUndoCase(page: Page) {
  test.skip(!controls.cancel, 'cancelWindow has no handler: Cancel window is not offered')
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page)
  await stubApi(
    page,
    'cancelWindow',
    { ...replayWindow, cancelled_at: '2026-11-02T01:00:10Z' },
    { registry: windowsOperations }
  )
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && request.url().includes(`/windows/${windowId}`)) writes++
  })
  await page.goto(`${route}&edit=${windowId}`)
  await expect(page.getByRole('button', { name: w('cancel'), exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-11-02T01:01:00Z'))
  await page.getByRole('button', { name: w('cancel'), exact: true }).press('Enter')
  await page.clock.runFor(9_000)
  expect(writes).toBe(0)
  await page.getByRole('button', { name: w('undo'), exact: true }).press('Enter')
  await page.clock.runFor(20_000)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  expect(writes).toBe(0)
  await expect(page.getByText(w('undone'), { exact: true })).toBeVisible()
}

export async function windowUnsavedCase(page: Page) {
  await prepareWindows(page)
  await page.goto(`${route}&declare=window`)
  await page.getByLabel(w('field_title'), { exact: true }).fill('2 November replay · unsaved edit')
  const prompt = page.waitForEvent('dialog')
  const reload = page.evaluate(() => location.reload())
  const dialog = await prompt
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await reload
  await expect(page.getByLabel(w('field_title'), { exact: true })).toHaveValue('2 November replay · unsaved edit')
  const closePrompt = page.waitForEvent('dialog')
  const close = page
    .getByRole('dialog')
    .getByRole('button', { name: w('close'), exact: true })
    .press('Enter')
  await (await closePrompt).dismiss()
  await close
  await expect(page.getByRole('dialog')).toBeVisible()
}
