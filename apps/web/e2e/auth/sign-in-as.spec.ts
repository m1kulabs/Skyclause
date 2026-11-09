// #94 (#79 §7): signInAs opens app pages on a database-minted session with its signed cookie, which the built server
// resolves through resolvePrincipal and the settings page helper, never the test principal cookie.
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { makeOrg, signInAs } from '../harness/sign-in-as'

async function expectSettings(page: Page, path: string) {
  const response = await page.goto(path)
  expect(response?.status(), path).toBe(200)
  await expect(page.locator('[data-settings-frame]')).toBeVisible()
}

async function expectNotFound(page: Page, path: string) {
  await page.goto(path)
  // Next may stream a 200 shell before a page-level notFound; the rendered 404 is the gate.
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  await expect(page.locator('[data-settings-frame]')).toHaveCount(0)
}

test('signInAs(approver, org) opens the organisation’s rota as an Approver; General is not found', async ({ page }) => {
  const org = await makeOrg()
  await signInAs(page, 'approver', org)
  await expectSettings(page, `/${org.slug}/settings/rota`)
  await expect(page.locator('[data-settings-nav] a')).toHaveCount(1)
  await expectNotFound(page, `/${org.slug}/settings/general`)
})

test('the session cookie is the only credential: Better Auth reads it, and another organisation is not found', async ({
  page
}) => {
  const [org, other] = [await makeOrg(), await makeOrg()]
  const { accountId } = await signInAs(page, 'owner', org)
  expect((await page.context().cookies()).map(({ name }) => name)).toEqual(['better-auth.session_token'])
  const session = await page.request.get('/api/auth/get-session')
  expect(((await session.json()) as { user: { id: string } }).user.id).toBe(accountId)
  await expectSettings(page, `/${org.slug}/settings/general`)
  await expectNotFound(page, `/${other.slug}/settings/general`)
})

test('a guest’s session opens Appearance and no other account page', async ({ page }) => {
  await signInAs(page, 'guest', await makeOrg())
  await expectSettings(page, '/account/appearance')
  await expectNotFound(page, '/account/profile')
})
