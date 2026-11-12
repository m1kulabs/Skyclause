// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnalysisMetric, Grade, InputValue } from '@skyclause/contracts'
import '../../features/data-components/catalogue'
import { GradeCard } from '../../features/data-components/grade-card'
import { InputAgeChip } from '../../features/data-components/input-age-chip'
import { indicatorName } from '../../features/data-components/indicator-names'
import { metricName, metricText, metricValue } from '../../features/data-components/metrics'
import { SignalHealthHead, SignalHealthRow } from '../../features/data-components/signal-health-row'
import { WindowStrip } from '../../features/data-components/window-strip'
import { ReplayMark } from '../../features/brand/replay-mark'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableMeasure, TableRow } from '../../components/ui/table'

const words = {
  window: 'Window',
  sent: 'Sent after',
  long: 'A very long window name that must not wrap',
  three: '3 min',
  club: 'Club meeting',
  nine: '9 min'
}
const grade = { id: 'g1', outcome: 'agree' } as unknown as Grade
const metric = (over: Partial<AnalysisMetric>): AnalysisMetric => ({
  metric: 'agreement',
  x: 1,
  n: 1,
  low: 0.21,
  high: 1,
  ...over
})
const input = (name: string): InputValue => ({
  name,
  value: 12,
  unit: 'mm',
  source_ids: ['s1'],
  source_url: null,
  reading_ids: [],
  observed_at: new Date(Date.now() - 12 * 60_000).toISOString(),
  state: 'fresh',
  since: null,
  age_s: 720
})

describe('one reading and one name per metric', () => {
  afterEach(cleanup)

  test('a share is x of n and reads as a percentage, named from the catalogue in both locales', () => {
    expect(metricValue(metric({ x: 7, n: 8 }))).toBe(0.875)
    expect(metricValue(metric({ metric: 'crossing_to_approved_p50', x: 4, n: 9, value: 4.5 }))).toBe(4.5)
    expect(metricValue(metric({ n: 0, x: null }))).toBeNull()
    expect(metricName('agreement', 'en')).toBe('Agent–shadow agreement')
    expect(metricName('agreement', 'ms')).not.toBe(metricName('agreement', 'en'))
    expect(metricText(metric({ x: 7, n: 8 }), 'en')).toBe('87.5%')
  })

  test('the grade card never prints the API key or a raw count as its title', () => {
    render(<GradeCard grade={grade} metric={metric({})} />)
    expect(screen.getByText('Agent–shadow agreement')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/agreement 1/)
    expect(document.body.textContent).toContain('100%')
    expect(document.body.textContent).toContain('1 of 1')
    expect(document.body.textContent).toContain('n=1')
    // The interval's label is in percentages, not the raw 0 to 1 floats.
    expect(document.querySelector('[data-wilson-interval]')!.getAttribute('aria-label')).toBe(
      'Wilson 95% interval 21% to 100%'
    )
  })

  test('with n above zero and no interval the card says so instead of printing n=0', () => {
    render(<GradeCard grade={grade} metric={metric({ low: null, high: null, n: 3, x: 2 })} />)
    expect(document.body.textContent).toContain('No interval yet.')
    expect(document.body.textContent).not.toContain('n=0')
  })
})

describe('indicator names', () => {
  afterEach(cleanup)

  test('a registry key reads as words in en and ms, an unknown one as "Other input", a plain name as it came', () => {
    expect(indicatorName('site.rain_60m_mm', 'en')).toBe('Rain in the last 60 minutes (site)')
    expect(indicatorName('site.rain_60m_mm', 'ms')).toBe('Hujan dalam 60 minit lepas (tapak)')
    expect(indicatorName('site.night.band_low', 'en')).toBe('Night exits, forecast band (low)')
    expect(indicatorName('site.not_in_registry', 'en')).toBe('Other input')
    expect(indicatorName('gauge', 'en')).toBe('gauge')
  })

  test('the age chip shows the words, never the key, and opens as a button', () => {
    render(<InputAgeChip input={input('w.met_warning_in_force')} />)
    const trigger = screen.getByRole('button', { name: /MET warning in force during the window 12 min old/ })
    expect(trigger.tagName).toBe('BUTTON')
    expect(document.body.textContent).not.toContain('w.met_warning_in_force')
    // A tag, not a button look-alike: no 2px edge on it.
    expect(trigger.querySelector('[data-slot="badge"]')!.className).not.toContain('border-input')
  })
})

describe('the replay mark', () => {
  afterEach(cleanup)

  test('is a raised tag with its glyph and word, not the dashed No call capsule or an outline button', () => {
    render(<ReplayMark />)
    const mark = document.querySelector('[data-replay-mark]')!
    expect(mark.textContent).toBe('Replay')
    expect(mark.querySelector('svg')).toBeTruthy()
    expect(mark.className).toContain('bg-secondary')
    expect(mark.className).not.toContain('border-input')
    expect(mark.hasAttribute('data-tone')).toBe(false)
  })

  test('the readings chart titles each lane with its unit and labels no curve', () => {
    const at = (m: string) => `2026-11-02T${m}:00Z`
    const times = ['06:35', '06:40', '06:45', '06:50', '06:55', '07:00']
    render(
      <WindowStrip
        windows={[]}
        strip={{
          from: at('06:00'),
          to: at('08:00'),
          now: at('07:40'),
          rain5: times.map((m, i) => ({
            at: at(m),
            value: [0.5, 2.5, 9, 9, 8.5, 9.5][i]!,
            state: 'received' as const
          })),
          rain60: times.map((m, i) => ({ at: at(m), value: [0.5, 3, 12, 21, 29.5, 39][i]! }))
        }}
      />
    )
    const titles = [...document.querySelectorAll('[data-lane-title]')].map((el) => el.textContent)
    expect(titles[0]).toContain('Rain, mm per 5 min')
    expect(titles[1]).toContain('Rain, mm in 60 min')
    // The Lebat line is named in the lane's title row, not beside the curve.
    expect(document.querySelector('[data-lane-title="rain60"] [data-lebat-label]')).toBeTruthy()
  })
})

describe('the signal-health row', () => {
  afterEach(cleanup)

  test('is one table row for every screen: name over ID, value, age, health, with the open one current', () => {
    render(
      <Table>
        <SignalHealthHead />
        <TableBody>
          <SignalHealthRow
            source={{ id: 's1', name: 'Sg. Kuyoh', external_id: '0232901RF' }}
            kindLabel="Rainfall gauge, JPS"
            state="fresh"
            value={{ figure: '0.5', rest: 'mm in 60 min' }}
            observedAt="2026-11-12T07:36:00Z"
            ageS={240}
            selected
          />
        </TableBody>
      </Table>
    )
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Source',
      'Newest value',
      'Age',
      'Health'
    ])
    const row = document.querySelector('[data-source="s1"]')!
    expect(row.getAttribute('aria-current')).toBe('true')
    expect(row.textContent).toContain('0232901RF')
    expect(row.textContent).toContain('0.5')
    expect(row.textContent).toContain('4 min')
    expect(row.textContent).toContain('Fresh input')
    expect(row.querySelector('[translate="no"]')!.textContent).toBe('0232901RF')
  })
})

describe('the shared table', () => {
  afterEach(cleanup)

  test('a column opts in to numeric, truncation with a title and the phone line', () => {
    render(
      <Table compact sticky>
        <TableHeader>
          <TableRow>
            <TableHead>{words.window}</TableHead>
            <TableHead numeric>{words.sent}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow selected>
            <TableCell truncate="12ch">{words.long}</TableCell>
            <TableCell numeric phone="end" label="Sent after">
              <TableMeasure value={3} max={12}>
                {words.three}
              </TableMeasure>
            </TableCell>
          </TableRow>
          <TableRow dimmed>
            <TableCell>{words.club}</TableCell>
            <TableCell numeric>{words.nine}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const table = document.querySelector('[data-slot="table"]')!
    expect(table.hasAttribute('data-compact')).toBe(true)
    expect(table.hasAttribute('data-sticky')).toBe(true)
    expect(table.getAttribute('data-phone')).toBe('list')
    const [open, quiet] = [...document.querySelectorAll('[data-slot="table-row"]')].slice(1)
    expect(open!.getAttribute('data-state')).toBe('selected')
    expect(open!.getAttribute('aria-current')).toBe('true')
    expect(quiet!.getAttribute('data-state')).toBe('dimmed')
    const name = document.querySelector('[data-truncate]')!
    expect(name.getAttribute('title')).toBe('A very long window name that must not wrap')
    expect((name.querySelector('[data-slot="table-truncate"]') as HTMLElement).style.maxWidth).toBe('12ch')
    const figure = document.querySelector('td[data-numeric]')!
    expect(figure.getAttribute('data-phone')).toBe('end')
    expect(figure.getAttribute('data-label')).toBe('Sent after')
    expect(
      (document.querySelector('[data-slot="table-measure"]') as HTMLElement).style.getPropertyValue('--measure')
    ).toBe('0.25')
    // The fill is decoration: hidden from assistive technology; the figure carries the number.
    expect(document.querySelector('[data-slot="table-measure-fill"]')!.getAttribute('aria-hidden')).toBe('true')
  })
})
