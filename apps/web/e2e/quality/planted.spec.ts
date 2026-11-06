// The planted routes exist only in builds made with PLANTED_ROUTES=1 (Playwright's web server). deploy.yml's
// @smoke run against production (#90, E2E_BASE_URL) checks that none ever ships.
import { expect, test } from '@playwright/test'

test('@smoke production serves no planted test route', async ({ request }) => {
  test.skip(!process.env.E2E_BASE_URL, 'runs against a deployed build: deploy.yml sets E2E_BASE_URL (#90)')
  for (const path of ['/quality-planted/unlabelled-input', '/quality-planted/vitals']) {
    expect((await request.get(path)).status(), path).toBe(404)
  }
})
