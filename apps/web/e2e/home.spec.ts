import { expect, test } from './fixtures'

test('the home page has no serious or critical axe findings', { tag: '@smoke' }, async ({ page, expectAxeClean }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The call for every window')
  await expectAxeClean(page)
})

test('GET /health answers 200', { tag: '@smoke' }, async ({ request }) => {
  expect((await request.get('/health')).status()).toBe(200)
})
