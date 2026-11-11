// Each per-page check fails on a planted page and passes a clean one, in every browser project.
import { expect, test, type Page } from '@playwright/test'
import { inspectPage, motionFindings, type Finding } from './checks'

const SKIP = '<a href="#main">Skip to content</a>'
// DESIGN: nothing under 24×24 px, so the planted pages size their own controls.
const SIZED =
  '<style>button:not([style]), input:not([style]), body > a { display: inline-block; min-width: 24px; min-height: 24px }</style>'
const planted = (body: string, head = '') =>
  `<!doctype html><html lang="en"><head><title>Planted</title><meta name="viewport" content="width=device-width, initial-scale=1">${SIZED}${head}</head><body>${SKIP}<main id="main">${body}</main></body></html>`

async function findingsOn(page: Page, html: string, options: { reflow?: boolean } = {}) {
  await page.setContent(html)
  return inspectPage(page, { axe: true, reflow: options.reflow ?? false })
}

const checksOf = (findings: Finding[]) => findings.map((finding) => finding.check)

test('a clean page has no findings', async ({ page }) => {
  const html = planted(
    `<h1>Clean</h1><h2>Section</h2><p>Text and a <a href="/x">link</a>.</p>
     <label>Email <input type="email" name="email" autocomplete="email" spellcheck="false"></label>
     <button type="button">Save</button>
     <table><tbody><tr><td style="font-variant-numeric: tabular-nums">12.5</td></tr></tbody></table>`
  )
  expect(await findingsOn(page, html)).toEqual([])
})

test('Next.js development tools are outside the app keyboard audit', async ({ page }) => {
  await page.setContent(planted('<h1>App page</h1><button type="button">Save</button>'))
  await page.evaluate(() => {
    const portal = document.createElement('nextjs-portal')
    const shadow = portal.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<button type="button">Open Next.js Dev Tools</button>'
    document.body.append(portal)
  })

  expect(await inspectPage(page, { axe: false, reflow: false })).toEqual([])
})

test('a page whose first Tab stop is not a skip link fails skip-link', async ({ page }) => {
  await page.setContent(
    '<!doctype html><html lang="en"><head><title>P</title></head><body><main><h1>T</h1><a href="/x">Home</a></main></body></html>'
  )
  const findings = await inspectPage(page, { axe: false, reflow: false })
  expect(checksOf(findings)).toContain('skip-link')
})

test('a control Tab can never reach fails reachability', async ({ page }) => {
  const trap = `<input aria-label="Trap" name="trap" autocomplete="off" onkeydown="if (event.key === 'Tab') event.preventDefault()">`
  const findings = await findingsOn(page, planted(`<h1>T</h1>${trap}<button type="button">Unreachable</button>`))
  expect(findings).toContainEqual(
    expect.objectContaining({ check: 'reachability', detail: expect.stringMatching(/Unreachable/) })
  )
})

test('a focus ring removed without a replacement fails focus-visible', async ({ page }) => {
  const head = '<style>button:focus-visible { outline: none }</style>'
  const findings = await findingsOn(page, planted('<h1>T</h1><button type="button">Bare</button>', head))
  expect(findings).toContainEqual(
    expect.objectContaining({ check: 'focus-visible', detail: expect.stringMatching(/Bare/) })
  )
})

test('a native date control can use its field wrapper focus ring', async ({ page }) => {
  const head =
    '<style>input:focus-visible { outline: none } [data-focus-ring]:focus-within { outline: 2px solid rgb(0 0 0); outline-offset: 2px }</style>'
  const html = planted(
    '<h1>T</h1><div data-focus-ring><label>Semester ends <input type="date" name="ends" autocomplete="off"></label></div>',
    head
  )
  expect(await findingsOn(page, html)).toEqual([])
})

test('a ring drawn with box-shadow replaces the outline', async ({ page }) => {
  // WebKit drops box-shadow on native-appearance buttons, so a real ring of this kind comes with `appearance: none`.
  const head =
    '<style>button { appearance: none } button:focus-visible { outline: none; box-shadow: 0 0 0 2px #000 }</style>'
  expect(await findingsOn(page, planted('<h1>T</h1><button type="button">Ringed</button>', head))).toEqual([])
})

test('two h1s or a skipped level fail headings', async ({ page }) => {
  expect(checksOf(await findingsOn(page, planted('<h1>One</h1><h1>Two</h1>')))).toContain('headings')
  expect(checksOf(await findingsOn(page, planted('<h1>One</h1><h3>Three</h3>')))).toContain('headings')
  expect(checksOf(await findingsOn(page, planted('<h2>No h1</h2>')))).toContain('headings')
})

test('an input without a label, name or autocomplete fails form-fields', async ({ page }) => {
  const findings = await findingsOn(page, planted('<h1>T</h1><input>'))
  expect(findings).toContainEqual(
    expect.objectContaining({ check: 'form-fields', detail: expect.stringMatching(/label/) })
  )
  expect(findings).toContainEqual(
    expect.objectContaining({ check: 'form-fields', detail: expect.stringMatching(/name/) })
  )
  expect(findings).toContainEqual(
    expect.objectContaining({ check: 'form-fields', detail: expect.stringMatching(/autocomplete/) })
  )
  expect(checksOf(findings)).toContain('axe')
})

test('a generated or generic name fails form-fields', async ({ page }) => {
  const field = (name: string) => `<label>F <input name="${name}" autocomplete="off"></label>`
  const html = planted(
    `<h1>T</h1>${['_r_1_', '_R_2bm_', '«r3»', ':r4:', 'input', 'field-2', '7', 'site_name', 'sla_s_sky'].map(field).join('')}`
  )
  const names = (await findingsOn(page, html)).filter((finding) => / name /.test(finding.detail))
  expect(names.map((finding) => finding.detail)).toEqual([
    'input[name="_r_1_"] has a name that doesn’t say what it holds',
    'input[name="_R_2bm_"] has a name that doesn’t say what it holds',
    'input[name="«r3»"] has a name that doesn’t say what it holds',
    'input[name=":r4:"] has a name that doesn’t say what it holds',
    'input[name="input"] has a name that doesn’t say what it holds',
    'input[name="field-2"] has a name that doesn’t say what it holds',
    'input[name="7"] has a name that doesn’t say what it holds'
  ])
  expect(names.every((finding) => finding.check === 'form-fields')).toBe(true)
})

test('email, code, slug and station fields without spellcheck="false" fail spellcheck', async ({ page }) => {
  const field = (attrs: string) => `<label>F <input ${attrs} autocomplete="off"></label>`
  const html = planted(
    `<h1>T</h1>${field('type="email" name="email"')}${field('name="code"')}${field('name="slug"')}${field('name="station_id"')}`
  )
  const spellcheck = (await findingsOn(page, html)).filter((finding) => finding.check === 'spellcheck')
  expect(spellcheck).toHaveLength(4)
})

test('a field whose type doesn’t fit what it holds fails input-type', async ({ page }) => {
  const field = (attrs: string) => `<label>F <input ${attrs} spellcheck="false"></label>`
  const html = planted(
    `<h1>T</h1>${field('name="contact" autocomplete="email"')}${field('name="email" autocomplete="off"')}
     ${field('name="site" autocomplete="url"')}${field('name="phone" autocomplete="off"')}
     ${field('type="email" name="email" autocomplete="email"')}${field('type="tel" name="mobile" autocomplete="tel-national"')}`
  )
  const types = (await findingsOn(page, html)).filter((finding) => finding.check === 'input-type')
  expect(types.map((finding) => finding.detail)).toEqual([
    'input[name="contact"] holds an email address but is type="text"; use type="email"',
    'input[name="email"] holds an email address but is type="text"; use type="email"',
    'input[name="site"] holds a URL but is type="text"; use type="url"',
    'input[name="phone"] holds a phone number but is type="text"; use type="tel"'
  ])
})

test('a code in a number field fails input-type, and a quantity there passes', async ({ page }) => {
  const field = (attrs: string) => `<label>F <input type="number" ${attrs} spellcheck="false"></label>`
  const html = planted(
    `<h1>T</h1>${field('name="postcode" autocomplete="postal-code"')}${field('name="otp" autocomplete="one-time-code"')}
     ${field('name="pin" autocomplete="off"')}${field('name="count" autocomplete="off"')}`
  )
  const types = (await findingsOn(page, html)).filter((finding) => finding.check === 'input-type')
  expect(types.map((finding) => finding.detail)).toEqual([
    'input[name="postcode"] holds a code but is type="number"; use type="text" with inputmode="numeric"',
    'input[name="otp"] holds a code but is type="number"; use type="text" with inputmode="numeric"',
    'input[name="pin"] holds a code but is type="number"; use type="text" with inputmode="numeric"'
  ])
})

test('an inputmode that contradicts the type fails input-type', async ({ page }) => {
  const field = (attrs: string) => `<label>F <input ${attrs} autocomplete="off" spellcheck="false"></label>`
  const html = planted(
    `<h1>T</h1>${field('type="url" name="hook" inputmode="numeric"')}${field('type="number" name="km" inputmode="text"')}
     ${field('type="email" name="email" inputmode="email"')}${field('type="number" name="lat" inputmode="decimal"')}
     ${field('name="station" inputmode="text"')}`
  )
  const types = (await findingsOn(page, html)).filter((finding) => finding.check === 'input-type')
  expect(types.map((finding) => finding.detail)).toEqual([
    'input[name="hook"] is type="url" but inputmode="numeric"; use inputmode="url" or none',
    'input[name="km"] is type="number" but inputmode="text"; use inputmode="numeric", "decimal" or none'
  ])
})

test('a field that cancels paste fails paste', async ({ page }) => {
  const html = planted(
    '<h1>T</h1><label>Key <input name="key" autocomplete="off" spellcheck="false" onpaste="return false"></label>'
  )
  expect(checksOf(await findingsOn(page, html))).toContain('paste')
})

test('a target under 24×24 px fails target-size, even with space around it (DESIGN: nothing under 24×24)', async ({
  page
}) => {
  const small = '<button type="button" style="width:10px;height:10px;padding:0;border:0">x</button>'
  expect(checksOf(await findingsOn(page, planted(`<h1>T</h1>${small}`)))).toContain('target-size')
  const inline = '<p>Read the <a href="/terms">terms</a> first.</p>'
  expect(checksOf(await findingsOn(page, planted(`<h1>T</h1>${inline}`)))).not.toContain('target-size')
})

test('crowded small targets also fail axe target-size', async ({ page }) => {
  const small = '<button type="button" style="width:10px;height:10px;padding:0;border:0">x</button>'
  const findings = await findingsOn(page, planted(`<h1>T</h1>${small}${small.replace('>x<', '>y<')}`))
  expect(findings).toContainEqual(
    expect.objectContaining({ check: 'axe', detail: expect.stringMatching(/^target-size/) })
  )
})

test('a numeric table cell without tabular figures fails tabular-nums', async ({ page }) => {
  const html = planted(
    '<h1>T</h1><table><tbody><tr><td>15:30</td><td>12.5%</td><td>Bukit Jalil</td></tr></tbody></table>'
  )
  const tabular = (await findingsOn(page, html)).filter((finding) => finding.check === 'tabular-nums')
  expect(tabular).toHaveLength(2)
})

test('a page wider than a 320 px viewport fails reflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  const html = planted('<h1>T</h1><div style="width: 600px">Wide</div>')
  expect(checksOf(await findingsOn(page, html, { reflow: true }))).toContain('reflow')
})

test('a list rendering more than 50 rows fails virtualised', async ({ page }) => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `<li>Row ${i + 1}</li>`).join('')
  expect(checksOf(await findingsOn(page, planted(`<h1>T</h1><ul>${rows(200)}</ul>`)))).toContain('virtualised')
  expect(checksOf(await findingsOn(page, planted(`<h1>T</h1><ul>${rows(30)}</ul>`)))).not.toContain('virtualised')
})

test('an animation still running under reduced motion fails reduced-motion', async ({ page }) => {
  const spin = '@keyframes spin { to { transform: rotate(1turn) } } .spin { animation: spin 1s infinite }'
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setContent(planted('<h1>T</h1><div class="spin">S</div>', `<style>${spin}</style>`))
  expect(checksOf(await motionFindings(page))).toContain('reduced-motion')
  const honoured = `${spin} @media (prefers-reduced-motion: reduce) { .spin { animation: none } }`
  await page.setContent(planted('<h1>T</h1><div class="spin">S</div>', `<style>${honoured}</style>`))
  expect(await motionFindings(page)).toEqual([])
})
