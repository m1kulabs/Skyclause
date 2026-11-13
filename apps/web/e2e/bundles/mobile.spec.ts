import { test, expect } from '../fixtures'
import { expectMobileVitals } from '../harness/mobile-vitals'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import { ids, stubReads, open, callDouble, bundleDouble, t } from './doubles'
import { seedReview } from './seed'

test('NFR-9 mobile bundle meets LCP, INP and CLS budgets against the production build', async ({
  context
}, testInfo) => {
  test.setTimeout(90_000)
  // #372: the bundle is in the test database and the approver signed in, so the server renders the review as it would
  // for a real approver; the client's own reads of it answer with the same rows.
  const org = await makeOrg()
  const review = await seedReview(org, bundleDouble([callDouble(ids.first, { expires_at: '2099-11-02T07:45:00Z' })]))
  const setup = await context.newPage()
  await signInAs(setup, 'approver', org)
  await setup.close()
  // This project runs after the functional projects so parallel axe work cannot consume the throttled CPU.
  await expectMobileVitals(context, testInfo, 'bundle-mobile', async (page) => {
    await stubReads(page, review.bundle, review.calls, { org })
    await open(page, review.path)
    await page.locator('.bundle-call-list').getByRole('button', { name: /^Edit/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t('cancel'), exact: true })
      .press('Enter')
  })
})
