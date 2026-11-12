import type { Page } from '@playwright/test'
import { asPage, stubApi } from '../harness'
import { windowsOperations } from '../../features/windows/operations'
import { onboardingOperations, type OnboardingView } from '../../features/onboarding/operations'
import type { WindowView } from '../../features/windows/operations'

// Test doubles for the 2 November 2026 15:30 release-wave replay (DESIGN voice and content).
// These are not captures of platform windows or calls. The platform did not yet exist.
export const projectId = '019a45a0-0000-7000-8000-000000000001'
export const windowId = '019a45a0-0000-7000-8000-000000000002'
export const skyBundle = '019a45a0-0000-7000-8000-000000000003'
export const crowdBundle = '019a45a0-0000-7000-8000-000000000004'
export const orgId = '019a45a0-0000-7000-8000-000000000005'
export const route = '/replay/bukit-jalil/windows?from=2026-11-02'
export const replayWindow: WindowView = {
  id: windowId,
  project_id: projectId,
  title: '2 November replay · 15:30 MYT release wave',
  kind: 'commute_wave',
  starts_at: '2026-11-02T07:30:00Z',
  ends_at: '2026-11-02T08:00:00Z',
  tz: 'Asia/Kuala_Lumpur',
  declared_by: 'replay-member',
  guest: false,
  via: 'app',
  expires_at: null,
  series_id: null,
  ics_feed_id: null,
  cancelled_at: null,
  share_link_id: null,
  moderation: 'visible',
  latest_calls: {
    sky: {
      id: '019a45a0-0000-7000-8000-000000000006',
      bundle_id: skyBundle,
      state: 'sent',
      mode: 'commute_disruption'
    },
    crowd: { id: '019a45a0-0000-7000-8000-000000000007', bundle_id: crowdBundle, state: 'drafted', mode: 'normal' }
  }
}
export const replayProject = {
  id: projectId,
  org_id: orgId,
  name: '2 November replay',
  slug: 'bukit-jalil',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: '2027-02-01',
  site_name: 'Bukit Jalil',
  site_lat: 3.0582,
  site_lon: 101.6922,
  archived_at: null,
  camera_day_start: '06:00',
  camera_day_end: '20:00',
  warning_area_terms: [],
  packs: []
}

const STEPS = ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const

/** A getOnboarding double: every step before `next` done, the rest open; with no `next`, every step done. */
export function onboarding(next?: (typeof STEPS)[number]): OnboardingView {
  const open = next ? STEPS.indexOf(next) : STEPS.length
  return {
    steps: STEPS.map((step, index) => ({
      step,
      completed_at: index < open ? '2026-11-02T01:00:00Z' : null,
      skipped: false,
      result: index < open ? `${step} done` : null,
      href: step === 'window' ? '/replay/bukit-jalil/windows?declare=window' : `/replay/${step}`
    }))
  }
}

export async function prepareWindows(
  page: Page,
  windows: WindowView[] = [replayWindow],
  steps: OnboardingView = onboarding()
) {
  await asPage(page, {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'replay-member',
    sessionId: 'replay-session',
    isGuest: false,
    staff: false,
    orgId,
    role: 'owner',
    authenticatedAt: new Date('2026-11-02T01:00:00Z')
  })
  await page.context().addCookies([
    {
      name: 'skyclause-test-shell',
      value: encodeURIComponent(
        JSON.stringify({
          memberships: [{ org_id: orgId, org_slug: 'replay', org_name: '2 November replay', role: 'owner' }],
          projects: [{ id: projectId, org_id: orgId, name: '2 November replay', slug: 'bukit-jalil' }]
        })
      ),
      url: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
      httpOnly: true
    }
  ])
  await stubApi(page, 'listProjects', { data: [replayProject], next_cursor: null }, { registry: windowsOperations })
  // An Owner's windows page carries the first-run steps, which hide once every step is done.
  await stubApi(page, 'getOnboarding', steps, { registry: onboardingOperations })
  for (const id of ['listWindows', 'listIcsFeeds', 'listProjectDays', 'listNights', 'listProjectBundles'] as const) {
    await stubApi(
      page,
      id,
      { data: id === 'listWindows' ? windows : [], next_cursor: null },
      { registry: windowsOperations }
    )
  }
}
