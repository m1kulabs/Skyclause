import { expect, test, type Browser, type Page } from '@playwright/test'
import { expectZonedTimes } from './harness/expect-zoned-times'

const SECTIONS = [
  'how-heading',
  'record-heading',
  'features-heading',
  'proof-heading',
  'pricing-heading',
  'faq-heading',
  'cta-heading'
]

async function sectionIds(page: Page) {
  return page
    .locator('main section[aria-labelledby]')
    .evaluateAll((sections) => sections.map((section) => section.getAttribute('aria-labelledby')))
}

test('the sections follow the hero in the order of the argument, each with its heading', async ({ page }) => {
  await page.goto('/')
  expect((await sectionIds(page)).slice(1)).toEqual(SECTIONS)
  await expect(page.getByRole('heading', { level: 2, name: 'What the record keeps' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Read from public sources' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Common questions' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /What’s the call for/ })).toBeVisible()
  // The how-it-works heading is the current stage's clause, read whole.
  await expect(page.getByRole('heading', { level: 2, name: /^First, the gauge reads 39\smm$/ })).toBeVisible()
})

test('landing LND-6 every price carries proposal, untested', async ({ page }) => {
  await page.goto('/')
  const prices = page.locator('[data-source="/legal/terms#plans"]').filter({ hasText: /RM\s?\d|Free/ })
  expect(await prices.count()).toBeGreaterThanOrEqual(3)
  for (const price of await prices.all()) await expect(price).toContainText('proposal, untested')
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
  expect(await numeralsWithoutSource(page)).toEqual([])
})

test('landing times carry MYT (LOC-6)', async ({ page }) => {
  await page.goto('/')
  await expectZonedTimes(page)
})

test('the questions open one at a time, and the grades answer reads the live grades', async ({ page }) => {
  await page.goto('/')
  const tiles = page.locator('details[name="faq"]')
  await expect(tiles.filter({ hasText: 'Is it right?' })).toHaveAttribute('open', '')
  await expect(tiles.getByText('No live grades yet (n=0)')).toBeVisible()
  await page.getByText('Who makes the call?', { exact: true }).click()
  await expect(page.getByText('a person on the approver rota approves it before anyone hears it.')).toBeVisible()
  expect(await tiles.evaluateAll((all) => all.filter((tile) => (tile as HTMLDetailsElement).open).length)).toBe(1)
})

test('dragging through the stages swaps the clause and the fragment', async ({ page }) => {
  await page.goto('/')
  const range = page.getByRole('slider', { name: 'Stage' })
  await expect(range).toBeEnabled()
  await range.focus()
  await range.press('ArrowRight')
  await range.press('ArrowRight')
  await expect(page.locator('#how-heading .how-step:visible')).toHaveText('The window gets its verdict')
  await expect(page.locator('.how-fragment[data-stage="2"]')).toBeVisible()
  await expect(page.locator('.how-fragment[data-stage="0"]')).toBeHidden()
  await expect(page.getByRole('radio', { name: 'Verdict and call' })).toBeChecked()
  // The stage names are radios (the whole name is the target) and drive the range back.
  await page.getByRole('radio', { name: 'Grade', exact: true }).check()
  await expect(range).toHaveValue('4')
  await expect(page.locator('#how-heading .how-step:visible')).toHaveText('Next morning, it is graded')
})

test('choosing a part of the record swaps its photograph, object and fact', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.record-object[data-item="ledger"]')).toBeVisible()
  await page.getByRole('radio', { name: 'The notice' }).check()
  await expect(page.locator('.record-object[data-item="notice"]')).toBeVisible()
  await expect(page.locator('.record-object[data-item="ledger"]')).toBeHidden()
  await expect(page.locator('.record-photo[data-item="notice"]')).toHaveCSS('opacity', '1')
  await expect(page.locator('.record-object[data-item="notice"]')).toContainText('Replay of JPS gauge 0232901RF')
})

test('the closing sentence submits a time to the window form at the top of the page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'What’s the call for' }).fill('15:30')
  await page.getByRole('button', { name: 'today?' }).click()
  await expect(page).toHaveURL(/[?&]start=15%3A30/)
  await expect(page).toHaveURL(/#window$/)
  const form = page.locator('form#window')
  await expect(form.getByLabel('Window start')).toHaveValue('15:30')
  await expect(form.getByLabel('Window end')).toHaveValue('16:30')
})

test('the photographs crossfade only calm skies, and the pause stops them', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const sources = await page
    .locator('[aria-label^="Bukit Jalil under its sky"] img')
    .evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).getAttribute('src')))
  expect(sources).toEqual([
    '/landing/bukit-jalil-lrt-day.jpg',
    '/landing/stadium-clouds.jpg',
    '/landing/stadium-night.jpg'
  ])
  const states = () =>
    page
      .locator('[aria-label^="Bukit Jalil under its sky"] img')
      .evaluateAll((imgs) => imgs.map((img) => getComputedStyle(img).animationPlayState))
  expect(await states()).toContain('running')
  await page.getByLabel('Pause the photographs').check()
  expect(new Set((await states()).join(',').split(/,\s*/))).toEqual(new Set(['paused']))
})

const MOVED = '[data-reveal], [data-words] .word, [data-reveal-slot]'

/** Elements the motion layer would move, left anywhere short of their final, visible state. */
async function unsettled(page: Page) {
  return page.locator(MOVED).evaluateAll((els) =>
    els
      .filter((el) => {
        const style = getComputedStyle(el)
        return Number(style.opacity) < 1 || (style.transform !== 'none' && style.transform !== '')
      })
      .map((el) => el.className || el.tagName)
  )
}

async function scriptsAfterIntent(page: Page) {
  const fetched: string[] = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') fetched.push(response.url())
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  const before = fetched.length
  await page.mouse.move(400, 400)
  await page.mouse.wheel(0, 600)
  await page.keyboard.press('Shift')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  return fetched.slice(before)
}

test('motion loads only after the first interaction, then reveals what the visitor has not reached', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const later = await scriptsAfterIntent(page)
  expect(later.length, 'GSAP, ScrollTrigger and Lenis load on intent').toBeGreaterThan(0)
  await expect(page.locator('html')).toHaveClass(/\blenis\b/)
  // Scrolling through settles every entrance; nothing stays hidden or displaced.
  for (let y = 0; y < 12; y++) {
    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(1500)
  expect(await unsettled(page)).toEqual([])
})

for (const source of ['the OS', 'the account'] as const) {
  test(`reduced motion from ${source} loads no tween and leaves nothing transformed away`, async ({ page }) => {
    if (source === 'the OS') await page.emulateMedia({ reducedMotion: 'reduce' })
    else {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      // The account's setting arrives as html[data-motion='reduce'] before any interaction.
      await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () =>
          document.documentElement.setAttribute('data-motion', 'reduce')
        )
      })
    }
    const later = await scriptsAfterIntent(page)
    expect(later, 'no motion script loads under reduced motion').toEqual([])
    await expect(page.locator('html')).not.toHaveClass(/\blenis\b/)
    expect(await unsettled(page)).toEqual([])
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
  })
}

test('with scripts blocked the page is complete: every section, stage, part and form is there', async ({
  browser
}: {
  browser: Browser
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The call for every window')
    expect((await sectionIds(page)).slice(1)).toEqual(SECTIONS)
    expect(await unsettled(page)).toEqual([])
    expect(await numeralsWithoutSource(page)).toEqual([])
    // The stages and the record still switch through their radios.
    await page.getByRole('radio', { name: 'Clause', exact: true }).check()
    await expect(page.locator('#how-heading .how-step:visible')).toHaveText('Then Storm confirmed fires')
    await page.getByRole('radio', { name: 'The grade' }).check()
    await expect(page.locator('.record-object[data-item="grade"]')).toBeVisible()
    // The range waits for script; the closing sentence and the window form are plain GET forms.
    await expect(page.getByRole('slider', { name: 'Stage' })).toBeDisabled()
    await expect(page.locator('form.cta-form input[name="start"]')).toBeVisible()
    await expect(page.locator('form#window input[name="end"]')).toBeVisible()
    await expect(page.locator('details[name="faq"]').getByText('No live grades yet (n=0)')).toBeVisible()
  } finally {
    await context.close()
  }
})
