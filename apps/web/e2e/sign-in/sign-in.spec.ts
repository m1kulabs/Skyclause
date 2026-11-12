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
  return page.getByRole('region', { name: /^Sign in/ })
}

test.beforeEach(async ({ page }) => {
  await signedOut(page)
})

test('sign-in shows the email link, passkey, Google, the legal links and the room, and no guest entry', async ({
  page
}) => {
  await page.goto('/sign-in')

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible()
  const email = page.getByLabel('Email address')
  await expect(email).toHaveAttribute('type', 'email')
  await expect(email).toHaveAttribute('name', 'email')
  await expect(email).toHaveAttribute('inputmode', 'email')
  await expect(email).toHaveAttribute('autocomplete', 'username webauthn')
  await expect(email).toHaveAttribute('spellcheck', 'false')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continue as guest' })).toHaveCount(0)
  await expect(page.locator('a[href="/guest"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'PDPA privacy notice' })).toHaveAttribute('href', '/legal/privacy')
  await expect(page.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/legal/terms')
  await expect(page.getByRole('link', { name: 'Skyclause home' })).toHaveAttribute('href', '/')
  await expect(page.getByRole('img', { name: /Bukit Jalil LRT station/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Photo by *angys*, CC BY-SA 4.0' })).toHaveAttribute(
    'href',
    '/#picture-credits'
  )
  await expect(page.locator('[data-sign-in-strip="day"]')).toContainText(/Now \d\d:\d\d\sMYT/)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('on a phone the field is on the first screen with 44px targets, and waits to be tapped', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await signedOut(page)
  await page.goto('/sign-in')
  const email = page.getByLabel('Email address')
  await expect(email).toBeInViewport()
  await expect(email).not.toBeFocused()
  for (const button of await page.getByRole('button').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await context.close()
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
  await expect(page.getByRole('heading', { level: 2, name: 'Check your email' })).toBeFocused()
  await expect(page.getByRole('link', { name: 'Use a different email' })).toBeVisible()
  // The strip draws the link's window and says until when it works.
  await expect(page.locator('[data-sign-in-strip="link"]')).toContainText(/Your link works until \d\d:\d\d\sMYT/)
  await expect(page.locator('[data-sign-in-window]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(requestCount).toBe(1)
  await expectNoPasswordControls(page)
  await expectAuthAxe(page)
})

test('keyboard-only email sign-in reaches and submits the labelled form', async ({ page }) => {
  await page.route('**/api/auth/sign-in/magic-link', (route) => route.fulfill({ json: { status: true } }))
  await page.goto('/sign-in')

  // The skip link is the first stop, then the wordmark, then the field.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skyclause home' })).toBeFocused()
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
  // The mail or auth API failed, not the address: the field stays valid and takes focus for another try.
  const sendError = signInRegion(page).getByRole('alert')
  await expect(sendError).toHaveText('We couldn’t send the sign-in link just now. Try again in a minute.')
  await expect(email).not.toHaveAttribute('aria-invalid', 'true')
  await expect(email).toBeFocused()
  await expectAuthAxe(page)

  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const googleError = signInRegion(page).getByRole('alert')
  await expect(googleError).toContainText('Google sign-in couldn’t start. Try again or use email sign-in.')
  await expect(googleError).toBeFocused()
  await expectAuthAxe(page)

  await page.goto('/sign-in?link=invalid-token')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const confirmError = signInRegion(page).getByRole('alert')
  await expect(confirmError).toContainText('This link couldn’t be confirmed')
  await expect(confirmError).toBeFocused()
  await expectAuthAxe(page)
})

test('sign-up keeps a safe next path, offers email and Google, and links back to sign-in', async ({ page }) => {
  await page.goto('/sign-up?next=%2Fcommons%3Ftab%3Dwindows')

  await expect(page.getByRole('heading', { level: 1, name: 'Sign in or create your account' })).toBeVisible()
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
  const entries = await page.evaluate(() => history.length)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/commons$/)
  expect(confirmCount).toBe(1)
  // The signed-in page takes sign-in's place in history, so Back never lands on a page that sends you forward again.
  expect(await page.evaluate(() => history.length)).toBe(entries)
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
  await page.getByRole('button', { name: 'Confirm it’s you' }).click()

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

  await expect(signInRegion(page).getByRole('status')).toContainText(
    'A new sign-in link is on its way to the same address.'
  )
  await expect(page.locator('[data-sign-in-strip="link"]')).toContainText(/Your link works until \d\d:\d\d\sMYT/)
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

test('an empty or malformed address is said beside the field with no browser bubble and no request', async ({
  page
}) => {
  let requests = 0
  await page.route('**/api/auth/sign-in/magic-link', (route) => {
    requests += 1
    return route.fulfill({ status: 400, json: { code: 'VALIDATION_ERROR', message: 'Invalid email' } })
  })
  await page.goto('/sign-in')
  const email = page.getByLabel('Email address')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(signInRegion(page).getByRole('alert')).toHaveText('Enter your email address.')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toBeFocused()
  // The form takes no browser validation, so no bubble covers the page.
  await expect(page.locator('form[action="/sign-in/link"]')).toHaveAttribute('novalidate', '')
  await email.fill('not-an-email')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(signInRegion(page).getByRole('alert')).toHaveText('Enter an email address like name@example.com.')
  expect(requests).toBe(0)
  await expectAuthAxe(page)

  // One the server refuses is told the same way.
  await email.fill('reader@example.invalid')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  expect(requests).toBe(1)
})

test('too many links says when to ask again, from the API’s Retry-After, never a status', async ({ page }) => {
  await page.route('**/api/auth/sign-in/magic-link', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '1200' },
      json: { code: 'RATE_LIMITED', message: 'Too many sign-in link requests.' }
    })
  )
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('reader@example.org')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  const alert = signInRegion(page).getByRole('alert')
  await expect(alert).toContainText(/You can ask again at \d\d:\d\d\sMYT\./)
  await expect(alert).not.toContainText(/429|RATE_LIMITED/)
  await expectAuthAxe(page)
})

test('the link’s window runs to its real end; then the form returns with the address and one line', async ({
  page
}) => {
  await page.clock.install()
  await page.route('**/api/auth/sign-in/magic-link', (route) => route.fulfill({ json: { status: true } }))
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('reader@example.org')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  const strip = page.locator('[data-sign-in-strip="link"]')
  await expect(strip).toContainText('15 min left')
  await page.clock.fastForward('10:00')
  await expect(strip).toContainText('5 min left')
  await page.clock.fastForward('05:01')
  const email = page.getByLabel('Email address')
  await expect(email).toHaveValue('reader@example.org')
  await expect(email).toBeFocused()
  await expect(signInRegion(page).getByRole('status')).toContainText(/Your sign-in link expired at \d\d:\d\d\sMYT/)
  await expect(page.locator('[data-sign-in-strip="day"]')).toBeVisible()
  await expect(page.locator('[data-sign-in-window]')).toHaveCount(0)
  await expectAuthAxe(page)
})

test('only the ways in the server can serve are offered; a missing email link is said in words', async ({ page }) => {
  const url = `http://localhost:${process.env.E2E_PORT ?? 3100}`
  await page.context().addCookies([{ name: 'skyclause-test-sign-in-off', value: 'google', url }])
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  await expect(page.getByLabel('Email address')).toBeVisible()

  await page.context().addCookies([{ name: 'skyclause-test-sign-in-off', value: 'email', url }])
  await page.goto('/sign-in')
  await expect(page.getByLabel('Email address')).toHaveCount(0)
  await expect(
    page.getByText('Email sign-in isn’t available right now. Use a passkey or Google instead.')
  ).toBeVisible()
  await expectAuthAxe(page)
})

test('a browser without passkeys says so and points to the email link; a return path says why', async ({ page }) => {
  await page.addInitScript(() => {
    // @ts-expect-error -- this browser has no WebAuthn.
    delete window.PublicKeyCredential
  })
  await page.goto('/sign-in?next=%2Fnew')
  await expect(page.getByText('This browser can’t use passkeys. Use the email link.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toHaveCount(0)
  await expect(page.getByText('Sign in to open the page you asked for.')).toBeVisible()
  await expectAuthAxe(page)
})

test('without JavaScript the email form posts and the page says what happened', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await signedOut(page)

  await page.goto('/sign-in?next=%2Fnew')
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeHidden()
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page).toHaveURL(/\/sign-in\?state=email-invalid&next=%2Fnew$/)
  await expect(page.getByText('Enter an email address like name@example.com.')).toBeVisible()

  // This server has no mail transport, so the real send fails, and the page says so in words.
  await page.getByLabel('Email address').fill('reader@example.org')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page).toHaveURL(/\/sign-in\?state=send-failed&next=%2Fnew$/)
  await expect(page.getByRole('alert')).toHaveText('We couldn’t send the sign-in link just now. Try again in a minute.')

  // A sent link's page, as the form lands on it: the address it went to, and until when it works.
  const until = new Date(Date.now() + 14 * 60_000).toISOString()
  await page.goto(`/sign-in?state=link-sent&until=${encodeURIComponent(until)}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Check your email' })).toBeVisible()
  await expect(page.getByText(/It works until \d\d:\d\d\sMYT\./)).toBeVisible()
  await expect(page.locator('[data-sign-in-strip="link"]')).toContainText(/Your link works until \d\d:\d\d\sMYT/)
  await page.getByRole('link', { name: 'Use a different email' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByLabel('Email address')).toBeVisible()

  // The emailed link's own page: its "Sign in" posts as a form too, and an unknown link says it has expired.
  await page.goto('/sign-in?link=unknown-token&resend=unknown-handle')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in\?state=link-expired&resend=unknown-handle$/)
  await expect(page.getByText('This link has expired. Request a new one.')).toBeVisible()
  await expectNoPasswordControls(page)
  await context.close()
})
