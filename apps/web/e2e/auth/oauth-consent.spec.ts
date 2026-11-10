import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'
import { makeProjectIn } from '@skyclause/auth/testing'
import { expect, test } from '../fixtures'
import { makeOrg, signInAs } from '../harness/sign-in-as'

const verifier = 'b3R8yW1uQ5mK9nP2aS7dF4hJ0xV6cB8zT1eL5qN3wA'

async function openConsent(page: Page, origin: string, state: string) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: 'skyclause-playground',
    redirect_uri: `${origin}/developers/mcp/callback`,
    scope: 'read',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${origin}/mcp`
  })
  await page.goto(`/api/auth/oauth2/authorize?${query}`)
  await expect(page).toHaveURL(/\/oauth\/consent\?/)
}

test('a member submits selected project consent through Hono using the keyboard', async ({
  page,
  request,
  baseURL,
  expectAxeClean
}) => {
  const org = await makeOrg()
  const project = await makeProjectIn(org.id)
  await signInAs(page, 'editor', org)
  await openConsent(page, baseURL!, 'keyboard-consent')
  await expect(page.getByText('No AI can approve a bundle or send to people')).toBeVisible()
  await expectAxeClean(page)
  await page.locator(`input[name="project_ids"][value="${project.id}"]`).focus()
  await page.keyboard.press('Space')
  const submitted = page.waitForRequest((sent) => sent.url().endsWith('/api/auth/oauth/consent'))
  await page.getByRole('button', { name: 'Allow', exact: true }).focus()
  await page.keyboard.press('Enter')
  expect((await submitted).method()).toBe('POST')
  await expect(page).toHaveURL((url) => url.searchParams.has('code'))
  const code = new URL(page.url()).searchParams.get('code')!
  // The client exchanges the code itself, without the member's session cookie.
  const exchanged = await request.post('/api/auth/oauth2/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: 'skyclause-playground',
      code,
      redirect_uri: `${baseURL}/developers/mcp/callback`,
      code_verifier: verifier,
      resource: `${baseURL}/mcp`
    }
  })
  expect(exchanged.status()).toBe(200)
  expect(await exchanged.json()).toHaveProperty('access_token')
})

test('Deny returns an OAuth error without an authorization code', async ({ page, baseURL }) => {
  await signInAs(page, 'editor', await makeOrg())
  await openConsent(page, baseURL!, 'denied-consent')
  await page.getByRole('button', { name: 'Deny', exact: true }).click()
  await expect(page).toHaveURL((url) => url.searchParams.get('error') === 'access_denied')
  expect(new URL(page.url()).searchParams.has('code')).toBe(false)
})

test('a guest reaches sign-up before the consent form', async ({ page }) => {
  await signInAs(page, 'guest', await makeOrg())
  await page.goto('/oauth/consent?client_id=skyclause-playground')
  await expect(page).toHaveURL(/\/sign-up(?:\?|$)/)
  await expect(page.getByRole('button', { name: 'Allow', exact: true })).toHaveCount(0)
})
