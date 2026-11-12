import { readFileSync } from 'node:fs'
import type { Principal, Role } from '@skyclause/contracts'
import { expect, test } from '../fixtures'
import { asPage, stubApi } from '../harness'
import { onboardingOperations } from '../../features/onboarding/operations'
import { sourceOperations } from '../../features/sources/operations'
import type { Request } from '@playwright/test'

const org = 'test-org'
const orgId = '019b7f4a-1e00-7000-8000-000000000001'
const projectId = '019b7f4a-1e00-7000-8000-000000000201'
const cherasId = '019b7f4a-1e00-7000-8000-000000000301'
const farId = '019b7f4a-1e00-7000-8000-000000000302'
const now = '2026-11-05T13:13:00.000Z'

function principal(role: Role = 'admin'): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: '019b7f4a-1e00-7000-8000-000000000010',
    sessionId: '019b7f4a-1e00-7000-8000-000000000011',
    authenticatedAt: new Date(now),
    orgId: org,
    role,
    isGuest: role === 'guest',
    staff: false
  }
}

function onboarding(projectDone = false, sourceDone = false) {
  return {
    steps: [
      { step: 'organisation', completed_at: now, skipped: false, result: 'APU organisation created', href: '/new' },
      {
        step: 'project',
        completed_at: projectDone ? now : null,
        skipped: false,
        result: projectDone ? 'APU Air Quality created' : null,
        href: `/${org}/new`
      },
      {
        step: 'sources',
        completed_at: sourceDone ? now : null,
        skipped: false,
        result: sourceDone ? 'CA16W bound · API 67, 13 min old' : null,
        href: `/${org}/apu-air-quality/settings/packs`
      },
      {
        step: 'window',
        completed_at: null,
        skipped: false,
        result: null,
        href: `/${org}/apu-air-quality/windows?declare=window`
      },
      { step: 'rota', completed_at: null, skipped: false, result: null, href: `/${org}/settings/rota` },
      {
        step: 'channel',
        completed_at: null,
        skipped: false,
        result: null,
        href: `/${org}/apu-air-quality/settings/channels`
      }
    ]
  }
}

const onboardingSteps = ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const

function skipFlowState(skipped: Set<string>) {
  return {
    steps: onboardingSteps.map((step) => ({
      step,
      completed_at: null,
      skipped: skipped.has(step),
      result: null,
      href: step === 'organisation' ? '/new' : `/${org}/new`
    }))
  }
}

async function tabTo(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await locator.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Keyboard traversal did not reach the onboarding action')
}

function projectRecord() {
  return {
    id: projectId,
    org_id: orgId,
    name: 'APU Air Quality',
    slug: 'apu-air-quality',
    time_zone: 'Asia/Kuala_Lumpur',
    public: false,
    semester_ends_on: null,
    site_name: 'APU',
    site_lat: 3.0559,
    site_lon: 101.6997,
    archived_at: null,
    camera_day_start: null,
    camera_day_end: null,
    warning_area_terms: [],
    packs: [
      { pack: 'sky', enabled: false, sheet_id: '019b7f4a-1e00-7000-8000-000000000401', schedule: null, sla_s: 600 },
      { pack: 'crowd', enabled: false, sheet_id: '019b7f4a-1e00-7000-8000-000000000402', schedule: null, sla_s: 7200 }
    ]
  }
}

function catalogue() {
  const captured = JSON.parse(
    readFileSync(
      new URL('../../../../docs/sources/eqms.doe.gov.my/mapcaqm-20261105T1313Z.json', import.meta.url),
      'utf8'
    )
  ) as {
    data: Array<{
      STATION_ID: string
      STATION_LOCATION: string
      LONGITUDE: number
      LATITUDE: number
      API: number
      CLASS: string
      RECORD_DT: string
    }>
  }
  return ['CA16W', 'CA01R'].map((stationId, index) => {
    const row = captured.data.find((item) => item.STATION_ID === stationId)!
    const id = index === 0 ? cherasId : farId
    return {
      id,
      kind: 'apims',
      external_id: row.STATION_ID,
      owner_org_id: null,
      name: row.STATION_LOCATION,
      lat: row.LATITUDE,
      lon: row.LONGITUDE,
      distance_km: null, // The picker requests no near point.
      url: 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm',
      cadence_s: 3600,
      stale_after_s: 7200,
      licence_id: 'unpublished',
      licence_label: 'no published terms',
      latest_reading: {
        id: index === 0 ? '019b7f4a-1e00-7000-8000-000000000501' : '019b7f4a-1e00-7000-8000-000000000502',
        source_id: id,
        poll_id: null,
        metric: 'api',
        unit: null,
        observed_at: '2026-11-05T13:00:00.000Z',
        received_at: '2026-11-05T13:01:00.000Z',
        value: row.API,
        value_text: row.CLASS,
        value_json: null,
        device_time: null,
        item_key: null,
        revision: '0'
      },
      age_s: 780,
      source_state: {
        state: index === 0 ? 'error' : 'fresh',
        since: now,
        http_status: index === 0 ? 503 : 200,
        pending_until: null
      }
    }
  })
}

test('project form shows inline slug errors, announces saving, and sends Crowd to its source step', async ({
  page,
  expectAxeClean
}) => {
  await asPage(page, principal())
  let creates = 0
  let submitted: Record<string, unknown> | undefined
  await stubApi(page, 'getOnboarding', () => onboarding(creates > 0), { registry: onboardingOperations })
  await stubApi(page, 'createProject', projectRecord(), { registry: onboardingOperations })
  await stubApi(
    page,
    'listProjects',
    { data: [projectRecord()], next_cursor: null },
    { registry: onboardingOperations }
  )
  await stubApi(page, 'listProjectSources', { data: [], next_cursor: null }, { registry: sourceOperations })
  await stubApi(page, 'listCatalogueSources', { data: catalogue(), next_cursor: null }, { registry: sourceOperations })
  await page.route('**/api/orgs/test-org/projects', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    creates++
    submitted = route.request().postDataJSON() as Record<string, unknown>
    if (creates <= 2) {
      const reason = creates === 1 ? 'reserved' : 'taken'
      const type = creates === 1 ? 'slug-reserved' : 'slug-taken'
      const detail = creates === 1 ? 'This slug is reserved.' : 'This slug is already in use.'
      await new Promise((resolve) => setTimeout(resolve, 160))
      return route.fulfill({
        status: 422,
        json: {
          type: `https://api.skyclause.m1ku.tech/problems/${type}`,
          title: type,
          status: 422,
          field: 'slug',
          reason,
          errors: [{ in: 'body', pointer: '/slug', detail }]
        }
      })
    }
    return route.fulfill({ status: 201, json: projectRecord() })
  })
  await page.goto(`/${org}/new`)
  await expectAxeClean(page)
  const form = page.locator('[data-project-create]')
  await expect(form.getByLabel('Project name')).toBeVisible()
  await expect(form.getByLabel('Project slug')).toHaveAttribute('spellcheck', 'false')
  await expect(form.getByLabel('Time zone')).toHaveValue('Asia/Kuala_Lumpur')
  await expect(form.getByLabel('Project name')).toHaveAttribute('autocomplete', 'off')
  await form.getByLabel('Project name').fill('APU Air Quality')
  await form.getByLabel('Project slug').fill('new')
  await form.getByLabel('Site name').fill('APU')
  await form.getByLabel('Latitude').fill('3.0559')
  await form.getByLabel('Longitude').fill('101.6997')
  await form.getByLabel('Crowd').check()
  const submit = form.getByRole('button', { name: 'Create project' })
  await submit.click()
  await expect(form.getByRole('button', { name: 'Saving…' })).toBeVisible()
  await expect(form.getByText('This slug is reserved.')).toBeVisible()
  await expect(form.getByLabel('Project slug')).toBeFocused()

  await form.getByLabel('Project slug').fill('apu-air-quality')
  await submit.click()
  await expect(form.getByText('This slug is already in use.')).toBeVisible()
  await expect(form.getByLabel('Project slug')).toBeFocused()
  await submit.click()
  await expect(page).toHaveURL(/\/test-org\/apu-air-quality\/settings\/packs/)
  expect(submitted).toMatchObject({ packs: ['sky', 'crowd'], site_lat: 3.0559, site_lon: 101.6997 })
  const panel = page.locator('[data-settings-panel]')
  await expect(panel.getByText('Needs a rail station with gate taps and a venue with listings.')).toBeVisible()
  await page.goto(`/${org}/new`)
  await expect(page).toHaveURL(/\/test-org\/apu-air-quality\/settings\/packs/)
  await page.reload()
  const progress = page.locator('[data-first-run-progress]')
  await expect(progress.getByText('2 of 6 steps complete')).toBeVisible()
  // The open step is this page: it says so instead of linking to itself, and the steps after it still link on.
  const sources = progress.locator('li[data-state="current"]')
  await expect(sources).toContainText('Bind sources')
  await expect(sources).toContainText('You are here')
  await expect(progress.locator('a[href="/test-org/apu-air-quality/settings/packs"]')).toHaveCount(0)
  await expect(progress.locator('a[href="/test-org/apu-air-quality/windows?declare=window"]')).toBeVisible()
})

test('source picker sorts captured APIMS rows, finds CA16W, allows an erroring source, and creates no extra rows', async ({
  page,
  expectAxeClean
}) => {
  await asPage(page, principal())
  let binds = 0
  let sourceBound = false
  let boundSourceCount = 0
  const firstSource = catalogue()[0]!
  const bound = {
    ...firstSource,
    project_id: projectId,
    role: 'api_station',
    state: firstSource.source_state!,
    recent_errors: []
  }
  await stubApi(page, 'getOnboarding', () => onboarding(true, sourceBound), { registry: onboardingOperations })
  await stubApi(
    page,
    'listProjects',
    { data: [projectRecord()], next_cursor: null },
    { registry: onboardingOperations }
  )
  await stubApi(
    page,
    'listProjectSources',
    () => {
      const data = sourceBound ? [bound] : []
      boundSourceCount = data.length
      return { data, next_cursor: null }
    },
    { registry: sourceOperations }
  )
  await stubApi(page, 'listCatalogueSources', { data: catalogue(), next_cursor: null }, { registry: sourceOperations })
  await stubApi(
    page,
    'bindSource',
    () => {
      binds++
      sourceBound = true
      return bound
    },
    { registry: sourceOperations }
  )
  await stubApi(
    page,
    'unbindSource',
    () => {
      sourceBound = false
      return undefined
    },
    { registry: sourceOperations }
  )
  const writes: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url()).pathname
    if (request.method() !== 'GET' && (url.includes('/windows') || url.includes('/calls'))) writes.push(url)
  })

  await page.goto(`/${org}/apu-air-quality/settings/packs`)
  const panel = page.locator('[data-settings-panel]')
  await expect(panel.locator('[data-project-packs]')).toBeVisible()
  await expect(panel.getByLabel('Crowd')).toBeVisible()
  await expect(panel.getByLabel('Crowd')).toHaveAttribute('name', 'pack')
  await panel.getByRole('button', { name: 'Add source' }).click()
  const picker = page.getByRole('dialog', { name: 'Bind sources' })
  await expect(picker).toBeVisible()
  const closest = picker.getByRole('row').nth(1)
  await expect(closest).toContainText('CA16W')
  await expect(closest).toContainText('5.9 km')
  await expect(closest.getByRole('cell', { name: 'no published terms' })).toBeVisible()
  await expect(closest).toContainText('Hourly')
  await expect(closest).toContainText(/67\s*API/)
  await expect(closest).toContainText(/error.*HTTP 503/i)
  await expect(picker.getByRole('row').nth(2)).toContainText('CA01R')
  await picker.getByLabel('Search sources').fill('CA16W')
  await expect(picker.getByText('CA01R')).toHaveCount(0)
  await picker.getByRole('button', { name: 'Bind CA16W' }).click()
  await expect(picker.getByRole('status')).toHaveText('Source bound.')
  await expect(page.locator('[data-first-run-progress]').getByText('CA16W bound · API 67, 13 min old')).toBeVisible()
  await expectAxeClean(page)
  expect(binds).toBe(1)
  expect(boundSourceCount).toBe(1)
  expect(writes).toEqual([])
  await picker.getByRole('button', { name: 'Close' }).click()
  await expect(picker).toHaveCount(0)
  // Unbinding asks first in a dialog that names the source, and says what it did afterwards.
  await panel.getByRole('button', { name: 'Unbind CA16W' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Unbind source “CA16W”', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Unbind CA16W' })).toHaveCount(0)
  await expect(panel.getByRole('status').filter({ hasText: 'Unbound CA16W.' })).toBeVisible()
  await expect(panel.getByText('No sources are bound yet.')).toBeVisible()
  expect(boundSourceCount).toBe(0)
})

test('Crowd stays off until the rail station and venue are both bound', async ({ page, expectAxeClean }) => {
  await asPage(page, principal())
  const captured = catalogue()
  const railId = '019b7f4a-1e00-7000-8000-000000000601'
  const venueId = '019b7f4a-1e00-7000-8000-000000000602'
  const rail = {
    ...captured[0]!,
    id: railId,
    kind: 'rapidrail_od',
    external_id: 'SP17',
    name: 'Bukit Jalil',
    lat: 3.054,
    lon: 101.7001,
    url: 'https://data.gov.my/rail',
    cadence_s: 86_400,
    stale_after_s: 172_800,
    licence_id: 'cc-by-4.0',
    licence_label: 'CC BY 4.0',
    latest_reading: {
      ...captured[0]!.latest_reading!,
      id: '019b7f4a-1e00-7000-8000-000000000701',
      source_id: railId,
      metric: 'exits',
      unit: 'people'
    }
  }
  const venue = {
    ...captured[1]!,
    id: venueId,
    kind: 'golive',
    external_id: 'APU-VENUES',
    name: 'APU venue listings',
    lat: 3.0559,
    lon: 101.6997,
    url: 'https://example.test/apu-venues',
    latest_reading: {
      ...captured[1]!.latest_reading!,
      id: '019b7f4a-1e00-7000-8000-000000000702',
      source_id: venueId,
      metric: 'listing_count'
    }
  }
  const sources = [...captured, rail, venue]
  const boundSources = new Map<string, Record<string, unknown>>()
  const writes: string[] = []
  let crowdUpdates = 0
  const boundSource = (source: (typeof sources)[number], role: 'rail_station' | 'venue_listings') => ({
    ...source,
    project_id: projectId,
    role,
    state: source.source_state!,
    recent_errors: []
  })

  await stubApi(page, 'getOnboarding', () => onboarding(true, boundSources.size > 0), {
    registry: onboardingOperations
  })
  await stubApi(
    page,
    'listProjects',
    { data: [projectRecord()], next_cursor: null },
    { registry: onboardingOperations }
  )
  await stubApi(page, 'listProjectSources', () => ({ data: [...boundSources.values()], next_cursor: null }), {
    registry: sourceOperations
  })
  await stubApi(page, 'listCatalogueSources', { data: sources, next_cursor: null }, { registry: sourceOperations })
  await stubApi(
    page,
    'bindSource',
    (request: Request) => {
      const sourceId = (request.postDataJSON() as { source_id: string }).source_id
      const source = sources.find((item) => item.id === sourceId)!
      const role = source.id === railId ? 'rail_station' : 'venue_listings'
      const result = boundSource(source, role)
      boundSources.set(sourceId, result)
      return result
    },
    { registry: sourceOperations }
  )
  await stubApi(
    page,
    'updateProjectPack',
    () => {
      crowdUpdates++
      return {
        pack: 'crowd',
        enabled: true,
        sheet_id: '019b7f4a-1e00-7000-8000-000000000402',
        schedule: null,
        sla_s: 7200
      }
    },
    { registry: sourceOperations }
  )
  page.on('request', (request) => {
    const url = new URL(request.url()).pathname
    if (request.method() !== 'GET' && (url.includes('/windows') || url.includes('/calls'))) writes.push(url)
  })

  await page.goto(`/${org}/apu-air-quality/settings/packs?pack=crowd`)
  const panel = page.locator('[data-settings-panel]')
  const crowd = panel.getByLabel('Crowd')
  const picker = page.getByRole('dialog', { name: 'Bind sources' })
  await expect(crowd).not.toBeChecked()
  await expect(picker).toBeVisible()
  await expectAxeClean(page)
  await picker.getByRole('button', { name: 'Bind SP17' }).click()
  await expect(picker).toBeVisible()
  await expect(crowd).not.toBeChecked()
  expect(crowdUpdates).toBe(0)
  await picker.getByRole('button', { name: 'Bind APU-VENUES' }).click()
  await expect(picker).toHaveCount(0)
  await expect(crowd).toBeChecked()
  await expectAxeClean(page)
  expect(crowdUpdates).toBe(1)
  expect(boundSources.size).toBe(2)
  expect(writes).toEqual([])
})

test('device token is visible once and cleared when its dialog closes', async ({ page, expectAxeClean }) => {
  await asPage(page, principal())
  const device = {
    source_id: '019b7f4a-1e00-7000-8000-000000000701',
    token: 'skc_test_device_token_once',
    scope: 'ingest' as const,
    kind: 'pi' as const,
    name: 'North entrance Pi'
  }
  await stubApi(page, 'getOnboarding', onboarding(true), { registry: onboardingOperations })
  await stubApi(
    page,
    'listProjects',
    { data: [projectRecord()], next_cursor: null },
    { registry: onboardingOperations }
  )
  await stubApi(page, 'listProjectSources', { data: [], next_cursor: null }, { registry: sourceOperations })
  await stubApi(page, 'createDevice', device, { registry: sourceOperations })

  await page.goto(`/${org}/apu-air-quality/settings/packs`)
  const panel = page.locator('[data-settings-panel]')
  await panel.getByRole('button', { name: 'Add a camera or Pi' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a camera or Pi' })
  await dialog.getByLabel('Device name').fill('North entrance Pi')
  await dialog.getByLabel('Device type').selectOption('pi')
  await dialog.getByRole('button', { name: 'Create device' }).click()
  const tokenDialog = page.getByRole('dialog', { name: 'Device token' })
  await expect(tokenDialog.getByText(device.token)).toBeVisible()
  await expectAxeClean(page)
  await tokenDialog.getByRole('button', { name: 'Close' }).first().click()
  await expect(tokenDialog).toHaveCount(0)
  await panel.getByRole('button', { name: 'Add a camera or Pi' }).click()
  const addDialog = page.getByRole('dialog', { name: 'Add a camera or Pi' })
  await expect(addDialog.getByText(device.token)).toHaveCount(0)
})

test('Crowd prerequisite errors name the missing venue and rail station beside the toggle', async ({ page }) => {
  await asPage(page, principal())
  const prerequisites = {
    type: 'https://api.skyclause.m1ku.tech/problems/pack-prerequisites',
    title: 'Pack prerequisites missing',
    status: 422,
    detail: 'Crowd needs a rail station with gate taps and a venue with listings.'
  }
  await stubApi(page, 'getOnboarding', onboarding(true), { registry: onboardingOperations })
  await stubApi(
    page,
    'listProjects',
    { data: [projectRecord()], next_cursor: null },
    { registry: onboardingOperations }
  )
  await stubApi(page, 'listProjectSources', { data: [], next_cursor: null }, { registry: sourceOperations })
  await stubApi(page, 'listCatalogueSources', { data: catalogue(), next_cursor: null }, { registry: sourceOperations })
  await stubApi(page, 'updateProjectPack', prerequisites, { registry: sourceOperations, status: 422 })

  await page.goto(`/${org}/apu-air-quality/settings/packs`)
  const panel = page.locator('[data-settings-panel]')
  // Turning a pack on asks first, naming the project; the confirmation sends the change.
  await panel.getByLabel('Crowd').click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm.getByRole('heading')).toContainText('Turn on Crowd for')
  await confirm.getByRole('button', { name: /^Turn on Crowd for/ }).click()
  await expect(panel.getByText(prerequisites.detail)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Bind sources' })).toBeVisible()
})

test('keyboard users can skip and resume each onboarding step', async ({ page }) => {
  await asPage(page, principal())
  const skipped = new Set<string>()
  const getState = () => skipFlowState(skipped)
  await stubApi(page, 'getOnboarding', getState, { registry: onboardingOperations })
  await stubApi(
    page,
    'skipOnboardingStep',
    (request: Request) => {
      const step = new URL(request.url()).pathname.split('/').at(-2)!
      skipped.add(step)
      return getState()
    },
    { registry: onboardingOperations }
  )
  await stubApi(
    page,
    'resumeOnboardingStep',
    (request: Request) => {
      const step = new URL(request.url()).pathname.split('/').at(-2)!
      skipped.delete(step)
      return getState()
    },
    { registry: onboardingOperations }
  )

  await page.goto(`/${org}/new`)
  const progress = page.locator('[data-first-run-progress]')
  for (let step = 0; step < onboardingSteps.length; step++) {
    const skip = progress.getByRole('button', { name: 'Skip this step' }).first()
    await tabTo(page, skip)
    await page.keyboard.press('Enter')
  }
  await expect(progress.getByText('6 of 6 steps complete')).toBeVisible()
  expect(skipped.size).toBe(6)

  for (let step = 0; step < onboardingSteps.length; step++) {
    const resume = progress.getByRole('button', { name: 'Resume' }).first()
    await tabTo(page, resume)
    await page.keyboard.press('Enter')
  }
  await expect(progress.getByText('0 of 6 steps complete')).toBeVisible()
  expect(skipped.size).toBe(0)
})

test('project creation route admits Owner and Admin only', async ({ page, expectAxeClean }) => {
  await stubApi(page, 'getOnboarding', onboarding(), { registry: onboardingOperations })
  for (const role of ['owner', 'admin'] as const) {
    await asPage(page, principal(role))
    await page.goto(`/${org}/new`)
    await expect(page.locator('[data-project-create]')).toBeVisible()
    await expectAxeClean(page)
  }

  for (const role of ['approver', 'editor', 'viewer', 'guest'] as const) {
    await asPage(page, principal(role))
    await page.goto(`/${org}/new`)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  }

  await asPage(page, {
    kind: 'share_link',
    client: 'app',
    clientName: null,
    linkId: '019b7f4a-1e00-7000-8000-000000000801',
    orgId: org,
    projectId,
    access: 'view'
  })
  await page.goto(`/${org}/new`)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

  await page.context().addCookies([
    {
      name: 'skyclause_test_principal',
      value: 'null',
      url: process.env.E2E_BASE_URL ?? 'http://localhost:3342',
      httpOnly: true,
      sameSite: 'Lax'
    }
  ])
  await page.goto(`/${org}/new`)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
