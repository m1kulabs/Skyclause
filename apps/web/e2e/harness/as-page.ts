import type { Page } from '@playwright/test'
import type { Principal } from '@skyclause/contracts'

// Keep this cookie name in sync with apps/web/lib/principal.ts.
const TEST_PRINCIPAL_COOKIE = 'skyclause_test_principal'

export async function asPage(page: Page, principal: Principal): Promise<void> {
  const url = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
  const value = encodeURIComponent(
    JSON.stringify(principal, (_key, field: unknown) => (field instanceof Date ? field.toISOString() : field))
  )

  await page.context().addCookies([{ name: TEST_PRINCIPAL_COOKIE, value, url, httpOnly: true, sameSite: 'Lax' }])
}
