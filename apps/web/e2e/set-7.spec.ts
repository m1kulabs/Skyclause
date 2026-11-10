import { removeDeviceScenario } from './alerts/support'
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { t } from './palette/messages'
import { expectUnclippedText } from './harness/expect-unclipped-text'
import { windowUndoCase, windowUnsavedCase } from './windows/set7-cases'
import { prepareSettings, projectFixtureData, projectPath } from './project-ui/fixtures'
import { subscriberRemoval } from './subscribers/removal'

const route = '/_test/set-7'
const name = t('set7.harness.name')

// Controlled inputs can be filled before hydration; wait for the harness's existing ready signal.
async function openHarness(page: Page) {
  await page.goto(route)
  await expect(page.getByRole('button', { name: t('set7.harness.focus'), exact: true })).toBeEnabled()
}

test('TypedConfirmDialog stays disabled until the exact name and resets after closing', async ({ page }) => {
  await openHarness(page)
  await page.getByRole('button', { name: t('set7.harness.open_typed'), exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  const confirm = dialog.getByRole('button', { name: t('set7.harness.typed', { name }), exact: true })
  const field = dialog.getByRole('textbox')
  await expect(confirm).toBeDisabled()
  for (const value of [name.toLowerCase(), `${name} `, ` ${name}`, name.slice(0, -1)]) {
    await field.fill(value)
    await expect(confirm).toBeDisabled()
  }
  await field.fill(name)
  await expect(confirm).toBeEnabled()
  await dialog.getByRole('button', { name: t('set7.cancel'), exact: true }).click()
  await page.getByRole('button', { name: t('set7.harness.open_typed'), exact: true }).click()
  await expect(field).toHaveValue('')
  await expect(confirm).toBeDisabled()
  await field.fill(name)
  await confirm.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('confirmations')).toHaveText(t('set7.harness.confirmed', { count: 1 }))
})

test('ConfirmDialog names the object in its title and button, traps focus and returns it', async ({ page }) => {
  await openHarness(page)
  const trigger = page.getByRole('button', { name: t('set7.harness.open_confirm'), exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog')
  const label = t('set7.harness.confirm', { name })
  await expect(dialog.getByRole('heading', { name: label })).toBeVisible()
  await expect(dialog.getByRole('button', { name: label })).toBeVisible()
  await expect(dialog.getByRole('button', { name: t('set7.cancel'), exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: label })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.getByTestId('confirmations')).toHaveText(t('set7.harness.confirmed', { count: 0 }))
})

test('dialogs wrap long and non-Latin object names at 320px and reject an empty typed name', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 })
  await openHarness(page)
  // Organisation names have no maximum in the operation schema; use a plausible long name and identifier.
  for (const objectName of [
    'Persatuan Kebajikan dan Pendidikan Komuniti Wilayah Persekutuan Kuala Lumpur dan Selangor',
    'operations-notifications-shared-organisation-production-read-access-key',
    '吉隆坡社区教育与文化交流协会'
  ]) {
    await page.getByRole('textbox', { name: t('set7.harness.object_name') }).fill(objectName)
    for (const key of ['set7.harness.open_confirm', 'set7.harness.open_typed']) {
      await page.getByRole('button', { name: t(key), exact: true }).click()
      await expect(page.getByRole('alertdialog').getByRole('heading')).toContainText(objectName)
      await expectUnclippedText(page)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.keyboard.press('Escape')
    }
  }
  await page.getByRole('textbox', { name: t('set7.harness.object_name') }).fill('')
  await page.getByRole('button', { name: t('set7.harness.open_typed'), exact: true }).click()
  await expect(
    page.getByRole('alertdialog').getByRole('button', { name: t('set7.harness.typed', { name: '' }) })
  ).toBeDisabled()
})

test('undo hook commits once after 10 seconds, with no earlier write', async ({ page }) => {
  let commits = 0
  await page.route('**/_test/set-7/commit', async (route) => {
    commits += 1
    await route.fulfill({ status: 204 })
  })
  await page.clock.install()
  await openHarness(page)
  await page.getByRole('button', { name: t('set7.harness.queue'), exact: true }).click()
  await page.clock.runFor(9_000)
  expect(commits).toBe(0)
  await expect(page.getByTestId('commits')).toHaveText(t('set7.harness.commits', { count: 0 }))
  await page.clock.runFor(1_000)
  await expect(page.getByTestId('commits')).toHaveText(t('set7.harness.commits', { count: 1 }))
  await page.clock.runFor(10_000)
  expect(commits).toBe(1)
})

test('undo hook never writes after Undo, including on pagehide', async ({ page }) => {
  let commits = 0
  await page.route('**/_test/set-7/commit', async (route) => {
    commits += 1
    await route.fulfill({ status: 204 })
  })
  await page.clock.install()
  await openHarness(page)
  await page.getByRole('button', { name: t('set7.harness.queue'), exact: true }).click()
  await page.clock.runFor(9_000)
  await page.getByRole('button', { name: t('set7.undo'), exact: true }).click()
  await page.clock.runFor(20_000)
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  expect(commits).toBe(0)
  await expect(page.getByTestId('commits')).toHaveText(t('set7.harness.commits', { count: 0 }))
})

test('undo hook commits on pagehide with keepalive and never twice', async ({ page }) => {
  let commits = 0
  await page.route('**/_test/set-7/commit', async (route) => {
    commits += 1
    await route.fulfill({ status: 204 })
  })
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = (input, init) => {
      if (String(input).endsWith('/_test/set-7/commit')) {
        document.documentElement.dataset.commitKeepalive = String(init?.keepalive)
      }
      return original(input, init)
    }
  })
  await page.clock.install()
  await openHarness(page)
  await page.getByRole('button', { name: t('set7.harness.queue'), exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
  await expect(page.locator('html')).toHaveAttribute('data-commit-keepalive', 'true')
  await expect(page.getByTestId('commits')).toHaveText(t('set7.harness.commits', { count: 1 }))
  await page.clock.runFor(20_000)
  expect(commits).toBe(1)
})

test('guard prompts on beforeunload and stops prompting after saving', async ({ page }) => {
  await openHarness(page)
  await page.getByRole('textbox', { name: t('set7.harness.edit') }).fill('Unsaved test edit')
  const prompt = page.waitForEvent('dialog')
  const reload = page.evaluate(() => window.location.reload())
  const dialog = await prompt
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await reload
  await expect(page).toHaveURL(new RegExp(`${route}$`))
  await page.getByRole('button', { name: t('set7.harness.save'), exact: true }).click()
  page.on('dialog', (unexpected) => {
    throw new Error(`Unexpected ${unexpected.type()} after saving`)
  })
  await page.reload()
})

test('guard cancels browser history traversal before changing the URL', async ({ page }) => {
  await openHarness(page)
  await page.evaluate(() => history.pushState(history.state, '', '?edited=1'))
  const field = page.getByRole('textbox', { name: t('set7.harness.edit') })
  await field.fill('Unsaved history test')
  const prompt = page.waitForEvent('dialog')
  await page.evaluate(() => history.back())
  const dialog = await prompt
  expect(dialog.type()).toBe('confirm')
  await dialog.dismiss()
  await expect(page).toHaveURL(/\/_test\/set-7\?edited=1$/)
  await expect(field).toHaveValue('Unsaved history test')
})

for (const kind of ['link', 'imperative'] as const) {
  test(`guard prompts on ${kind} in-app navigation and keeps edits after cancellation`, async ({ page }) => {
    await openHarness(page)
    const field = page.getByRole('textbox', { name: t('set7.harness.edit') })
    await field.fill('Unsaved test edit')
    const target =
      kind === 'link'
        ? page.getByRole('link', { name: t('set7.harness.leave'), exact: true })
        : page.getByRole('button', { name: t('set7.harness.navigate'), exact: true })
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm')
      expect(dialog.message()).toBe(t('set7.unsaved'))
      await dialog.dismiss()
    })
    await target.click()
    await expect(page).toHaveURL(new RegExp(`${route}$`))
    await expect(field).toHaveValue('Unsaved test edit')
    let prompts = 0
    page.on('dialog', async (dialog) => {
      prompts += 1
      await dialog.accept()
    })
    await target.click()
    await expect(page).toHaveURL(/\/_test\/tokens$/)
    expect(prompts).toBe(1)
  })
}

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`SET-7 dialogs are axe-clean and unclipped in ${theme}`, async ({ page, baseURL, expectAxeClean }) => {
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
    await openHarness(page)
    for (const key of ['set7.harness.open_confirm', 'set7.harness.open_typed']) {
      await page.getByRole('button', { name: t(key), exact: true }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await expectAxeClean(page)
      await expectUnclippedText(page)
      await page.keyboard.press('Escape')
    }
  })
}

// Domain owners replace these cases with their real action flow when their panels land (spec §7).
for (const title of [
  'delete organisation — #108 a-settings-pages',
  'delete account — #108 a-settings-pages',
  'revoke API key — #105 a-keys-ui',
  'revoke AI key — #105 a-keys-ui',
  'remove member — #104 a-members-ui',
  'lower role — #104 a-members-ui',
  'delete clause sheet draft — #144'
]) {
  test.fixme(title, async () => {})
}

test('notifications panel removes a registered device immediately by keyboard — #170', async ({ page }) => {
  await removeDeviceScenario(page)
})
test('cancel window — #143 b-windows-ui', async ({ page }) => windowUndoCase(page))
test('unsaved window warns before leaving — #143 b-windows-ui', async ({ page }) => windowUnsavedCase(page))
test('remove subscriber — #169 c-channels-ui', async ({ page }) => subscriberRemoval(page))

test('archive project can be undone within 10 seconds — #174 b-project-ui', async ({ page }) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareSettings(page, 'admin')
  let archiveRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/projects\/[^/]+\/archive$/.test(request.url())) archiveRequests++
  })
  await page.goto(`${projectPath}/settings`)
  await page.clock.pauseAt(new Date('2026-11-05T13:12:30.000Z'))
  const panel = page.locator('[data-project-settings-general]')
  await panel.getByRole('button', { name: 'Archive project' }).click()
  await expect(panel.getByRole('status').filter({ hasText: 'Project will be archived' })).toBeVisible()
  await page.clock.runFor(9_000)
  await panel.getByRole('button', { name: 'Undo' }).click()
  await page.clock.runFor(10_001)
  expect(archiveRequests).toBe(0)

  await panel.getByRole('button', { name: 'Archive project' }).click()
  await page.clock.runFor(10_001)
  await expect(panel.getByRole('button', { name: 'Restore project' })).toBeVisible()
  expect(archiveRequests).toBe(1)
  await panel.getByRole('button', { name: 'Restore project' }).click()
  await expect(panel.getByRole('button', { name: 'Archive project' })).toBeVisible()
})

test('revoking a share link asks for confirmation and names the link — #174 b-project-ui', async ({ page }) => {
  await prepareSettings(page, 'admin')
  await page.goto(`${projectPath}/settings/share`)
  const share = page.locator('[data-project-settings-share]')
  await share.getByRole('button', { name: 'Revoke' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading')).toContainText('share-link-one')
  await expect(dialog.getByRole('button', { name: 'Revoke link' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Revoke link' }).click()
  await expect(share).toContainText('Revoked')
})

test('closing the tab with an unsaved rota prompts — #174 b-project-ui', async ({ page }) => {
  await prepareSettings(page, 'admin')
  await page.goto(`${projectPath}/settings/rota`)
  const rota = page.locator('[data-project-settings-rota]')
  await rota.getByRole('button', { name: 'Add a shift' }).click()
  await rota.locator('[data-rota-editor] #rota-start').fill('14:00')
  const prompt = page.waitForEvent('dialog')
  const reload = page.evaluate(() => window.location.reload())
  const dialog = await prompt
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await reload
  await expect(page).toHaveURL(`${projectPath}/settings/rota`)
  await expect(page.locator('[data-project-settings-rota]')).toBeVisible()
})
