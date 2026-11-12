// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import '../../features/landing-hero/catalogue'
import { HeroFacts } from '../../features/landing-hero/hero-facts'
import { fetchStatusServer, STATUS_PATH } from '../../features/landing-hero/evaluate'
import { input } from './fixtures'

const now = new Date('2026-11-12T08:25:00.000Z')

function reply(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)
}

describe('the hero’s live facts', () => {
  // The clock prints the server's reading, then the browser's on mount: both are "now" here.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('a status read that is not built (501) leaves the time alone, never a made-up age or mode', () => {
    render(<HeroFacts now={now} status={{ kind: 'not_built' }} />)
    const facts = document.body.textContent ?? ''
    expect(facts).toContain('16:25 MYT')
    expect(facts).toContain('in Bukit Jalil')
    expect(facts).not.toMatch(/JPS gauge|Bukit Jalil now|Couldn’t/)
    expect(document.querySelector('time')?.getAttribute('dateTime')).toBe(now.toISOString())
  })

  test('a status read gives the gauge’s age and Bukit Jalil’s mode, each from its source; a failed read says so', () => {
    render(<HeroFacts now={now} status={{ kind: 'ok', mode: 'normal', gaugeAt: '2026-11-12T08:21:00.000Z' }} />)
    expect(document.body.textContent).toContain('JPS gauge: 4 min old')
    expect(document.body.textContent).toContain('Normal')
    for (const fact of document.querySelectorAll('[data-source]')) expect(fact.getAttribute('data-source')).toBeTruthy()
    expect(document.querySelectorAll(`[data-source="${STATUS_PATH}"]`)).toHaveLength(2)
    cleanup()
    render(<HeroFacts now={now} status={{ kind: 'error', status: 503 }} />)
    expect(document.body.textContent).toContain('Couldn’t read Bukit Jalil’s state at 16:25 MYT.')
  })

  test('the status read takes the Sky pack’s mode (No call when its inputs are silent) and the newest rain reading', async () => {
    vi.stubGlobal('fetch', () =>
      reply(200, {
        packs: [
          { pack: 'crowd', basis: null, call_id: null, mode: 'surge_night', watch: false, no_call: null },
          { pack: 'sky', basis: 'engine_verdict', call_id: null, mode: null, watch: false, no_call: { inputs: [] } }
        ],
        strip: [
          input({ observed_at: '2026-11-12T08:10:00.000Z' }),
          input({ observed_at: '2026-11-12T08:20:00.000Z' }),
          input({ name: 'site.api_max', observed_at: '2026-11-12T08:24:00.000Z' })
        ]
      })
    )
    expect(await fetchStatusServer()).toEqual({ kind: 'ok', mode: 'no_call', gaugeAt: '2026-11-12T08:20:00.000Z' })
    vi.stubGlobal('fetch', () => reply(501))
    expect(await fetchStatusServer()).toEqual({ kind: 'not_built' })
    vi.stubGlobal('fetch', () => reply(503))
    expect(await fetchStatusServer()).toEqual({ kind: 'error', status: 503 })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    expect(await fetchStatusServer()).toEqual({ kind: 'error', status: null })
  })
})
