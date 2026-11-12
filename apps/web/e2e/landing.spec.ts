import { expect, test, type Browser, type Page } from '@playwright/test'
import { expectZonedTimes } from './harness/expect-zoned-times'

test('landing sections render below the hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'One window, three moments' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'From gauge to notice' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Readings from' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Read before you approve' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What it costs' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Common questions' })).toBeVisible()
  await expect(page.getByText('No live grades yet (n=0)')).toBeVisible()
  await expect(page.getByText('proposal, untested').first()).toBeVisible()
  await expect(page.locator('.landing-frame').getByRole('link', { name: 'Open the Commons' })).toHaveAttribute(
    'href',
    /\/guest$/
  )
})

test('landing sections keep DESIGN order', async ({ page }) => {
  await page.goto('/')
  const headings = await page.locator('main h2').allTextContents()
  expect(headings.map((h) => h.trim())).toEqual([
    'One window, three moments',
    'From gauge to notice',
    'Readings from',
    'Read before you approve',
    'What it costs',
    'Common questions',
    'Open the Commons and read the call for Bukit Jalil right now.'
  ])
})

test('landing LND-6 prices carry proposal untested', async ({ page }) => {
  await page.goto('/')
  const prices = page.locator('[data-source="/legal/terms#plans"]', { hasText: 'proposal, untested' })
  await expect(prices.first()).toBeVisible()
  await expect(page.locator('[data-source="/legal/terms#service"]').first()).toBeVisible()
})

test('middle copy reveals inputs by keyboard', async ({ page }) => {
  await page.goto('/')
  const middle = page.locator('.landing-middle')
  await middle.focus()
  await expect(page.getByText(/Clause span/).first()).toBeVisible()
})

test('faq shows one answer pane with one selected dot', async ({ page }) => {
  await page.goto('/')
  const visibleDots = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('[data-crimson="faq-dot"]')].filter(
          (el) => getComputedStyle(el.parentElement!).opacity === '1'
        ).length
    )
  await expect(page.getByText('No live grades yet (n=0)')).toBeVisible()
  await expect.poll(visibleDots).toBe(1)
  await page.getByText('Who makes the call?', { exact: true }).click()
  await expect(page.getByText('A person on the approver rota approves it before anyone hears it.')).toBeVisible()
  await expect(page.getByText('No live grades yet (n=0)')).toBeHidden()
  await expect.poll(visibleDots).toBe(1)
})

// LND-4: no numeral on the whole rendered `/` (hero included) outside an element carrying a data-source link.
async function numeralsWithoutSource(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const text = node.textContent ?? ''
      if (!/[0-9]/.test(text)) continue
      const el = node.parentElement
      if (!el) continue
      // Flight data and styles are not page content.
      if (el.closest('script, style, noscript, template')) continue
      if (!el.closest('[data-source]')) offenders.push(text.trim().slice(0, 60))
    }
    return offenders
  })
}

test('landing LND-4 every numeral carries a data-source link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('No live grades yet (n=0)')).toBeVisible()
  expect(await numeralsWithoutSource(page)).toEqual([])
})

test('landing LND-4 holds without JavaScript', async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'One window, three moments' })).toBeVisible()
    await expect(page.getByText('No live grades yet (n=0)')).toBeVisible()
    expect(await numeralsWithoutSource(page)).toEqual([])
  } finally {
    await context.close()
  }
})

test('landing times carry MYT (LOC-6)', async ({ page }) => {
  await page.goto('/')
  await expectZonedTimes(page)
})
