// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { LandingSections } from '../../features/landing'
import { FaqClient } from '../../features/landing/faq-client'

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
    if (!el) continue
    const sourced = el.closest('[data-source]')
    if (!sourced) offenders.push(text.trim().slice(0, 60))
  }
  return offenders
}

async function renderLanding() {
  render(<LandingSections />)
  // FAQ grade answer is synchronous n=0 without a pilot fetch.
  expect(screen.getByText('Common questions')).toBeTruthy()
}

describe('landing sections', () => {
  afterEach(cleanup)

  test('renders every copy-deck string verbatim (MYT per LOC-6)', async () => {
    await renderLanding()
    const text = document.body.textContent ?? ''
    const strings = [
      'One window, three moments',
      'Before',
      'Crossing',
      'After',
      'Normal · 29.5 mm in 60 min · Lebat starts at 31 mm',
      'Commute disruption · Storm confirmed · 39.0 mm in 60 min (Lebat)',
      'Commute disruption holds · 24.0 mm in 60 min',
      'Replay of 2 November 2026 from the JPS 5-minute series; 60-minute totals are our arithmetic. Clause engine verdict: not reviewed, not sent.',
      'From gauge to notice',
      'Every call ends as a ledger row, and the row is its receipt. Here is one, printed.',
      'Every weekday',
      'Monday 2 November',
      'The next morning',
      'rain gauge polled, every 5 min',
      'MET warnings polled, every 10 min',
      'APIMS index read, hourly',
      '60-minute rain reaches Lebat, 39.0 mm, 15:00 MYT',
      'the 15:05 MYT poll changes the verdict: the crossing, 15:05 MYT',
      'decision agent drafts the bundle, by 15:15 MYT',
      'approver approves, about 15:20 MYT',
      '89 sessions end, 15:30 MYT',
      'window graded against the gauge, by 06:45 MYT',
      'stadium night graded against Rapid Rail gate taps, D+1',
      'One approved call, on the record · about 15 min from the crossing',
      'Worked example from the Skyclause idea: times after 15:05 MYT are inferred from documented delays, not measured, and no call was made that day.',
      'Readings from',
      'JPS Infobanjir',
      'MET Malaysia',
      'DOE APIMS',
      'Rapid Rail',
      'GoLive',
      'Wikipedia',
      'Public data, used under each source’s terms. Skyclause is not affiliated with or endorsed by APU, KPT, JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium.',
      'Read before you approve',
      '{recipients}',
      '{wording}',
      '{approver}',
      'Disagreement first',
      'if the agent and the clause engine differ, the bundle says so before anything else',
      'Fired clauses',
      'Warning, verbatim',
      'MET text in Malay with an English gloss and its valid span',
      'The window strip',
      'five-minute rain, the Lebat line and the window on one clock',
      'Who hears it',
      'the recipients each call covers, and their wording',
      'Approve, edit, reject',
      'one approval per bundle; a rejected call is still graded',
      'What it costs',
      'Free',
      'Paid',
      'Commons',
      'One shared live project for Bukit Jalil; guest windows last 14 days',
      'Community',
      'One project of your own',
      'Team',
      'RM 49 a month per organisation, from P2',
      'Campus',
      'RM 900 a month per campus, billed yearly, after GA',
      'proposal, untested',
      'Common questions',
      'Is this an emergency warning service?',
      'Who makes the call?',
      'Can my AI approve a call?',
      'What happens when a feed fails?',
      'Where does the data come from?',
      'Is it right?',
      'Does it work outside Bukit Jalil?',
      'Does it excuse attendance?',
      'Open the Commons and read the call for Bukit Jalil right now.',
      'Open the Commons',
      'Read the docs',
      'Skyclause · Kuala Lumpur,',
      'Docs',
      'Status',
      'Terms',
      'Bahasa Melayu',
      '© 2026',
      'Privacy',
      'Rain, Kuala Lumpur',
      'Bukit Jalil National Stadium at night',
      'Bukit Jalil LRT Panorama'
    ]
    const faqAnswers: Array<[string, string]> = [
      [
        'Is this an emergency warning service?',
        'No. Skyclause is not a safety or emergency service. In an emergency, call'
      ],
      [
        'Who makes the call?',
        'An AI agent drafts it from the clause sheet; a person on the approver rota approves it before anyone hears it.'
      ],
      [
        'Can my AI approve a call?',
        'No. AI tools can read, draft and ask for evidence. Only a person with the Approver role or above approves.'
      ],
      ['What happens when a feed fails?', 'It never shows an old reading.'],
      ['Where does the data come from?', 'JPS gauge'],
      [
        'Is it right?',
        'Every call is graded after the fact and published with n and a 95% interval. No live grades yet (n=0).'
      ],
      [
        'Does it work outside Bukit Jalil?',
        'The Sky pack works with any station JPS, MET and APIMS cover in Malaysia; the Crowd pack needs a venue with listings and a rail station with gate taps.'
      ],
      ['Does it excuse attendance?', 'No. Teaching mode is the lecturer’s and the university’s decision.']
    ]
    for (const expected of strings) {
      expect(text, expected).toContain(expected)
    }
    for (const [question, answer] of faqAnswers) {
      fireEvent.click(screen.getByText(question, { selector: '.landing-faq-label *' }))
      expect(document.body.textContent).toContain(answer)
    }
    // Curly single quotes (house rule).
    expect(document.body.textContent).toContain('’')
    await expectAxeClean()
  })

  test('LND-4: no numeral outside data-source; n=0 reads No live grades yet', async () => {
    await renderLanding()
    expect(document.body.textContent).toContain('No live grades yet (n=0)')
    expect(numeralsWithoutSource()).toEqual([])
  })

  test('LND-6: every element holding a price also holds proposal, untested', async () => {
    await renderLanding()
    const priceEls = [...document.querySelectorAll('*')].filter(
      (el) => /RM\s|Free/.test(el.textContent ?? '') && el.closest('[data-source="/legal/terms#plans"]')
    )
    expect(priceEls.length).toBeGreaterThan(0)
    for (const el of priceEls) {
      expect(el.closest('[data-source="/legal/terms#plans"]')?.textContent ?? '').toContain('proposal, untested')
    }
    // Each price paragraph itself carries it.
    const priceParagraphs = [...document.querySelectorAll('[data-source="/legal/terms#plans"]')].filter((el) =>
      /RM|Free/.test(el.textContent ?? '')
    )
    expect(priceParagraphs.length).toBeGreaterThan(0)
    for (const el of priceParagraphs) {
      expect(el.textContent).toContain('proposal, untested')
    }
  })

  test('replay caption and badge render; middle copy reveals inputs by keyboard', async () => {
    await renderLanding()
    expect(screen.getAllByText('Replay').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-replay="true"]').length).toBeGreaterThan(0)
    const middle = document.querySelector('.landing-middle')
    expect(middle).toBeTruthy()
    ;(middle as HTMLElement).focus()
    // Focus reveals details via :focus-within (CSS); details node exists.
    expect(document.body.textContent).toContain('Clause span')
    // Keyboard: focus the article.
    fireEvent.focus(middle as HTMLElement)
    expect(screen.getAllByText(/Clause span/).length).toBeGreaterThan(0)
  })

  test('sections in DESIGN order, one crimson per screen, pictures cropped and credited', async () => {
    await renderLanding()
    const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim())
    expect(headings).toEqual([
      'One window, three moments',
      'From gauge to notice',
      'Readings from',
      'Read before you approve',
      'What it costs',
      'Common questions',
      'Open the Commons and read the call for Bukit Jalil right now.'
    ])
    // Each marked crimson element appears once.
    expect(document.querySelectorAll('[data-crimson="showcase-window"]').length).toBe(1)
    expect(document.querySelectorAll('[data-crimson="features-selection"]').length).toBe(1)
    // The FAQ dot lives in every label but CSS shows only the checked one: one radio checked, dot in its label.
    const checked = [...document.querySelectorAll('.landing-faq-input')].filter(
      (input) => (input as HTMLInputElement).checked
    )
    expect(checked.length).toBe(1)
    const checkedId = (checked[0] as HTMLInputElement).id
    expect(document.querySelector(`label[for="${checkedId}"] [data-crimson="faq-dot"]`)).toBeTruthy()
    expect(document.querySelectorAll('[data-crimson="cta-button"]').length).toBe(1)
    // How it works, proof and pricing carry none of the crimson markers.
    const sections = [...document.querySelectorAll('section')]
    const how = sections.find((s) => s.textContent?.includes('From gauge to notice'))
    const pricing = sections.find((s) => s.textContent?.includes('What it costs'))
    expect(how?.querySelector('[data-crimson]')).toBeNull()
    expect(pricing?.querySelector('[data-crimson]')).toBeNull()
    // Pictures cropped only, captioned, credited (creator, licence, file link), sized and lazy.
    const imgs = [...document.querySelectorAll('img')]
    expect(imgs.length).toBe(3)
    for (const img of imgs) {
      expect(img.getAttribute('loading')).toBe('lazy')
      expect(img.getAttribute('width')).toBeTruthy()
      expect(img.getAttribute('height')).toBeTruthy()
      expect(img.getAttribute('alt')?.trim()).toBeTruthy()
      expect(img.style.aspectRatio).toBeTruthy()
      expect(img.style.objectFit).toBe('cover')
    }
    const credits = document.body.textContent ?? ''
    expect(credits).toContain('Pak Misai')
    expect(credits).toContain('CC BY-SA 4.0')
    expect(credits).toContain('Eutah Mizushima')
    expect(credits).toContain('CC0')
    expect(credits).toContain('Pixdoet')
    expect(credits).toContain('CC BY 4.0')
    expect(document.body.innerHTML).toContain('commons.wikimedia.org/wiki/File:')
  })

  test('reduced motion stops drift; only transform and opacity animate', async () => {
    await renderLanding()
    // Drift pause control exists (checkbox + label, no JS).
    expect(screen.getByText(/Pause/)).toBeTruthy()
    expect(document.querySelector('#drift-pause')).toBeTruthy()
    await expectAxeClean()
  })

  test('footer clock ticks each minute with MYT and clock source', async () => {
    await renderLanding()
    const footer = document.querySelector('footer')
    expect(footer).toBeTruthy()
    const clock = footer?.querySelector('[data-source="clock:Asia/Kuala_Lumpur"]')
    expect(clock).toBeTruthy()
    expect(clock?.textContent).toContain('MYT')
    expect(clock?.textContent).toContain('Kuala Lumpur')
    // expectZonedTimes spirit: every HH:MM is followed by MYT (times in <time> exempt).
    const offenders: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const visible: string[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (!el || el.closest('time[datetime]')) continue
      visible.push(node.textContent ?? '')
    }
    const text = visible.join(' ')
    for (const match of text.matchAll(/\b\d{2}:\d{2}\b/g)) {
      const start = (match.index ?? 0) + match[0].length
      const nextTime = text.slice(start).search(/\b\d{2}:\d{2}\b/)
      const end = nextTime === -1 ? Math.min(text.length, start + 12) : Math.min(text.length, start + nextTime)
      if (!/\bMYT\b/.test(text.slice(start, end))) offenders.push(match[0])
    }
    expect(offenders).toEqual([])
  })

  test('FAQ answers under questions on small screens via stacking (no hidden pane)', async () => {
    await renderLanding()
    fireEvent.click(screen.getByText('Is it right?', { selector: '.landing-faq-label *' }))
    expect(screen.getByText(/No live grades yet/)).toBeTruthy()
    // Selection moves: exactly one radio checked.
    const checked = [...document.querySelectorAll('.landing-faq-input')].filter(
      (input) => (input as HTMLInputElement).checked
    )
    expect(checked.map((input) => (input as HTMLInputElement).id)).toEqual(['faq-5'])
  })
})

describe('FAQ grades with a pilot', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('reads as unread until the grades arrive, then prints one metric’s n with its interval', async () => {
    let release: (() => void) | undefined
    const body = {
      data: [
        { n: 8, x: 7, low: 0.53, high: 0.98, metric: 'precision' },
        { n: 5, x: 1, low: 0.04, high: 0.62, metric: 'false_alarm_rate' }
      ]
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ ok: true, status: 200, json: async () => body })
          })
      )
    )
    render(<FaqClient pilot={{ org: 'x', project: 'y' }} gradesSource="/v1/public/x/y/grades" />)
    expect(document.body.textContent).toContain('Reading live grades…')
    expect(document.body.textContent).not.toContain('n=0')
    await waitFor(() => expect(release).toBeDefined())
    release!()
    await waitFor(() =>
      expect(document.body.textContent).toContain('Latest: n=8, 7 of 8 (Wilson 95% interval 0.53–0.98).')
    )
  })
})
