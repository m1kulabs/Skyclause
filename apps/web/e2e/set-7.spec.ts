import { removeDeviceScenario } from './alerts/support'
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { t } from './palette/messages'
import { expectUnclippedText } from './harness/expect-unclipped-text'
import { windowUndoCase, windowUnsavedCase } from './windows/set7-cases'
import { prepareSettings } from './members/stubs'

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

// Remaining spec-owned actions stay disabled until their owning issue lands.
for (const title of [
  'delete organisation — #108 a-settings-pages',
  'delete account — #108 a-settings-pages',
  'revoke API key — #105 a-keys-ui',
  'revoke AI key — #105 a-keys-ui',
  'revoke share link — #174 b-project-ui',
  'archive project — #174 b-project-ui',
  'remove subscriber — #169 c-channels-ui',
  'delete clause sheet draft — #144'
]) {
  test.fixme(title, async () => {})
}

test('remove member — #104: confirmation names the member', async ({ page }) => {
  await prepareSettings(page, 'members')
  await page.goto('/test-org/settings/members')

  await page.getByRole('button', { name: 'Remove member: Aisha Rahman' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: 'Remove “Aisha Rahman”?' })).toBeVisible()
  await expect(dialog).toContainText('Aisha Rahman')
})

test('lower role — #104: confirmation names the member and new role', async ({ page }) => {
  await prepareSettings(page, 'members', 'admin')
  await page.goto('/test-org/settings/members')

  await page.getByRole('combobox', { name: 'Role for Aisha Rahman' }).click()
  await page.getByRole('option', { name: 'Editor' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: 'Change “Aisha Rahman” to Editor?' })).toBeVisible()
  await expect(dialog).toContainText('Editor')
})

test('last-owner — #104: the refusal reason appears next to the role control', async ({ page }) => {
  await prepareSettings(page, 'members')
  await page.route('**/api/orgs/test-org/members/**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: {
          type: 'https://docs.skyclause.m1ku.tech/problems/last-owner',
          title: 'Last owner',
          status: 409,
          detail: 'An organisation must keep one Owner.',
          instance: new URL(route.request().url()).pathname
        }
      })
    } else await route.fallback()
  })
  await page.goto('/test-org/settings/members')

  const role = page.getByRole('combobox', { name: 'Role for Morgan Owner' })
  await role.click()
  await page.getByRole('option', { name: 'Admin' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: 'Change “Morgan Owner” to Admin?' })).toBeVisible()
  await dialog.getByRole('button', { name: /Change role to Admin/ }).click()
  const ownerRow = page.getByRole('row', { name: /Morgan Owner/ })
  await expect(ownerRow.getByRole('alert')).toHaveText('The organisation must retain at least one Owner.')
})

test('unsaved rota — #104: closing the tab prompts before the shift is saved', async ({ page }) => {
  await prepareSettings(page, 'rota')
  await page.goto('/test-org/settings/rota')
  await page.getByRole('button', { name: 'Add an approver' }).click()
  await page.getByRole('checkbox', { name: 'Monday' }).click()
  await page.getByRole('button', { name: 'Add shift' }).click()
  await expect(page.getByText('Rota shifts (n=1)')).toBeVisible()

  const prompt = page.waitForEvent('dialog')
  const reload = page.evaluate(() => window.location.reload())
  const dialog = await prompt
  expect(dialog.type()).toBe('beforeunload')
  await dialog.dismiss()
  await reload
  await expect(page).toHaveURL(/\/test-org\/settings\/rota$/)
})

test('ORG-4: a new organisation shows both empty rota templates and Add an approver', async ({ page }) => {
  await prepareSettings(page, 'rota')
  await page.goto('/test-org/settings/rota')
  const templates = page.locator('section[aria-labelledby="rota-templates-heading"]')
  await expect(templates.getByText('Storm afternoons')).toBeVisible()
  await expect(templates.getByText('Surge nights')).toBeVisible()
  await expect(templates.getByText('No one assigned')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Add an approver' })).toBeVisible()
  await expect(page.getByText('Rota shifts (n=0)')).toBeVisible()
})

test('ORG settings tables and timeline fit the 375px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await prepareSettings(page, 'members')
  await page.goto('/test-org/settings/members')
  await expect(page.getByRole('table', { name: 'Organisation members' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /^Name Aisha Rahman/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)

  await prepareSettings(page, 'rota')
  await page.goto('/test-org/settings/rota')
  const timeline = page.locator('[role="region"][aria-label="Approver rota for the next 7 days"]')
  await expect(timeline).toBeVisible()
  await expect(timeline).toHaveCSS('overflow-x', 'auto')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
})

for (const mode of [
  { name: 'dark', theme: 'dark', contrast: 'standard' },
  { name: 'light', theme: 'light', contrast: 'standard' },
  { name: 'high contrast', theme: 'dark', contrast: 'more' }
] as const) {
  test(`#104 members and rota axe: ${mode.name}`, async ({ page, baseURL, expectAxeClean }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.context().addCookies([{ name: 'skyclause-test-appearance', value: JSON.stringify(mode), url: baseURL! }])
    await prepareSettings(page, 'members')
    await page.goto('/test-org/settings/members')
    await expectAxeClean(page)
    await prepareSettings(page, 'rota')
    await page.goto('/test-org/settings/rota')
    await expectAxeClean(page)
  })
}

test('notifications panel removes a registered device immediately by keyboard — #170', async ({ page }) => {
  await removeDeviceScenario(page)
})
test('cancel window — #143 b-windows-ui', async ({ page }) => windowUndoCase(page))
test('unsaved window warns before leaving — #143 b-windows-ui', async ({ page }) => windowUnsavedCase(page))
