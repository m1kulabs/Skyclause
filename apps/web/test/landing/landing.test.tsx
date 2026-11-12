// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import axe from 'axe-core'
import { t } from '@skyclause/i18n/brand'
import { LandingFooter, LandingSections } from '../../features/landing'
import type { GradesState } from '../../features/landing/grades'
import { PHOTO_KEYS, photo } from '../../features/landing/photos'
import type { HeroRead } from '../../features/landing-hero/landing-hero'

const read: HeroRead = {
  now: new Date('2026-11-12T06:00:00.000Z'),
  win: { date: '2026-11-12', startMin: 900, endMin: 960 },
  // Production today: the public verdict answers 501, not built.
  result: { kind: 'error', status: 501, at: '2026-11-12T06:00:00.000Z' },
  latestCall: null,
  status: { kind: 'not_built' }
}
const GRADES = '/v1/public/commons/bukit-jalil/grades'

async function expectAxeClean() {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

function numeralsWithoutSource(): string[] {
  const offenders: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = node.textContent ?? ''
    if (!/[0-9]/.test(text)) continue
    const el = node.parentElement
    if (!el || el.closest('script, style, noscript, template')) continue
    if (!el.closest('[data-source]')) offenders.push(text.trim().slice(0, 60))
  }
  return offenders
}

/** LOC-6: every visible HH:MM sits in a <time> or is followed by MYT before the next time. */
function unzonedTimes(): string[] {
  const visible: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement
    if (!el || el.closest('time[datetime], script, style')) continue
    visible.push(node.textContent ?? '')
  }
  const text = visible.join(' ')
  const offenders: string[] = []
  for (const match of text.matchAll(/\b\d{2}:\d{2}\b/g)) {
    const start = (match.index ?? 0) + match[0].length
    const next = text.slice(start).search(/\b\d{2}:\d{2}\b/)
    const end = next === -1 ? Math.min(text.length, start + 12) : start + next
    if (!/\bMYT\b/.test(text.slice(start, end))) offenders.push(match[0])
  }
  return offenders
}

function renderPage(grades: GradesState = { kind: 'empty', n: 0 }) {
  return render(
    <>
      <main>
        <LandingSections read={read} grades={grades} gradesSource={GRADES} />
      </main>
      <LandingFooter />
    </>
  )
}

describe('landing sections', () => {
  afterEach(cleanup)

  test('the sections follow the argument, each opening with its heading', () => {
    renderPage()
    const ids = [...document.querySelectorAll('section')].map((section) => section.getAttribute('aria-labelledby'))
    expect(ids).toEqual([
      'how-heading',
      'record-heading',
      'features-heading',
      'proof-heading',
      'pricing-heading',
      'faq-heading',
      'cta-heading'
    ])
    for (const id of ids) expect(document.getElementById(id!)?.tagName).toBe('H2')
    const named = (id: string) => document.getElementById(id)!.textContent!.replace(/\s+/g, ' ').trim()
    expect(named('record-heading')).toBe('What the record keeps')
    expect(named('features-heading')).toBe('What it does')
    expect(named('proof-heading')).toBe('Read from public sources')
    expect(named('pricing-heading')).toBe('Prices, in MYR')
    expect(named('faq-heading')).toBe('Common questions')
    expect(named('cta-heading')).toBe('What’s the call for today?')
    // The how-it-works heading is the current stage's clause; split headings keep their spaces as text.
    expect(document.querySelector('#how-heading [data-stage="0"]')?.textContent?.replace(/\u00a0/g, ' ')).toBe(
      'First, the gauge reads 39 mm'
    )
  })

  test('LND-4: every numeral carries a data-source, and every time its zone', async () => {
    renderPage()
    expect(numeralsWithoutSource()).toEqual([])
    expect(unzonedTimes()).toEqual([])
    await expectAxeClean()
  })

  test('LND-6: every price in MYR holds "proposal, untested" itself', () => {
    renderPage()
    const priced = [...document.querySelectorAll('[data-source="/legal/terms#plans"]')].filter((el) =>
      /RM\s?\d|Free/.test(el.textContent ?? '')
    )
    expect(priced.length).toBeGreaterThanOrEqual(3)
    for (const el of priced) expect(el.textContent).toContain('proposal, untested')
    const text = document.body.textContent ?? ''
    for (const price of [
      'Free',
      'RM 49 a month per organisation, from May 2027',
      'RM 900 a month per campus, billed yearly, after May 2027'
    ]) {
      expect(text.replace(/\u00a0/g, ' ')).toContain(price)
    }
    // The roadmap's own names (P1, P2, GA) mean nothing to a visitor: the plans say it in words and dates.
    expect(document.querySelector('#prices')?.textContent).not.toMatch(/\bP[0-3]\b|\bGA\b/)
  })

  test('replays are labelled, never live: every replay fragment says Replay and links its capture', () => {
    renderPage()
    const fragments = [...document.querySelectorAll('[data-ui]')]
    expect(fragments.length).toBeGreaterThanOrEqual(8)
    for (const fragment of fragments) {
      const tag = fragment.querySelector('.frag-badge')
      expect(tag?.textContent, fragment.getAttribute('data-ui') ?? '').toMatch(/^(Replay|Live)$/)
      expect(tag?.closest('[data-source]')).toBeTruthy()
    }
    // The shadow verdict carries the label LND-3 requires.
    expect(document.body.textContent).toContain('Clause engine verdict: not reviewed, not sent')
    // The notice uses the real notice templates and their replay label.
    expect(document.body.textContent).toContain(
      'n=0: this project has no sent call yet, so only the replay’s measured values are filled in.'.replace('’', "'")
    )
  })

  test('live reads render as read: n=0 before any grade, the error when a read fails, n with its interval', () => {
    renderPage()
    expect(document.body.textContent).toContain('No live grades yet (n=0)')
    expect(document.body.textContent).toContain('No approved call yet (n=0)')
    cleanup()
    renderPage({ kind: 'error', message: 'Grades request failed (503)' })
    expect(document.body.textContent).toContain(
      'Couldn’t load live grades: Grades request failed (503). Reload the page to try again.'
    )
    expect(document.body.textContent).not.toContain('No live grades yet')
    cleanup()
    renderPage({ kind: 'grades', n: 8, x: 7, low: 0.53, high: 0.98, metric: 'precision' })
    expect(document.body.textContent).toContain('Latest: n=8, 7 of 8 (Wilson 95% interval 0.53–0.98)')
  })

  test('both brand lines, and the questions as filled tiles sharing one name', () => {
    renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toContain(t('brand.not_safety_service', {}, 'en'))
    expect(text).toContain(t('brand.non_affiliation', {}, 'en'))
    expect(text).toContain(
      'Skyclause is not affiliated with or endorsed by APU, KPT, JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium.'
    )
    // The safety line appears once, so the crawl's exact-text check finds one element.
    const safety = [...document.querySelectorAll('p')].filter((p) =>
      p.textContent?.includes('Skyclause is not a safety or emergency service. In an emergency, call 999.')
    )
    expect(safety).toHaveLength(1)
    const tiles = [...document.querySelectorAll('details')]
    expect(tiles.length).toBeGreaterThanOrEqual(6)
    expect(new Set(tiles.map((tile) => tile.getAttribute('name')))).toEqual(new Set(['faq']))
    expect(tiles.filter((tile) => tile.open)).toHaveLength(1)
  })

  test('the closing sentence asks for a time, not personal data, and submits the window form', () => {
    renderPage()
    const form = document.querySelector<HTMLFormElement>('.cta form, form.cta-form')!
    expect(form.getAttribute('method')).toBe('get')
    expect(form.getAttribute('action')).toBe('/#window')
    const fields = [...form.querySelectorAll('input')]
    expect(fields.map((field) => [field.name, field.type])).toEqual([
      ['date', 'hidden'],
      ['start', 'text']
    ])
    expect(form.querySelector<HTMLInputElement>('input[name="date"]')!.value).toBe('2026-11-12')
    const start = form.querySelector<HTMLInputElement>('input[name="start"]')!
    expect(start.labels?.[0]?.textContent).toBe('What’s the call for')
    expect(start.getAttribute('autocomplete')).toBe('off')
    // A phone's number pad has no colon: the field opens the text keyboard and takes any common form.
    expect(start.getAttribute('inputmode')).toBe('text')
    const pattern = new RegExp(`^(?:${start.getAttribute('pattern')})$`)
    for (const typed of ['15:30', '1530', '3.30pm']) expect(pattern.test(typed), typed).toBe(true)
    expect(pattern.test('15:20')).toBe(false)
    expect(form.querySelector('input[type="email"], input[autocomplete="email"]')).toBeNull()
    expect(form.querySelector('button[type="submit"]')?.textContent).toBe('today?')
  })

  test('the statement carries fragments of the product at text size, never a mode hue or glyph without its name', () => {
    renderPage()
    const slots = [...document.querySelectorAll('.features-statement .slot')]
    expect(slots.map((slot) => slot.textContent?.replace(/\u00a0/g, ' '))).toEqual([
      'Replay39.0 mm',
      'No call',
      'Approve'
    ])
    // The figure is the replay's, and says so; No call is the mark, glyph and word; Approve is a picture of the button.
    expect(slots[0]!.getAttribute('data-source')).toBeTruthy()
    expect(slots[1]!.getAttribute('data-tone')).toBe('no-call')
    expect(slots[1]!.querySelector('svg')).toBeTruthy()
    expect(slots[2]!.getAttribute('aria-hidden')).toBe('true')
    expect(slots[2]!.closest('button, a, [tabindex]')).toBeNull()
    expect(document.querySelectorAll('.features-statement img')).toHaveLength(0)
    expect(document.querySelectorAll('.features-statement [data-tone]:not([data-tone="no-call"])')).toHaveLength(0)
  })

  test('Lebat is a rain class, not a mode: a neutral capsule with its word, never a mode hue or glyph', () => {
    renderPage()
    const lebat = [...document.querySelectorAll('.frag-class')]
    expect(lebat.length).toBeGreaterThanOrEqual(3)
    for (const mark of lebat) {
      expect(mark.textContent).toMatch(/^Lebat/)
      expect(mark.closest('[data-tone]')).toBeNull()
      expect(mark.querySelector('svg')).toBeNull()
    }
    expect(document.querySelector('.frag-state')?.textContent).toBe('Fired')
    expect(document.querySelector('.frag-state [data-tone], .frag-state svg')).toBeNull()
  })

  test('how it works: five stages, a range and named radios that work without script', () => {
    renderPage()
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="stage"]')]
    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual([
      'Readings',
      'Clause',
      'Verdict and call',
      'Approval and notice',
      'Grade'
    ])
    expect(radios.filter((radio) => radio.checked).map((radio) => radio.value)).toEqual(['0'])
    expect(document.querySelectorAll('.how-fragment[data-stage] [data-ui]')).toHaveLength(5)
    const range = document.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(range.getAttribute('autocomplete')).toBe('off')
    // The range drives the radios once hydrated.
    fireEvent.change(range, { target: { value: '3' } })
    expect(radios[3]!.checked).toBe(true)
    expect(range.getAttribute('aria-valuetext')).toBe('Approval and notice')
  })

  test('the record: four parts, each with its photograph, object and fact; radios choose one', () => {
    renderPage()
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="record"]')]
    expect(radios.map((radio) => radio.value)).toEqual(['ledger', 'notice', 'calendar', 'grade'])
    for (const radio of radios) {
      const item = radio.value
      expect(document.querySelector(`.record-photo[data-item="${item}"]`)).toBeTruthy()
      expect(document.querySelector(`.record-object[data-item="${item}"] [data-ui]`)).toBeTruthy()
      expect(document.querySelector(`.record-fact[data-item="${item}"]`)?.textContent).toBeTruthy()
    }
  })

  test('pictures are sized, described where they carry meaning, and every one is credited in the footer', () => {
    renderPage()
    // The record's four (the hero holds three more); the statement's slots are the product's own capsules now.
    const images = [...document.querySelectorAll('img')]
    expect(images.length).toBeGreaterThanOrEqual(4)
    for (const img of images) {
      expect(img.getAttribute('width')).toBeTruthy()
      expect(img.getAttribute('height')).toBeTruthy()
      expect(img.hasAttribute('alt')).toBe(true)
      expect(img.getAttribute('loading')).toBe('lazy')
    }
    const credits = document.querySelector('.footer-credits')!
    for (const key of PHOTO_KEYS) {
      const entry = photo(key)
      const credit = [...credits.querySelectorAll('li')].find((li) => li.textContent?.includes(entry.title))
      expect(credit?.textContent, key).toContain(entry.creator)
      expect(credit?.textContent, key).toContain(entry.licence)
      expect(credit?.querySelector(`a[href="${entry.page}"]`), key).toBeTruthy()
    }
  })

  test('the footer: the name built of capsules, links that exist, and the live MYT clock', () => {
    renderPage()
    const footer = document.querySelector('footer')!
    expect(footer.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Skyclause')
    const hrefs = [...footer.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const href of hrefs) expect(href).toMatch(/^(#|\/sign-in$|\/sign-up$|\/legal\/|\/ms\/legal\/|https:\/\/)/)
    expect(hrefs).not.toContain('/guest')
    expect(hrefs).not.toContain('/docs')
    expect(footer.querySelector('[data-source="clock:Asia/Kuala_Lumpur"]')?.textContent).toContain('MYT')
  })
})
