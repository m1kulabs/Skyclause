// @vitest-environment jsdom
/// <reference lib="dom" />
import axe from 'axe-core'
import { describe, expect, test } from 'vitest'
import { renderNotice } from '../src/notices'
import { CONTEXT, LINKS, PERMALINK, callView } from './call-view'

// #152: the email's HTML part (NFR-4: axe-core finds nothing; NFR-13: one table, inline styles, no scripts or CSS
// blocks, which Outlook and Gmail both keep). Contrast is fixed by the inline colours; jsdom can't compute it.

function load(html: string) {
  document.open()
  document.write(html)
  document.close()
}

const lines = (text: string) => text.split('\n').filter(Boolean)

describe('the HTML part', () => {
  test.each(['en', 'ms'] as const)('%s: every text line, in a document marked with its language', (language) => {
    const r = renderNotice(callView(), { language, channel: 'email', links: LINKS, ...CONTEXT })
    load(r.html!)
    expect(document.documentElement.lang).toBe(language)
    expect(document.title).toBe(r.subject)
    for (const line of lines(r.text)) expect(document.body.textContent).toContain(line)
    expect([...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      PERMALINK,
      LINKS.preferences,
      LINKS.unsubscribe
    ])
    expect(document.querySelectorAll('script, style, link').length).toBe(0)
  })

  test('the wording is escaped, never markup', () => {
    const r = renderNotice(callView(), {
      language: 'en',
      channel: 'email',
      links: LINKS,
      ...CONTEXT,
      wording: 'Leave <b>now</b> & take the LRT <script>alert(1)</script>'
    })
    load(r.html!)
    expect(document.querySelectorAll('b, script').length).toBe(0)
    expect(document.body.textContent).toContain('Leave <b>now</b> & take the LRT <script>alert(1)</script>')
  })

  test('axe-core finds no WCAG 2.2 A or AA violation', async () => {
    const r = renderNotice(callView({ mode: 'hybrid_recommended' }), {
      language: 'en',
      channel: 'email',
      links: { ...LINKS, reply: 'https://skyclause.m1ku.tech/subscribe/reply-token/reply' },
      ...CONTEXT
    })
    load(r.html!)
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } }
    } as Parameters<typeof axe.run>[1])
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
