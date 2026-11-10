import { test, expect } from '../fixtures'
import { asPage } from '../harness/as-page'
import { stubApi } from '../harness/stub-api'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { connectOperations } from '../../features/connect/operations'
import { prepare, member, configText, tools, orgId, memberships } from './setup'
import { t } from './messages'

test('connect is in the app shell with the current navigation selected', async ({ page }) => {
  await prepare(page)
  await page.goto('/connect')
  await expect(page.getByRole('heading', { level: 1, name: t('title'), exact: true })).toBeVisible()
  await expect(page.locator('.shell-sidebar a[href="/connect"]')).toHaveAttribute('aria-current', 'page')
})

test('CAI-3 renders exactly the live tools.json set and its scopes', async ({ page }) => {
  await prepare(page)
  await page.goto('/connect')
  const rows = page.locator('.connect-tools tbody tr')
  await expect(rows).toHaveCount(tools.length)
  expect(await rows.locator('th').allTextContents()).toEqual(tools.map((tool) => tool.name))
  await expect(rows.first()).toContainText(t('scope_read'))
  await expect(rows.last()).toContainText(t('scope_draft'))
  await expect(page.getByText('ignored_config_tool')).toHaveCount(0)
  await expect(page.getByText(t('no_approval'), { exact: true })).toBeVisible()
})

test('verification badges use API statuses and stored MYT dates without age maths', async ({ page }) => {
  await prepare(page)
  await page.goto('/connect')
  await expect(page.getByText(t('finding', { n: 1 }), { exact: true })).toBeVisible()
  await expect(page.locator('.connect-targets a')).toHaveCount(8)
  // This deliberately ancient record is still verified because the server says so; UTC crosses the MYT date.
  await expect(page.locator('.connect-targets a').first()).toContainText('2 January 2020')
  await expect(page.getByText(t('reverify_due'), { exact: true })).toBeVisible()
  await expect(page.getByText(t('not_verified'), { exact: true })).toHaveCount(6)
  await stubApi(page, 'listConnectVerifications', { data: [], next_cursor: null }, { registry: connectOperations })
  await page.reload()
  await expect(page.getByText(t('finding', { n: 0 }), { exact: true })).toBeVisible()
  await expect(page.getByText(t('not_verified'), { exact: true })).toHaveCount(8)
})

test('selection survives reload and config copies byte for byte by keyboard', async ({ page }) => {
  await prepare(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/connect?target=cursor')
  const picker = page.getByRole('navigation', { name: t('pick') })
  await expect(picker.locator('[aria-current="page"]')).toContainText(t('targets.cursor'))
  const next = picker.getByRole('link').filter({ hasText: t('targets.vscode') })
  await next.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/target=vscode/)
  await page.reload()
  await expect(picker.locator('[aria-current="page"]')).toContainText(t('targets.vscode'))
  const pre = page.locator('[data-slot="code-block-content"]').first()
  await expect(pre).toHaveText(configText)
  expect(await pre.textContent()).toBe(configText)
  await expect(pre).toHaveAttribute('translate', 'no')
  const copy = page.getByRole('button', { name: t('copy_config'), exact: true })
  await copy.focus()
  await page.keyboard.press('Enter')
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toBe(configText)
  expect(copied).not.toMatch(/sk[cgw]_|authorization/i)
  await page.getByRole('radio', { name: t('stdio'), exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(page).toHaveURL(/target=vscode&transport=stdio/)
  await expect(page.getByRole('radio', { name: t('stdio'), exact: true })).toBeChecked()
})

test('unsafe configs are never rendered or offered for Copy', async ({ page }) => {
  await prepare(page)
  for (const value of ['skc_test', 'skg_test', 'skw_test', '{"Authorization":"Bearer test"}']) {
    await stubApi(
      page,
      'getConnectConfig',
      { target: 'claude_ai', transport: 'remote', config: value, tools: [] },
      { registry: connectOperations }
    )
    await page.goto('/connect')
    await expect(page.getByText(t('config_error'), { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: t('copy_config'), exact: true })).toHaveCount(0)
    await expect(page.locator('[data-connect-page]')).not.toContainText(value)
  }
})

test('activity moves from waiting to first request in MYT and stops reading', async ({ page }) => {
  await prepare(page)
  let requests = 0
  const starts: string[] = []
  await page.route('**/api/connect/activity*', (route) => {
    requests += 1
    starts.push(new URL(route.request().url()).searchParams.get('since') ?? '')
    return route.fulfill({
      json: {
        data:
          requests === 1
            ? []
            : [{ at: '2026-11-06T01:23:00Z', tool: 'inspect_sensor_certificate', client_name: 'Test client' }],
        next_cursor: null
      }
    })
  })
  await page.clock.install()
  await page.goto('/connect')
  await expect(page.locator('[data-connect-activity]')).toHaveText(t('waiting'))
  await expect.poll(() => requests).toBe(1)
  await page.clock.runFor(5000)
  await expect(page.locator('[data-connect-activity]')).toContainText('09:23 MYT')
  await expect(page.locator('[data-connect-activity]')).toContainText('inspect_sensor_certificate')
  await expectZonedTimes(page)
  await page.clock.runFor(20_000)
  expect(requests).toBe(2)
  expect(starts[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(starts[1]).toBe(starts[0])
})

test('activity pauses while hidden and times out after ten minutes', async ({ page }) => {
  await prepare(page)
  let requests = 0
  await page.route('**/api/connect/activity*', (route) => {
    requests += 1
    return route.fulfill({ json: { data: [], next_cursor: null } })
  })
  await page.clock.install()
  await page.goto('/connect')
  await expect.poll(() => requests).toBe(1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(20_000)
  expect(requests).toBe(1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => requests).toBe(2)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(580_000)
  await expect(page.locator('[data-connect-activity]')).toHaveText(t('timeout'))
  expect(requests).toBe(2)
  await page.clock.runFor(10_000)
  expect(requests).toBe(2)
})

test('CAI-4 names the constraint, policy-admin role, cited date and all Enterprise steps', async ({ page }) => {
  await prepare(page)
  await page.goto('/connect?target=gemini_enterprise')
  const setup = page.getByRole('region', { name: t('enterprise') })
  for (const key of [
    'preview',
    'policy_id',
    'policy_role',
    'egress',
    'registration_path',
    'oauth_fields',
    'redirect',
    'enable_tools'
  ])
    await expect(setup).toContainText(t(key))
  await expect(setup).toContainText('6 November 2026')
  await expect(setup.getByRole('link', { name: t('policy_source') })).toHaveAttribute('href', /override-constraint/)
})

test('Admin creates the selected organisation client and sees its secret only once', async ({ page }) => {
  await prepare(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const secret = 'oauth_test_once_secret'
  let writes = 0
  await page.route('**/api/orgs/*/oauth-clients', async (route) => {
    writes += 1
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['skyclause-organization']).toBe(orgId)
    expect(route.request().headers()['idempotency-key']).toBeTruthy()
    expect(route.request().postDataJSON()).toEqual({
      client_name: t('targets.gemini_enterprise'),
      redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
      scopes: ['read', 'draft']
    })
    await route.fulfill({
      status: 201,
      json: {
        id: '019a34d0-0000-7000-8000-000000000002',
        client_id: 'oauth_test_client',
        client_secret: secret,
        created_at: '2026-11-06T00:00:00Z',
        redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
        authorization_url: new URL('/api/auth/oauth2/authorize', route.request().url()).href,
        token_url: new URL('/api/auth/oauth2/token', route.request().url()).href,
        ...route.request().postDataJSON()
      }
    })
  })
  await page.goto('/connect?target=gemini_enterprise')
  const create = page.getByRole('button', { name: t('create_client'), exact: true })
  await create.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(secret, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: t('copy_secret'), exact: true }).focus()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(secret)
  await page.getByRole('button', { name: t('dismiss_secret'), exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0)
  await expect(page.getByText(t('client_created'), { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0)
  expect(writes).toBe(1)
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(secret)
})

test('non-Admins see no create control', async ({ page }) => {
  await prepare(page, { ...member, role: 'viewer' })
  await stubApi(
    page,
    'listMyMemberships',
    { data: [{ ...memberships[0], role: 'viewer' }], next_cursor: null },
    { registry: connectOperations }
  )
  await page.goto('/connect?target=gemini_enterprise')
  await expect(page.getByText(t('ask_admin'), { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: t('create_client'), exact: true })).toHaveCount(0)
})

test('an unscoped session chooses its organisation and clears the secret on organisation changes', async ({ page }) => {
  await prepare(page, { ...member, orgId: null, role: null })
  const secondOrg = '019a34d0-0000-7000-8000-000000000003'
  await stubApi(
    page,
    'listMyMemberships',
    {
      data: [
        { ...memberships[0], role: 'viewer' },
        { ...memberships[0], id: 'membership-2', org_id: secondOrg, org_name: 'Second organisation', role: 'admin' }
      ],
      next_cursor: null
    },
    { registry: connectOperations }
  )
  const secret = 'oauth_second_org_secret'
  await page.route('**/api/orgs/*/oauth-clients', async (route) => {
    expect(route.request().url()).toContain(secondOrg)
    expect(route.request().headers()['skyclause-organization']).toBe(secondOrg)
    await route.fulfill({
      status: 201,
      json: {
        id: secondOrg,
        client_id: 'oauth_second_client',
        client_secret: secret,
        created_at: '2026-11-06T00:00:00Z',
        redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
        authorization_url: new URL('/api/auth/oauth2/authorize', route.request().url()).href,
        token_url: new URL('/api/auth/oauth2/token', route.request().url()).href,
        ...route.request().postDataJSON()
      }
    })
  })
  await page.goto('/connect?target=gemini_enterprise')
  await expect(page.getByRole('button', { name: t('create_client'), exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: t('organisation'), exact: true }).selectOption(secondOrg)
  await page.getByRole('button', { name: t('create_client'), exact: true }).click()
  await expect(page.getByText(secret, { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: t('organisation'), exact: true }).selectOption(orgId)
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: t('create_client'), exact: true })).toHaveCount(0)
})

test('verification finding includes subsequent API pages', async ({ page }) => {
  await prepare(page)
  await page.route('**/api/connect/verifications*', (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    const record = {
      id: cursor ? 'second' : 'first',
      target: cursor ? 'chatgpt' : 'claude_ai',
      client_version: 'test',
      tested_at: '2026-11-06T00:00:00Z',
      result: 'verified',
      tested_by: 'test',
      notes: ''
    }
    return route.fulfill({ json: { data: [record], next_cursor: cursor ? null : 'second-page' } })
  })
  await page.goto('/connect')
  await expect(page.getByText(t('finding', { n: 2 }), { exact: true })).toBeVisible()
  await expect(
    page.locator('.connect-verification').filter({ hasText: t('verified', { date: '6 November 2026' }) })
  ).toHaveCount(2)
})

test('401 reauth-required reaches the shared step-up seam without retrying a write before success', async ({
  page
}) => {
  await prepare(page)
  let writes = 0
  await page.route('**/api/orgs/*/oauth-clients', (route) => {
    writes += 1
    return route.fulfill({
      status: 401,
      json: { type: 'reauth-required', title: 'Recent sign-in required', status: 401 }
    })
  })
  await page.goto('/connect?target=gemini_enterprise')
  await page.getByRole('button', { name: t('create_client'), exact: true }).click()
  // #100 is still a placeholder. This assertion will be replaced with its real dialog flow when it lands.
  await expect(page.getByText(t('reauth_unavailable'), { exact: true })).toBeVisible()
  expect(writes).toBe(1)
  await page.getByRole('button', { name: t('cancel'), exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(t('create_error'), { exact: true })).toBeVisible()
  expect(writes).toBe(1)
})

for (const guest of [false, true]) {
  test(`${guest ? 'guest' : 'signed-out visitor'} goes to sign-up`, async ({ page }) => {
    if (guest) await asPage(page, { ...member, isGuest: true })
    else
      await page.context().addCookies([
        {
          name: 'skyclause_test_principal',
          value: 'null',
          url: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
        }
      ])
    await page.goto('/connect')
    await expect(page).toHaveURL(/\/sign-up$/)
    await expect(page.locator('[data-connect-page]')).toHaveCount(0)
  })
}

test('NFR-15 shows no tool, verification date or activity until APIs answer', async ({ page }) => {
  await prepare(page)
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/connect\/(config|verifications|activity)(\?|$)|\/mcp\/tools\.json$/, async (route) => {
    await hold
    await route.fallback()
  })
  await page.goto('/connect')
  const surface = page.locator('[data-connect-page]')
  await expect(page.getByText(t('loading_verifications'), { exact: true })).toBeVisible()
  await expect(surface.locator('tbody tr')).toHaveCount(0)
  await expect(surface.locator('.connect-verification')).toHaveCount(0)
  await expect(surface.locator('pre')).toHaveCount(0)
  await expect(surface.locator('[data-connect-activity]')).toHaveText(t('waiting'))
  release()
  await expect(page.locator('.connect-tools tbody tr')).toHaveCount(2)
})

test('API failures and n=0 tools offer recovery without fallback data', async ({ page }) => {
  await prepare(page)
  await page.route('**/api/connect/*', (route) =>
    route.fulfill({ status: 503, json: { title: 'Unavailable', status: 503 } })
  )
  await page.route('**/mcp/tools.json', (route) => route.fulfill({ status: 503 }))
  await page.goto('/connect')
  for (const key of ['verification_error', 'config_error', 'tools_error', 'activity_error'])
    await expect(page.getByText(t(key), { exact: true })).toBeVisible()
  await expect(page.locator('[data-connect-page] pre, .connect-tools')).toHaveCount(0)
  await page.route('**/mcp/tools.json', (route) => route.fulfill({ json: { tools: [] } }))
  await page
    .getByRole('region', { name: t('tools'), exact: true })
    .getByRole('button', { name: t('retry'), exact: true })
    .click()
  await expect(page.getByText(t('empty_tools'), { exact: true })).toBeVisible()
})

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`connect is axe-clean and unclipped in ${theme}, including 30% pseudo copy and long live data`, async ({
    page,
    expectAxeClean,
    baseURL
  }, testInfo) => {
    await prepare(page)
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        }),
        url: baseURL!
      }
    ])
    await page.route('**/mcp/tools.json', (route) =>
      route.fulfill({
        json: {
          tools: [
            {
              name: 'inspect_community_weather_station_sensor_certificate_and_provenance',
              description:
                'Semak sijil penderia untuk Persatuan Kebajikan dan Pendidikan Komuniti Wilayah Persekutuan Kuala Lumpur dan Selangor 吉隆坡社区',
              scopes: ['read', 'draft']
            },
            { name: 'x', description: '', scopes: [] }
          ]
        }
      })
    )
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/connect?target=gemini_enterprise')
      await expect(page.locator('.connect-tools tbody tr')).toHaveCount(2)
      await page.evaluate(() => document.fonts.ready)
      await expectAxeClean(page)
      await expectUnclippedText(page)
      await expectZonedTimes(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.screenshot({
      path: testInfo.outputPath(`connect-${theme}.png`),
      fullPage: true
    })
  })
}
