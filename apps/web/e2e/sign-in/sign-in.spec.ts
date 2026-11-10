import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { makeAccount, signIn } from '@skyclause/auth/testing'
import { expect, expectAxeClean, test } from '../fixtures'
import { signedOut } from '../quality/roles'

async function expectNoPasswordControls(page: import('@playwright/test').Page) {
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('input[autocomplete="current-password"], input[autocomplete="new-password"]')).toHaveCount(
    0
  )
}

async function expectAuthAxe(page: import('@playwright/test').Page) {
  await expectAxeClean(page)
  await page.emulateMedia({ colorScheme: 'dark', contrast: 'more' })
  await expectAxeClean(page)
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' })
  await expectAxeClean(page)
  await page.emulateMedia({ colorScheme: 'dark', contrast: 'no-preference', forcedColors: 'none' })
}

function signInRegion(page: import('@playwright/test').Page) {
  return page.getByRole('region', { name: 'Sign in to Skyclause' })
}

test.beforeEach(async ({ page }) => {
  await signedOut(page)
})

test('sign-in shows passkey, labelled email, Google, guest entry and the PDPA link', async ({ page }) => {
  await page.goto('/sign-in')

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Skyclause' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible()
  const email = page.getByLabel('Email address')
  await expect(email).toHaveAttribute('type', 'email')
  await expect(email).toHaveAttribute('name', 'email')
  await expect(email).toHaveAttribute('inputmode', 'email')
  await expect(email).toHaveAttribute('autocomplete', 'username webauthn')
  await expect(email).toHaveAttribute('spellcheck', 'false')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue as guest' })).toHaveAttribute('href', '/guest')
  await expect(page.getByRole('link', { name: 'PDPA privacy notice' })).toHaveAttribute('href', '/legal/privacy')
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('email sign-in preserves next, announces Sending, names the address, and allows a different email', async ({
  page
}) => {
  const address = `reader+${'x'.repeat(96)}@example.org`
  let requestCount = 0
  await page.route('**/api/auth/sign-in/magic-link', async (route) => {
    requestCount += 1
    expect(route.request().postDataJSON()).toMatchObject({
      email: address,
      callbackURL: '/api/auth/continue?next=%2Fcommons%3Ftab%3Dwindows'
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.fulfill({ json: { status: true } })
  })

  await page.goto('/sign-in?next=%2Fcommons%3Ftab%3Dwindows')
  await page.setViewportSize({ width: 320, height: 640 })
  await page.getByLabel('Email address').fill(address)
  const sending = page.getByRole('button', { name: 'Sending…' })
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(sending).toBeVisible()
  await expect(signInRegion(page).getByRole('status')).toContainText(address)
  await expect(page.getByRole('button', { name: 'Use a different email' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(requestCount).toBe(1)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('keyboard-only email sign-in reaches and submits the labelled form', async ({ page }) => {
  await page.route('**/api/auth/sign-in/magic-link', (route) => route.fulfill({ json: { status: true } }))
  await page.goto('/sign-in')

  const passkey = page.getByRole('button', { name: 'Sign in with a passkey' })
  for (let tab = 0; tab < 8 && !(await passkey.evaluate((element) => element === document.activeElement)); tab += 1) {
    await page.keyboard.press('Tab')
  }
  await expect(passkey).toBeFocused()
  await page.keyboard.press('Tab')

  const email = page.getByLabel('Email address')
  await expect(email).toBeFocused()
  await page.keyboard.insertText('keyboard@example.org')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(signInRegion(page).getByRole('status')).toContainText('keyboard@example.org')
  await expectAuthAxe(page)
})

test('email, Google and link errors explain recovery and focus the message or field', async ({ page }) => {
  await page.route('**/api/auth/sign-in/magic-link', (route) =>
    route.fulfill({ status: 500, json: { message: 'failed' } })
  )
  await page.route('**/api/auth/sign-in/social', (route) => route.fulfill({ status: 500, json: { message: 'failed' } }))
  await page.route('**/api/auth/magic-link/confirm', (route) =>
    route.fulfill({ status: 500, json: { message: 'failed' } })
  )

  await page.goto('/sign-in')
  const email = page.getByLabel('Email address')
  await email.fill('reader@example.org')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toBeFocused()
  await expect(signInRegion(page).getByRole('alert')).toContainText('Check the address and try again')
  await expectAuthAxe(page)

  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const googleError = signInRegion(page).getByRole('alert')
  await expect(googleError).toContainText('Google sign-in couldn’t start. Try again or use email sign-in.')
  await expect(googleError).toBeFocused()
  await expectAuthAxe(page)

  await page.goto('/sign-in?link=invalid-token')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const confirmError = signInRegion(page).getByRole('alert')
  await expect(confirmError).toContainText('We couldn’t confirm this link')
  await expect(confirmError).toBeFocused()
  await expectAuthAxe(page)
})

test('sign-up keeps a safe next path, offers email and Google, and links back to sign-in', async ({ page }) => {
  await page.goto('/sign-up?next=%2Fcommons%3Ftab%3Dwindows')

  await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toHaveCount(0)
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute(
    'href',
    '/sign-in?next=%2Fcommons%3Ftab%3Dwindows'
  )
  await expect(page.getByRole('link', { name: 'PDPA privacy notice' })).toHaveAttribute('href', '/legal/privacy')
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('Google sign-up sends the safe next path to the social auth client', async ({ page }) => {
  let socialBody: Record<string, unknown> | undefined
  await page.route('**/api/auth/sign-in/social', async (route) => {
    socialBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ json: { url: '/api/auth/continue?next=%2Fcommons', redirect: true } })
  })
  await page.route('**/api/auth/continue*', (route) =>
    route.fulfill({ status: 303, headers: { location: '/commons' } })
  )
  await page.route('**/commons', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Commons</h1>' }))

  await page.goto('/sign-up?next=%2Fcommons')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect
    .poll(() => socialBody)
    .toMatchObject({
      provider: 'google',
      callbackURL: '/api/auth/continue?next=%2Fcommons'
    })
})

test('a signed-in visitor continues through the safe next path', async ({ page, baseURL }) => {
  const origin = baseURL ?? 'http://localhost:3298'
  await page.context().addCookies([
    {
      name: 'skyclause_test_principal',
      value: encodeURIComponent(JSON.stringify({ kind: 'session', accountId: 'test-account' })),
      url: origin,
      httpOnly: true,
      sameSite: 'Lax'
    }
  ])
  let continueUrl = ''
  await page.route('**/api/auth/continue*', async (route) => {
    continueUrl = route.request().url()
    await route.fulfill({ status: 303, headers: { location: '/commons' } })
  })
  await page.route('**/commons', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Commons</h1>' }))

  await page.goto('/sign-in?next=%2Fcommons%3Ftab%3Dwindows')

  await expect.poll(() => new URL(continueUrl || origin).searchParams.get('next')).toBe('/commons?tab=windows')
  await expect(page).toHaveURL(/\/commons$/)
})

test('link confirmation posts once and follows the continue redirect', async ({ page }) => {
  let confirmCount = 0
  await page.route('**/api/auth/magic-link/confirm', async (route) => {
    confirmCount += 1
    expect(route.request().postDataJSON()).toEqual({ link: 'one-time-token', resend: 'resend-handle' })
    // Confirmation creates a session; redirected fetches reach the real continue handler.
    const account = await makeAccount()
    await page.context().addCookies((await signIn(account.id)).cookies)
    await route.fulfill({ status: 303, headers: { location: '/api/auth/continue?next=%2Fcommons' } })
  })
  await page.route('**/commons', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Commons</title></head><body><main><h1>Commons</h1></main></body></html>'
    })
  )

  await page.goto('/sign-in?link=one-time-token&resend=resend-handle&next=%2Fcommons')
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(1)
  await expectAuthAxe(page)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/commons$/)
  expect(confirmCount).toBe(1)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('step-up link confirmation posts to the step-up endpoint and asks to return to the first tab', async ({
  page
}) => {
  let confirmCount = 0
  await page.route('**/api/auth/step-up/magic-link/confirm', async (route) => {
    confirmCount += 1
    expect(route.request().postDataJSON()).toEqual({ link: 'step-up-token' })
    await route.fulfill({ json: { status: true } })
  })

  await page.goto('/sign-in?link=step-up-token&for=step-up')
  await expectAuthAxe(page)
  await page.getByRole('button', { name: "Confirm it's you" }).click()

  await expect(signInRegion(page).getByRole('status')).toContainText('Return to the tab and choose Send again')
  expect(confirmCount).toBe(1)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('an expired link with a resend handle takes one press and announces the sent state', async ({ page }) => {
  let resendCount = 0
  await page.route('**/api/auth/magic-link/resend', async (route) => {
    resendCount += 1
    expect(route.request().postDataJSON()).toEqual({ resend: 'resend-handle' })
    await route.fulfill({ json: { status: true } })
  })

  await page.goto('/sign-in?state=link-expired&resend=resend-handle')
  await expect(page.getByText('This link has expired. Request a new one.')).toBeVisible()
  await expect(page.getByLabel('Email address')).toHaveCount(0)
  await expectAuthAxe(page)
  await page.getByRole('button', { name: 'Resend' }).click()

  await expect(signInRegion(page).getByRole('status')).toContainText('We sent a new sign-in link. Check your email.')
  expect(resendCount).toBe(1)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('expired step-up links direct the person back to the requesting tab', async ({ page }) => {
  await page.goto('/sign-in?state=link-expired&for=step-up')

  await expect(
    page.getByText('This link has expired. Go back to the tab that requested it and choose Send again.')
  ).toBeVisible()
  await expect(page.getByLabel('Email address')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resend' })).toHaveCount(0)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('expired links without a resend handle and account-link errors show next actions', async ({ page }) => {
  await page.goto('/sign-in?state=link-expired')
  await expect(page.getByText('This link has expired. Request a new one.')).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)

  await page.goto('/sign-in?state=link-pending')
  await expect(signInRegion(page).getByRole('alert')).toContainText('Use email sign-in for this account')
  await expectAuthAxe(page)

  await page.goto('/sign-in?state=google-failed')
  await expect(signInRegion(page).getByRole('alert')).toContainText('Try Google again or use email sign-in')
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('conditional passkey autofill offers a stored credential and signs in to next', async ({ page, context }) => {
  const credentialId = randomBytes(32)
  const userHandle = Buffer.from('test-account')
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  })
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId: credentialId.toString('base64'),
      isResidentCredential: true,
      rpId: 'localhost',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
      userHandle: userHandle.toString('base64'),
      signCount: 0
    }
  })
  await page.addInitScript(() => {
    Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', {
      configurable: true,
      value: async () => true
    })
  })

  let optionsCount = 0
  let verificationCount = 0
  await page.route('**/api/auth/passkey/generate-authenticate-options', async (route) => {
    optionsCount += 1
    await route.fulfill({
      json: {
        challenge: randomBytes(32).toString('base64url'),
        timeout: 60_000,
        rpId: 'localhost',
        userVerification: 'preferred',
        allowCredentials: [{ type: 'public-key', id: credentialId.toString('base64url') }]
      }
    })
  })
  await page.route('**/api/auth/passkey/verify-authentication', async (route) => {
    verificationCount += 1
    await route.fulfill({
      json: {
        user: { id: 'test-account', email: 'reader@example.org', name: 'Test account' },
        session: { token: 'test-session', expiresAt: new Date(Date.now() + 60_000).toISOString() }
      }
    })
  })
  await page.route('**/api/auth/continue*', (route) =>
    route.fulfill({ status: 303, headers: { location: '/commons' } })
  )
  await page.route('**/commons', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Commons</h1>' }))

  await page.goto('/sign-in?next=%2Fcommons')
  const email = page.getByLabel('Email address')
  await expect(email).toHaveAttribute('autocomplete', 'username webauthn')
  await expect.poll(() => optionsCount).toBeGreaterThan(0)
  await expect.poll(() => verificationCount).toBe(1)
  await expect(page).toHaveURL(/\/commons$/)
})
