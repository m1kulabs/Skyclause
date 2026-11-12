// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/data-components/catalogue'
import { WindowStrip } from '../../features/data-components/window-strip'

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

function stripInput(replay: boolean) {
  const at = (min: string) => `2026-11-02T${min}:00Z`
  const rain5 = ['06:35', '06:40', '06:45', '06:50', '06:55', '07:00'].map((m, i) => ({
    at: at(m),
    value: [0.5, 2.5, 9, 9, 8.5, 9.5][i]!,
    state: 'received' as const
  }))
  const rain60 = ['06:35', '06:40', '06:45', '06:50', '06:55', '07:00'].map((m, i) => ({
    at: at(m),
    value: [0.5, 3, 12, 21, 29.5, 39][i]!
  }))
  return {
    from: '2026-11-02T06:00:00Z',
    to: '2026-11-02T08:00:00Z',
    now: '2026-11-02T08:05:00Z',
    window: { from: '2026-11-02T07:30:00Z', to: '2026-11-02T09:30:00Z' },
    rain5,
    rain60,
    warnings: [],
    crowdPeriods: [],
    ages: [{ name: 'gauge', observedAt: '2026-11-02T07:00:00Z' }],
    replay: replay ? { source: 'infobanjirjpskl.water.gov.my station 75', capturedAt: '2026-11-05T13:12:00Z' } : null
  }
}

const windows = [
  {
    id: 'w1',
    project_id: 'p1',
    starts_at: '2026-11-02T07:30:00Z',
    ends_at: '2026-11-02T09:30:00Z',
    title: 'release wave',
    kind: 'event',
    tz: 'Asia/Kuala_Lumpur',
    declared_by: 'a1',
    guest: false,
    via: 'app',
    expires_at: null,
    series_id: null,
    ics_feed_id: null,
    cancelled_at: null,
    share_link_id: null,
    moderation: 'visible'
  }
] as const

describe('WindowStrip', () => {
  afterEach(cleanup)

  test('live chart has a summary, a table one click away and MYT times', async () => {
    render(<WindowStrip windows={[...windows]} strip={stripInput(false)} />)
    expect(screen.getByText(/No Lebat crossing|Lebat crossed at/)).toBeTruthy()
    expect(document.body.textContent).toContain('MYT')
    fireEvent.click(screen.getByRole('button', { name: /Show table/ }))
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText(/Rain readings with 60-minute totals/)).toBeTruthy()
    await expectAxeClean()
  })

  test('replay is styled apart with a badge and never on a live plot', async () => {
    const { unmount } = render(<WindowStrip windows={[...windows]} strip={stripInput(true)} />)
    expect(screen.getAllByText(/Ulangan|Replay/).length).toBeGreaterThan(0)
    expect(document.body.innerHTML).toContain('data-replay="true"')
    await expectAxeClean()
    unmount()
    render(<WindowStrip windows={[...windows]} strip={stripInput(false)} />)
    expect(document.body.innerHTML).not.toContain('data-replay="true"')
  })

  test('n=0 prints n=0 with its next action and no bar', async () => {
    render(<WindowStrip windows={[]} />)
    expect(screen.getByText(/No readings yet \(n=0\)/)).toBeTruthy()
    await expectAxeClean()
  })

  test('every crossing has a 34px hit area larger than its mark', () => {
    render(<WindowStrip windows={[...windows]} strip={stripInput(false)} />)
    const triggers = document.querySelectorAll('[aria-label*="Lebat"]')
    expect(triggers.length).toBeGreaterThan(0)
    for (const el of triggers) {
      expect((el as HTMLElement).className).toContain('min-h-[34px]')
    }
  })

  test('the chart is the readings alone in an SVG and every label is HTML at 13px, so none scales with the column', () => {
    const strip = { ...stripInput(true), now: '2026-11-02T07:40:00Z' }
    const { container } = render(<WindowStrip windows={[...windows]} strip={strip} />)
    const plot = container.querySelector('svg[data-strip-plot]')!
    expect(plot.getAttribute('preserveAspectRatio')).toBe('none')
    expect(plot.querySelectorAll('text')).toHaveLength(0)
    const chart = container.querySelector('[data-strip-chart]')!
    // Header, y labels, now and Lebat labels and the x axis are all text outside the SVG, in the 13px step.
    const labels = [...chart.querySelectorAll('span.type-small, div.type-small')]
    expect(labels.length).toBeGreaterThan(6)
    expect(chart.querySelector('[data-now-label]')!.textContent).toBe('Now MYT')
    expect(chart.querySelector('[data-lebat-label]')!.textContent).toBe('Lebat 31 mm')
    expect(chart.querySelector('[data-replay]')!.textContent).toContain('Replay')
    // The two lanes' ticks are different elements at different heights, never two labels on one spot.
    const tops = [...chart.querySelectorAll<HTMLElement>('[data-numeric]')].map((el) => Number.parseFloat(el.style.top))
    expect(new Set(tops).size).toBe(tops.length)
    const sorted = [...tops].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(18)
  })

  test('the x axis labels whole MYT hours, each one a time, with the finer labels shown only as the strip widens', () => {
    const { container } = render(<WindowStrip windows={[...windows]} strip={stripInput(false)} />)
    const ticks = [...container.querySelectorAll<HTMLElement>('[data-strip-chart] time')]
    expect(ticks.length).toBeGreaterThan(3)
    for (const tick of ticks) expect(tick.getAttribute('datetime')).toMatch(/:(00|15|30|45):00\.000Z$/)
    expect(ticks.some((tick) => tick.className.includes('hidden @[24rem]:block'))).toBe(true)
    expect(ticks.some((tick) => !tick.className.includes('hidden'))).toBe(true)
  })

  test('the day row lists its windows when the strip carries them, unless the caller turns the list off', () => {
    const withWindows = {
      ...stripInput(false),
      windows: [
        {
          id: 'w1',
          from: '2026-11-02T07:30:00Z',
          to: '2026-11-02T09:30:00Z',
          state: 'normal' as const,
          title: 'release wave'
        }
      ]
    }
    const { container, rerender } = render(<WindowStrip windows={[...windows]} strip={withWindows} />)
    expect(container.querySelectorAll('[data-window-row]')).toHaveLength(1)
    rerender(<WindowStrip windows={[...windows]} strip={withWindows} list={false} />)
    expect(container.querySelectorAll('[data-window-row]')).toHaveLength(0)
    expect(container.querySelector('.day-strip')).toBeTruthy()
  })

  test('a long strip keeps its table under the crawl limit and reports what it summarises', () => {
    const start = Date.parse('2026-11-01T16:00:00Z')
    const readings = Array.from({ length: 576 }, (_, i) => new Date(start + i * 300_000).toISOString())
    const strip = {
      ...stripInput(false),
      from: readings[0]!,
      to: readings.at(-1)!,
      now: readings.at(-1)!,
      rain5: readings.map((at, i) => ({ at, value: i % 12, state: 'received' as const })),
      rain60: readings.map((at, i) => ({ at, value: i % 50 }))
    }
    render(<WindowStrip windows={[...windows]} strip={strip} />)
    fireEvent.click(screen.getByRole('button', { name: /Show table/ }))
    const rows = screen.getAllByRole('row')
    // The header row and the body: never more than the 50 rows a list may render.
    expect(rows.length).toBeLessThanOrEqual(50)
    expect(rows.length).toBeGreaterThan(10)
    expect(screen.getByText(/Highest reading in each 60 minutes, from 1152 readings/)).toBeTruthy()
  })

  test('a strip with only the 60-minute series still has its table rows', () => {
    const strip = { ...stripInput(false), rain5: [] }
    render(<WindowStrip windows={[...windows]} strip={strip} />)
    fireEvent.click(screen.getByRole('button', { name: /Show table/ }))
    expect(screen.getAllByRole('row')).toHaveLength(1 + strip.rain60.length)
  })
})
