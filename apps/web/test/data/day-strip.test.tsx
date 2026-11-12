import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { DayStrip, EmptyDay } from '../../features/data-components/day-strip'
import { ClockTicks } from '../../features/data-components/clock-ticks'

// A day from MYT midnight, and an afternoon.
const day = { from: '2026-11-01T16:00:00Z', to: '2026-11-02T16:00:00Z', now: '2026-11-02T07:00:00Z' }
const afternoon = { from: '2026-11-02T06:00:00Z', to: '2026-11-02T12:00:00Z', now: '2026-11-02T08:30:00Z' }
const windows = [
  {
    id: 'w1',
    from: '2026-11-02T07:30:00Z',
    to: '2026-11-02T09:30:00Z',
    state: 'normal' as const,
    title: 'release wave'
  }
]

describe('server-safe strips', () => {
  test('day-strip.tsx and clock-ticks.tsx carry no client boundary and no hooks', () => {
    for (const file of ['day-strip.tsx', 'clock-ticks.tsx']) {
      const source = readFileSync(new URL(`../../features/data-components/${file}`, import.meta.url), 'utf8')
      expect(source, file).not.toMatch(/['"]use client['"]/)
      expect(source, file).not.toMatch(/\buse(?:Memo|State|Effect|Ref|Callback)\b/)
    }
  })

  test('DayStrip renders to static markup with its windows, list and links', () => {
    const html = renderToStaticMarkup(<DayStrip {...day} windows={windows} hrefs={{ w1: '/windows/w1' }} />)
    expect(html).toContain('data-window="w1"')
    expect(html).toContain('href="/windows/w1"')
    expect(html).toContain('data-window-row="w1"')
  })

  test('EmptyDay says the day is empty, or says what the caller says', () => {
    expect(renderToStaticMarkup(<EmptyDay {...day} />)).toContain('No windows on 2 November 2026.')
    const html = renderToStaticMarkup(<EmptyDay {...day} caption="No windows declared yet." />)
    expect(html).toContain('No windows declared yet.')
    expect(html).not.toContain('No windows on')
  })
})

describe('ClockTicks', () => {
  test('a day ticks on MYT hours three apart, so midnight reads 00:00', () => {
    const html = renderToStaticMarkup(<ClockTicks from={day.from} to={day.to} locale="en" />)
    expect(html).toContain('>00:00<')
    expect(html).toContain('>03:00<')
  })

  test('a six-hour afternoon shows three labels in a narrow strip, four from 24rem and all seven from 40rem', () => {
    const html = renderToStaticMarkup(<ClockTicks from={afternoon.from} to={afternoon.to} locale="en" />)
    const ticks = [...html.matchAll(/<time[^>]*class="([^"]*)"[^>]*>([^<]*)<\/time>/g)].map((match) => ({
      hidden: match[1]!,
      label: match[2]!
    }))
    expect(ticks.map((tick) => tick.label)).toEqual(['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'])
    expect(ticks.filter((tick) => !tick.hidden.includes('hidden')).map((tick) => tick.label)).toEqual([
      '14:00',
      '18:00',
      '20:00'
    ])
    expect(ticks.filter((tick) => !tick.hidden.includes('@[40rem]')).map((tick) => tick.label)).toEqual([
      '14:00',
      '16:00',
      '18:00',
      '20:00'
    ])
  })
})
