// The planted routes exist only in builds made with PLANTED_ROUTES=1 (Playwright's web server). deploy.yml's
// @smoke run against production (#90, E2E_BASE_URL) checks that none ever ships.
import { expect, test } from '@playwright/test'

test('@smoke production serves no test route', async ({ request }) => {
  test.skip(!process.env.E2E_BASE_URL, 'runs against a deployed build: deploy.yml sets E2E_BASE_URL (#90)')
  for (const path of [
    '/_test/tokens',
    '/_test/shell',
    '/_test/set-7',
    '/quality-planted/unlabelled-input',
    '/quality-planted/vitals'
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    const html = await response.text()
    expect(html, path).toContain('class="skip-link"')
    expect(html, path).toContain('id="skyclause-announcer"')
  }
})
