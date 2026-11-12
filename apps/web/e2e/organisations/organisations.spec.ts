import type { Page } from '@playwright/test'
import type { Principal } from '@skyclause/contracts'
import { expect, test } from '../fixtures'
import { asPage } from '../harness'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import { addMember } from '@skyclause/auth/testing'
import { stubApi } from '../harness/stub-api'
import { organisationOperations, type ProjectListItem } from '../../features/organisations/operations'

function principal(role: 'owner' | 'viewer', orgId = 'test-org'): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date('2026-11-06T00:00:00Z'),
    orgId,
    role,
    isGuest: false,
    staff: false
  }
}

const packs = [
  { pack: 'sky', enabled: true, sheet_id: 'sheet-sky', schedule: null, sla_s: 600 },
  { pack: 'crowd', enabled: false, sheet_id: 'sheet-crowd', schedule: null, sla_s: 7200 }
] as const

function project(patch: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: 'project-test',
    org_id: 'org-test',
    name: 'Bukit Jalil',
    slug: 'bukit-jalil',
    time_zone: 'Asia/Kuala_Lumpur',
    public: false,
    semester_ends_on: null,
    site_name: 'APU Campus',
    site_lat: 3.05,
    site_lon: 101.7,
    archived_at: null,
    camera_day_start: null,
    camera_day_end: null,
    warning_area_terms: [],
    packs: [...packs],
    ...patch
  } as ProjectListItem
}

// HTTP test doubles of listProjects' answer with summaries, never application data.
const summarized = (): ProjectListItem =>
  project({
    summary: {
      pack_states: [
        {
          pack: 'sky',
          basis: 'engine_verdict',
          call_id: null,
          mode: 'commute_disruption',
          watch: false,
          no_call: {
            inputs: [{ name: 'gauge', source_id: '0232901RF', state: 'fresh', since: '2026-11-02T06:00:00Z' }]
          }
        },
        { pack: 'crowd', basis: null, call_id: null, mode: null, watch: false, no_call: null }
      ],
      windows_at_risk: 2,
      signal_health: { state: 'fresh', inputs_reporting: 3, oldest_age_s: 300 },
      latest_bundle: null,
      next_night: null,
      next_storm_date: null,
      next_action: null
    }
  })

async function stubProjects(page: Page, data: ProjectListItem[]) {
  await stubApi(page, 'listProjects', { data, next_cursor: null }, { registry: organisationOperations })
}

test('/new sends a visitor with no session to sign in first, and back', async ({ page }) => {
  await page.goto('/new')
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fnew$/)
})

test('ORG-1 reserved and taken slugs are refused inline with the reason and focus (real session)', async ({ page }) => {
  await makeOrg({ slug: 'taken-slope' })
  await signInAs(page, 'owner', await makeOrg())
  await page.goto('/new')
  await page.getByLabel('Organisation name').fill('Taken org')
  await page.getByLabel('Slug').fill('taken-slope')
  await page.getByRole('button', { name: 'Create organisation' }).click()
  await expect(page.getByText('taken-slope is taken. Choose another slug.')).toBeVisible()
  await expect(page.getByLabel('Slug')).toBeFocused()

  await page.getByLabel('Slug').fill('new')
  await expect(page.getByText('new is reserved. Choose another slug.')).toBeVisible()
})

test('creating an organisation continues to the first run next step', async ({ page }) => {
  await signInAs(page, 'owner', await makeOrg())
  const slug = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await page.goto('/new')
  await page.getByLabel('Organisation name').fill('E2E Org')
  await expect(page.getByLabel('Slug')).toHaveValue('e2e-org')
  await page.getByLabel('Slug').fill(slug)
  await page.getByRole('button', { name: 'Create organisation' }).click()
  await expect(page).toHaveURL(`/${slug}/new`)
})

test('ORG-5 with zero projects an owner sees n=0 and Create a project', async ({ page }) => {
  await asPage(page, principal('owner'))
  await stubProjects(page, [])
  await page.goto('/test-org/projects')
  await expect(page.getByText(/No projects yet \(n=0\)/)).toBeVisible()
  const create = page.getByRole('link', { name: 'Create a project' })
  await expect(create).toBeVisible()
  await expect(create).toHaveAttribute('href', '/test-org/new')
})

test('ORG-5 without project.manage the empty page asks for an Admin', async ({ page }) => {
  await asPage(page, principal('viewer'))
  await stubProjects(page, [])
  await page.goto('/test-org/projects')
  await expect(page).toHaveURL('/test-org/projects')
  await expect(page.getByText('Ask an Admin to create a project')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create a project' })).toHaveCount(0)
})

test('ORG-5 a stubbed summary shows pack modes, the No call text, review counts and signal health', async ({
  page
}) => {
  await asPage(page, principal('owner'))
  await stubProjects(page, [summarized()])
  await page.goto('/test-org/projects')
  await expect(page.getByRole('heading', { name: 'Bukit Jalil' })).toBeVisible()
  await expect(page.getByText('No call: gauge since 14:00 MYT')).toBeVisible()
  await expect(page.getByText(/2 need review/)).toBeVisible()
  await expect(page.getByText(/Signal health: Fresh input/)).toBeVisible()
})

test('ORG-5 with only archived projects the page says no active ones and still reaches the archived list', async ({
  page
}) => {
  await asPage(page, principal('owner'))
  await stubProjects(page, [
    project({ id: 'project-old', name: 'Old project', slug: 'old', archived_at: '2026-10-01T00:00:00Z' })
  ])
  await page.goto('/test-org/projects')
  await expect(page.getByText(/No active projects/)).toBeVisible()
  await expect(page.getByText(/No projects yet/)).toHaveCount(0)
  await page.getByRole('link', { name: 'Show archived' }).click()
  await expect(page).toHaveURL(/archived=1/)
  await expect(page.getByRole('heading', { name: 'Old project' })).toBeVisible()
  await page.getByRole('link', { name: 'Hide archived' }).click()
  await expect(page.getByText(/No active projects/)).toBeVisible()
})

test('ACC-9 an Owner in A and Viewer in B sees Create on /a/projects only', async ({ page }) => {
  const a = await makeOrg()
  const b = await makeOrg()
  const { accountId } = await signInAs(page, 'owner', a)
  await addMember(b.id, accountId, 'viewer')
  await stubProjects(page, [])
  await page.goto(`/${a.slug}/projects`)
  await expect(page).toHaveURL(`/${a.slug}/projects`)
  await expect(page.getByRole('link', { name: 'Create a project' })).toBeVisible()
  await page.goto(`/${b.slug}/projects`)
  await expect(page).toHaveURL(`/${b.slug}/projects`)
  await expect(page.getByText('Ask an Admin to create a project')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create a project' })).toHaveCount(0)
})

test('archived projects sit behind ?archived=1', async ({ page }) => {
  await asPage(page, principal('owner'))
  await stubProjects(page, [
    project(),
    project({ id: 'project-old', name: 'Old project', slug: 'old', archived_at: '2026-10-01T00:00:00Z' })
  ])
  await page.goto('/test-org/projects')
  await expect(page.getByRole('heading', { name: 'Bukit Jalil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Old project' })).toHaveCount(0)
  await page.goto('/test-org/projects?archived=1')
  await expect(page.getByRole('heading', { name: 'Old project' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bukit Jalil' })).toHaveCount(0)
})

test('general panel renames the organisation with the slug read-only', async ({ page }) => {
  // An explicit slug also names the organisation after it, so the field's starting value is known.
  const org = await makeOrg({ slug: `rename-${crypto.randomUUID().slice(0, 8)}` })
  await signInAs(page, 'owner', org)
  await page.goto(`/${org.slug}/settings/general`)
  await expect(page.getByLabel('Organisation name')).toHaveValue(org.slug)
  await expect(page.getByLabel(/Slug/)).toHaveValue(org.slug)
  await page.getByLabel('Organisation name').fill('Renamed org')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('Name saved.')).toBeVisible()
})

test('axe finds no serious or critical issues on /new, the general panel and the project list', async ({
  page,
  expectAxeClean
}) => {
  await signInAs(page, 'owner', await makeOrg())
  await page.goto('/new')
  await expectAxeClean(page)
  await asPage(page, principal('owner'))
  await stubProjects(page, [summarized()])
  await stubApi(
    page,
    'listMyMemberships',
    {
      data: [
        {
          id: 'membership-test',
          org_id: 'org-test',
          account_id: 'test-account',
          role: 'owner',
          reads_malay: false,
          org_name: 'Test organisation',
          org_slug: 'test-org'
        }
      ],
      next_cursor: null
    },
    { registry: organisationOperations }
  )
  await page.goto('/test-org/projects')
  await expect(page.getByRole('heading', { name: 'Bukit Jalil' })).toBeVisible()
  await expectAxeClean(page)
  await page.goto('/test-org/settings/general')
  await expect(page.getByLabel('Organisation name')).toBeVisible()
  await expectAxeClean(page)
})
