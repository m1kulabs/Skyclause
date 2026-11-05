import { expect, test } from './fixtures'

test('the home page has no serious or critical axe findings', async ({ page, expectAxeClean }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Skyclause')
  await expectAxeClean(page)
})

test('GET /healthz answers 200', async ({ request }) => {
  expect((await request.get('/healthz')).status()).toBe(200)
})
