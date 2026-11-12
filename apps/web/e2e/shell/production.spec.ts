import { expect, test } from '@playwright/test'
import { addMember, makeAccount, makeOrg, signIn } from '@skyclause/auth/testing'
import { APP, APP_HOST, productionPage, secureCookie, startProductionServer } from '../harness/production-hosts'

// The shell's Sign out, the webhooks gate and the palette's search on the built server as production runs it
// (HOST_MODE=multi, the six origins, test-only routes off), with a real session and the real API behind the app
// host's `/api/v1` bridge: no read is a double. The dashboard's spec takes E2E_PORT + 60; this one the next port.
const port = Number(process.env.E2E_PORT ?? 3100) + 61

/** A real Owner of `orgId` with two sessions: the one the page uses, and another that must outlive its Sign out. */
async function owner(orgId: string) {
  const account = await makeAccount()
  await addMember(orgId, account.id, 'owner')
  const [page, other] = [await signIn(account.id), await signIn(account.id)]
  return { cookie: secureCookie(page.cookie), other: secureCookie(other.cookie), otherId: other.sessionId }
}

async function seeded() {
  const org = await makeOrg({ slug: `shell-${crypto.randomUUID().slice(0, 8)}` })
  return { org, shell: { org: { ...org, name: org.slug }, projects: [] }, ...(await owner(org.id)) }
}

test.describe('the shell on a production-style server', () => {
  test.describe.configure({ mode: 'serial' })
  let stop: (() => Promise<void>) | undefined
  test.beforeAll(async ({ request }) => {
    stop = await startProductionServer(port, request)
  })
  test.afterAll(async () => {
    await stop?.()
  })

  test('Sign out ends this session on the app host, lands on its sign-in page, and leaves other sessions', async ({
    browser,
    request
  }) => {
    const { shell, cookie, other, otherId } = await seeded()
    const { page, log, close } = await productionPage(browser, request, port, cookie, shell)
    try {
      await page.goto(`${APP}/account/profile`)
      await page.locator('.shell-bar').getByRole('button', { name: 'Organisation and account' }).click()
      await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
      await page.waitForURL(`${APP}/sign-in`)
      expect(log).toContain(`200 POST ${APP}/api/auth/sign-out`)
      const session = await page.evaluate(() => fetch('/api/auth/get-session').then((response) => response.json()))
      expect(session).toBeNull()
      const elsewhere = await request.get(`http://localhost:${port}/api/auth/get-session`, {
        headers: { host: APP_HOST, cookie: other }
      })
      expect(((await elsewhere.json()) as { session?: { id: string } } | null)?.session?.id).toBe(otherId)
    } finally {
      await close()
    }
  })

  test('a real Owner reaching webhooks by URL is told they are not available yet, never that they need an Admin', async ({
    browser,
    request
  }) => {
    const { org, shell, cookie } = await seeded()
    const { page, log, close } = await productionPage(browser, request, port, cookie, shell)
    try {
      for (const path of [`/${org.slug}/settings/webhooks`, '/developers/webhooks']) {
        await page.goto(`${APP}${path}`)
        await expect(page.locator('[data-not-built]')).toHaveText('Webhooks are not available yet.')
        await expect(page.getByText('Webhooks need an Admin of your organisation')).toHaveCount(0)
        await expect(page.locator('[data-source-error]')).toHaveCount(0)
      }
      expect(log.filter((line) => line.includes('/api/v1/webhooks'))).toEqual([
        `501 GET ${APP}/api/v1/webhooks?limit=50`
      ])
      // Nothing in the bar links to them.
      await page.locator('.shell-bar').getByRole('button', { name: 'Organisation and account' }).click()
      await expect(page.getByRole('menuitem', { name: 'Webhooks' })).toHaveCount(0)
    } finally {
      await close()
    }
  })

  test('typing in the palette still finds destinations while the organisation search is not available', async ({
    browser,
    request
  }) => {
    const { org, shell, cookie } = await seeded()
    const { page, log, close } = await productionPage(browser, request, port, cookie, shell)
    try {
      await page.goto(`${APP}/${org.slug}/projects`)
      await expect(page.locator('[data-palette-ready="true"]')).toBeAttached()
      await page
        .locator('.shell-bar')
        .getByRole('button', { name: /^Open command palette/ })
        .click()
      const dialog = page.getByRole('dialog', { name: 'Command palette' })
      await page.getByRole('combobox', { name: 'Search commands' }).fill('organisation')
      await expect.poll(() => log.some((line) => line.startsWith(`501 GET ${APP}/api/v1/search?`))).toBe(true)
      await expect(dialog.getByRole('option', { name: 'Organisation settings', exact: true })).toBeVisible()
      await expect(dialog.locator('[data-source-error]')).toHaveCount(0)
    } finally {
      await close()
    }
  })
})
