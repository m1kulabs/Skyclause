import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  addTestGoogleAccount,
  addTestPasskey,
  deleteTestAccount,
  getTestMagicLinkEnabled,
  makeAccount,
  setTestMagicLinkEnabled,
  setTestSessionUserAgent,
  signIn
} from '@skyclause/auth/testing'
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'

const accountIds: string[] = []

test.afterEach(async () => {
  for (const id of accountIds.splice(0)) await deleteTestAccount(id)
})

async function signedIn(page: Page) {
  const created = await makeAccount()
  accountIds.push(created.id)
  const login = await signIn(created.id)
  await page.context().addCookies(login.cookies)
  return { accountId: created.id, login }
}

interface E2EPasskey {
  id: string
  name: string | null
  createdAt: string
}

async function stubPasskeyApi(page: Page, initial: E2EPasskey[] = [], rejectDelete = false) {
  const passkeys = [...initial]
  await page.route('**/api/auth/passkey/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (pathname.endsWith('/list-user-passkeys') && request.method() === 'GET') {
      return json(200, passkeys)
    }
    if (pathname.endsWith('/generate-register-options') && request.method() === 'GET') {
      return json(200, {
        challenge: 'AQIDBAUGBwg',
        rp: { name: 'Skyclause', id: 'localhost' },
        user: { id: 'AQIDBAUGBwgJCgsM', name: 'test@example.test', displayName: 'Test Account' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        timeout: 60_000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'preferred'
        },
        excludeCredentials: []
      })
    }
    if (pathname.endsWith('/verify-registration') && request.method() === 'POST') {
      const body = request.postDataJSON() as { name?: string }
      const passkey = {
        id: `e2e-passkey-${passkeys.length + 1}`,
        name: body.name ?? null,
        createdAt: new Date().toISOString()
      }
      passkeys.push(passkey)
      return json(200, passkey)
    }
    if (pathname.endsWith('/update-passkey') && request.method() === 'POST') {
      const body = request.postDataJSON() as { id: string; name: string }
      const passkey = passkeys.find((item) => item.id === body.id)
      if (!passkey) return json(404, { code: 'not-found' })
      passkey.name = body.name
      return json(200, passkey)
    }
    if (pathname.endsWith('/delete-passkey') && request.method() === 'POST') {
      if (rejectDelete) return json(409, { code: 'last-sign-in-method' })
      const body = request.postDataJSON() as { id: string }
      const index = passkeys.findIndex((item) => item.id === body.id)
      if (index === -1) return json(404, { code: 'not-found' })
      passkeys.splice(index, 1)
      return json(200, { success: true })
    }
    return route.continue()
  })
}

test('ACC-3 profile name can be changed while email stays read-only', async ({ page }) => {
  const { accountId } = await signedIn(page)
  await page.goto('/account/profile')
  const email = page.getByLabel('Email')
  await expect(email).toHaveAttribute('readonly', '')
  await expect(email).toHaveValue(/.+/)
  const originalEmail = await email.inputValue()
  await page.getByLabel('Name').fill('Account Settings Test')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('[data-account-panel="profile"]').getByRole('status')).toHaveText('Name saved.')

  const response = await page.request.get('/api/auth/get-session')
  const body = (await response.json()) as { user: { id: string; name: string; email: string } }
  expect(body.user).toMatchObject({ id: accountId, name: 'Account Settings Test', email: originalEmail })
})

test('ACC-3 refuses removing the only passkey with the reason shown inline', async ({ page }) => {
  const { accountId } = await signedIn(page)
  await setTestMagicLinkEnabled(accountId, false)
  const { id } = await addTestPasskey(accountId, 'Laptop')
  await stubPasskeyApi(page, [{ id, name: 'Laptop', createdAt: new Date().toISOString() }], true)

  await page.goto('/account/security')
  const row = page.locator('[data-passkey-row]').filter({ hasText: 'Laptop' })
  await row.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove passkey' }).click()
  await expect(page.locator('[data-account-panel="security"]').getByRole('alert')).toHaveText(
    'This is your only way to sign in. Add a passkey or link Google first.'
  )
})

test('ACC-3 refuses disabling the only sign-in method with the reason shown inline', async ({ page }) => {
  const { accountId } = await signedIn(page)
  await stubPasskeyApi(page)
  await page.goto('/account/security')
  await page.getByRole('switch', { name: 'Magic link sign-in' }).click()
  await expect(page.locator('[data-account-panel="security"]').getByRole('alert')).toHaveText(
    'This is your only way to sign in. Add a passkey or link Google first.'
  )
  await expect.poll(() => getTestMagicLinkEnabled(accountId)).toBe(true)
})

test('ACC-3 refuses unlinking Google when it is the only remaining method', async ({ page }) => {
  const { accountId } = await signedIn(page)
  await setTestMagicLinkEnabled(accountId, false)
  await addTestGoogleAccount(accountId)

  await stubPasskeyApi(page)
  await page.goto('/account/security')
  await page.getByRole('button', { name: 'Unlink Google' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Unlink Google' }).click()
  await expect(page.locator('[data-account-panel="security"]').getByRole('alert')).toHaveText(
    'This is your only way to sign in. Add a passkey or link Google first.'
  )
})

test('ACC-7 revoking a session blocks its next API request', async ({ page, baseURL, browser }) => {
  const { accountId } = await signedIn(page)
  const second = await signIn(accountId)
  await setTestSessionUserAgent(second.sessionId, 'Skyclause-CLI/1.0.0 (linux; x64)')

  await stubPasskeyApi(page)
  await page.goto('/account/security')
  const row = page.locator(`[data-session-id="${second.sessionId}"]`)
  await expect(row).toContainText('Skyclause CLI')
  await row.getByRole('button', { name: 'Revoke' }).click()
  const revocation = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/revoke-session' && response.request().method() === 'POST'
  )
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke session' }).click()
  expect((await revocation).status()).toBe(200)

  const otherContext = await browser.newContext()
  await otherContext.addCookies(second.cookies)
  const otherPage = await otherContext.newPage()
  const response = await otherPage.request.get(`${baseURL}/api/me/preferences`)
  expect(response.status()).toBe(401)
  await otherContext.close()
})

test('ACC-7 sign out everywhere keeps this session and revokes every other session', async ({
  page,
  baseURL,
  browser
}) => {
  const { accountId, login } = await signedIn(page)
  const second = await signIn(accountId)
  await stubPasskeyApi(page)
  await page.goto('/account/security')
  await page.getByRole('button', { name: 'Sign out everywhere' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out everywhere' }).click()

  await expect(page.locator('[data-session-row]')).toHaveCount(1)
  await expect(page.locator(`[data-session-id="${login.sessionId}"]`)).toContainText('This device')
  const otherContext = await browser.newContext()
  await otherContext.addCookies(second.cookies)
  const otherPage = await otherContext.newPage()
  const revoked = await otherPage.request.get(`${baseURL}/api/me/preferences`)
  expect(revoked.status()).toBe(401)
  const current = await page.request.get(`${baseURL}/api/me/preferences`)
  expect(current.status()).toBe(200)
  await otherContext.close()
})

test('SET-2 applies system theme live, saves shortcuts, and enforces reduced motion', async ({ page }) => {
  await signedIn(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/account/appearance')
  await page.getByText('System', { exact: true }).click()
  await expect(page.locator('html')).toHaveClass('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass('dark')

  // The sidebar and its collapse preference are gone with the sidebar.
  await expect(page.getByRole('switch', { name: 'Collapse sidebar' })).toHaveCount(0)

  const shortcuts = page.getByRole('switch', { name: 'Keyboard shortcuts' })
  await shortcuts.click()
  await expect(shortcuts).not.toBeChecked()
  // The toggle is optimistic; wait for its save to finish before reloading.
  await expect(shortcuts).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Keyboard shortcuts' })).not.toBeChecked()

  await page.getByRole('radio', { name: /^Reduced motion/ }).check()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect
    .poll(() =>
      page
        .locator('body')
        .evaluate((body) =>
          [...body.querySelectorAll('*')].some((element) => getComputedStyle(element).transitionDuration !== '0s')
        )
    )
    .toBe(false)
})

test('SET-2 shares preferences across browser contexts and paints the saved theme on the server', async ({
  page,
  browser,
  baseURL
}) => {
  const { login } = await signedIn(page)
  const saved = await page.request.patch(`${baseURL}/api/me/preferences`, {
    headers: { Origin: new URL(baseURL!).origin },
    data: { theme: 'dark', high_contrast: true, density: 'compact', language: 'ms', shortcuts: false }
  })
  expect(saved.status()).toBe(200)

  const otherContext = await browser.newContext()
  await otherContext.addCookies(login.cookies)
  const otherPage = await otherContext.newPage()
  const response = await otherPage.goto(`${baseURL}/account/appearance`)
  const html = await response!.text()
  expect(html).toMatch(/<html[^>]*class="dark hc"/)
  expect(html).toMatch(/color-scheme:\s*dark/)
  await expect(otherPage.locator('html')).toHaveAttribute('lang', 'ms')
  await expect(otherPage.getByRole('switch', { name: 'Keyboard shortcuts' })).not.toBeChecked()
  await otherContext.close()
})

test('LOC-1 app and auth route manifests contain no locale segment', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(import.meta.dirname, '../../.next/server/app-paths-manifest.json'), 'utf8')
  ) as Record<string, string>
  const routes = Object.keys(manifest).filter((route) => route.includes('/(app)/') || route.includes('/(auth)/'))
  const localeRoutes = routes.filter((route) => /\/(?:en|ms|\[(?:locale|lang)\])(?:\/|$)/.test(route))
  expect(localeRoutes).toEqual([])
})

test('a virtual authenticator can add, rename and remove a named passkey', async ({ page }) => {
  await signedIn(page)
  await stubPasskeyApi(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true
    }
  })

  await page.goto('/account/security')
  await page.getByLabel('New passkey name').fill('Work laptop')
  await page.getByRole('button', { name: 'Add passkey' }).click()
  const row = page.locator('[data-passkey-row][data-passkey-id="e2e-passkey-1"]')
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Rename' }).click()
  await row.getByLabel('Passkey name').fill('Office key')
  await row.getByRole('button', { name: 'Save name' }).click()
  await expect(page.locator('[data-passkey-row]').filter({ hasText: 'Office key' })).toBeVisible()
  const renamed = page.locator('[data-passkey-row]').filter({ hasText: 'Office key' })
  await renamed.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove passkey' }).click()
  await expect(page.locator('[data-passkey-row]')).toHaveCount(0)
  await cdp.send('WebAuthn.disable')
})
