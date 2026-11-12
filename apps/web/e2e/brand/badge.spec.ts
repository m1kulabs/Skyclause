import { test, expect } from '../fixtures'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

for (const theme of ['dark', 'light', 'dark-hc', 'light-hc'] as const) {
  for (const locale of ['en', 'ms'] as const) {
    test(`ModeBadge and glyphs: contrast, axe, keyboard and reflow in ${theme}/${locale}`, async ({
      page,
      baseURL,
      expectAxeClean
    }, info) => {
      await page.context().addCookies([
        {
          name: 'skyclause-test-appearance',
          value: JSON.stringify({
            theme: theme.startsWith('light') ? 'light' : 'dark',
            contrast: theme.endsWith('hc') ? 'more' : 'standard'
          }),
          url: baseURL!
        }
      ])
      for (const width of [1280, 375, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/_test/brand?locale=${locale}`)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.locator('.mode-badge')).toHaveCount(16)
        await expect(page.locator('[data-unbuilt="d-brand-assets"]')).toHaveCount(0)
        await expect(page.locator('.mode-badge svg:not([aria-hidden="true"])')).toHaveCount(0)
        await expect(page.locator('.mode-badge[lang="ms"]')).toHaveCount(locale === 'ms' ? 16 : 0)
        const measurements = await page.locator('.mode-badge').evaluateAll((badges) => {
          function luminance(colour: string) {
            const channels = colour
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map((value) => {
                const c = Number(value) / 255
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
              })
            return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
          }
          function contrast(foreground: string, background: string) {
            const a = luminance(foreground),
              b = luminance(background)
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          }
          function background(element: Element): string {
            const colour = getComputedStyle(element).backgroundColor
            return colour === 'rgba(0, 0, 0, 0)' && element.parentElement ? background(element.parentElement) : colour
          }
          return badges.map((badge) => {
            const pill = badge.firstElementChild!
            const glyph = pill.querySelector('svg')!
            const bg = background(pill)
            return {
              word: badge.textContent,
              height: badge.getBoundingClientRect().height,
              width: badge.getBoundingClientRect().width,
              pill: pill.getBoundingClientRect().height,
              text: contrast(getComputedStyle(pill).color, bg),
              glyph: contrast(getComputedStyle(glyph).color, bg),
              transform: getComputedStyle(pill).textTransform
            }
          })
        })
        for (const measured of measurements) {
          expect(measured.height, measured.word!).toBeGreaterThanOrEqual(24)
          expect(measured.width, measured.word!).toBeGreaterThanOrEqual(24)
          expect(measured.text, measured.word!).toBeGreaterThanOrEqual(4.5)
          expect(measured.glyph, measured.word!).toBeGreaterThanOrEqual(3)
          expect(measured.transform).toBe('none')
        }
        // The text-size capsule: 13px type on a 16px line in a 22px capsule with its 2px edge.
        expect(measurements[0]!.pill).toBe(22)
        await expectAxeClean(page)
        await expectUnclippedText(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.locator('[data-before]').focus()
        await page.keyboard.press('Tab')
        await expect(page.locator('[data-after]')).toBeFocused()
        if (width === 320)
          await info.attach(`${theme}-${locale}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png'
          })
      }
    })
  }
}

test('maskable mark is wholly inside the 409px safe circle', async ({ page }) => {
  await page.goto('/_test/brand')
  const result = await page.evaluate(async () => {
    const image = new Image()
    image.src = '/icons/maskable-512.png'
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, 512, 512)
    let radius = 0,
      pixels = 0
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4
        if (data[i] !== 23 || data[i + 1] !== 23 || data[i + 2] !== 25) {
          pixels++
          radius = Math.max(radius, Math.hypot(x + 0.5 - 256, y + 0.5 - 256))
        }
      }
    return { radius, pixels }
  })
  expect(result.pixels).toBeGreaterThan(1000)
  expect(result.radius).toBeLessThanOrEqual(409 / 2)
})
