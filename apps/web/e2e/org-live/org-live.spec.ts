import { expect, test } from '../fixtures'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import { assertValidResponse } from '../harness/stub-api'
import { bundleDouble, ids as bundleIds } from '../bundles/doubles'
import { orgLiveOperations } from '../../features/org-live/operations'

const ids = {
  source: '019a45b0-0000-7000-8000-000000000051',
  bundleEvent: '019a45b0-0000-7000-8000-000000000052',
  escalatedEvent: '019a45b0-0000-7000-8000-000000000053',
  sourceErrorEvent: '019a45b0-0000-7000-8000-000000000054',
  duplicateSourceErrorEvent: '019a45b0-0000-7000-8000-000000000055',
  recoveredEvent: '019a45b0-0000-7000-8000-000000000056',
  recoveredErrorEvent: '019a45b0-0000-7000-8000-000000000057',
  approvalEvent: '019a45b0-0000-7000-8000-000000000058'
}

function event(orgId: string, id: string, type: string, data: Record<string, unknown>) {
  return {
    id,
    type,
    created_at: '2026-11-10T00:00:00.000Z',
    org_id: orgId,
    project_id: bundleIds.project,
    data
  }
}

function sseEvent(type: string, value: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`
}

function snapshot(count: number) {
  const needsReview = Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(12, '0')
    return { bundle_id: `019a45b0-0000-7000-8000-${suffix}`, sla_due_at: null }
  })
  return sseEvent('snapshot', { needs_review: needsReview, sources: [] })
}

const sourcePage = {
  data: [
    {
      id: ids.source,
      kind: 'met_warning',
      external_id: 'MET warning',
      owner_org_id: null,
      name: 'MET warning',
      lat: null,
      lon: null,
      url: 'https://api.data.gov.my/weather/warning',
      cadence_s: 300,
      stale_after_s: 900,
      licence_id: 'test-licence',
      licence_label: 'Test licence',
      project_id: bundleIds.project,
      role: 'warnings',
      state: { state: 'error', since: '2026-11-10T00:00:00.000Z', http_status: 503, pending_until: null },
      latest_reading: null,
      age_s: null,
      recent_errors: []
    }
  ],
  next_cursor: null
}

function project(orgId: string) {
  return {
    id: bundleIds.project,
    org_id: orgId,
    name: 'Test project',
    slug: 'test-project',
    time_zone: 'Asia/Kuala_Lumpur',
    public: false,
    semester_ends_on: null,
    site_name: null,
    site_lat: null,
    site_lon: null,
    archived_at: null,
    camera_day_start: null,
    camera_day_end: null,
    warning_area_terms: [],
    packs: []
  }
}

async function addAppearance(page: Parameters<typeof signInAs>[0], baseURL: string, theme: string) {
  await page.context().addCookies([
    {
      name: 'skyclause-test-appearance',
      value: JSON.stringify({
        theme: theme === 'high contrast' ? 'dark' : theme,
        contrast: theme === 'high contrast' ? 'more' : 'standard'
      }),
      url: baseURL
    }
  ])
}

test('review counts are axe-clean at 0, 1 and 12 in dark, light and high contrast', async ({
  page,
  baseURL,
  expectAxeClean
}) => {
  const org = await makeOrg()
  await signInAs(page, 'owner', org)
  let count = 0
  await page.route(/\/v1\/events\/stream$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: snapshot(count)
    })
  })

  for (const theme of ['dark', 'light', 'high contrast']) {
    for (const nextCount of [0, 1, 12]) {
      count = nextCount
      await addAppearance(page, baseURL!, theme)
      await page.goto(`/${org.slug}/settings/general`)
      await expect(page.locator('.app-shell')).toBeVisible()
      const bar = page.locator('.shell-bar')
      const badge = bar.locator('.shell-review-count')

      if (count === 0) {
        // A known zero prints no count: the control is just "Review", never "0".
        await expect(bar.getByRole('link', { name: 'Review', exact: true })).toBeVisible()
        await expect(badge).toHaveCount(0)
        await expect(page).not.toHaveTitle(/^\(\d+\) /)
        await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/icon.svg')
      } else {
        const accessibleName = `Review, ${count} waiting`
        await expect(bar.getByRole('link', { name: accessibleName })).toBeVisible()
        await expect(badge).toHaveAttribute('data-count', String(count))
        await expect(badge).toHaveText(String(count))
        await expect(page).toHaveTitle(new RegExp(`^\\(${count}\\) `))
        await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
          'href',
          `/brand/tab-${count > 9 ? '9+' : count}.svg`
        )
      }
      await expectAxeClean(page)
    }
  }
})

test('live events announce once, update the tab without navigation, and clear the final waiting count', async ({
  page,
  baseURL
}) => {
  const org = await makeOrg()
  await signInAs(page, 'owner', org)
  await addAppearance(page, baseURL!, 'dark')

  const needsReviewAt = new Date(Date.now() + 45 * 60_000).toISOString()
  const escalatedAt = new Date(Date.now() - 65_000).toISOString()
  const sourceErrorSince = '2026-11-10T00:00:00.000Z'
  const needsReviewData = {
    bundle_id: bundleIds.bundle,
    pack: 'sky',
    state: 'needs_review',
    call_ids: [bundleIds.first, bundleIds.second],
    sla_due_at: needsReviewAt
  }
  const needsReview = event(org.id, ids.bundleEvent, 'bundle.needs_review', needsReviewData)
  const escalated = event(org.id, ids.escalatedEvent, 'bundle.escalated', {
    ...needsReviewData,
    state: 'escalated',
    sla_due_at: escalatedAt,
    level: 'next_approver'
  })
  const sourceError = event(org.id, ids.sourceErrorEvent, 'source.error', {
    source_id: ids.source,
    state: 'error',
    since: sourceErrorSince,
    http_status: 503
  })
  const duplicateSourceError = event(org.id, ids.duplicateSourceErrorEvent, 'source.error', {
    source_id: ids.source,
    state: 'error',
    since: sourceErrorSince,
    http_status: 503
  })
  const recovered = event(org.id, ids.recoveredEvent, 'source.recovered', {
    source_id: ids.source,
    state: 'recovered',
    since: sourceErrorSince,
    http_status: 503
  })
  const recoveredError = event(org.id, ids.recoveredErrorEvent, 'source.error', {
    source_id: ids.source,
    state: 'error',
    since: sourceErrorSince,
    http_status: 503
  })
  const approved = event(org.id, ids.approvalEvent, 'bundle.approved', {
    ...needsReviewData,
    state: 'approved',
    sending_call_ids: [bundleIds.first],
    rejected_call_ids: [bundleIds.second]
  })

  let bundleRead = 0
  const needsReviewBundle = assertValidResponse(
    orgLiveOperations.getBundle,
    bundleDouble(undefined, { sla_due_at: needsReviewAt })
  )
  const escalatedBundle = assertValidResponse(
    orgLiveOperations.getBundle,
    bundleDouble(undefined, { sla_due_at: escalatedAt })
  )
  const projectBody = assertValidResponse(orgLiveOperations.getProject, project(org.id))
  const sourcesBody = assertValidResponse(orgLiveOperations.listProjectSources, sourcePage)
  await page.route(/\/v1\/bundles\/[^/]+$/, async (route) => {
    const bundle = bundleRead++ === 0 ? needsReviewBundle : escalatedBundle
    await route.fulfill({ status: 200, contentType: 'application/json', json: bundle })
  })
  await page.route(/\/v1\/projects\/[^/]+(?:\/sources)?(?:\?.*)?$/, async (route) => {
    const isSources = new URL(route.request().url()).pathname.endsWith('/sources')
    const body = isSources ? sourcesBody : projectBody
    await route.fulfill({ status: 200, contentType: 'application/json', json: body })
  })

  let streamRequests = 0
  let releaseEvents: (() => void) | undefined
  const eventResponseReady = new Promise<void>((resolve) => {
    releaseEvents = resolve
  })
  const organizationHeaders: Array<string | undefined> = []
  const documentRequests: string[] = []
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests.push(request.url())
    if (new URL(request.url()).pathname.endsWith('/v1/events/stream')) {
      const headers = request.headers()
      organizationHeaders.push(headers['skyclause-organization'])
      expect(headers['last-event-id']).toBeUndefined()
    }
  })
  await page.route(/\/v1\/events\/stream$/, async (route) => {
    streamRequests += 1
    if (streamRequests === 1) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: snapshot(0) })
    } else if (streamRequests === 2) {
      await eventResponseReady
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          sseEvent('bundle.needs_review', needsReview),
          sseEvent('bundle.escalated', escalated),
          sseEvent('source.error', sourceError),
          sseEvent('source.error', duplicateSourceError),
          sseEvent('source.recovered', recovered),
          sseEvent('source.error', recoveredError)
        ].join('')
      })
    } else if (streamRequests === 3) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseEvent('snapshot', {
          needs_review: [{ bundle_id: bundleIds.bundle, sla_due_at: needsReviewAt }],
          sources: [{ source_id: ids.source, state: { state: 'error', since: sourceErrorSince } }]
        })
      })
    } else if (streamRequests === 4) {
      await new Promise((resolve) => setTimeout(resolve, 1_200))
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [sseEvent('bundle.needs_review', needsReview), sseEvent('bundle.approved', approved)].join('')
      })
    } else {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: snapshot(0) })
    }
  })

  await page.goto(`/${org.slug}/settings/general`)
  await expect.poll(() => streamRequests).toBeGreaterThanOrEqual(2)
  await page.evaluate(() => {
    const windowWithAnnouncements = window as Window & { __skyclauseAnnouncements?: string[] }
    windowWithAnnouncements.__skyclauseAnnouncements = []
    let previous = ''
    new MutationObserver(() => {
      const message = document.getElementById('skyclause-announcer')?.textContent?.trim() ?? ''
      if (!message) {
        previous = ''
      } else if (message !== previous) {
        windowWithAnnouncements.__skyclauseAnnouncements?.push(message)
        previous = message
      }
    }).observe(document, { childList: true, characterData: true, subtree: true })
  })
  releaseEvents?.()
  const bar = page.locator('.shell-bar')
  await expect(bar.getByRole('link', { name: 'Review, 1 waiting' })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveTitle(/^\(1\) /)
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/brand/tab-1.svg')
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __skyclauseAnnouncements?: string[] }).__skyclauseAnnouncements)
    )
    .toHaveLength(4)

  const announcements = await page.evaluate(
    () => (window as Window & { __skyclauseAnnouncements?: string[] }).__skyclauseAnnouncements ?? []
  )
  expect(announcements[0]).toMatch(/^New bundle needs review: Commute disruption, Test project, \d+ min SLA$/)
  expect(announcements[1]).toMatch(/^Bundle escalated: Commute disruption, Test project, \d+ min past SLA$/)
  expect(announcements[2]).toMatch(/^MET warning error since \d{2}:\d{2} MYT$/)
  expect(announcements[3]).toMatch(/^MET warning error since \d{2}:\d{2} MYT$/)
  await expect.poll(() => streamRequests).toBeGreaterThanOrEqual(4)
  expect(organizationHeaders.length).toBeGreaterThanOrEqual(4)
  expect(organizationHeaders.every((header) => header === org.slug)).toBe(true)
  expect(documentRequests).toHaveLength(1)

  await expect(bar.locator('.shell-review-count')).toHaveCount(0, { timeout: 10_000 })
  await expect(page).not.toHaveTitle(/^\(\d+\) /)
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/icon.svg')
  expect(documentRequests).toHaveLength(1)
})
