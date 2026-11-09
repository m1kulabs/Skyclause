import { test, expect } from '../fixtures'
import { setup, row, route, copy } from './fixtures'

// Lighthouse core/config/constants.js: motoGPower screenEmulation and mobile UA.
// https://github.com/GoogleChrome/lighthouse/blob/main/core/config/constants.js
test('LED-7 Moto G Power (2022), 4x CPU: 10000 stub entries scroll and every filter stays below 200ms INP', async ({
  browser,
  baseURL
}, testInfo) => {
  test.setTimeout(120000)
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36'
  })
  const page = await context.newPage()
  try {
    // This is the only 10000-entry dataset; it never enters a production module.
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      ...row,
      id: `performance-entry-${index}`,
      seq: index + 1
    }))
    await setup(page, { rows })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(route)
    const frame = page.locator('[data-ledger-frame]')
    await expect(frame).toBeVisible({ timeout: 30000 })
    await page.addScriptTag({
      path: new URL('../../node_modules/web-vitals/dist/web-vitals.iife.js', import.meta.url).pathname
    })
    await page.evaluate(() => {
      const target = window as unknown as {
        webVitals: {
          onINP: (
            callback: (metric: { value: number; entries: PerformanceEntry[] }) => void,
            options: { reportAllChanges: boolean; durationThreshold: number }
          ) => void
        }
        ledgerINP: number[]
        ledgerLastEvent: number
        ledgerINPEntries: unknown[]
      }
      target.ledgerINP = []
      target.ledgerLastEvent = 0
      target.ledgerINPEntries = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          target.ledgerLastEvent = Math.max(target.ledgerLastEvent, entry.startTime)
      }).observe({ type: 'event', durationThreshold: 0 } as PerformanceObserverInit)
      // Chrome omits Event Timing entries shorter than its 16 ms reporting floor.
      // A trusted keydown still marks the date-filter interaction for this test.
      window.addEventListener(
        'keydown',
        (event) => {
          if (event.isTrusted) target.ledgerLastEvent = performance.now()
        },
        { capture: true }
      )
      target.webVitals.onINP(
        (metric) => {
          target.ledgerINP.push(metric.value)
          target.ledgerINPEntries = metric.entries.map((entry) => entry.toJSON())
        },
        {
          reportAllChanges: true,
          durationThreshold: 0
        }
      )
    })
    await page.evaluate(() => document.fonts.ready)
    await frame.focus()
    let interactionStart = await page.evaluate(() => performance.now())
    for (let index = 0; index < 8; index++) await page.keyboard.press('PageDown')
    await expect.poll(() => frame.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000)
    expect(await page.locator('tr[data-index]').count()).toBeLessThan(25)
    await expect(page.locator('table')).toHaveAttribute('aria-rowcount', '10001')
    const results: Record<string, number> = {}
    const measure = async (name: string) => {
      // Wait for this phase's trusted event, not a stale metric from the previous filter.
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { ledgerLastEvent: number }).ledgerLastEvent))
        .toBeGreaterThanOrEqual(interactionStart)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { ledgerINP: number[] }).ledgerINP.length))
        .toBeGreaterThan(0)
      const inp = await page.evaluate(() => Math.max(...(window as unknown as { ledgerINP: number[] }).ledgerINP))
      results[name] = inp
      if (inp >= 200)
        console.log(
          'LED-7 slow interaction',
          name,
          await page.evaluate(() => (window as unknown as { ledgerINPEntries: unknown[] }).ledgerINPEntries)
        )
      expect(inp, `${name} INP in ms`).toBeLessThan(200)
    }
    await measure('scroll')
    for (const key of ['pack', 'mode', 'state']) {
      const control = page.getByLabel(copy(`ledger.${key}`), { exact: true })
      await control.focus()
      interactionStart = await page.evaluate(() => performance.now())
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`${key}=`))
      await expect(frame).toBeVisible({ timeout: 30000 })
      await measure(key)
    }
    for (const [key, value] of [
      ['from', '2026-11-02'],
      ['to', '2028-11-04']
    ]) {
      const control = page.getByLabel(copy(`ledger.${key}`), { exact: true })
      await control.fill(value!)
      await control.focus()
      interactionStart = await page.evaluate(() => performance.now())
      await page.keyboard.press('ArrowUp')
      await expect(page).toHaveURL(new RegExp(`${key}=`))
      await expect(frame).toBeVisible({ timeout: 30000 })
      await measure(key!)
    }
    await testInfo.attach('LED-7 emulated INP', {
      body: JSON.stringify(
        {
          device: 'Lighthouse Moto G Power (2022)',
          cpuSlowdownMultiplier: 4,
          entries: 10000,
          inpMs: results,
          physicalDevice: false
        },
        null,
        2
      ),
      contentType: 'application/json'
    })
    console.log(`LED-7 emulation: ${JSON.stringify(results)} ms; physical device not tested`)
  } finally {
    await context.close()
  }
})
