import type { Page } from '@playwright/test'
import { expect } from '../fixtures'
import { setupProject, projectPath, row } from './data'
import { t } from './messages'

export async function subscriberRemoval(page: Page) {
  await setupProject(page)
  let writes = 0
  await page.route('**/v1/subscribers/subscriber-id', async (route) => {
    writes += 1
    await route.fulfill({ status: 204 })
  })
  await page.clock.install()
  await page.goto(projectPath)
  // Wait for the table data first: the trigger only exists once rows render.
  await expect(page.getByRole('table')).toContainText(row.email)
  const trigger = page.getByRole('button', { name: t('subscribers.remove', { name: row.email }), exact: true })
  async function queue() {
    // press() focuses then sends Enter atomically: split focus/keyboard steps flake under load.
    await trigger.press('Enter')
    const dialog = page.getByRole('alertdialog')
    const button = dialog.getByRole('button', { name: t('subscribers.remove_title', { name: row.email }), exact: true })
    await expect(button).toBeDisabled()
    await dialog.getByRole('textbox').fill(`${row.email} `)
    await expect(button).toBeDisabled()
    await dialog.getByRole('textbox').fill(row.email)
    await button.press('Enter')
    await expect(undoButton()).toBeVisible()
  }
  const undoButton = () => page.getByRole('button', { name: t('subscribers.undo'), exact: true })
  await queue()
  await page.clock.runFor(9_000)
  expect(writes).toBe(0)
  await undoButton().press('Enter')
  // Fail fast if Undo missed: a surviving timer would otherwise fire pages later.
  await expect(undoButton()).toHaveCount(0)
  await page.clock.runFor(20_000)
  expect(writes).toBe(0)
  await queue()
  // The installed clock also moves with real time, so leave a second of it before the 10 s deadline (as set-7's
  // undo test does): a 1 ms margin failed whenever queue() took longer than that.
  await page.clock.runFor(9_000)
  expect(writes).toBe(0)
  await page.clock.runFor(1_000)
  await expect.poll(() => writes).toBe(1)
}
