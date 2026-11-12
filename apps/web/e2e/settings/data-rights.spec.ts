import type { Locator, Page } from '@playwright/test'
import { AUDIT_ACTIONS, type Principal, type Role } from '@skyclause/contracts'
import { test, expect } from '../fixtures'
import { asPage } from '../harness'
import { stubApi } from '../harness/stub-api'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import { auditOperations } from '../../features/audit/operations'
import { dataOperations } from '../../features/data/operations'

const at = '2026-11-10T02:00:00Z'
const expiresAt = '2026-11-18T00:00:00Z'
const uuidV7 = (suffix: number) => `018f47a3-b2c1-7c00-8000-${suffix.toString(16).padStart(12, '0')}`
const projectId = uuidV7(1)
const actorId = uuidV7(2)
const filterTargetId = uuidV7(3)
const ids = {
  readyExport: uuidV7(10),
  expiredExport: uuidV7(11),
  queuedExport: uuidV7(12),
  runningExport: uuidV7(13),
  failedExport: uuidV7(14),
  newExport: uuidV7(15),
  accountReadyExport: uuidV7(16),
  accountNewExport: uuidV7(17),
  dialogExport: uuidV7(18),
  dialogAccountExport: uuidV7(19),
  memberNorthstar: uuidV7(20),
  memberWeatherLab: uuidV7(21)
}
const auditAction = AUDIT_ACTIONS[0]!

const settingsPanel = (page: Page) => page.locator('[data-settings-panel]')

function principal(role: Role = 'admin'): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date(at),
    orgId: 'test-org',
    role,
    isGuest: false,
    staff: false
  }
}

function auditEntry(index: number) {
  return {
    id: uuidV7(index + 100),
    project_id: projectId,
    actor_type: 'account',
    actor_id: actorId,
    actor_name: 'Aisha Rahman',
    actor_role: 'admin' as const,
    client: 'app' as const,
    client_name: null,
    action: auditAction,
    target_type: 'membership',
    target_id: uuidV7(index + 300),
    before: null,
    after: null,
    created_at: at
  }
}

function organisationExport(id: string, status: 'queued' | 'running' | 'ready' | 'failed' | 'expired') {
  return {
    id,
    scope: 'organisation' as const,
    status,
    formats: ['json', 'csv'] as const,
    error: null,
    expires_at: status === 'expired' ? '2026-11-09T00:00:00Z' : expiresAt,
    created_at: at,
    download_url: null
  }
}

function accountExport(id: string, status: 'queued' | 'running' | 'ready' | 'failed' | 'expired') {
  return {
    id,
    scope: 'account' as const,
    status,
    formats: ['json'] as const,
    error: null,
    expires_at: expiresAt,
    format: 'json' as const,
    created_at: at
  }
}

test('audit filters stay in the URL and CSV export sends the same filters', async ({ page }) => {
  await asPage(page, principal())
  await stubApi(page, 'listAuditEntries', { data: [], next_cursor: null }, { registry: auditOperations })
  await stubApi(page, 'exportAuditLog', 'id,action\n', { registry: auditOperations })
  await page.goto('/test-org/settings/audit')
  const panel = settingsPanel(page)
  const filters = panel.getByRole('group', { name: 'Audit filters' })
  await expect(panel.getByText('No audit entries yet (n=0)')).toBeVisible()

  for (const name of ['actor_id', 'target_type', 'target_id', 'project_id', 'from', 'to']) {
    await expect(filters.locator(`input[name="${name}"]`)).toHaveAttribute('autocomplete', 'off')
  }
  await expect(filters.locator('select[name="action"]')).toHaveAttribute('autocomplete', 'off')

  await filters.getByLabel('Actor ID', { exact: true }).fill(actorId)
  await filters.getByLabel('Action', { exact: true }).selectOption(auditAction)
  await filters.getByLabel('Target type', { exact: true }).fill('membership')
  await filters.getByLabel('Target ID', { exact: true }).fill(filterTargetId)
  await filters.getByLabel('Project ID', { exact: true }).fill(projectId)
  await filters.getByLabel('From', { exact: true }).fill('2026-11-01')
  await filters.getByLabel('To', { exact: true }).fill('2026-11-08')
  await expect(page).toHaveURL(new RegExp(`actor_id=${actorId}`))
  await page.reload()

  await expect(filters.getByLabel('Actor ID', { exact: true })).toHaveValue(actorId)
  await expect(filters.getByLabel('Action', { exact: true })).toHaveValue(auditAction)
  await expect(filters.getByLabel('Target ID', { exact: true })).toHaveValue(filterTargetId)
  await expect(filters.getByLabel('Project ID', { exact: true })).toHaveValue(projectId)
  await expect(filters.getByLabel('From', { exact: true })).toHaveValue('2026-11-01')
  await expect(filters.getByLabel('To', { exact: true })).toHaveValue('2026-11-08')

  const exportRequest = page.waitForRequest((request) => request.url().includes('/api/orgs/test-org/audit/export'))
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Export CSV' }).click()
  const request = await exportRequest
  const query = new URL(request.url()).searchParams
  expect(query.get('actor_id')).toBe(actorId)
  expect(query.get('action')).toBe(auditAction)
  expect(query.get('target_type')).toBe('membership')
  expect(query.get('target_id')).toBe(filterTargetId)
  expect(query.get('project_id')).toBe(projectId)
  expect(query.get('from')).toBe('2026-11-01T00:00:00+08:00')
  expect(query.get('to')).toBe('2026-11-08T23:59:59.999+08:00')
  expect(query.get('format')).toBe('csv')
  expect((await download).suggestedFilename()).toContain('audit')
})

test('audit pages by cursor, never rendering more than 50 records, as two-line rows on mobile', async ({ page }) => {
  await asPage(page, principal())
  await page.setViewportSize({ width: 375, height: 812 })
  await stubApi(
    page,
    'listAuditEntries',
    { data: Array.from({ length: 50 }, (_, index) => auditEntry(index)), next_cursor: 'audit-next' },
    { registry: auditOperations, query: { cursor: null } }
  )
  await stubApi(
    page,
    'listAuditEntries',
    { data: Array.from({ length: 30 }, (_, index) => auditEntry(index + 50)), next_cursor: null },
    { registry: auditOperations, query: { cursor: 'audit-next' } }
  )
  await page.goto('/test-org/settings/audit')
  const panel = settingsPanel(page)
  const rows = panel.locator('[data-audit-row]')
  const entries = panel.getByRole('region', { name: 'Audit entries' })
  await expect(rows).toHaveCount(50)
  await expect(panel.getByText('Records 1–50')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Newer' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Older' }).click()
  // The next page replaces the first: the ledger never holds more than one page.
  await expect(rows).toHaveCount(30)
  await expect(panel.getByText('Records 51–80')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Older' })).toBeDisabled()
  await expect(entries).toContainText('Aisha Rahman')
  await expect(entries).toContainText('admin')
  await expect(entries).toContainText(auditAction)
  await expect(entries).toContainText(`membership · ${uuidV7(350)}`)
  await expect(entries).toContainText('10 November 2026, 10:00 MYT')
  await expect
    .poll(() =>
      rows.first().evaluate((row) => {
        const style = getComputedStyle(row)
        return style.gridTemplateColumns.split(' ').length
      })
    )
    .toBe(2)
  await panel.getByRole('button', { name: 'Newer' }).click()
  await expect(rows).toHaveCount(50)
  await expect(panel.getByText('Records 1–50')).toBeVisible()
})

test('organisation data shows API export states, retention policy and a cancellable grace period', async ({ page }) => {
  await asPage(page, principal('owner'))
  await stubApi(
    page,
    'listOrganisationExports',
    {
      data: [
        organisationExport(ids.readyExport, 'ready'),
        organisationExport(ids.expiredExport, 'expired'),
        organisationExport(ids.queuedExport, 'queued'),
        organisationExport(ids.runningExport, 'running'),
        organisationExport(ids.failedExport, 'failed')
      ],
      next_cursor: null
    },
    { registry: dataOperations }
  )
  await stubApi(page, 'createOrganisationExport', organisationExport(ids.newExport, 'ready'), {
    registry: dataOperations
  })
  await stubApi(
    page,
    'getOrganisationDeletion',
    { deletion_requested_at: at, purge_after: '2026-12-10T02:00:00Z' },
    { registry: dataOperations }
  )
  await stubApi(
    page,
    'cancelOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    { registry: dataOperations }
  )
  await page.goto('/test-org/settings/data')
  const panel = settingsPanel(page)
  const exports = panel.getByRole('region', { name: 'Export jobs' })

  await expect(panel.getByText('Ready within 24 hours').first()).toBeVisible()
  await expect(panel.getByText('Link expires 18 November 2026')).toBeVisible()
  await expect(panel.getByRole('link', { name: `Download export ${ids.readyExport}` })).toHaveAttribute(
    'href',
    `/api/exports/${ids.readyExport}/download`
  )
  await expect(panel.getByText('This download link has expired. Request a new export.')).toBeVisible()
  await expect(exports.locator('[data-export-row]')).toHaveCount(5)
  await expect(exports).toContainText('Queued')
  await expect(exports).toContainText('Running')
  await expect(exports).toContainText('Ready')
  await expect(exports).toContainText('Failed')
  await expect(exports).toContainText('Expired')
  await expect(
    panel.getByRole('region', { name: 'Delete organisation' }).getByText('Deleted organisation')
  ).toBeVisible()
  await expect(
    panel.getByText('Deletion starts a 30-day grace period. You can cancel during this period.')
  ).toBeVisible()
  await expect(panel.getByText('The organisation will be purged on 10 December 2026.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Cancel deletion' })).toBeVisible()
  const retention = panel.getByRole('table', { name: 'Data retention' })
  await expect(retention.getByRole('row')).toHaveCount(11)
  for (const text of [
    'Readings and error rows',
    'Life of project',
    'Camera frames',
    'Until semester end, up to 183 days',
    'Raw bus positions',
    'Until segment times are computed, up to 24 hours',
    'Guest windows',
    '14 days',
    'Guest accounts',
    '30 days idle',
    'Subscriber records',
    'Until unsubscribe, then 30 days',
    'Ledger and audit',
    'Life of organisation',
    'Deleted organisation',
    '30-day grace period',
    'Export files',
    '7 days',
    'APU timetable NAME, SAMACCOUNTNAME and LECTID',
    'Never stored'
  ]) {
    await expect(retention).toContainText(text)
  }

  await panel.getByRole('button', { name: 'Request export' }).click()
  await expect(panel.getByRole('link', { name: `Download export ${ids.newExport}` })).toBeVisible()
  await panel.getByRole('button', { name: 'Cancel deletion' }).click()
  await expect(panel.getByText('Deletion is not scheduled.')).toBeVisible()
})

test('organisation export-pending is shown inline', async ({ page }) => {
  await asPage(page, principal('owner'))
  await stubApi(page, 'listOrganisationExports', { data: [], next_cursor: null }, { registry: dataOperations })
  await stubApi(
    page,
    'getOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    {
      registry: dataOperations
    }
  )
  await page.route('**/api/orgs/test-org/exports', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        json: { type: 'export-pending', title: 'An export is already being prepared.', status: 409 }
      })
    } else await route.fallback()
  })
  await page.goto('/test-org/settings/data')
  const panel = settingsPanel(page)
  await panel.getByRole('button', { name: 'Request export' }).click()
  await expect(panel.getByText('An export is already being prepared.')).toBeVisible()
})

test('organisation export list loads another cursor page and virtualises over 50 jobs', async ({ page }) => {
  await asPage(page, principal('owner'))
  const firstPage = Array.from({ length: 50 }, (_, index) => organisationExport(uuidV7(index + 500), 'ready'))
  const secondPage = Array.from({ length: 20 }, (_, index) => organisationExport(uuidV7(index + 600), 'ready'))
  await stubApi(
    page,
    'listOrganisationExports',
    { data: firstPage, next_cursor: 'exports-next' },
    { registry: dataOperations, query: { cursor: null } }
  )
  await stubApi(
    page,
    'listOrganisationExports',
    { data: secondPage, next_cursor: null },
    { registry: dataOperations, query: { cursor: 'exports-next' } }
  )
  await stubApi(
    page,
    'getOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    { registry: dataOperations }
  )
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/test-org/settings/data')
  const panel = settingsPanel(page)
  const jobs = panel.getByRole('region', { name: 'Export jobs' })
  await panel.getByRole('button', { name: 'Load more exports' }).click()
  await expect.poll(() => jobs.locator('[data-export-row]').count()).toBeLessThan(70)
  await expect(jobs.locator('[data-export-row]')).not.toHaveCount(0)
})

test('billing and retention tables reflow into two-line rows below 640px', async ({ page }) => {
  await asPage(page, principal('owner'))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/test-org/settings/billing')
  const panel = settingsPanel(page)
  const checkTwoLineRows = async (table: Locator) => {
    const firstRow = table.locator('tbody tr').first()
    const layout = await firstRow.evaluate((row) => {
      const heading = row.querySelector('th[scope="row"]')
      return {
        display: getComputedStyle(row).display,
        columns: getComputedStyle(row).gridTemplateColumns.split(' ').length,
        headingColumnEnd: heading ? getComputedStyle(heading).gridColumnEnd : null,
        dataCells: row.querySelectorAll('td').length
      }
    })
    expect(layout).toEqual({ display: 'grid', columns: 2, headingColumnEnd: '-1', dataCells: 2 })
  }

  await checkTwoLineRows(panel.getByRole('table'))
  await stubApi(page, 'listOrganisationExports', { data: [], next_cursor: null }, { registry: dataOperations })
  await stubApi(
    page,
    'getOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    { registry: dataOperations }
  )
  await page.goto('/test-org/settings/data')
  await checkTwoLineRows(panel.getByRole('table', { name: 'Data retention' }))
})

test('admins can read organisation data but do not get the owner-only deletion action', async ({ page }) => {
  await asPage(page, principal('admin'))
  await stubApi(page, 'listOrganisationExports', { data: [], next_cursor: null }, { registry: dataOperations })
  await stubApi(
    page,
    'getOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    { registry: dataOperations }
  )
  await page.goto('/test-org/settings/data')
  const panel = settingsPanel(page)
  await expect(panel.getByRole('table', { name: 'Data retention' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Request export' })).toBeEnabled()
  await expect(panel.getByRole('button', { name: 'Delete organisation' })).toHaveCount(0)
})

test('account export downloads and sole-owner refusal links every organisation to ownership transfer', async ({
  page
}) => {
  const first = await makeOrg({ slug: 'northstar' })
  const second = await makeOrg({ slug: 'weather-lab' })
  const { accountId, email } = await signInAs(page, 'owner', first)
  await stubApi(
    page,
    'listMyExports',
    { data: [accountExport(ids.accountReadyExport, 'ready')], next_cursor: null },
    {
      registry: dataOperations
    }
  )
  await stubApi(page, 'createMyExport', accountExport(ids.accountNewExport, 'ready'), { registry: dataOperations })
  await stubApi(
    page,
    'listMyMemberships',
    {
      data: [
        {
          id: ids.memberNorthstar,
          org_id: first.id,
          account_id: accountId,
          role: 'owner',
          reads_malay: false,
          org_name: 'Northstar',
          org_slug: first.slug
        },
        {
          id: ids.memberWeatherLab,
          org_id: second.id,
          account_id: accountId,
          role: 'owner',
          reads_malay: false,
          org_name: 'Weather Lab',
          org_slug: second.slug
        }
      ],
      next_cursor: null
    },
    { registry: dataOperations }
  )
  await page.route('**/api/me/deletion', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      json: { type: 'sole-owner', title: 'Transfer ownership before deleting this account.', status: 409 }
    })
  })
  await page.goto('/account/data')
  const panel = settingsPanel(page)

  await expect(panel.getByRole('link', { name: `Download account export ${ids.accountReadyExport}` })).toBeVisible()
  await panel.getByRole('button', { name: 'Request account export' }).click()
  await expect(panel.getByRole('link', { name: `Download account export ${ids.accountNewExport}` })).toBeVisible()
  await panel.getByRole('button', { name: 'Delete account' }).click()
  const dialog = page.getByRole('alertdialog')
  const confirm = dialog.getByRole('button', { name: /Delete account/ })
  const emailField = dialog.getByRole('textbox')
  await expect(confirm).toBeDisabled()
  await emailField.fill(email.toUpperCase())
  await expect(confirm).toBeDisabled()
  await emailField.fill(email)
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(panel.getByText('Transfer ownership before deleting this account.', { exact: true })).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Transfer ownership in Northstar' })).toHaveAttribute(
    'href',
    '/northstar/settings/members'
  )
  await expect(panel.getByRole('link', { name: 'Transfer ownership in Weather Lab' })).toHaveAttribute(
    'href',
    '/weather-lab/settings/members'
  )
})

test('P1 settings routes and destructive dialogs are payment-free and axe-clean in every theme', async ({
  page,
  baseURL,
  expectAxeClean
}) => {
  test.setTimeout(120_000)
  const org = await makeOrg({ slug: 'settings-audit' })
  await signInAs(page, 'owner', org)
  const panel = settingsPanel(page)
  await stubApi(page, 'listAuditEntries', { data: [], next_cursor: null }, { registry: auditOperations })
  await stubApi(page, 'exportAuditLog', 'id,action\n', { registry: auditOperations })
  await stubApi(page, 'listOrganisationExports', { data: [], next_cursor: null }, { registry: dataOperations })
  await stubApi(page, 'createOrganisationExport', organisationExport(ids.dialogExport, 'ready'), {
    registry: dataOperations
  })
  await stubApi(
    page,
    'getOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    {
      registry: dataOperations
    }
  )
  await stubApi(
    page,
    'requestOrganisationDeletion',
    { deletion_requested_at: at, purge_after: expiresAt },
    {
      registry: dataOperations
    }
  )
  await stubApi(
    page,
    'cancelOrganisationDeletion',
    { deletion_requested_at: null, purge_after: null },
    {
      registry: dataOperations
    }
  )
  await stubApi(page, 'listMyExports', { data: [], next_cursor: null }, { registry: dataOperations })
  await stubApi(page, 'createMyExport', accountExport(ids.dialogAccountExport, 'ready'), {
    registry: dataOperations
  })
  await stubApi(page, 'listMyMemberships', { data: [], next_cursor: null }, { registry: dataOperations })

  const modes = [
    { theme: 'dark', contrast: 'standard' },
    { theme: 'light', contrast: 'standard' },
    { theme: 'dark', contrast: 'more' }
  ] as const
  const paths = [
    `/${org.slug}/settings/billing`,
    `/${org.slug}/settings/audit`,
    `/${org.slug}/settings/data`,
    '/account/data'
  ]

  for (const mode of modes) {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify(mode),
        url: baseURL!
      }
    ])
    for (const path of paths) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveClass(mode.contrast === 'more' ? 'dark hc' : mode.theme)
      await expect(panel.locator('[data-unbuilt="a-settings-pages"]')).toHaveCount(0)
      await expect(panel.locator('input[autocomplete^="cc-"], iframe[src*="js.stripe.com"]')).toHaveCount(0)
      await expectAxeClean(page)
    }

    await page.goto(`/${org.slug}/settings/data`)
    await expect(panel.getByText('Loading exports…', { exact: true })).toBeHidden()
    await panel.getByRole('button', { name: 'Delete organisation' }).focus()
    await page.keyboard.press('Enter')
    const offer = page.getByRole('alertdialog')
    await expect(offer).toBeVisible()
    await expectAxeClean(page)
    await offer.getByRole('button', { name: 'Continue without export' }).focus()
    await page.keyboard.press('Enter')
    const typedOrg = page.getByRole('alertdialog')
    await expect(typedOrg).toBeVisible()
    await expectAxeClean(page)
    await page.keyboard.press('Escape')

    await page.goto('/account/data')
    await expect(panel.getByText('Loading exports…', { exact: true })).toBeHidden()
    await panel.getByRole('button', { name: 'Delete account' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectAxeClean(page)
    await page.keyboard.press('Escape')
  }
})
