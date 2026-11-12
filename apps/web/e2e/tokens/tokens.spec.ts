import { expect, test } from '../fixtures'
import type { Locator, Page } from '@playwright/test'
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

// Reduced motion takes the movement out (no spin, no slide or zoom) and leaves the state changes (a 120ms fade); there
// is no blanket rule, so a transition on a colour is untouched.
const motionProbe = () => {
  const style = document.createElement('style')
  style.textContent =
    '.motion-probe { transition: transform 1s, color 1s; transform: translateY(10px) } .motion-spin { animation: motion-spin 1s linear infinite } @keyframes motion-spin { to { opacity: .5 } }'
  document.head.append(style)
  const read = (attrs: Record<string, string>, className: string) => {
    const node = document.createElement('div')
    node.className = className
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    document.body.append(node)
    const computed = getComputedStyle(node)
    const result = {
      animation: computed.animationName,
      transition: computed.transitionProperty,
      duration: computed.transitionDuration,
      transform: computed.transform,
      opacity: computed.opacity
    }
    node.remove()
    return result
  }
  const result = {
    spinner: read({}, 'animate-spin'),
    popup: read({ 'data-open': '' }, 'motion-probe'),
    entering: read({ 'data-starting-style': '' }, 'motion-probe'),
    colour: read({}, 'motion-probe')
  }
  style.remove()
  return result
}

for (const source of ['OS', 'attribute'] as const) {
  test(`${source} reduced motion stops the movement and keeps a short fade`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: source === 'OS' ? 'reduce' : 'no-preference' })
    await page.goto('/_test/tokens')
    if (source === 'attribute')
      await page.locator('html').evaluate((root) => {
        root.dataset.motion = 'reduce'
      })
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce')
    const result = await page.evaluate(motionProbe)
    expect(result.spinner.animation).toBe('none')
    // A popup fades in 120ms and loses its slide while it enters or leaves.
    expect(result.popup).toMatchObject({ transition: 'opacity', duration: '0.12s' })
    expect(result.entering).toMatchObject({ transform: 'none', opacity: '0' })
    // Nothing else is switched off: the probe's own transform and colour transition stay as the page wrote them.
    expect(result.colour.transition).toBe('transform, color')
    expect(result.colour.transform).not.toBe('none')
  })
}

test('the spinner stops and says Loading… in words under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/_test/tokens')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce')
  const spinner = page.locator('[data-slot="spinner"]')
  await expect(spinner.locator('[data-slot="spinner-label"]')).toBeVisible()
  await expect(spinner.locator('[data-slot="spinner-label"]')).toHaveText('Loading…')
  await expect(spinner.locator('svg')).toHaveCSS('animation-name', 'none')
})

test('the spinner spins with its word hidden from sight under full motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/_test/tokens')
  const spinner = page.locator('[data-slot="spinner"]')
  await expect(spinner.locator('svg')).not.toHaveCSS('animation-name', 'none')
  await expect(spinner).toContainText('Loading…')
  await expect(spinner.locator('[data-slot="spinner-label"]')).toHaveCSS('position', 'absolute')
})

test('full motion in the account wins over a reduced OS setting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/_test/tokens')
  await page.locator('html').evaluate((root) => {
    root.dataset.motion = 'full'
  })
  const result = await page.evaluate(motionProbe)
  expect(result.spinner.animation).not.toBe('none')
  expect(result.popup.transition).toBe('transform, color')
})

test('the page runs edge to edge so the safe-area insets take effect', async ({ page }) => {
  const response = await page.goto('/_test/tokens')
  expect(await response!.text()).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/)
})

test('the figures face is preloaded with Roundo and sets figures', async ({ page, request }) => {
  // The static shell announces its fonts in the Link header (a streamed page keeps them out of the head).
  const preload = (await request.get('/')).headers().link ?? ''
  expect(preload).toMatch(/Roundo_Variable[^>]*\.woff2>; rel=preload; as="font"/)
  for (const face of ['Regular', 'Medium', 'SemiBold'])
    expect(preload).toMatch(new RegExp(`SkyclauseFigures_${face}[^>]*\\.woff2>; rel=preload; as="font"`))
  await page.goto('/_test/tokens')
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return document.fonts.check('14px "Skyclause Figures"', '12:30')
  })
  expect(loaded).toBe(true)
})

test('buttons, links and fields take no double-tap zoom, and dialogs and menus keep their scroll', async ({ page }) => {
  await page.goto('/_test/tokens')
  await expect(page.locator('button').first()).toHaveCSS('touch-action', 'manipulation')
  await expect(page.locator('a').first()).toHaveCSS('touch-action', 'manipulation')
  await expect(page.locator('input').first()).toHaveCSS('touch-action', 'manipulation')
  const contained = await page.evaluate(() => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    const value = getComputedStyle(dialog).overscrollBehaviorY
    dialog.remove()
    return value
  })
  expect(contained).toBe('contain')
})

test.describe('the shared table', () => {
  test('rows sit on a 44px pitch (40px compact), the header is a quiet strip, names truncate with a title', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/_test/tokens')
    const tables = page.locator('section[aria-labelledby="tables"] [data-slot="table"]')
    const rows = tables.first().locator('tbody tr')
    await expect(rows.first()).toHaveCSS('height', '44px')
    await expect(tables.nth(1).locator('tbody tr').first()).toHaveCSS('height', '40px')
    const head = tables.first().locator('th').first()
    await expect(head).toHaveCSS('font-size', '13px')
    await expect(head).toHaveCSS('text-transform', 'none')
    // No rule between rows: tone and space only.
    await expect(rows.first().locator('td').first()).toHaveCSS('border-bottom-width', '0px')
    const name = page.locator('section[aria-labelledby="tables"] [data-truncate]').nth(2)
    await expect(name).toHaveAttribute('title', /Release wave at the stadium gate/)
    expect(await name.locator('[data-slot="table-truncate"]').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true
    )
    // Numeric columns align right in figures; the selected row is current with a mark and a tone.
    await expect(tables.first().locator('td[data-numeric]').first()).toHaveCSS('text-align', 'right')
    const selected = tables.first().locator('tbody tr[data-state="selected"]')
    await expect(selected).toHaveAttribute('aria-current', 'true')
    expect(
      await selected
        .locator('td')
        .first()
        .evaluate((el) => getComputedStyle(el, '::before').content)
    ).toBe('""')
    // The measure's fill is a capsule at least as wide as it is tall.
    const fill = tables.first().locator('[data-slot="table-measure-fill"]').first()
    const box = (await fill.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(box.height)
    await expect(fill).toHaveCSS('border-top-left-radius', '9999px')
  })

  test('the sticky header stays under the bar while the page scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 })
    await page.goto('/_test/tokens')
    const head = page.locator('section[aria-labelledby="tables"] [data-slot="table"][data-sticky] th').first()
    await head.scrollIntoViewIfNeeded()
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--shell-bar-height', '48px')
      const table = document.querySelector('section[aria-labelledby="tables"] [data-slot="table"][data-sticky]')!
      window.scrollTo(0, table.getBoundingClientRect().top + window.scrollY + 120)
    })
    await expect.poll(async () => Math.round((await head.boundingBox())!.y)).toBe(48)
  })

  test('below 640px every row is a two-line item with the header kept for assistive technology', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/_test/tokens')
    const table = page.locator('section[aria-labelledby="tables"] [data-slot="table"]').first()
    const row = table.locator('tbody tr').first()
    await expect(row).toHaveCSS('display', 'flex')
    // The header is out of sight but still in the accessibility tree.
    const header = table.locator('thead')
    expect((await header.boundingBox())!.width).toBeLessThanOrEqual(1)
    await expect(table.getByRole('columnheader', { name: 'Window' })).toHaveCount(1)
    // Line one: the name and the call; line two: the figures, each led by its label.
    const [name, crossed, call] = await row
      .locator('td')
      .evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().top)))
    expect(Math.abs(call! - name!)).toBeLessThan(12)
    expect(crossed!).toBeGreaterThan(name!)
    expect(
      await row
        .locator('td')
        .nth(1)
        .evaluate((el) => getComputedStyle(el, '::before').content)
    ).toContain('Crossed')
    // No horizontal scroll at the phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

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

/**
 * The pixels inside a control's label box that stand apart from the box's commonest colour. Forced colours paint a
 * Canvas backplate behind text, so a label in Canvas's own colour (ButtonFace or HighlightText in most palettes) counts 0.
 */
async function labelInk(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded()
  const box = await control.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const rect = range.getBoundingClientRect()
    return { x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: rect.height - 4 }
  })
  const png = (await page.screenshot({ clip: box })).toString('base64')
  // A blank page decodes the picture: the app's CSP keeps data: images out of its own pages.
  const blank = await page.context().newPage()
  try {
    return await blank.evaluate(async (data) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      const counts = new Map<string, number>()
      for (let i = 0; i < pixels.length; i += 4) {
        const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const ground = [...counts]
        .sort((a, b) => b[1] - a[1])[0]![0]
        .split(',')
        .map(Number)
      let ink = 0
      for (let i = 0; i < pixels.length; i += 4) {
        const distance = Math.max(...[0, 1, 2].map((channel) => Math.abs(pixels[i + channel]! - ground[channel]!)))
        if (distance > 96) ink++
      }
      return ink
    }, png)
  } finally {
    await blank.close()
  }
}

/** A system colour as this page's forced palette resolves it. */
const systemColour = (page: Page, keyword: string) =>
  page.evaluate((colour) => {
    const probe = document.createElement('span')
    probe.style.color = colour
    document.body.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }, keyword)

test('forced colours keep the label of filled and selected controls and the edge of outline ones', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' })
  await page.goto('/sign-in')
  const primary = page.getByRole('button', { name: 'Send sign-in link' })
  const colours = await primary.evaluate((button) => {
    const style = getComputedStyle(button)
    return { text: style.color, background: style.backgroundColor }
  })
  expect(colours.text).not.toBe(colours.background)
  expect(await labelInk(page, primary), 'the primary label is drawn').toBeGreaterThan(20)
  const outline = page.getByRole('button', { name: 'Continue with Google' })
  expect(await outline.evaluate((button) => getComputedStyle(button).borderTopColor)).not.toBe(
    await systemColour(page, 'Canvas')
  )

  await page.goto('/_test/tokens')
  const pressed = page.getByRole('group', { name: 'Pack' }).locator('[data-pressed]')
  await expect(pressed).toHaveText('Sky')
  expect(await labelInk(page, pressed), 'the pressed segment’s label is drawn').toBeGreaterThan(20)
  const tab = page.getByRole('tab', { name: 'Today' })
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  expect(await labelInk(page, tab), 'the selected tab’s label is drawn').toBeGreaterThan(20)
})
