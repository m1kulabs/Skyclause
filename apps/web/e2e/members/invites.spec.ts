import { membersOperations } from '../../features/members/operations'
import { expect, test } from '../fixtures'
import { stubApi } from '../harness'

const principalCookie = 'skyclause_test_principal'

async function signOutForTest(page: Parameters<typeof stubApi>[0], baseURL: string) {
  await page
    .context()
    .addCookies([
      { name: principalCookie, value: encodeURIComponent('null'), url: baseURL, httpOnly: true, sameSite: 'Lax' }
    ])
}

const states = [
  { kind: 'invitation', state: 'withdrawn', expected: 'This invite was withdrawn.' },
  { kind: 'invitation', state: 'expired', expected: 'This invite has expired.' },
  { kind: 'invitation', state: 'used', expected: 'This invite has already been used.' },
  { kind: 'ownership_transfer', state: 'withdrawn', expected: 'This ownership transfer was withdrawn.' },
  { kind: 'ownership_transfer', state: 'expired', expected: 'This ownership transfer has expired.' },
  { kind: 'ownership_transfer', state: 'used', expected: 'This ownership transfer has already been used.' }
] as const

for (const tokenState of states) {
  test(`ORG-2 ${tokenState.kind} token ${tokenState.state} state renders`, async ({ page, baseURL }) => {
    await signOutForTest(page, baseURL!)
    await stubApi(
      page,
      'inspectMemberToken',
      { kind: tokenState.kind, state: tokenState.state },
      { registry: membersOperations }
    )

    await page.goto('/invite/example-token')
    await expect(page.getByText(tokenState.expected)).toBeVisible()
  })
}

test('ORG-2 a signed-out invite visitor can sign in or create an account and return to the token', async ({
  page,
  baseURL
}) => {
  await signOutForTest(page, baseURL!)
  await stubApi(page, 'inspectMemberToken', { kind: 'invitation', state: 'valid' }, { registry: membersOperations })

  await page.goto('/invite/example-token')
  await expect(
    page.getByText('The invitation is valid. Its organisation and role details are unavailable.')
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/sign-in?next=%2Finvite%2Fexample-token'
  )
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
    'href',
    '/sign-up?next=%2Finvite%2Fexample-token'
  )
})

test('ORG-2 an ownership-transfer token uses the one token page and acceptance label', async ({ page, baseURL }) => {
  await signOutForTest(page, baseURL!)
  await stubApi(
    page,
    'inspectMemberToken',
    { kind: 'ownership_transfer', state: 'valid' },
    { registry: membersOperations }
  )

  await page.goto('/invite/example-token')
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Accept ownership of your organisation' })).toBeVisible()
})

for (const mode of [
  { name: 'dark', theme: 'dark', contrast: 'standard' },
  { name: 'light', theme: 'light', contrast: 'standard' },
  { name: 'high contrast', theme: 'dark', contrast: 'more' }
] as const) {
  test(`invite token states axe: ${mode.name}`, async ({ page, baseURL, expectAxeClean }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.context().addCookies([
      { name: 'skyclause-test-appearance', value: JSON.stringify(mode), url: baseURL! },
      { name: principalCookie, value: encodeURIComponent('null'), url: baseURL!, httpOnly: true, sameSite: 'Lax' }
    ])
    await page.route('**/api/invite/**', async (route) => {
      const token = new URL(route.request().url()).pathname.split('/').at(-1) ?? ''
      const [kind, state] = token.split('-')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { kind: kind === 'transfer' ? 'ownership_transfer' : 'invitation', state }
      })
    })

    for (const item of [
      ['invite-withdrawn', 'This invite was withdrawn.'],
      ['invite-expired', 'This invite has expired.'],
      ['invite-used', 'This invite has already been used.'],
      ['transfer-withdrawn', 'This ownership transfer was withdrawn.'],
      ['transfer-expired', 'This ownership transfer has expired.'],
      ['transfer-used', 'This ownership transfer has already been used.'],
      ['invite-valid', 'The invitation is valid.'],
      ['transfer-valid', 'Accept ownership of your organisation']
    ] as const) {
      await page.goto(`/invite/${item[0]}`)
      await expect(page.getByText(item[1]).or(page.getByRole('heading', { name: item[1] }))).toBeVisible()
      await expectAxeClean(page)
    }
  })
}
