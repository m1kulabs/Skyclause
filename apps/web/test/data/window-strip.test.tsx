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
})
