import { describe, expect, test } from 'bun:test'
import {
  agreesWithPhone,
  formatFigures,
  isDaylight,
  settleLabels,
  summarizeProbation,
  twoDecimals,
  wilson,
  type ProbationRow
} from './probation.ts'

function row(overrides: Partial<ProbationRow> & { capture_id: string }): ProbationRow {
  return {
    frame_file_id: `file-${overrides.capture_id}`,
    device_time: '2026-11-07T10:00:00+08:00',
    phone_flag: 'visible',
    label_a: '',
    label_b: '',
    settled: '',
    agrees: '',
    ...overrides
  }
}

// n settled frames with the first `obscured` settled obscured and `agreeing` agreeing with the phone.
function settledFrame(i: number, settled: 'visible' | 'obscured', agrees: boolean, split: boolean): ProbationRow {
  return row({
    capture_id: `c-${i}`,
    phone_flag: settled,
    label_a: split ? (settled === 'visible' ? 'obscured' : 'visible') : settled,
    label_b: settled,
    settled,
    agrees: agrees ? 'TRUE' : 'FALSE'
  })
}

function settledSet(n: number, obscured: number, agreeing: number, splits: number): ProbationRow[] {
  return Array.from({ length: n }, (_, i) =>
    settledFrame(i, i < obscured ? 'obscured' : 'visible', i < agreeing, i < splits)
  )
}

describe('wilson', () => {
  test('7 of 8 gives 0.53–0.98 at z = 1.96', () => {
    const { lo, hi } = wilson(7, 8)
    expect(twoDecimals(lo)).toBe('0.53')
    expect(twoDecimals(hi)).toBe('0.98')
  })

  test('40 of 50 gives 0.67–0.89 at z = 1.96', () => {
    const { lo, hi } = wilson(40, 50)
    expect(twoDecimals(lo)).toBe('0.67')
    expect(twoDecimals(hi)).toBe('0.89')
  })
})

describe('verdict edges', () => {
  test('99 frames with 10 obscured at 0.90 do not pass', () => {
    expect(summarizeProbation(settledSet(99, 10, 89, 0)).verdict).toBe('pending')
  })

  test('9 obscured in 100 frames at 0.90 do not pass', () => {
    expect(summarizeProbation(settledSet(100, 9, 90, 0)).verdict).toBe('pending')
  })

  test('agreement 0.89 in 100 frames with 10 obscured fails', () => {
    expect(summarizeProbation(settledSet(100, 10, 89, 0)).verdict).toBe('fail')
  })

  test('100 frames with 10 obscured at 0.90 pass', () => {
    const summary = summarizeProbation(settledSet(100, 10, 90, 2))
    expect(summary.verdict).toBe('pass')
    expect(summary.n).toBe(100)
    expect(summary.obscured).toBe(10)
    expect(summary.disagreements).toBe(2)
    expect(formatFigures(summary)).toBe(
      '100 frames · 10 obscured · agreement 0.90 (n=100, 95% 0.83–0.94) · 2 disagreements'
    )
  })

  test('no settled frames print n=0 with no interval', () => {
    const summary = summarizeProbation([row({ capture_id: 'c-1' })])
    expect(summary.verdict).toBe('pending')
    expect(formatFigures(summary)).toBe('n=0')
  })
})

describe('settling', () => {
  test('matching labels settle to that label', () => {
    expect(settleLabels('visible', 'visible')).toBe('visible')
    expect(settleLabels('obscured', 'obscured')).toBe('obscured')
  })

  test('a disagreement waits for the resolve view', () => {
    expect(settleLabels('visible', 'obscured')).toBeNull()
    expect(settleLabels('', '')).toBeNull()
  })

  test('agrees is true when the phone flag equals the settled label', () => {
    expect(agreesWithPhone('visible', 'visible')).toBe(true)
    expect(agreesWithPhone('obscured', 'visible')).toBe(false)
    expect(agreesWithPhone('visible', '')).toBe(false)
  })
})

describe('daylight', () => {
  test('keeps frames between CAMERA_DAY_START and CAMERA_DAY_END, edges included', () => {
    expect(isDaylight('2026-11-07T07:14:00+08:00', '07:15', '19:00')).toBe(false)
    expect(isDaylight('2026-11-07T07:15:00+08:00', '07:15', '19:00')).toBe(true)
    expect(isDaylight('2026-11-07T12:00:00+08:00', '07:15', '19:00')).toBe(true)
    expect(isDaylight('2026-11-07T19:00:00+08:00', '07:15', '19:00')).toBe(true)
    expect(isDaylight('2026-11-07T19:01:00+08:00', '07:15', '19:00')).toBe(false)
  })

  test('reads the clock in MYT whatever offset the stamp carries', () => {
    expect(isDaylight('2026-11-06T23:15:00Z', '07:15', '19:00')).toBe(true)
    expect(isDaylight('2026-11-07T11:01:00Z', '07:15', '19:00')).toBe(false)
  })

  test('rejects stamps and windows it cannot read', () => {
    expect(isDaylight('not a time', '07:15', '19:00')).toBe(false)
    expect(isDaylight('2026-11-07T12:00:00+08:00', 'day', '19:00')).toBe(false)
  })
})
