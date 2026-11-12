import { expect, test } from '@playwright/test'
import { pseudo } from '@skyclause/i18n'
import { overviewOperations } from '../../features/overview/operations'
import { projectSettingsOperations } from '../../features/project-settings/operations'
import { adminId, prepareOverview, prepareSettings, projectFixtureData, baseProject, projectPath } from './fixtures'
import { stubApi } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

/** The copy as rendered: the pseudo project renders every string through `pseudo`. */
const copy = (value: string) => (process.env.I18N_PSEUDO === '1' ? pseudo(value) : value)
const emptyRoute = `${projectPath}`
const settingsRoute = `${projectPath}/settings`

test('every empty overview block says so once and gives the next action that exists, and draws no chart', async ({
  page
}) => {
  await prepareOverview(page, 'admin', { empty: true })
  await page.goto(emptyRoute)
  const overview = page.locator('[data-project-overview]')
  await expect(overview.getByRole('heading', { name: 'Project overview' })).toBeVisible()
  for (const [id, sentence, action] of [
    ['overview-packs', 'No pack to show (n=0)', 'Bind a source'],
    ['overview-strip', null, 'Declare a window'],
    ['overview-risk', 'No windows at risk today (n=0)', 'Declare a window'],
    ['overview-sources', 'No sources bound (n=0)', 'Bind a source'],
    ['overview-bundle', 'No bundles yet (n=0)', 'Declare a window'],
    // Nothing in the product lists a show by hand: what fills this block is a bound venue listing or forecast.
    ['overview-next-event', 'No listed show or storm forecast (n=0)', 'Bind a source']
  ] as const) {
    const section = overview.locator(`#${id}`).locator('..').locator('..')
    if (sentence) await expect(section.getByText(copy(sentence))).toBeVisible()
    await expect(section.getByText(copy(action), { exact: true })).toBeVisible()
    // No bare "n=3" tag beside the heading.
    await expect(section.locator('header')).not.toContainText('n=')
  }
  await expect(overview.locator('#overview-strip svg')).toHaveCount(0)
})

test('a viewer sees no instruction they cannot follow in an empty overview block', async ({ page }) => {
  await prepareOverview(page, 'viewer', { empty: true })
  await page.goto(emptyRoute)
  const overview = page.locator('[data-project-overview]')
  await expect(overview.getByRole('heading', { name: 'Project overview' })).toBeVisible()
  await expect(overview.getByText('Bind a source')).toHaveCount(0)
  await expect(overview.getByText('Declare a window')).toHaveCount(0)
  // The windows page is something a viewer can open, so the blocks about windows link to it.
  await expect(
    overview.locator('#overview-risk').locator('..').locator('..').getByRole('link', { name: 'View windows' })
  ).toHaveAttribute('href', `${projectPath}/windows`)
})

test('overview uses the 5 November captures, declares from the primary action and keeps filters on reload', async ({
  page
}) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareOverview(page, 'admin', { empty: false })
  await page.goto(emptyRoute)
  const overview = page.locator('[data-project-overview]')
  // The answer: each pack's mode set large with its glyph and word, then the inputs behind it.
  await expect(overview.locator('[data-pack="sky"] [data-state="normal"]')).toHaveText(copy('Normal'))
  // Two strings joined: under the pseudo pass each carries its own tildes.
  await expect(overview.locator('[data-finding-line]')).toContainText(/5 inputs reporting~*, oldest 12\smin/)
  await expect(overview.locator('[data-pack="sky"]')).toContainText('No clause has fired')
  await expect(overview.locator('[data-source="source-jps"]')).toContainText('Sg. Kuyoh di LRT Bukit Jalil')
  await expect(overview.locator('[data-bundle]')).toBeVisible()

  await overview.getByRole('button', { name: /^Crowd~* pack/ }).click()
  await expect(page).toHaveURL(/\?pack=crowd$/)
  await page.reload()
  await expect(overview.getByRole('button', { name: /^Crowd~* pack/ })).toHaveAttribute('aria-pressed', 'true')
  await overview.locator('.overview-topline').getByRole('link', { name: 'Declare a window' }).click()
  await expect(page).toHaveURL(/\?pack=crowd&declare=window$/)
})

test('without the verdicts read the pack card leaves out Fired clauses instead of saying none fired', async ({
  page
}) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareOverview(page, 'admin', { empty: false })
  await stubApi(
    page,
    'getProjectVerdicts',
    { type: 'https://skyclause.test/problems/not-built', title: 'Not built', status: 501 },
    { registry: overviewOperations, status: 501 }
  )
  await page.goto(emptyRoute)
  const sky = page.locator('[data-project-overview] [data-pack="sky"]')
  await expect(sky.locator('[data-state="normal"]')).toHaveText(copy('Normal'))
  await expect(sky.locator('[data-fired-clauses]')).toHaveCount(0)
  await expect(sky).not.toContainText('No clause has fired')
  await expect(sky).not.toContainText('Fired clauses')
})

test('a 2 November strip replay stays labelled as replay when it has no rain series', async ({ page }) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareOverview(page, 'admin', { empty: false, replay: true })
  await page.goto(emptyRoute)
  const strip = page.locator('[data-project-overview] section[aria-labelledby="overview-strip"]')
  await expect(strip).toContainText('Replay')
  await expect(strip.locator('svg')).toHaveCount(0)
})

test('today at-risk windows use project local date, stop at six and link to all windows', async ({ page }) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareOverview(page, 'admin', { empty: false })
  const windows = Array.from({ length: 8 }, (_, index) => {
    const startsAt = new Date(Date.parse('2026-11-05T13:20:00.000Z') + index * 10 * 60_000)
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000)
    return {
      ...projectFixtureData.window,
      id: `019a55e0-0000-7000-8000-${String(index + 100).padStart(12, '0')}`,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      title: `At risk ${index + 1}`
    }
  })
  await stubApi(page, 'listWindows', { data: windows, next_cursor: null }, { registry: overviewOperations })
  await page.goto(projectPath)
  const risk = page.locator('[data-project-overview] section[aria-labelledby="overview-risk"]')
  await expect(risk.locator('ul li')).toHaveCount(6)
  await expect(risk.getByRole('link', { name: 'View all' })).toHaveAttribute('href', `${projectPath}/windows`)
})

test('Viewer has no project settings controls; Admin sees the project controls', async ({ page }) => {
  await prepareSettings(page, 'viewer')
  await page.goto(settingsRoute)
  await expect(page.locator('[data-settings-frame]')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: /Page not found/ })).toBeVisible()

  await page.context().clearCookies()
  await prepareSettings(page, 'admin')
  await page.goto(settingsRoute)
  const frame = page.locator('[data-settings-frame]')
  const panel = frame.locator('[data-settings-panel]')
  await expect(panel.getByLabel('Site name')).toBeVisible()
  await expect(panel.getByLabel('Project name')).toHaveValue('Bukit Jalil campus')
  await expect(panel.getByLabel('Latitude')).toHaveValue('3.05')
  await expect(panel.getByLabel('Longitude')).toHaveValue('101.7')
  await expect(panel.getByLabel('Time zone')).toHaveValue('Asia/Kuala_Lumpur')
  await expect(panel.getByLabel('Daylight starts')).toHaveValue('07:00')
  await expect(panel.getByLabel('Daylight ends')).toHaveValue('19:00')
  await expect(panel).toContainText('Times use MYT.')
  await expect(panel.getByLabel('Semester ends')).toHaveValue('2027-02-01')
  await expect(panel.getByLabel('Warning-area terms')).toHaveValue('Kuala Lumpur')
  await expect(panel.locator('#sla-sky')).toHaveValue('10')
  await expect(panel.locator('#sla-crowd')).toHaveValue('2')
  await expect(panel.getByRole('button', { name: 'Archive project' })).toBeVisible()
})

test('project fields save through PATCH /api/projects/{id}', async ({ page }) => {
  await prepareSettings(page, 'admin')
  let submitted: Record<string, unknown> | undefined
  await page.route(/\/api\/projects\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    submitted = route.request().postDataJSON() as Record<string, unknown>
    const result = projectSettingsOperations.updateProject.response.parse({
      ...baseProject,
      ...submitted,
      rota_override: null
    })
    await route.fulfill({ status: 200, contentType: 'application/json', json: result })
  })
  await page.goto(settingsRoute)
  const panel = page.locator('[data-project-settings-general]')
  await panel.locator('#site-name').fill('Updated campus')
  await panel.locator('#project-time-zone').fill('Asia/Kuala_Lumpur')
  // Each deadline row is its own form with its own Save, named for its pack; the project form's Save is just "Save changes".
  await panel
    .locator('form')
    .getByRole('button', { name: copy('Save changes'), exact: true })
    .click()
  await expect.poll(() => submitted?.site_name).toBe('Updated campus')
  expect(submitted).toMatchObject({
    name: 'Bukit Jalil campus',
    site_lat: 3.05,
    site_lon: 101.7,
    time_zone: 'Asia/Kuala_Lumpur'
  })
  await expect(panel.getByRole('status').first()).toContainText('Saved')
})

test('changing the Sky SLA sends sla_s and shows the saved value', async ({ page }) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareSettings(page, 'admin')
  let submitted: Record<string, unknown> | undefined
  await page.route(/\/v1\/projects\/[^/]+\/packs\/sky$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    submitted = route.request().postDataJSON() as Record<string, unknown>
    const result = projectSettingsOperations.updateProjectPack.response.parse({
      pack: 'sky',
      enabled: true,
      sheet_id: 'sheet-sky',
      schedule: null,
      sla_s: submitted.sla_s
    })
    await route.fulfill({ status: 200, contentType: 'application/json', json: result })
  })
  await page.goto(settingsRoute)
  const general = page.locator('[data-project-settings-general]')
  await general.locator('#sla-sky').fill('15')
  await general.locator('[data-sla-pack="sky"]').getByRole('button').click()
  await expect.poll(() => submitted?.sla_s).toBe(900)
  expect(submitted).toMatchObject({ enabled: true, sla_s: 900 })
  await expect(general.locator('[data-sla-pack="sky"]')).toContainText('15 minutes')
})

test('project rota adds a field-edited override with the project id', async ({ page }) => {
  await prepareSettings(page, 'admin')
  let submitted: Record<string, unknown> | undefined
  await page.route(/\/api\/orgs\/test-org\/rota\/shifts$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submitted = route.request().postDataJSON() as Record<string, unknown>
    const result = projectSettingsOperations.createRotaShift.response.parse({
      id: '019a55e0-0000-7000-8000-000000000030',
      ...submitted
    })
    await route.fulfill({ status: 201, contentType: 'application/json', json: result })
  })
  await page.goto(`${projectPath}/settings/rota`)
  const rota = page.locator('[data-project-settings-rota]')
  await rota.getByRole('button', { name: 'Add a shift' }).click()
  const editor = rota.locator('[data-rota-editor]')
  await expect(editor).toContainText('Times use MYT.')
  await editor.locator('#rota-day-monday').check()
  await editor.locator('#rota-template').selectOption('storm_afternoon')
  await editor.getByRole('button', { name: 'Save shift' }).click()
  await expect.poll(() => submitted?.project_id).toBe(projectFixtureData.projectId)
  expect(submitted).toMatchObject({
    project_id: projectFixtureData.projectId,
    account_id: adminId,
    days: [1],
    local_start: '14:00',
    local_end: '19:15',
    template: 'storm_afternoon'
  })
  await expect(rota.getByRole('status')).toContainText('Shift saved')
  await expect(rota.locator('[draggable="true"]')).toHaveCount(0)
})

test('project rota keeps the inherited shifts read-only and edits an override through fields', async ({ page }) => {
  await prepareSettings(page, 'admin')
  let submitted: Record<string, unknown> | undefined
  await page.route(/\/api\/orgs\/test-org\/rota\/shifts\/[^/]+$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    submitted = route.request().postDataJSON() as Record<string, unknown>
    const result = projectSettingsOperations.updateRotaShift.response.parse({
      id: '019a55e0-0000-7000-8000-000000000031',
      ...submitted
    })
    await route.fulfill({ status: 200, contentType: 'application/json', json: result })
  })
  await page.goto(`${projectPath}/settings/rota`)
  const rota = page.locator('[data-project-settings-rota]')
  const inherited = rota.locator('[aria-labelledby="project-rota-inherited-title"]')
  await expect(inherited).toContainText('Test Approver · approver@example.test')
  await expect(inherited.getByRole('button')).toHaveCount(0)
  const overrides = rota.locator('[aria-labelledby="project-rota-override-title"]')
  await overrides.getByRole('button', { name: 'Edit shift' }).click()
  const editor = rota.locator('[data-rota-editor]')
  await editor.locator('#rota-start').fill('15:00')
  await editor.getByRole('button', { name: 'Save shift' }).click()
  await expect.poll(() => submitted?.local_start).toBe('15:00')
  expect(submitted).toMatchObject({ project_id: projectFixtureData.projectId, account_id: adminId })
  await expect(rota.getByRole('status')).toContainText('Shift saved')
  await page.reload()
  await expect(page).toHaveURL(`${projectPath}/settings/rota`)
  await expect(page.locator('[data-project-settings-rota]')).toBeVisible()
})

test('share link creation selects access and expiry and shows its URL once', async ({ page }) => {
  await page.clock.install({ time: new Date(projectFixtureData.capturedAt) })
  await prepareSettings(page, 'admin')
  let submitted: Record<string, unknown> | undefined
  await page.route(/\/api\/projects\/[^/]+\/share-links$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submitted = route.request().postDataJSON() as Record<string, unknown>
    const result = projectSettingsOperations.createShareLink.response.parse({
      id: 'share-link-new',
      project_id: projectFixtureData.projectId,
      access: submitted.access,
      expires_at: '2026-11-19T13:12:00.000Z',
      revoked_at: null,
      last_used_at: null,
      token: 'once-only-secret',
      url: 'https://skyclause.test/share/once-only-secret',
      created_at: projectFixtureData.capturedAt
    })
    await route.fulfill({ status: 201, contentType: 'application/json', json: result })
  })
  await page.goto(`${projectPath}/settings/share`)
  const share = page.locator('[data-project-settings-share]')
  await expect(share.locator('#share-expiry')).toHaveValue('7')
  const listedLink = share.locator('ul li')
  await expect(listedLink).toContainText('Reviewer')
  await expect(listedLink).toContainText('Last used')
  await expect(listedLink.locator('time')).toHaveCount(2)
  await expect(listedLink.locator('time').nth(1)).toContainText('MYT')
  await share.locator('#share-access').selectOption('reviewer')
  await share.locator('#share-expiry').selectOption('14')
  await share.getByRole('button', { name: 'Create link' }).click()
  await expect.poll(() => submitted?.access).toBe('reviewer')
  expect(submitted).toEqual({ access: 'reviewer', expires_in_days: 14 })
  await expect(share.locator('#share-link-url')).toHaveValue('https://skyclause.test/share/once-only-secret')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await share.getByRole('button', { name: 'Copy link' }).click()
  await expect(share.getByRole('button', { name: 'Copied' })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(`${projectPath}/settings/share`)
  await expect(page.locator('[data-project-settings-share] #share-link-url')).toHaveCount(0)
  await expect(page.locator('[data-project-settings-share]')).not.toContainText('once-only-secret')
})

test('project settings panels fit phone, tablet and desktop widths with nothing clipped', async ({ page }) => {
  await prepareSettings(page, 'admin')
  const panels = [
    ['', '[data-project-settings-general]'],
    ['/rota', '[data-project-settings-rota]'],
    ['/share', '[data-project-settings-share]'],
    ['/public', '[data-unbuilt]']
  ] as const
  for (const [route, ready] of panels) {
    await page.goto(`${settingsRoute}${route}`)
    await expect(page.locator(ready)).toBeVisible()
    if (route === '/rota') {
      await page.getByRole('button', { name: 'Add a shift' }).click()
      await expect(page.locator('[data-rota-editor]')).toBeVisible()
    }
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => document.fonts.ready)
      await expectUnclippedText(page)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route} at ${width}`
      ).toBe(true)
    }
  }
})
