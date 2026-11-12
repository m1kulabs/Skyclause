import { expect, test } from '../fixtures'
import type { Page } from '@playwright/test'
import type { Appearance } from '../../lib/theme'

async function appearance(page: Page, baseURL: string, preferences: Partial<Appearance>) {
  await page
    .context()
    .addCookies([{ url: baseURL, name: 'skyclause-test-appearance', value: JSON.stringify(preferences) }])
}

const modes = [
  { theme: 'dark', contrast: 'standard', className: 'dark', ground: '#1a2039', ink: 'rgb(249, 163, 192)' },
  { theme: 'light', contrast: 'standard', className: 'light', ground: '#fdeef3', ink: 'rgb(26, 32, 57)' },
  { theme: 'dark', contrast: 'more', className: 'dark hc', ground: '#0b0e1f', ink: 'rgb(255, 255, 255)' },
  { theme: 'light', contrast: 'more', className: 'light hc', ground: '#ffffff', ink: 'rgb(11, 14, 31)' }
] as const

for (const mode of modes) {
  test(`${mode.className}: tokens, SSR metadata, skip link and focus`, async ({ page, baseURL, expectAxeClean }) => {
    await appearance(page, baseURL!, mode)
    await page.emulateMedia({ colorScheme: mode.theme, contrast: 'no-preference' })
    const response = await page.goto('/_test/tokens')
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    expect(html).toContain(`class="${mode.className}"`)
    expect(html).toContain(`style="color-scheme:${mode.theme}"`)
    expect(html).toContain(`<meta name="theme-color" content="${mode.ground}"`)
    await expect(page.locator('html')).toHaveClass(mode.className)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', mode.ground)
    await expectAxeClean(page)
    await page.keyboard.press('Tab')
    const skip = page.locator('.skip-link')
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    const ring = await skip.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        width: style.outlineWidth,
        offset: style.outlineOffset,
        color: style.outlineColor,
        type: style.outlineStyle
      }
    })
    // The ring is the theme's ink, 2px (3px in high contrast) with a 2px offset.
    expect(ring).toEqual({
      width: mode.contrast === 'more' ? '3px' : '2px',
      offset: '2px',
      color: mode.ink,
      type: 'solid'
    })
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })
}

test('signed-out appearance defaults to dark even with a light OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', contrast: 'no-preference' })
  const response = await page.goto('/_test/tokens')
  expect(await response!.text()).toContain('class="dark"')
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('system follows colour, contrast and motion changes without reloading', async ({ page, baseURL }) => {
  await appearance(page, baseURL!, { theme: 'system' })
  await page.emulateMedia({ colorScheme: 'dark', contrast: 'no-preference', reducedMotion: 'no-preference' })
  await page.goto('/_test/tokens')
  const start = await page.evaluate(() => performance.timeOrigin)
  await expect(page.locator('html')).toHaveClass('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass('light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fdeef3')
  await page.emulateMedia({ contrast: 'more' })
  await expect(page.locator('html')).toHaveClass('light hc')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/^(dark hc|hc dark)$/)
  await page.emulateMedia({ contrast: 'no-preference', reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(start)
})

test('SSR uses available OS client hints for system preferences', async ({ page, baseURL }) => {
  await appearance(page, baseURL!, { theme: 'system' })
  const response = await page.request.get('/_test/tokens', {
    headers: {
      'sec-ch-prefers-color-scheme': '"light"',
      'sec-ch-prefers-contrast': '"more"',
      'sec-ch-prefers-reduced-motion': '"reduce"'
    }
  })
  const html = await response.text()
  expect(html).toContain('class="light hc"')
  expect(html).toContain('style="color-scheme:light"')
  expect(html).toContain('data-motion="reduce"')
  expect(html).toContain('<meta name="theme-color" content="#ffffff"')
})

for (const source of ['OS', 'attribute'] as const) {
  test(`${source} reduced motion removes every transition and animation`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: source === 'OS' ? 'reduce' : 'no-preference' })
    await page.goto('/_test/tokens')
    if (source === 'attribute')
      await page.locator('html').evaluate((root) => {
        root.dataset.motion = 'reduce'
      })
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce')
    const result = await page.evaluate(() => {
      const style = document.createElement('style')
      style.textContent =
        '.motion-probe { transition: transform 1s, opacity 1s; animation: probe 1s infinite } @keyframes probe { to { opacity: .5 } }'
      document.head.append(style)
      const probe = document.createElement('div')
      probe.className = 'motion-probe'
      document.body.append(probe)
      const styles = [getComputedStyle(probe), getComputedStyle(probe, '::before')]
      const result = styles.map((item) => ({ transition: item.transitionProperty, animation: item.animationName }))
      probe.remove()
      style.remove()
      return result
    })
    expect(result).toEqual([
      { transition: 'none', animation: 'none' },
      { transition: 'none', animation: 'none' }
    ])
  })
}

test('marketing stays dark when the viewer selects light', async ({ page, baseURL }) => {
  await appearance(page, baseURL!, { theme: 'light' })
  await page.emulateMedia({ colorScheme: 'light', contrast: 'no-preference' })
  const response = await page.goto('/')
  const html = await response!.text()
  expect(html).toContain('class="dark" style="color-scheme:dark"')
  expect(html).toContain('<meta name="theme-color" content="#1a2039"')
  await expect(page.locator('html')).toHaveClass('dark')
  // next/font names the face in lower case; CSS family names match without regard to case.
  await expect(page.locator('body')).toHaveCSS('font-family', /^roundo, "roundo Fallback"/i)
  await expect(page.locator('[data-surface="marketing"]')).toHaveCSS('background-color', 'rgb(26, 32, 57)')
  await expect(page.locator('[data-surface="marketing"]')).toHaveCSS('color-scheme', 'dark')
  expect(
    await page
      .locator('[data-surface="marketing"]')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--card').trim())
  ).toBe('#212846')
})

test('marketing follows OS contrast and motion while keeping a dark document', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', contrast: 'more', reducedMotion: 'reduce' })
  const response = await page.goto('/')
  const html = await response!.text()
  // The body carries the font's class, so find the tag by its opening.
  expect(html.indexOf('prefers-contrast: more')).toBeLessThan(html.indexOf('<body'))
  expect(html.indexOf('prefers-reduced-motion: reduce')).toBeLessThan(html.indexOf('<body'))
  await expect(page.locator('html')).toHaveClass('dark hc')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0e1f')
  await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await page.emulateMedia({ contrast: 'no-preference', reducedMotion: 'no-preference' })
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')
})

test('unmatched routes keep request-time appearance in their own document', async ({ page, baseURL }) => {
  await appearance(page, baseURL!, { theme: 'system' })
  const response = await page.request.get('/no-such-route-95s', {
    headers: {
      'sec-ch-prefers-color-scheme': '"light"',
      'sec-ch-prefers-contrast': '"more"',
      'sec-ch-prefers-reduced-motion': '"reduce"'
    }
  })
  expect(response.status()).toBe(404)
  const html = await response.text()
  expect(html).toContain('class="light hc"')
  expect(html).toContain('style="color-scheme:light"')
  expect(html).toContain('data-motion="reduce"')
  expect(html).toContain('<meta name="theme-color" content="#ffffff"')
  expect(html).toContain('class="skip-link"')
  expect(html).toContain('id="skyclause-announcer"')
  expect(html.match(/<html\b/g)).toHaveLength(1)
  expect(html.match(/<body\b/g)).toHaveLength(1)
})

test('forced colours retain system surfaces and a visible focus outline', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/_test/tokens')
  expect(
    await page.locator('html').evaluate((root) => getComputedStyle(root).getPropertyValue('--background').trim())
  ).toBe('Canvas')
  await page.keyboard.press('Tab')
  await expect(page.locator('.skip-link')).toBeFocused()
  await expect(page.locator('.skip-link')).toHaveCSS('outline-style', 'solid')
})
