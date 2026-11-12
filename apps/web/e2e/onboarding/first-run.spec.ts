import { expect, test, type Page } from '@playwright/test'
import { makeAccount, signIn } from '@skyclause/auth/testing'
import { withSystem } from '@skyclause/db'
import { makeSource } from '@skyclause/db/test/factories/index'
import { formatDateKey } from '@skyclause/i18n/format'
import { APP, productionPage, secureCookie, shellCookieValue, startProductionServer } from '../harness/production-hosts'

// A judge's first run with a new account, on the built server as production runs it (HOST_MODE=multi), with a real
// session and the real API behind the app host's bridge: create an organisation, create a project, bind a source,
// declare a window, then the rota and channel steps. No step may show an error, a status code, "not built", or a
// control whose operation has no handler.
const port = Number(process.env.E2E_PORT ?? 3100) + 62

/** What a judge must never see, in the page's main content. */
const FORBIDDEN =
  /not built|owned by|answered \d|HTTP \d{3}|were not saved|could not be saved|wasn’t saved|Couldn’t read|Try again/i

async function expectClean(page: Page, step: string) {
  const main = page.locator('main')
  await expect(main, step).toBeVisible()
  // Judged once its reads have landed: no skeleton and nothing busy left on the page.
  await expect(main.locator('[data-slot="skeleton"]').filter({ visible: true }), step).toHaveCount(0)
  await expect(main.locator('[aria-busy="true"]').filter({ visible: true }), step).toHaveCount(0)
  await expect(page.locator('[data-source-error]'), step).toHaveCount(0)
  await expect(main, step).not.toContainText(FORBIDDEN)
}

async function shoot(page: Page, name: string, widths = [1440, 390]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.screenshot({ path: test.info().outputPath(`first-run-${name}-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

/** HH:MM in MYT, `minutes` from now. */
function mytTime(minutes: number) {
  const at = new Date(Date.now() + minutes * 60_000 + 8 * 3_600_000)
  return at.toISOString().slice(11, 16)
}

test.describe('the first run on a production-style server', () => {
  let stop: (() => Promise<void>) | undefined
  test.beforeAll(async ({ request }) => {
    stop = await startProductionServer(port, request)
  })
  test.afterAll(async () => {
    await stop?.()
  })

  test('a new account creates an organisation and a project, binds a source and declares a window', async ({
    browser,
    request
  }) => {
    test.setTimeout(180_000)
    const suffix = crypto.randomUUID().slice(0, 8)
    const orgSlug = `walk-${suffix}`
    const projectSlug = `bukit-jalil-${suffix}`
    // A catalogue rain gauge beside the site, as the catalogue job lists them.
    const gauge = `${suffix.toUpperCase()}RF`
    await withSystem('e2e-first-run', (tx) =>
      makeSource(tx, {
        ownerOrgId: null,
        kind: 'jps_rain',
        externalId: gauge,
        name: `Sg. Kuyoh ${gauge}`,
        lat: 3.056,
        lon: 101.7,
        url: 'https://publicinfobanjir.water.gov.my/'
      })
    )
    const account = await makeAccount()
    const cookie = secureCookie((await signIn(account.id)).cookie)
    const { context, page, close } = await productionPage(browser, request, port, cookie, null)
    const plantShell = async (projects: Array<{ id: string; name: string; slug: string }>, orgId: string) =>
      context.addCookies([
        {
          name: 'skyclause-test-shell',
          value: shellCookieValue({ org: { id: orgId, slug: orgSlug, name: 'Campus weather desk' }, projects }),
          domain: new URL(APP).host,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax'
        }
      ])

    // 1. Create an organisation.
    await page.goto(`${APP}/new`)
    await expectClean(page, 'organisation form')
    await shoot(page, '1-organisation')
    await page.getByLabel('Organisation name').fill('Campus weather desk')
    await page.getByLabel('Web address name').fill(orgSlug)
    const created = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/orgs')
    )
    await page.getByRole('button', { name: 'Create organisation' }).click()
    const org = (await (await created).json()) as { id: string }
    // From here the shell's own read would list the new organisation: the test runtime's shell reads the planted copy.
    await plantShell([], org.id)
    await expect(page).toHaveURL(`${APP}/${orgSlug}/new`)

    // 2. Create a project. The shell refreshed after the create: it no longer says there is no organisation.
    await expect(page.locator('main')).not.toContainText('No organisations yet')
    await expect(page.locator('[data-first-run-progress]').filter({ visible: true })).toContainText(
      '1 of 6 steps complete'
    )
    await expectClean(page, 'project form')
    await shoot(page, '2-project')
    const form = page.locator('form').filter({ has: page.getByLabel('Project name') })
    await form.getByLabel('Project name').fill('Bukit Jalil campus')
    await form.getByLabel('Web address name').fill(projectSlug)
    await form.getByLabel('Site name').fill('Bukit Jalil')
    await form.getByLabel('Latitude').fill('3.0559')
    await form.getByLabel('Longitude').fill('101.6997')
    const madeProject = page.waitForResponse(
      (response) => response.request().method() === 'POST' && /\/api\/orgs\/[^/]+\/projects$/.test(response.url())
    )
    await form.getByRole('button', { name: 'Create project' }).click()
    const project = (await (await madeProject).json()) as { id: string }
    await plantShell([{ id: project.id, name: 'Bukit Jalil campus', slug: projectSlug }], org.id)

    // 3. Bind a source. Adding a device is not offered: its operation has no handler.
    await expect(page).toHaveURL(new RegExp(`${APP}/${orgSlug}/${projectSlug}/settings/packs`))
    const panel = page.locator('[data-settings-panel]')
    await expect(panel.locator('[data-project-packs]')).toBeVisible()
    await expectClean(page, 'packs')
    await expect(page.getByRole('button', { name: /Add device/i })).toHaveCount(0)
    await panel.getByRole('button', { name: 'Add source' }).click()
    const picker = page.getByRole('dialog', { name: 'Bind sources' })
    await picker.getByLabel('Search sources').fill(gauge)
    await picker.getByRole('button', { name: `Bind ${gauge}` }).click()
    await expect(picker.getByRole('status')).toHaveText('Source bound.')
    await shoot(page, '3-sources')
    await picker.getByRole('button', { name: 'Close' }).click()
    await expectClean(page, 'packs after binding')

    // 4. Declare the first window, from the step's own link. Repeat and Import are not offered.
    // Next keeps the pages a client navigation left mounted but hidden: the steps on this page are the visible ones.
    const progress = page.locator('[data-first-run-progress]').filter({ visible: true })
    await progress.getByRole('link', { name: 'Continue' }).click()
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/${projectSlug}/windows\\?declare=window`))
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Title', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/Repeat/)).toHaveCount(0)
    await expect(dialog.getByText(/Import/)).toHaveCount(0)
    // At 1440 only: the dialog becomes a phone sheet below 640px, which would draw a new form under the filling.
    await shoot(page, '4-window-form', [1440])
    await dialog.getByLabel('Title', { exact: true }).fill('Open-air lecture')
    const date = dialog.getByLabel('Date', { exact: true })
    if (await date.count()) await date.fill(formatDateKey(new Date(Date.now() + 30 * 60_000)))
    await dialog.getByLabel('Start (MYT)', { exact: true }).fill(mytTime(30))
    await dialog.getByLabel('End (MYT)', { exact: true }).fill(mytTime(90))
    await dialog.getByRole('button', { name: 'Save window' }).click()
    await expect(page.getByText('Window saved.')).toBeVisible()
    // The page reads the new window, and the steps move on to the rota.
    await expect(page.locator('main')).toContainText('Open-air lecture')
    await expect(progress).toContainText('4 of 6 steps complete')
    await expectClean(page, 'windows')
    await shoot(page, '4-window-saved')

    // 5. The rota and 6. a channel: both pages open with their own working forms.
    await page.goto(`${APP}/${orgSlug}/settings/rota`)
    await expectClean(page, 'rota')
    await shoot(page, '5-rota')
    await page.goto(`${APP}/${orgSlug}/${projectSlug}/settings/channels`)
    await expectClean(page, 'channels')
    await shoot(page, '6-channels')

    // Back on the dashboard, the window and the source are there, read through the composed reads.
    await page.goto(`${APP}/${orgSlug}`)
    await expect(page.locator('[data-dashboard-block="signal_health"]')).toContainText(`Sg. Kuyoh ${gauge}`)
    await expectClean(page, 'dashboard')
    await shoot(page, '7-dashboard')
    await close()
  })
})
